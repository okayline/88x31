// Trading: offers, accepting, declining, cancelling, expiring.
//
// Rules
// - Both sides must offer something: up to 3 buttons and up to 3 sealed packs each (v0.34).
//   One-sided giving is what guestbook gifts are for.
// - Ultras can be traded (v0.30), never to a bot; limited packs never go to a bot either.
// - Packs: only sealed ones (never opened or mid-pick). The offerer's packs lock with the trade's
//   token in packs.locked (revealed packs use locked = 1, so tokens never clash).
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
    env.DB.prepare(
      `UPDATE packs SET locked = 0 WHERE locked > 1 AND locked IN
         (SELECT lock_token FROM trades WHERE status = 'open' AND expires_at <= ?)`
    ).bind(t),
    env.DB.prepare("UPDATE trades SET status = 'expired', resolved_at = ? WHERE status = 'open' AND expires_at <= ?").bind(t, t),
  ]).catch(async () => {   // before migration 025 nothing else changes
    await env.DB.batch([
      env.DB.prepare(`UPDATE instances SET locked = 0 WHERE locked IN (SELECT lock_token FROM trades WHERE status = 'open' AND expires_at <= ?)`).bind(t),
      env.DB.prepare("UPDATE trades SET status = 'expired', resolved_at = ? WHERE status = 'open' AND expires_at <= ?").bind(t, t),
    ]);
  });
}

