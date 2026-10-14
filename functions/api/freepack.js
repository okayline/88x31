// The front-page free pack (lib/freepack.js).
// GET  /api/freepack                          -> { state: none|waiting|claimed, card?, name?, sitekey? }
// POST /api/freepack { action: "open" }       -> { card }   (sets the anonymous free-pack cookie)
// POST /api/freepack { action: "sign", name, turnstile?, came_from? } -> { user, code, instance_id }  (logs in)
import { json, readJson, currentUser } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { freePackState, openFreePack, signFreePack } from "../../lib/freepack.js";

export async function onRequestGet({ request, env }) {
  if (await currentUser(env, request)) return json({ state: "member" });
  return json({ ...(await freePackState(env, request)), sitekey: env.TURNSTILE_SITEKEY || null });
}

export async function onRequestPost({ request, env }) {
  if (await currentUser(env, request)) return json({ error: "You're already in ~*~ tHe cLuB ~*~!" }, 400);
  const body = await readJson(request);
  if (body.action === "open") {
    const r = await openFreePack(env, request);
    if (r.error) return json(r, 400);
    return json({ card: r.card }, 200, r.cookie ? { "set-cookie": r.cookie } : {});
  }
  if (body.action === "sign") {
    const r = await signFreePack(env, request, body.name, body.turnstile, body.came_from);
    if (r.error) return json({ error: r.error }, r.status || 400);
    await sealSafe(env);
    return json({ user: r.user, code: r.code, instance_id: r.instance_id }, 200, { "set-cookie": r.cookie });
  }
  return json({ error: "Unknown action." }, 400);
}
