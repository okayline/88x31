// POST /api/links { to: NAME, action: "request" | "accept" | "decline" | "remove" } -> { ok, state }
import { json, readJson, currentUser, rateLimit } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { linkAction } from "../../lib/links.js";

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to swap links." }, 401);
  if (!(await rateLimit(env, request, "links", 60, 3600))) return json({ error: "Slow down a little!" }, 429);
  const { to, action } = await readJson(request);
  const other = await userByName(env, to);
  if (!other) return json({ error: "No player by that name." }, 404);
  const r = await linkAction(env, me.id, other.id, action);
  return r.ok ? json(r) : json(r, 400);
}
