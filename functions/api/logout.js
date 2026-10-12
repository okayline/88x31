// POST /api/logout
import { json, endSession } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  const cookie = await endSession(env, request);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}
