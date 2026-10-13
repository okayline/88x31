// GET /api/designs        -> { designs: [...every button design, with copies made...] }
// GET /api/designs?id=N   -> { design, ledger, sets, copies } one design's info window
import { json, currentUser } from "../../lib/auth.js";

// Ultras and set rewards stay a mystery on the Wall until you've owned one yourself.
const HIDDEN = new Set(["ultra", "special"]);
async function uncovered(env, viewer) {
  if (!viewer) return new Set();
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT i.design_id FROM ownership_history h JOIN instances i ON i.id = h.instance_id
     JOIN designs d ON d.id = i.design_id WHERE h.to_user = ? AND d.rarity IN ('ultra', 'special')`
  ).bind(viewer.id).all();
  return new Set(results.map((r) => r.design_id));
}

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  const db = env.DB;
  const seen = await uncovered(env, await currentUser(env, request));
  if (!id) {
    const { results } = await db.prepare(
      `SELECT d.id, d.name, d.type, d.rarity, d.status, d.image_key, d.max_editions, d.stats,
              (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted
       FROM designs d WHERE d.status IN ('active', 'reward') ORDER BY d.id`
    ).all();
    return json({ designs: results.map((d) => (HIDDEN.has(d.rarity) && !seen.has(d.id)
      ? { id: d.id, hidden: true }   // a mystery: no name, picture or rarity
      : d)) });
  }
  const design = await db.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM instances i WHERE i.design_id = d.id) AS minted
     FROM designs d WHERE d.id = ? AND d.status IN ('active', 'reward')`
  ).bind(id).first();
  if (!design) return json({ error: "No such button." }, 404);
  if (HIDDEN.has(design.rarity) && !seen.has(design.id)) {
    return json({ hidden: true });
  }
  const ledger = await db.prepare(
    "SELECT id, hash, created_at FROM ledger WHERE kind = 'design' AND ref_id = ?"
  ).bind(id).first();
  // sets it belongs to (secret sets stay secret), or the set it's the reward for
  const { results: sets } = await db.prepare(
    `SELECT s.name, s.secret, 'part' AS role FROM set_designs sd JOIN sets s ON s.id = sd.set_id WHERE sd.design_id = ?
     UNION ALL
     SELECT s.name, s.secret, 'reward' AS role FROM sets s WHERE s.reward_design_id = ?`
  ).bind(id, id).all();
  // who owns copies (first 60 by edition)
  const { results: copies } = await db.prepare(
    `SELECT i.id, i.edition, u.name AS owner, u.is_bot FROM instances i LEFT JOIN users u ON u.id = i.owner_id
     WHERE i.design_id = ? AND i.consumed = 0 ORDER BY i.edition LIMIT 60`
  ).bind(id).all();
  return json({
    design, ledger,
    sets: sets.map((s) => (s.secret ? { name: "a secret set", role: s.role } : { name: s.name, role: s.role })),
    copies,
  });
}
