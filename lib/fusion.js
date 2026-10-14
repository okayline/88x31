// Fusion: 3 copies of the same button in, 1 comes back better. The lowest-numbered copy survives
// (it keeps its number and travel log); the other two are used up and vanish from play. Capped
// buttons never get new copies to replace them, so fusing makes them scarcer for good.
//
// The rules (planFusion):
//   - foil: the best foil going in, one guaranteed step up (base -> tier 1 -> 2 -> 3), landing on a
//     random foil of the new tier.
//   - at tier 3 the material stays (one of the tier 3 foils going in) and the step goes to the
//     pattern: if none of the copies had one, it gets a random pattern.
//   - once it has a tier 3 foil AND a pattern, the step goes to the effect: no effect -> a random
//     one; any effect -> the fusion-only CRT+VHS. Already CRT+VHS = maxed out.
//   - pattern: kept if any copy had one (random pick if they differ).
//   - effect: kept if any copy had one (random pick if they differ); if none did, a small chance
//     (FUSE_EFFECT_CHANCE) of a surprise one.
//   - never makes an ultra; ultras can't be fused.
import { now } from "./auth.js";
import { finishes, newLockToken, FUSE_EFFECT_CHANCE, TOP_EFFECT } from "./game.js";

const rand = (n) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
const pick = (list) => list[rand(list.length)];
const coin = (p) => rand(1_000_000) < p * 1_000_000;

export function tierOf(reg, foilId) {
  const f = reg.foil.find((x) => x.id === foilId);
  return f ? f.tier : 0; // NULL (First Print) and unknown foils count as base
}

// What 3 copies would fuse into. Returns { foil, pattern, effect, step } or { maxed: true }.
export function planFusion(reg, inputs) {
  const best = Math.max(...inputs.map((c) => tierOf(reg, c.foil)));
  const patterns = inputs.map((c) => c.pattern).filter(Boolean);
  const effects = inputs.map((c) => c.effect).filter(Boolean);
  const effectPool = reg.effect.filter((e) => e.id !== TOP_EFFECT);
  let foil, pattern = patterns.length ? pick(patterns) : null, effect = effects.length ? pick(effects) : null, step;

  if (best < 3) {
    const next = reg.foil.filter((f) => f.tier === best + 1);
    if (!next.length) return { maxed: true };
    foil = pick(next).id;
    step = "foil";
  } else {
    foil = pick(inputs.filter((c) => tierOf(reg, c.foil) === 3)).foil;
    if (!patterns.length) {
      pattern = reg.pattern.length ? pick(reg.pattern).id : null;
      step = "pattern";
    } else if (!effects.length) {
      effect = effectPool.length ? pick(effectPool).id : null;
      step = "effect";
    } else if (effects.includes(TOP_EFFECT)) {
      return { maxed: true };
    } else {
      effect = TOP_EFFECT;
      step = "effect";
    }
  }
  if (!effect && step !== "effect" && effectPool.length && coin(FUSE_EFFECT_CHANCE)) effect = pick(effectPool).id;
  return { foil, pattern, effect, step };
}

// Fuse three of a player's copies. Returns { ok, id, foil, pattern, effect, step } or { error }.
export async function fuse(env, userId, ids) {
  const db = env.DB;
  ids = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (ids.length !== 3) return { error: "Pick 3 copies of the same button." };
  const { results: rows } = await db.prepare(
    `SELECT i.id, i.edition, i.design_id, i.owner_id, i.locked, i.consumed, i.foil, i.pattern, i.effect, d.rarity
     FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id IN (?, ?, ?)`
  ).bind(...ids).all();
  if (rows.length !== 3 || rows.some((r) => r.owner_id !== userId || r.consumed)) return { error: "Those aren't all yours." };
  if (new Set(rows.map((r) => r.design_id)).size !== 1) return { error: "All 3 have to be the same button." };
  if (rows.some((r) => r.rarity === "ultra")) return { error: "Ultras can't be fused." };
  if (rows.some((r) => r.rarity === "prototype")) return { error: "Prototypes can't be fused. Only 4 of each exist!" };
  if (rows.some((r) => r.locked)) return { error: "One of those is busy in a trade." };

  const reg = await finishes(env);
  const plan = planFusion(reg, rows);
  if (plan.maxed) return { error: "This one's already as shiny as it gets!" };

  rows.sort((a, b) => a.edition - b.edition);
  const [keep, a, b] = rows;
  const t = now(), token = newLockToken();
  const seed = rand(2_000_000_000);
  const allLocked = "(SELECT COUNT(*) FROM instances WHERE id IN (?, ?, ?) AND locked = ?) = 3";
  const lockArgs = [keep.id, a.id, b.id, token];
  const fusionId = "(SELECT MAX(id) FROM fusions WHERE output_id = ? AND created_at = ?)";

  const res = await db.batch([
    // 1) lock all three (only if still theirs, free, and not used up)
    db.prepare(
      "UPDATE instances SET locked = ? WHERE id IN (?, ?, ?) AND owner_id = ? AND locked = 0 AND consumed = 0"
    ).bind(token, keep.id, a.id, b.id, userId),
    // 2) record the fusion
    db.prepare(
      `INSERT INTO fusions (user_id, input_a, input_b, output_id, created_at, foil, pattern, effect, prev_foil)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${allLocked}`
    ).bind(userId, a.id, b.id, keep.id, t, plan.foil, plan.pattern, plan.effect, keep.foil, ...lockArgs),
    // 3) the two used-up copies leave play, logged as going into the fusion
    db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT x.id, ?, NULL, 'fusion', ${fusionId}, ? FROM instances x WHERE x.id IN (?, ?) AND ${allLocked}`
    ).bind(userId, keep.id, t, t, a.id, b.id, ...lockArgs),
    db.prepare(
      `INSERT INTO ownership_history (instance_id, from_user, to_user, reason, ref_id, created_at)
       SELECT ?, ?, ?, 'fusion', ${fusionId}, ? WHERE ${allLocked}`
    ).bind(keep.id, userId, userId, keep.id, t, t, ...lockArgs),
    db.prepare("DELETE FROM wall_slots WHERE instance_id IN (?, ?) AND " + allLocked).bind(a.id, b.id, ...lockArgs),
    db.prepare(
      "UPDATE instances SET consumed = 1, owner_id = NULL WHERE id IN (?, ?) AND locked = ? AND " + allLocked
    ).bind(a.id, b.id, token, ...lockArgs),
    // 4) the survivor gets its new look (and a fresh seed, so it shimmers anew)
    db.prepare(
      "UPDATE instances SET foil = ?, pattern = ?, effect = ?, foil_seed = ? WHERE id = ? AND locked = ?"
    ).bind(plan.foil, plan.pattern, plan.effect, seed, keep.id, token),
    // 5) unlock whatever we locked
    db.prepare("UPDATE instances SET locked = 0 WHERE id IN (?, ?, ?) AND locked = ?").bind(keep.id, a.id, b.id, token),
  ]);
  if (res[0].meta.changes !== 3) return { error: "Something changed with those copies. Try again!" };
  return { ok: true, id: keep.id, foil: plan.foil, pattern: plan.pattern, effect: plan.effect, step: plan.step };
}
