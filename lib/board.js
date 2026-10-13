// The request board and open trades.
//
// Requests: "I wish I had X" for a common or uncommon (rares and up are trade-only, ultras never).
//   Anyone with a matching copy can fill it: the copy goes to the requester and the filler gets a
//   sealed pack from the cLuB (max REQUEST_PACKS_PER_DAY a day). Max MAX_OPEN per player, expire
//   after BOARD_DAYS. Posting is sealed into the ledger (kind 'request').
// Open trades (v0.23) were taken out in v0.28. Any still open are cancelled by expireBoard and their
//   offered copies unlocked; their history (reason 'open_trade') stays in travel logs and the ledger.
import { now } from "./auth.js";
import { newLockToken } from "./game.js";
import { givePacks } from "./packs.js";

export const BOARD_DAYS = 7;
export const MAX_OPEN = 3;
export const REQUEST_PACKS_PER_DAY = 1;
const REQUESTABLE = ["common", "uncommon"];
const dayStart = () => { const t = now(); return t - (t % 86400); }; // UTC day

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => n > 0))];

// Expire old requests, and close any open trades left from before they were taken out (unlocking
// the offered copies). Cheap; call before reading.
export async function expireBoard(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE requests SET status = 'expired', resolved_at = ? WHERE status = 'open' AND expires_at <= ?").bind(t, t),
    env.DB.prepare("UPDATE instances SET locked = 0 WHERE locked IN (SELECT lock_token FROM open_trades WHERE status = 'open')"),
    env.DB.prepare("UPDATE open_trades SET status = 'cancelled', resolved_at = ? WHERE status = 'open'").bind(t),
  ]);
}

async function validFoil(env, foil) {
  if (!foil) return true;
  return !!(await env.DB.prepare("SELECT 1 FROM foils WHERE id = ? AND kind = 'foil'").bind(foil).first());
}

// ---------- requests ----------

