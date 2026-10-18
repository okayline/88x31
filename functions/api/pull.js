// Daily pull: 3 banners shown, keep 1, optionally pass one of the others to another player.
// Players get PULLS_PER_DAY packs a day. Each pack is a row in daily_pulls keyed by
// "YYYY-MM-DD" (the first) or "YYYY-MM-DD#2", "#3"... ; only one is open at a time.
// Bonus packs (from picking a BONUS PACK card) are "YYYY-MM-DD#b1", "#b2"... and don't count
// toward the daily limit. A bonus pack never contains another bonus card.
// GET  /api/pull -> { day, status, options: [design...], kept_index, passed_index, passed_to, odds,
//                     pull_number, pulls_per_day }
// POST /api/pull { keep: 0-2, pass?: 0-2, to?: NAME | "__random__" } -> { ok, kept, passed, to }
//   One of the other two is always sent (pass defaults to the first, to defaults to a random real player).
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { ODDS, PULLS_PER_DAY, BONUS_CHANCE, BONUS, today, rollDesigns, mintStatements, userByName } from "../../lib/game.js";

const RANDOM = "__random__";   // the "random person" choice

async function loadPull(env, userId, day) {
  return env.DB.prepare(
    `SELECT p.day, p.status, p.options, p.kept_index, p.passed_index, u.name AS passed_to
     FROM daily_pulls p LEFT JOIN users u ON u.id = p.passed_to
     WHERE p.user_id = ? AND p.day = ?`
  ).bind(userId, day).first();
}

// Today's packs for a player, oldest first.
async function todaysPulls(env, userId) {
  const d = today();
  const { results } = await env.DB.prepare(
    "SELECT day, status FROM daily_pulls WHERE user_id = ? AND (day = ? OR day LIKE ?) ORDER BY created_at, day"
  ).bind(userId, d, d + "#%").all();
  return results;
}

