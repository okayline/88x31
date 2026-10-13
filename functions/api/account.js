// DELETE /api/account  { confirm: "<your name>" }
// Deletes the logged-in player's account, all-or-nothing:
// - their guestbook (messages received) and the messages they wrote elsewhere
// - their daily pulls
// - their banners are retired (copies vanish; edition numbers stay used)
// - gifts they already gave stay with the recipients; travel logs show "a former player"
// - save codes and sessions go with the account
import { json, readJson, currentUser, endSession } from "../../lib/auth.js";

export async function onRequestDelete({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { confirm } = await readJson(request);
  if (String(confirm || "").trim().toLowerCase() !== me.name.toLowerCase()) {
    return json({ error: "Type your name exactly to confirm." }, 400);
  }

  const id = me.id;
  const s = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  await env.DB.batch([
    s("DELETE FROM guestbook_entries WHERE author_id = ? OR page_user = ?", id, id),
    s("UPDATE daily_pulls SET passed_to = NULL WHERE passed_to = ?", id),
    s("DELETE FROM daily_pulls WHERE user_id = ?", id),
    s("DELETE FROM wall_slots WHERE user_id = ?", id),
    // release buttons locked in this player's open trades (other people's too), then remove the trades
    s(`UPDATE instances SET locked = 0 WHERE locked IN
         (SELECT lock_token FROM trades WHERE (from_user = ? OR to_user = ?) AND status = 'open')`, id, id),
    s("DELETE FROM trades WHERE from_user = ? OR to_user = ?", id, id),
    // Not built yet, but cleaned up here so deletion keeps working once they are:
    s("UPDATE ring_members SET user_id = NULL WHERE user_id = ?", id),
    s("DELETE FROM rings WHERE owner_id = ?", id),
    s("DELETE FROM fusions WHERE user_id = ?", id),
    s("UPDATE instances SET owner_id = NULL, consumed = 1, locked = 0 WHERE owner_id = ?", id),
    s("UPDATE ownership_history SET from_user = NULL WHERE from_user = ?", id),
    s("UPDATE ownership_history SET to_user = NULL WHERE to_user = ?", id),
    s("UPDATE designs SET creator_id = NULL WHERE creator_id = ?", id),
    s("UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?", id),
    s("DELETE FROM passkeys WHERE user_id = ?", id),
    s("DELETE FROM users WHERE id = ?", id), // save codes + sessions cascade
  ]);

  const cookie = await endSession(env, request);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}
