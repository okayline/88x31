// Shared helpers: save codes, hashing, sessions, cookies, rate limits.

// No 0/O, 1/I/L, so codes are easy to copy by hand. 31 symbols.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 20;          // ~99 bits of randomness
const GROUP = 4;
const SESSION_DAYS = 30;
export const MAX_CODES = 5;

export const now = () => Math.floor(Date.now() / 1000);

// Random code like K7QM-2XPA-9RTD-HV4C-8NBE (rejection sampling, no bias).
export function newSaveCode() {
  const out = [];
  const buf = new Uint8Array(64);
  while (out.length < CODE_LEN) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248 && out.length < CODE_LEN) out.push(ALPHABET[b % 31]); // 248 = 8*31
    }
  }
  const s = out.join("");
  return s.match(new RegExp(`.{1,${GROUP}}`, "g")).join("-");
}

// Accepts any spacing, case or dashes.
export function normalizeCode(input) {
  return String(input || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashCode = (code) => sha256("code:" + normalizeCode(code));

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- responses & cookies ----------

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const COOKIE = "sid";

export function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- sessions ----------

export async function startSession(env, userId) {
  const token = randomToken();
  const t = now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256("session:" + token), userId, t, t + SESSION_DAYS * 86400).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}

export async function endSession(env, request) {
  const token = readCookie(request, COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256("session:" + token)).run();
  }
  return sessionCookie("", 0);
}

// Returns { id, name, is_admin } or null.
export async function currentUser(env, request) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.name, u.is_admin, u.homepage, u.theme FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256("session:" + token), now()).first();
}

// ---------- rate limiting ----------

// Returns true if allowed. Fixed window per hashed IP + action.
export async function rateLimit(env, request, action, limit, windowSecs) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = action + ":" + (await sha256("ip:" + ip)).slice(0, 32);
  const t = now();
  const windowStart = t - (t % windowSecs);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`
  ).bind(key, windowStart).first();
  // Tidy old windows now and then.
  if (Math.random() < 0.02) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(t - 86400).run();
  }
  return row.count <= limit;
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}
