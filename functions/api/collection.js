// GET /api/collection?user=NAME   (no user = yours)
// -> { owner: { id, name }, banners: [{ id, edition, design... , got_at, got_how }] }
import { json, currentUser } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";

export async function onRequestGet({ request, env }) {
  const name = new URL(request.url).searchParams.get("user");
  const owner = name ? await userByName(env, name) : await currentUser(env, request);
  if (!owner) return json({ error: name ? "No player by that name." : "Not logged in." }, name ? 404 : 401);

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.edition, d.id AS design_id, d.name, d.type, d.rarity, d.image_key, d.max_editions,
            (SELECT h.created_at FROM ownership_history h WHERE h.instance_id = i.id ORDER BY h.id DESC LIMIT 1) AS got_at,
            (SELECT h.reason FROM ownership_history h WHERE h.instance_id = i.id ORDER BY h.id DESC LIMIT 1) AS got_how
     FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.owner_id = ? AND i.consumed = 0
     ORDER BY got_at DESC, i.id DESC`
  ).bind(owner.id).all();

  return json({ owner: { id: owner.id, name: owner.name, is_bot: owner.is_bot || 0, last_seen: owner.is_bot ? owner.last_seen : null }, banners: results });
}
