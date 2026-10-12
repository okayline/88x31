// GET /api/me  ->  { user } or { user: null }
// Also wakes the bots once per day (in the background, so the page doesn't wait).
import { json, currentUser } from "../../lib/auth.js";
import { runBotsIfDue } from "../../lib/bots.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  context.waitUntil(runBotsIfDue(env).catch((e) => console.log("bots failed", e)));
  const user = await currentUser(env, request);
  if (!user) return json({ user: null });
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM trades WHERE to_user = ? AND status = 'open' AND expires_at > ?"
  ).bind(user.id, Math.floor(Date.now() / 1000)).first();
  return json({ user: { id: user.id, name: user.name }, trades_waiting: row ? row.n : 0 });
}
