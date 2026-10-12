// GET /api/ledger -> { ok, entries, head, broken_at, recent: [...] }
// Seals anything pending, checks the whole hash chain, and lists the latest entries.
import { json } from "../../lib/auth.js";
import { sealLedger, verifyLedger } from "../../lib/ledger.js";

export async function onRequestGet({ env }) {
  await sealLedger(env);
  const check = await verifyLedger(env);
  const { results: recent } = await env.DB.prepare(
    `SELECT l.id, l.kind, l.hash, l.created_at,
            h.reason, f.name AS from_name, t.name AS to_name,
            COALESCE(d1.name, d2.name) AS design, i.edition,
            d1.license, d1.source_author, d1.rarity, d1.max_editions
     FROM ledger l
     LEFT JOIN ownership_history h ON l.kind = 'transfer' AND h.id = l.ref_id
     LEFT JOIN users f ON f.id = h.from_user
     LEFT JOIN users t ON t.id = h.to_user
     LEFT JOIN instances i ON i.id = h.instance_id
     LEFT JOIN designs d2 ON d2.id = i.design_id
     LEFT JOIN designs d1 ON l.kind = 'design' AND d1.id = l.ref_id
     ORDER BY l.id DESC LIMIT 15`
  ).all();
  return json({ ...check, recent });
}
