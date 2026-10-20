// Sealed packs (lib/packs.js).
// GET  /api/packs        -> { packs: [...your unopened packs] }
// GET  /api/packs?id=N   -> { pack, history, opening, held, kept }   a pack's whole story (public)
// GET  /api/packs?user=NAME -> { packs: [...their sealed packs] }  for the trade builder (v0.34)
// GET  /api/packs?all=1  -> { packs: [...every pack, newest first] }   the public Packs page (v0.31.2)
// POST /api/packs { action: "open", id }            -> { options: [3 designs], keep }
// POST /api/packs { action: "keep", id, picks: [] } -> { ok, kept: [instance ids] }
// POST /api/packs { action: "give", id, to: NAME }  -> { ok }
import { json, readJson, currentUser } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { packsOf, packStory, openPack, keepFromPack, givePack, allPacks } from "../../lib/packs.js";
import { markSeen } from "../../lib/progress.js";
import { syncRegistry } from "../../lib/registry.js";

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  if (id) {
    await sealSafe(env);
    const story = await packStory(env, id);
    // what an opened pack held counts as seen, like buttons on someone's page
    if (story && story.held) await markSeen(env, await currentUser(env, request), story.held.filter(Boolean).map((d) => d.id));
    return story ? json(story) : json({ error: "No such pack." }, 404);
  }
  if (params.get("all")) return json({ packs: await allPacks(env) });
  if (params.get("user")) {
    const u = await userByName(env, params.get("user"));
    if (!u) return json({ error: "No player by that name." }, 404);
    return json({ packs: (await packsOf(env, u.id)).filter((p) => !p.revealed) });
  }
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  return json({ packs: await packsOf(env, me.id) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in first." }, 401);
  const body = await readJson(request);
  const id = Number(body.id);
  let r;
  if (body.action === "open") r = await openPack(env, me.id, id);
  else if (body.action === "keep") r = await keepFromPack(env, me.id, id, body.picks);
  else if (body.action === "give") {
    const to = await userByName(env, body.to);
    if (!to) return json({ error: "No player by that name." }, 404);
    r = await givePack(env, me.id, to.id, id);
  } else return json({ error: "Unknown action." }, 400);
  if (r.error) return json(r, 400);
  await sealSafe(env);
  // (v0.45.2) kept buttons go to the shared registry now, in the background, not at the next page load (lib/registry.js)
  if (body.action === "keep") context.waitUntil(syncRegistry(env).catch((e) => console.log("registry sync failed", e)));
  return json(r);
}
