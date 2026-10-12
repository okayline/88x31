// Guestbooks.
// GET  /api/guestbook?user=NAME -> { owner, entries: [{ author, message, created_at, gift }] }
// POST /api/guestbook { user, message, instance_id? }
//   Signing can carry one of your banners as a gift (the "stamp"): it moves to the page
//   owner and stays shown next to your message. One signature per guestbook per day.
import { json, readJson, currentUser, rateLimit, now } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { listTrades } from "../../lib/trades.js";
import { today, userByName, transferStatements, newLockToken, lockedBy } from "../../lib/game.js";

export async function onRequestGet({ request, env }) {
  const owner = await userByName(env, new URL(request.url).searchParams.get("user"));
  if (!owner) return json({ error: "No player by that name." }, 404);

  const { results } = await env.DB.prepare(
    `SELECT g.id, g.message, g.created_at, a.name AS author, a.is_bot AS author_is_bot,
            g.instance_id AS gift_id, i.edition AS gift_edition, d.name AS gift_name,
            d.image_key AS gift_image, d.rarity AS gift_rarity, d.max_editions AS gift_max
     FROM guestbook_entries g
     JOIN users a ON a.id = g.author_id
     LEFT JOIN instances i ON i.id = g.instance_id
     LEFT JOIN designs d ON d.id = i.design_id
     WHERE g.page_user = ? ORDER BY g.created_at DESC, g.id DESC LIMIT 100`
  ).bind(owner.id).all();

  const trades = (await listTrades(env, owner.id, { status: "accepted", limit: 30 }))
    .map((t) => ({ id: t.id, at: t.resolved_at, from_name: t.from_name, to_name: t.to_name, give: t.give, want: t.want }));
  return json({ owner, entries: results, trades });
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to sign guestbooks." }, 401);
  if (!(await rateLimit(env, request, "sign", 30, 3600))) {
    return json({ error: "Slow down a little! Try again later." }, 429);
  }

  const body = await readJson(request);
  const page = await userByName(env, body.user);
  if (!page) return json({ error: "No player by that name." }, 404);
  if (page.id === me.id) return json({ error: "You can't sign your own guestbook!" }, 400);

  const message = String(body.message || "").trim();
  if (!message) return json({ error: "Write a little message first." }, 400);
  if (message.length > 280) return json({ error: "Keep it under 280 characters." }, 400);

  const day = today();
  const t = now();
  const giftId = body.instance_id ? Number(body.instance_id) : null;

  try {
    if (!giftId) {
      await env.DB.prepare(
        "INSERT INTO guestbook_entries (page_user, author_id, message, day, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(page.id, me.id, message, day, t).run();
      return json({ ok: true });
    }

    // With a gift: lock it, write the entry, log and hand it over, all in one go.
    const token = newLockToken();
    const entry = env.DB.prepare(
      `INSERT INTO guestbook_entries (page_user, author_id, message, instance_id, day, created_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE ${lockedBy}`
    ).bind(page.id, me.id, message, giftId, day, t, giftId, token);
    const results = await env.DB.batch(transferStatements(env, giftId, me.id, page.id, "guestbook", token, [entry]));
    if (results[1].meta.changes !== 1) {
      return json({ error: "That banner isn't yours to give right now." }, 400);
    }
    await sealSafe(env);
    return json({ ok: true });
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return json({ error: "You already signed this guestbook today. Come back tomorrow!" }, 409);
    }
    throw e;
  }
}
