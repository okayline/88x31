// The bots: 90s web personalities who play once a day, spread out through the day.
//
// Each bot has "online hours" (Hawaii time). Every day it gets its own schedule inside those
// hours: one time to open its pack, and a time for each guestbook it signs. Whenever anyone
// visits the site, any bot actions whose time has passed run then (each is claimed once in
// bot_runs, so it can't happen twice). Each bot opens a pull of 3. Bots are web crawlers: their
// pulls are found buttons, with a small chance of one series button (never ultras, a rare only
// while at least half its copies are left, nothing from a series that's out of print). It keeps one by its
// own taste, sometimes passes one on, and signs a guestbook or two in its own slang,
// sometimes stamping a gift. Hoarders keep their holos; givers hand them to real players.
// Everything goes through the normal minting/transfer code, so the ledger records it all.
import { now } from "./auth.js";
import { ODDS_PER_1000, PULLS_PER_DAY, CRAWLER_SERIES_CHANCE, seriesPrinted, today, mintStatements, transferStatements, newLockToken, lockedBy } from "./game.js";
import { sealSafe } from "./ledger.js";
import { weekOf, ensureWall, setPrivate, placePin, matches, BTN_W, BTN_H } from "./themewall.js";
import { listTrades, acceptTrade, closeByUser } from "./trades.js";
import { fuse } from "./fusion.js";
import { botOpenPacks } from "./packs.js";
import { boardFor, postRequest, fillRequest } from "./board.js";

export const BOTS = [
  {
    name: "1337h4X0R-bot", theme: "hacker", trades: "greedy", replyChance: 0.5, thankGiftChance: 0.1,
    replies: ["thx 4 s1gn1ng n00b <3", "gr33tz b4ck fr0m th3 m41nfr4m3", "u h4v3 b33n g1ft3d. j/k... unl3ss?"],
    hours: [20, 27], keeps: "rarest", holos: "hoard", signs: 2, giftChance: 0.15,
    lines: ["ph34r my l33t c0ll3ct10n", "n1c3 p4g3 n00b, j/k <3", "h4x0r3d ur gu3stb00k lol", "0wn3d. j/k k33p 1t r34l", "w3b r1ng 4 l1f3"],
  },
  {
    name: "xX_KaWaII_xX-bot", theme: "bubblegum", trades: "soft", replyChance: 0.95, thankGiftChance: 0.5,
    replies: ["thx 4 signing!! :3", "omg hiii!! ^_^ *hugs back*", "ur so nice!! here's a lil something~"],
    hours: [15, 22], keeps: "random", holos: "give", signs: 3, giftChance: 0.6,
    lines: ["kewl page :3", "omg ur buttons r sooo cute ^_^", "*hugs* 4 visiting my page!! :3", "uwu i left u a present~", "luv ur guestbook!! (^o^)/"],
  },
  {
    name: "SkAt3rDuDe-bot", theme: "construction", trades: "fair", replyChance: 0.7, thankGiftChance: 0.3,
    replies: ["thanks dude, ur rad!", "right back atcha bro", "stoked u stopped by!!"],
    hours: [10, 18], keeps: "type:neon", holos: "give", signs: 2, giftChance: 0.35,
    lines: ["totally radical page dude!!", "gnarly collection, cowabunga", "this page is da bomb", "tubular buttons bro", "ur site rulez, no doubt"],
  },
  {
    name: "DiAl_Up_DaVe-bot", theme: "geo", trades: "greedy", replyChance: 0.35, thankGiftChance: 0.15,
    replies: ["sorry 4 slow reply, modem died lol", "finally got online!! thx 4 signing", "brb... ok back. thanks!!"],
    hours: [19, 25], keeps: "type:counter", holos: "hoard", signs: 1, giftChance: 0.2,
    lines: ["brb mom needs the phone line", "page took 4 min 2 load but worth it!!", "*screeeech* ok im back online", "added u 2 my bookmarks!", "nice hit counter, mine is at 000042"],
  },
  {
    name: "AnGeLbAbY-bot", theme: "vapor", trades: "soft", replyChance: 0.9, thankGiftChance: 0.4,
    replies: ["awww thank u!!! ~*~", "ur the sweetest!! *sparkles*", "signing back!! BFFs!!"],
    hours: [14, 21], keeps: "type:guestbook", holos: "give", signs: 3, giftChance: 0.5,
    lines: ["luv ur page!!! ~*~*~", "sparkle sparkle!! *~*", "ur page is like soooo pretty", "BFF 4 ever!!! sign mine 2!!", "sending good vibes ~*~"],
  },
  {
    name: "GoThIcRaVeN-bot", theme: "goth", trades: "rares-only", replyChance: 0.3, thankGiftChance: 0.05,
    replies: ["...thank you, i suppose", "the shadows noticed your visit", "your words echo in the void"],
    hours: [22, 28], keeps: "rarest", holos: "hoard", signs: 1, giftChance: 0.1,
    lines: ["nice page... i guess", "darkness falls upon your guestbook", "nevermore. also cool buttons", "the void approves of your collection", "*sigh* ...signing anyway"],
  },
  {
    name: "WeBmAsTeR_Ray-bot", theme: "ocean", trades: "fair", replyChance: 0.6, thankGiftChance: 0.25,
    replies: ["thx 4 visiting! pls sign again", "u rock!! come back soon", "ur page is da bomb"],
    hours: [7, 17], keeps: "type:construction", holos: "give", signs: 2, giftChance: 0.3,
    lines: ["best viewed in netscape 4.0!!", "pls link back 2 my page", "under construction 4ever lol", "joined ur webring, thx!!", "made this guestbook entry in notepad"],
  },
];

