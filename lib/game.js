// Game helpers: rolling designs, minting copies, moving copies between players.
import { now } from "./auth.js";

// Chances out of 1000 for each button in a pull (shown to players as percents).
// v0.31: rares have no copy cap; prototypes (4 copies) and ultras (1 copy) are the capped tiers.
export const ODDS_PER_1000 = { common: 620, uncommon: 280, rare: 80, prototype: 15, ultra: 5 };
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

// Special (limited) packs: better odds (v0.31: rare 11%, prototype 3%, ultra 1%). One card in every
// special pack is also a guaranteed rare (lib/packs.js).
export const SPECIAL_ODDS_PER_1000 = { common: 600, uncommon: 250, rare: 110, prototype: 30, ultra: 10 };
function rollRarity(boost = false) {
  let r = randInt(1000);
  for (const [rarity, pct] of Object.entries(boost ? SPECIAL_ODDS_PER_1000 : ODDS_PER_1000)) {
    if (r < pct) return rarity;
    r -= pct;
  }
  return "common";
}

// Found buttons: a daily (or mixed) pack has a FOUND_CHANCE of one found button; the other cards are
// the cLuB's originals. Series packs and special packs never have found buttons. Found buttons are all
// commons, so their card skips the rarity roll; rares and ultras only come from the originals.
// Bots are web crawlers: their packs are all found buttons, with a CRAWLER_SERIES_CHANCE that one
// card is a series button instead (never an ultra).
export const FOUND_CHANCE = 0.2;
export const CRAWLER_SERIES_CHANCE = 0.1;

// The cLuB's originals come in Series. Up to 3 are active at once; each original card in a pack
// first picks a series (newest gets 60%, then 25%, then 15%), then rolls rarity inside it.
export const SERIES_WEIGHTS = [60, 25, 15];
export const MAX_ACTIVE_SERIES = 3;

