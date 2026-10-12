// GET /api/me  ->  { user } or { user: null }
// Also wakes the bots once per day (in the background, so the page doesn't wait).
import { json, currentUser } from "../../lib/auth.js";
import { runBotsIfDue } from "../../lib/bots.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  context.waitUntil(runBotsIfDue(env).catch((e) => console.log("bots failed", e)));
  const user = await currentUser(env, request);
  return json({ user: user ? { id: user.id, name: user.name } : null });
}
