// GET /api/banner?id=N  -> one copy with its full travel log
import { json } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  const banner = await env.DB.prepare(
    `SELECT i.id, i.edition, u.name AS owner, d.name, d.type, d.rarity, d.image_key, d.max_editions
     FROM instances i JOIN designs d ON d.id = i.design_id LEFT JOIN users u ON u.id = i.owner_id
     WHERE i.id = ?`
  ).bind(id).first();
  if (!banner) return json({ error: "No such banner." }, 404);

  const { results: history } = await env.DB.prepare(
    `SELECT h.reason, h.created_at, f.name AS from_name, t.name AS to_name
     FROM ownership_history h
     LEFT JOIN users f ON f.id = h.from_user
     LEFT JOIN users t ON t.id = h.to_user
     WHERE h.instance_id = ? ORDER BY h.id`
  ).bind(id).all();

  return json({ banner, history });
}
