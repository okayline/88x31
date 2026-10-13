// Set rewards: own every button in a set at the same time to claim its reward button (once).
// You keep your buttons. Secret sets stay hidden until you finish them. Bots can't claim.
import { now } from "./auth.js";
import { givePacks } from "./packs.js";

// A player's sets.
//  - For the player themself: only sets they've started (own at least one button of, or claimed),
//    and the buttons they don't own stay a mystery ("?"). Secret sets appear only once finished.
//  - For visitors: only finished (claimed) sets the player chose to show off. Secret ones show
//    as just "a secret set".
export async function setsFor(env, userId, { visitor = false } = {}) {
  const db = env.DB;
  let sets;
  try {
    sets = (await db.prepare(
      `SELECT s.id, s.slug, s.name, s.description, s.secret, s.sort,
              r.id AS reward_id, r.name AS reward_name, r.image_key AS reward_image, r.rarity AS reward_rarity,
              c.instance_id AS claimed_instance, c.claimed_at, c.showcase
       FROM sets s LEFT JOIN designs r ON r.id = s.reward_design_id
       LEFT JOIN set_claims c ON c.set_id = s.id AND c.user_id = ?
       ORDER BY s.sort, s.id`
    ).bind(userId).all()).results;
  } catch { // before migration 015
    sets = (await db.prepare(
      `SELECT s.id, s.slug, s.name, s.description, s.secret, s.sort,
              r.id AS reward_id, r.name AS reward_name, r.image_key AS reward_image, r.rarity AS reward_rarity,
              c.instance_id AS claimed_instance, c.claimed_at, 0 AS showcase
       FROM sets s LEFT JOIN designs r ON r.id = s.reward_design_id
       LEFT JOIN set_claims c ON c.set_id = s.id AND c.user_id = ?
       ORDER BY s.sort, s.id`
    ).bind(userId).all()).results;
  }
  if (!sets.length) return [];
  const { results: parts } = await db.prepare(
    `SELECT sd.set_id, d.id, d.name, d.image_key, d.rarity,
            EXISTS (SELECT 1 FROM instances i WHERE i.design_id = d.id AND i.owner_id = ? AND i.consumed = 0) AS owned
     FROM set_designs sd JOIN designs d ON d.id = sd.design_id
     ORDER BY sd.set_id, d.id`
  ).bind(userId).all();
  const out = [];
  for (const s of sets) {
    const all = parts.filter((p) => p.set_id === s.id).map((p) => ({ ...p, owned: !!p.owned }));
    const have = all.filter((d) => d.owned).length;
    const complete = all.length > 0 && have === all.length;
    const claimed = !!s.claimed_at;
    const reward = s.reward_id ? { name: s.reward_name, image_key: s.reward_image, rarity: s.reward_rarity } : null;
    if (visitor) {
      if (!claimed || !s.showcase) continue;
      out.push(s.secret
        ? { id: s.id, secret: true, name: "a secret set", claimed: true, claimed_at: s.claimed_at, total: all.length }
        : { id: s.id, name: s.name, description: s.description, claimed: true, claimed_at: s.claimed_at,
            total: all.length, reward, claimed_instance: s.claimed_instance, designs: all.map(({ owned, ...d }) => d) });
      continue;
    }
    if (s.secret && !complete && !claimed) continue; // stays a secret
    if (!have && !claimed) continue;                   // not started yet: stays hidden
    out.push({
      id: s.id, slug: s.slug, name: s.name, description: s.description, secret: !!s.secret,
      have, total: all.length, complete, claimed, claimed_at: s.claimed_at, claimed_instance: s.claimed_instance,
      showcase: !!s.showcase, reward: claimed ? reward : reward && { hidden: true }, // the reward stays a mystery until claimed
      // buttons you don't own are a mystery
      designs: all.map((d) => (d.owned ? d : { owned: false, hidden: true })),
    });
  }
  return out;
}

