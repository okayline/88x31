// POST /api/login  { code }  ->  { user }
import { json, readJson, hashCode, normalizeCode, startSession, rateLimit, now } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!(await rateLimit(env, request, "login", 10, 900))) {
    return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
  }
  const { code } = await readJson(request);
  if (normalizeCode(code).length !== 20) {
    return json({ error: "That doesn't look like a save code." }, 400);
  }
  const row = await env.DB.prepare(
    `SELECT c.id AS code_id, u.id, u.name FROM save_codes c JOIN users u ON u.id = c.user_id
     WHERE c.code_hash = ?`
  ).bind(await hashCode(code)).first();
  if (!row) return json({ error: "No account has that save code." }, 401);

  await env.DB.prepare("UPDATE save_codes SET last_used_at = ? WHERE id = ?").bind(now(), row.code_id).run();
  const cookie = await startSession(env, row.id);
  return json({ user: { id: row.id, name: row.name } }, 200, { "set-cookie": cookie });
}