// Daily caps so bots never flood real players.
const MAX_GIFTS_TO_REAL_PER_DAY = 4;
const RANK = { common: 0, uncommon: 1, rare: 2, prototype: 3, ultra: 4 };
const HST = -10 * 3600; // the bots' day runs on Hawaii time

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// Small seeded random numbers, so a bot's schedule for a day is the same on every request.
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

// Today's day string in Hawaii time, and when that day started (unix seconds).
function botDay(t = now()) {
  const local = t + HST;
  const start = local - (local % 86400);
  return { day: new Date(start * 1000).toISOString().slice(0, 10), start: start - HST };
}

// A bot's actions for a day, each with the time it's due.
function schedule(bot, day, dayStart) {
  const r = seeded(bot.name + "|" + day);
  const [from, to] = bot.hours;
  const at = () => dayStart + Math.floor((from + r() * (to - from)) * 3600);
  const acts = [{ action: "pull", due: at() }];
  for (let n = 2; n <= PULLS_PER_DAY; n++) acts.push({ action: "pull" + n, due: at() });
  for (let n = 1; n <= bot.signs; n++) acts.push({ action: "sign" + n, due: at() });
  acts.push({ action: "check", due: at() }); // second visit: check messages, sign back, swap spares
  acts.push({ action: "wall", due: at() });  // v0.38: put a button up on their rings' Theme Walls if it isn't already
  return acts;
}

