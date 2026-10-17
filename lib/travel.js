// TRAVEL (v0.36): your buttons can visit your 4Dungeon, and your dungeon items can visit here. Same person, other game:
// both players must be on the same shared account (a save code or passkey used in both games).
//
// A button that goes to 4Dungeon is AWAY, not gone: it stays yours here, the same copy (edition, foil, history), but
// locked with AWAY so it can't be traded, fused, given or put on the wall until it comes home. The shared registry
// (dungeon-items) holds it for your 4Dungeon player meanwhile. It comes home when 4Dungeon sends it back: the next
// time this game looks (your collection, or the background registry pass), it is unlocked and logged as home.
// Dungeon items you send here are VISITORS: they live in the shared registry, held by you in 88x31, and show in your
// collection as text cards. Display only for now: they can be sent back to 4Dungeon, nothing else.
// Every leaving and returning is an ownership_history row (reason 'away' / 'home'), so it is sealed into this game's ledger.
import { now } from "./auth.js";
import { acc } from "./shared.js";
import { reg, GAME } from "./registry.js";
import { sealSafe } from "./ledger.js";

export const AWAY = -1;   // instances.locked while a button is in another game (trade and fusion locks are positive tokens)
const DUNGEON = "4dungeon";

class Nope extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const ok = (r, what) => { if (!r || r.error) throw new Nope(r && r.error ? r.error : what); return r; };

// Your player in 4Dungeon, through the shared account. A clear message when there isn't one.
async function dungeonPlayer(env, userId) {
  const A = acc(env);
  if (!A) throw new Nope("Accounts are unavailable right now. Try again in a moment.", 503);
  const { accountId } = await A.accountOf(GAME, userId);
  if (!accountId) throw new Nope("Make a save code or passkey first (Account), so your games know they're both you.");
  const { playerId } = await A.playerFor(accountId, DUNGEON);
  if (!playerId) throw new Nope("Sign in to 4Dungeon (dungeon.88x31.app, Account) with the same save code or passkey first.");
  return playerId;
}

// Send one of your buttons to your 4Dungeon.
export async function sendButton(env, userId, instanceId) {
  const R = reg(env);
  if (!R) throw new Nope("The item registry is unavailable right now.", 503);
  const c = await env.DB.prepare(
    `SELECT i.id, i.owner_id, i.locked, i.consumed, i.registry_copy, i.registry_owner, d.registry_item, d.name
     FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id = ?`).bind(instanceId).first();
  if (!c || c.owner_id !== userId || c.consumed) throw new Nope("That isn't your button.");
  if (c.locked === AWAY) throw new Nope("That one is already away.");
  if (c.locked) throw new Nope("That button is busy (in a trade or a fusion).");
  if (!c.registry_item) throw new Nope("Only original-tier buttons can travel (not specials or uploads).");
  if (!(c.registry_copy > 0) || c.registry_owner !== userId) throw new Nope("This button isn't in the shared registry yet. Try again in a minute.");
  const to = await dungeonPlayer(env, userId);
  // lock it first, so nothing else can grab it while it moves
  const lock = await env.DB.prepare("UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0").bind(AWAY, c.id, userId).run();
  if (!lock.meta.changes) throw new Nope("That button is busy (in a trade or a fusion).");
  let r;
  try { r = await R.moveCopy({ itemId: c.registry_item, copy: c.registry_copy, from: { game: GAME, playerId: userId }, to: { game: DUNGEON, playerId: to } }); }
  catch (e) { r = { error: "The item registry didn't answer. Nothing moved." }; }
  if (!r || r.error) {
    await env.DB.prepare("UPDATE instances SET locked = 0 WHERE id = ? AND locked = ?").bind(c.id, AWAY).run();
    throw new Nope(r && r.error ? r.error : "Nothing moved.");
  }
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM wall_slots WHERE instance_id = ?").bind(c.id),
    env.DB.prepare("INSERT INTO ownership_history (instance_id, from_user, to_user, reason, created_at) VALUES (?, ?, ?, 'away', ?)").bind(c.id, userId, userId, t),
  ]);
  await sealSafe(env);
  return { ok: true, name: c.name };
}

// Away buttons that have come home (the registry holds them in 88x31 again): unlock them for whoever holds them now.
// `userId` limits it to one player's buttons (their collection); without it, a few of everyone's (the background pass).
export async function settleReturns(env, userId = null, limit = 10, R = reg(env)) {
  if (!R) return 0;
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.owner_id, i.registry_copy, d.registry_item FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.locked = ? AND i.consumed = 0 ${userId ? "AND i.owner_id = ?" : ""} ORDER BY i.id LIMIT ?`
  ).bind(...(userId ? [AWAY, userId, limit] : [AWAY, limit])).all();
  let home = 0;
  for (const c of results) {
    const w = await R.whereIs(c.registry_item, c.registry_copy);
    if (!w || w.game !== GAME || w.spent) continue;   // still away (or used up over there)
    const t = now();
    const r = await env.DB.batch([
      env.DB.prepare("UPDATE instances SET locked = 0, owner_id = ?, registry_owner = ? WHERE id = ? AND locked = ?").bind(w.playerId, w.playerId, c.id, AWAY),
      env.DB.prepare("INSERT INTO ownership_history (instance_id, from_user, to_user, reason, created_at) SELECT ?, ?, ?, 'home', ? WHERE changes() = 1").bind(c.id, c.owner_id, w.playerId, t),
    ]);
    if (r[0].meta.changes) home++;
  }
  if (home) await sealSafe(env);
  return home;
}

// What travel shows in your collection: your away buttons come home first, then the dungeon items visiting you.
export async function travelView(env, userId) {
  const R = reg(env);
  if (!R) return { visitors: [], available: false };
  await settleReturns(env, userId, 20, R);
  const held = await R.heldBy(userId);
  const visitors = (Array.isArray(held) ? held : []).filter((c) => c.item && c.item.source !== GAME)
    .map((c) => ({ item_id: c.itemId, copy: c.copy, name: c.item.name, note: c.item.note, rarity: c.item.rarity, from: c.item.source, alignment: c.item.alignment }));
  return { visitors, available: true };
}

// Send a visiting dungeon item back to your 4Dungeon.
export async function sendVisitor(env, userId, itemId, copy) {
  const R = reg(env);
  if (!R) throw new Nope("The item registry is unavailable right now.", 503);
  const held = await R.heldBy(userId);
  const c = (Array.isArray(held) ? held : []).find((h) => h.itemId === itemId && h.copy === copy);
  if (!c || !c.item || c.item.source === GAME) throw new Nope("That isn't a visitor you hold.");
  const to = await dungeonPlayer(env, userId);
  ok(await R.moveCopy({ itemId, copy, from: { game: GAME, playerId: userId }, to: { game: DUNGEON, playerId: to } }), "Nothing moved.");
  return { ok: true, name: c.item.name };
}

export { Nope };
