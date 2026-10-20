// The shared item registry (the dungeon-items Worker), mirrored from here. This game's own ledger stays the master:
// nothing here changes a button, an owner or this game's ledger. It only tells the shared registry what already happened.
//
// What goes there: ORIGINAL-tier buttons on the shared ladder (common, uncommon, rare, prototype, ultra). Specials
// (quest rewards) stay here, and so do archive/found uploads (not until credit is sorted). Ultras are 1-of-1 there too.
//
// One pass, syncRegistry(env), in this order:
//   1. items   eligible designs not yet added -> addItems, then remember each one's shared item id (designs.registry_item)
//   2. births  every copy of those designs not yet registered, oldest edition first, born to its FIRST owner here
//              (key "inst:<instance id>", so a retry never makes a second copy)
//   3. moves   a copy whose owner here differs from the registry's -> one move to the current owner (owners in between
//              are skipped: this game's ledger has the full history)
//   4. spends  a copy used up here (fusion, sets, deleted account) -> spent there
//   5. retire  a frozen or removed design, once all its copies are registered -> retired there (no new copies)
//   6. home    away buttons (sent to 4Dungeon, lib/travel.js) that have come back are unlocked; away ones never move or spend here
// It runs in the background after /api/me (at most once a minute), after keeping from a pack (functions/api/packs.js),
// and from the webmaster panel (admin "registry_sync").
// Each pass does at most `budget` calls, so a big backfill takes a few passes. A refusal is logged and skipped (copy 0);
// an unreachable registry stops the pass and the next one carries on.
import { now } from "./auth.js";
import { settleReturns } from "./travel.js";

export const GAME = "88x31";
const LADDER = ["common", "uncommon", "rare", "prototype", "ultra"];   // this game's rarities that go on the shared ladder
const IMAGE = (id) => `https://88x31.app/api/img?d=${id}`;
const EVERY = 60;   // seconds between background passes

class Unreachable extends Error {}

// POST /rpc/registry/<method> through the ACCOUNTS service binding, with the shared key (the same door as the accounts).
export const reg = (env) => {
  if (!env.ACCOUNTS || !env.ACCOUNTS_KEY) return null;
  return new Proxy({}, { get: (_, name) => async (...args) => {
    let r;
    try {
      r = await env.ACCOUNTS.fetch(`https://accounts.internal/rpc/registry/${String(name)}`, {
        method: "POST", headers: { "x-accounts-key": env.ACCOUNTS_KEY, "content-type": "application/json" }, body: JSON.stringify(args) });
    } catch (e) { throw new Unreachable(String(e && e.message)); }
    if (!r.ok) throw new Unreachable("registry answered " + r.status);
    return r.json();
  } });
};

