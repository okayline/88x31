// Button certificates: a signed stamp written inside an owner's downloaded GIF.
//
// The stamp is plain text in a GIF comment block (browsers ignore it). Its last line is an
// Ed25519 signature over everything above it, made with the cLuB's secret key (the
// SIGNING_KEY secret, a private JWK). Anyone can check it against the public key on the
// About page; change one character and the signature no longer matches.
// The file is a dated certificate ("issued to X on date"); the ledger says who owns it now.

export const CERT_HEADER = "88x31 cLuB certificate v1";
const enc = new TextEncoder();

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s) => s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);

// Read the secret key, forgiving stray characters (BOMs, quotes, line breaks) that
// Windows PowerShell can add when the key is piped into wrangler.
function privateJwk(env) {
  const raw = String(env.SIGNING_KEY || "");
  if (!raw) return null;
  const tryParse = (t) => { try { const j = JSON.parse(t); return j && j.d && j.x ? j : null; } catch { return null; } };
  const cleaned = raw.replace(/\u0000/g, "").replace(/^\uFEFF/, "").trim();
  let jwk = tryParse(cleaned);
  if (!jwk) { const m = /\{[^{}]*\}/.exec(cleaned); if (m) jwk = tryParse(m[0]); }
  if (!jwk) {
    const pick = (k) => { const m = new RegExp(`"?${k}"?\\s*:\\s*"?([A-Za-z0-9_-]+)`).exec(cleaned); return m ? m[1] : null; };
    const d = pick("d"), x = pick("x");
    if (d && x) jwk = { kty: "OKP", crv: "Ed25519", d, x };
  }
  return jwk ? { kty: "OKP", crv: "Ed25519", d: jwk.d, x: jwk.x } : null;
}

// For troubleshooting: "missing", "unreadable" or "ok".
export function keyStatus(env) {
  if (!env.SIGNING_KEY) return "missing";
  return privateJwk(env) ? "ok" : "unreadable";
}

// The public half, as base64 (shown on the About page).
export function publicKey(env) {
  const jwk = privateJwk(env);
  return jwk && jwk.x ? b64(unb64(b64url(jwk.x))) : null;
}

async function signKey(env) {
  const jwk = privateJwk(env);
  if (!jwk) throw new Error("no signing key");
  return crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}
async function verifyKey(env) {
  const jwk = privateJwk(env);
  if (!jwk) throw new Error("no signing key");
  return crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
}

// Build and sign a stamp. `fields` is an ordered list of [key, value].
export async function makeStamp(env, fields) {
  const body = [CERT_HEADER, ...fields.map(([k, v]) => `${k}: ${String(v ?? "").replace(/[\r\n]+/g, " ")}`)].join("\n");
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, await signKey(env), enc.encode(body));
  return body + "\nsig: " + b64(sig);
}

// Check a stamp's signature. Returns { ok, fields } or { ok: false, reason }.
export async function checkStamp(env, text) {
  const s = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!s.startsWith(CERT_HEADER)) return { ok: false, reason: "not a cLuB certificate" };
  const at = s.lastIndexOf("\nsig: ");
  if (at < 0) return { ok: false, reason: "no signature" };
  const body = s.slice(0, at), sigText = s.slice(at + 6).trim();
  let good = false;
  try { good = await crypto.subtle.verify({ name: "Ed25519" }, await verifyKey(env), unb64(sigText), enc.encode(body)); }
  catch { good = false; }
  const fields = {};
  for (const line of body.split("\n").slice(1)) {
    const i = line.indexOf(": ");
    if (i > 0) fields[line.slice(0, i)] = line.slice(i + 2);
  }
  return good ? { ok: true, fields } : { ok: false, reason: "signature doesn't match", fields };
}

// Insert a GIF comment extension (0x21 0xFE, 255-byte sub-blocks, 0x00) right after the
// header + logical screen descriptor + global color table, so it comes before any image data.
export function addGifComment(gifBytes, text) {
  const g = new Uint8Array(gifBytes);
  const sig = String.fromCharCode(...g.slice(0, 6));
  if (sig !== "GIF89a" && sig !== "GIF87a") throw new Error("not a GIF");
  const packed = g[10];
  const gctSize = packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  const at = 13 + gctSize;
  const data = enc.encode(text);
  const parts = [0x21, 0xfe];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    parts.push(chunk.length, ...chunk);
  }
  parts.push(0x00);
  const out = new Uint8Array(g.length + parts.length);
  out.set(g.slice(0, at), 0);
  out.set(parts, at);
  out.set(g.slice(at), at + parts.length);
  out.set(enc.encode("GIF89a"), 0); // comments need the 89a format
  return out;
}

// Read every comment block out of a GIF (used by the checker in the browser and in tests).
export function readGifComments(gifBytes) {
  const g = new Uint8Array(gifBytes);
  const out = [];
  if (g.length < 13) return out;
  let p = 13;
  if (g[10] & 0x80) p += 3 * (1 << ((g[10] & 0x07) + 1));
  const dec = new TextDecoder();
  const skipSub = () => { while (p < g.length && g[p] !== 0) p += g[p] + 1; p++; };
  while (p < g.length) {
    const b = g[p];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      const label = g[p + 1]; p += 2;
      if (label === 0xfe) {
        const bytes = [];
        while (p < g.length && g[p] !== 0) { bytes.push(...g.slice(p + 1, p + 1 + g[p])); p += g[p] + 1; }
        p++;
        out.push(dec.decode(new Uint8Array(bytes)));
      } else skipSub();
    } else if (b === 0x2c) {
      const packed = g[p + 9]; p += 10;
      if (packed & 0x80) p += 3 * (1 << ((packed & 0x07) + 1));
      p++; // LZW min code size
      skipSub();
    } else break;
  }
  return out;
}