// Bot accounts: one small read normally; only writes if a bot account is missing.
// (No save codes, so nobody can log in as them.)
export async function ensureBots(env) {
  const read = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, name, is_bot, theme FROM users WHERE name IN (${BOTS.map(() => "?").join(",")})`
    ).bind(...BOTS.map((b) => b.name)).all();
    return results;
  };
  let rows = await read();
  if (rows.length !== BOTS.length || rows.some((r) => !r.is_bot || !r.theme)) {
    const t = now();
    await env.DB.batch(BOTS.flatMap((b) => [
      env.DB.prepare("INSERT OR IGNORE INTO users (name, is_bot, created_at) VALUES (?, 1, ?)").bind(b.name, t),
      env.DB.prepare("UPDATE users SET is_bot = 1, theme = COALESCE(theme, ?) WHERE name = ?").bind(b.theme, b.name),
    ]));
    rows = await read();
  }
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

// Designs a bot is allowed to pull: never ultras or prototypes; capped rares (the old "of 25" ones)
// only while at least half are left;
// originals only from active series that are still in print.
async function botPool(env) {
  let results;
  try {
    results = (await env.DB.prepare(
      `SELECT d.id, d.rarity, d.type, d.tier, d.max_editions, d.series_id,
              (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted
       FROM designs d LEFT JOIN series s ON s.id = d.series_id
       WHERE d.status = 'active' AND d.rarity NOT IN ('ultra', 'prototype')
         AND (d.tier = 'archive' OR d.series_id IS NULL OR s.status = 'active')`
    ).all()).results;
  } catch {
    results = (await env.DB.prepare(
      `SELECT d.id, d.rarity, d.type, d.tier, d.max_editions,
              (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted
       FROM designs d WHERE d.status = 'active' AND d.rarity NOT IN ('ultra', 'prototype')`
    ).all()).results;
  }
  const out = new Set((await seriesPrinted(env)).filter((r) => r.out_of_print).map((r) => r.id));
  return results.filter((d) => (!d.max_editions || d.minted < d.max_editions / 2) && !(d.series_id != null && out.has(d.series_id)));
}

function rollFor(pool) {
  let r = Math.floor(Math.random() * (1000 - ODDS_PER_1000.ultra - ODDS_PER_1000.prototype));
  let want = "common";
  for (const [rarity, w] of Object.entries(ODDS_PER_1000)) {
    if (rarity === "ultra" || rarity === "prototype") continue;
    if (r < w) { want = rarity; break; }
    r -= w;
  }
  const choices = pool.filter((d) => d.rarity === want);
  return pick(choices.length ? choices : pool);
}

function choose(bot, cards) {
  if (bot.keeps === "rarest") return cards.reduce((a, b) => (RANK[b.rarity] > RANK[a.rarity] ? b : a));
  if (bot.keeps.startsWith("type:")) {
    const fav = cards.filter((c) => c.type === bot.keeps.slice(5));
    if (fav.length) return pick(fav);
  }
  return pick(cards);
}

// Gifts bots have given real players since the bots' day started.
async function giftsToRealToday(env, dayStart) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ownership_history h
     JOIN users f ON f.id = h.from_user AND f.is_bot = 1
     JOIN users t ON t.id = h.to_user AND t.is_bot = 0
     WHERE h.reason IN ('pass_on', 'guestbook') AND h.created_at >= ?`
  ).bind(dayStart).first();
  return row ? row.n : 0;
}

// Bots fuse too: at most once a day, only buttons with no copy limit (commons and uncommons), so
// they never burn the capped copies players are hunting. Hoarders fuse eagerly to chase shinier
// copies; givers rarely bother. Their 3 lowest-finish copies go in.
const FUSE_CHANCE = { hoard: 0.8, give: 0.15 };
export async function maybeFuse(env, bot, me, ctx) {
  if (!chance(FUSE_CHANCE[bot.holos] ?? 0.3)) return;
  const done = await env.DB.prepare("SELECT COUNT(*) AS n FROM fusions WHERE user_id = ? AND created_at >= ?").bind(me, ctx.dayStart).first();
  if (done && done.n) return;
  const { results } = await env.DB.prepare(
    `SELECT i.design_id, COUNT(*) AS n FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.owner_id = ? AND i.consumed = 0 AND i.locked = 0
       AND d.max_editions IS NULL AND d.rarity IN ('common', 'uncommon')
     GROUP BY i.design_id HAVING n >= 3`
  ).bind(me).all();
  if (!results.length) return;
  const { design_id } = pick(results);
  const { results: copies } = await env.DB.prepare(
    `SELECT i.id FROM instances i LEFT JOIN foils f ON f.id = i.foil
     WHERE i.owner_id = ? AND i.design_id = ? AND i.consumed = 0 AND i.locked = 0
     ORDER BY COALESCE(f.tier, 0), i.pattern IS NOT NULL, i.effect IS NOT NULL, i.edition DESC LIMIT 3`
  ).bind(me, design_id).all();
  if (copies.length === 3) await fuse(env, me, copies.map((c) => c.id));
}

// Bots on the board: givers fill requests (and earn the thank-you pack like anyone), and now and
// then they post a request of their own.
export async function botBoard(env, bot, me) {
  const board = await boardFor(env, me);
  const realFirst = (list) => [...list].sort((a, b) => a.is_bot - b.is_bot);
  // fill a request
  const fillable = realFirst(board.requests.filter((r) => r.can_fill && r.can_fill.length));
  if (fillable.length && chance(bot.holos === "give" ? 0.6 : 0.2)) {
    const r = fillable[0];
    await fillRequest(env, me, r.id, r.can_fill[0].id);
  }
  // post a request for a common/uncommon it doesn't have
  if (chance(0.2)) {
    const want = await env.DB.prepare(
      `SELECT d.id FROM designs d WHERE d.status = 'active' AND d.rarity IN ('common', 'uncommon')
         AND NOT EXISTS (SELECT 1 FROM instances i WHERE i.design_id = d.id AND i.owner_id = ? AND i.consumed = 0)
       ORDER BY RANDOM() LIMIT 1`
    ).bind(me).first();
    if (want) await postRequest(env, me, want.id);
  }
}

async function doPull(env, bot, me, ctx) {
  const pool = await botPool(env);
  if (!pool.length) return;
  // bots are web crawlers: their packs are found buttons dragged home from the old web, with a
  // small chance one card is a series button (so print runs mostly go to real players)
  const originals = pool.filter((d) => d.tier !== "archive"), found = pool.filter((d) => d.tier === "archive");
  let cards;
  if (found.length) {
    const left = [...found];
    cards = [0, 1, 2].map(() => (left.length ? left.splice(Math.floor(Math.random() * left.length), 1)[0] : pick(found)));
    if (originals.length && chance(CRAWLER_SERIES_CHANCE)) cards[Math.floor(Math.random() * 3)] = rollFor(originals);
  } else cards = [rollFor(pool), rollFor(pool), rollFor(pool)];
  const kept = choose(bot, cards);
  await env.DB.batch(await mintStatements(env, kept.id, me, "daily"));
  // hoarders keep a few sealed and rarely open; the rest open most but hold a spare or two to trade
  const packWays = bot.holos === "hoard" ? { spare: 3, chance: 0.3 } : { spare: bot.trades === "soft" ? 1 : 2, chance: 0.7 };
  try { await botOpenPacks(env, me, (cards) => choose(bot, cards), packWays); }
  catch (e) { console.log("bot packs failed", e); }
  try { await maybeFuse(env, bot, me, ctx); } catch (e) { console.log("bot fuse failed", e); }
  try { await botBoard(env, bot, me); } catch (e) { console.log("bot board failed", e); }
  if (chance(0.4)) {
    const to = ctx.target(me);
    const isReal = ctx.realIds.includes(to);
    if (isReal && (await giftsToRealToday(env, ctx.dayStart)) >= MAX_GIFTS_TO_REAL_PER_DAY) return;
    const rest = cards.filter((c) => c !== kept);
    await env.DB.batch(await mintStatements(env, pick(rest).id, to, "pass_on", me));
  }
}

// v0.38: bot rings. Made once (the meta row), owned by the webmaster, who can rename, add themselves to, or close them.
// "Bot Hangout" is the common ring (the webmaster joins that one); "Bots Only" is just the bots.
export async function ensureBotRings(env, ids) {
  const db = env.DB, t = now();
  const claim = await db.prepare("INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES ('bot_rings', '', ?)").bind(t).run();
  if (!claim.meta.changes) return;
  const admin = await db.prepare("SELECT id FROM users WHERE is_admin = 1 AND is_bot = 0 ORDER BY id LIMIT 1").first();
  if (!admin) { await db.prepare("DELETE FROM meta WHERE key = 'bot_rings'").run(); return; }
  for (const name of ["Bot Hangout", "Bots Only"]) {
    const made = await db.prepare("INSERT INTO rings (name, owner_id, created_at, is_default) VALUES (?, ?, ?, 0)").bind(name, admin.id, t).run();
    const ring = made.meta.last_row_id;
    await setPrivate(env, ring, true);   // the bot rings are invisible to anyone who isn't in them
    await db.batch(Object.values(ids).map((id, i) =>
      db.prepare("INSERT OR IGNORE INTO ring_members (ring_id, position, user_id) VALUES (?, ?, ?)").bind(ring, i + 1, id)));
  }
}

// Put a button on each of their rings' walls (one pin a week; re-pinned if the copy they showed has gone).
export async function doWall(env, bot, me) {
  const db = env.DB, week = weekOf(now());
  const { results: rings } = await db.prepare(
    `SELECT r.id, r.name, r.is_default, (SELECT COUNT(*) FROM ring_members m WHERE m.ring_id = r.id AND m.user_id IS NOT NULL) AS members
     FROM ring_members mm JOIN rings r ON r.id = mm.ring_id WHERE mm.user_id = ?`
  ).bind(me).all();
  for (const ring of rings) {
    const wall = await ensureWall(env, ring, week);
    if (wall.locked_at) continue;
    const mine = await db.prepare(
      `SELECT p.x, p.y, (i.id IS NOT NULL AND i.owner_id = p.user_id AND i.consumed = 0 AND i.locked != -1) AS ok
       FROM wall_pins p LEFT JOIN instances i ON i.id = p.instance_id WHERE p.wall_id = ? AND p.user_id = ?`
    ).bind(wall.id, me).first();
    if (mine && mine.ok) continue;
    const { results: copies } = await db.prepare(
      `SELECT i.id, d.type FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.owner_id = ? AND i.consumed = 0 AND i.locked = 0 AND d.status != 'removed'`
    ).bind(me).all();
    if (!copies.length) continue;
    const onTheme = copies.filter((c) => matches(c.type, wall.theme));
    const copy = pick(onTheme.length && chance(0.7) ? onTheme : copies);
    const { results: others } = await db.prepare("SELECT x, y FROM wall_pins WHERE wall_id = ? AND user_id != ?").bind(wall.id, me).all();
    const want = mine ? { x: mine.x, y: mine.y }
      : { x: Math.floor(Math.random() * (wall.size - BTN_W)), y: Math.floor(Math.random() * (wall.size - BTN_H)) };
    const spot = placePin(wall.size, others, want);
    if (!spot) continue;
    await db.prepare(
      `INSERT INTO wall_pins (wall_id, user_id, instance_id, x, y, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (wall_id, user_id) DO UPDATE SET instance_id = excluded.instance_id, x = excluded.x, y = excluded.y, updated_at = excluded.updated_at`
    ).bind(wall.id, me, copy.id, spot.x, spot.y, now()).run();
  }
}

async function doSign(env, bot, me, ctx) {
  const page = ctx.target(me);
  if (page === me) return;
  const message = pick(bot.lines);
  const isReal = ctx.realIds.includes(page);
  let giftId = null;
  if (chance(bot.giftChance) && (!isReal || (await giftsToRealToday(env, ctx.dayStart)) < MAX_GIFTS_TO_REAL_PER_DAY)) {
    // Givers offer holos to real players first; hoarders never give rares away.
    const { results: mine } = await env.DB.prepare(
      `SELECT i.id, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.owner_id = ? AND i.locked = 0 AND i.consumed = 0 AND d.rarity != 'ultra'`
    ).bind(me).all();
    let options = mine;
    if (bot.holos === "hoard") options = mine.filter((m) => m.rarity !== "rare");
    else if (isReal && mine.some((m) => m.rarity === "rare")) options = mine.filter((m) => m.rarity === "rare");
    if (options.length) giftId = pick(options).id;
  }
  try {
    if (!giftId) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO guestbook_entries (page_user, author_id, message, day, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(page, me, message, today(), now()).run();
    } else {
      const token = newLockToken();
      const entry = env.DB.prepare(
        `INSERT INTO guestbook_entries (page_user, author_id, message, instance_id, day, created_at)
         SELECT ?, ?, ?, ?, ?, ? WHERE ${lockedBy}`
      ).bind(page, me, message, giftId, today(), now(), giftId, token);
      await env.DB.batch(transferStatements(env, giftId, me, page, "guestbook", token, [entry]));
    }
  } catch (e) {
    // Already signed that page today: skip.
  }
}

// Pick one of the bot's giftable copies (never ultras; hoarders never give rares).
async function giftableCopy(env, bot, me, preferRare) {
  const { results: mine } = await env.DB.prepare(
    `SELECT i.id, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.owner_id = ? AND i.locked = 0 AND i.consumed = 0 AND d.rarity != 'ultra'`
  ).bind(me).all();
  let options = mine;
  if (bot.holos === "hoard") options = mine.filter((m) => m.rarity !== "rare");
  else if (preferRare && mine.some((m) => m.rarity === "rare")) options = mine.filter((m) => m.rarity === "rare");
  return options.length ? pick(options).id : null;
}

// `dayKey` is the one-per-day key: a normal signature uses today's date, a reply uses
// "<date>:reply", so a bot can sign you AND answer you on the same day (once each).
async function signPage(env, me, page, message, giftId, dayKey = today()) {
  try {
    if (!giftId) {
      const r = await env.DB.prepare(
        "INSERT OR IGNORE INTO guestbook_entries (page_user, author_id, message, day, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(page, me, message, dayKey, now()).run();
      return r.meta.changes === 1;
    }
    const token = newLockToken();
    const entry = env.DB.prepare(
      `INSERT INTO guestbook_entries (page_user, author_id, message, instance_id, day, created_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE ${lockedBy}`
    ).bind(page, me, message, giftId, dayKey, now(), giftId, token);
    const res = await env.DB.batch(transferStatements(env, giftId, me, page, "guestbook", token, [entry]));
    return res[1].meta.changes === 1;
  } catch (e) {
    return false; // already signed that page today
  }
}

// How a bot sizes up a trade offer. Value: common 1, uncommon 3, rare 10 (+2 for its favorite type).
//   greedy     - only if it gets strictly more, and never gives up a rare
//   fair       - if it gets at least as much as it gives
//   soft       - almost always yes, as long as it isn't a total ripoff
//   rares-only - only if it gets a rare, and never gives one up
const VALUE = { common: 1, uncommon: 3, rare: 10 };
// sealed packs (v0.34): 3 picks of unknown buttons. Series packs are worth a bit more, limited
// ones a lot (bots never get those, so this only matters for a player's side of a trade).
const packWorth = (p) => (p.special ? 25 : p.series ? 6 : 4);
export function botLikes(bot, getting, giving, getPacks = [], givePacks = []) {
  const fav = bot.keeps.startsWith("type:") ? bot.keeps.slice(5) : null;
  const worth = (list, packs) => list.reduce((s, b) => s + (VALUE[b.rarity] || 1) + (fav && b.type === fav ? 2 : 0), 0)
    + packs.reduce((s, p) => s + packWorth(p), 0) * (bot.holos === "hoard" ? 1.25 : 1);
  const get = worth(getting, getPacks), give = worth(giving, givePacks);
  const givesRare = giving.some((b) => b.rarity === "rare");
  switch (bot.trades) {
    case "greedy": return !givesRare && get > give;
    case "rares-only": return !givesRare && (getting.some((b) => b.rarity === "rare") || get >= give + 6);
    case "soft": return get >= give * 0.5 && chance(0.9);
    default: return get >= give;
  }
}

// Answer trade offers waiting for this bot (if it remembers to look).
async function answerTrades(env, bot, me) {
  const offers = await listTrades(env, me, { status: "open", limit: 10 });
  for (const t of offers.filter((o) => o.to_user === me)) {
    if (!chance(bot.replyChance)) continue; // didn't get to it this time; it'll still be there (until it expires)
    // "give" = what the offerer gives (the bot gets), "want" = what the bot would give
    const all = [...t.give, ...t.want];
    const types = all.length ? await env.DB.prepare(
      `SELECT i.id, d.type FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.id IN (${all.map(() => "?").join(",")})`
    ).bind(...all.map((b) => b.id)).all() : { results: [] };
    const typeOf = Object.fromEntries(types.results.map((r) => [r.id, r.type]));
    const withType = (list) => list.map((b) => ({ ...b, type: typeOf[b.id] }));
    if (botLikes(bot, withType(t.give), withType(t.want), t.give_packs || [], t.want_packs || [])) await acceptTrade(env, t.id, me);
    else await closeByUser(env, t.id, me, "decline");
  }
}

// The second visit of the day: read new guestbook messages and (maybe) sign back,
// (maybe) send a thank-you gift to people who gifted them, and swap a spare with another bot.
async function doCheck(env, bot, me, ctx) {
  await answerTrades(env, bot, me);
  const last = await env.DB.prepare(
    "SELECT MAX(done_at) AS t FROM bot_runs WHERE bot_id = ? AND action = 'check' AND done_at < ?"
  ).bind(me, now() - 60).first();
  const since = last && last.t ? last.t : ctx.dayStart - 86400;
  const { results: msgs } = await env.DB.prepare(
    `SELECT g.author_id, g.instance_id, u.is_bot FROM guestbook_entries g JOIN users u ON u.id = g.author_id
     WHERE g.page_user = ? AND g.created_at > ? ORDER BY g.created_at LIMIT 5`
  ).bind(me, since).all();

  const answered = new Set();
  for (const m of msgs) {
    if (answered.has(m.author_id)) continue;
    answered.add(m.author_id);
    if (!chance(bot.replyChance)) continue; // forgot, or just not in the mood
    let giftId = null;
    const isReal = !m.is_bot;
    if (m.instance_id && chance(bot.thankGiftChance)
        && (!isReal || (await giftsToRealToday(env, ctx.dayStart)) < MAX_GIFTS_TO_REAL_PER_DAY)) {
      giftId = await giftableCopy(env, bot, me, isReal);
    }
    await signPage(env, me, m.author_id, pick(bot.replies), giftId, today() + ":reply");
  }

  // Swap a duplicate with another bot now and then (keeps buttons moving).
  if (chance(0.5)) {
    const dup = await env.DB.prepare(
      `SELECT MIN(i.id) AS id FROM instances i JOIN designs d ON d.id = i.design_id
       WHERE i.owner_id = ? AND i.locked = 0 AND i.consumed = 0 AND d.rarity != 'ultra'
         ${bot.holos === "hoard" ? "AND d.rarity != 'rare'" : ""}
       GROUP BY i.design_id HAVING COUNT(*) > 1 LIMIT 1`
    ).bind(me).first();
    const others = ctx.botIds.filter((i) => i !== me);
    if (dup && dup.id && others.length) {
      await env.DB.batch(transferStatements(env, dup.id, me, pick(others), "gift", newLockToken()));
    }
  }
}

// Run any bot actions that are due. Safe (and cheap) to call on every page load.
const BOT_GAP = 90;   // seconds between bot actions, at most one per gap

export async function runBotsIfDue(env) {
  const t = now();
  const { day, start } = botDay(t);
  const prev = botDay(t - 86400); // night owls' late-night actions spill past midnight
  const due = [];
  for (const d of [prev, { day, start }]) {
    for (const bot of BOTS) {
      for (const a of schedule(bot, d.day, d.start)) if (a.due <= t) due.push({ bot, day: d.day, ...a });
    }
  }
  if (!due.length) return 0;

  const ids = await ensureBots(env);
  await ensureBotRings(env, ids).catch(() => {});
  const { results: doneRows } = await env.DB.prepare(
    "SELECT bot_id, day, action FROM bot_runs WHERE day IN (?, ?)"
  ).bind(prev.day, day).all();
  const done = new Set(doneRows.map((r) => r.bot_id + ":" + r.day + ":" + r.action));
  const todo = due.filter((d) => !done.has(ids[d.bot.name] + ":" + d.day + ":" + d.action)).sort((a, b) => a.due - b.due);
  if (!todo.length) return 0;

  const { results: realUsers } = await env.DB.prepare("SELECT id FROM users WHERE is_bot = 0").all();
  const realIds = realUsers.map((u) => u.id);
  const botIds = Object.values(ids);
  const ctx = {
    realIds, botIds, dayStart: start,
    // Mostly real players when there are any; bots otherwise.
    target: (selfId) => (realIds.length && chance(0.6)) ? pick(realIds) : pick(botIds.filter((i) => i !== selfId)),
  };

  // Spread them out: the oldest overdue action runs, then the bots rest for BOT_GAP seconds (the meta row is claimed first,
  // so two page loads don't both go). Overdue actions trickle out over later page loads instead of all firing at once.
  const t0 = now();
  const gate = await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('bot_gap', '', ?)
     ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at WHERE meta.updated_at <= ?`
  ).bind(t0, t0 - BOT_GAP).run();
  if (!gate.meta.changes) return 0;

  let ran = 0;
  for (const d of todo.slice(0, 1)) {
    const me = ids[d.bot.name];
    // Claim this action (if another request got it first, skip).
    const claim = await env.DB.prepare(
      "INSERT OR IGNORE INTO bot_runs (bot_id, day, action, done_at) VALUES (?, ?, ?, ?)"
    ).bind(me, d.day, d.action, now()).run();
    if (!claim.meta.changes) continue;
    if (d.action.startsWith("pull")) await doPull(env, d.bot, me, ctx);
    else if (d.action === "check") await doCheck(env, d.bot, me, ctx);
    else if (d.action === "wall") await doWall(env, d.bot, me).catch(() => {});
    else await doSign(env, d.bot, me, ctx);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now(), me),
      // each time a bot comes online counts as a visit on the hit counter
      env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'visits'"),
    ]);
    ran++;
  }
  if (ran) await sealSafe(env);
  return ran;
}
