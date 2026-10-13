// POST /api/fuse { ids: [a, b, c] } -> { ok, id, foil, pattern, effect, step } or { error }
// Fuse 3 of your copies of the same button into 1 better one (see lib/fusion.js).
import { json, readJson, currentUser } from "../../lib/auth.js";
import { fuse } from "../../lib/fusion.js";
import { sealSafe } from "../../lib/ledger.js";

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to fuse buttons." }, 401);
  const { ids } = await readJson(request);
  const r = await fuse(env, me.id, ids);
  if (r.ok) await sealSafe(env);
  return r.ok ? json(r) : json(r, 400);
}
