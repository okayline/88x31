// Making a new account: a name and its first save code (shown once, only its hash is stored).
// Used by the old sign-up form and by signing the front-page free pack.
import { newSaveCode, hashCode, now } from "./auth.js";

// Returns { user: { id, name }, code } or { error, status }.
export async function createAccount(env, name) {
  const clean = String(name || "").trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(clean)) return { error: "Name must be 3-20 letters, numbers, _ or -.", status: 400 };
  if (/-bot$/i.test(clean)) return { error: "Names ending in -bot are saved for the bots!", status: 400 };
  // names the game uses for itself
  if (["everyone", "nobody", "webmaster"].includes(clean.toLowerCase())) return { error: "That name is taken.", status: 409 };
  const taken = await env.DB.prepare("SELECT 1 FROM users WHERE name = ?").bind(clean).first();
  if (taken) return { error: "That name is taken.", status: 409 };
  const t = now();
  const code = newSaveCode();
  const codeHash = await hashCode(code);
  try {
    const [res] = await env.DB.batch([
      env.DB.prepare("INSERT INTO users (name, created_at) VALUES (?, ?) RETURNING id, name").bind(clean, t),
      env.DB.prepare(
        `INSERT INTO save_codes (user_id, code_hash, label, created_at)
         SELECT id, ?, 'first code', ? FROM users WHERE name = ?`
      ).bind(codeHash, t, clean),
    ]);
    return { user: res.results[0], code };
  } catch {
    return { error: "That name is taken.", status: 409 };
  }
}
