// The bots: 90s web personalities who play once a day.
//
// They wake up the first time anyone visits on a new day (UTC). Each bot opens a pull of 3
// (never ultras, and a rare only while at least half its copies are left), keeps one by its
// own taste, sometimes passes one on, and signs a guestbook or two in its own slang,
// sometimes stamping a gift. Hoarders keep their holos; givers hand them to real players.
// Everything goes through the normal minting/transfer code, so the ledger records it all.
import { now } from "./auth.js";
import { ODDS_PER_1000, today, mintStatements, transferStatements, newLockToken, lockedBy } from "./game.js";
import { sealSafe } from "./ledger.js";

export const BOTS = [
  {
    name: "1337h4X0R-bot", keeps: "rarest", holos: "hoard", signs: 2, giftChance: 0.15,
    lines: ["ph34r my l33t c0ll3ct10n", "n1c3 p4g3 n00b, j/k <3", "h4x0r3d ur gu3stb00k lol", "0wn3d. j/k k33p 1t r34l", "w3b r1ng 4 l1f3"],
  },
  {
    name: "xX_KaWaII_xX-bot", keeps: "random", holos: "give", signs: 3, giftChance: 0.6,
    lines: ["kewl page :3", "omg ur buttons r sooo cute ^_^", "*hugs* 4 visiting my page!! :3", "uwu i left u a present~", "luv ur guestbook!! (^o^)/"],
  },
  {
    name: "SkAt3rDuDe-bot", keeps: "type:neon", holos: "give", signs: 2, giftChance: 0.35,
    lines: ["totally radical page dude!!", "gnarly collection, cowabunga", "this page is da bomb", "tubular buttons bro", "ur site rulez, no doubt"],
  },
  {
    name: "DiAl_Up_DaVe-bot", keeps: "type:counter", holos: "hoard", signs: 1, giftChance: 0.2,
    lines: ["brb mom needs the phone line", "page took 4 min 2 load but worth it!!", "*screeeech* ok im back online", "added u 2 my bookmarks!", "nice hit counter, mine is at 000042"],
  },
  {
    name: "AnGeLbAbY-bot", keeps: "type:guestbook", holos: "give", signs: 3, giftChance: 0.5,
    lines: ["luv ur page!!! ~*~*~", "sparkle sparkle!! *~*", "ur page is like soooo pretty", "BFF 4 ever!!! sign mine 2!!", "sending good vibes ~*~"],
  },
  {
    name: "GoThIcRaVeN-bot", keeps: "rarest", holos: "hoard", signs: 1, giftChance: 0.1,
    lines: ["nice page... i guess", "darkness falls upon your guestbook", "nevermore. also cool buttons", "the void approves of your collection", "*sigh* ...signing anyway"],
  },
  {
    name: "WeBmAsTeR_Ray-bot", keeps: "type:construction", holos: "give", signs: 2, giftChance: 0.3,
    lines: ["best viewed in netscape 4.0!!", "pls link back 2 my page", "under construction 4ever lol", "joined ur webring, thx!!", "made this guestbook entry in notepad"],
  },
];

// Daily caps so bots never flood real players.
const MAX_GIFTS_TO_REAL_PER_DAY = 4;
const RANK = { common: 0, uncommon: 1, rare: 2, ultra: 3 };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// Create any missing bot accounts (no save codes, so nobody can log in as them).
async function ensureBots(env) {
  const t = now();
  await env.DB.batch(BOTS.map((b) =>
    env.DB.prepare("INSERT OR IGNORE INTO users (name, is_bot, created_at) VALUES (?, 1, ?)").bind(b.name, t)));
  await env.DB.batch(BOTS.map((b) =>
    env.DB.prepare("UPDATE users SET is_bot = 1 WHERE name = ?").bind(b.name)));
  const { results } = await env.DB.prepare("SELECT id, name FROM users WHERE is_bot = 1").all();
  return Object.fromEntries(results.map((r) => [r.name, r.id]));
}

// Designs a bot is allowed to pull: never ultras; rares only while at least half are left.
async function botPool(env) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.rarity, d.type, d.max_editions,
            (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted
     FROM designs d WHERE d.status = 'active' AND d.rarity != 'ultra'`
  ).all();
  return results.filter((d) => !d.max_editions || d.minted < d.max_editions / 2);
}

function rollFor(pool) {
  let r = Math.floor(Math.random() * (1000 - ODDS_PER_1000.ultra));
  let want = "common";
  for (const [rarity, w] of Object.entries(ODDS_PER_1000)) {
    if (rarity === "ultra") continue;
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

// Run the bots' day if it hasn't happened yet today. Safe to call on every page load.
export async function runBotsIfDue(env) {
  const day = Number(today().replace(/-/g, ""));
  // Claim today's run (only one request wins).
  await env.DB.prepare("INSERT OR IGNORE INTO counters (name, value) VALUES ('bots_day', 0)").run();
  const claim = await env.DB.prepare("UPDATE counters SET value = ? WHERE name = 'bots_day' AND value < ?").bind(day, day).run();
  if (!claim.meta.changes) return false;

  const ids = await ensureBots(env);
  const { results: realUsers } = await env.DB.prepare("SELECT id FROM users WHERE is_bot = 0").all();
  const realIds = realUsers.map((u) => u.id);
  const botIds = Object.values(ids);
  let giftsToReal = 0;
  const target = (selfId) => {
    // Mostly real players when there are any; bots otherwise.
    const others = botIds.filter((i) => i !== selfId);
    if (realIds.length && chance(0.6)) return pick(realIds);
    return pick(others);
  };

  // 1) Daily pulls
  for (const bot of BOTS) {
    const me = ids[bot.name];
    const pool = await botPool(env);
    if (!pool.length) break;
    const cards = [rollFor(pool), rollFor(pool), rollFor(pool)];
    const kept = choose(bot, cards);
    await env.DB.batch(mintStatements(env, kept.id, me, "daily"));
    if (chance(0.4)) {
      const rest = cards.filter((c) => c !== kept);
      const to = target(me);
      const isReal = realIds.includes(to);
      if (!isReal || giftsToReal < MAX_GIFTS_TO_REAL_PER_DAY) {
        await env.DB.batch(mintStatements(env, pick(rest).id, to, "pass_on", me));
        if (isReal) giftsToReal++;
      }
    }
  }

  // 2) Guestbook signings, sometimes with a stamped gift
  const day10 = today();
  for (const bot of BOTS) {
    const me = ids[bot.name];
    for (let n = 0; n < bot.signs; n++) {
      const page = target(me);
      if (page === me) continue;
      const message = pick(bot.lines);
      let giftId = null;
      const isReal = realIds.includes(page);
      if (chance(bot.giftChance) && (!isReal || giftsToReal < MAX_GIFTS_TO_REAL_PER_DAY)) {
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
          ).bind(page, me, message, day10, now()).run();
        } else {
          const token = newLockToken();
          const entry = env.DB.prepare(
            `INSERT INTO guestbook_entries (page_user, author_id, message, instance_id, day, created_at)
             SELECT ?, ?, ?, ?, ?, ? WHERE ${lockedBy}`
          ).bind(page, me, message, giftId, day10, now(), giftId, token);
          const res = await env.DB.batch(transferStatements(env, giftId, me, page, "guestbook", token, [entry]));
          if (res[1].meta.changes === 1 && isReal) giftsToReal++;
        }
      } catch (e) {
        // Already signed that page today: skip.
      }
    }
  }

  await sealSafe(env);
  return true;
}
