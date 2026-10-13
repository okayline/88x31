// GET /api/img?d=N -> an uploaded button's GIF. Removed buttons show the "removed by request" picture.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("d"));
  const row = id ? await env.DB.prepare(
    "SELECT d.status, i.data FROM designs d JOIN design_images i ON i.design_id = d.id WHERE d.id = ?"
  ).bind(id).first() : null;
  if (!row || row.status === "removed") return Response.redirect(`${url.origin}/banners/removed.gif`, 302);
  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": "image/gif", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" },
  });
}
