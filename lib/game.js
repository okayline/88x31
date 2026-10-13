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

// Special packs double the rare and ultra chances (taken out of commons).
export const SPECIAL_ODDS_PER_1000 = { common: ODDS_PER_1000.common - ODDS_PER_1000.rare - ODDS_PER_1000.ultra, uncommon: ODDS_PER_1000.uncommon,
  rare: ODDS_PER_1000.rare * 2, ultra: ODDS_PER_1000.ultra * 2 };
function rollRarity(boost = false) {
  let r = randInt(1000);
  for (const [rarity, pct] of Object.entries(boost ? SPECIAL_ODDS_PER_1000 : ODDS_PER_1000)) {
    if (r < pct) return rarity;
    r -= pct;
  }
  return "common";
}

// Packs are 1 found button + 2 of the cLuB's originals (FOUND_PER_PACK). If no found buttons
// are in play yet, every card is an original. Found buttons are all commons, so their card skips
// the rarity roll; rares and ultras only come from the originals.
export const FOUND_PER_PACK = 1;

// The cLuB's originals come in Series. Up to 3 are active at once; each original card in a pack
// first picks a series (newest gets 60%, then 25%, then 15%), then rolls rarity inside it.
export const SERIES_WEIGHTS = [60, 25, 15];
export const MAX_ACTIVE_SERIES = 3;

// Active designs that still have copies left: originals grouped by series and rarity, plus the
// found pool. Originals only count while their series is active (designs with no series yet,
// from before series existed, count as part of the newest one). onlySeries: just that series.
async function availableDesigns(env, onlySeries = null) {
  let rows, active = [];
  try {
    active = (await env.DB.prepare(
      "SELECT id FROM series WHERE status = 'active' ORDER BY sort DESC, id DESC LIMIT ?"
    ).bind(MAX_ACTIVE_SERIES).all()).results.map((r) => r.id);
    rows = (await env.DB.prepare(
      `SELECT d.id, d.rarity, d.tier, d.series_id FROM designs d
       WHERE d.status = 'active'
         AND (d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) < d.max_editions)`
    ).all()).results;
  } catch { // before migration 016: one big pool
    rows = (await env.DB.prepare(
      `SELECT d.id, d.rarity, d.tier, NULL AS series_id FROM designs d
       WHERE d.status = 'active'
         AND (d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) < d.max_editions)`
    ).all()).results;
  }
  const bySeries = new Map(), found = [];
  for (const d of rows) {
    if (d.tier === "archive") { found.push(d.id); continue; }
    const sid = d.series_id ?? active[0] ?? 0;
    if (active.length && !active.includes(sid)) continue;  // upcoming or retired series
    if (onlySeries != null && sid !== onlySeries) continue;
    if (!bySeries.has(sid)) bySeries.set(sid, {});
    (bySeries.get(sid)[d.rarity] ||= []).push(d.id);
  }
  // newest first, with their pack weights
  const order = (onlySeries != null ? [onlySeries] : active.length ? active : [...bySeries.keys()]).filter((sid) => bySeries.has(sid));
  const series = order.map((sid, i) => ({ id: sid, weight: SERIES_WEIGHTS[i] ?? 0, pool: bySeries.get(sid) }));
  return { series, found };
}

function pickSeries(series) {
  const total = series.reduce((n, s) => n + s.weight, 0);
  if (!total) return series[0];
  let r = randInt(total);
  for (const s of series) { if (r < s.weight) return s; r -= s.weight; }
  return series[0];
}

// Roll n design ids. `force` can pin some cards' rarities, e.g. [null, null, "uncommon"] (always originals).
// opts.series = only that series' originals (a series pack). Tries not to repeat a design within one roll.
export async function rollDesigns(env, n, force = [], opts = {}) {
  const { series, found } = await availableDesigns(env, opts.series ?? null);
  const allOriginals = series.flatMap((s) => Object.values(s.pool).flat());
  if (!allOriginals.length && !found.length) return [];
  // which card(s) come from the found pool: random positions that aren't pinned
  const open = [...Array(n).keys()].filter((i) => !force[i]);
  const foundAt = new Set();
  for (let k = 0; k < FOUND_PER_PACK && found.length && open.length; k++) foundAt.add(open.splice(randInt(open.length), 1)[0]);
  const picked = [];
  for (let i = 0; i < n; i++) {
    if (foundAt.has(i) || !allOriginals.length) {
      let fc = found.filter((id) => !picked.includes(id));
      if (!fc.length) fc = found;
      picked.push(fc[randInt(fc.length)]);
      continue;
    }
    const pool = pickSeries(series).pool;
    const all = Object.values(pool).flat();
    const want = force[i] || rollRarity(!!opts.boost);
    let choices = (pool[want] || []).filter((id) => !picked.includes(id));
    if (!choices.length) choices = (pool.common || []).filter((id) => !picked.includes(id));
    if (!choices.length) choices = all.filter((id) => !picked.includes(id));
    if (!choices.length) choices = allOriginals.filter((id) => !picked.includes(id));
    if (!choices.length) choices = allOriginals;
    picked.push(choices[randInt(choices.length)]);
  }
  return picked;
}

