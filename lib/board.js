// The request board and open trades.
//
// Requests: "I wish I had X" for a common or uncommon (rares and up are trade-only, ultras never).
//   Anyone with a matching copy can fill it: the copy goes to the requester and the filler gets a
//   sealed pack from the cLuB (max REQUEST_PACKS_PER_DAY a day). Max MAX_OPEN per player, expire
//   after BOARD_DAYS. Posting is sealed into the ledger (kind 'request').
// Open trades: "I'll give these (1-3 copies) for a copy of X", anyone holding a matching copy can
//   accept. The offered copies are locked while it's open. Ultras can't be traded. Max MAX_OPEN,
//   expire after BOARD_DAYS. The swap is two normal ledger transfers (reason 'trade').
import { now } from "./auth.js";
import { newLockToken } from "./game.js";
import { givePacks } from "./packs.js";

export const BOARD_DAYS = 7;
export const MAX_OPEN = 3;
export const REQUEST_PACKS_PER_DAY = 1;
const REQUESTABLE = ["common", "uncommon"];
const dayStart = () => { const t = now(); return t - (t % 86400); }; // UTC day

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => n > 0))];

// Expire old requests and open trades (unlocking offered copies). Cheap; call before reading.
export async function expireBoard(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE requests SET status = 'expired', resolved_at = ? WHERE status = 'open' AND expires_at <= ?").bind(t, t),
    env.DB.prepare(
      "UPDATE instances SET locked = 0 WHERE locked IN (SELECT lock_token FROM open_trades WHERE status = 'open' AND expires_at <= ?)"
    ).bind(t),
    env.DB.prepare("UPDATE open_trades SET status = 'expired', resolved_at = ? WHERE status = 'open' AND expires_at <= ?").bind(t, t),
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

export async function postOpenTrade(env, userId, giveList, designId, foil = null, message = "") {
  const db = env.DB;
  const give = ids(giveList);
  if (!give.length || give.length > 3) return { error: "Offer 1 to 3 of your buttons." };
  const d = await db.prepare(
    "SELECT d.id, d.rarity, CASE WHEN s.status = 'upcoming' THEN 'removed' ELSE d.status END AS status FROM designs d LEFT JOIN series s ON s.id = d.series_id WHERE d.id = ?"
  ).bind(designId).first();
  if (!d || d.status === "removed") return { error: "No such button." };
  if (d.rarity === "ultra") return { error: "Ultras can't be traded (yet!)." };
  if (!(await validFoil(env, foil))) return { error: "No such foil." };
  const open = (await db.prepare("SELECT COUNT(*) AS n FROM open_trades WHERE from_user = ? AND status = 'open'").bind(userId).first()).n;
  if (open >= MAX_OPEN) return { error: `You can have ${MAX_OPEN} open trades at once.` };
  const { results } = await db.prepare(
    `SELECT i.id, i.owner_id, i.locked, i.consumed, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.id IN (${give.map(() => "?").join(",")})`
  ).bind(...give).all();
  if (results.length !== give.length || results.some((r) => r.owner_id !== userId || r.consumed)) return { error: "Those aren't all yours." };
  if (results.some((r) => r.rarity === "ultra")) return { error: "Ultras can't be traded (yet!)." };
  if (results.some((r) => r.locked)) return { error: "One of those is already in another trade." };
  const t = now(), token = newLockToken();
  await db.batch([
    ...give.map((id) => db.prepare("UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0").bind(token, id, userId)),
    db.prepare(
      `INSERT INTO open_trades (from_user, want_design_id, want_foil, message, lock_token, created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM instances WHERE locked = ?) = ?`
    ).bind(userId, designId, foil || null, String(message || "").trim().slice(0, 200) || null, token, t, t + BOARD_DAYS * 86400, token, give.length),
    ...give.map((id) => db.prepare("INSERT INTO open_trade_items (open_id, instance_id) SELECT id, ? FROM open_trades WHERE lock_token = ?").bind(id, token)),
    db.prepare("UPDATE instances SET locked = 0 WHERE locked = ? AND NOT EXISTS (SELECT 1 FROM open_trades WHERE lock_token = ?)").bind(token, token),
  ]);
  const ot = await db.prepare("SELECT id FROM open_trades WHERE lock_token = ?").bind(token).first();
  return ot ? { ok: true, id: ot.id } : { error: "Something changed while you were choosing. Try again!" };
}

export async function cancelOpenTrade(env, userId, otId) {
  const ot = await env.DB.prepare("SELECT * FROM open_trades WHERE id = ?").bind(otId).first();
  if (!ot || ot.from_user !== userId || ot.status !== "open") return { error: "That trade isn't open." };
  await env.DB.batch([
    env.DB.prepare("UPDATE open_trades SET status = 'cancelled', resolved_at = ? WHERE id = ? AND status = 'open'").bind(now(), otId),
    env.DB.prepare("UPDATE instances SET locked = 0 WHERE locked = ?").bind(ot.lock_token),
  ]);
  return { ok: true };
}

// Accept an open trade by giving one of your matching copies. All or nothing.
export async function acceptOpenTrade(env, userId, otId, instanceId) {
  const db = env.DB;
  await expireBoard(env);
  const ot = await db.prepare("SELECT * FROM open_trades WHERE id = ?").bind(otId).first();
  if (!ot || ot.status !== "open") return { error: "That trade isn't open anymore." };
  if (ot.from_user === userId) return { error: "That's your own trade!" };
  const c = await db.prepare(
    "SELECT i.id, i.design_id, i.foil, i.owner_id, i.locked, i.consumed, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id = ?"
  ).bind(instanceId).first();
  if (!c || c.owner_id !== userId || c.consumed) return { error: "That copy isn't yours." };
  if (c.locked) return { error: "That copy is busy in another trade." };
  if (c.design_id !== ot.want_design_id || (ot.want_foil && c.foil !== ot.want_foil)) return { error: "That copy doesn't match what they want." };
  const { results: items } = await db.prepare("SELECT instance_id FROM open_trade_items WHERE open_id = ?").bind(otId).all();
  const give = items.map((r) => r.instance_id);
  const t = now(), tok2 = newLockToken();
  const accepted = "EXISTS (SELECT 1 FROM open_trades WHERE id = ? AND status = 'accepted')";
  await db.batch([
    db.prepare("UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0").bind(tok2, c.id, userId),
    db.prepare(
      `UPDATE open_trades SET status = 'accepted', accepted_by = ?, got_instance = ?, resolved_at = ?
       WHERE id = ? AND status = 'open'
         AND (SELECT COUNT(*) FROM instances WHERE locked = ? AND owner_id = ?) = ?
         AND EXISTS (SELECT 1 FROM instances WHERE id = ? AND locked = ?)`
    ).bind(userId, c.id, t, otId, ot.lock_token, ot.from_user, give.length, c.id, tok2),
    ...give.map((id) => db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT ?, ?, ?, 'open_trade', ?, ? WHERE ${accepted}`
    ).bind(id, ot.from_user, userId, otId, t, otId)),
    db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT ?, ?, ?, 'open_trade', ?, ? WHERE ${accepted}`
    ).bind(c.id, userId, ot.from_user, otId, t, otId),
    db.prepare(`UPDATE instances SET owner_id = ?, locked = 0 WHERE locked = ? AND ${accepted}`).bind(userId, ot.lock_token, otId),
    db.prepare(`UPDATE instances SET owner_id = ?, locked = 0 WHERE locked = ? AND ${accepted}`).bind(ot.from_user, tok2, otId),
    db.prepare(
      `DELETE FROM wall_slots WHERE (instance_id = ? OR instance_id IN (SELECT instance_id FROM open_trade_items WHERE open_id = ?)) AND ${accepted}`
    ).bind(c.id, otId, otId),
    db.prepare("UPDATE instances SET locked = 0 WHERE locked = ?").bind(tok2),
  ]);
  const after = await db.prepare("SELECT status FROM open_trades WHERE id = ?").bind(otId).first();
  if (after.status === "accepted") return { ok: true };
  // one of their offered copies moved somehow: close it cleanly
  await cancelOpenTrade(env, ot.from_user, otId);
  return { error: "That trade can't go through anymore, so it's been closed." };
}

// ---------- reading the board ----------

const FIN = "i.foil, i.foil_seed, i.pattern, i.effect";

export async function boardFor(env, viewerId = null) {
  const db = env.DB;
  const { results: requests } = await db.prepare(
    `SELECT r.id, r.user_id, u.name AS user, u.is_bot, r.design_id, d.name, d.image_key, d.rarity, r.foil, r.created_at, r.expires_at
     FROM requests r JOIN users u ON u.id = r.user_id JOIN designs d ON d.id = r.design_id
     WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 60`
  ).all();
  const { results: trades } = await db.prepare(
    `SELECT o.id, o.from_user, u.name AS user, u.is_bot, o.want_design_id, d.name, d.image_key, d.rarity, o.want_foil, o.message, o.created_at, o.expires_at
     FROM open_trades o JOIN users u ON u.id = o.from_user JOIN designs d ON d.id = o.want_design_id
     WHERE o.status = 'open' ORDER BY o.created_at DESC LIMIT 60`
  ).all();
  if (trades.length) {
    const { results: items } = await db.prepare(
      `SELECT oi.open_id, i.id, i.edition, ${FIN}, d.name, d.image_key, d.rarity, d.max_editions
       FROM open_trade_items oi JOIN instances i ON i.id = oi.instance_id JOIN designs d ON d.id = i.design_id
       WHERE oi.open_id IN (${trades.map(() => "?").join(",")})`
    ).bind(...trades.map((t) => t.id)).all();
    for (const t of trades) t.give = items.filter((x) => x.open_id === t.id);
  }
  // which of my copies could fill each request / accept each trade
  if (viewerId) {
    const { results: mine } = await db.prepare(
      `SELECT i.id, i.edition, i.design_id, ${FIN} FROM instances i WHERE i.owner_id = ? AND i.consumed = 0 AND i.locked = 0`
    ).bind(viewerId).all();
    const match = (designId, foil) => mine.filter((c) => c.design_id === designId && (!foil || c.foil === foil))
      .sort((a, b) => (a.foil === "clear" ? -1 : 0) - (b.foil === "clear" ? -1 : 0) || b.edition - a.edition);
    for (const r of requests) if (r.user_id !== viewerId) r.can_fill = match(r.design_id, r.foil);
    for (const t of trades) if (t.from_user !== viewerId) t.can_give = match(t.want_design_id, t.want_foil);
  }
  return { requests, open_trades: trades };
}

// Open requests of one player (the "Wanted" line on their page).
export async function wantedOf(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, d.name, r.foil FROM requests r JOIN designs d ON d.id = r.design_id
     WHERE r.user_id = ? AND r.status = 'open' ORDER BY r.created_at`
  ).bind(userId).all();
  return results;
}
