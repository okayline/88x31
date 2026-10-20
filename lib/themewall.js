// The Theme Wall (v0.38). Every week a theme (one design Type) is announced. Each ring builds one wall: every member
// pins ONE button on it, anywhere they like. A pin is only a pointer: the button never leaves the owner's collection.
// At the Monday 00:00 UTC rollover the wall is locked and its snapshot is sealed into the ledger (kind 'wall').
// No scoring, no ranking.
//
// A pin is checked when the wall is DRAWN, not when a button changes hands: if the copy is no longer the member's
// (traded, gifted, fused, traded in), is used up, or is away in another game, its spot draws empty and the x/y stay
// reserved for that member. Nothing else in the game has to know pins exist.
import { now } from "./auth.js";

export const TYPES = ["neon", "webring", "guestbook", "counter", "construction", "divider"];  // `found` is a catch-all, never a theme
export const WEEK = 604800;
export const MONDAY0 = 345600;      // Mon Jan 5 1970 00:00 UTC, in seconds: where week 0 starts
export const BTN_W = 88, BTN_H = 31;
export const GRID = 5;              // the page snaps to this; the server accepts any pixel (edge snapping lands off-grid)
export const DEFAULT_RING_SIZE = 8; // players per default "cLuB Ring"
export const EXTRA_SLOTS = 2;       // spare spots on every wall, for late joiners

// ---------- weeks (UTC, like the daily packs and streaks) ----------

export const weekOf = (t = now()) => Math.floor((t - MONDAY0) / WEEK);
export const weekStart = (w) => w * WEEK + MONDAY0;
export const weekEnd = (w) => weekStart(w + 1);

