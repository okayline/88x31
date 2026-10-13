// POST /api/profile { homepage?, theme? } -> { ok }   (empty homepage clears it)
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

export const THEMES = ["starry", "hacker", "bubblegum", "ocean", "goth", "construction", "vapor", "geo"];

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Not logged in." }, 401);
  const body = await readJson(request);
  if ("my_button" in body) {
    const id = body.my_button ? Number(body.my_button) : null;
    if (id) {
      const own = await env.DB.prepare("SELECT 1 FROM instances WHERE id = ? AND owner_id = ? AND consumed = 0").bind(id, me.id).first();
      if (!own) return json({ error: "That button isn't yours." }, 400);
    }
    await env.DB.prepare("UPDATE users SET my_button = ? WHERE id = ?").bind(id, me.id).run();
    return json({ ok: true, my_button: id });
  }
  if ("theme" in body) {
    if (!THEMES.includes(body.theme)) return json({ error: "Unknown theme." }, 400);
    await env.DB.prepare("UPDATE users SET theme = ? WHERE id = ?").bind(body.theme, me.id).run();
    return json({ ok: true, theme: body.theme });
  }
  const c = cleanHomepage(body.homepage);
  if (c.error) return json({ error: c.error }, 400);
  await env.DB.prepare("UPDATE users SET homepage = ? WHERE id = ?").bind(c.value, me.id).run();
  return json({ ok: true, homepage: c.value });
}
