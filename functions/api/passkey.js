// Passkeys: log in with your fingerprint, face or PIN instead of typing the save code. They are kept by the shared
// Accounts service (RP ID 88x31.app, so one passkey works across the games; see lib/shared.js).
// GET  /api/passkey                         -> { passkeys: [{ id, label, created_at, last_used_at }] }  (yours)
// POST /api/passkey
//   { action: "register_options" }          -> WebAuthn create() options (logged in)
//   { action: "register", credential, label }   save the new passkey (logged in)
//   { action: "login_options" }             -> WebAuthn get() options
//   { action: "login", credential }         -> { user } and a session cookie
//   { action: "remove", id }                    forget one of your passkeys (your save code still works)
import { json, readJson, currentUser, startSession, rateLimit } from "../../lib/auth.js";
import { acc, unavailable, ipOf, originOf, accountFor, refusal, GAME } from "../../lib/shared.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  if (!acc(env)) return unavailable();
  const id = await accountFor(env, me.id);
  return json({ passkeys: id ? (await acc(env).info(id)).passkeys : [] });
}

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!acc(env)) return unavailable();
  const A = acc(env), origin = originOf(request);
  try {
    if (b.action === "login_options") { const r = await A.passkeyLoginOptions({ origin, ip: ipOf(request) }); return refusal(r) || json(r); }
    if (b.action === "login") {
      if (!(await rateLimit(env, request, "passkey", 20, 900))) return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
      const r = await A.passkeyLogin({ origin, ip: ipOf(request), credential: b.credential });
      if (r.error) return refusal(r);
      const { playerId } = await A.playerFor(r.accountId, GAME);
      const u = playerId && await env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(playerId).first();
      if (!u) return json({ error: "That passkey is for an account with no 88x31 player yet." }, 404);
      return json({ user: u }, 200, { "set-cookie": await startSession(env, u.id) });
    }
    const me = await currentUser(env, request);
    if (!me) return json({ error: "Log in first." }, 401);
    const accountId = await accountFor(env, me.id, true);
    if (b.action === "register_options") { const r = await A.passkeyRegisterOptions({ accountId, origin }); return refusal(r) || json(r); }
    if (b.action === "register") { const r = await A.passkeyRegister({ accountId, origin, credential: b.credential, label: b.label }); return refusal(r) || json(r); }
    if (b.action === "remove") { const r = await A.passkeyRemove(accountId, Number(b.id)); return refusal(r) || json(r); }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: e.message || "Something went wrong with the passkey." }, 400);
  }
}
