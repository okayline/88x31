// GET /api/sets?user=NAME -> { sets: [...progress...], secrets_left } (default: you)
import { json, currentUser } from "../../../lib/auth.js";
import { userByName } from "../../../lib/game.js";
import { setsFor, secretCount } from "../../../lib/sets.js";

export async function onRequestGet({ request, env }) {
  const name = new URL(request.url).searchParams.get("user");
  const who = name ? await userByName(env, name) : await currentUser(env, request);
  if (!who) return json({ error: name ? "No player by that name." : "Not logged in." }, name ? 404 : 401);
  const sets = await setsFor(env, who.id);
  const secrets = await secretCount(env);
  return json({ sets, secrets_left: Math.max(0, secrets - sets.filter((s) => s.secret).length), is_bot: !!who.is_bot });
}
