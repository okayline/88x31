// GET /api/foils -> { foils: [{ id, name, effect, params }] } the kinds of foil a copy can have.
// The site draws each effect as an overlay; unknown or unfinished effects show as clear.
import { json } from "../../lib/auth.js";

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, effect, params, design_id FROM foils ORDER BY sort, id"
    ).all();
    return json({ foils: results.map((f) => { let p = {}; try { p = JSON.parse(f.params || "{}"); } catch {} return { ...f, params: p }; }) },
      200, { "cache-control": "public, max-age=300" });
  } catch {
    return json({ foils: [{ id: "clear", name: "Clear", effect: "clear", params: {} }] });
  }
}
