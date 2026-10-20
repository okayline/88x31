// The ledger: one hash chain over every event in the game, in the order it was sealed.
//
//   kind 'design'   - a new button design was added (its art fingerprint, rarity, cap, source, license)
//   kind 'transfer' - a copy was made or changed hands (from ownership_history)
//   kind 'foil'     - the foil a new copy was made with (v0.18+; older copies are First Prints)
//   kind 'admin'    - a webmaster action: a design removed/restored, an uploader blocked/unblocked
//   kind 'pack'     - a sealed pack was made or changed hands (v0.22+)
//   kind 'pack_open'- a pack was opened: the 3 buttons it held and the copies kept (v0.22+)
//   kind 'request'  - a request was posted on the board (v0.23+); filling it is a normal transfer
//   kind 'fusion'   - 3 copies fused: the two used up, the one kept, and its new foil/pattern/effect (v0.19+)
//   kind 'wall'     - a ring's Theme Wall was locked at the end of its week: the frozen pins (v0.38+)
//
//   record = frozen JSON copy of the event
//   hash   = SHA-256( prev_hash + "|" + record )
//
// The first entry chains from GENESIS. Editing any old record breaks its hash and every hash
// after it. Records hold user ids, never names, so deleting an account (which blanks the
// user in live tables) doesn't touch the chain.
import { sha256 } from "./auth.js";
import { lockEndedWalls } from "./themewall.js";

export const GENESIS = "0".repeat(64);

// When v0.18 (foils, tiers, uploads) went in. Designs added after this record their tier and finder.
// When v0.19 (foil tiers, patterns, effects, fusion) went in.
const V19 = 1791882000; // Oct 12 2026, 11 PM HST
const V18 = 1791878400; // Oct 12 2026, 10 PM HST

// (v0.18+ design records also carry the tier and who found it; older records keep their old shape)
const designRecord = (d) => JSON.stringify([
  "design", d.id, d.name, d.type, d.rarity, d.max_editions, d.image_hash,
  d.source_title, d.source_author, d.source_url, d.license, d.created_at,
  ...(d.tier !== undefined ? [d.tier, d.found_by ?? null] : []),
]);

// (v0.19+ foil records also carry the copy's pattern and effect)
const foilRecord = (i) => JSON.stringify(["foil", i.id, i.design_id, i.edition, i.foil, i.foil_seed, i.created_at,
  ...(i.created_at >= V19 ? [i.pattern ?? null, i.effect ?? null] : [])]);
const packRecord = (h, p) => JSON.stringify(["pack", h.id, h.pack_id, p ? p.series_id : null, p ? p.source : null,
  p ? p.keep : null, h.from_user, h.to_user, h.reason, h.created_at]);
const packOpenRecord = (o) => JSON.stringify(["pack_open", o.pack_id, o.user_id, JSON.parse(o.options), JSON.parse(o.kept || "[]"), o.done_at]);
const requestRecord = (r) => JSON.stringify(["request", r.id, r.user_id, r.design_id, r.foil, r.created_at]);
const fusionRecord = (f) => JSON.stringify(["fusion", f.id, f.user_id, f.input_a, f.input_b, f.output_id,
  f.prev_foil, f.foil, f.pattern, f.effect, f.created_at]);

// [kind, wall, ring, week, theme, canvas width, [[user, copy, design, x, y], ...], locked at, (canvas height)]; copy and design are null for an empty spot.
// The height is added only for a wall that isn't square (v0.46.5), so the records of every wall sealed before are unchanged.
const wallRecord = (w) => JSON.stringify(["wall", w.id, w.ring_id, w.week, w.theme, w.size, JSON.parse(w.snapshot), w.locked_at,
  ...(w.height != null && w.height !== w.size ? [w.height] : [])]);

const adminRecord = (a) => JSON.stringify(["admin", a.id, a.admin_id, a.action, a.design_id, a.user_id, a.note, a.created_at]);

const transferRecord = (h) => JSON.stringify([
  "transfer", h.id, h.instance_id, h.from_user, h.to_user, h.reason, h.ref_id, h.created_at,
]);

