// Series of the cLuB's original buttons.
// GET  /api/series        -> { series: [{ id, name, status, buttons? }] }  (upcoming ones only for webmasters)
// GET  /api/series?id=N   -> { series, designs: [...] }                   (webmasters: what's in it)
// POST /api/series (webmasters)
//   { action: "create", name }                    a new series, upcoming (hidden, not in packs)
//   { action: "status", id, status }              upcoming | active | retired
//   { action: "assign", design_id, series_id }    put a cLuB original into a series
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { MAX_ACTIVE_SERIES } from "../../lib/game.js";

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
  const list = results.filter((s) => s.status !== "upcoming" || admin);
  if (admin) {
    // cLuB originals not in any series yet (to put into one)
    const loose = (await env.DB.prepare(
      "SELECT id, name, rarity FROM designs WHERE series_id IS NULL AND tier != 'archive' AND status IN ('active', 'reward', 'frozen') ORDER BY id DESC LIMIT 100"
    ).all()).results;
    return json({ series: list, loose, max_active: MAX_ACTIVE_SERIES });
  }
  return json({ series: list.map(({ id, name, status }) => ({ id, name, status })) });
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
    const r = await db.prepare("INSERT INTO series (name, status, sort, created_at) VALUES (?, 'upcoming', ?, ?)").bind(name, sort, t).run();
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
  if (b.action === "assign") {
    const d = await db.prepare("SELECT id, tier FROM designs WHERE id = ?").bind(Number(b.design_id)).first();
    if (!d) return json({ error: "No such button." }, 404);
    if (d.tier === "archive") return json({ error: "Found buttons stay outside series." }, 400);
    const sid = b.series_id ? Number(b.series_id) : null;
    if (sid && !(await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(sid).first())) return json({ error: "No such series." }, 404);
    await db.prepare("UPDATE designs SET series_id = ? WHERE id = ?").bind(sid, d.id).run();
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
