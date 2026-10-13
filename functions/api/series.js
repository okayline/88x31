// GET /api/series -> { series: [{ id, name, status }] }  (upcoming ones only for webmasters)
import { json, currentUser } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  const { results } = await env.DB.prepare("SELECT id, name, status FROM series ORDER BY sort, id").all();
  return json({ series: results.filter((s) => s.status !== "upcoming" || (me && me.is_admin)) });
}
