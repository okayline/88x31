// Sealed packs: a pack is an item until it's opened. It's made when someone earns it (a webmaster
// gift, a visitor milestone, finishing a set...), can sit on a shelf or be given away, and only
// rolls its buttons when it's opened, so nobody can peek. Opening shows 3 buttons; you keep
// `keep` of them (2 for earned packs). Each step goes on the ledger:
//   pack_history  -> kind 'pack'      (made, given)
//   pack_openings -> kind 'pack_open' (the 3 buttons it held and the copies that came out)
// Copies made from a pack carry reason 'pack' with the pack's id, so their travel log links back.
import { now } from "./auth.js";
import { rollDesigns, mintStatements, rollFoil, finishes } from "./game.js";

export const EARNED_KEEP = 2;

// Statements that make one sealed pack for a player (run in a batch). specialNo: a limited
// special pack's number in its series' run.
function makeStatements(env, ownerId, { series = null, source, note = null, keep = EARNED_KEEP, special = false }, t, specialNo = null) {
  const insert = specialNo != null
    ? env.DB.prepare("INSERT INTO packs (owner_id, series_id, source, note, keep, special, special_no, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(ownerId, series, source, note, keep, specialNo, t)
    : env.DB.prepare("INSERT INTO packs (owner_id, series_id, source, note, keep, special, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(ownerId, series, source, note, keep, special ? 1 : 0, t);
  return [
    insert,
    env.DB.prepare(
      "INSERT INTO pack_history (pack_id, from_user, to_user, reason, created_at) SELECT last_insert_rowid(), NULL, ?, 'made', ?"
    ).bind(ownerId, t),
  ];
}

// A series' limited special packs: { name, limit, made, left } (made = numbers handed out so far).
export async function specialRun(env, seriesId) {
  const s = await env.DB.prepare("SELECT name, special_name, special_limit FROM series WHERE id = ?").bind(seriesId).first();
  if (!s) return null;
  const made = (await env.DB.prepare("SELECT COALESCE(MAX(special_no), 0) AS n FROM packs WHERE series_id = ? AND special_no IS NOT NULL")
    .bind(seriesId).first()).n;
  const limit = s.special_limit ?? 25;
  return { series: s.name, name: s.special_name || "Special", limit, made, left: Math.max(0, limit - made) };
}

// Give `count` packs to each of these players. Returns how many were made.
// Special packs are limited and numbered per series: they need a series, and each gets the next number.
export async function givePacks(env, userIds, count, opts) {
  const t = now();
  const stmts = [];
  let no = null;
  if (opts.special && opts.series != null) {
    const run = await specialRun(env, opts.series);
    if (!run || run.left < userIds.length * count) throw new Error(run ? `Only ${run.left} ${run.series} ${run.name} Pack${run.left === 1 ? "" : "s"} left.` : "No such series.");
    no = run.made;
  }
  for (const id of userIds) for (let i = 0; i < count; i++) stmts.push(...makeStatements(env, id, opts, t, no != null ? ++no : null));
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90)); // keep batches modest
  return userIds.length * count;
}

// Everyone in the cLuB (bots too).
export async function everyoneIds(env) {
  return (await env.DB.prepare("SELECT id FROM users").all()).results.map((r) => r.id);
}

async function designsFor(env, ids) {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.name, d.type, d.rarity, d.image_key, d.tier, d.max_editions, s.name AS series,
            (SELECT COUNT(*) FROM instances WHERE design_id = d.id) AS minted
     FROM designs d LEFT JOIN series s ON s.id = d.series_id WHERE d.id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all();
  return ids.map((id) => results.find((d) => d.id === id) || null);
}

