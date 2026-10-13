// The request board (lib/board.js). (Open trades were taken out in v0.28.)
// GET  /api/board            -> { requests: [...] }  (with can_fill for you)
// GET  /api/board?user=NAME  -> { wanted: [...] }   a player's open requests, for their page
// POST /api/board { action, ... }
//   request { design_id, foil? }          cancel_request { id }      fill { id, copy }
import { json, readJson, currentUser } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { expireBoard, boardFor, wantedOf, postRequest, cancelRequest, fillRequest } from "../../lib/board.js";

export async function onRequestGet({ request, env }) {
  await expireBoard(env);
  const name = new URL(request.url).searchParams.get("user");
  if (name) {
    const u = await userByName(env, name);
    return u ? json({ wanted: await wantedOf(env, u.id) }) : json({ error: "No player by that name." }, 404);
  }
  const me = await currentUser(env, request);
  return json(await boardFor(env, me ? me.id : null));
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in first." }, 401);
  const b = await readJson(request);
  await expireBoard(env);
  let r;
  switch (b.action) {
    case "request": r = await postRequest(env, me.id, Number(b.design_id), b.foil || null); break;
    case "cancel_request": r = await cancelRequest(env, me.id, Number(b.id)); break;
    case "fill": r = await fillRequest(env, me.id, Number(b.id), Number(b.copy)); break;
    case "trade": case "cancel_trade": case "accept": r = { error: "Open trades are closed. Propose a trade from someone's page instead!" }; break;
    default: r = { error: "Unknown action." };
  }
  if (r.ok) await sealSafe(env);
  return r.ok ? json(r) : json(r, 400);
}
