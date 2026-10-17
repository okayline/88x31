// The front-page free pack: one card for a visitor with no account.
//
// Opening: the server rolls one card at the normal odds, minus ultras (common, uncommon or rare;
//   finish up to tier 1, no pattern or effect) and remembers it against an anonymous cookie, so
//   refreshing shows the same card. Nothing is minted and nothing goes on the ledger yet, but a
//   held rare counts against its 25 copies so it can't sell out while they decide.
// Signing: typing a name creates the account, mints the card as theirs (reason 'free_pack') and
//   logs them in. Their save code is shown once, like a normal sign-up.
// Unsigned cards are dropped after FREE_HOLD seconds. A few opens per connection per day at most.
import { now, sha256, readCookie, startSession, rateLimit } from "./auth.js";
import { ODDS_PER_1000, FREE_HOLD, availableDesigns, mintStatements, finishes, rollFoil } from "./game.js";
import { createAccount, nameProblem, noteArrival } from "./accounts.js";
import { givePacks } from "./packs.js";

export { FREE_HOLD };                   // unsigned cards wait 2 days
export const FREE_COOKIE = "fp";
const COOKIE_DAYS = 30;                 // long enough to remember "you already have your free pack"

const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
const tokenHash = (t) => sha256("free:" + t);
export const freeCookie = (t) => `${FREE_COOKIE}=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_DAYS * 86400}`;

async function cardFor(env, row) {
  if (!row) return null;
  const d = await env.DB.prepare("SELECT id, name, type, rarity, image_key FROM designs WHERE id = ?").bind(row.design_id).first();
  return d && { ...d, foil: row.foil, foil_seed: row.foil_seed };
}

// This browser's free pack: { state: 'none' | 'waiting' | 'claimed', card?, name? }
export async function freePackState(env, request) {
  const t = readCookie(request, FREE_COOKIE);
  if (!t) return { state: "none" };
  const row = await env.DB.prepare("SELECT * FROM free_packs WHERE token_hash = ?").bind(await tokenHash(t)).first();
  if (!row) return { state: "none" };
  if (row.claimed_by) {
    const u = await env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(row.claimed_by).first();
    return { state: "claimed", name: u ? u.name : null };
  }
  if (now() - row.created_at > FREE_HOLD) return { state: "none" };
  return { state: "waiting", card: await cardFor(env, row) };
}

// One card from what's in play (found buttons and in-print series), at the normal odds without ultras.
export async function rollFreeCard(env) {
  const { series, found } = await availableDesigns(env);
  const pools = { common: [...found], uncommon: [], rare: [] };
  for (const sr of series) for (const r of Object.keys(pools)) pools[r].push(...(sr.pool[r] || []));
  const weights = { common: ODDS_PER_1000.common, uncommon: ODDS_PER_1000.uncommon, rare: ODDS_PER_1000.rare };
  const total = weights.common + weights.uncommon + weights.rare;
  let r = Math.floor(Math.random() * total), want = "common";
  for (const k of Object.keys(weights)) { if (r < weights[k]) { want = k; break; } r -= weights[k]; }
  const list = pools[want].length ? pools[want] : pools.common.length ? pools.common : [...pools.uncommon, ...pools.rare];
  return list.length ? { id: list[Math.floor(Math.random() * list.length)] } : null;
}

