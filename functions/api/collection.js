// GET /api/collection?user=NAME   (no user = yours)
// -> { owner: { id, name }, banners: [{ id, edition, design... , got_at, got_how }] }
import { json, currentUser } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { markSeen } from "../../lib/progress.js";

// Sites allowed to read a player's public collection from the browser (okayline.dev and a.88x31.app show kura's buttons).
const SHOW_ON = ["https://okayline.dev", "https://www.okayline.dev", "https://a.88x31.app"];

export async function onRequestGet({ request, env }) {
  const name = new URL(request.url).searchParams.get("user");
  const owner = name ? await userByName(env, name) : await currentUser(env, request);
  if (!owner) return json({ error: name ? "No player by that name." : "Not logged in." }, name ? 404 : 401);

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.edition, i.locked, i.foil, i.foil_seed, i.pattern, i.effect, d.id AS design_id, d.name, d.type, d.rarity, d.image_key, d.max_editions,
            (SELECT h.created_at FROM ownership_history h WHERE h.instance_id = i.id ORDER BY h.id DESC LIMIT 1) AS got_at,
            (SELECT h.reason FROM ownership_history h WHERE h.instance_id = i.id ORDER BY h.id DESC LIMIT 1) AS got_how
     FROM instances i JOIN designs d ON d.id = i.design_id
     LEFT JOIN wall_slots w ON w.instance_id = i.id AND w.user_id = i.owner_id
     WHERE i.owner_id = ? AND i.consumed = 0
     ORDER BY w.slot IS NULL, w.slot, got_at DESC, i.id DESC`
  ).bind(owner.id).all();

  // visiting someone's page uncovers their buttons for you (hidden until seen, v0.30)
  if (name) {
    const viewer = await currentUser(env, request);
    if (viewer && viewer.id !== owner.id) await markSeen(env, viewer, results.map((b) => b.design_id));
  }
  const origin = request.headers.get("origin");
  const cors = name && SHOW_ON.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : { vary: "Origin" };
  return json({ owner: { id: owner.id, name: owner.name, is_bot: owner.is_bot || 0,
    last_seen: owner.is_bot ? owner.last_seen : null, theme: owner.theme || null }, banners: results }, 200, cors);
}
