// GET /api/download?id=N -> the owner's stamped, signed copy of a button as a GIF download.
// Only the current owner can get it. Only the cLuB's own art can be downloaded; archive buttons can't.
import { json, currentUser } from "../../lib/auth.js";
import { sealSafe } from "../../lib/ledger.js";
import { makeStamp, addGifComment } from "../../lib/cert.js";

export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  if (!me) return json({ error: "Log in to download your copy." }, 401);
  if (!env.SIGNING_KEY) return json({ error: "Signed downloads aren't switched on yet." }, 503);
  const id = Number(new URL(request.url).searchParams.get("id"));

  const b = await env.DB.prepare(
    `SELECT i.id, i.edition, i.owner_id, d.name, d.image_key, d.max_editions, d.source_title, d.source_author, d.license, d.tier, d.status
     FROM instances i JOIN designs d ON d.id = i.design_id WHERE i.id = ? AND i.consumed = 0`
  ).bind(id).first();
  if (!b) return json({ error: "No such button." }, 404);
  if (b.owner_id !== me.id) return json({ error: "Only the owner can download the stamped copy." }, 403);
  if (b.tier !== "original" || b.status === "removed") return json({ error: "This button can't be downloaded." }, 403);

  // the ledger entry for how it reached its current owner
  await sealSafe(env);
  const entry = await env.DB.prepare(
    `SELECT l.id, l.hash FROM ownership_history h JOIN ledger l ON l.kind = 'transfer' AND l.ref_id = h.id
     WHERE h.instance_id = ? ORDER BY h.id DESC LIMIT 1`
  ).bind(id).first();

  const origin = new URL(request.url).origin;
  const art = b.license === "Original" ? "original art by the 88x31 cLuB"
    : `${b.source_title || "untitled"} by ${b.source_author || "unknown"} (${b.license})`;
  const stamp = await makeStamp(env, [
    ["copy", b.id],
    ["button", `${b.name} #${b.edition}${b.max_editions ? " of " + b.max_editions : ""}`],
    ["issued_to", me.name],
    ["ledger", entry ? `#${entry.id} ${entry.hash}` : "-"],
    ["issued_at", new Date().toISOString()],
    ["page", `${origin}/#banner/${b.id}`],
    ["art", art],
  ]);

  const res = await env.ASSETS.fetch(new Request(`${origin}/${b.image_key}`));
  if (!res.ok) return json({ error: "Couldn't load the button image." }, 500);
  const gif = addGifComment(await res.arrayBuffer(), stamp);
  // same name the "Use this button" code expects, e.g. radical-holo-3.gif
  const file = b.image_key.split("/").pop().replace(/\.gif$/, `-${b.edition}.gif`);
  return new Response(gif, {
    headers: {
      "content-type": "image/gif",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