// A free pack's finish: up to a tier 1 foil, never a pattern or an effect. (Also the streak's Free Packs, v0.37.)
export async function freeFinish(env, designId) {
  const reg = await finishes(env);
  const weights = Object.fromEntries(reg.foil.filter((f) => (f.tier || 0) > 1).map((f) => [f.id, 0]));
  return rollFoil(env, designId, weights);
}
// Open (or come back to) this browser's free pack. Returns { card, cookie? } or { error }.
export async function openFreePack(env, request) {
  const state = await freePackState(env, request);
  if (state.state === "waiting") return { card: state.card };
  if (state.state === "claimed") return { error: "You've already got your free pack! Log in to see it." };
  if (!(await rateLimit(env, request, "freepack", 3, 86400))) return { error: "That's enough free packs for today. Come back tomorrow!" };
  const d = await rollFreeCard(env);
  if (!d) return { error: "No buttons to put in packs yet!" };
  const fin = await freeFinish(env, d.id);
  const token = randomToken();
  await env.DB.prepare("INSERT INTO free_packs (token_hash, design_id, foil, foil_seed, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await tokenHash(token), d.id, fin.id, fin.seed, now()).run();
  // tidy up old unsigned ones now and then
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM free_packs WHERE claimed_by IS NULL AND created_at < ?").bind(now() - FREE_HOLD).run();
  return { card: await cardFor(env, { design_id: d.id, foil: fin.id, foil_seed: fin.seed }), cookie: freeCookie(token) };
}

// Cloudflare Turnstile: is this a real person? (Skipped until the secret is set up.)
async function humanCheck(env, request, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return !!(await r.json()).success;
  } catch { return false; }
}

// Sign the card: make the account, mint the card as theirs, log them in.
// Returns { user, code, instance_id, cookie } or { error, status }.
export async function signFreePack(env, request, name, turnstile, cameFrom) {
  const t = readCookie(request, FREE_COOKIE);
  const row = t ? await env.DB.prepare("SELECT * FROM free_packs WHERE token_hash = ?").bind(await tokenHash(t)).first() : null;
  if (!row || (!row.claimed_by && now() - row.created_at > FREE_HOLD)) return { error: "That card got away! Open a fresh one.", status: 400 };
  if (row.claimed_by) return { error: "You've already got your free pack! Log in to see it.", status: 400 };
  const bad = await nameProblem(env, name);   // a taken name first, before the human check uses up its token
  if (bad) return bad;
  if (!(await humanCheck(env, request, turnstile))) return { error: "Hmm, couldn't check you're human. Try again!", status: 400 };
  if (!(await rateLimit(env, request, "signup", 5, 3600))) return { error: "Too many new accounts from here. Try again later.", status: 429 };

  const made = await createAccount(env, name);
  if (made.error) return made;
  const { user, code } = made;
  await noteArrival(env, user.id, cameFrom, "free pack");
  // claim the card for them (only once), then mint it with the finish they saw
  const claim = await env.DB.prepare(
    "UPDATE free_packs SET claimed_by = ?, claimed_at = ? WHERE token_hash = ? AND claimed_by IS NULL"
  ).bind(user.id, now(), row.token_hash).run();
  let instanceId = null;
  if (claim.meta.changes) {
    const finish = { id: row.foil, seed: row.foil_seed, pattern: null, effect: null };
    let res = await env.DB.batch(await mintStatements(env, row.design_id, user.id, "free_pack", null, { finish }));
    if (res[0].meta.changes !== 1) {
      // their card left play while they were deciding (removed by request, say): give them another
      const alt = await rollFreeCard(env);
      if (alt) {
        res = await env.DB.batch(await mintStatements(env, alt.id, user.id, "free_pack", null, { finish }));
        await env.DB.prepare("UPDATE free_packs SET design_id = ? WHERE token_hash = ?").bind(alt.id, row.token_hash).run();
      }
    }
    if (res[0].meta.changes === 1) {
      const c = await env.DB.prepare(
        "SELECT instance_id FROM ownership_history WHERE to_user = ? AND reason = 'free_pack' ORDER BY id DESC LIMIT 1"
      ).bind(user.id).first();
      instanceId = c ? c.instance_id : null;
      await env.DB.prepare("UPDATE free_packs SET instance_id = ? WHERE token_hash = ?").bind(instanceId, row.token_hash).run();
    }
  }
  // their welcome pack waits sealed on their page (keep 2 of 3), so opening a pack is their next step
  try { await givePacks(env, [user.id], 1, { source: "welcome", note: "welcome to the cLuB!", keep: 2 }); }
  catch (e) { console.log("welcome pack failed", e); }
  return { user, code, instance_id: instanceId, cookie: await startSession(env, user.id) };
}
