// The request board and open trades (lib/board.js).
// GET  /api/board            -> { requests: [...], open_trades: [...] }  (with can_fill / can_give for you)
// GET  /api/board?user=NAME  -> { wanted: [...] }   a player's open requests, for their page
// POST /api/board { action, ... }
//   request { design_id, foil? }          cancel_request { id }      fill { id, copy }
//   trade { give: [ids], design_id, foil?, message? }   cancel_trade { id }   accept { id, copy }
import { json, readJson, currentUser } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { expireBoard, boardFor, wantedOf, postRequest, cancelRequest, fillRequest,
  postOpenTrade, cancelOpenTrade, acceptOpenTrade } from "../../lib/board.js";

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
    case "trade": r = await postOpenTrade(env, me.id, b.give, Number(b.design_id), b.foil || null, b.message); break;
    case "cancel_trade": r = await cancelOpenTrade(env, me.id, Number(b.id)); break;
    case "accept": r = await acceptOpenTrade(env, me.id, Number(b.id), Number(b.copy)); break;
    default: r = { error: "Unknown action." };
  }
  if (r.ok) await sealSafe(env);
  return r.ok ? json(r) : json(r, 400);
}
