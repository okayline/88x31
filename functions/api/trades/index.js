// GET  /api/trades -> { incoming: [...open offers to me], outgoing: [...my open offers], history: [...] }
// POST /api/trades { to, give: [ids], want: [ids], message } -> { ok, id }
import { json, readJson, currentUser } from "../../../lib/auth.js";
import { userByName } from "../../../lib/game.js";
import { expireTrades, proposeTrade, listTrades } from "../../../lib/trades.js";
import { markSeen } from "../../../lib/progress.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  await expireTrades(env);
  const all = await listTrades(env, me.id, { limit: 60 });
  await markSeen(env, me, all.flatMap((t) => [...t.give, ...t.want].map((i) => i.design_id)));
  return json({
    incoming: all.filter((t) => t.status === "open" && t.to_user === me.id),
    outgoing: all.filter((t) => t.status === "open" && t.from_user === me.id),
    history: all.filter((t) => t.status !== "open").slice(0, 25),
  });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to trade." }, 401);
  const body = await readJson(request);
  const to = await userByName(env, body.to);
  if (!to) return json({ error: "No player by that name." }, 404);
  await expireTrades(env);
  const r = await proposeTrade(env, me.id, to.id, body.give, body.want, body.message);
  return r.ok ? json(r) : json(r, 400);
}
