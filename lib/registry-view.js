// The shared item registry's public ledger, passed through on 88x31.app so the registry Worker's own address never
// shows. Read only: three GET routes, each asking the dungeon-items Worker (binding ACCOUNTS) for the same path and
// handing its answer back. Only the parameters the registry reads are forwarded; nothing here writes or needs the key.
//   GET /registry                           the ledger page (a copy's page with ?item=ID&copy=N)
//   GET /api/registry/ledger?before=&limit= the ledger, newest first
//   GET /api/registry/copy?item=&copy=      one copy's story
import { json } from "./auth.js";

const ASKS = { "/ledger": ["item", "copy"], "/api/registry/ledger": ["before", "limit"], "/api/registry/copy": ["item", "copy"] };

export async function passThrough(env, request, path) {
  if (!env.ACCOUNTS) return json({ error: "The registry is unavailable right now. Try again in a moment." }, 503);
  const from = new URL(request.url).searchParams, ask = new URLSearchParams();
  for (const k of ASKS[path]) if (from.has(k)) ask.set(k, from.get(k));
  const qs = ask.toString();
  let r;
  try { r = await env.ACCOUNTS.fetch("https://accounts.internal" + path + (qs ? "?" + qs : ""), { method: "GET" }); }
  catch { return json({ error: "The registry is unavailable right now. Try again in a moment." }, 503); }
  return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": r.headers.get("cache-control") || "no-store" } });
}
