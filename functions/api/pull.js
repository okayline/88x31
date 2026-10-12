// Daily pull: 3 banners shown, keep 1, optionally pass one of the others to another player.
// GET  /api/pull -> { day, status, options: [design...], kept_index, passed_index, passed_to, odds }
// POST /api/pull { keep: 0-2, pass?: 0-2, to?: NAME } -> { ok, kept, passed }
import { json, readJson, currentUser, now } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { ODDS, today, rollDesigns, mintStatements, userByName } from "../../lib/game.js";

async function loadPull(env, userId, day) {
  return env.DB.prepare(
    `SELECT p.day, p.status, p.options, p.kept_index, p.passed_index, u.name AS passed_to
     FROM daily_pulls p LEFT JOIN users u ON u.id = p.passed_to
     WHERE p.user_id = ? AND p.day = ?`
  ).bind(userId, day).first();
}

async function designsById(env, ids) {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, name, type, rarity, image_key, max_editions,
            (SELECT COUNT(*) FROM instances WHERE design_id = designs.id) AS minted
     FROM designs WHERE id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all();
  return ids.map((id) => results.find((d) => d.id === id) || null);
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  const day = today();

  let pull = await loadPull(env, user.id, day);
  if (!pull) {
    const ids = await rollDesigns(env, 3);
    if (ids.length) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO daily_pulls (user_id, day, options, created_at) VALUES (?, ?, ?, ?)"
      ).bind(user.id, day, JSON.stringify(ids), now()).run();
    }
    pull = await loadPull(env, user.id, day);
    if (!pull) return json({ error: "No banners to pull yet. Check back soon!" }, 503);
  }

  const options = await designsById(env, JSON.parse(pull.options));
  return json({ ...pull, options, odds: ODDS });
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Not logged in." }, 401);
  const day = today();
  const body = await readJson(request);

  const pull = await loadPull(env, user.id, day);
  if (!pull) return json({ error: "Open today's pull first." }, 400);
  if (pull.status !== "open") return json({ error: "You already picked today. Come back tomorrow!" }, 400);

  const ids = JSON.parse(pull.options);
  const keep = Number(body.keep);
  if (![0, 1, 2].includes(keep)) return json({ error: "Pick one to keep." }, 400);

  let pass = null, recipient = null;
  if (body.pass !== undefined && body.pass !== null && body.pass !== "") {
    pass = Number(body.pass);
    if (![0, 1, 2].includes(pass) || pass === keep) return json({ error: "Pass on one of the other two." }, 400);
    recipient = await userByName(env, body.to);
    if (!recipient) return json({ error: "No player by that name." }, 404);
    if (recipient.id === user.id) return json({ error: "You can't pass one to yourself!" }, 400);
  }

  // Claim today's pull (only works once, even if two clicks race).
  const claim = await env.DB.prepare(
    `UPDATE daily_pulls SET status = 'done', kept_index = ?, passed_index = ?, passed_to = ?
     WHERE user_id = ? AND day = ? AND status = 'open'`
  ).bind(keep, pass, recipient ? recipient.id : null, user.id, day).run();
  if (!claim.meta.changes) return json({ error: "You already picked today." }, 400);

  const keptRes = await env.DB.batch(mintStatements(env, ids[keep], user.id, "daily"));
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
    const passRes = await env.DB.batch(mintStatements(env, ids[pass], recipient.id, "pass_on", user.id));
    passed = passRes[0].meta.changes === 1; // false only if that one sold out
  }
  await sealSafe(env);
  return json({ ok: true, kept, passed });
}
