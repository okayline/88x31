// POST /api/trades/act { id, action: "accept" | "decline" | "cancel" } -> { ok } or { error }
import { json, readJson, currentUser } from "../../../lib/auth.js";
import { acceptTrade, closeByUser } from "../../../lib/trades.js";
import { sealSafe } from "../../../lib/ledger.js";

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { id, action } = await readJson(request);
  let r;
  if (action === "accept") {
    r = await acceptTrade(env, Number(id), me.id);
    if (r.ok) await sealSafe(env);
  } else if (action === "decline" || action === "cancel") {
    r = await closeByUser(env, Number(id), me.id, action);
  } else {
    r = { error: "Unknown action." };
  }
  return r.ok ? json(r) : json(r, 400);
}
