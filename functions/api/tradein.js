// POST /api/tradein { copies: [instance ids] } -> { ok, packs, used }
// Trade in commons and uncommons, 5 at a time, for sealed ~*~cLuB~*~ packs (v0.30). No daily limit.
import { json, readJson, currentUser } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { tradeIn } from "../../lib/progress.js";

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in first." }, 401);
  const { copies } = await readJson(request);
  const r = await tradeIn(env, me.id, copies);
  if (r.ok) await sealSafe(env);
  return r.ok ? json(r) : json(r, 400);
}
