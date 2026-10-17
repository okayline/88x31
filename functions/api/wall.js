// POST /api/wall { order: [instance ids] } -> { ok }
// Saves the order you arranged your buttons in. Ids you don't own are ignored; buttons you
// own but didn't list keep their usual place after the arranged ones.
import { json, readJson, currentUser } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { order } = await readJson(request);
  const ids = [...new Set((Array.isArray(order) ? order : []).map(Number).filter((n) => n > 0))].slice(0, 1000);
  const stmts = [env.DB.prepare("DELETE FROM wall_slots WHERE user_id = ?").bind(me.id)];
  ids.forEach((id, i) => stmts.push(env.DB.prepare(
    `INSERT INTO wall_slots (user_id, slot, instance_id)
     SELECT ?, ?, id FROM instances WHERE id = ? AND owner_id = ? AND consumed = 0 AND locked != -1`   // not while away in another game (lib/travel.js)
  ).bind(me.id, i, id, me.id)));
  await env.DB.batch(stmts);
  return json({ ok: true });
}
