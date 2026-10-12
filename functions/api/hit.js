// Visitor counter.
// GET  /api/hit -> { visits }            (just read it)
// POST /api/hit -> { visits }            (count this visit; the page calls it once per browser visit)
import { json, rateLimit } from "../../lib/auth.js";

const read = async (env) =>
  (await env.DB.prepare("SELECT value FROM counters WHERE name = 'visits'").first())?.value ?? 0;

export async function onRequestGet({ env }) {
  return json({ visits: await read(env) });
}

export async function onRequestPost({ request, env }) {
  // Someone hammering it from one place just sees the number without bumping it.
  if (!(await rateLimit(env, request, "hit", 30, 3600))) return json({ visits: await read(env) });
  const row = await env.DB.prepare(
    `INSERT INTO counters (name, value) VALUES ('visits', 1)
     ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value`
  ).first();
  return json({ visits: row.value });
}
