// v0.30: hidden until seen, starter quests, visit streaks, trade-ins, and the series pack for
// filling a rare request. Everything here is safe to run before migration 023: anything that needs
// the new tables quietly does nothing until they exist.
import { now } from "./auth.js";
import { today, seriesPrinted, SERIES_WEIGHTS } from "./game.js";
import { givePacks } from "./packs.js";

// ---------- hidden until seen ----------
// A button counts as seen once you've owned a copy, been shown it in a daily pull, a pack or your
// free pack, or seen it on someone's page (their wall, guestbook, trades or the request board).
// Webmasters see everything. Logged-out visitors get null: callers keep the old rule for them.
export async function seenSet(env, viewer) {
  if (!viewer) return null;
  if (viewer.is_admin) return { has: () => true };
  const parts = [
    "SELECT i.design_id AS id FROM ownership_history h JOIN instances i ON i.id = h.instance_id WHERE h.to_user = ?1",
    "SELECT CAST(j.value AS INTEGER) FROM daily_pulls p, json_each(p.options) j WHERE p.user_id = ?1",
    "SELECT CAST(j.value AS INTEGER) FROM pack_openings o, json_each(o.options) j WHERE o.user_id = ?1",
    "SELECT design_id FROM free_packs WHERE claimed_by = ?1",
  ];
  const run = async (list) => new Set((await env.DB.prepare(list.join(" UNION ")).bind(viewer.id).all()).results.map((r) => Number(r.id)));
  try { return await run([...parts, "SELECT design_id FROM seen_designs WHERE user_id = ?1"]); }
  catch { return run(parts); } // before migration 023
}