// Open a sealed pack (or come back to one you opened but haven't picked from yet).
// Returns { pack, options: [design...], keep } or { error }.
// opts.crawler: a bot is opening it (web crawler: found buttons, maybe one series card); special packs
// open normally even for bots.
export async function openPack(env, userId, packId, opts = {}) {
  const db = env.DB;
  const pack = await db.prepare("SELECT * FROM packs WHERE id = ?").bind(packId).first();
  if (!pack || pack.owner_id !== userId) return { error: "That pack isn't yours." };
  if (pack.opened_at) return { error: "That pack is already open." };
  let opening = await db.prepare("SELECT * FROM pack_openings WHERE pack_id = ?").bind(packId).first();
  if (!opening) {
    if (pack.locked) return { error: "That pack is busy right now." };
    const special = !!pack.special;
    // special packs: one card is a guaranteed rare, and the others roll at the special odds
    const force = special ? [null, null, null] : [];
    if (special) force[Math.floor(Math.random() * 3)] = "rare";
    // series and special packs: no found buttons, and a sealed series pack still opens with its
    // series after the print run is used up (it was already "printed")
    const ids = await rollDesigns(env, 3, force, {
      series: pack.series_id ?? null, boost: special, ignoreRun: pack.series_id != null,
      found: special || pack.series_id != null ? 0 : undefined, crawler: !!opts.crawler && !special,
    });
    if (!ids.length) return { error: "No buttons to put in packs yet!" };
    const fins = special ? await specialFinishes(env, ids) : null;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO pack_openings (pack_id, user_id, options, opened_at, finishes) VALUES (?, ?, ?, ?, ?)")
        .bind(packId, userId, JSON.stringify(ids), now(), fins ? JSON.stringify(fins) : null),
      db.prepare("UPDATE packs SET locked = 1 WHERE id = ?").bind(packId), // revealed packs can't be given away
    ]);
    opening = await db.prepare("SELECT * FROM pack_openings WHERE pack_id = ?").bind(packId).first();
  }
  const options = await designsFor(env, JSON.parse(opening.options));
  if (opening.finishes) JSON.parse(opening.finishes).forEach((f, i) => { if (options[i] && f) Object.assign(options[i], { foil: f.id, foil_seed: f.seed, pattern: f.pattern, effect: f.effect }); });
  return { pack, keep: pack.keep, special: !!pack.special, options };
}

// Special packs roll each card's finish when opened (so you see them before choosing):
// real foils about 2.5x as likely (~20%), tier 2 and 3 three times as likely, and at least one card foiled.
async function specialFinishes(env, ids) {
  const reg = await finishes(env);
  const mult = (t) => (t >= 2 ? 3 : t === 1 ? 2.5 : 1);
  const boosted = Object.fromEntries(reg.foil.filter((f) => !f.design_id).map((f) => [f.id, Math.round(f.weight * mult(f.tier || 0))]));
  const foilOnly = Object.fromEntries(reg.foil.filter((f) => !f.design_id).map((f) => [f.id, (f.tier || 0) >= 1 ? Math.round(f.weight * mult(f.tier)) : 0]));
  const tierOf = (id) => (reg.foil.find((f) => f.id === id) || { tier: 0 }).tier || 0;
  const fins = [];
  for (const id of ids) fins.push(await rollFoil(env, id, boosted));
  if (!fins.some((f) => tierOf(f.id) >= 1)) {
    const k = Math.floor(Math.random() * ids.length);
    fins[k] = await rollFoil(env, ids[k], foilOnly);
  }
  return fins;
}

// Keep some of an opened pack's buttons (by position 0-2). Returns { ok, kept: [instance ids] } or { error }.
export async function keepFromPack(env, userId, packId, picks, { allowFewer = false } = {}) {
  const db = env.DB;
  const pack = await db.prepare("SELECT * FROM packs WHERE id = ?").bind(packId).first();
  const opening = await db.prepare("SELECT * FROM pack_openings WHERE pack_id = ?").bind(packId).first();
  if (!pack || pack.owner_id !== userId || !opening) return { error: "Open the pack first." };
  if (opening.done_at) return { error: "You already picked from this pack." };
  const ids = JSON.parse(opening.options);
  picks = [...new Set((picks || []).map(Number))].filter((i) => i >= 0 && i < ids.length);
  const want = Math.min(pack.keep, ids.length);
  if (picks.length !== want && !(allowFewer && picks.length <= want)) return { error: `Pick ${want} to keep.` };
  // claim it first so a double click can't keep twice
  const claim = await db.prepare("UPDATE pack_openings SET done_at = ? WHERE pack_id = ? AND done_at IS NULL").bind(now(), packId).run();
  if (!claim.meta.changes) return { error: "You already picked from this pack." };
  const fins = opening.finishes ? JSON.parse(opening.finishes) : null;
  for (const i of picks) await db.batch(await mintStatements(env, ids[i], userId, "pack", null, { refId: packId, finish: fins && fins[i] ? fins[i] : undefined }));
  const { results } = await db.prepare(
    "SELECT instance_id FROM ownership_history WHERE reason = 'pack' AND ref_id = ? ORDER BY id"
  ).bind(packId).all();
  const kept = results.map((r) => r.instance_id);
  await db.batch([
    db.prepare("UPDATE pack_openings SET kept = ? WHERE pack_id = ?").bind(JSON.stringify(kept), packId),
    db.prepare("UPDATE packs SET opened_at = ?, locked = 0 WHERE id = ?").bind(now(), packId),
  ]);
  return { ok: true, kept, sold_out: picks.length - kept.length };
}

