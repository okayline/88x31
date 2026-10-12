// GET /api/banner?id=N -> one copy with its credits, its design's ledger entry,
// its full travel log (each step with its ledger fingerprint), and the chain status.
import { json } from "../../lib/auth.js";
import { sealSafe, verifyLedger } from "../../lib/ledger.js";

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  await sealSafe(env); // make sure the latest steps have fingerprints

  const banner = await env.DB.prepare(
    `SELECT i.id, i.edition, i.design_id, u.name AS owner, d.name, d.type, d.rarity, d.image_key, d.max_editions,
            d.image_hash, d.stats, d.source_title, d.source_author, d.source_url, d.license,
            (SELECT COUNT(*) FROM instances WHERE design_id = d.id) AS minted
     FROM instances i JOIN designs d ON d.id = i.design_id LEFT JOIN users u ON u.id = i.owner_id
     WHERE i.id = ?`
  ).bind(id).first();
  if (!banner) return json({ error: "No such banner." }, 404);

  const design_entry = await env.DB.prepare(
    "SELECT id, hash, prev_hash, created_at FROM ledger WHERE kind = 'design' AND ref_id = ?"
  ).bind(banner.design_id).first();

  const { results: history } = await env.DB.prepare(
    `SELECT h.reason, h.created_at, f.name AS from_name, t.name AS to_name,
            l.id AS ledger_id, l.hash
     FROM ownership_history h
     LEFT JOIN users f ON f.id = h.from_user
     LEFT JOIN users t ON t.id = h.to_user
     LEFT JOIN ledger l ON l.kind = 'transfer' AND l.ref_id = h.id
     WHERE h.instance_id = ? ORDER BY h.id`
  ).bind(id).all();

  const chain = await verifyLedger(env);
  return json({ banner, design_entry, history, chain: { ok: chain.ok, entries: chain.entries } });
}
