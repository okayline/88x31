// Series of the cLuB's original buttons.
// GET  /api/series        -> { series: [{ id, name, status, printed, print_run, out_of_print, buttons? ... }] }
//                            (upcoming ones only for webmasters)
// GET  /api/series?id=N   -> { series, designs: [...] }                   (webmasters: what's in it)
// POST /api/series (webmasters)
//   { action: "create", name, special_name? }     a new series, upcoming (hidden, not in packs)
//   { action: "status", id, status }              upcoming | active | retired
//   { action: "print_run", id, print_run }        set or raise a series' print run (never below what's printed)
//   { action: "special_name", id, special_name }  the name of its limited special packs ("Gold Master")
//   { action: "assign", design_id, series_id }    put a cLuB original into a series
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { MAX_ACTIVE_SERIES, seriesPrinted, recountStatement } from "../../lib/game.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  const admin = !!(me && me.is_admin);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (id && admin) {
    const series = await env.DB.prepare("SELECT * FROM series WHERE id = ?").bind(id).first();
    const { results: designs } = await env.DB.prepare(
      "SELECT id, name, rarity, image_key, status, max_editions FROM designs WHERE series_id = ? ORDER BY rarity, name"
    ).bind(id).all();
    return json({ series, designs });
  }
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.name, s.status, s.sort, s.released_at,
            (SELECT COUNT(*) FROM designs d WHERE d.series_id = s.id AND d.status != 'removed') AS buttons
     FROM series s ORDER BY s.sort, s.id`
  ).all();
  const runs = Object.fromEntries((await seriesPrinted(env)).map((r) => [r.id, r]));
  let specials = {};
  try {
    specials = Object.fromEntries((await env.DB.prepare(
      "SELECT series_id, MAX(special_no) AS made FROM packs WHERE special_no IS NOT NULL GROUP BY series_id"
    ).all()).results.map((r) => [r.series_id, r.made]));
  } catch {}
  const list = results.filter((s) => s.status !== "upcoming" || admin).map((s) => {
    const r = runs[s.id] || {};
    return { ...s, printed: r.printed ?? 0, print_run: r.print_run ?? null, out_of_print: !!r.out_of_print,
      special_name: r.special_name || null, special_limit: r.special_limit ?? 25, special_made: specials[s.id] || 0 };
  });
  if (admin) {
    // cLuB originals not in any series yet (to put into one)
    const loose = (await env.DB.prepare(
      "SELECT id, name, rarity FROM designs WHERE series_id IS NULL AND tier != 'archive' AND status IN ('active', 'reward', 'frozen') ORDER BY id DESC LIMIT 100"
    ).all()).results;
    return json({ series: list, loose, max_active: MAX_ACTIVE_SERIES });
  }
  return json({ series: list.map(({ id, name, status, printed, print_run, out_of_print, special_name }) => ({ id, name, status, printed, print_run, out_of_print, special_name })) });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me || !me.is_admin) return json({ error: "Webmasters only." }, 403);
  const b = await readJson(request);
  const db = env.DB, t = now();
  if (b.action === "create") {
    const name = String(b.name || "").trim().slice(0, 30);
    if (!name) return json({ error: "Give it a name (like Gamma)." }, 400);
    if (await db.prepare("SELECT 1 FROM series WHERE name = ? COLLATE NOCASE").bind(name).first()) return json({ error: "There's already a series called that." }, 400);
    const sort = ((await db.prepare("SELECT MAX(sort) AS m FROM series").first()).m || 0) + 1;
    const special = String(b.special_name || "").trim().slice(0, 30) || null;
    const run = Number(b.print_run) > 0 ? Math.floor(Number(b.print_run)) : null;
    let r;
    try { r = await db.prepare("INSERT INTO series (name, status, sort, created_at, special_name, print_run) VALUES (?, 'upcoming', ?, ?, ?, ?)").bind(name, sort, t, special, run).run(); }
    catch { r = await db.prepare("INSERT INTO series (name, status, sort, created_at) VALUES (?, 'upcoming', ?, ?)").bind(name, sort, t).run(); }
    await db.prepare("INSERT INTO admin_actions (admin_id, action, note, created_at) VALUES (?, 'series_create', ?, ?)").bind(me.id, name, t).run();
    await sealSafe(env);
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (b.action === "status") {
    if (!["upcoming", "active", "retired"].includes(b.status)) return json({ error: "Unknown status." }, 400);
    const s = await db.prepare("SELECT * FROM series WHERE id = ?").bind(Number(b.id)).first();
    if (!s) return json({ error: "No such series." }, 404);
    await db.prepare("UPDATE series SET status = ?, released_at = CASE WHEN ? = 'active' AND released_at IS NULL THEN ? ELSE released_at END WHERE id = ?")
      .bind(b.status, b.status, t, s.id).run();
    await db.prepare("INSERT INTO admin_actions (admin_id, action, note, created_at) VALUES (?, 'series_status', ?, ?)")
      .bind(me.id, `Series ${s.name}: ${s.status} -> ${b.status}`, t).run();
    await sealSafe(env);
    const active = (await db.prepare("SELECT COUNT(*) AS n FROM series WHERE status = 'active'").first()).n;
    return json({ ok: true, active, warning: active > MAX_ACTIVE_SERIES ? `${active} series are active; only the newest ${MAX_ACTIVE_SERIES} show up in packs.` : null });
  }
  if (b.action === "print_run") {
    const sr = (await seriesPrinted(env)).find((x) => x.id === Number(b.id));
    if (!sr) return json({ error: "No such series." }, 404);
    const run = Math.floor(Number(b.print_run));
    if (!(run > 0)) return json({ error: "Give it a number of copies." }, 400);
    if (run < sr.printed) return json({ error: `Series ${sr.name} has already printed ${sr.printed}. The run can't be lower than that.` }, 400);
    await db.prepare("UPDATE series SET print_run = ? WHERE id = ?").bind(run, sr.id).run();
    await db.prepare("INSERT INTO admin_actions (admin_id, action, note, created_at) VALUES (?, 'series_run', ?, ?)")
      .bind(me.id, `Series ${sr.name}: print run ${sr.print_run ?? "none"} -> ${run}`, t).run();
    await sealSafe(env);
    return json({ ok: true, print_run: run, printed: sr.printed });
  }
  if (b.action === "special_name") {
    const name = String(b.special_name || "").trim().slice(0, 30);
    if (!name) return json({ error: "Give the special packs a name (like Gold Master)." }, 400);
    const r = await db.prepare("UPDATE series SET special_name = ? WHERE id = ?").bind(name, Number(b.id)).run();
    if (!r.meta.changes) return json({ error: "No such series." }, 404);
    return json({ ok: true });
  }
  if (b.action === "assign") {
    const d = await db.prepare("SELECT id, tier, series_id FROM designs WHERE id = ?").bind(Number(b.design_id)).first();
    if (!d) return json({ error: "No such button." }, 404);
    if (d.tier === "archive") return json({ error: "Found buttons stay outside series." }, 400);
    const sid = b.series_id ? Number(b.series_id) : null;
    if (sid && !(await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(sid).first())) return json({ error: "No such series." }, 404);
    // its copies move to the other series' print run too (v0.46.12)
    const moved = [d.series_id, sid].filter((x) => x != null);
    await db.batch([db.prepare("UPDATE designs SET series_id = ? WHERE id = ?").bind(sid, d.id), ...(moved.length ? [recountStatement(db, moved)] : [])]);
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
