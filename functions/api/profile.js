// POST /api/profile { homepage } -> { ok, homepage }   (empty string clears it)
import { json, readJson, currentUser } from "../../lib/auth.js";

export function cleanHomepage(raw) {
  const s = String(raw || "").trim();
  if (!s) return { value: null };
  if (s.length > 200) return { error: "That link is too long (200 characters max)." };
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return { error: "That doesn't look like a web address." }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only http:// or https:// links, please." };
  if (!u.hostname.includes(".")) return { error: "That doesn't look like a web address." };
  return { value: u.toString() };
}

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const { homepage } = await readJson(request);
  const c = cleanHomepage(homepage);
  if (c.error) return json({ error: c.error }, 400);
  await env.DB.prepare("UPDATE users SET homepage = ? WHERE id = ?").bind(c.value, me.id).run();
  return json({ ok: true, homepage: c.value });
}