// Show off (or stop showing) a finished set on your page. Returns { ok } or { error }.
export async function setShowcase(env, userId, setId, show) {
  const r = await env.DB.prepare("UPDATE set_claims SET showcase = ? WHERE user_id = ? AND set_id = ?")
    .bind(show ? 1 : 0, userId, setId).run();
  return r.meta.changes ? { ok: true } : { error: "You haven't finished that set yet." };
}

// How many secret sets exist (so the page can hint at them).
export async function secretCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM sets WHERE secret = 1").first();
  return r ? r.n : 0;
}

// Claim a set's reward. Returns { ok, instance_id } or { error }.
export async function claimSet(env, userId, setId) {
  const db = env.DB;
  const user = await db.prepare("SELECT is_bot FROM users WHERE id = ?").bind(userId).first();
  if (!user) return { error: "No such player." };
  if (user.is_bot) return { error: "Bots can't claim set rewards." };
  let set;
  try { set = await db.prepare("SELECT id, name, reward_design_id, series_id FROM sets WHERE id = ?").bind(setId).first(); }
  catch { set = await db.prepare("SELECT id, name, reward_design_id, NULL AS series_id FROM sets WHERE id = ?").bind(setId).first(); }
  if (!set || !set.reward_design_id) return { error: "No such set." };
  const t = now();
  const ownsAll = `(SELECT COUNT(*) FROM set_designs sd WHERE sd.set_id = ?
                     AND EXISTS (SELECT 1 FROM instances i WHERE i.design_id = sd.design_id AND i.owner_id = ? AND i.consumed = 0))
                   = (SELECT COUNT(*) FROM set_designs WHERE set_id = ?)
                   AND (SELECT COUNT(*) FROM set_designs WHERE set_id = ?) > 0`;
  const res = await db.batch([
    // 1) record the claim (only once, and only if they own the whole set right now)
    db.prepare(`INSERT OR IGNORE INTO set_claims (user_id, set_id, claimed_at) SELECT ?, ?, ? WHERE ${ownsAll}`)
      .bind(userId, set.id, t, set.id, userId, set.id, set.id),
    // 2) make the reward copy (reward designs are never in packs)
    db.prepare(
      `INSERT INTO instances (design_id, edition, owner_id, created_at, foil, foil_seed)
       SELECT d.id, COALESCE((SELECT MAX(edition) FROM instances WHERE design_id = d.id), 0) + 1, ?, ?, 'clear', ?
       FROM designs d WHERE d.id = ? AND changes() = 1`
    ).bind(userId, t, Math.floor(Math.random() * 2_000_000_000), set.reward_design_id),
    db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT last_insert_rowid(), NULL, ?, 'set_reward', ?, ? WHERE changes() = 1`
    ).bind(userId, set.id, t),
    // 3) remember which copy it was
    db.prepare(
      `UPDATE set_claims SET instance_id = (SELECT MAX(id) FROM instances WHERE design_id = ? AND owner_id = ?)
       WHERE user_id = ? AND set_id = ? AND instance_id IS NULL`
    ).bind(set.reward_design_id, userId, userId, set.id),
  ]);
  if (res[0].meta.changes !== 1) {
    const already = await db.prepare("SELECT 1 FROM set_claims WHERE user_id = ? AND set_id = ?").bind(userId, set.id).first();
    return { error: already ? "You already claimed this one!" : "You don't have the whole set yet." };
  }
  const c = await db.prepare("SELECT instance_id FROM set_claims WHERE user_id = ? AND set_id = ?").bind(userId, set.id).first();
  // finishing a set also earns a sealed pack from that set's series
  try { await givePacks(env, [userId], 1, { series: set.series_id ?? null, source: "set", note: `for finishing ${set.name}` }); }
  catch (e) { console.log("set pack failed", e); }
  return { ok: true, instance_id: c && c.instance_id, pack: true };
}

// Sets ready to claim (for the dashboard).
export async function readyCount(env, userId) {
  return (await setsFor(env, userId)).filter((s) => s.complete && !s.claimed).length;
}
