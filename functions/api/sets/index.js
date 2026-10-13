// GET  /api/sets?user=NAME -> { sets: [...], secrets_left?, mine } (default: you)
//   Your own sets: the ones you've started, with buttons you don't own hidden.
//   Someone else's: only finished sets they chose to show off.
// POST /api/sets { set_id, show } -> { ok }   show off a finished set on your page (or stop)
import { json, readJson, currentUser } from "../../../lib/auth.js";
import { userByName } from "../../../lib/game.js";
import { setsFor, secretCount, setShowcase } from "../../../lib/sets.js";

export async function onRequestGet({ request, env }) {
  const name = new URL(request.url).searchParams.get("user");
  const viewer = await currentUser(env, request);
  const who = name ? await userByName(env, name) : viewer;
  if (!who) return json({ error: name ? "No player by that name." : "Not logged in." }, name ? 404 : 401);
  const mine = !!viewer && viewer.id === who.id;
  const sets = await setsFor(env, who.id, { visitor: !mine });
  if (!mine) return json({ sets, mine: false, is_bot: !!who.is_bot });
  const secrets = await secretCount(env);
  return json({ sets, mine: true, secrets_left: Math.max(0, secrets - sets.filter((s) => s.secret).length) });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { set_id, show } = await readJson(request);
  const r = await setShowcase(env, me.id, Number(set_id), !!show);
  return r.ok ? json(r) : json(r, 400);
}
