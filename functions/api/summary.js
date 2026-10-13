// GET /api/summary -> the "Hi, space!" dashboard: packs left, trades waiting, latest gifts in and out,
// new guestbook messages today.
import { json, currentUser } from "../../lib/auth.js";
import { today, PULLS_PER_DAY } from "../../lib/game.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const d = today();
  const db = env.DB;
  const [packs, trades, gotGift, gaveGift, msgs, count] = await Promise.all([
    db.prepare(
      "SELECT COUNT(*) AS n FROM daily_pulls WHERE user_id = ? AND (day = ? OR day LIKE ?) AND day NOT LIKE ? AND status = 'done'"
    ).bind(me.id, d, d + "#%", d + "#b%").first(),
    db.prepare(
      "SELECT COUNT(*) AS n FROM trades WHERE to_user = ? AND status = 'open' AND expires_at > ?"
    ).bind(me.id, Math.floor(Date.now() / 1000)).first(),
    db.prepare(
      `SELECT h.created_at AS at, h.reason, f.name AS who, d.name AS design, i.edition, d.max_editions, i.id
       FROM ownership_history h JOIN instances i ON i.id = h.instance_id JOIN designs d ON d.id = i.design_id
       LEFT JOIN users f ON f.id = h.from_user
       WHERE h.to_user = ? AND h.reason IN ('guestbook', 'pass_on', 'gift', 'trade')
       ORDER BY h.id DESC LIMIT 1`
    ).bind(me.id).first(),
    db.prepare(
      `SELECT h.created_at AS at, h.reason, t.name AS who, d.name AS design, i.edition, d.max_editions, i.id
       FROM ownership_history h JOIN instances i ON i.id = h.instance_id JOIN designs d ON d.id = i.design_id
       LEFT JOIN users t ON t.id = h.to_user
       WHERE h.from_user = ? AND h.reason IN ('guestbook', 'pass_on', 'gift', 'trade')
       ORDER BY h.id DESC LIMIT 1`
    ).bind(me.id).first(),
    db.prepare("SELECT COUNT(*) AS n FROM guestbook_entries WHERE page_user = ? AND day LIKE ?").bind(me.id, d + "%").first(),
    db.prepare("SELECT COUNT(*) AS n FROM instances WHERE owner_id = ? AND consumed = 0").bind(me.id).first(),
  ]);
  return json({
    packs_left: Math.max(0, PULLS_PER_DAY - (packs ? packs.n : 0)),
    pulls_per_day: PULLS_PER_DAY,
    trades_waiting: trades ? trades.n : 0,
    last_received: gotGift || null,
    last_given: gaveGift || null,
    guestbook_today: msgs ? msgs.n : 0,
    buttons: count ? count.n : 0,
  });
}
