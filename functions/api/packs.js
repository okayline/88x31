// Sealed packs (lib/packs.js).
// GET  /api/packs        -> { packs: [...your unopened packs] }
// GET  /api/packs?id=N   -> { pack, history, opening, held, kept }   a pack's whole story (public)
// POST /api/packs { action: "open", id }            -> { options: [3 designs], keep }
// POST /api/packs { action: "keep", id, picks: [] } -> { ok, kept: [instance ids] }
// POST /api/packs { action: "give", id, to: NAME }  -> { ok }
import { json, readJson, currentUser } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { packsOf, packStory, openPack, keepFromPack, givePack } from "../../lib/packs.js";

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (id) {
    await sealSafe(env);
    const story = await packStory(env, id);
    return story ? json(story) : json({ error: "No such pack." }, 404);
  }
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  return json({ packs: await packsOf(env, me.id) });
}

export async function onRequestPost({ request, env }) {
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
  return json(r);
}
