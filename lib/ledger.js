// The ledger: one hash chain over every event in the game, in the order it was sealed.
//
//   kind 'design'   - a new button design was added (its art fingerprint, rarity, cap, source, license)
//   kind 'transfer' - a copy was made or changed hands (from ownership_history)
//
//   record = frozen JSON copy of the event
//   hash   = SHA-256( prev_hash + "|" + record )
//
// The first entry chains from GENESIS. Editing any old record breaks its hash and every hash
// after it. Records hold user ids, never names, so deleting an account (which blanks the
// user in live tables) doesn't touch the chain.
import { sha256 } from "./auth.js";

export const GENESIS = "0".repeat(64);

const designRecord = (d) => JSON.stringify([
  "design", d.id, d.name, d.type, d.rarity, d.max_editions, d.image_hash,
  d.source_title, d.source_author, d.source_url, d.license, d.created_at,
]);

const transferRecord = (h) => JSON.stringify([
  "transfer", h.id, h.instance_id, h.from_user, h.to_user, h.reason, h.ref_id, h.created_at,
]);

// Seal events that aren't in the ledger yet. Call after writes; cheap when nothing is pending.
// Each insert only succeeds if the chain head is still what we built on, so two sealers
// running at once can't fork the chain (the loser just stops; the next call finishes up).
export async function sealLedger(env, max = 300) {
  const db = env.DB;
  const lastDesign = (await db.prepare("SELECT MAX(ref_id) AS m FROM ledger WHERE kind = 'design'").first())?.m ?? 0;
  const lastTransfer = (await db.prepare("SELECT MAX(ref_id) AS m FROM ledger WHERE kind = 'transfer'").first())?.m ?? 0;

  const { results: designs } = await db.prepare(
    `SELECT id, name, type, rarity, max_editions, image_hash, source_title, source_author, source_url, license, created_at
     FROM designs WHERE id > ? ORDER BY id LIMIT ?`
  ).bind(lastDesign, max).all();
  const { results: transfers } = await db.prepare(
    `SELECT id, instance_id, from_user, to_user, reason, ref_id, created_at
     FROM ownership_history WHERE id > ? ORDER BY id LIMIT ?`
  ).bind(lastTransfer, max).all();
  if (!designs.length && !transfers.length) return 0;

  // Merge by time; a design always goes before copies made at the same moment.
  const events = [
    ...designs.map((d) => ({ kind: "design", ref: d.id, at: d.created_at, order: 0, record: designRecord(d) })),
    ...transfers.map((h) => ({ kind: "transfer", ref: h.id, at: h.created_at, order: 1, record: transferRecord(h) })),
  ].sort((a, b) => a.at - b.at || a.order - b.order || a.ref - b.ref);

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
