// GET /api/registry/button?item=ID&copy=N: from a copy's page in the shared registry to this button's own page here.
// The registry knows a copy only by its shared item id and copy number; this game remembers both on the copy
// (designs.registry_item, instances.registry_copy, see lib/registry.js), so it looks the copy up and sends the visitor
// to #banner/<id>. A copy this game doesn't know goes back to the registry's page for it.
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams, item = Number(q.get("item")), copy = Number(q.get("copy"));
  const ok = Number.isInteger(item) && Number.isInteger(copy) && item > 0 && copy > 0;
  const row = ok ? await env.DB.prepare(
    "SELECT i.id FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.registry_item = ? AND i.registry_copy = ?"
  ).bind(item, copy).first() : null;
  const to = row ? "/#banner/" + row.id : ok ? `/registry?item=${item}&copy=${copy}` : "/registry";
  return new Response(null, { status: 302, headers: { location: new URL(to, request.url).toString(), "cache-control": "no-store" } });
}
