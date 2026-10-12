// GET /api/feed -> { items: [{ at, kind, text parts }] }
// Recent trades, gifts, pass-ons and ultra finds, newest first, for the front-page ticker.
import { json } from "../../lib/auth.js";

const label = (r) => `${r.design} #${r.edition}${r.max_editions ? " of " + r.max_editions : ""}`;

export async function onRequestGet({ env }) {
  // gifts, pass-ons and ultra finds (one history row each)
  const { results: moves } = await env.DB.prepare(
    `SELECT h.reason, h.created_at AS at, f.name AS from_name, t.name AS to_name,
            d.name AS design, d.rarity, d.max_editions, i.edition
     FROM ownership_history h
     JOIN instances i ON i.id = h.instance_id JOIN designs d ON d.id = i.design_id
     LEFT JOIN users f ON f.id = h.from_user LEFT JOIN users t ON t.id = h.to_user
     WHERE h.reason IN ('guestbook', 'pass_on', 'gift')
        OR (h.reason IN ('daily', 'welcome') AND d.rarity = 'ultra')
     ORDER BY h.id DESC LIMIT 25`
  ).all();
  // trades (one row per trade, with both sides)
  const { results: trades } = await env.DB.prepare(
    `SELECT t.id, t.resolved_at AS at, f.name AS from_name, u.name AS to_name
     FROM trades t JOIN users f ON f.id = t.from_user JOIN users u ON u.id = t.to_user
     WHERE t.status = 'accepted' ORDER BY t.resolved_at DESC LIMIT 10`
  ).all();
  let items = [];
  if (trades.length) {
    const { results: ti } = await env.DB.prepare(
      `SELECT ti.trade_id, ti.side, d.name AS design, d.max_editions, i.edition
       FROM trade_items ti JOIN instances i ON i.id = ti.instance_id JOIN designs d ON d.id = i.design_id
       WHERE ti.trade_id IN (${trades.map(() => "?").join(",")})`
    ).bind(...trades.map((t) => t.id)).all();
    for (const t of trades) {
      const side = (s) => ti.filter((x) => x.trade_id === t.id && x.side === s).map(label).join(" + ");
      items.push({ at: t.at, kind: "trade", text: `${t.from_name} traded ${side("give")} ⇄ ${side("want")} with ${t.to_name}` });
    }
  }
  const who = (n) => n || "a former player";
  for (const m of moves) {
    let text;
    if (m.reason === "guestbook") text = `${who(m.from_name)} stamped ${label(m)} into ${who(m.to_name)}'s guestbook`;
    else if (m.reason === "pass_on") text = `${who(m.from_name)} passed ${label(m)} on to ${who(m.to_name)}`;
    else if (m.reason === "gift") text = `${who(m.from_name)} gave ${label(m)} to ${who(m.to_name)}`;
    else text = `★ ${who(m.to_name)} found the ULTRA ${label(m)}! ★`;
    items.push({ at: m.at, kind: m.rarity === "ultra" ? "ultra" : m.reason, text });
  }
  items.sort((a, b) => b.at - a.at);
  return json({ items: items.slice(0, 20) });
}
