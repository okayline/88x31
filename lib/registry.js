// The shared item registry (the dungeon-items Worker), mirrored from here. This game's own ledger stays the master:
// nothing here changes a button, an owner or this game's ledger. It only tells the shared registry what already happened.
//
// What goes there: ORIGINAL-tier buttons on the shared ladder (common, uncommon, rare, prototype, ultra). Specials
// (quest rewards) stay here, and so do archive/found uploads (not until credit is sorted). Ultras are 1-of-1 there too.
//
// One pass, syncRegistry(env), in this order:
//   1. items   eligible designs not yet added -> addItems, then remember each one's shared item id (designs.registry_item)
//   2. births  every copy of those designs not yet registered, oldest edition first, born to its FIRST owner here
//              (key "inst:<instance id>", so a retry never makes a second copy). (v0.46.10) A copy still with that
//              owner gets its marks right after (step 7's markCopy), so its birth and its marks sit together on the ledger.
//   3. moves   a copy whose owner here differs from the registry's -> one move to the current owner (owners in between
//              are skipped: this game's ledger has the full history)
//   4. spends  a copy used up here (fusion, sets, deleted account) -> spent there
//   5. retire  a frozen or removed design, once all its copies are registered -> retired there (no new copies)
//   6. home    away buttons (sent to 4Dungeon, lib/travel.js) that have come back are unlocked; away ones never move or spend here
//   7. marks   (v0.46) each copy's history, as marks on it there (see copyMarks below): the moon and any special day when it
//              was made, how it came, copy #1 or #100, its finish, and what it has been through here, each value once
//              (key "inst:<id>:<value>"). Only while the registry has it with its owner here (after 3), never while away.
//              (v0.46.10) A copy's new marks go in one addMarks call: one ledger entry ("was found under a full moon and
//              was pulled from a pack"), not one per mark.
//              instances.registry_marks remembers what is stamped ({ h: the last ownership_history id read, v: values }).
// It runs in the background after /api/me (at most once a minute), after keeping from a pack (functions/api/packs.js),
// and from the webmaster panel (admin "registry_sync").
// Each pass does at most `budget` calls, so a big backfill takes a few passes. A refusal is logged and skipped (copy 0);
// an unreachable registry stops the pass and the next one carries on.
import { now } from "./auth.js";
import { settleReturns } from "./travel.js";
import { moonIndex, occasions, PHASE_MARK } from "./sky.js";

export const GAME = "88x31";
const LADDER = ["common", "uncommon", "rare", "prototype", "ultra"];   // this game's rarities that go on the shared ladder
const IMAGE = (id) => `https://88x31.app/api/img?d=${id}`;
const EVERY = 900;   // seconds between background passes (v0.46.11: was 60; each pass reads every copy, and keeping from a pack syncs right away anyway)

class Unreachable extends Error {}

// What a copy's history says, as [kind, value] marks for the shared registry. `hist` is its ownership_history rows,
// oldest first: the first says how it came, later ones what it went through. Reasons not listed here make no mark
// (away and home are already moves there; trade_in uses it up).
const CAME = { pack: "pulled_pack", free_pack: "free_pack", welcome: "welcome_gift", starter: "welcome_gift", daily: "daily_pick",
  pass_on: "passed_on", set_reward: "set_reward", admin: "from_webmaster" };
const LIVED = { trade: "traded", gift: "gifted", guestbook: "guestbook_gift", request: "filled_request", fusion: "fused" };
const word = (prefix, id) => (prefix + String(id).toLowerCase().replace(/[^a-z0-9_]/g, "_")).slice(0, 40);
export function copyMarks(c, hist) {
  const at = new Date(c.created_at * 1000), out = [["night", PHASE_MARK[moonIndex(at)]], ...occasions(at).map((o) => ["night", o])];
  if (hist[0] && CAME[hist[0].reason]) out.push(["deed", CAME[hist[0].reason]]);
  if (c.registry_copy === 1 || c.registry_copy === 100) out.push(["deed", c.registry_copy === 1 ? "first_copy" : "hundredth_copy"]);
  if (c.foil == null) out.push(["deed", "first_print"]);                      // made before foils existed
  else if (c.foil !== "clear") out.push(["deed", word("foil_", c.foil)]);
  if (c.pattern) out.push(["deed", word("pattern_", c.pattern)]);
  if (c.effect) out.push(["deed", word("effect_", c.effect)]);
  for (const h of hist.slice(1)) if (h.to_user != null && LIVED[h.reason]) out.push(["deed", LIVED[h.reason]]);
  const seen = new Set();
  return out.filter(([, v]) => v && !seen.has(v) && seen.add(v));
}

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