// Seal events that aren't in the ledger yet. Call after writes; cheap when nothing is pending.
// Each insert only succeeds if the chain head is still what we built on, so two sealers
// running at once can't fork the chain (the loser just stops; the next call finishes up).
export async function sealLedger(env, max = 300) {
  const db = env.DB;
  try { await lockEndedWalls(env); } catch { /* migration 028 not run yet */ }
  const last = async (kind) => (await db.prepare("SELECT MAX(ref_id) AS m FROM ledger WHERE kind = ?").bind(kind).first())?.m ?? 0;
  const lastDesign = await last("design");
  const lastTransfer = await last("transfer");

  let { results: designs } = await db.prepare(
    `SELECT * FROM designs WHERE id > ? ORDER BY id LIMIT ?`
  ).bind(lastDesign, max).all();
  // tier/found_by only go into records for designs added from v0.18 on
  designs = designs.map(({ tier, found_by, ...d }) => (d.created_at >= V18 ? { ...d, tier, found_by } : d));
  const { results: transfers } = await db.prepare(
    `SELECT id, instance_id, from_user, to_user, reason, ref_id, created_at
     FROM ownership_history WHERE id > ? ORDER BY id LIMIT ?`
  ).bind(lastTransfer, max).all();
  // foils and webmaster actions (tables added in v0.18; skipped if not there yet)
  let foils = [], admins = [];
  try {
    const lastFoil = await last("foil");
    foils = (await db.prepare(
      `SELECT * FROM instances
       WHERE foil IS NOT NULL AND id > ? ORDER BY id LIMIT ?`
    ).bind(lastFoil, max).all()).results;
    const lastAdmin = await last("admin");
    admins = (await db.prepare("SELECT * FROM admin_actions WHERE id > ? ORDER BY id LIMIT ?").bind(lastAdmin, max).all()).results;
  } catch { /* migration 013 not run yet */ }
  let fusions = [];
  try {
    const lastFusion = await last("fusion");
    fusions = (await db.prepare("SELECT * FROM fusions WHERE id > ? AND foil IS NOT NULL ORDER BY id LIMIT ?").bind(lastFusion, max).all()).results;
  } catch { /* migration 014 not run yet */ }
  let packs = [], opens = [];
  try {
    const lastPack = await last("pack");
    packs = (await db.prepare(
      `SELECT h.*, p.series_id, p.source, p.keep FROM pack_history h JOIN packs p ON p.id = h.pack_id
       WHERE h.id > ? ORDER BY h.id LIMIT ?`
    ).bind(lastPack, max).all()).results;
    // openings finish in any order, so look for finished ones that aren't sealed yet
    opens = (await db.prepare(
      `SELECT o.* FROM pack_openings o WHERE o.done_at IS NOT NULL AND o.kept IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'pack_open' AND l.ref_id = o.pack_id)
       ORDER BY o.done_at LIMIT ?`
    ).bind(max).all()).results;
  } catch { /* migration 016 not run yet */ }
  let reqs = [];
  try {
    const lastReq = await last("request");
    reqs = (await db.prepare("SELECT id, user_id, design_id, foil, created_at FROM requests WHERE id > ? ORDER BY id LIMIT ?").bind(lastReq, max).all()).results;
  } catch { /* migration 017 not run yet */ }
  let walls = [];
  try {
    // locked walls with something on them that aren't sealed yet (walls lock in any order, so look for the unsealed ones)
    walls = (await db.prepare(
      `SELECT w.* FROM ring_walls w WHERE w.locked_at IS NOT NULL AND w.snapshot IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'wall' AND l.ref_id = w.id) ORDER BY w.locked_at, w.id LIMIT ?`
    ).bind(max).all()).results;
  } catch { /* migration 028 not run yet */ }
  if (!designs.length && !transfers.length && !foils.length && !admins.length && !fusions.length && !packs.length && !opens.length && !reqs.length && !walls.length) return 0;

  // Merge by time; a design goes before copies made at the same moment, and a copy's foil
  // right after the step that made it (v0.46.2: next to it, not after every copy made that moment;
  // when that step was sealed earlier, the foil goes after the moment's copies as before).
  const made = new Map();
  for (const h of transfers) if (!made.has(h.instance_id)) made.set(h.instance_id, h);
  const besideStep = (i) => { const h = made.get(i.id); return h && h.created_at === i.created_at ? { order: 1, sort: h.id + 0.5 } : { order: 2 }; };
  const events = [
    ...designs.map((d) => ({ kind: "design", ref: d.id, at: d.created_at, order: 0, record: designRecord(d) })),
    ...transfers.map((h) => ({ kind: "transfer", ref: h.id, at: h.created_at, order: 1, record: transferRecord(h) })),
    ...foils.map((i) => ({ kind: "foil", ref: i.id, at: i.created_at, ...besideStep(i), record: foilRecord(i) })),
    ...admins.map((a) => ({ kind: "admin", ref: a.id, at: a.created_at, order: 3, record: adminRecord(a) })),
    // a fusion goes right after its used-up copies' transfer steps (same moment)
    ...reqs.map((r) => ({ kind: "request", ref: r.id, at: r.created_at, order: 0.4, record: requestRecord(r) })),
    ...packs.map((h) => ({ kind: "pack", ref: h.id, at: h.created_at, order: 0.5, record: packRecord(h, h) })),
    // an opening goes before the copies it made (same moment; v0.46.2, it went after them before)
    ...opens.map((o) => ({ kind: "pack_open", ref: o.pack_id, at: o.done_at, order: 0.6, record: packOpenRecord(o) })),
    ...fusions.map((f) => ({ kind: "fusion", ref: f.id, at: f.created_at, order: 1.5, record: fusionRecord(f) })),
    ...walls.map((w) => ({ kind: "wall", ref: w.id, at: w.locked_at, order: 4, record: wallRecord(w) })),
  ].sort((a, b) => a.at - b.at || a.order - b.order || (a.sort ?? a.ref) - (b.sort ?? b.ref));

  const head = await db.prepare("SELECT hash FROM ledger ORDER BY id DESC LIMIT 1").first();
  let prev = head ? head.hash : GENESIS;
  const stmts = [];
  for (const e of events) {
    const hash = await sha256(prev + "|" + e.record);
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO ledger (kind, ref_id, record, prev_hash, hash, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE COALESCE((SELECT hash FROM ledger ORDER BY id DESC LIMIT 1), ?) = ?`
    ).bind(e.kind, e.ref, e.record, prev, hash, e.at, GENESIS, prev));
    prev = hash;
  }
  await db.batch(stmts);
  return events.length;
}

// Check the chain. To keep reads small, it remembers (in `meta`) the last entry it verified
// and that entry's hash, and normally only checks entries added since. Once a day (or when
// asked) it re-walks the whole chain from the start, which catches edits to old entries.
const FULL_CHECK_EVERY = 86400;

export async function verifyLedger(env, { full = false } = {}) {
  const db = env.DB;
  const t = Math.floor(Date.now() / 1000);
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'ledger_check'").first();
  let saved = null;
  try { saved = row ? JSON.parse(row.value) : null; } catch {}
  const doFull = full || !saved || t - saved.full_at > FULL_CHECK_EVERY;

  let prev = GENESIS, after = 0;
  if (!doFull) {
    // the checkpoint itself must still be intact
    const cp = await db.prepare("SELECT hash FROM ledger WHERE id = ?").bind(saved.id).first();
    if (saved.id && (!cp || cp.hash !== saved.hash)) return verifyLedger(env, { full: true });
    prev = saved.hash || GENESIS; after = saved.id || 0;
  }
  const { results } = await db.prepare(
    "SELECT id, record, prev_hash, hash FROM ledger WHERE id > ? ORDER BY id"
  ).bind(after).all();
  let lastId = after;
  for (const r of results) {
    if (r.prev_hash !== prev || (await sha256(r.prev_hash + "|" + r.record)) !== r.hash) {
      return { ok: false, entries: r.id, broken_at: r.id, head: null, checked: doFull ? "full" : "recent" };
    }
    prev = r.hash; lastId = r.id;
  }
  const value = JSON.stringify({ id: lastId, hash: prev, full_at: doFull ? t : saved.full_at });
  if (!saved || results.length || doFull) {
    await db.prepare(
      `INSERT INTO meta (key, value, updated_at) VALUES ('ledger_check', ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(value, t).run();
  }
  return { ok: true, entries: lastId, broken_at: null, head: lastId ? prev : null, checked: doFull ? "full" : "recent" };
}

// Seal after a write, without ever failing the request it's attached to.
export async function sealSafe(env) {
  try { await sealLedger(env); } catch (e) { console.log("seal failed", e); }
}
