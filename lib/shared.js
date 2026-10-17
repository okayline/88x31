// Save codes and passkeys now live in the shared Accounts service (the dungeon-items Worker, binding ACCOUNTS; see its
// ACCOUNTS.md). This game keeps its own players (users) and sessions. An account says which user here is yours.
// Codes from before (this game's own save_codes table) move to the account the first time that user is seen, and the old
// rows are deleted. Old passkey rows are left unused (passkeys made on 88x31.app were imported by hand).
import { json } from "./auth.js";

export const GAME = "88x31";
// Pages sites can't be sure of calling a named Worker entrypoint, so this goes over plain HTTP through an ordinary service
// binding (ACCOUNTS -> the dungeon-items Worker) with a shared secret (ACCOUNTS_KEY, the same value set on both). Each
// method name becomes one call: acc(env).addCode(id) POSTs [id] to /rpc/accounts/addCode and returns the answer.
export const acc = (env) => {
  if (!env.ACCOUNTS || !env.ACCOUNTS_KEY) return null;
  return new Proxy({}, { get: (_, name) => async (...args) => {
    const r = await env.ACCOUNTS.fetch(`https://accounts.internal/rpc/accounts/${String(name)}`, {
      method: "POST", headers: { "x-accounts-key": env.ACCOUNTS_KEY, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error("The accounts service didn't answer (" + r.status + ").");
    return r.json();
  } });
};
export const unavailable = () => json({ error: "Accounts are unavailable right now. Try again in a moment." }, 503);
export const ipOf = (request) => request.headers.get("cf-connecting-ip") || "unknown";
export const originOf = (request) => new URL(request.url).origin;

// A refusal from the service ({ error, status }) as a response, or null.
export const refusal = (r) => (r && r.error ? json({ error: r.error }, r.status || 400) : null);

// This user's account id; makes the account (and moves old codes in) when make is true or old codes exist.
export async function accountFor(env, userId, make = false) {
  const A = acc(env);
  let id = (await A.accountOf(GAME, userId)).accountId;
  const old = (await env.DB.prepare("SELECT code_hash FROM save_codes WHERE user_id = ?").bind(userId).all()).results;
  if (!id && !make && !old.length) return null;
  if (!id) {
    id = (await A.createAccount()).accountId;
    const l = await A.link(id, GAME, userId);
    if (l.error || !l.linked) throw new Error("Couldn't set up your account. Try again.");
  }
  for (const r of old) await A.importCode(id, r.code_hash);
  if (old.length) await env.DB.prepare("DELETE FROM save_codes WHERE user_id = ?").bind(userId).run();
  return id;
}
