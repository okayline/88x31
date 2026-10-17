// GET /api/designs        -> { designs: [...every button design, with copies made...] }
// GET /api/designs?id=N   -> { design, ledger, sets, copies } one design's info window
import { json, currentUser } from "../../lib/auth.js";
import { seriesPrinted } from "../../lib/game.js";
import { seenSet } from "../../lib/progress.js";

// Hidden until seen (v0.30): a logged-in player sees a button on the Wall only once they've owned
// it, been shown it in a pull or pack, or seen it on someone's page (lib/progress.js). Logged-out
// visitors (v0.37) see only the cLuB's own commons; everything else is a mystery, so the Wall shows a logged-out
// visitor less than it shows a player.
// Buttons in a series that hasn't been released yet stay off the Wall (webmasters still see them).
const UPCOMING_OUT = (viewer) => (viewer && viewer.is_admin ? ""
  : "AND NOT EXISTS (SELECT 1 FROM series s WHERE s.id = d.series_id AND s.status = 'upcoming')");
// is this design a mystery to this viewer?
// (v0.37.2) found (archive) commons are sent too: the page shows a couple of them
const mysteryFor = (seen) => (d) => (seen ? !seen.has(d.id) : d.rarity !== "common");

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  const db = env.DB;
  const viewer = await currentUser(env, request);
  const hidden = mysteryFor(await seenSet(env, viewer));
  if (!id) {
    const { results } = await db.prepare(
      `SELECT d.id, d.name, d.type, d.rarity, d.status, d.image_key, d.max_editions, d.stats, d.tier,
              (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted
       FROM designs d WHERE d.status IN ('active', 'reward', 'frozen') ${UPCOMING_OUT(viewer)} ORDER BY d.id`
    ).all();
    return json({ designs: results.map((d) => (hidden(d)
      ? { id: d.id, hidden: true, tier: d.tier === "archive" ? "archive" : "original" }   // a mystery: no name, picture or rarity
      : d)) });
  }
  const design = await db.prepare(
    `SELECT d.id, d.name, d.image_key, d.image_hash, d.type, d.rarity, d.stats, d.max_editions, d.status, d.created_at,
            d.source_title, d.source_author, d.source_url, d.license, d.tier, f.name AS found_by,
            (SELECT name FROM series WHERE id = d.series_id) AS series,
            (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted,
            (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id AND i.consumed = 0) AS left_count
     FROM designs d LEFT JOIN users f ON f.id = d.found_by
     WHERE d.id = ? AND d.status IN ('active', 'reward', 'frozen', 'removed') ${UPCOMING_OUT(viewer)}`
  ).bind(id).first();
  if (design && design.series) {
    // the series' print run: "Series Beta · 312 of 500 printed"
    const r = (await seriesPrinted(env)).find((x) => x.name === design.series);
    if (r) Object.assign(design, { series_printed: r.printed, series_run: r.print_run, series_out: r.out_of_print });
  }
  if (design && design.status === "removed") {
    // a tombstone: the record stays, the art and credits don't
    return json({ removed: true, design: { id: design.id, name: viewer && viewer.is_admin ? design.name : "Removed by request",
      image_key: design.image_key, rarity: design.rarity, status: "removed", minted: design.minted } });
  }
  if (!design) return json({ error: "No such button." }, 404);
  if (hidden(design)) {
    return json({ hidden: true });
  }
  const ledger = await db.prepare(
    "SELECT id, hash, created_at FROM ledger WHERE kind = 'design' AND ref_id = ?"
  ).bind(id).first();
  // sets it belongs to (secret sets stay secret), or the set it's the reward for
  const { results: sets } = await db.prepare(
    `SELECT s.name, s.secret, 'part' AS role FROM set_designs sd JOIN sets s ON s.id = sd.set_id WHERE sd.design_id = ?
     UNION ALL
     SELECT s.name, s.secret, 'reward' AS role FROM sets s WHERE s.reward_design_id = ?`
  ).bind(id, id).all();
  // who owns copies (first 60 by edition)
  const { results: copies } = await db.prepare(
    `SELECT i.id, i.edition, i.foil, i.foil_seed, i.pattern, i.effect, u.name AS owner, u.is_bot FROM instances i LEFT JOIN users u ON u.id = i.owner_id
     WHERE i.design_id = ? AND i.consumed = 0 ORDER BY i.edition LIMIT 60`
  ).bind(id).all();
  // copies made with each foil, and who to ask about credits or takedowns
  const { results: foils } = await db.prepare(
    "SELECT COALESCE(foil, 'first') AS foil, COUNT(*) AS n FROM instances WHERE design_id = ? AND consumed = 0 GROUP BY foil"
  ).bind(id).all();
  const wm = await db.prepare("SELECT name FROM users WHERE is_admin = 1 AND is_bot = 0 ORDER BY id LIMIT 1").first();
  return json({
    design, ledger, foils, webmaster: wm ? wm.name : null,
    sets: sets.map((s) => (s.secret ? { name: "a secret set", role: s.role } : { name: s.name, role: s.role })),
    copies,
  });
}
