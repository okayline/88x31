// POST /api/login  { code }  ->  { user }
// The save code belongs to a shared account (see lib/shared.js); this game's player is the user linked to it.
import { json, readJson, hashCode, normalizeCode, startSession, rateLimit } from "../../lib/auth.js";
import { acc, unavailable, ipOf, accountFor, GAME } from "../../lib/shared.js";


export async function onRequestPost({ request, env }) {
  if (!acc(env)) return unavailable();
  if (!(await rateLimit(env, request, "login", 10, 900))) {
    return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
  }
  const { code } = await readJson(request);
  if (normalizeCode(code).length !== 20) {
    return json({ error: "That doesn't look like a save code." }, 400);
  }
  let accountId, r = await acc(env).loginCode({ code, ip: ipOf(request) });
  if (r.error && r.status !== 404) return json({ error: r.error }, r.status || 400);
  if (r.error) {
    // a code from before accounts: still in this game's own table until its player is next seen
    const old = await env.DB.prepare("SELECT user_id FROM save_codes WHERE code_hash = ?").bind(await hashCode(code)).first();
    if (!old) return json({ error: "No account has that save code." }, 401);
    accountId = await accountFor(env, old.user_id, true);
  } else accountId = r.accountId;
  const { playerId } = await acc(env).playerFor(accountId, GAME);
  const u = playerId && await env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(playerId).first();
  if (!u) return json({ error: "That save code is for an account with no 88x31 player yet." }, 404);
  return json({ user: { id: u.id, name: u.name } }, 200, { "set-cookie": await startSession(env, u.id) });
}
