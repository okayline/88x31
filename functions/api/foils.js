// GET /api/foils -> { foils: [{ id, name, effect, kind, tier, params }] }
// Every foil, pattern and effect a copy can have. The site draws each by its `effect` key;
// unknown or unfinished ones show as plain.
import { json } from "../../lib/auth.js";

export async function onRequestGet({ env }) {
  try {
    let results;
    try {
      results = (await env.DB.prepare("SELECT id, name, effect, kind, tier, params, design_id FROM foils ORDER BY sort, id").all()).results;
    } catch { // before migration 014
      results = (await env.DB.prepare("SELECT id, name, effect, params, design_id FROM foils ORDER BY sort, id").all()).results
        .map((f) => ({ ...f, kind: "foil", tier: f.id === "clear" ? 0 : 1 }));
    }
    return json({ foils: results.map((f) => { let p = {}; try { p = JSON.parse(f.params || "{}"); } catch {} return { ...f, params: p }; }) },
      200, { "cache-control": "public, max-age=300" });
  } catch {
    return json({ foils: [{ id: "clear", name: "Clear", effect: "clear", params: {} }] });
  }
}
