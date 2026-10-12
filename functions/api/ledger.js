// GET /api/ledger -> { ok, entries, head, broken_at, recent: [...] }
// Seals anything pending, checks the whole hash chain, and lists the latest entries.
import { json } from "../../lib/auth.js";
import { sealLedger, verifyLedger } from "../../lib/ledger.js";

export async function onRequestGet({ env }) {
  await sealLedger(env);
  const check = await verifyLedger(env);
  const { results: recent } = await env.DB.prepare(
    `SELECT h.id, h.reason, h.created_at, h.hash, h.prev_hash, h.instance_id,
            f.name AS from_name, t.name AS to_name, d.name AS design, i.edition
     FROM ownership_history h
     LEFT JOIN users f ON f.id = h.from_user
     LEFT JOIN users t ON t.id = h.to_user
     LEFT JOIN instances i ON i.id = h.instance_id
     LEFT JOIN designs d ON d.id = i.design_id
     WHERE h.hash IS NOT NULL
     ORDER BY h.id DESC LIMIT 15`
  ).all();
  return json({ ...check, recent });
}
