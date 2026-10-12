// GET /api/me  ->  { user } or { user: null }
import { json, currentUser } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env, request);
  return json({ user: user ? { id: user.id, name: user.name } : null });
}