// At most once a minute (the meta row is claimed first, so two page loads don't both run it).
export async function syncIfDue(env) {
  const t = now();
  const claim = await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('registry_sync', '', ?)
     ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at WHERE meta.updated_at <= ?`
  ).bind(t, t - EVERY).run();
  if (!claim.meta.changes) return null;
  return syncRegistry(env);
}

export async function syncRegistry(env, { budget = 30, R = reg(env) } = {}) {
  if (!R) return { skipped: "no registry binding" };
  const db = env.DB, out = { added: 0, born: 0, moved: 0, spent: 0, retired: 0, refused: 0 };
  let left = budget;
  const spend = () => left-- > 0;
  const refuse = (what, r) => { out.refused++; console.log("registry refused", what, r && r.error); };
  try {
    // 1. items
    const { results: fresh } = await db.prepare(
      `SELECT id, name, type, rarity FROM designs WHERE registry_item IS NULL AND tier = 'original'
       AND rarity IN (${LADDER.map(() => "?").join(",")}) AND status IN ('active', 'frozen', 'removed') ORDER BY id LIMIT 100`
    ).bind(...LADDER).all();
    if (fresh.length && spend()) {
      const r = await R.addItems(fresh.map((d) => ({ source_key: String(d.id), rarity: d.rarity, name: d.name, type: d.type, image: IMAGE(d.id) })));
      if (r && r.error) refuse("items", r);
      else {
        out.added += r.added;
        if (spend()) {
          const ids = await R.itemIds(fresh.map((d) => String(d.id)));
          await db.batch(fresh.filter((d) => ids[String(d.id)]).map((d) => db.prepare("UPDATE designs SET registry_item = ? WHERE id = ?").bind(ids[String(d.id)], d.id)));
        }
      }
    }

    // 2. births, oldest edition first, to the first owner
    const { results: unborn } = await db.prepare(
      `SELECT i.id, d.registry_item AS item, COALESCE(
         (SELECT h.to_user FROM ownership_history h WHERE h.instance_id = i.id AND h.to_user IS NOT NULL ORDER BY h.id LIMIT 1), i.owner_id) AS first
       FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.registry_copy IS NULL AND d.registry_item IS NOT NULL ORDER BY i.design_id, i.edition LIMIT ?`
    ).bind(Math.max(0, left)).all();
    for (const c of unborn) {
      if (!spend()) break;
      if (!c.first) { await db.prepare("UPDATE instances SET registry_copy = 0 WHERE id = ?").bind(c.id).run(); refuse("inst:" + c.id, { error: "no owner ever" }); continue; }
      const r = await R.birth({ itemId: c.item, playerId: c.first, key: "inst:" + c.id });
      if (r && r.error) { await db.prepare("UPDATE instances SET registry_copy = 0 WHERE id = ?").bind(c.id).run(); refuse("inst:" + c.id, r); continue; }
      await db.prepare("UPDATE instances SET registry_copy = ?, registry_owner = ? WHERE id = ?").bind(r.copy, c.first, c.id).run();
      out.born++;
    }

    // 3. moves (straight to the current owner)
    const { results: moved } = await db.prepare(
      `SELECT i.id, i.owner_id, i.registry_owner, i.registry_copy, d.registry_item AS item FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.registry_copy > 0 AND i.registry_spent = 0 AND i.consumed = 0 AND i.locked != -1 AND i.owner_id IS NOT NULL AND i.owner_id != i.registry_owner LIMIT ?`
    ).bind(Math.max(0, left)).all();
    for (const c of moved) {
      if (!spend()) break;
      const r = await R.moveCopy({ itemId: c.item, copy: c.registry_copy, from: { game: GAME, playerId: c.registry_owner }, to: { game: GAME, playerId: c.owner_id } });
      if (r && r.error) { refuse("move inst:" + c.id, r); continue; }
      await db.prepare("UPDATE instances SET registry_owner = ? WHERE id = ?").bind(c.owner_id, c.id).run();
      out.moved++;
    }

    // 4. spends
    const { results: used } = await db.prepare(
      `SELECT i.id, i.registry_owner, i.registry_copy, d.registry_item AS item FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.registry_copy > 0 AND i.registry_spent = 0 AND i.consumed = 1 AND i.locked != -1 LIMIT ?`
    ).bind(Math.max(0, left)).all();
    for (const c of used) {
      if (!spend()) break;
      const r = await R.spendCopy({ itemId: c.item, copy: c.registry_copy, holder: { game: GAME, playerId: c.registry_owner } });
      if (r && r.error) { refuse("spend inst:" + c.id, r); continue; }
      await db.prepare("UPDATE instances SET registry_spent = 1 WHERE id = ?").bind(c.id).run();
      out.spent++;
    }

    // 6. away buttons (lib/travel.js) that came home: a few a pass (each one is a lookup)
    if (left > 0) { const home = await settleReturns(env, null, Math.min(5, left), R); left -= Math.min(5, left); out.home = home; }

    // 5. retire frozen or removed designs once every copy is registered
    const { results: done } = await db.prepare(
      `SELECT d.id FROM designs d WHERE d.registry_item IS NOT NULL AND d.registry_retired = 0 AND d.status IN ('frozen', 'removed')
       AND NOT EXISTS (SELECT 1 FROM instances i WHERE i.design_id = d.id AND i.registry_copy IS NULL)`
    ).all();
    if (done.length && spend()) {
      const r = await R.retireItems(done.map((d) => String(d.id)));
      if (r && r.error) refuse("retire", r);
      else {
        await db.batch(done.map((d) => db.prepare("UPDATE designs SET registry_retired = 1 WHERE id = ?").bind(d.id)));
        out.retired += done.length;
      }
    }
  } catch (e) {
    if (!(e instanceof Unreachable)) throw e;
    out.stopped = e.message;
  }
  out.more = left <= 0;
  return out;
}
