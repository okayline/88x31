// GET /api/me  ->  { user } or { user: null }
// Also wakes the bots once per day and mirrors into the shared item registry (in the background, so the page doesn't wait).
import { json, currentUser } from "../../lib/auth.js";
import { runBotsIfDue } from "../../lib/bots.js";
import { syncIfDue } from "../../lib/registry.js";
import { lockEndedWalls } from "../../lib/themewall.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  context.waitUntil(runBotsIfDue(env).catch((e) => console.log("bots failed", e)));
  context.waitUntil(syncIfDue(env).catch((e) => console.log("registry sync failed", e)));   // mirror into the shared registry (lib/registry.js)
  context.waitUntil(lockEndedWalls(env).catch((e) => console.log("wall lock failed", e)));   // lock the Theme Walls whose week is over (lib/themewall.js)
  const user = await currentUser(env, request);
  if (!user) return json({ user: null });
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM trades WHERE to_user = ? AND status = 'open' AND expires_at > ?"
  ).bind(user.id, Math.floor(Date.now() / 1000)).first();
  return json({ user: { id: user.id, name: user.name, is_admin: user.is_admin ? 1 : 0 }, trades_waiting: row ? row.n : 0 });
}
