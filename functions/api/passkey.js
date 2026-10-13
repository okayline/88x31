// Passkeys: log in with your fingerprint, face or PIN instead of typing the save code.
// GET  /api/passkey                         -> { passkeys: [{ id, label, created_at, last_used_at }] }  (yours)
// POST /api/passkey
//   { action: "register_options" }          -> WebAuthn create() options (logged in)
//   { action: "register", credential, label }   save the new passkey (logged in)
//   { action: "login_options" }             -> WebAuthn get() options
//   { action: "login", credential }         -> { user } and a session cookie
//   { action: "remove", id }                    forget one of your passkeys (your save code still works)
import { json, readJson, currentUser, startSession, rateLimit } from "../../lib/auth.js";
import { registerOptions, verifyRegistration, loginOptions, verifyLogin } from "../../lib/passkeys.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { results } = await env.DB.prepare(
    "SELECT id, label, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY id"
  ).bind(me.id).all();
  return json({ passkeys: results });
}

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  try {
    if (b.action === "login_options" || b.action === "login") {
      if (!(await rateLimit(env, request, "passkey", 20, 900))) return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
      if (b.action === "login_options") return json(await loginOptions(env, request));
      const userId = await verifyLogin(env, request, b.credential);
      const u = await env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(userId).first();
      if (!u) return json({ error: "That account is gone." }, 404);
      return json({ user: u }, 200, { "set-cookie": await startSession(env, u.id) });
    }
    const me = await currentUser(env, request);
    if (!me) return json({ error: "Log in first." }, 401);
    if (b.action === "register_options") return json(await registerOptions(env, request, me));
    if (b.action === "register") {
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?").bind(me.id).first()).n;
      if (n >= 10) return json({ error: "That's plenty of passkeys! Remove one first." }, 400);
      return json(await verifyRegistration(env, request, me, b.credential, b.label));
    }
    if (b.action === "remove") {
      const r = await env.DB.prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?").bind(Number(b.id), me.id).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "No such passkey." }, 404);
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: e.message || "Something went wrong with the passkey." }, 400);
  }
}