// A sealed pack that can move: not opened, not being picked from. (SQL on packs p)
const SEALED = "p.opened_at IS NULL AND NOT EXISTS (SELECT 1 FROM pack_openings o WHERE o.pack_id = p.id)";
async function packsCheck(env, list, owner) {
  if (!list.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.owner_id, p.locked, p.special, (${SEALED}) AS sealed FROM packs p WHERE p.id IN (${list.map(() => "?").join(",")})`
  ).bind(...list).all();
  if (results.length !== list.length || results.some((r) => r.owner_id !== owner)) return "Some of those packs aren't theirs to trade.";
  if (results.some((r) => !r.sealed)) return "Only sealed packs can be traded.";
  return results;
}

// Returns { ok, id } or { error }.
export async function proposeTrade(env, fromId, toId, giveList, wantList, message, givePackList = [], wantPackList = []) {
  const give = ids(giveList), want = ids(wantList), giveP = ids(givePackList), wantP = ids(wantPackList);
  if (!(give.length + giveP.length) || !(want.length + wantP.length)) return { error: "A trade needs something on each side. (To give for free, stamp a gift in their guestbook!)" };
  if (give.length > MAX_SIDE || want.length > MAX_SIDE) return { error: `Up to ${MAX_SIDE} buttons on each side.` };
  if (giveP.length > MAX_SIDE || wantP.length > MAX_SIDE) return { error: `Up to ${MAX_SIDE} packs on each side.` };
  if (fromId === toId) return { error: "You can't trade with yourself!" };

  // Check both sides up front for friendly errors (the batch below re-checks atomically).
  const check = async (list, owner) => {
    if (!list.length) return [];
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.owner_id, i.locked, i.consumed, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.id IN (${list.map(() => "?").join(",")})`
    ).bind(...list).all();
    if (results.length !== list.length || results.some((r) => r.owner_id !== owner || r.consumed)) return "Some of those buttons aren't theirs to trade.";
    return results;
  };
  const mine = await check(give, fromId);
  if (typeof mine === "string") return { error: mine.replace("theirs", "yours") };
  if (mine.some((r) => r.locked)) return { error: "One of your buttons is already in another trade." };
  const theirs = await check(want, toId);
  if (typeof theirs === "string") return { error: theirs };
  // ultras can be traded (v0.30), but never to a bot
  const bots = await env.DB.prepare("SELECT id, is_bot FROM users WHERE id IN (?, ?)").bind(fromId, toId).all();
  const isBot = (id) => !!(bots.results.find((u) => u.id === id) || {}).is_bot;
  if ((isBot(toId) && mine.some((r) => r.rarity === "ultra")) || (isBot(fromId) && theirs.some((r) => r.rarity === "ultra")))
    return { error: "Bots can't take ultras!" };
  const myPacks = await packsCheck(env, giveP, fromId);
  if (typeof myPacks === "string") return { error: myPacks.replace("theirs", "yours") };
  if (myPacks.some((r) => r.locked)) return { error: "One of your packs is already in another trade." };
  const theirPacks = await packsCheck(env, wantP, toId);
  if (typeof theirPacks === "string") return { error: theirPacks };
  if ((isBot(toId) && myPacks.some((r) => r.special)) || (isBot(fromId) && theirPacks.some((r) => r.special)))
    return { error: "Limited packs are for people, not bots!" };

  const t = now();
  const token = newLockToken();
  const db = env.DB;
  const stmts = [
    // lock each of my buttons with this trade's token (only if mine and free)
    ...give.map((id) => db.prepare(
      "UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0"
    ).bind(token, id, fromId)),
    // and my sealed packs
    ...giveP.map((id) => db.prepare(
      `UPDATE packs SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND opened_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM pack_openings o WHERE o.pack_id = packs.id)`
    ).bind(token, id, fromId)),
    // create the trade only if every one of them got locked
    db.prepare(
      `INSERT INTO trades (from_user, to_user, kind, status, message, created_at, lock_token, expires_at)
       SELECT ?, ?, 'trade', 'open', ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM instances WHERE locked = ?) = ? AND (SELECT COUNT(*) FROM packs WHERE locked = ?) = ?`
    ).bind(fromId, toId, String(message || "").trim().slice(0, 200) || null, t, token, t + TRADE_DAYS * 86400, token, give.length, token, giveP.length),
    ...give.map((id) => db.prepare(
      "INSERT INTO trade_items (trade_id, instance_id, side) SELECT id, ?, 'give' FROM trades WHERE lock_token = ?"
    ).bind(id, token)),
    ...want.map((id) => db.prepare(
      "INSERT INTO trade_items (trade_id, instance_id, side) SELECT id, ?, 'want' FROM trades WHERE lock_token = ?"
    ).bind(id, token)),
    ...giveP.map((id) => db.prepare(
      "INSERT INTO trade_packs (trade_id, pack_id, side) SELECT id, ?, 'give' FROM trades WHERE lock_token = ?"
    ).bind(id, token)),
    ...wantP.map((id) => db.prepare(
      "INSERT INTO trade_packs (trade_id, pack_id, side) SELECT id, ?, 'want' FROM trades WHERE lock_token = ?"
    ).bind(id, token)),
    // if the trade wasn't created, let go of any partial locks
    db.prepare(
      "UPDATE instances SET locked = 0 WHERE locked = ? AND NOT EXISTS (SELECT 1 FROM trades WHERE lock_token = ?)"
    ).bind(token, token),
    db.prepare(
      "UPDATE packs SET locked = 0 WHERE locked = ? AND NOT EXISTS (SELECT 1 FROM trades WHERE lock_token = ?)"
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
  let packs = [];
  try { packs = (await env.DB.prepare("SELECT pack_id, side FROM trade_packs WHERE trade_id = ?").bind(id).all()).results; } catch {}
  trade.giveP = packs.filter((r) => r.side === "give").map((r) => r.pack_id);
  trade.wantP = packs.filter((r) => r.side === "want").map((r) => r.pack_id);
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
    // lock the buttons they asked for (must still be mine and free)
    ...tr.want.map((id) => db.prepare(
      "UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0"
    ).bind(tok2, id, tr.to_user)),
    // and the sealed packs they asked for
    ...tr.wantP.map((id) => db.prepare(
      `UPDATE packs SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND opened_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM pack_openings o WHERE o.pack_id = packs.id)`
    ).bind(tok2, id, tr.to_user)),
    // accept only if both sides are fully in place
    db.prepare(
      `UPDATE trades SET status = 'accepted', resolved_at = ?
       WHERE id = ? AND status = 'open'
         AND (SELECT COUNT(*) FROM instances WHERE locked = ? AND owner_id = ?) = ?
         AND (SELECT COUNT(*) FROM instances WHERE locked = ? AND owner_id = ?) = ?
         AND (SELECT COUNT(*) FROM packs WHERE locked = ? AND owner_id = ?) = ?
         AND (SELECT COUNT(*) FROM packs WHERE locked = ? AND owner_id = ?) = ?`
    ).bind(t, tr.id, tr.lock_token, tr.from_user, tr.give.length, tok2, tr.to_user, tr.want.length,
      tr.lock_token, tr.from_user, tr.giveP.length, tok2, tr.to_user, tr.wantP.length),
    // log every pack's move
    ...tr.giveP.map((id) => db.prepare(
      `INSERT INTO pack_history (pack_id, from_user, to_user, reason, created_at) SELECT ?, ?, ?, 'trade', ? WHERE ${accepted}`
    ).bind(id, tr.from_user, tr.to_user, t, tr.id)),
    ...tr.wantP.map((id) => db.prepare(
      `INSERT INTO pack_history (pack_id, from_user, to_user, reason, created_at) SELECT ?, ?, ?, 'trade', ? WHERE ${accepted}`
    ).bind(id, tr.to_user, tr.from_user, t, tr.id)),
    db.prepare(`UPDATE packs SET owner_id = ?, locked = 0 WHERE locked = ? AND ${accepted}`).bind(tr.to_user, tr.lock_token, tr.id),
    db.prepare(`UPDATE packs SET owner_id = ?, locked = 0 WHERE locked = ? AND ${accepted}`).bind(tr.from_user, tok2, tr.id),
    db.prepare("UPDATE packs SET locked = 0 WHERE locked = ?").bind(tok2),
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
    // traded buttons leave their old owners' arranged walls
    db.prepare(`DELETE FROM wall_slots WHERE instance_id IN (SELECT instance_id FROM trade_items WHERE trade_id = ?) AND ${accepted}`).bind(tr.id, tr.id),
    // if it didn't go through, release the buttons we just locked
    db.prepare("UPDATE instances SET locked = 0 WHERE locked = ?").bind(tok2),
  ];
  await db.batch(stmts);
  const after = await db.prepare("SELECT status FROM trades WHERE id = ?").bind(tr.id).first();
  if (after.status === "accepted") return { ok: true };

  // Something's gone (e.g. they gave away a button the offer asked for). Close it out cleanly.
  await closeTrade(env, tr, "cancelled");
  return { error: "That trade can't go through anymore (a button or pack in it has moved), so it's been closed." };
}

