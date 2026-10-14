// Making a new account: a name and its first save code (shown once, only its hash is stored).
// Used by the old sign-up form and by signing the front-page free pack.
import { newSaveCode, hashCode, now } from "./auth.js";
import { sealLedger } from "./ledger.js";

const TAKEN = "Name already taken!";

// Is this name OK to use? Returns null if so, or { error, status }. Checked before anything else
// (like the "are you human" check) so a taken name is the first thing you hear about.
export async function nameProblem(env, name) {
  const clean = String(name || "").trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(clean)) return { error: "Name must be 3-20 letters, numbers, _ or -.", status: 400 };
  if (/-bot$/i.test(clean)) return { error: "Names ending in -bot are saved for the bots!", status: 400 };
  // names the game uses for itself
  if (["everyone", "nobody", "webmaster"].includes(clean.toLowerCase())) return { error: TAKEN, status: 409 };
  const taken = await env.DB.prepare("SELECT 1 FROM users WHERE name = ? COLLATE NOCASE").bind(clean).first();
  if (taken) return { error: TAKEN, status: 409 };
  return null;
}

// Returns { user: { id, name }, code } or { error, status }.
export async function createAccount(env, name) {
  const clean = String(name || "").trim();
  const bad = await nameProblem(env, clean);
  if (bad) return bad;
  const t = now();
  const code = newSaveCode();
  const codeHash = await hashCode(code);
  try {
    const [res] = await env.DB.batch([
      env.DB.prepare("INSERT INTO users (name, created_at) VALUES (?, ?) RETURNING id, name").bind(clean, t),
      env.DB.prepare(
        `INSERT INTO save_codes (user_id, code_hash, label, created_at)
         SELECT id, ?, 'first code', ? FROM users WHERE name = ?`
      ).bind(codeHash, t, clean),
    ]);
    return { user: res.results[0], code };
  } catch {
    return { error: TAKEN, status: 409 };
  }
}

// Where a new player came from and how they joined (shown in the webmaster's New Players box).
// came_from is cleaned to a short site name; anything odd is dropped. Never blocks a sign-up:
// before migration 022 the columns don't exist yet, so a failure is just ignored.
export function cleanCameFrom(raw) {
  const s = String(raw || "").trim().toLowerCase().slice(0, 60);
  if (/^(direct|ref:[a-z0-9_.-]{1,30}|[a-z0-9.-]{1,60}( \(embedded\))?)$/.test(s)) return s;
  return null;
}
export async function noteArrival(env, userId, cameFrom, via) {
  try {
    await env.DB.prepare("UPDATE users SET came_from = ?, joined_via = ? WHERE id = ?")
      .bind(cleanCameFrom(cameFrom), via, userId).run();
  } catch (e) { console.log("noteArrival skipped", e && e.message); }
}

// ---------- removing a player ----------
// One routine for both "Delete My Account" and the webmaster's "Delete this player", so they can
// never drift apart. All-or-nothing. What happens:
//   - their save codes, sessions and passkeys go
//   - their guestbook, the messages they wrote, daily pulls, wall, wishes, open trades, pending trades
//     and unfinished pack openings go
//   - their buttons are retired (copies leave play; edition numbers stay used), and their sealed
//     packs too (owner cleared, so they never open)
//   - history stays: gifts, trades, packs and finds they were part of now show "a former player"
//   - the Ledger is untouched: every pending event is sealed first, and sealed records keep only ids
// Webmasters and bots can't be removed this way. Returns { ok } or { error }.
export async function deleteAccount(env, userId) {
  const u = await env.DB.prepare("SELECT id, is_admin, is_bot FROM users WHERE id = ?").bind(userId).first();
  if (!u) return { error: "No player by that name." };
  if (u.is_admin) return { error: "Webmaster accounts can't be deleted here." };
  if (u.is_bot) return { error: "The bots live here! They can't be deleted." };
  // seal anything not in the Ledger yet, while all its rows still exist
  try { await sealLedger(env); } catch (e) { console.log("seal before delete failed", e); }
  const id = userId;
  const s = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  await env.DB.batch([
    s("DELETE FROM guestbook_entries WHERE author_id = ? OR page_user = ?", id, id),
    s("UPDATE daily_pulls SET passed_to = NULL WHERE passed_to = ?", id),
    s("DELETE FROM daily_pulls WHERE user_id = ?", id),
    s("DELETE FROM wall_slots WHERE user_id = ?", id),
    // trades they're part of: give everyone's locked buttons back, then remove the trades
    s(`UPDATE instances SET locked = 0 WHERE locked IN
         (SELECT lock_token FROM trades WHERE (from_user = ? OR to_user = ?) AND status = 'open')`, id, id),
    s("DELETE FROM trades WHERE from_user = ? OR to_user = ?", id, id),
    // open trades (taken out in v0.28): any left of theirs go, and ones they accepted forget them
    s("UPDATE instances SET locked = 0 WHERE locked IN (SELECT lock_token FROM open_trades WHERE from_user = ? AND status = 'open')", id),
    s("DELETE FROM open_trade_items WHERE open_id IN (SELECT id FROM open_trades WHERE from_user = ?)", id),
    s("DELETE FROM open_trades WHERE from_user = ?", id),
    s("UPDATE open_trades SET accepted_by = NULL WHERE accepted_by = ?", id),
    // the Request Board: their wishes go; wishes they filled forget them
    s("DELETE FROM requests WHERE user_id = ?", id),
    s("UPDATE requests SET filled_by = NULL WHERE filled_by = ?", id),
    // sealed packs: retired (no owner, so they never open); pack history and openings keep the story
    s("UPDATE packs SET owner_id = NULL WHERE owner_id = ?", id),
    s("UPDATE pack_history SET from_user = NULL WHERE from_user = ?", id),
    s("UPDATE pack_history SET to_user = NULL WHERE to_user = ?", id),
    s("DELETE FROM pack_openings WHERE user_id = ?", id),
    s("UPDATE free_packs SET claimed_by = NULL WHERE claimed_by = ?", id),
    // not built yet (webrings), cleaned up so deletion keeps working once they are
    s("UPDATE ring_members SET user_id = NULL WHERE user_id = ?", id),
    s("DELETE FROM rings WHERE owner_id = ?", id),
    s("DELETE FROM fusions WHERE user_id = ?", id),
    // their buttons leave play; travel logs show "a former player"
    s("UPDATE instances SET owner_id = NULL, consumed = 1, locked = 0 WHERE owner_id = ?", id),
    s("UPDATE ownership_history SET from_user = NULL WHERE from_user = ?", id),
    s("UPDATE ownership_history SET to_user = NULL WHERE to_user = ?", id),
    s("UPDATE designs SET creator_id = NULL WHERE creator_id = ?", id),
    s("UPDATE designs SET found_by = NULL WHERE found_by = ?", id),
    s("UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?", id),
    s("UPDATE admin_actions SET user_id = NULL WHERE user_id = ?", id),
    s("DELETE FROM passkey_challenges WHERE user_id = ?", id),
    s("DELETE FROM passkeys WHERE user_id = ?", id),
    s("DELETE FROM users WHERE id = ?", id), // save codes, sessions, set claims, links: cascade
  ]);
  return { ok: true };
}