export async function postRequest(env, userId, designId, foil = null) {
  const d = await env.DB.prepare(
    "SELECT d.id, d.rarity, CASE WHEN s.status = 'upcoming' THEN 'removed' ELSE d.status END AS status FROM designs d LEFT JOIN series s ON s.id = d.series_id WHERE d.id = ?"
  ).bind(designId).first();
  if (!d || d.status === "removed") return { error: "No such button." };
  if (!REQUESTABLE.includes(d.rarity)) return { error: "Only commons and uncommons can be requested. Rarer ones are trade-only!" };
  if (!(await validFoil(env, foil))) return { error: "No such foil." };
  const open = (await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE user_id = ? AND status = 'open'").bind(userId).first()).n;
  if (open >= MAX_OPEN) return { error: `You can have ${MAX_OPEN} requests open at once.` };
  const dup = await env.DB.prepare("SELECT 1 FROM requests WHERE user_id = ? AND design_id = ? AND status = 'open'").bind(userId, designId).first();
  if (dup) return { error: "You already have a request up for that one." };
  const t = now();
  const r = await env.DB.prepare(
    "INSERT INTO requests (user_id, design_id, foil, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(userId, designId, foil || null, t, t + BOARD_DAYS * 86400).run();
  return { ok: true, id: r.meta.last_row_id };
}

export async function cancelRequest(env, userId, reqId) {
  const r = await env.DB.prepare("UPDATE requests SET status = 'cancelled', resolved_at = ? WHERE id = ? AND user_id = ? AND status = 'open'")
    .bind(now(), reqId, userId).run();
  return r.meta.changes ? { ok: true } : { error: "That request isn't open." };
}

// Fill a request with one of your copies. Returns { ok, pack: bool } or { error }.
export async function fillRequest(env, userId, reqId, instanceId) {
  const db = env.DB;
  await expireBoard(env);
  const rq = await db.prepare("SELECT * FROM requests WHERE id = ?").bind(reqId).first();
  if (!rq || rq.status !== "open") return { error: "That request isn't open anymore." };
  if (rq.user_id === userId) return { error: "That's your own request!" };
  const c = await db.prepare("SELECT id, design_id, foil, owner_id, locked, consumed FROM instances WHERE id = ?").bind(instanceId).first();
  if (!c || c.owner_id !== userId || c.consumed) return { error: "That copy isn't yours." };
  if (c.locked) return { error: "That copy is busy in a trade." };
  if (c.design_id !== rq.design_id || (rq.foil && c.foil !== rq.foil)) return { error: "That copy doesn't match the request." };
  const t = now(), token = newLockToken();
  const res = await db.batch([
    db.prepare("UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0").bind(token, c.id, userId),
    db.prepare(
      `UPDATE requests SET status = 'filled', filled_by = ?, instance_id = ?, resolved_at = ?
       WHERE id = ? AND status = 'open' AND EXISTS (SELECT 1 FROM instances WHERE id = ? AND locked = ?)`
    ).bind(userId, c.id, t, rq.id, c.id, token),
    db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT ?, ?, ?, 'request', ?, ? WHERE EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = 'filled' AND instance_id = ?)`
    ).bind(c.id, userId, rq.user_id, rq.id, t, rq.id, c.id),
    db.prepare(
      `UPDATE instances SET owner_id = ?, locked = 0 WHERE id = ? AND locked = ?
         AND EXISTS (SELECT 1 FROM requests WHERE id = ? AND status = 'filled' AND instance_id = ?)`
    ).bind(rq.user_id, c.id, token, rq.id, c.id),
    db.prepare("DELETE FROM wall_slots WHERE instance_id = ? AND user_id = ?").bind(c.id, userId),
    db.prepare("UPDATE instances SET locked = 0 WHERE id = ? AND locked = ?").bind(c.id, token),
  ]);
  if (!res[1].meta.changes) return { error: "Someone beat you to it!" };
  // the thank-you pack, at most REQUEST_PACKS_PER_DAY a day
  const today = (await db.prepare(
    "SELECT COUNT(*) AS n FROM packs p JOIN pack_history h ON h.pack_id = p.id AND h.reason = 'made' WHERE h.to_user = ? AND p.source = 'request' AND p.created_at >= ?"
  ).bind(userId, dayStart()).first()).n;
  let pack = false;
  if (today < REQUEST_PACKS_PER_DAY) {
    const who = await db.prepare("SELECT name FROM users WHERE id = ?").bind(rq.user_id).first();
    await givePacks(env, [userId], 1, { source: "request", note: `thanks for helping ${who ? who.name : "a player"}!` });
    pack = true;
  }
  return { ok: true, pack };
}

// ---------- open trades ----------

// ---------- reading the board ----------

const FIN = "i.foil, i.foil_seed, i.pattern, i.effect";

export async function boardFor(env, viewerId = null) {
  const db = env.DB;
  const { results: requests } = await db.prepare(
    `SELECT r.id, r.user_id, u.name AS user, u.is_bot, r.design_id, d.name, d.image_key, d.rarity, r.foil, r.created_at, r.expires_at
     FROM requests r JOIN users u ON u.id = r.user_id JOIN designs d ON d.id = r.design_id
     WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 60`
  ).all();
  // which of my copies could fill each request
  if (viewerId) {
    const { results: mine } = await db.prepare(
      `SELECT i.id, i.edition, i.design_id, ${FIN} FROM instances i WHERE i.owner_id = ? AND i.consumed = 0 AND i.locked = 0`
    ).bind(viewerId).all();
    const match = (designId, foil) => mine.filter((c) => c.design_id === designId && (!foil || c.foil === foil))
      .sort((a, b) => (a.foil === "clear" ? -1 : 0) - (b.foil === "clear" ? -1 : 0) || b.edition - a.edition);
    for (const r of requests) if (r.user_id !== viewerId) r.can_fill = match(r.design_id, r.foil);
  }
  return { requests };
}

// Open requests of one player (the "Wanted" line on their page).
export async function wantedOf(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, d.name, r.foil FROM requests r JOIN designs d ON d.id = r.design_id
     WHERE r.user_id = ? AND r.status = 'open' ORDER BY r.created_at`
  ).bind(userId).all();
  return results;
}
