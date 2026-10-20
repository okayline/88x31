// Guestbooks.
// GET  /api/guestbook?user=NAME -> { owner, entries: [{ author, message, created_at, gift }] }
//   (v0.45.3) bots' entries are left out for everyone; a bot's stamped gift still moves when it signs
// POST /api/guestbook { user, message, instance_id? | pack_id? }
//   Signing can carry one of your banners, or a sealed pack (v0.34), as a gift (the "stamp"):
//   it moves to the page owner and stays shown next to your message. One signature per guestbook per day.
import { json, readJson, currentUser, rateLimit, now } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { listTrades } from "../../lib/trades.js";
import { markSeen } from "../../lib/progress.js";
import { today, userByName, transferStatements, newLockToken, lockedBy } from "../../lib/game.js";

export async function onRequestGet({ request, env }) {
  const owner = await userByName(env, new URL(request.url).searchParams.get("user"));
  if (!owner) return json({ error: "No player by that name." }, 404);

  const { results } = await env.DB.prepare(
    `SELECT g.id, g.message, g.created_at, a.name AS author,
            g.instance_id AS gift_id, i.design_id AS gift_design, i.edition AS gift_edition, i.foil AS gift_foil, i.foil_seed AS gift_foil_seed, i.pattern AS gift_pattern, i.effect AS gift_effect, d.name AS gift_name,
            d.image_key AS gift_image, d.rarity AS gift_rarity, d.max_editions AS gift_max,
            g.pack_id AS gift_pack, p.source AS pack_source, p.note AS pack_note, p.keep AS pack_keep, p.special AS pack_special,
            p.special_no AS pack_special_no, ps.special_name AS pack_special_name, ps.special_limit AS pack_special_limit, ps.name AS pack_series,
            p.created_at AS pack_created_at, (p.opened_at IS NOT NULL) AS pack_opened
     FROM guestbook_entries g
     JOIN users a ON a.id = g.author_id
     LEFT JOIN instances i ON i.id = g.instance_id
     LEFT JOIN designs d ON d.id = i.design_id
     LEFT JOIN packs p ON p.id = g.pack_id
     LEFT JOIN series ps ON ps.id = p.series_id
     WHERE g.page_user = ? AND a.is_bot = 0 ORDER BY g.created_at DESC, g.id DESC LIMIT 100`
  ).bind(owner.id).all();

  const trades = (await listTrades(env, owner.id, { status: "accepted", limit: 30 }))
    .map((t) => ({ id: t.id, at: t.resolved_at, from_name: t.from_name, to_name: t.to_name, give: t.give, want: t.want, give_packs: t.give_packs, want_packs: t.want_packs }));
  const viewer = await currentUser(env, request);
  if (viewer) await markSeen(env, viewer, [...results.map((e) => e.gift_design), ...trades.flatMap((t) => [...t.give, ...t.want].map((i) => i.design_id))]);
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
  const packId = !giftId && body.pack_id ? Number(body.pack_id) : null;

  try {
    if (packId) {
      // a sealed pack as the stamp: it moves only if it's mine, sealed and not in a trade
      const pk = await env.DB.prepare("SELECT owner_id, special FROM packs WHERE id = ?").bind(packId).first();
      if (page.is_bot && pk && pk.special) return json({ error: "Limited packs are for people, not bots!" }, 400);
      const sealedMine = `id = ? AND owner_id = ? AND locked = 0 AND opened_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM pack_openings o WHERE o.pack_id = packs.id)`;
      const r = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO guestbook_entries (page_user, author_id, message, pack_id, day, created_at)
           SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM packs WHERE ${sealedMine})`
        ).bind(page.id, me.id, message, packId, day, t, packId, me.id),
        env.DB.prepare(
          `INSERT INTO pack_history (pack_id, from_user, to_user, reason, created_at)
           SELECT ?, ?, ?, 'guestbook', ? WHERE changes() = 1`
        ).bind(packId, me.id, page.id, t),
        env.DB.prepare(`UPDATE packs SET owner_id = ? WHERE ${sealedMine} AND changes() = 1`).bind(page.id, packId, me.id),
      ]);
      if (r[0].meta.changes !== 1) return json({ error: "That pack isn't yours to give right now (only sealed packs can be stamped)." }, 400);
      await sealSafe(env);
      return json({ ok: true });
    }
    if (!giftId) {
      await env.DB.prepare(
        "INSERT INTO guestbook_entries (page_user, author_id, message, day, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(page.id, me.id, message, day, t).run();
      return json({ ok: true });
    }

    // bots never get ultras (v0.30.3), not even as guestbook gifts
    if (page.is_bot) {
      const g = await env.DB.prepare("SELECT d.rarity FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id = ?").bind(giftId).first();
      if (g && g.rarity === "ultra") return json({ error: "Bots can't take ultras!" }, 400);
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
