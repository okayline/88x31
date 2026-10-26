// The copy you carry into every 88x31 game (dungeon-items registry.js: pinned, pin, heldAcross), through the registry's
// HTTP door (lib/registry.js reg), which always acts as 88x31.
// GET  /api/carry                 -> { carry: { name, copy, blessed } | null, copies: [{ itemId, copy, name, game, pinned }] }
//                                    carry: your account's pinned copy (else your newest), blessed if the Moon blessed it;
//                                    copies: every copy your account holds in any game, newest first (up to 50)
// POST /api/carry { itemId, copy } -> { ok }   pin it: every game carries it from then on
import { json, readJson, currentUser } from "../../lib/auth.js";
import { reg } from "../../lib/registry.js";

const unavailable = () => json({ error: "The registry is unavailable right now. Try again in a moment." }, 503);

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const R = reg(env);
  if (!R) return unavailable();
  try {
    const [c, list] = await Promise.all([R.pinned(me.id), R.heldAcross(me.id, 50)]);
    const carry = c && c.itemId ? { name: c.item.name, copy: c.copy, blessed: c.marks.some((m) => m.kind === "moon" && m.value === "blessed") ? 1 : 0 } : null;
    return json({ carry, copies: (list || []).map((x) => ({ itemId: x.itemId, copy: x.copy, name: x.item.name, game: x.game, pinned: x.pinned })) });
  } catch { return unavailable(); }
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const R = reg(env);
  if (!R) return unavailable();
  const b = await readJson(request);
  try {
    const r = await R.pin({ playerId: me.id, itemId: Number(b.itemId), copy: Number(b.copy) });
    return r && r.error ? json({ error: r.error }, 400) : json({ ok: true });
  } catch { return unavailable(); }
}

// (v0.47) Keeping a 1-of-1 (an ultra) from a pack marks the copy the player carries: "kept_one_of_one", once per pack.
// functions/api/packs.js reads the carried copy (carriedNow) before the keep, so it is never the new button itself, and
// calls markUltraKeep after. A registry that's away never stops the keep.
export async function carriedNow(env, userId) {
  try { const R = reg(env), c = R ? await R.pinned(userId) : null; return c && c.itemId ? c : null; }
  catch { return null; }
}
export async function markUltraKeep(env, userId, packId, kept, c) {
  try {
    if (!c || !kept || !kept.length) return;
    const ultra = await env.DB.prepare(
      `SELECT 1 AS y FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.rarity = 'ultra' AND i.id IN (SELECT value FROM json_each(?)) LIMIT 1`)
      .bind(JSON.stringify(kept)).first();
    if (!ultra) return;
    const r = await reg(env).markCarried({ itemId: c.itemId, copy: c.copy, by: { playerId: userId }, kind: "deed", value: "kept_one_of_one", key: "pack:" + packId });
    if (r && r.error) console.log("The registry refused the mark: " + r.error);
  } catch (e) { console.log("carry mark failed", e); }
}
