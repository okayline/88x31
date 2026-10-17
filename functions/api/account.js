// DELETE /api/account  { confirm: "<your name>" }
// Deletes the logged-in player's account, all-or-nothing (lib/accounts.js deleteAccount says exactly what goes).
import { json, readJson, currentUser, endSession } from "../../lib/auth.js";
import { deleteAccount } from "../../lib/accounts.js";
import { acc } from "../../lib/shared.js";

export async function onRequestDelete({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { confirm } = await readJson(request);
  if (String(confirm || "").trim().toLowerCase() !== me.name.toLowerCase()) {
    return json({ error: "Type your name exactly to confirm." }, 400);
  }

  const r = await deleteAccount(env, me.id);
  if (r.error) return json(r, 400);

  if (acc(env)) { try { await acc(env).unlink("88x31", me.id); } catch { /* the link is harmless without its player */ } }
  const cookie = await endSession(env, request);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}
