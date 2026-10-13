// POST /api/signup  { name }  ->  { user, code }  (code is shown once, never stored)
import { json, readJson, startSession, rateLimit } from "../../lib/auth.js";
import { createAccount } from "../../lib/accounts.js";
import { giveWelcomePack } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";

export async function onRequestPost({ request, env }) {
  if (!(await rateLimit(env, request, "signup", 5, 3600))) {
    return json({ error: "Too many new accounts from here. Try again later." }, 429);
  }
  const { name } = await readJson(request);
  const made = await createAccount(env, name);
  if (made.error) return json({ error: made.error }, made.status);
  const { user, code } = made;

  // Welcome pack (skipped quietly if no banners are loaded yet).
  try { await giveWelcomePack(env, user.id); } catch (e) { console.log("welcome pack failed", e); }

  await sealSafe(env);

  const cookie = await startSession(env, user.id);
  return json({ user, code }, 200, { "set-cookie": cookie });
}