// ---------- foils, patterns, effects ----------
// Every copy has three layers, rolled separately when it's made (see migrations/014):
//   foil    - the material: tier 0 Clear/Glitter/Sheen, tiers 1-3 real foils
//   pattern - how a real foil's shine is cut (Fracture/Etched/Surge); only on tier 1+ foils
//   effect  - how the whole button plays on screen (Dial-Up/Marquee/CRT/VHS)
export const PATTERN_CHANCE = 0.05; // of copies that roll a real (tier 1+) foil
export const EFFECT_CHANCE = 0.10;  // of all new copies
export const FUSE_EFFECT_CHANCE = 0.10; // a fusion with no effects going in still has this chance of one
export const TOP_EFFECT = "crt_vhs"; // fusion-only

// The registry, grouped: { foil: [...], pattern: [...], effect: [...] }. Older databases fall back to clear.
export async function finishes(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, effect, kind, tier, weight, max_per_design, design_id, rarities FROM foils WHERE status = 'active'"
    ).all();
    const out = { foil: [], pattern: [], effect: [] };
    for (const f of results) (out[f.kind || "foil"] ||= []).push(f);
    return out;
  } catch {
    try {
      const { results } = await env.DB.prepare("SELECT id, name, effect, weight, max_per_design, design_id, rarities FROM foils WHERE status = 'active'").all();
      return { foil: results.map((f) => ({ ...f, kind: "foil", tier: f.id === "clear" ? 0 : 1 })), pattern: [], effect: [] };
    } catch { return { foil: [{ id: "clear", weight: 1, tier: 0 }], pattern: [], effect: [] }; }
  }
}

function pickWeighted(list) {
  const total = list.reduce((n, f) => n + Math.max(0, f.weight), 0);
  if (!total) return null;
  let r = randInt(total);
  for (const f of list) { const w = Math.max(0, f.weight); if (r < w) return f; r -= w; }
  return null;
}
const chance = (p) => randInt(1_000_000) < p * 1_000_000;

// Roll foil + pattern + effect for a new copy of a design. `weights` can override some foils'
// weights for this one roll (e.g. a finder's copy #1 gets better odds).
export async function rollFoil(env, designId, weights = null) {
  const seed = randInt(2_000_000_000);
  const reg = await finishes(env);
  let foils = reg.foil.map((f) => ({ ...f }));
  try {
    const d = await env.DB.prepare("SELECT rarity FROM designs WHERE id = ?").bind(designId).first();
    const capped = foils.filter((f) => f.max_per_design != null);
    const made = {};
    for (const f of capped) {
      made[f.id] = (await env.DB.prepare("SELECT COUNT(*) AS n FROM instances WHERE design_id = ? AND foil = ?").bind(designId, f.id).first()).n;
    }
    if (weights) for (const f of foils) if (weights[f.id] != null) f.weight = weights[f.id];
    foils = foils.filter((f) => {
      if (f.weight <= 0) return false;
      if (f.design_id != null && f.design_id !== designId) return false;
      if (f.max_per_design != null && made[f.id] >= f.max_per_design) return false;
      if (f.rarities) { try { if (!JSON.parse(f.rarities).includes(d && d.rarity)) return false; } catch {} }
      return true;
    });
  } catch { /* fall through with what we have */ }
  const foil = pickWeighted(foils) || { id: "clear", tier: 0 };
  const pattern = foil.tier >= 1 && chance(PATTERN_CHANCE) ? pickWeighted(reg.pattern) : null;
  const effect = chance(EFFECT_CHANCE) ? pickWeighted(reg.effect.filter((e) => e.id !== TOP_EFFECT)) : null;
  return { id: foil.id, seed, pattern: pattern ? pattern.id : null, effect: effect ? effect.id : null };
}

// Statements that make a new copy of a design for a player, with the next edition number and
// a freshly rolled foil, only if the design isn't sold out, and log it. Run in a batch.
export async function mintStatements(env, designId, ownerId, reason, fromUser = null, opts = {}) {
  const t = now();
  const foil = opts.finish || (await rollFoil(env, designId, opts.weights)); // opts.finish: an already-rolled finish
  return [
    env.DB.prepare(
      `INSERT INTO instances (design_id, edition, owner_id, created_at, foil, foil_seed, pattern, effect)
       SELECT d.id, COALESCE((SELECT MAX(edition) FROM instances WHERE design_id = d.id), 0) + 1, ?, ?, ?, ?, ?, ?
       FROM designs d
       WHERE d.id = ? AND d.status = 'active'
         AND (d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances WHERE design_id = d.id) < d.max_editions)`
    ).bind(ownerId, t, foil.id, foil.seed, foil.pattern, foil.effect, designId),
    env.DB.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT last_insert_rowid(), ?, ?, ?, ?, ? WHERE changes() = 1`
    ).bind(fromUser, ownerId, reason, opts.refId ?? null, t),
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
