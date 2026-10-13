// GET /api/ledger?limit=N&before=ID -> { ok, entries, head, broken_at, recent: [...], oldest_id }
// Seals anything pending, checks the whole hash chain, and lists entries newest first (limit 1-200,
// default 15; `before` pages further back). Mystery buttons (rares, ultras, set rewards you've never
// owned, and anything in an unreleased series) are listed as "a mystery button", with no name or link.
import { json, currentUser } from "../../lib/auth.js";
import { sealLedger, verifyLedger } from "../../lib/ledger.js";

export async function onRequestGet({ request, env }) {
  const params = new URL(request ? request.url : "http://x").searchParams;
  const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 15));
  const before = Number(params.get("before")) || 0;
  const viewer = request ? await currentUser(env, request) : null;
  await sealLedger(env);
  const check = await verifyLedger(env);
  const { results: recent } = await env.DB.prepare(
    `SELECT l.id, l.kind, l.hash, l.created_at,
            h.reason, f.name AS from_name, t.name AS to_name,
            CASE WHEN COALESCE(d1.status, d2.status, d3.status) = 'removed' THEN 'a removed button' ELSE COALESCE(d1.name, d2.name, d3.name) END AS design, COALESCE(i.edition, fi.edition) AS edition,
            d1.license, d1.source_author, d1.rarity, d1.max_editions, d1.tier,
            fi.foil, fi.pattern, fi.effect, fi.id AS foil_copy, d3.status AS foil_design_status, a.action AS admin_action,
            COALESCE(ph.pack_id, CASE WHEN l.kind = 'pack_open' THEN l.ref_id END) AS pack_id, ph.reason AS pack_reason, pk.source AS pack_source, pk.special_no AS pack_special_no, pks.name AS pack_series, pks.special_name AS pack_special_name, pks.special_limit AS pack_special_limit,
            pt.name AS pack_to, pf.name AS pack_from,
            fu.foil AS fused_foil, fu.pattern AS fused_pattern, fu.effect AS fused_effect, fo.edition AS fused_edition, d4.name AS fused_design, d4.status AS fused_status,
            COALESCE(d1.id, d2.id, d3.id, d4.id) AS design_id, COALESCE(i.id, fi.id, fo.id) AS copy_id,
            COALESCE(d1.rarity, d2.rarity, d3.rarity, d4.rarity) AS design_rarity, COALESCE(d1.series_id, d2.series_id, d3.series_id, d4.series_id) AS design_series
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
     LEFT JOIN series pks ON pks.id = pk.series_id
     LEFT JOIN users pt ON pt.id = ph.to_user
     LEFT JOIN users pf ON pf.id = ph.from_user
     LEFT JOIN fusions fu ON l.kind = 'fusion' AND fu.id = l.ref_id
     LEFT JOIN instances fo ON fo.id = fu.output_id
     LEFT JOIN designs d4 ON d4.id = fo.design_id
     WHERE (? = 0 OR l.id < ?) ORDER BY l.id DESC LIMIT ?`
  ).bind(before, before, limit).all();
  // hide spoilers: the same rule as the Wall of Buttons
  const admin = !!(viewer && viewer.is_admin);
  let seen = new Set(), upcoming = new Set();
  if (!admin) {
    if (viewer) seen = new Set((await env.DB.prepare(
      `SELECT DISTINCT i.design_id FROM ownership_history h JOIN instances i ON i.id = h.instance_id WHERE h.to_user = ?`
    ).bind(viewer.id).all()).results.map((r) => r.design_id));
    try { upcoming = new Set((await env.DB.prepare("SELECT id FROM series WHERE status = 'upcoming'").all()).results.map((r) => r.id)); } catch {}
  }
  const MYSTERY = new Set(["rare", "ultra", "special"]);
  for (const r of recent) {
    const secret = !admin && r.design_id && ((MYSTERY.has(r.design_rarity) && !seen.has(r.design_id)) || upcoming.has(r.design_series));
    if (secret) {
      Object.assign(r, { design: "a mystery button", fused_design: "a mystery button", mystery: true, design_id: null, copy_id: null,
        rarity: null, max_editions: null, license: null, source_author: null, edition: null, fused_edition: null });
    }
    delete r.design_rarity; delete r.design_series;
  }
  const oldest = await env.DB.prepare("SELECT MIN(id) AS m FROM ledger").first();
  return json({ ...check, recent, oldest_id: oldest ? oldest.m : null });
}
