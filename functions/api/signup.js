// POST /api/signup  { name }  ->  { user, code }  (code is shown once, never stored)
import { json, readJson, newSaveCode, hashCode, startSession, rateLimit, now } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!(await rateLimit(env, request, "signup", 5, 3600))) {
    return json({ error: "Too many new accounts from here. Try again later." }, 429);
  }
  const { name } = await readJson(request);
  const clean = String(name || "").trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(clean)) {
    return json({ error: "Name must be 3-20 letters, numbers, _ or -." }, 400);
  }
  const taken = await env.DB.prepare("SELECT 1 FROM users WHERE name = ?").bind(clean).first();
  if (taken) return json({ error: "That name is taken." }, 409);

  const t = now();
  const code = newSaveCode();
  const codeHash = await hashCode(code);

  // One all-or-nothing batch: the account and its first code.
  let user;
  try {
    const [res] = await env.DB.batch([
      env.DB.prepare("INSERT INTO users (name, created_at) VALUES (?, ?) RETURNING id, name").bind(clean, t),
      env.DB.prepare(
        `INSERT INTO save_codes (user_id, code_hash, label, created_at)
         SELECT id, ?, 'first code', ? FROM users WHERE name = ?`
      ).bind(codeHash, t, clean),
    ]);
    user = res.results[0];
  } catch {
    return json({ error: "That name is taken." }, 409);
  }

  const cookie = await startSession(env, user.id);
  return json({ user, code }, 200, { "set-cookie": cookie });
}
