// GET /api/odds -> every number behind the game, for the Fair Play page.
// Everything here is read from the same settings and registry the game itself rolls with, so the
// page can never disagree with what really happens. Spoiler-safe: counts and odds only, never the
// names of rares, ultras or upcoming buttons. Cached for a minute (meta key 'odds').
import { json } from "../../lib/auth.js";
import {
  ODDS_PER_1000, SPECIAL_ODDS_PER_1000, PULLS_PER_DAY, BONUS_CHANCE, FOUND_CHANCE, CRAWLER_SERIES_CHANCE,
  SERIES_WEIGHTS, MAX_ACTIVE_SERIES, PATTERN_CHANCE, EFFECT_CHANCE, FUSE_EFFECT_CHANCE, TOP_EFFECT, FREE_HOLD,
  finishes, seriesPrinted,
} from "../../lib/game.js";
import { EARNED_KEEP } from "../../lib/packs.js";
import { BOARD_DAYS, MAX_OPEN, REQUEST_PACKS_PER_DAY } from "../../lib/board.js";
import { TRADE_DAYS, MAX_SIDE } from "../../lib/trades.js";
import { MILESTONES } from "./hit.js";
import { FINDER_FOILS, UPLOADS_PER_DAY } from "./upload.js";

const CACHE_SECONDS = 60;
const headers = { "content-type": "application/json", "cache-control": "no-store" };
const pct = (part, total) => (total ? Math.round((part / total) * 100000) / 1000 : 0);   // 3 decimals
const asPct = (per1000) => Object.fromEntries(Object.entries(per1000).map(([k, v]) => [k, pct(v, 1000)]));

// One weighted list -> [{ id, name, tier, pct }], plus each tier's total.
function spread(list, weightOf = (f) => f.weight) {
  const rows = list.map((f) => ({ id: f.id, name: f.name, tier: f.tier || 0, w: Math.max(0, weightOf(f) ?? 0) })).filter((f) => f.w > 0);
  const total = rows.reduce((n, f) => n + f.w, 0);
  const items = rows.map((f) => ({ id: f.id, name: f.name, tier: f.tier, pct: pct(f.w, total) })).sort((a, b) => a.tier - b.tier || b.pct - a.pct);
  const tiers = {};
  for (const f of items) tiers[f.tier] = Math.round(((tiers[f.tier] || 0) + f.pct) * 1000) / 1000;
  return { items, tiers };
}