// One copy's marks not yet stamped, in one addMarks call (one ledger entry), then remembered in instances.registry_marks.
// A refused mark is logged and not asked again; with no budget left nothing is sent and the history isn't marked as read.
async function markCopy(db, R, c, spend, refuse, out) {
  const { results: hist } = await db.prepare("SELECT id, reason, to_user FROM ownership_history WHERE instance_id = ? ORDER BY id").bind(c.id).all();
  const had = c.registry_marks ? JSON.parse(c.registry_marks) : { h: -1, v: [] }, done = new Set(had.v);
  const fresh = copyMarks(c, hist).filter(([, value]) => !done.has(value));
  let all = true;
  if (fresh.length && !spend()) all = false;
  else if (fresh.length) {
    const r = await R.addMarks({ holder: { game: GAME, playerId: c.registry_owner },
      marks: fresh.map(([kind, value]) => ({ kind, value, copies: [{ itemId: c.item, copy: c.registry_copy, key: `inst:${c.id}:${value}` }] })) });
    if (r && r.error) refuse(`marks inst:${c.id}`, r);
    else { out.marked += r.marked.length; for (const k of r.skipped || []) refuse(`mark ${k.value} inst:${c.id}`, k); }
    for (const [, value] of fresh) done.add(value);
  }
  const h = all ? (hist.length ? hist[hist.length - 1].id : 0) : had.h;
  await db.prepare("UPDATE instances SET registry_marks = ? WHERE id = ?").bind(JSON.stringify({ h, v: [...done] }), c.id).run();
}

export async function syncRegistry(env, { budget = 30, R = reg(env) } = {}) {
  if (!R) return { skipped: "no registry binding" };
  const db = env.DB, out = { added: 0, born: 0, moved: 0, spent: 0, retired: 0, refused: 0, marked: 0 };
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

    // 2. births, oldest edition first, to the first owner, each with its marks right after when it is still theirs
    const { results: unborn } = await db.prepare(
      `SELECT i.id, i.created_at, i.foil, i.pattern, i.effect, i.owner_id, i.consumed, i.locked, i.registry_marks, d.registry_item AS item, COALESCE(
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
      if (c.owner_id === c.first && !c.consumed && c.locked !== -1) await markCopy(db, R, { ...c, registry_copy: r.copy, registry_owner: c.first }, spend, refuse, out);
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

    // 7. marks, with what is left of the budget (oldest copies first): copies that changed hands, or were away, since
    if (left > 0) {
      const { results: todo } = await db.prepare(
        `SELECT i.id, i.created_at, i.foil, i.pattern, i.effect, i.registry_copy, i.registry_owner, i.registry_marks, d.registry_item AS item
         FROM instances i JOIN designs d ON d.id = i.design_id
         WHERE i.registry_copy > 0 AND i.registry_spent = 0 AND i.consumed = 0 AND i.locked != -1 AND i.owner_id = i.registry_owner
           AND (i.registry_marks IS NULL OR json_extract(i.registry_marks, '$.h') < COALESCE((SELECT MAX(h.id) FROM ownership_history h WHERE h.instance_id = i.id), 0))
         ORDER BY i.id LIMIT ?`
      ).bind(Math.max(1, Math.ceil(left / 4))).all();
      for (const c of todo) {
        if (left <= 0) break;
        await markCopy(db, R, c, spend, refuse, out);
      }
    }
  } catch (e) {
    if (!(e instanceof Unreachable)) throw e;
    out.stopped = e.message;
  }
  out.more = left <= 0;
  return out;
}