// ---------- the weekly theme ----------
// Random, but the same for every ring and never the same two weeks running: the six Types are shuffled (seeded by the
// cycle number) and played in that order, a new shuffle every six weeks. If a new cycle would open with last cycle's
// last Type, its first two swap. Nothing is stored, so there is no table to keep in step; the wall keeps its own copy.

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(cycle) {
  const r = rng(Math.imul(cycle + 1, 2654435761)), a = TYPES.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function themeFor(week) {
  const n = TYPES.length, cycle = Math.floor(week / n), order = shuffled(cycle);
  if (shuffled(cycle - 1)[n - 1] === order[0]) [order[0], order[1]] = [order[1], order[0]];   // the swap never touches the last place
  return order[week - cycle * n];
}

// A button matches the theme when its Type is the theme, or it is a `found` button (found is a catch-all).
export const matches = (type, theme) => type === theme || type === "found";

// ---------- canvas ----------
// One fixed size for every wall in every ring (v0.39): 335 px wide. v0.46.5: and 168 tall (half), which still fits 3 across and
// 5 down, 15 spots for the 10 a wall needs. It no longer depends on the ring's size, so nothing is worked out when a wall is made.
// A wall keeps the shape it was made with: `size` is the width, and `height` is NULL for the square walls made before v0.46.5
// (and before v0.39 they had other sizes).
export const WALL_SIZE = 335, WALL_HEIGHT = 168, WALL_SLOTS = 10;
export function canvasSize() { return { slots: WALL_SLOTS, size: WALL_SIZE, height: WALL_HEIGHT }; }
export const wallHeight = (w) => w.height ?? w.size;

// ---------- placing a pin ----------
// Fixed size, no rotation. Two pins overlap when they are closer than a button's width AND height.
export const overlaps = (a, b) => Math.abs(a.x - b.x) < BTN_W && Math.abs(a.y - b.y) < BTN_H;
const inBounds = (p, size, height) => p.x >= 0 && p.y >= 0 && p.x + BTN_W <= size && p.y + BTN_H <= height;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Where a pin dropped at `want` lands: right there if free, else the nearest free spot (grid spots, and spots flush against
// the other pins), else null (the wall is full). `others` are every other member's pin, empty spots included.
export function placePin(size, others, want, height = size) {
  const x0 = clamp(Math.round(want.x), 0, size - BTN_W), y0 = clamp(Math.round(want.y), 0, height - BTN_H);
  const free = (p) => inBounds(p, size, height) && !others.some((o) => overlaps(p, o));
  if (free({ x: x0, y: y0 })) return { x: x0, y: y0 };
  const cands = [];
  for (let x = 0; x <= size - BTN_W; x += GRID) for (let y = 0; y <= height - BTN_H; y += GRID) cands.push({ x, y });
  for (const o of others) {
    for (const dx of [-BTN_W, 0, BTN_W]) for (const dy of [-BTN_H, 0, BTN_H]) {
      if (!dx && !dy) continue;
      cands.push({ x: o.x + dx, y: o.y + dy }, { x: o.x + dx, y: y0 }, { x: x0, y: o.y + dy });
    }
  }
  let best = null, bd = Infinity;
  for (const c of cands) {
    if (!free(c)) continue;
    const d = (c.x - x0) ** 2 + (c.y - y0) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------- rings ----------

const MEMBERS = "(SELECT COUNT(*) FROM ring_members m WHERE m.ring_id = r.id AND m.user_id IS NOT NULL)";

// Every ring with someone in it (rings are public to look at; only members can pin). `mine` marks the viewer's own.
// Private rings (the bot rings, or any the webmaster hides) are only seen by their members and webmasters. The ids live in
// the meta table (key private_rings, a JSON list) so hiding a ring needs no migration.
export async function privateIds(env) {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'private_rings'").first();
  try { const v = JSON.parse(row ? row.value : "[]"); return Array.isArray(v) ? v.map(Number) : []; } catch { return []; }
}
export async function setPrivate(env, ringId, on) {
  const ids = new Set(await privateIds(env));
  on ? ids.add(Number(ringId)) : ids.delete(Number(ringId));
  await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('private_rings', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(JSON.stringify([...ids]), now()).run();
}

// How a ring takes new members: "open" (anyone logged in can join), "request" (they ask, the webmaster approves), or closed
// (the default: only the webmaster adds people). Stored in the meta table (ring_join: { types: {ringId: type}, requests:
// [{ring, user, at}] }) so it needs no migration.
async function joinData(env) {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'ring_join'").first();
  try { const v = JSON.parse(row ? row.value : "{}"); return { types: v.types || {}, requests: Array.isArray(v.requests) ? v.requests : [] }; }
  catch { return { types: {}, requests: [] }; }
}
async function saveJoinData(env, d) {
  await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('ring_join', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(JSON.stringify(d), now()).run();
}
export async function joinInfo(env, ringId, userId) {
  const d = await joinData(env);
  return { join_type: d.types[ringId] || "closed", requested: d.requests.some((r) => r.ring === ringId && r.user === userId) };
}
export async function setJoinType(env, ringId, type) {
  const d = await joinData(env);
  if (type === "open" || type === "request") d.types[ringId] = type; else delete d.types[ringId];
  await saveJoinData(env, d);
}
export async function ringRequests(env) { return (await joinData(env)).requests; }
export async function addRequest(env, ringId, userId) {
  const d = await joinData(env);
  if (!d.requests.some((r) => r.ring === ringId && r.user === userId)) d.requests.push({ ring: ringId, user: userId, at: now() });
  await saveJoinData(env, d);
}
export async function dropRequest(env, ringId, userId) {   // userId null: every request for the ring (and its type) goes, for a closed ring
  const d = await joinData(env);
  d.requests = d.requests.filter((r) => !(r.ring === ringId && (userId === null || r.user === userId)));
  if (userId === null) delete d.types[ringId];
  await saveJoinData(env, d);
}
// Sit a player in a ring's next free seat.
export async function seatMember(env, ringId, userId) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO ring_members (ring_id, position, user_id)
     SELECT ?, COALESCE(MAX(position), 0) + 1, ? FROM ring_members WHERE ring_id = ?`
  ).bind(ringId, userId, ringId).run();
}

export async function allRings(env, userId, isAdmin = false) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.name, r.is_default, ${MEMBERS} AS members,
            EXISTS (SELECT 1 FROM ring_members mm WHERE mm.ring_id = r.id AND mm.user_id = ?) AS mine
     FROM rings r WHERE ${MEMBERS} > 0 ORDER BY r.is_default, r.id`
  ).bind(userId).all();
  const hidden = new Set(await privateIds(env));
  return results.map((r) => ({ ...r, mine: !!r.mine })).filter((r) => r.mine || isAdmin || !hidden.has(r.id));
}

export async function ringById(env, id) {
  return env.DB.prepare(`SELECT r.id, r.name, r.is_default, ${MEMBERS} AS members FROM rings r WHERE r.id = ?`).bind(Number(id)).first();
}

export async function myRings(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.name, r.is_default, ${MEMBERS} AS members
     FROM ring_members mm JOIN rings r ON r.id = mm.ring_id WHERE mm.user_id = ? ORDER BY r.is_default, r.id`
  ).bind(userId).all();
  return results;
}

// A player in no ring goes into a default "cLuB Ring" with a free seat (the fullest one first, so rings fill up),
// or a new one. Bots don't take part yet. Default rings belong to the webmaster, so deleting a player never deletes them.
export async function ensureDefaultRing(env, user) {
  if (!user || user.is_bot) return;
  const db = env.DB;
  if ((await myRings(env, user.id)).length) return;
  let ring = await db.prepare(
    `SELECT id FROM (SELECT r.id, ${MEMBERS} AS n FROM rings r WHERE r.is_default = 1) WHERE n < ? ORDER BY n DESC, id LIMIT 1`
  ).bind(DEFAULT_RING_SIZE).first();
  if (!ring) {
    const count = (await db.prepare("SELECT COUNT(*) AS n FROM rings WHERE is_default = 1").first()).n;
    const admin = await db.prepare("SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1").first();
    const made = await db.prepare("INSERT INTO rings (name, owner_id, created_at, is_default) VALUES (?, ?, ?, 1)")
      .bind(`~*~cLuB~*~ Ring #${count + 1}`, admin ? admin.id : user.id, now()).run();
    ring = { id: made.meta.last_row_id };
  }
  await db.prepare(
    `INSERT OR IGNORE INTO ring_members (ring_id, position, user_id)
     SELECT ?, COALESCE(MAX(position), 0) + 1, ? FROM ring_members WHERE ring_id = ?`
  ).bind(ring.id, user.id, ring.id).run();
}

// The ring asked for (you must be in it), else your first.
export async function pickRing(env, userId, ringId) {
  const rings = await myRings(env, userId);
  const ring = ringId ? rings.find((r) => r.id === Number(ringId)) : rings[0];
  return { rings, ring: ring || null };
}

// ---------- walls ----------

// This week's wall for a ring, made on first look (theme from the calendar, canvas sized from the members then).
export async function ensureWall(env, ring, week) {
  const db = env.DB;
  const found = () => db.prepare("SELECT * FROM ring_walls WHERE ring_id = ? AND week = ?").bind(ring.id, week).first();
  let w = await found();
  if (w) return w;
  const { slots, size, height } = canvasSize();
  await db.prepare("INSERT OR IGNORE INTO ring_walls (ring_id, week, theme, size, height, slots, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(ring.id, week, themeFor(week), size, height, slots, now()).run();
  return found();
}

// A pin counts only while its copy is still the member's, not used up, and not away in another game (locked = -1).
const VALID = "i.id IS NOT NULL AND i.owner_id = p.user_id AND i.consumed = 0 AND i.locked != -1";
const COPY = `i.id AS copy_id, i.edition, i.foil, i.foil_seed, i.pattern, i.effect,
              d.id AS design_id, d.name AS dname, d.type, d.rarity, d.image_key, d.status`;

// Everyone's pins as the page draws them. A live wall checks each pin now; a locked wall draws its frozen snapshot.
export async function wallPins(env, wall, viewerId) {
  const db = env.DB;
  let rows;
  if (wall.locked_at) {
    const snap = wall.snapshot ? JSON.parse(wall.snapshot) : [];
    const ids = snap.map((s) => s[1]).filter(Boolean);
    const copies = new Map();
    if (ids.length) {
      const { results } = await db.prepare(
        `SELECT ${COPY} FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id IN (${ids.map(() => "?").join(",")})`
      ).bind(...ids).all();
      for (const c of results) copies.set(c.copy_id, c);
    }
    const uids = [...new Set(snap.map((s) => s[0]))];
    const names = new Map();
    if (uids.length) {
      const { results } = await db.prepare(`SELECT id, name FROM users WHERE id IN (${uids.map(() => "?").join(",")})`).bind(...uids).all();
      for (const u of results) names.set(u.id, u.name);
    }
    rows = snap.map(([uid, copy, , x, y]) => ({ user_id: uid, uname: names.get(uid) || null, x, y, ...(copy && copies.get(copy) ? copies.get(copy) : {}) }));
  } else {
    rows = (await db.prepare(
      `SELECT p.user_id, u.name AS uname, p.x, p.y, CASE WHEN ${VALID} THEN 1 ELSE 0 END AS valid, ${COPY}
       FROM wall_pins p JOIN users u ON u.id = p.user_id
       LEFT JOIN instances i ON i.id = p.instance_id LEFT JOIN designs d ON d.id = i.design_id
       WHERE p.wall_id = ? ORDER BY p.updated_at`
    ).bind(wall.id).all()).results.map((r) => (r.valid ? r : { user_id: r.user_id, uname: r.uname, x: r.x, y: r.y }));
  }
  return rows.map((r) => ({
    user_id: r.user_id, name: r.uname || "a former player", mine: r.user_id === viewerId, x: r.x, y: r.y,
    empty: !r.copy_id,
    match: !!r.copy_id && matches(r.type, wall.theme),
    copy: r.copy_id ? {
      id: r.copy_id, edition: r.edition, design_id: r.design_id, type: r.type, rarity: r.rarity,
      name: r.status === "removed" ? "a removed button" : r.dname, image_key: r.image_key,
      foil: r.foil, foil_seed: r.foil_seed, pattern: r.pattern, effect: r.effect,
    } : null,
  }));
}

// Lock every wall whose week is over: freeze what is showing into the snapshot and stamp the rollover moment.
// Cheap when there is nothing to do, so it runs on every page load (/api/me), the ledger and the wall itself.
// A wall nobody put a button on is locked but has no snapshot, so it is never sealed into the ledger.
export async function lockEndedWalls(env, t = now()) {
  const db = env.DB;
  const { results: ended } = await db.prepare("SELECT id, week FROM ring_walls WHERE locked_at IS NULL AND week < ? LIMIT 50").bind(weekOf(t)).all();
  for (const w of ended) {
    const { results: pins } = await db.prepare(
      `SELECT p.user_id, p.x, p.y, i.id AS copy_id, i.design_id, CASE WHEN ${VALID} THEN 1 ELSE 0 END AS valid
       FROM wall_pins p LEFT JOIN instances i ON i.id = p.instance_id WHERE p.wall_id = ? ORDER BY p.updated_at`
    ).bind(w.id).all();
    const snap = pins.map((p) => (p.valid ? [p.user_id, p.copy_id, p.design_id, p.x, p.y] : [p.user_id, null, null, p.x, p.y]));
    await db.prepare("UPDATE ring_walls SET locked_at = ?, snapshot = ? WHERE id = ? AND locked_at IS NULL")
      .bind(weekEnd(w.week), snap.some((s) => s[1]) ? JSON.stringify(snap) : null, w.id).run();
  }
  return ended.length;
}