// Give a sealed (unopened, unrevealed) pack to another player.
export async function givePack(env, fromId, toId, packId) {
  const db = env.DB;
  if (fromId === toId) return { error: "You can't give a pack to yourself!" };
  const t = now();
  const res = await db.batch([
    db.prepare("UPDATE packs SET owner_id = ? WHERE id = ? AND owner_id = ? AND opened_at IS NULL AND locked = 0")
      .bind(toId, packId, fromId),
    db.prepare(
      "INSERT INTO pack_history (pack_id, from_user, to_user, reason, created_at) SELECT ?, ?, ?, 'gift', ? WHERE changes() = 1"
    ).bind(packId, fromId, toId, t),
  ]);
  return res[0].meta.changes === 1 ? { ok: true } : { error: "You can't give that pack (opened, or not yours)." };
}

// A player's unopened packs (including ones opened but not picked from yet).
export async function packsOf(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.source, p.note, p.keep, p.special, p.special_no, s.special_name, s.special_limit, p.created_at, s.name AS series,
            (SELECT 1 FROM pack_openings o WHERE o.pack_id = p.id) AS revealed,
            (SELECT f.name FROM pack_history h LEFT JOIN users f ON f.id = h.from_user
             WHERE h.pack_id = p.id ORDER BY h.id DESC LIMIT 1) AS from_name
     FROM packs p LEFT JOIN series s ON s.id = p.series_id
     WHERE p.owner_id = ? AND p.opened_at IS NULL ORDER BY p.created_at, p.id`
  ).bind(userId).all();
  return results;
}

// Every pack ever made, newest first (the public Packs page). Sealed packs have no contents yet
// (they roll when opened), so nothing is spoiled.
export async function allPacks(env, limit = 500) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.source, p.note, p.keep, p.special, p.special_no, s.special_name, s.special_limit, p.created_at, p.opened_at,
            s.name AS series, u.name AS owner, u.is_bot AS owner_bot,
            (SELECT 1 FROM pack_openings o WHERE o.pack_id = p.id) AS revealed
     FROM packs p LEFT JOIN series s ON s.id = p.series_id LEFT JOIN users u ON u.id = p.owner_id
     ORDER BY p.id DESC LIMIT ?`
  ).bind(limit).all();
  return results;
}

// A pack's whole story: made, given, opened, what it held and what came out.
export async function packStory(env, packId) {
  const db = env.DB;
  const pack = await db.prepare(
    `SELECT p.id, p.source, p.note, p.keep, p.special, p.special_no, s.special_name, s.special_limit, p.created_at, p.opened_at, s.name AS series, u.name AS owner
     FROM packs p LEFT JOIN series s ON s.id = p.series_id LEFT JOIN users u ON u.id = p.owner_id WHERE p.id = ?`
  ).bind(packId).first();
  if (!pack) return null;
  const { results: history } = await db.prepare(
    `SELECT h.reason, h.created_at, f.name AS from_name, t.name AS to_name, l.id AS ledger_id, l.hash
     FROM pack_history h LEFT JOIN users f ON f.id = h.from_user LEFT JOIN users t ON t.id = h.to_user
     LEFT JOIN ledger l ON l.kind = 'pack' AND l.ref_id = h.id WHERE h.pack_id = ? ORDER BY h.id`
  ).bind(packId).all();
  const opening = await db.prepare(
    `SELECT o.*, u.name AS opened_by, l.id AS ledger_id, l.hash FROM pack_openings o LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN ledger l ON l.kind = 'pack_open' AND l.ref_id = o.pack_id WHERE o.pack_id = ? AND o.done_at IS NOT NULL`
  ).bind(packId).first();
  let held = null, kept = [];
  if (opening) {
    held = await designsFor(env, JSON.parse(opening.options));
    const keptIds = JSON.parse(opening.kept || "[]");
    if (keptIds.length) {
      kept = (await db.prepare(
        `SELECT i.id, i.edition, i.design_id, i.foil, i.foil_seed, i.pattern, i.effect, d.name, d.image_key, d.rarity, d.max_editions
         FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id IN (${keptIds.map(() => "?").join(",")})`
      ).bind(...keptIds).all()).results;
    }
  }
  return { pack, history, opening: opening && { opened_by: opening.opened_by, at: opening.done_at, ledger_id: opening.ledger_id, hash: opening.hash }, held, kept };
}

// Bots open any packs they have: they keep what their personality likes best.
export async function botOpenPacks(env, botId, choose) {
  const packs = (await packsOf(env, botId)).slice(0, 3);
  for (const p of packs) {
    const o = await openPack(env, botId, p.id, { crawler: true });
    if (o.error) continue;
    // bots never win ultras or prototypes: they skip those even if it means keeping fewer
    const opts = o.options.map((d, i) => ({ ...(d || {}), i })).filter((d) => d.id && d.rarity !== "ultra" && d.rarity !== "prototype");
    const picks = [];
    while (picks.length < Math.min(o.keep, opts.length)) {
      const left = opts.filter((d) => !picks.includes(d.i));
      picks.push(choose(left).i);
    }
    await keepFromPack(env, botId, p.id, picks, { allowFewer: true });
  }
}
