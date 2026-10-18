// The Theme Wall (v0.38; see lib/themewall.js).
//
// GET  /api/themewall?ring=ID&week=N
//   -> { week, week_start, week_end, theme, now, rings: [{ id, name, is_default, members }], ring,
//        wall: { id, week, theme, size, slots, locked, locked_at, editable, pins: [...] },
//        members: [{ id, name, pinned }] }
//   Your ring (a default "cLuB Ring" is made for you the first time) and its wall for this week, or an earlier locked week.
//   Everyone in a ring sees every pin on its wall, whether or not they have met the button (looking uncovers it, like
//   visiting someone's page). Members only.
// POST /api/themewall { action: "pin", ring, instance?, x?, y? }  put your button up, or move it (keeps its button if no instance)
//      /api/themewall { action: "unpin", ring }                    take your button down and free your spot
//   -> { ok, x, y, instance_id }   x/y are where it really landed (a drop on top of someone else lands in the nearest free spot).
//   Only on this week's wall, only your own pin, only a button you own that isn't in a trade or away.
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { markSeen } from "../../lib/progress.js";
import {
  weekOf, weekStart, weekEnd, themeFor, myRings, pickRing, ensureDefaultRing, ensureWall, allRings, ringById, privateIds, wallPins, lockEndedWalls, placePin, BTN_W, BTN_H,
} from "../../lib/themewall.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to see your ring's Theme Wall." }, 401);
  if (me.is_bot) return json({ error: "Bots don't build Theme Walls yet." }, 403);
  const params = new URL(request.url).searchParams;
  if (params.get("list")) return json({ rings: await allRings(env, me.id, !!me.is_admin) });   // footer webring links: no side effects
  const t = now(), cur = weekOf(t);
  await lockEndedWalls(env, t);
  await ensureDefaultRing(env, me);
  let { rings, ring } = await pickRing(env, me.id, params.get("ring"));
  // Rings are public: any player can look at any ring's wall, they just can't pin on it unless they're in it.
  let guest = false;
  if (!ring && params.get("ring")) { ring = await ringById(env, params.get("ring")); guest = !!ring; }
  if (guest && !me.is_admin && (await privateIds(env)).includes(ring.id)) ring = null;   // private rings are for their members
  if (!ring) return json({ error: "No such ring." }, 404);

  const week = params.get("week") === null ? cur : Number(params.get("week"));
  if (!Number.isInteger(week) || week > cur) return json({ error: "That week hasn't happened yet." }, 400);
  const wall = week === cur ? await ensureWall(env, ring, week)
    : await env.DB.prepare("SELECT * FROM ring_walls WHERE ring_id = ? AND week = ?").bind(ring.id, week).first();
  if (!wall) return json({ error: "That ring had no wall that week." }, 404);

  const pins = await wallPins(env, wall, me.id);
  if (!guest) await markSeen(env, me, pins.map((p) => p.copy && p.copy.design_id));
  const { results: members } = await env.DB.prepare(
    `SELECT u.id, u.name FROM ring_members m JOIN users u ON u.id = m.user_id WHERE m.ring_id = ? ORDER BY m.position`
  ).bind(ring.id).all();
  const pinnedBy = new Set(pins.map((p) => p.user_id));
  return json({
    week: cur, week_start: weekStart(cur), week_end: weekEnd(cur), theme: themeFor(cur), now: t,
    rings, ring, guest, all_rings: await allRings(env, me.id, !!me.is_admin),
    wall: { id: wall.id, week: wall.week, theme: wall.theme, size: wall.size, slots: wall.slots,
      locked: !!wall.locked_at, locked_at: wall.locked_at, editable: !guest && !wall.locked_at && wall.week === cur, pins },
    members: members.map((m) => ({ id: m.id, name: m.name, pinned: pinnedBy.has(m.id) })),
  });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  if (me.is_bot) return json({ error: "Bots don't build Theme Walls yet." }, 403);
  const body = await readJson(request);
  const t = now();
  await lockEndedWalls(env, t);
  const { ring } = await pickRing(env, me.id, body.ring);
  if (!ring) return json({ error: "You're not in that ring." }, 403);
  const wall = await ensureWall(env, ring, weekOf(t));
  if (wall.locked_at) return json({ error: "This week's wall is locked." }, 409);
  const db = env.DB;

  if (body.action === "unpin") {
    await db.prepare("DELETE FROM wall_pins WHERE wall_id = ? AND user_id = ?").bind(wall.id, me.id).run();
    return json({ ok: true });
  }
  if (body.action !== "pin") return json({ error: "Unknown action." }, 400);

  const mine = await db.prepare("SELECT instance_id, x, y FROM wall_pins WHERE wall_id = ? AND user_id = ?").bind(wall.id, me.id).first();
  let instance = mine ? mine.instance_id : null;
  if (body.instance !== undefined && body.instance !== null) {
    const id = Number(body.instance);
    const ok = Number.isInteger(id) && await db.prepare(
      "SELECT id FROM instances WHERE id = ? AND owner_id = ? AND consumed = 0 AND locked = 0"
    ).bind(id, me.id).first();
    if (!ok) return json({ error: "You can only put up a button you own that isn't in a trade or away." }, 400);
    instance = id;
  }
  if (!mine && !instance) return json({ error: "Pick a button to put up." }, 400);

  const centre = { x: (wall.size - BTN_W) / 2, y: (wall.size - BTN_H) / 2 };
  const want = {
    x: Number.isFinite(Number(body.x)) && body.x !== undefined && body.x !== null ? Number(body.x) : mine ? mine.x : centre.x,
    y: Number.isFinite(Number(body.y)) && body.y !== undefined && body.y !== null ? Number(body.y) : mine ? mine.y : centre.y,
  };
  const { results: others } = await db.prepare("SELECT x, y FROM wall_pins WHERE wall_id = ? AND user_id != ?").bind(wall.id, me.id).all();
  const spot = placePin(wall.size, others, want);
  if (!spot) return json({ error: "The wall is full." }, 409);
  await db.prepare(
    `INSERT INTO wall_pins (wall_id, user_id, instance_id, x, y, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (wall_id, user_id) DO UPDATE SET instance_id = excluded.instance_id, x = excluded.x, y = excluded.y, updated_at = excluded.updated_at`
  ).bind(wall.id, me.id, instance, spot.x, spot.y, t).run();
  return json({ ok: true, x: spot.x, y: spot.y, instance_id: instance });
}