export async function onRequestGet({ env }) {
  const t0 = Math.floor(Date.now() / 1000);
  const cached = await env.DB.prepare("SELECT value, updated_at FROM meta WHERE key = 'odds'").first();
  if (cached && t0 - cached.updated_at < CACHE_SECONDS) return new Response(cached.value, { headers });

  // ---- finishes (foils, patterns, effects), from the live registry ----
  const reg = await finishes(env);
  const general = reg.foil.filter((f) => f.design_id == null);          // signature foils belong to one ultra each
  const signature = reg.foil.filter((f) => f.design_id != null).length;
  const mult = (t) => (t >= 2 ? 3 : t === 1 ? 2.5 : 1);                   // same as lib/packs.js specialFinishes
  const foils = {
    normal: spread(general),
    special: spread(general, (f) => Math.round(f.weight * mult(f.tier || 0))),
    finder: spread(general, (f) => (FINDER_FOILS[f.id] != null ? FINDER_FOILS[f.id] : f.weight)),
    free: spread(general.filter((f) => (f.tier || 0) <= 1)),
    signature,
    patterns: spread(reg.pattern).items,
    effects: spread(reg.effect.filter((e) => e.id !== TOP_EFFECT)).items,
    pattern_chance: PATTERN_CHANCE * 100, effect_chance: EFFECT_CHANCE * 100, fuse_effect_chance: FUSE_EFFECT_CHANCE * 100,
    top_effect: (reg.effect.find((e) => e.id === TOP_EFFECT) || {}).name || "CRT+VHS",
    special_boost: { tier1: 2.5, tier2: 3, tier3: 3 },
  };

  // ---- series: print runs and limited packs (not upcoming ones) ----
  const runs = (await seriesPrinted(env)).filter((s) => s.status !== "upcoming");
  let specials = {}, sizes = [];
  try {
    specials = Object.fromEntries((await env.DB.prepare(
      "SELECT series_id, MAX(special_no) AS made FROM packs WHERE special_no IS NOT NULL GROUP BY series_id"
    ).all()).results.map((r) => [r.series_id, r.made]));
  } catch {}
  try {
    sizes = (await env.DB.prepare(
      `SELECT d.series_id, d.rarity, COUNT(*) AS buttons, MAX(d.max_editions) AS cap FROM designs d
       WHERE d.status = 'active' AND d.series_id IS NOT NULL AND d.tier != 'archive' GROUP BY d.series_id, d.rarity`
    ).all()).results;
  } catch {}
  // which series a cLuB card comes from: newest active gets SERIES_WEIGHTS[0], then [1], [2];
  // out-of-print series drop out and the rest move up; the weights are shares of their total (lib/game.js pickSeries)
  let order = [];
  try { order = (await env.DB.prepare("SELECT id FROM series WHERE status = 'active' ORDER BY sort DESC, id DESC LIMIT ?").bind(MAX_ACTIVE_SERIES).all()).results.map((r) => r.id); } catch {}
  const oop = new Set(runs.filter((s) => s.out_of_print).map((s) => s.id));
  order = order.filter((id) => !oop.has(id));
  const wTotal = order.reduce((n, _, i) => n + (SERIES_WEIGHTS[i] ?? 0), 0);
  const series = runs.map((s) => {
    const made = specials[s.id] || 0, limit = s.special_limit ?? 25;
    const rank = order.indexOf(s.id);
    return {
      name: s.name, status: s.status, print_run: s.print_run ?? null, printed: s.printed,
      left: s.print_run != null ? Math.max(0, s.print_run - s.printed) : null, out_of_print: !!s.out_of_print,
      special_name: s.special_name || "Special", special_limit: limit, special_made: made, special_left: Math.max(0, limit - made),
      pack_share: rank >= 0 ? pct(SERIES_WEIGHTS[rank] ?? 0, wTotal) : 0,   // % of cLuB cards in daily and ~*~ cLuB ~*~ packs
      buttons: Object.fromEntries(sizes.filter((z) => z.series_id === s.id).map((z) => [z.rarity, { count: z.buttons, cap: z.cap }])),
    };
  });
  let found = 0;
  try { found = (await env.DB.prepare("SELECT COUNT(*) AS n FROM designs WHERE status = 'active' AND tier = 'archive'").first()).n; } catch {}

  const free1000 = { common: ODDS_PER_1000.common, uncommon: ODDS_PER_1000.uncommon, rare: ODDS_PER_1000.rare };
  const freeTotal = free1000.common + free1000.uncommon + free1000.rare;
  const body = JSON.stringify({
    rarity: { normal: asPct(ODDS_PER_1000), special: asPct(SPECIAL_ODDS_PER_1000),
      free: Object.fromEntries(Object.entries(free1000).map(([k, v]) => [k, pct(v, freeTotal)])) },
    packs: {
      daily: { cards: 3, keep: 1, per_day: PULLS_PER_DAY, found_chance: FOUND_CHANCE * 100, bonus_chance: BONUS_CHANCE * 100, reset_utc: "00:00" },
      sealed: { cards: 3, keep: EARNED_KEEP },
      series_weights: SERIES_WEIGHTS, max_active_series: MAX_ACTIVE_SERIES,
      free: { cards: 1, hold_days: FREE_HOLD / 86400 },
    },
    foils, series, found_buttons: found,
    board: { days: BOARD_DAYS, max_open: MAX_OPEN, thank_packs_per_day: REQUEST_PACKS_PER_DAY, requestable: ["common", "uncommon"] },
    trades: { days: TRADE_DAYS, max_side: MAX_SIDE },
    bots: { crawler_series_chance: CRAWLER_SERIES_CHANCE * 100 },
    milestones: MILESTONES, uploads_per_day: UPLOADS_PER_DAY,
  });
  await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('odds', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(body, t0).run();
  return new Response(body, { headers });
}
