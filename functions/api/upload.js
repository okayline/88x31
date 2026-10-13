// POST /api/upload  (multipart form: file, name, type, author?, url?)
//   -> { ok, design_id, instance_id }  or { error, design_id? }
// Add a button found in the wild to the cLuB. It joins the archive tier: shown as found,
// credited where known, never relicensed. The finder gets copy #1 and a "found by" credit.
// Rules: a real 88x31 GIF, not already in the cLuB, never an ultra. Uploads start as commons.
import { json, currentUser, now, rateLimit } from "../../lib/auth.js";
import { mintStatements } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";

export const MAX_BYTES = 100 * 1024;
export const UPLOADS_PER_DAY = 10;
export const TYPES = ["neon", "construction", "guestbook", "webring", "counter", "divider"];

async function sha256Bytes(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A GIF whose logical screen is exactly 88x31.
export function isButtonGif(b) {
  if (b.length < 13) return false;
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== "GIF89a" && sig !== "GIF87a") return false;
  const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8);
  return w === 88 && h === 31;
}

const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to add a button." }, 401);
  const u = await env.DB.prepare("SELECT upload_blocked FROM users WHERE id = ?").bind(me.id).first();
  if (u && u.upload_blocked) return json({ error: "Adding buttons is switched off for your account." }, 403);
  if (!(await rateLimit(env, request, "upload", 30, 86400))) return json({ error: "Slow down! Try again tomorrow." }, 429);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Couldn't read that upload." }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Pick a GIF to add." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "That file is too big for an 88x31 button (100 KB max)." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isButtonGif(bytes)) return json({ error: "It has to be a real 88x31 GIF." }, 400);

  const name = clean(form.get("name"), 40);
  if (!name) return json({ error: "Give the button a name." }, 400);
  const type = TYPES.includes(form.get("type")) ? form.get("type") : "neon";
  const author = clean(form.get("author"), 60) || null;
  let url = clean(form.get("url"), 300) || null;
  if (url && !/^https?:\/\//i.test(url)) url = null;

  const today = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM designs WHERE found_by = ? AND created_at > ?"
  ).bind(me.id, now() - 86400).first()).n;
  if (today >= UPLOADS_PER_DAY) return json({ error: `You can add ${UPLOADS_PER_DAY} buttons a day. Come back tomorrow!` }, 429);

  const hash = await sha256Bytes(bytes);
  const dupe = await env.DB.prepare("SELECT id, name, status FROM designs WHERE image_hash = ?").bind(hash).first();
  if (dupe) return json({ error: dupe.status === "removed" ? "That button was removed by request." : `That one's already in the cLuB: ${dupe.name}!`, design_id: dupe.status === "removed" ? null : dupe.id }, 409);

  const t = now();
  const ins = await env.DB.prepare(
    `INSERT INTO designs (name, image_key, image_hash, creator_id, type, rarity, stats, status, created_at,
                          source_title, source_author, source_url, license, tier, found_by)
     VALUES (?, 'pending', ?, ?, ?, 'common', '{}', 'active', ?, ?, ?, ?, 'Not relicensed', 'archive', ?)`
  ).bind(name, hash, me.id, type, t, url ? name : null, author || "Origin unknown, found in the wild", url, me.id).run();
  const id = ins.meta.last_row_id;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO design_images (design_id, data) VALUES (?, ?)").bind(id, bytes),
    env.DB.prepare("UPDATE designs SET image_key = ? WHERE id = ?").bind(`api/img?d=${id}`, id),
  ]);
  const res = await env.DB.batch(await mintStatements(env, id, me.id, "found"));
  await sealSafe(env);
  const inst = await env.DB.prepare("SELECT id FROM instances WHERE design_id = ? AND edition = 1").bind(id).first();
  return json({ ok: res[0].meta.changes === 1, design_id: id, instance_id: inst ? inst.id : null });
}
