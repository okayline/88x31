// Trading: offers, accepting, declining, cancelling, expiring.
//
// Rules
// - Both sides must offer 1-3 buttons (one-sided giving is what guestbook gifts are for).
// - Ultras can't be traded (for now).
// - While an offer is open, the OFFERER's buttons are locked with the trade's own token, so they
//   can't be gifted, stamped or put in another trade. The other player's buttons are NOT locked
//   (otherwise anyone could freeze your collection by spamming offers); they're checked on accept.
// - Accepting swaps everything in one all-or-nothing batch and logs each button as a "trade".
// - Offers expire after 7 days; expiring, declining or cancelling unlocks the offerer's buttons.
import { now } from "./auth.js";
import { newLockToken } from "./game.js";

export const TRADE_DAYS = 7;
export const MAX_SIDE = 3;

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => n > 0))];

// Expire old offers and unlock their buttons. Cheap; call before reading trades.
export async function expireTrades(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE instances SET locked = 0 WHERE locked IN
         (SELECT lock_token FROM trades WHERE status = 'open' AND expires_at <= ?)`
    ).bind(t),
    env.DB.prepare("UPDATE trades SET status = 'expired', resolved_at = ? WHERE status = 'open' AND expires_at <= ?").bind(t, t),
  ]);
}

// Returns { ok, id } or { error }.
export async function proposeTrade(env, fromId, toId, giveList, wantList, message) {
  const give = ids(giveList), want = ids(wantList);
  if (!give.length || !want.length) return { error: "A trade needs at least one button on each side. (To give for free, stamp a gift in their guestbook!)" };
  if (give.length > MAX_SIDE || want.length > MAX_SIDE) return { error: `Up to ${MAX_SIDE} buttons on each side.` };
  if (fromId === toId) return { error: "You can't trade with yourself!" };

  // Check both sides up front for friendly errors (the batch below re-checks atomically).
  const check = async (list, owner) => {
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.owner_id, i.locked, i.consumed, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.id IN (${list.map(() => "?").join(",")})`
    ).bind(...list).all();
    if (results.length !== list.length || results.some((r) => r.owner_id !== owner || r.consumed)) return "Some of those buttons aren't theirs to trade.";
    if (results.some((r) => r.rarity === "ultra")) return "Ultras can't be traded (yet!).";
    return results;
  };
  const mine = await check(give, fromId);
  if (typeof mine === "string") return { error: mine.replace("theirs", "yours") };
  if (mine.some((r) => r.locked)) return { error: "One of your buttons is already in another open trade." };
  const theirs = await check(want, toId);
  if (typeof theirs === "string") return { error: theirs };

  const t = now();
  const token = newLockToken();
  const db = env.DB;
  const stmts = [
    // lock each of my buttons with this trade's token (only if mine and free)
    ...give.map((id) => db.prepare(
      "UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0"
    ).bind(token, id, fromId)),
    // create the trade only if every one of them got locked
    db.prepare(
      `INSERT INTO trades (from_user, to_user, kind, status, message, created_at, lock_token, expires_at)
       SELECT ?, ?, 'trade', 'open', ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM instances WHERE locked = ?) = ?`
    ).bind(fromId, toId, String(message || "").trim().slice(0, 200) || null, t, token, t + TRADE_DAYS * 86400, token, give.length),
    ...give.map((id) => db.prepare(
      "INSERT INTO trade_items (trade_id, instance_id, side) SELECT id, ?, 'give' FROM trades WHERE lock_token = ?"
    ).bind(id, token)),
    ...want.map((id) => db.prepare(
      "INSERT INTO trade_items (trade_id, instance_id, side) SELECT id, ?, 'want' FROM trades WHERE lock_token = ?"
    ).bind(id, token)),
    // if the trade wasn't created, let go of any partial locks
    db.prepare(
      "UPDATE instances SET locked = 0 WHERE locked = ? AND NOT EXISTS (SELECT 1 FROM trades WHERE lock_token = ?)"
    ).bind(token, token),
  ];
  await db.batch(stmts);
  const trade = await db.prepare("SELECT id FROM trades WHERE lock_token = ?").bind(token).first();
  if (!trade) return { error: "Something changed while you were choosing. Try again!" };
  return { ok: true, id: trade.id };
}

async function loadTrade(env, id) {
  const trade = await env.DB.prepare("SELECT * FROM trades WHERE id = ?").bind(id).first();
  if (!trade) return null;
  const { results } = await env.DB.prepare("SELECT instance_id, side FROM trade_items WHERE trade_id = ?").bind(id).all();
  trade.give = results.filter((r) => r.side === "give").map((r) => r.instance_id);
  trade.want = results.filter((r) => r.side === "want").map((r) => r.instance_id);
  return trade;
}