async function closeTrade(env, tr, status) {
  await env.DB.batch([
    env.DB.prepare("UPDATE trades SET status = ?, resolved_at = ? WHERE id = ? AND status = 'open'").bind(status, now(), tr.id),
    env.DB.prepare(
      "UPDATE instances SET locked = 0 WHERE locked = ? AND NOT EXISTS (SELECT 1 FROM trades WHERE id = ? AND status = 'open')"
    ).bind(tr.lock_token, tr.id),
    env.DB.prepare(
      "UPDATE packs SET locked = 0 WHERE locked = ? AND locked > 1 AND NOT EXISTS (SELECT 1 FROM trades WHERE id = ? AND status = 'open')"
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
    `SELECT ti.trade_id, ti.side, i.id, i.design_id, i.edition, i.foil, i.foil_seed, i.pattern, i.effect, d.name, d.image_key, d.rarity, d.max_editions
     FROM trade_items ti JOIN instances i ON i.id = ti.instance_id JOIN designs d ON d.id = i.design_id
     WHERE ti.trade_id IN (${trades.map(() => "?").join(",")})`
  ).bind(...trades.map((t) => t.id)).all();
  for (const t of trades) {
    t.give = items.filter((i) => i.trade_id === t.id && i.side === "give");
    t.want = items.filter((i) => i.trade_id === t.id && i.side === "want");
  }
  // their sealed packs (v0.34)
  let packs = [];
  try {
    packs = (await env.DB.prepare(
      `SELECT tp.trade_id, tp.side, p.id, p.source, p.note, p.keep, p.special, p.special_no, s.special_name, s.special_limit, p.created_at, s.name AS series
       FROM trade_packs tp JOIN packs p ON p.id = tp.pack_id LEFT JOIN series s ON s.id = p.series_id
       WHERE tp.trade_id IN (${trades.map(() => "?").join(",")})`
    ).bind(...trades.map((t) => t.id)).all()).results;
  } catch {}
  for (const t of trades) {
    t.give_packs = packs.filter((p) => p.trade_id === t.id && p.side === "give");
    t.want_packs = packs.filter((p) => p.trade_id === t.id && p.side === "want");
  }
  return trades;
}
