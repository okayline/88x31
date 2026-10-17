// Save codes for the logged-in player (kept by the shared Accounts service; see lib/shared.js).
// GET    /api/codes            -> { codes: [{ id, label, created_at, last_used_at }] }
// POST   /api/codes { label }  -> { code }   (new extra code, shown once)
// DELETE /api/codes?id=N       -> { ok }     (can't remove your last way in)
import { json, currentUser } from "../../lib/auth.js";
import { acc, unavailable, accountFor, refusal } from "../../lib/shared.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  if (!acc(env)) return unavailable();
  const id = await accountFor(env, user.id);
  const codes = id ? (await acc(env).info(id)).codes : [];
  return json({ codes: codes.map((c) => ({ ...c, label: "save code" })) });
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  if (!acc(env)) return unavailable();
  const r = await acc(env).addCode(await accountFor(env, user.id, true));
  return refusal(r) || json({ code: r.code });
}

export async function onRequestDelete({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  if (!acc(env)) return unavailable();
  const id = Number(new URL(request.url).searchParams.get("id"));
  const account = await accountFor(env, user.id);
  if (!account || (await acc(env).info(account)).codes.length < 2) return json({ error: "Can't remove that code (it may be your last one)." }, 400);
  const r = await acc(env).removeCode(account, id);
  return r.error ? json({ error: "Can't remove that code (it may be your last one)." }, 400) : json({ ok: true });
}
