// GET /api/players -> { players: [{ name, is_bot, buttons }] }  (real players first, then bots)
import { json } from "../../lib/auth.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT u.name, u.is_bot,
            (SELECT COUNT(*) FROM instances i WHERE i.owner_id = u.id AND i.consumed = 0) AS buttons
     FROM users u ORDER BY u.is_bot, u.name COLLATE NOCASE LIMIT 500`
  ).all();
  return json({ players: results });
}
