// GET /api/feed -> { items: [{ at, kind, text parts }] }
// Recent trades, gifts, pass-ons and ultra finds, newest first, for the front-page ticker.

const label = (r) => `${r.design} #${r.edition}${r.max_editions ? " of " + r.max_editions : ""}`;

const CACHE_SECONDS = 60;
const MOVE_COLS = `h.reason, h.created_at AS at, f.name AS from_name, t.name AS to_name,
                   d.name AS design, d.rarity, d.max_editions, i.edition`;
const MOVE_JOINS = `JOIN instances i ON i.id = h.instance_id JOIN designs d ON d.id = i.design_id
                    LEFT JOIN users f ON f.id = h.from_user LEFT JOIN users t ON t.id = h.to_user`;

export async function onRequestGet({ env }) {
  // Served from a one-minute cache so lots of visitors share one lookup.
  const t0 = Math.floor(Date.now() / 1000);
  const cached = await env.DB.prepare("SELECT value, updated_at FROM meta WHERE key = 'feed'").first();
  if (cached && t0 - cached.updated_at < CACHE_SECONDS) {
    return new Response(cached.value, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }

  // Each kind of news is looked up through the (reason, id) index: only ~10 rows read each.
  const moves = [];
  for (const reason of ["guestbook", "pass_on", "gift"]) {
    const { results } = await env.DB.prepare(
      `SELECT ${MOVE_COLS} FROM ownership_history h ${MOVE_JOINS}
       WHERE h.reason = ? ORDER BY h.id DESC LIMIT 10`
    ).bind(reason).all();
    moves.push(...results);
  }
  // ultra finds: there are only a handful of ultra copies in existence, so start from those
  const { results: ultras } = await env.DB.prepare(
    `SELECT ${MOVE_COLS} FROM designs d0
     JOIN instances i0 ON i0.design_id = d0.id
     JOIN ownership_history h ON h.instance_id = i0.id AND h.reason IN ('daily', 'welcome')
     ${MOVE_JOINS}
     WHERE d0.rarity = 'ultra'`
  ).all();
  moves.push(...ultras);
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
  const body = JSON.stringify({ items: items.slice(0, 20) });
  await env.DB.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES ('feed', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(body, t0).run();
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
