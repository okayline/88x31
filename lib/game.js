// Game helpers: rolling designs, minting copies, moving copies between players.
import { now } from "./auth.js";

// Chances out of 1000 for each button in a pull (shown to players as percents).
export const ODDS_PER_1000 = { common: 699, uncommon: 250, rare: 50, ultra: 1 };
export const ODDS = Object.fromEntries(Object.entries(ODDS_PER_1000).map(([k, v]) => [k, v / 10])); // percent
// (if a rarity has nothing left, e.g. a 1-of-1 ultra already found, the roll falls back to common)

export const today = () => new Date().toISOString().slice(0, 10); // UTC day

function randInt(n) {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % n; // n is tiny, bias is negligible
}

function rollRarity() {
  let r = randInt(1000);
  for (const [rarity, pct] of Object.entries(ODDS_PER_1000)) {
    if (r < pct) return rarity;
    r -= pct;
  }
  return "common";
}

// Active designs that still have copies left, grouped by rarity.
async function availableDesigns(env) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.rarity FROM designs d
     WHERE d.status = 'active'
       AND (d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) < d.max_editions)`
  ).all();
  const byRarity = {};
  for (const d of results) (byRarity[d.rarity] ||= []).push(d.id);
  return byRarity;
}

// Roll n design ids. `force` can pin some rarities, e.g. ["uncommon"].
// Tries not to repeat a design within one roll.
export async function rollDesigns(env, n, force = []) {
  const pool = await availableDesigns(env);
  const all = Object.values(pool).flat();
  if (!all.length) return [];
  const picked = [];
  for (let i = 0; i < n; i++) {
    const want = force[i] || rollRarity();
    let choices = (pool[want] || []).filter((id) => !picked.includes(id));
    if (!choices.length) choices = (pool.common || []).filter((id) => !picked.includes(id));
    if (!choices.length) choices = all.filter((id) => !picked.includes(id));
    if (!choices.length) choices = all;
    picked.push(choices[randInt(choices.length)]);
  }
  return picked;
}

// Two statements that make a new copy of a design for a player, with the next
// edition number, only if the design isn't sold out, and log it. Run in a batch.
export function mintStatements(env, designId, ownerId, reason, fromUser = null) {
  const t = now();
  return [
    env.DB.prepare(
      `INSERT INTO instances (design_id, edition, owner_id, created_at)
       SELECT d.id, COALESCE((SELECT MAX(edition) FROM instances WHERE design_id = d.id), 0) + 1, ?, ?
       FROM designs d
       WHERE d.id = ? AND d.status = 'active'
         AND (d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances WHERE design_id = d.id) < d.max_editions)`
    ).bind(ownerId, t, designId),
    env.DB.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, created_at)
       SELECT last_insert_rowid(), ?, ?, ?, ? WHERE changes() = 1`
    ).bind(fromUser, ownerId, reason, t),
  ];
}

// Statements that move one copy from one player to another, all-or-nothing:
// lock it with a fresh token (only if they own it and it's free), log, hand over, unlock.
// `extra` = statements to run while it is locked; guard them with lockedBy (id, token).
export function newLockToken() {
  return randInt(2_000_000_000) + 2; // never 0 (free) or 1
}

export function transferStatements(env, instanceId, fromUser, toUser, reason, token, extra = []) {
  const t = now();
  return [
    env.DB.prepare(
      "UPDATE instances SET locked = ? WHERE id = ? AND owner_id = ? AND locked = 0 AND consumed = 0"
    ).bind(token, instanceId, fromUser),
    ...extra,
    env.DB.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, created_at)
       SELECT ?, ?, ?, ?, ? WHERE ${lockedBy}`
    ).bind(instanceId, fromUser, toUser, reason, t, instanceId, token),
    env.DB.prepare(
      "UPDATE instances SET owner_id = ?, locked = 0 WHERE id = ? AND locked = ?"
    ).bind(toUser, instanceId, token),
  ];
}

// SQL condition (2 params: instance id, token): our lock step succeeded.
export const lockedBy = "EXISTS (SELECT 1 FROM instances WHERE id = ? AND locked = ?)";

export async function userByName(env, name) {
  return env.DB.prepare("SELECT id, name, is_bot FROM users WHERE name = ?").bind(String(name || "").trim()).first();
}

// Give a new player their welcome pack: 2 random + 1 guaranteed uncommon.
export async function giveWelcomePack(env, userId) {
  const ids = await rollDesigns(env, 3, [null, null, "uncommon"]);
  const stmts = ids.flatMap((id) => mintStatements(env, id, userId, "welcome"));
  if (stmts.length) await env.DB.batch(stmts);
}
