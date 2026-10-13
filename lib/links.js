// Link exchange: ask another player to swap links; once both agree, each shows up in the
// other's Cool Links as their "My Button", linking to their homepage (or cLuB guestbook).
import { now } from "./auth.js";

// A player's calling-card button: their chosen My Button if they still own it,
// otherwise the first button on their arranged wall, otherwise their newest.
export const cardSql = (userCol) => `COALESCE(
  (SELECT i.id FROM instances i WHERE i.id = ${userCol}_u.my_button AND i.owner_id = ${userCol}_u.id AND i.consumed = 0),
  (SELECT i.id FROM instances i LEFT JOIN wall_slots w ON w.instance_id = i.id AND w.user_id = i.owner_id
   WHERE i.owner_id = ${userCol}_u.id AND i.consumed = 0 ORDER BY w.slot IS NULL, w.slot, i.id DESC LIMIT 1))`;

// Cool Links for a player (accepted exchanges), with each friend's card button.
export async function coolLinks(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT f_u.id, f_u.name, f_u.homepage, f_u.is_bot, ${cardSql("f")} AS card_id
     FROM link_exchanges l
     JOIN users f_u ON f_u.id = CASE WHEN l.from_user = ? THEN l.to_user ELSE l.from_user END
     WHERE l.status = 'accepted' AND (l.from_user = ? OR l.to_user = ?)
     ORDER BY l.created_at`
  ).bind(userId, userId, userId).all();
  return withCards(env, results);
}

// Attach image/name for each row's card_id.
export async function withCards(env, rows) {
  const ids = rows.map((r) => r.card_id).filter(Boolean);
  if (!ids.length) return rows;
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.edition, i.foil, i.foil_seed, i.pattern, i.effect, d.name, d.image_key, d.rarity, d.max_editions FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all();
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  return rows.map((r) => ({ ...r, card: r.card_id ? by[r.card_id] || null : null }));
}

// Link requests waiting for this player.
export async function incomingLinks(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT u.name, u.is_bot, l.created_at FROM link_exchanges l JOIN users u ON u.id = l.from_user
     WHERE l.to_user = ? AND l.status = 'pending' ORDER BY l.created_at`
  ).bind(userId).all();
  return results;
}

// Where things stand between two players: none | sent | received | linked
export async function linkState(env, a, b) {
  const { results } = await env.DB.prepare(
    "SELECT from_user, status FROM link_exchanges WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)"
  ).bind(a, b, b, a).all();
  if (results.some((r) => r.status === "accepted")) return "linked";
  if (results.some((r) => r.from_user === b)) return "received";
  if (results.some((r) => r.from_user === a)) return "sent";
  return "none";
}

// action: request | accept | decline | remove. Returns { ok, state } or { error }.
export async function linkAction(env, me, other, action) {
  if (me === other) return { error: "You can't link with yourself!" };
  const db = env.DB;
  const state = await linkState(env, me, other);
  if (action === "request") {
    if (state === "linked") return { ok: true, state };
    if (state === "received") return linkAction(env, me, other, "accept"); // they asked first: that's a yes
    await db.prepare("INSERT OR IGNORE INTO link_exchanges (from_user, to_user, created_at) VALUES (?, ?, ?)").bind(me, other, now()).run();
    return { ok: true, state: "sent" };
  }
  if (action === "accept") {
    const r = await db.prepare(
      "UPDATE link_exchanges SET status = 'accepted' WHERE from_user = ? AND to_user = ? AND status = 'pending'"
    ).bind(other, me).run();
    return r.meta.changes ? { ok: true, state: "linked" } : { error: "No link request from them." };
  }
  if (action === "decline" || action === "remove") {
    await db.prepare(
      "DELETE FROM link_exchanges WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)"
    ).bind(me, other, other, me).run();
    return { ok: true, state: "none" };
  }
  return { error: "Unknown action." };
}