// Accept: everything swaps, or nothing does. Returns { ok } or { error }.
export async function acceptTrade(env, tradeId, actorId) {
  await expireTrades(env);
  const tr = await loadTrade(env, tradeId);
  if (!tr || tr.to_user !== actorId) return { error: "No such trade." };
  if (tr.status !== "open") return { error: `That trade is already ${tr.status}.` };

  const db = env.DB;
  const t = now();
  const tok2 = newLockToken();
  const accepted = "EXISTS (SELECT 1 FROM trades WHERE id = ? AND status = 'accepted')";
  const stmts = [
    // lock the buttons they asked for (must still be mine, free, and not ultras)
    ...tr.want.map((id) => db.prepare(
      `UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0
         AND (SELECT rarity FROM designs WHERE id = instances.design_id) != 'ultra'`
    ).bind(tok2, id, tr.to_user)),
    // accept only if both sides are fully in place
    db.prepare(
      `UPDATE trades SET status = 'accepted', resolved_at = ?
       WHERE id = ? AND status = 'open'
         AND (SELECT COUNT(*) FROM instances WHERE locked = ? AND owner_id = ?) = ?
         AND (SELECT COUNT(*) FROM instances WHERE locked = ? AND owner_id = ?) = ?`
    ).bind(t, tr.id, tr.lock_token, tr.from_user, tr.give.length, tok2, tr.to_user, tr.want.length),
    // log every button's move
    ...tr.give.map((id) => db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT ?, ?, ?, 'trade', ?, ? WHERE ${accepted}`
    ).bind(id, tr.from_user, tr.to_user, tr.id, t, tr.id)),
    ...tr.want.map((id) => db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT ?, ?, ?, 'trade', ?, ? WHERE ${accepted}`
    ).bind(id, tr.to_user, tr.from_user, tr.id, t, tr.id)),
    // swap owners and unlock
    db.prepare(`UPDATE instances SET owner_id = ?, locked = 0 WHERE locked = ? AND ${accepted}`).bind(tr.to_user, tr.lock_token, tr.id),
    db.prepare(`UPDATE instances SET owner_id = ?, locked = 0 WHERE locked = ? AND ${accepted}`).bind(tr.from_user, tok2, tr.id),
    // if it didn't go through, release the buttons we just locked
    db.prepare("UPDATE instances SET locked = 0 WHERE locked = ?").bind(tok2),
  ];
  await db.batch(stmts);
  const after = await db.prepare("SELECT status FROM trades WHERE id = ?").bind(tr.id).first();
  if (after.status === "accepted") return { ok: true };

  // Something's gone (e.g. they gave away a button the offer asked for). Close it out cleanly.
  await closeTrade(env, tr, "cancelled");
  return { error: "That trade can't go through anymore (a button in it has moved), so it's been closed." };
}

async function closeTrade(env, tr, status) {
  await env.DB.batch([
    env.DB.prepare("UPDATE trades SET status = ?, resolved_at = ? WHERE id = ? AND status = 'open'").bind(status, now(), tr.id),
    env.DB.prepare(
      "UPDATE instances SET locked = 0 WHERE locked = ? AND NOT EXISTS (SELECT 1 FROM trades WHERE id = ? AND status = 'open')"
    ).bind(tr.lock_token, tr.id),
  ]);
}

// Decline (by the receiver) or cancel (by the offerer).
export async function closeByUser(env, tradeId, actorId, action) {
  const tr = await loadTrade(env, tradeId);
  if (!tr) return { error: "No such trade." };
  if (tr.status !== "open") return { error: `That trade is already ${tr.status}.` };
  if (action === "decline" && tr.to_user !== actorId) return { error: "Only the person it was offered to can decline." };
  if (action === "cancel" && tr.from_user !== actorId) return { error: "Only the person who offered it can cancel." };
  await closeTrade(env, tr, action === "decline" ? "declined" : "cancelled");
  return { ok: true };
}

// Trades involving a player, with their buttons, for the Trades screen and bots.
export async function listTrades(env, userId, { status = null, limit = 40 } = {}) {
  const { results: trades } = await env.DB.prepare(
    `SELECT t.id, t.status, t.message, t.created_at, t.resolved_at, t.expires_at,
            t.from_user, f.name AS from_name, f.is_bot AS from_bot, t.to_user, u.name AS to_name, u.is_bot AS to_bot
     FROM trades t JOIN users f ON f.id = t.from_user JOIN users u ON u.id = t.to_user
     WHERE (t.from_user = ? OR t.to_user = ?) ${status ? "AND t.status = ?" : ""}
     ORDER BY COALESCE(t.resolved_at, t.created_at) DESC LIMIT ?`
  ).bind(...(status ? [userId, userId, status, limit] : [userId, userId, limit])).all();
  if (!trades.length) return [];
  const { results: items } = await env.DB.prepare(
    `SELECT ti.trade_id, ti.side, i.id, i.edition, d.name, d.image_key, d.rarity, d.max_editions
     FROM trade_items ti JOIN instances i ON i.id = ti.instance_id JOIN designs d ON d.id = i.design_id
     WHERE ti.trade_id IN (${trades.map(() => "?").join(",")})`
  ).bind(...trades.map((t) => t.id)).all();
  for (const t of trades) {
    t.give = items.filter((i) => i.trade_id === t.id && i.side === "give");
    t.want = items.filter((i) => i.trade_id === t.id && i.side === "want");
  }
  return trades;
}
