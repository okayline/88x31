// The ownership ledger: every entry in ownership_history is sealed, in order, into a hash chain.
//
//   record = frozen JSON copy of the entry: [id, instance_id, from_user, to_user, reason, ref_id, created_at]
//   hash   = SHA-256( prev_hash + "|" + record )
//
// The first entry chains from GENESIS. If anyone edits an old record, its hash no longer
// matches, and neither does any hash after it, so tampering shows up when the chain is checked.
// Sealing is deterministic, so two sealers running at once write identical values.
import { sha256 } from "./auth.js";

export const GENESIS = "0".repeat(64);

const recordOf = (r) =>
  JSON.stringify([r.id, r.instance_id, r.from_user, r.to_user, r.reason, r.ref_id, r.created_at]);

// Seal any entries that don't have a hash yet. Call after writes; cheap when nothing is pending.
export async function sealLedger(env, max = 500) {
  const { results: pending } = await env.DB.prepare(
    `SELECT id, instance_id, from_user, to_user, reason, ref_id, created_at
     FROM ownership_history WHERE hash IS NULL ORDER BY id LIMIT ?`
  ).bind(max).all();
  if (!pending.length) return 0;

  const last = await env.DB.prepare(
    "SELECT hash FROM ownership_history WHERE hash IS NOT NULL AND id < ? ORDER BY id DESC LIMIT 1"
  ).bind(pending[0].id).first();
  let prev = last ? last.hash : GENESIS;

  const stmts = [];
  for (const r of pending) {
    const record = recordOf(r);
    const hash = await sha256(prev + "|" + record);
    stmts.push(env.DB.prepare(
      "UPDATE ownership_history SET record = ?, prev_hash = ?, hash = ? WHERE id = ? AND hash IS NULL"
    ).bind(record, prev, hash, r.id));
    prev = hash;
  }
  await env.DB.batch(stmts);
  return pending.length;
}

// Walk the whole chain and check every link.
// Note: when a player deletes their account, their user id is blanked in the live columns for
// privacy, but the frozen record keeps the old number (no name), so the chain still verifies.
export async function verifyLedger(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, record, prev_hash, hash FROM ownership_history WHERE hash IS NOT NULL ORDER BY id"
  ).all();
  let prev = GENESIS;
  for (const r of results) {
    if (r.prev_hash !== prev) return { ok: false, entries: results.length, broken_at: r.id, head: null };
    const expect = await sha256(r.prev_hash + "|" + r.record);
    if (expect !== r.hash) return { ok: false, entries: results.length, broken_at: r.id, head: null };
    prev = r.hash;
  }
  return { ok: true, entries: results.length, broken_at: null, head: prev };
}

// Seal after a write, without ever failing the request it's attached to.
export async function sealSafe(env) {
  try { await sealLedger(env); } catch (e) { console.log("seal failed", e); }
}
