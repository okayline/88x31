// Set rewards: own every button in a set at the same time to claim its reward button (once).
// You keep your buttons. Secret sets stay hidden until you finish them. Bots can't claim.
import { now } from "./auth.js";

// Every set with this player's progress. Secret sets appear only once finished (or claimed).
export async function setsFor(env, userId) {
  const db = env.DB;
  const { results: sets } = await db.prepare(
    `SELECT s.id, s.slug, s.name, s.description, s.secret, s.sort,
            r.id AS reward_id, r.name AS reward_name, r.image_key AS reward_image, r.rarity AS reward_rarity,
            c.instance_id AS claimed_instance, c.claimed_at
     FROM sets s LEFT JOIN designs r ON r.id = s.reward_design_id
     LEFT JOIN set_claims c ON c.set_id = s.id AND c.user_id = ?
     ORDER BY s.sort, s.id`
  ).bind(userId).all();
  if (!sets.length) return [];
  const { results: parts } = await db.prepare(
    `SELECT sd.set_id, d.id, d.name, d.image_key, d.rarity,
            EXISTS (SELECT 1 FROM instances i WHERE i.design_id = d.id AND i.owner_id = ? AND i.consumed = 0) AS owned
     FROM set_designs sd JOIN designs d ON d.id = sd.design_id
     ORDER BY sd.set_id, d.id`
  ).bind(userId).all();
  const out = [];
  for (const s of sets) {
    const designs = parts.filter((p) => p.set_id === s.id).map((p) => ({ ...p, owned: !!p.owned }));
    const have = designs.filter((d) => d.owned).length;
    const complete = designs.length > 0 && have === designs.length;
    const claimed = !!s.claimed_at;
    if (s.secret && !complete && !claimed) continue; // stays a secret
    out.push({
      id: s.id, slug: s.slug, name: s.name, description: s.description, secret: !!s.secret,
      have, total: designs.length, complete, claimed, claimed_instance: s.claimed_instance,
      reward: s.reward_id ? { name: s.reward_name, image_key: s.reward_image, rarity: s.reward_rarity } : null,
      designs,
    });
  }
  return out;
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
  const set = await db.prepare("SELECT id, reward_design_id FROM sets WHERE id = ?").bind(setId).first();
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
  return { ok: true, instance_id: c && c.instance_id };
}

// Sets ready to claim (for the dashboard).
export async function readyCount(env, userId) {
  return (await setsFor(env, userId)).filter((s) => s.complete && !s.claimed).length;
}