async function designsById(env, allIds) {
  const ids = allIds.filter((id) => id !== BONUS);
  if (!ids.length) return allIds.map(() => ({ bonus: true }));
  const { results } = await env.DB.prepare(
    `SELECT id, name, type, rarity, image_key, max_editions,
            (SELECT COUNT(*) FROM instances WHERE design_id = designs.id) AS minted
     FROM designs WHERE id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all();
  return allIds.map((id) => (id === BONUS ? { bonus: true } : results.find((d) => d.id === id) || null));
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);

  const rows = await todaysPulls(env, user.id);
  const regular = rows.filter((r) => !r.day.includes("#b"));
  let key = (rows.find((r) => r.status === "open") || {}).day;
  if (!key && regular.length < PULLS_PER_DAY) {
    // open the next pack of the day
    key = regular.length === 0 ? today() : `${today()}#${regular.length + 1}`;
    const ids = await rollDesigns(env, 3);
    if (!ids.length) return json({ error: "No banners to pull yet. Check back soon!" }, 503);
    if (Math.random() < BONUS_CHANCE) ids[Math.floor(Math.random() * 3)] = BONUS;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO daily_pulls (user_id, day, options, created_at) VALUES (?, ?, ?, ?)"
    ).bind(user.id, key, JSON.stringify(ids), now()).run();
  }
  if (!key) key = rows[rows.length - 1].day; // all used up: show the last one
  const pull = await loadPull(env, user.id, key);
  const bonus = key.includes("#b");
  const number = bonus ? null : (await todaysPulls(env, user.id)).filter((r) => !r.day.includes("#b")).findIndex((r) => r.day === key) + 1;

  const options = await designsById(env, JSON.parse(pull.options));
  return json({ ...pull, options, odds: ODDS, pull_number: number, pulls_per_day: PULLS_PER_DAY, bonus_pack: bonus, bonus_chance: BONUS_CHANCE });
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  const body = await readJson(request);

  const open = (await todaysPulls(env, user.id)).find((r) => r.status === "open");
  if (!open) return json({ error: "No pack open right now. Come back tomorrow!" }, 400);
  const day = open.day;
  const pull = await loadPull(env, user.id, day);

  const ids = JSON.parse(pull.options);
  const keep = Number(body.keep);
  if (![0, 1, 2].includes(keep)) return json({ error: "Pick one to keep." }, 400);

  // Picked the BONUS PACK card: close this pack and open a fresh one right away.
  if (ids[keep] === BONUS) {
    const claim = await env.DB.prepare(
      "UPDATE daily_pulls SET status = 'done', kept_index = ? WHERE user_id = ? AND day = ? AND status = 'open'"
    ).bind(keep, user.id, day).run();
    if (!claim.meta.changes) return json({ error: "You already picked from this pack." }, 400);
    const n = (await todaysPulls(env, user.id)).filter((r) => r.day.includes("#b")).length + 1;
    const fresh = await rollDesigns(env, 3); // never another bonus card
    await env.DB.prepare(
      "INSERT OR IGNORE INTO daily_pulls (user_id, day, options, created_at) VALUES (?, ?, ?, ?)"
    ).bind(user.id, `${today()}#b${n}`, JSON.stringify(fresh), now()).run();
    return json({ ok: true, bonus: true });
  }

  // v0.39: one of the other two always goes to somebody (no "send to nobody"). Which one defaults to the first, and who defaults to a
  // random real player (recently seen first; a bot only if no real player is around, and never for an ultra).
  const others = [0, 1, 2].filter((j) => j !== keep && ids[j] !== BONUS);
  let pass = body.pass === undefined || body.pass === null || body.pass === "" ? others[0] : Number(body.pass);
  if (!others.includes(pass)) return json({ error: "Send one of the other two!" }, 400);
  const ultra = (await env.DB.prepare("SELECT rarity FROM designs WHERE id = ?").bind(ids[pass]).first() || {}).rarity === "ultra";
  let recipient = null;
  if (body.to && body.to !== RANDOM) {
    recipient = await userByName(env, body.to);
    if (!recipient) return json({ error: "No player by that name." }, 404);
    if (recipient.id === user.id) return json({ error: "You can't send one to yourself!" }, 400);
    if (recipient.is_bot && ultra) return json({ error: "An ultra can only go to a real player." }, 400);
  } else {
    const real = (bots) => env.DB.prepare(
      `SELECT id, name, is_bot FROM users WHERE id != ? AND is_bot = ? ORDER BY (last_seen > ?) DESC, RANDOM() LIMIT 1`
    ).bind(user.id, bots, now() - 14 * 86400).first();
    recipient = (await real(0)) || (ultra ? null : await real(1));
    if (!recipient) return json({ error: "There's nobody to send it to yet! Try again later." }, 409);
  }

  // Claim today's pull (only works once, even if two clicks race).
  const claim = await env.DB.prepare(
    `UPDATE daily_pulls SET status = 'done', kept_index = ?, passed_index = ?, passed_to = ?
     WHERE user_id = ? AND day = ? AND status = 'open'`
  ).bind(keep, pass, recipient ? recipient.id : null, user.id, day).run();
  if (!claim.meta.changes) return json({ error: "You already picked from this pack." }, 400);

  const keptRes = await env.DB.batch(await mintStatements(env, ids[keep], user.id, "daily"));
  if (keptRes[0].meta.changes !== 1) {
    // The one you picked sold out a moment ago: reopen so you can choose again.
    await env.DB.prepare(
      "UPDATE daily_pulls SET status = 'open', kept_index = NULL, passed_index = NULL, passed_to = NULL WHERE user_id = ? AND day = ?"
    ).bind(user.id, day).run();
    return json({ error: "Oh no, that one just sold out! Pick another." }, 409);
  }
  const kept = true;

  let passed = false;
  if (recipient) {
    const passRes = await env.DB.batch(await mintStatements(env, ids[pass], recipient.id, "pass_on", user.id));
    passed = passRes[0].meta.changes === 1; // false only if that one sold out
  }
  await sealSafe(env);
  return json({ ok: true, kept, passed, to: recipient.name });
}
