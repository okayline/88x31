// POST /api/admin  (webmasters only)
//   { action: "remove_design",  design_id, note? }   leaves pulls now; copies become "removed by request"
//   { action: "restore_design", design_id }           undoes a removal
//   { action: "registry_sync" }                       mirror into the shared item registry now (lib/registry.js)
//   { action: "block_uploader",   name, remove_uploads?: bool }   stops them adding buttons
//   { action: "unblock_uploader", name }
//   { action: "delete_player", name, confirm }      deletes a player's account (confirm = their name again);
//     same routine as "Delete My Account" (lib/accounts.js). Webmasters and bots can't be deleted.
//   { action: "give_packs", name | everyone: true, count: 1-10, series_id?, special?, kind?: "single"|"welcome", note? }   sealed packs (keep 2; a Single keeps its 1);
//     special packs are numbered per series (#7 of 25) and never go to bots
// GET /api/admin?view=new_players  (webmasters only) -> { players: [{ name, created_at, came_from, joined_via,
//   buttons, signed, trades }] }  the newest 30 real players (no bots, no webmasters)
// Every action is written to admin_actions and sealed into the ledger (no images, just what and when).
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { userByName, seriesPrinted } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { givePacks, everyoneIds, specialRun } from "../../lib/packs.js";
import { deleteAccount } from "../../lib/accounts.js";
import { syncRegistry } from "../../lib/registry.js";

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

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me || !me.is_admin) return json({ error: "Webmasters only." }, 403);
  if (new URL(request.url).searchParams.get("view") !== "new_players") return json({ error: "Unknown view." }, 400);
  const stats = `(SELECT COUNT(*) FROM instances i WHERE i.owner_id = u.id AND i.consumed = 0) AS buttons,
       (SELECT COUNT(*) FROM guestbook_entries g WHERE g.author_id = u.id) AS signed,
       (SELECT COUNT(*) FROM trades t WHERE (t.from_user = u.id OR t.to_user = u.id) AND t.status = 'accepted') AS trades`;
  const tail = "FROM users u WHERE u.is_bot = 0 AND u.is_admin = 0 ORDER BY u.created_at DESC, u.id DESC LIMIT 30";
  let rows;
  try {
    rows = (await env.DB.prepare(`SELECT u.name, u.created_at, u.came_from, u.joined_via, ${stats} ${tail}`).all()).results;
  } catch {
    // before migration 022: no came_from / joined_via yet
    rows = (await env.DB.prepare(`SELECT u.name, u.created_at, NULL AS came_from, NULL AS joined_via, ${stats} ${tail}`).all()).results;
  }
  return json({ players: rows });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me || !me.is_admin) return json({ error: "Webmasters only." }, 403);
  const body = await readJson(request);
  const note = String(body.note || "").trim().slice(0, 200) || null;
  const t = now();
  const db = env.DB;

  // Mirror into the shared item registry now (it also runs on its own after page loads). Bigger pass than the background one.
  if (body.action === "registry_sync") return json(await syncRegistry(env, { budget: 120, full: true }));

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

  if (body.action === "delete_player") {
    const u = await userByName(env, body.name);
    if (!u) return json({ error: "No player by that name." }, 404);
    if (String(body.confirm || "").trim().toLowerCase() !== u.name.toLowerCase()) return json({ error: "Type their name exactly to confirm." }, 400);
    if (u.id === me.id || u.is_admin) return json({ error: "Webmaster accounts can't be deleted here." }, 400);
    if (u.is_bot) return json({ error: "The bots live here! They can't be deleted." }, 400);
    // on the Ledger first (by id, never the name), then the account goes
    await db.prepare("INSERT INTO admin_actions (admin_id, action, user_id, note, created_at) VALUES (?, 'delete_player', ?, ?, ?)")
      .bind(me.id, u.id, note, t).run();
    const r = await deleteAccount(env, u.id);
    await sealSafe(env);
    return r.ok ? json({ ok: true }) : json(r, 400);
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
    const special = !!body.special;
    // (v0.37) kind: "single" (a one-card ~*~cLuB~*~ Single) or "welcome" (a Welcome pack, keep 2), never with a series
    const kind = ["single", "welcome"].includes(body.kind) ? body.kind : null;
    if (kind && (series || special)) return json({ error: "Singles and Welcome packs don't belong to a series." }, 400);
    if (special && !series) return json({ error: "Special packs belong to a series. Pick one!" }, 400);
    if (series) {
      const sr = (await seriesPrinted(env)).find((x) => x.id === series);
      if (!sr) return json({ error: "No such series." }, 400);
      if (sr.out_of_print) return json({ error: `Series ${sr.name} is out of print, so no new packs of it.` }, 400);
    }
    // the numbered special packs are for people: "everyone" skips the bots
    if (special && who && (await db.prepare("SELECT is_bot FROM users WHERE id = ?").bind(who).first()).is_bot) return json({ error: "Limited packs are for people, not bots!" }, 400);
    if (special && body.everyone) ids = (await db.prepare("SELECT id FROM users WHERE is_bot = 0").all()).results.map((r) => r.id);
    let made, label = "";
    try {
      made = await givePacks(env, ids, count, kind === "single" ? { source: "webmaster", note, cards: 1, keep: 1 }
        : kind === "welcome" ? { source: "welcome", note: note || "welcome to the cLuB!", keep: 2 }
        : { series, source: "webmaster", note, special });
    }
    catch (e) { return json({ error: e.message }, 400); }
    if (special) { const run = await specialRun(env, series); label = ` ${run.series} ${run.name}`; }
    else if (kind) label = kind === "single" ? " ~*~cLuB~*~ Single" : " Welcome";
    await db.prepare("INSERT INTO admin_actions (admin_id, action, user_id, note, created_at) VALUES (?, 'give_packs', ?, ?, ?)")
      .bind(me.id, who, `${made}${label} pack${made === 1 ? "" : "s"}${body.everyone ? " to everyone" : ""}${note ? ": " + note : ""}`, t).run();
    await sealSafe(env);
    return json({ ok: true, made });
  }

  return json({ error: "Unknown action." }, 400);
}
