// POST /api/upload  (multipart form: file, batch?)  -> { ok, design_id, instance_id, foiled }  or { error, design_id? }
// batch=1 (webmasters only): a bulk import. Credited "Found on the internets", no finder and no
// copy #1: the button goes straight into packs and #1 goes to whoever pulls it first.
// Add a button found in the wild to the cLuB. It joins the archive tier: shown as found,
// credited where known, never relicensed. The finder gets copy #1 and a "found by" credit.
// Rules: a real 88x31 GIF, not already in the cLuB, never an ultra. Uploads are commons of kind "found",
// named after their file. The finder's copy #1 gets better holo odds (FINDER_FOILS).
import { json, currentUser, now, rateLimit } from "../../lib/auth.js";
import { mintStatements } from "../../lib/game.js";
import { sealSafe } from "../../lib/ledger.js";

export const MAX_BYTES = 100 * 1024;
export const UPLOADS_PER_DAY = 10;
// finder's copy #1: 20% chance of a tier 1 foil (normal is 8%); weights out of 10000 like the foils table
export const FINDER_FOILS = { holo: 667, galaxy: 667, ripple: 666, clear: 6400 };

async function sha256Bytes(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A GIF whose logical screen is 88x31, give or take a pixel (old buttons weren't always exact).
export function isButtonGif(b) {
  if (b.length < 13) return false;
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== "GIF89a" && sig !== "GIF87a") return false;
  const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8);
  return w >= 87 && w <= 89 && h >= 30 && h <= 32;
}

const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to add a button." }, 401);
  const u = await env.DB.prepare("SELECT upload_blocked FROM users WHERE id = ?").bind(me.id).first();
  if (u && u.upload_blocked) return json({ error: "Adding buttons is switched off for your account." }, 403);
  // webmasters have no upload limits
  if (!me.is_admin && !(await rateLimit(env, request, "upload", 30, 86400))) return json({ error: "Slow down! Try again tomorrow." }, 429);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Couldn't read that upload." }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Pick a GIF to add." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "That file is too big for an 88x31 button (100 KB max)." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isButtonGif(bytes)) return json({ error: "It has to be an 88x31 GIF (give or take a pixel)." }, 400);

  const name = clean(String(file.name || "").replace(/\.gif$/i, ""), 40) || "untitled";
  const batch = !!me.is_admin && form.get("batch") === "1";
  // webmasters can add the cLuB's own art straight into a series (series=<id>)
  const intoSeries = me.is_admin && form.get("series") ? Number(form.get("series")) : null;
  if (intoSeries && !(await env.DB.prepare("SELECT 1 FROM series WHERE id = ?").bind(intoSeries).first())) return json({ error: "No such series." }, 400);

  const today = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM designs WHERE found_by = ? AND created_at > ?"
  ).bind(me.id, now() - 86400).first()).n;
  // (batch imports have no finder, so they never count toward anyone's daily limit)
  if (!me.is_admin && today >= UPLOADS_PER_DAY) return json({ error: `You can add ${UPLOADS_PER_DAY} buttons a day. Come back tomorrow!` }, 429);

  const hash = await sha256Bytes(bytes);
  const dupe = await env.DB.prepare("SELECT id, name, status FROM designs WHERE image_hash = ?").bind(hash).first();
  if (dupe) return json({ error: dupe.status === "removed" ? "That button was removed by request." : `That one's already in ~*~ tHe cLuB ~*~: ${dupe.name}!`, design_id: dupe.status === "removed" ? null : dupe.id }, 409);

  const t = now();
  if (intoSeries) {
    const r = await env.DB.prepare(
      `INSERT INTO designs (name, image_key, image_hash, creator_id, type, rarity, stats, status, created_at,
                            source_title, source_author, source_url, license, tier, series_id)
       VALUES (?, 'pending', ?, ?, ?, ?, '{}', 'active', ?, ?, '88x31', NULL, 'Original', 'original', ?)`
    ).bind(name, hash, me.id, form.get("kind") || "neon", ["common", "uncommon", "rare", "prototype", "ultra"].includes(form.get("rarity")) ? form.get("rarity") : "common", t, name, intoSeries).run();
    const did = r.meta.last_row_id;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO design_images (design_id, data) VALUES (?, ?)").bind(did, bytes),
      env.DB.prepare("UPDATE designs SET image_key = ? WHERE id = ?").bind(`api/img?d=${did}`, did),
      env.DB.prepare("UPDATE designs SET max_editions = CASE rarity WHEN 'ultra' THEN 1 WHEN 'prototype' THEN 4 ELSE NULL END WHERE id = ?").bind(did),
    ]);
    await sealSafe(env);
    return json({ ok: true, design_id: did, original: true });
  }
  const ins = await env.DB.prepare(
    `INSERT INTO designs (name, image_key, image_hash, creator_id, type, rarity, stats, status, created_at,
                          source_title, source_author, source_url, license, tier, found_by)
     VALUES (?, 'pending', ?, ?, 'found', 'common', '{}', 'active', ?, NULL, ?, NULL, 'Not relicensed', 'archive', ?)`
  ).bind(name, hash, me.id, t, batch ? "Found on the internets" : "Origin unknown, found in the wild", batch ? null : me.id).run();
  const id = ins.meta.last_row_id;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO design_images (design_id, data) VALUES (?, ?)").bind(id, bytes),
    env.DB.prepare("UPDATE designs SET image_key = ? WHERE id = ?").bind(`api/img?d=${id}`, id),
  ]);
  if (batch) { await sealSafe(env); return json({ ok: true, design_id: id, batch: true }); }
  const res = await env.DB.batch(await mintStatements(env, id, me.id, "found", null, { weights: FINDER_FOILS }));
  await sealSafe(env);
  const inst = await env.DB.prepare(
    "SELECT i.id, f.tier FROM instances i LEFT JOIN foils f ON f.id = i.foil WHERE i.design_id = ? AND i.edition = 1"
  ).bind(id).first();
  return json({ ok: res[0].meta.changes === 1, design_id: id, instance_id: inst ? inst.id : null, foiled: !!inst && inst.tier >= 1 });
}
