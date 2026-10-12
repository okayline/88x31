// GET /api/credits -> { designs: [{ name, image_key, source_title, source_author, source_url, license }] }
import { json } from "../../lib/auth.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, image_key, rarity, source_title, source_author, source_url, license
     FROM designs WHERE status = 'active' ORDER BY id`
  ).all();
  return json({ designs: results });
}