// A series' print run: every copy of its buttons counts (fusion doesn't make new copies).
// (v0.46.11) one pass over the copies for every series at once; it was two passes per series, the biggest reader of the database.
export async function seriesPrinted(env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT s.id, s.name, s.status, s.print_run, s.special_name, s.special_limit, s.released_at,
              COALESCE(c.printed, 0) AS printed, c.first_copy
       FROM series s LEFT JOIN (
         SELECT d.series_id, COUNT(*) AS printed, MIN(i.created_at) AS first_copy
         FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.series_id IS NOT NULL GROUP BY d.series_id
       ) c ON c.series_id = s.id`
    ).all();
    return results.map((r) => ({ ...r, out_of_print: r.print_run != null && r.printed >= r.print_run }));
  } catch { return []; }   // before migration 021
}

// Free-pack cards waiting to be signed hold their copy, so a capped button can't sell out under them.
const HELD_FREE = `(SELECT COUNT(*) FROM free_packs fp WHERE fp.design_id = d.id AND fp.claimed_by IS NULL AND fp.created_at > ?)`;
export const FREE_HOLD = 2 * 86400;   // unsigned free-pack cards wait 2 days

// Active designs that still have copies left: originals grouped by series and rarity, plus the
// found pool. Originals only count while their series is active and still in print (designs with
// no series yet, from before series existed, count as part of the newest one).
// onlySeries: just that series. ignoreRun: a sealed pack of that series already "printed", so it
// still opens with it after the run is used up.
export async function availableDesigns(env, onlySeries = null, { ignoreRun = false } = {}) {
  let rows, active = [];
  const runs = await seriesPrinted(env);
  const out = new Set(runs.filter((r) => r.out_of_print).map((r) => r.id));
  const capOk = (held) => `(d.max_editions IS NULL OR (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id)${held ? " + " + HELD_FREE : ""} < d.max_editions)`;
  try {
    active = (await env.DB.prepare(
      "SELECT id FROM series WHERE status = 'active' ORDER BY sort DESC, id DESC LIMIT ?"
    ).bind(MAX_ACTIVE_SERIES).all()).results.map((r) => r.id);
    try {
      rows = (await env.DB.prepare(
        `SELECT d.id, d.rarity, d.tier, d.series_id FROM designs d WHERE d.status = 'active' AND ${capOk(true)}`
      ).bind(now() - FREE_HOLD).all()).results;
    } catch { // before free packs existed
      rows = (await env.DB.prepare(
        `SELECT d.id, d.rarity, d.tier, d.series_id FROM designs d WHERE d.status = 'active' AND ${capOk(false)}`
      ).all()).results;
    }
  } catch { // before migration 016: one big pool
    rows = (await env.DB.prepare(
      `SELECT d.id, d.rarity, d.tier, NULL AS series_id FROM designs d WHERE d.status = 'active' AND ${capOk(false)}`
    ).all()).results;
  }
  const bySeries = new Map(), found = [];
  for (const d of rows) {
    if (d.tier === "archive") { found.push(d.id); continue; }
    const sid = d.series_id ?? active[0] ?? 0;
    if (onlySeries != null) { if (sid !== onlySeries) continue; }
    else if (active.length && !active.includes(sid)) continue;   // upcoming or retired series
    if (out.has(sid) && !(ignoreRun && sid === onlySeries)) continue;   // out of print
    if (!bySeries.has(sid)) bySeries.set(sid, {});
    (bySeries.get(sid)[d.rarity] ||= []).push(d.id);
  }
  // newest first, with their pack weights (out-of-print series drop out, so the rest move up)
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

const RARITY_STEPS = ["ultra", "prototype", "rare", "uncommon", "common"];
const capped = (pool, id) => (pool.ultra || []).includes(id) || (pool.prototype || []).includes(id);

// A rare you already own comes up 1 time for every 10 of one you don't (v0.46.4).
export const OWNED_WEIGHT = 0.1;
function pickLessOwned(choices, owned) {
  const w = choices.map((id) => (owned.has(id) ? OWNED_WEIGHT : 1));
  let r = (randInt(1_000_000) / 1_000_000) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < choices.length; i++) { if (r < w[i]) return choices[i]; r -= w[i]; }
  return choices[choices.length - 1];
}

// Roll n design ids. `force` can pin some cards' rarities, e.g. [null, null, "uncommon"] (always originals).
// opts.series = only that series' originals (a series pack: no found buttons).
// opts.found = chance of one found button (default FOUND_CHANCE; 0 for series and special packs).
// opts.crawler = a bot's pack: found buttons, maybe one series card. opts.boost = special odds.
// opts.ignoreRun = a sealed series pack opens with its series even when it's out of print.
// opts.userId = a player's pack: a rare they already own is OWNED_WEIGHT as likely as one they don't (v0.46.4).
// Tries not to repeat a design within one roll.
export async function rollDesigns(env, n, force = [], opts = {}) {
  const { series, found } = await availableDesigns(env, opts.series ?? null, { ignoreRun: !!opts.ignoreRun });
  const owned = new Set();
  if (opts.userId != null) {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT i.design_id FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.owner_id = ? AND i.consumed = 0 AND d.rarity = 'rare'`
    ).bind(opts.userId).all();
    for (const r of results) owned.add(r.design_id);
  }
  const allOriginals = series.flatMap((s) => Object.values(s.pool).flat());
  if (!allOriginals.length && !found.length) return [];
  const foundChance = opts.found ?? (opts.series != null ? 0 : FOUND_CHANCE);
  // which card(s) come from the found pool: random positions that aren't pinned
  const open = [...Array(n).keys()].filter((i) => !force[i]);
  const foundAt = new Set();
  if (opts.crawler && found.length) {
    open.forEach((i) => foundAt.add(i));
    if (allOriginals.length && chance(CRAWLER_SERIES_CHANCE)) foundAt.delete(open[randInt(open.length)]);
  } else if (found.length && open.length && (chance(foundChance) || !allOriginals.length)) {
    foundAt.add(open[randInt(open.length)]);
  }
  const picked = [];
  for (let i = 0; i < n; i++) {
    if (foundAt.has(i) || !allOriginals.length) {
      if (!found.length) break;
      let fc = found.filter((id) => !picked.includes(id));
      if (!fc.length) fc = found;
      picked.push(fc[randInt(fc.length)]);
      continue;
    }
    const pool = pickSeries(series).pool;
    const all = Object.values(pool).flat();
    let want = force[i] || rollRarity(!!opts.boost);
    if (opts.crawler && (want === "ultra" || want === "prototype")) want = "uncommon";   // bots never pull ultras or prototypes
    let choices = (pool[want] || []).filter((id) => !picked.includes(id));
    // a pinned card that can't be had steps down one rarity at a time (a guaranteed rare with every
    // rare sold out becomes an uncommon), a rolled one falls back to common
    if (!choices.length && force[i]) for (const r of RARITY_STEPS.slice(RARITY_STEPS.indexOf(force[i]) + 1)) {
      choices = (pool[r] || []).filter((id) => !picked.includes(id));
      if (choices.length) break;
    }
    if (!choices.length) choices = (pool.common || []).filter((id) => !picked.includes(id));
    // last resorts never hand out the capped tiers (prototypes, ultras) by accident
    if (!choices.length) choices = all.filter((id) => !picked.includes(id) && !capped(pool, id));
    if (!choices.length) choices = allOriginals.filter((id) => !picked.includes(id) && !series.some((s) => capped(s.pool, id)));
    if (!choices.length) choices = allOriginals;
    picked.push(owned.size ? pickLessOwned(choices, owned) : choices[randInt(choices.length)]);
  }
  return picked;
}

// ---------- foils, patterns, effects ----------
// Every copy has three layers, rolled separately when it's made (see migrations/014):
//   foil    - the material: tier 0 Clear/Glitter/Sheen, tiers 1-3 real foils
//   pattern - how a real foil's shine is cut (Fracture/Etched/Surge); only on tier 1+ foils
//   effect  - how the whole button plays on screen (Dial-Up/Marquee/CRT/VHS)
export const PATTERN_CHANCE = 0.05; // of copies that roll a real (tier 1+) foil
export const EFFECT_CHANCE = 0.0005;  // of all new copies (v0.37: 1 in 2,000, rarer than any foil; was 10%)
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
