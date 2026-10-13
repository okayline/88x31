// POST /api/verify { stamp } -> what a button certificate proves.
// The checker page reads the stamp out of the GIF in the browser and sends only the text
// (the image itself never leaves the visitor's computer).
import { json, readJson } from "../../lib/auth.js";
import { checkStamp } from "../../lib/cert.js";

export async function onRequestPost({ env, request }) {
  const { stamp } = await readJson(request);
  const c = await checkStamp(env, stamp);
  if (!c.ok) return json({ genuine: false, reason: c.reason });
  const f = c.fields;
  const copy = Number(f.copy);
  const now = await env.DB.prepare(
    `SELECT i.id, i.edition, i.consumed, u.name AS owner, d.name, d.image_key, d.rarity, d.max_editions
     FROM instances i JOIN designs d ON d.id = i.design_id LEFT JOIN users u ON u.id = i.owner_id WHERE i.id = ?`
  ).bind(copy).first();
  // the ledger entry named in the stamp must still be there, unchanged
  let ledgerOk = null;
  const m = /^#(\d+) ([0-9a-f]{64})$/.exec(f.ledger || "");
  if (m) {
    const row = await env.DB.prepare("SELECT hash FROM ledger WHERE id = ?").bind(Number(m[1])).first();
    ledgerOk = !!row && row.hash === m[2];
  }
  return json({ genuine: true, fields: f, ledger_ok: ledgerOk, now });
}
