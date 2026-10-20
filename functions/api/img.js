// GET /api/img?d=N -> design N's GIF: an uploaded button's own bytes, or the built-in file at its image_key (the
// shared item registry points every 88x31 button here, built-in ones too). Removed buttons, and ids with neither,
// show the "removed by request" picture.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("d"));
  const row = id ? await env.DB.prepare(
    "SELECT d.status, d.image_key, i.data FROM designs d LEFT JOIN design_images i ON i.design_id = d.id WHERE d.id = ?"
  ).bind(id).first() : null;
  if (row && row.status !== "removed" && !row.data && row.image_key && !/^\/*api\/img/.test(row.image_key)) return Response.redirect(new URL("/" + row.image_key.replace(/^\/+/, ""), url.origin).toString(), 302);
  if (!row || row.status === "removed" || !row.data) return Response.redirect(`${url.origin}/banners/removed.gif`, 302);
  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": "image/gif", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" },
  });
}
