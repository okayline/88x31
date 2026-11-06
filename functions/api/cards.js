// GET /api/cards -> { cards: { "<design id>": { series, subtype, flavor } } }: what each button's card prints under the big button
// (v0.51, kura's mockup A): its type line's subtype ("Construction — Zone") and its flavour line. Both live in the shared item table
// (dungeon-items), read through the registry door, since its public list hides every button but the commons. Kept 5 minutes at the
// edge, so the item table is read about once per 5 minutes per data centre, not once per visit.
import { json } from "../../lib/auth.js";
import { reg } from "../../lib/registry.js";

const KEEP = 300;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default, key = new Request(new URL("/api/cards", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const R = reg(env);
  if (!R) return json({ cards: {} });
  let list;
  try { list = await R.cards(); } catch { return json({ cards: {} }); }   // the item table out of reach: cards show their type line only
  const cards = {};
  for (const c of Array.isArray(list) ? list : []) cards[c.key] = { series: c.series, subtype: c.subtype, flavor: c.flavor };
  const res = json({ cards }, 200, { "cache-control": `public, max-age=${KEEP}` });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
