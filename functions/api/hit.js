// Visitor counter.
// GET  /api/hit -> { visits }            (just read it)
// POST /api/hit -> { visits }            (count this visit; the page calls it once per browser visit)
import { json, rateLimit, now } from "../../lib/auth.js";
import { givePacks, everyoneIds } from "../../lib/packs.js";
import { sealSafe } from "../../lib/ledger.js";

// Visitor milestones: when the counter hits one, everyone in the cLuB gets a sealed pack.
export const MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

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
  if (MILESTONES.includes(row.value)) {
    try {
      // only once per milestone, even if two visits race
      const claim = await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES (?, '1', ?)")
        .bind("milestone_" + row.value, now()).run();
      if (claim.meta.changes) {
        await givePacks(env, await everyoneIds(env), 1, { source: "milestone", note: `${row.value.toLocaleString("en-US")} visitors!!` });
        await sealSafe(env);
      }
    } catch (e) { console.log("milestone packs failed", e); }
  }
  return json({ visits: row.value, milestone: MILESTONES.includes(row.value) || undefined });
}
