// GET  /api/trades -> { incoming: [...open offers to me], outgoing: [...my open offers], history: [...] }
// POST /api/trades { to, give: [ids], want: [ids], give_packs: [ids], want_packs: [ids], message } -> { ok, id }
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
  // Request Board fills (you filled someone's wish, or someone filled yours) belong in the history too
  const { results: fills } = await env.DB.prepare(
    `SELECT r.id, r.user_id, r.filled_by, r.foil, r.created_at, r.resolved_at, d.name AS design, rq.name AS requester, fl.name AS filler
     FROM requests r JOIN designs d ON d.id = r.design_id JOIN users rq ON rq.id = r.user_id LEFT JOIN users fl ON fl.id = r.filled_by
     WHERE r.status = 'filled' AND (r.user_id = ? OR r.filled_by = ?) ORDER BY r.resolved_at DESC LIMIT 25`
  ).bind(me.id, me.id).all();
  const history = [
    ...all.filter((t) => t.status !== "open"),
    ...fills.map((f) => ({ request: true, id: "r" + f.id, status: "filled", created_at: f.created_at, resolved_at: f.resolved_at,
      design: f.design, foil: f.foil, requester: f.requester, filler: f.filler, i_filled: f.filled_by === me.id })),
  ].sort((a, b) => (b.resolved_at || b.created_at) - (a.resolved_at || a.created_at)).slice(0, 25);
  return json({
    incoming: all.filter((t) => t.status === "open" && t.to_user === me.id),
    outgoing: all.filter((t) => t.status === "open" && t.from_user === me.id),
    history,
  });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to trade." }, 401);
  const body = await readJson(request);
  const to = await userByName(env, body.to);
  if (!to) return json({ error: "No player by that name." }, 404);
  await expireTrades(env);
  const r = await proposeTrade(env, me.id, to.id, body.give, body.want, body.message, body.give_packs || [], body.want_packs || []);
  return r.ok ? json(r) : json(r, 400);
}
