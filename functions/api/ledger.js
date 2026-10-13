// GET /api/ledger?limit=N -> { ok, entries, head, broken_at, recent: [...] }  (limit 1-200, default 15)
// Seals anything pending, checks the whole hash chain, and lists the latest entries.
import { json } from "../../lib/auth.js";
import { sealLedger, verifyLedger } from "../../lib/ledger.js";

export async function onRequestGet({ request, env }) {
  const limit = Math.min(200, Math.max(1, Number(new URL(request ? request.url : "http://x").searchParams.get("limit")) || 15));
  await sealLedger(env);
  const check = await verifyLedger(env);
  const { results: recent } = await env.DB.prepare(
    `SELECT l.id, l.kind, l.hash, l.created_at,
            h.reason, f.name AS from_name, t.name AS to_name,
            CASE WHEN COALESCE(d1.status, d2.status, d3.status) = 'removed' THEN 'a removed button' ELSE COALESCE(d1.name, d2.name, d3.name) END AS design, COALESCE(i.edition, fi.edition) AS edition,
            d1.license, d1.source_author, d1.rarity, d1.max_editions, d1.tier,
            fi.foil, fi.pattern, fi.effect, fi.id AS foil_copy, d3.status AS foil_design_status, a.action AS admin_action,
            COALESCE(ph.pack_id, CASE WHEN l.kind = 'pack_open' THEN l.ref_id END) AS pack_id, ph.reason AS pack_reason, pk.source AS pack_source,
            pt.name AS pack_to, pf.name AS pack_from,
            fu.foil AS fused_foil, fu.pattern AS fused_pattern, fu.effect AS fused_effect, fo.edition AS fused_edition, d4.name AS fused_design, d4.status AS fused_status
     FROM ledger l
     LEFT JOIN ownership_history h ON l.kind = 'transfer' AND h.id = l.ref_id
     LEFT JOIN users f ON f.id = h.from_user
     LEFT JOIN users t ON t.id = h.to_user
     LEFT JOIN instances i ON i.id = h.instance_id
     LEFT JOIN designs d2 ON d2.id = i.design_id
     LEFT JOIN designs d1 ON l.kind = 'design' AND d1.id = l.ref_id
     LEFT JOIN instances fi ON l.kind = 'foil' AND fi.id = l.ref_id
     LEFT JOIN designs d3 ON d3.id = fi.design_id
     LEFT JOIN admin_actions a ON l.kind = 'admin' AND a.id = l.ref_id
     LEFT JOIN pack_history ph ON l.kind = 'pack' AND ph.id = l.ref_id
     LEFT JOIN packs pk ON pk.id = COALESCE(ph.pack_id, CASE WHEN l.kind = 'pack_open' THEN l.ref_id END)
     LEFT JOIN users pt ON pt.id = ph.to_user
     LEFT JOIN users pf ON pf.id = ph.from_user
     LEFT JOIN fusions fu ON l.kind = 'fusion' AND fu.id = l.ref_id
     LEFT JOIN instances fo ON fo.id = fu.output_id
     LEFT JOIN designs d4 ON d4.id = fo.design_id
     ORDER BY l.id DESC LIMIT ?`
  ).bind(limit).all();
  return json({ ...check, recent });
}
