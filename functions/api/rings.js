// Ring admin (v0.38; webmasters only). Players can't make rings: the webmaster makes them and decides who is in them.
// (Players who are in no ring still get a default "cLuB Ring" with a free seat the first time they open the Theme Wall; see
// lib/themewall.js. Those show up here too, marked "auto", and can be renamed, emptied or closed like any other.)
//
// GET  /api/rings -> { week, rings: [{ id, name, is_default, members: [{ id, name }], wall: { slots, size, pins } | null }] }
//      wall = this week's wall if someone has opened it yet (its size is fixed then: members + 2 spare spots)
// POST /api/rings { action: "create", name }
//      { action: "rename", ring, name }
//      { action: "visibility", ring, private }   hide a ring from everyone who isn't in it (the bot rings start hidden)
//      { action: "delete", ring, confirm }      confirm = the ring's name again; its walls go (locked ones are sealed in the ledger first)
//      { action: "add", ring, name }            a player by name (bots too); a player can be in any number of rings
//      { action: "remove", ring, name }         their seat empties and their button comes down from this week's open wall
// Ring upkeep is NOT written to the ledger (webmaster's choice); only a locked wall's snapshot is sealed there.
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { userByName } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";
import { weekOf, lockEndedWalls, privateIds, setPrivate } from "../../lib/themewall.js";

const NAME_MAX = 40;

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me || !me.is_admin) return json({ error: "Webmasters only." }, 403);
  const week = weekOf();
  await lockEndedWalls(env);
  const { results: rings } = await env.DB.prepare("SELECT id, name, is_default FROM rings ORDER BY is_default, id").all();
  const { results: seats } = await env.DB.prepare(
    `SELECT m.ring_id, u.id, u.name FROM ring_members m JOIN users u ON u.id = m.user_id ORDER BY m.ring_id, m.position`
  ).all();
  const { results: walls } = await env.DB.prepare(
    `SELECT w.ring_id, w.slots, w.size, (SELECT COUNT(*) FROM wall_pins p WHERE p.wall_id = w.id) AS pins
     FROM ring_walls w WHERE w.week = ?`
  ).bind(week).all();
  const hidden = await privateIds(env);
  return json({
    week,
    rings: rings.map((r) => ({
      ...r, private: hidden.includes(r.id),
      members: seats.filter((s) => s.ring_id === r.id).map(({ id, name }) => ({ id, name })),
      wall: walls.find((w) => w.ring_id === r.id) || null,
    })),
  });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me || !me.is_admin) return json({ error: "Webmasters only." }, 403);
  const body = await readJson(request);
  const db = env.DB, t = now();
  const cleanName = () => String(body.name || "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

  if (body.action === "create") {
    const name = cleanName();
    if (!name) return json({ error: "Give the ring a name." }, 400);
    const made = await db.prepare("INSERT INTO rings (name, owner_id, created_at, is_default) VALUES (?, ?, ?, 0)").bind(name, me.id, t).run();
    return json({ ok: true, id: made.meta.last_row_id });
  }

  const ring = await db.prepare("SELECT id, name FROM rings WHERE id = ?").bind(Number(body.ring)).first();
  if (!ring) return json({ error: "No such ring." }, 404);

  if (body.action === "rename") {
    const name = cleanName();
    if (!name) return json({ error: "Give the ring a name." }, 400);
    await db.prepare("UPDATE rings SET name = ? WHERE id = ?").bind(name, ring.id).run();
    return json({ ok: true });
  }

  if (body.action === "visibility") {   // { ring, private: true|false }: private rings are seen only by their members and webmasters
    await setPrivate(env, ring.id, !!body.private);
    return json({ ok: true });
  }

  if (body.action === "delete") {
    if (String(body.confirm || "").trim() !== ring.name) return json({ error: "Type the ring's name exactly to confirm." }, 400);
    await sealSafe(env);   // locks and seals any finished walls first, so their snapshots are in the ledger before the ring goes
    await db.prepare("DELETE FROM rings WHERE id = ?").bind(ring.id).run();   // seats, walls and pins go with it
    return json({ ok: true });
  }

  if (body.action === "add" || body.action === "remove") {
    const u = await userByName(env, body.name);
    if (!u) return json({ error: "No player by that name." }, 404);
    const seated = await db.prepare("SELECT position FROM ring_members WHERE ring_id = ? AND user_id = ?").bind(ring.id, u.id).first();
    if (body.action === "add") {
      if (seated) return json({ error: `${u.name} is already in that ring.` }, 400);
      await db.prepare(
        `INSERT INTO ring_members (ring_id, position, user_id)
         SELECT ?, COALESCE(MAX(position), 0) + 1, ? FROM ring_members WHERE ring_id = ?`
      ).bind(ring.id, u.id, ring.id).run();
    } else {
      if (!seated) return json({ error: `${u.name} isn't in that ring.` }, 400);
      await lockEndedWalls(env, t);
      await db.batch([
        db.prepare("UPDATE ring_members SET user_id = NULL WHERE ring_id = ? AND user_id = ?").bind(ring.id, u.id),
        db.prepare("DELETE FROM wall_pins WHERE user_id = ? AND wall_id IN (SELECT id FROM ring_walls WHERE ring_id = ? AND locked_at IS NULL)").bind(u.id, ring.id),
      ]);
    }
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
