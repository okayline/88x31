// Save codes for the logged-in player.
// GET    /api/codes            -> { codes: [{ id, label, created_at, last_used_at }] }
// POST   /api/codes { label }  -> { code }   (new extra code, shown once)
// DELETE /api/codes?id=N       -> { ok }     (can't remove your last code)
import { json, readJson, currentUser, newSaveCode, hashCode, now, MAX_CODES } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  const { results } = await env.DB.prepare(
    "SELECT id, label, created_at, last_used_at FROM save_codes WHERE user_id = ? ORDER BY id"
  ).bind(user.id).all();
  return json({ codes: results });
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  const { label } = await readJson(request);
  const code = newSaveCode();
  // Insert only if under the cap (checked in the same statement).
  const res = await env.DB.prepare(
    `INSERT INTO save_codes (user_id, code_hash, label, created_at)
     SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM save_codes WHERE user_id = ?) < ?`
  ).bind(user.id, await hashCode(code), String(label || "extra code").slice(0, 40), now(), user.id, MAX_CODES).run();
  if (!res.meta.changes) return json({ error: `You can have at most ${MAX_CODES} codes. Remove one first.` }, 400);
  return json({ code });
}

export async function onRequestDelete({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  const id = Number(new URL(request.url).searchParams.get("id"));
  const res = await env.DB.prepare(
    `DELETE FROM save_codes WHERE id = ? AND user_id = ?
     AND (SELECT COUNT(*) FROM save_codes WHERE user_id = ?) > 1`
  ).bind(id, user.id, user.id).run();
  if (!res.meta.changes) return json({ error: "Can't remove that code (it may be your last one)." }, 400);
  return json({ ok: true });
}
