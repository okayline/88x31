// GET /api/news -> { items: ["SERIES BETA: 412 OF 500 LEFT IN PRINT", "3 WISHES ON THE REQUEST BOARD", ...] }
// Live lines for the top marquee: print runs of the active series and Request Board nudges.
// The page mixes these in with its own news and 90s jokes.
import { seriesPrinted } from "../../lib/game.js";

const CACHE_SECONDS = 60;
const headers = { "content-type": "application/json", "cache-control": "no-store" };

export async function onRequestGet({ env }) {
  // one-minute cache, shared by everyone (same as the trades ticker)
  const t0 = Math.floor(Date.now() / 1000);
  const cached = await env.DB.prepare("SELECT value, updated_at FROM meta WHERE key = 'news'").first();
  if (cached && t0 - cached.updated_at < CACHE_SECONDS) return new Response(cached.value, { headers });

  const items = [];
  // print runs: only series out in the world (not upcoming, not retired) with a limit
  for (const s of await seriesPrinted(env)) {
    if (s.status !== "active" || s.print_run == null) continue;
    const name = `SERIES ${String(s.name).toUpperCase()}`;
    const left = Math.max(0, s.print_run - s.printed);
    if (s.out_of_print) items.push(`${name} IS OUT OF PRINT!!`);
    else if (left <= 25) items.push(`ONLY ${left} COPIES OF ${name} LEFT IN PRINT!!`);
    else items.push(`${name}: ${left} OF ${s.print_run} LEFT IN PRINT`);
  }

  // Request Board: how many open wishes, and the most wished-for button
  try {
    const open = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM requests WHERE status = 'open' AND expires_at > ?"
    ).bind(t0).first();
    if (open && open.n > 0) {
      items.push(`${open.n} WISH${open.n === 1 ? "" : "ES"} ON THE REQUEST BOARD... FILL ONE 4 A FREE PACK`);
      const top = await env.DB.prepare(
        `SELECT d.name, COUNT(*) AS n FROM requests r JOIN designs d ON d.id = r.design_id
         WHERE r.status = 'open' AND r.expires_at > ? GROUP BY r.design_id ORDER BY n DESC LIMIT 1`
      ).bind(t0).first();
      if (top && top.n > 1) items.push(`MOST WANTED: ${String(top.name).toUpperCase()} (${top.n} WISHES)`);
    }
  } catch {}   // before the Request Board existed

  const body = JSON.stringify({ items });
  await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('news', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(body, t0).run();
  return new Response(body, { headers });
}
