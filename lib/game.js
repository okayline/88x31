// Game helpers: rolling designs, minting copies, moving copies between players.
import { now } from "./auth.js";

// Chances out of 1000 for each button in a pull (shown to players as percents).
export const ODDS_PER_1000 = { common: 699, uncommon: 250, rare: 50, ultra: 1 };
export const ODDS = Object.fromEntries(Object.entries(ODDS_PER_1000).map(([k, v]) => [k, v / 10])); // percent
// (if a rarity has nothing left, e.g. a 1-of-1 ultra already found, the roll falls back to common)

export const today = () => new Date().toISOString().slice(0, 10); // UTC day

// How many packs a player (and each bot) can open per day.
// 2 for now to get cards circulating at the start; set back to 1 later.
export const PULLS_PER_DAY = 2;

// Chance that a (regular) pack has a BONUS PACK card in place of one button.
// Picking it opens a fresh pack right away instead of keeping a button.
export const BONUS_CHANCE = 0.05;
export const BONUS = -1; // marker stored in a pack's options

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

// Pick a foil for a new copy of a design: weighted roll over active foils that can land on it
// (signature foils only on their own design, rarity limits, per-design caps). Falls back to clear.
export async function rollFoil(env, designId, weights = null) {
  let foils = [];
  try {
    const d = await env.DB.prepare("SELECT rarity FROM designs WHERE id = ?").bind(designId).first();
    const { results } = await env.DB.prepare(
      `SELECT f.id, f.weight, f.max_per_design, f.rarities,
              (SELECT COUNT(*) FROM instances i WHERE i.design_id = ? AND i.foil = f.id) AS made
       FROM foils f WHERE f.status = 'active' AND (f.design_id IS NULL OR f.design_id = ?)`
    ).bind(designId, designId).all();
    // `weights` can override some foils' weights for one roll (e.g. a finder's copy gets better odds)
    if (weights) for (const f of results) if (weights[f.id] != null) f.weight = weights[f.id];
    foils = results.filter((f) => {
      if (f.weight <= 0) return false;
      if (f.max_per_design != null && f.made >= f.max_per_design) return false;
      if (f.rarities) { try { if (!JSON.parse(f.rarities).includes(d && d.rarity)) return false; } catch {} }
      return true;
    });
  } catch { /* foils table not there yet */ }
  const seed = randInt(2_000_000_000);
  const total = foils.reduce((n, f) => n + f.weight, 0);
  if (!total) return { id: "clear", seed };
  let r = randInt(total);
  for (const f of foils) { if (r < f.weight) return { id: f.id, seed }; r -= f.weight; }
  return { id: "clear", seed };
}

// Statements that make a new copy of a design for a player, with the next edition number and
// a freshly rolled foil, only if the design isn't sold out, and log it. Run in a batch.
export async function mintStatements(env, designId, ownerId, reason, fromUser = null, opts = {}) {
  const t = now();
  const foil = await rollFoil(env, designId, opts.weights);
  return [
    env.DB.prepare(
      `INSERT INTO instances (design_id, edition, owner_id, created_at, foil, foil_seed)
       SELECT d.id, COALESCE((SELECT MAX(edition) FROM instances WHERE design_id = d.id), 0) + 1, ?, ?, ?, ?
       FROM designs d
       WHERE d.id = ? AND d.status = 'active'
         AND (d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances WHERE design_id = d.id) < d.max_editions)`
    ).bind(ownerId, t, foil.id, foil.seed, designId),
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
    env.DB.prepare("DELETE FROM wall_slots WHERE instance_id = ? AND user_id = ?").bind(instanceId, fromUser),
  ];
}

// SQL condition (2 params: instance id, token): our lock step succeeded.
export const lockedBy = "EXISTS (SELECT 1 FROM instances WHERE id = ? AND locked = ?)";

export async function userByName(env, name) {
  return env.DB.prepare("SELECT id, name, is_bot, last_seen, homepage, theme FROM users WHERE name = ?").bind(String(name || "").trim()).first();
}

// Give a new player their welcome pack: 2 random + 1 guaranteed uncommon.
export async function giveWelcomePack(env, userId) {
  const ids = await rollDesigns(env, 3, [null, null, "uncommon"]);
  const stmts = (await Promise.all(ids.map((id) => mintStatements(env, id, userId, "welcome")))).flat();
  if (stmts.length) await env.DB.batch(stmts);
}