// Remember buttons a player saw on someone's page. Never throws.
export async function markSeen(env, viewer, designIds) {
  if (!viewer || viewer.is_admin || viewer.is_bot) return;
  const ids = [...new Set((designIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length) return;
  try {
    const stmts = ids.map((d) => env.DB.prepare("INSERT OR IGNORE INTO seen_designs (user_id, design_id) VALUES (?, ?)").bind(viewer.id, d));
    for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  } catch (e) { console.log("markSeen skipped", e && e.message); }
}

// ---------- rewards that can only happen once ----------
// Claim (user, kind, key) and, only if this call is the one that claimed it, hand out the packs.
// packs: [{ series?, count?, note, source? }] (source defaults to the kind). Returns true if given.
async function rewardOnce(env, userId, kind, key, packs) {
  let claimed;
  try {
    claimed = (await env.DB.prepare("INSERT OR IGNORE INTO rewards (user_id, kind, key, created_at) VALUES (?, ?, ?, ?)")
      .bind(userId, kind, key, now()).run()).meta.changes === 1;
  } catch { return false; } // before migration 023
  if (!claimed) return false;
  for (const p of packs) await givePacks(env, [userId], p.count || 1, { source: p.source || kind, series: p.series ?? null, note: p.note });
  return true;
}

// A series for a series pack: the preferred one if it's active and still in print, otherwise one
// of the active, in-print series picked like pack cards are (newest most often). null = none left.
export async function seriesForPack(env, preferId = null) {
  const live = (await seriesPrinted(env)).filter((s) => s.status === "active" && !s.out_of_print).sort((a, b) => b.id - a.id);
  if (!live.length) return null;
  if (preferId != null && live.some((s) => s.id === preferId)) return preferId;
  const w = live.map((_, i) => SERIES_WEIGHTS[i] ?? 0);
  const total = w.reduce((a, b) => a + b, 0) || 1;
  let r = Math.random() * total;
  for (let i = 0; i < live.length; i++) { r -= w[i]; if (r < 0) return live[i].id; }
  return live[0].id;
}

// A series pack, or a cLuB pack if every series is out of print.
const seriesPack = async (env, note) => ({ series: await seriesForPack(env), note });

// ---------- starter quests ----------
export const QUESTS = [
  { key: "pull", label: "Open your daily pack" },
  { key: "sign", label: "Sign someone's guestbook" },
  { key: "wish", label: "Make a wish on the Request Board" },
];

// { steps: [{ key, label, done }], done, rewarded } (rewarded: the cLuB pack was just given)
export async function questStatus(env, user) {
  const db = env.DB;
  const [pull, sign, wish] = await Promise.all([
    db.prepare("SELECT 1 FROM daily_pulls WHERE user_id = ? AND status = 'done' LIMIT 1").bind(user.id).first(),
    db.prepare("SELECT 1 FROM guestbook_entries WHERE author_id = ? LIMIT 1").bind(user.id).first(),
    db.prepare("SELECT 1 FROM requests WHERE user_id = ? LIMIT 1").bind(user.id).first(),
  ]);
  const done = { pull: !!pull, sign: !!sign, wish: !!wish };
  const steps = QUESTS.map((q) => ({ ...q, done: done[q.key] }));
  let finished = false, rewarded = false;
  try { finished = !!(await db.prepare("SELECT 1 FROM rewards WHERE user_id = ? AND kind = 'quest' AND key = 'starter'").bind(user.id).first()); }
  catch { return { steps, done: false, unavailable: true }; } // before migration 023
  if (!finished && steps.every((s) => s.done) && !user.is_bot) {
    rewarded = await rewardOnce(env, user.id, "quest", "starter", [{ note: "for finishing the starter quests!" }]);
    finished = true;
  }
  return { steps, done: finished, rewarded };
}

// ---------- visit streaks ----------
// Day 2 and 3: a cLuB pack. Day 5: two cLuB packs. Day 7: a series pack. After that, every week:
// a cLuB pack on its 3rd and 5th day and a series pack on its 7th. Missing a day starts over at 1.
export function streakReward(n) {
  if (n <= 1) return null;
  if (n <= 7) return { 2: "club", 3: "club", 5: "club2", 7: "series" }[n] || null;
  return { 3: "club", 5: "club", 7: "series" }[((n - 1) % 7) + 1] || null;
}
// The next day that pays out, for the dashboard: { day, reward }.
export function nextStreakReward(n) {
  for (let d = n + 1; d <= n + 7; d++) { const r = streakReward(d); if (r) return { day: d, reward: r }; }
  return null;
}
const dayBefore = (d) => new Date(Date.parse(d + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

// Count today's visit and give today's streak reward (once). Returns { streak, reward, given } or null.
export async function touchStreak(env, user) {
  if (!user || user.is_bot) return null;
  const db = env.DB, d = today();
  let row;
  try { row = await db.prepare("SELECT last_day, streak FROM visits WHERE user_id = ?").bind(user.id).first(); }
  catch { return null; } // before migration 023
  let streak = 1;
  if (row && row.last_day === d) streak = row.streak;
  else if (row && row.last_day === dayBefore(d)) streak = row.streak + 1;
  if (!row || row.last_day !== d) {
    await db.prepare(
      `INSERT INTO visits (user_id, last_day, streak) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_day = excluded.last_day, streak = excluded.streak WHERE visits.last_day != excluded.last_day`
    ).bind(user.id, d, streak).run();
    // two tabs at once: read back what actually got stored
    streak = (await db.prepare("SELECT streak FROM visits WHERE user_id = ?").bind(user.id).first()).streak;
  }
  const reward = streakReward(streak);
  let given = false;
  if (reward) {
    const note = `day ${streak} visit streak!`;
    const packs = reward === "series" ? [await seriesPack(env, note)] : [{ count: reward === "club2" ? 2 : 1, note }];
    given = await rewardOnce(env, user.id, "streak", d, packs);
  }
  return { streak, reward, given, next: nextStreakReward(streak) };
}

// What each day of this streak week left you (v0.34.7), for the streak track: the streak pack(s)
// you got that day (with the pack's own look and whether it's been opened since). Days are UTC, like the streak.
export async function streakDays(env, userId, n) {
  if (!n) return [];
  const start = n <= 7 ? 2 : n - ((n - 1) % 7);   // day 1 has no streak pack
  const t0 = Date.parse(today() + "T00:00:00Z") / 1000;
  const out = [];
  for (let k = start; k <= n; k++) {
    const from = t0 - (n - k) * 86400, to = from + 86400;
    try {
      const { results: packs } = await env.DB.prepare(
        `SELECT p.id, p.source, p.note, p.keep, p.special, p.special_no, s.special_name, s.special_limit, s.name AS series,
                (p.opened_at IS NOT NULL) AS opened, (SELECT 1 FROM pack_openings o WHERE o.pack_id = p.id) AS revealed
         FROM pack_history h JOIN packs p ON p.id = h.pack_id LEFT JOIN series s ON s.id = p.series_id
         WHERE h.to_user = ? AND h.reason = 'made' AND p.source = 'streak' AND h.created_at >= ? AND h.created_at < ?
         ORDER BY p.id`
      ).bind(userId, from, to).all();
      out.push({ day: k, packs });
    } catch { out.push({ day: k, packs: [] }); }
  }
  return out;
}

// ---------- the series pack for filling a rare request (one a day) ----------
// Returns true if the series pack was given (false: already had today's, or no tables yet).
export async function rareFillPack(env, userId, preferSeries, note) {
  return rewardOnce(env, userId, "rare_fill", today(), [{ source: "request", series: await seriesForPack(env, preferSeries), note }]);
}

// ---------- trade-ins ----------
export const TRADE_IN = 5;
const TRADEABLE_IN = ["common", "uncommon"];

// Turn copies in, TRADE_IN at a time, for sealed cLuB packs. All-or-nothing per batch of 5.
// Returns { ok, packs, used } or { error }.
export async function tradeIn(env, userId, instanceIds) {
  const db = env.DB;
  const ids = [...new Set((Array.isArray(instanceIds) ? instanceIds : []).map(Number).filter((n) => n > 0))];
  if (!ids.length || ids.length % TRADE_IN) return { error: `Pick buttons in groups of ${TRADE_IN}.` };
  if (ids.length > 50) return { error: "That's a lot! Up to 50 buttons at a time." };
  const { results } = await db.prepare(
    `SELECT i.id, i.owner_id, i.locked, i.consumed, d.rarity FROM instances i JOIN designs d ON d.id = i.design_id
     WHERE i.id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all();
  if (results.length !== ids.length || results.some((r) => r.owner_id !== userId || r.consumed)) return { error: "Some of those buttons aren't yours." };
  if (results.some((r) => r.locked)) return { error: "One of those is busy in a trade." };
  if (results.some((r) => !TRADEABLE_IN.includes(r.rarity))) return { error: "Only commons and uncommons can be traded in." };
  const t = now();
  let packs = 0;
  for (let b = 0; b < ids.length; b += TRADE_IN) {
    const batch = ids.slice(b, b + TRADE_IN);
    const token = Math.floor(Math.random() * 2_000_000_000) + 2;
    const q = batch.map(() => "?").join(",");
    const res = await db.batch([
      db.prepare(`UPDATE instances SET locked = ? WHERE id IN (${q}) AND owner_id = ? AND locked = 0 AND consumed = 0`).bind(token, ...batch, userId),
      // all five or nothing: every later step checks that all five got this batch's lock
      ...batch.map((id) => db.prepare(
        `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, created_at)
         SELECT ?, ?, NULL, 'trade_in', ? WHERE (SELECT COUNT(*) FROM instances WHERE locked = ?) = ?`
      ).bind(id, userId, t, token, TRADE_IN)),
      db.prepare(`DELETE FROM wall_slots WHERE user_id = ? AND instance_id IN (${q}) AND (SELECT COUNT(*) FROM instances WHERE locked = ?) = ?`)
        .bind(userId, ...batch, token, TRADE_IN),
      db.prepare(`UPDATE instances SET consumed = 1, owner_id = NULL, locked = 0 WHERE locked = ? AND (SELECT COUNT(*) FROM instances WHERE locked = ?) = ?`)
        .bind(token, token, TRADE_IN),
      db.prepare("UPDATE instances SET locked = 0 WHERE locked = ?").bind(token), // a partial lock: let go
    ]);
    if (res[res.length - 2].meta.changes !== TRADE_IN) break;
    await givePacks(env, [userId], 1, { source: "trade_in", note: `traded in ${TRADE_IN} buttons` });
    packs++;
  }
  return packs ? { ok: true, packs, used: packs * TRADE_IN } : { error: "Couldn't trade those in. Try again!" };
}
