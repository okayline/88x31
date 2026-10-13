// GET /api/pubkey -> { key } the cLuB's public signing key (base64 Ed25519), or null if not set.
import { json } from "../../lib/auth.js";
import { publicKey, keyStatus } from "../../lib/cert.js";

export async function onRequestGet({ env }) {
  return json({ key: publicKey(env), status: keyStatus(env) });
}
