// POST /api/admin  (webmasters only)
//   { action: "remove_design",  design_id, note? }   leaves pulls now; copies become "removed by request"
//   { action: "restore_design", design_id }           undoes a removal
//   { action: "block_uploader",   name, remove_uploads?: bool }   stops them adding buttons
//   { action: "unblock_uploader", name }
//   { action: "give_packs", name | everyone: true, count: 1-10, series_id?, note? }   sealed packs (keep 2)
// Every action is written to admin_actions and sealed into the ledger (no images, just what and when).
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { givePacks, everyoneIds } from "../../lib/packs.js";

const TOMBSTONE = "banners/removed.gif";

function removeStatements(env, adminId, designId, note, t) {
  return [
    env.DB.prepare(
      `UPDATE designs SET original_image_key = image_key, image_key = ?, status = 'removed'
       WHERE id = ? AND status != 'removed'`
    ).bind(TOMBSTONE, designId),
    env.DB.prepare(
      `INSERT INTO admin_actions (admin_id, action, design_id, note, created_at)
       SELECT ?, 'remove_design', ?, ?, ? WHERE changes() = 1`
    ).bind(adminId, designId, note, t),
  ];
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me || !me.is_admin) return json({ error: "Webmasters only." }, 403);
  const body = await readJson(request);
  const note = String(body.note || "").trim().slice(0, 200) || null;
  const t = now();
  const db = env.DB;

  if (body.action === "remove_design" || body.action === "restore_design") {
    const id = Number(body.design_id);
    const d = await db.prepare("SELECT id, name, status, original_image_key, stats FROM designs WHERE id = ?").bind(id).first();
    if (!d) return json({ error: "No such button." }, 404);
    if (body.action === "remove_design") {
      if (d.status === "removed") return json({ error: "Already removed." }, 400);
      await db.batch(removeStatements(env, me.id, id, note, t));
    } else {
      if (d.status !== "removed") return json({ error: "That button isn't removed." }, 400);
      // old baked-in holo designs go back to frozen; everything else back in play
      const back = (d.stats || "").includes('"variant": "Holo"') ? "frozen" : "active";
      await db.batch([
        db.prepare(
          `UPDATE designs SET image_key = COALESCE(original_image_key, image_key), original_image_key = NULL, status = ?
           WHERE id = ? AND status = 'removed'`
        ).bind(back, id),
        db.prepare(
          `INSERT INTO admin_actions (admin_id, action, design_id, note, created_at)
           SELECT ?, 'restore_design', ?, ?, ? WHERE changes() = 1`
        ).bind(me.id, id, note, t),
      ]);
    }
    await sealSafe(env);
    return json({ ok: true });
  }

  if (body.action === "block_uploader" || body.action === "unblock_uploader") {
    const u = await userByName(env, body.name);
    if (!u) return json({ error: "No player by that name." }, 404);
    if (u.id === me.id) return json({ error: "You can't block yourself!" }, 400);
    const block = body.action === "block_uploader";
    const stmts = [
      db.prepare("UPDATE users SET upload_blocked = ? WHERE id = ?").bind(block ? 1 : 0, u.id),
      db.prepare("INSERT INTO admin_actions (admin_id, action, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(me.id, body.action, u.id, note, t),
    ];
    let removed = 0;
    if (block && body.remove_uploads) {
      const { results } = await db.prepare(
        "SELECT id FROM designs WHERE found_by = ? AND tier = 'archive' AND status != 'removed'"
      ).bind(u.id).all();
      for (const d of results) stmts.push(...removeStatements(env, me.id, d.id, note || `uploads by ${u.name} removed`, t));
      removed = results.length;
    }
    await db.batch(stmts);
    await sealSafe(env);
    return json({ ok: true, removed });
  }

  if (body.action === "give_packs") {
    const count = Math.max(1, Math.min(10, Number(body.count) || 1));
    let ids, who = null;
    if (body.everyone || String(body.name || "").trim().toLowerCase() === "everyone") { body.everyone = true; ids = await everyoneIds(env); }
    else {
      const u = await userByName(env, body.name);
      if (!u) return json({ error: "No player by that name." }, 404);
      ids = [u.id]; who = u.id;
    }
    let series = body.series_id ? Number(body.series_id) : null;
    if (series && !(await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(series).first())) return json({ error: "No such series." }, 400);
    const special = !!body.special;
    const made = await givePacks(env, ids, count, { series, source: "webmaster", note, special });
    await db.prepare("INSERT INTO admin_actions (admin_id, action, user_id, note, created_at) VALUES (?, 'give_packs', ?, ?, ?)")
      .bind(me.id, who, `${made}${special ? " special" : ""} pack${made === 1 ? "" : "s"}${body.everyone ? " to everyone" : ""}${note ? ": " + note : ""}`, t).run();
    await sealSafe(env);
    return json({ ok: true, made });
  }

  return json({ error: "Unknown action." }, 400);
}
