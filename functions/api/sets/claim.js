// POST /api/sets/claim { set_id } -> { ok, instance_id } or { error }
import { json, readJson, currentUser } from "../../../lib/auth.js";
import { claimSet } from "../../../lib/sets.js";
import { sealSafe } from "../../../lib/ledger.js";

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to claim rewards." }, 401);
  const { set_id } = await readJson(request);
  const r = await claimSet(env, me.id, Number(set_id));
  if (r.ok) await sealSafe(env);
  return r.ok ? json(r) : json(r, 400);
}
