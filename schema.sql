-- 88x31 banner collecting game: database schema (Cloudflare D1 / SQLite)
-- Times are unix seconds. Run with:
--   npx wrangler d1 execute 88x31-db --remote --file=schema.sql

PRAGMA foreign_keys = ON;

-- ---------- accounts & login (save codes, no email) ----------

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  is_bot      INTEGER NOT NULL DEFAULT 0,   -- bots play once a day (lib/bots.js); can't log in
  last_seen   INTEGER,                      -- bots: when they were last online
  homepage    TEXT,                         -- player's own website (http/https), shown on their guestbook
  theme       TEXT,                         -- guestbook color theme (preset name)
  created_at  INTEGER NOT NULL
);

-- A player can hold several save codes. Only a SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS save_codes (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash     TEXT NOT NULL UNIQUE,
  label         TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_save_codes_user ON save_codes(user_id);

-- Login sessions. Only a hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Simple fixed-window rate limiting (login, signup) keyed by hashed IP.
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- ---------- banners ----------

-- A banner design: the art and its game data.
CREATE TABLE IF NOT EXISTS designs (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  image_key    TEXT NOT NULL,            -- R2 object key of the 88x31 gif
  image_hash   TEXT NOT NULL UNIQUE,     -- SHA-256 of the file, catches duplicate uploads
  creator_id   INTEGER REFERENCES users(id),
  type         TEXT NOT NULL,            -- e.g. neon, construction, guestbook, webring, counter, divider
  rarity       TEXT NOT NULL DEFAULT 'common',
  stats        TEXT NOT NULL DEFAULT '{}',  -- JSON
  max_editions INTEGER,                  -- NULL = unlimited
  status       TEXT NOT NULL DEFAULT 'active', -- active | pending | removed
  created_at   INTEGER NOT NULL,
  source_title  TEXT,   -- where the art came from (see migrations/005)
  source_author TEXT,
  source_url    TEXT,
  license       TEXT    -- e.g. "CC0 1.0", "CC BY 4.0", "Original"
);

-- One owned copy of a design.
CREATE TABLE IF NOT EXISTS instances (
  id          INTEGER PRIMARY KEY,
  design_id   INTEGER NOT NULL REFERENCES designs(id),
  edition     INTEGER NOT NULL,
  owner_id    INTEGER REFERENCES users(id),   -- NULL once consumed
  locked      INTEGER NOT NULL DEFAULT 0,     -- 1 while in a trade offer or fusion
  consumed    INTEGER NOT NULL DEFAULT 0,     -- 1 after being used up in a fusion
  created_at  INTEGER NOT NULL,
  UNIQUE (design_id, edition)
);
CREATE INDEX IF NOT EXISTS idx_instances_owner ON instances(owner_id);

-- Every ownership change, for provenance and debugging.
CREATE TABLE IF NOT EXISTS ownership_history (
  id           INTEGER PRIMARY KEY,
  instance_id  INTEGER NOT NULL REFERENCES instances(id),
  from_user    INTEGER REFERENCES users(id),
  to_user      INTEGER REFERENCES users(id),
  reason       TEXT NOT NULL,   -- starter | gift | trade | fusion | admin
  ref_id       INTEGER,         -- trade or fusion id
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_instance ON ownership_history(instance_id);

-- ---------- trading & gifting ----------

CREATE TABLE IF NOT EXISTS trades (
  id           INTEGER PRIMARY KEY,
  from_user    INTEGER NOT NULL REFERENCES users(id),
  to_user      INTEGER NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL DEFAULT 'trade',   -- trade | gift
  status       TEXT NOT NULL DEFAULT 'open',    -- open | accepted | declined | cancelled | expired
  message      TEXT,
  created_at   INTEGER NOT NULL,
  resolved_at  INTEGER,
  lock_token   INTEGER,                         -- locks the offerer's buttons while open (lib/trades.js)
  expires_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(lock_token);
CREATE INDEX IF NOT EXISTS idx_trades_to ON trades(to_user, status);
CREATE INDEX IF NOT EXISTS idx_trades_from ON trades(from_user, status);

CREATE TABLE IF NOT EXISTS trade_items (
  trade_id     INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  instance_id  INTEGER NOT NULL REFERENCES instances(id),
  side         TEXT NOT NULL,   -- give (from sender) | want (from recipient)
  PRIMARY KEY (trade_id, instance_id)
);

-- ---------- button wall ----------

CREATE TABLE IF NOT EXISTS wall_slots (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot         INTEGER NOT NULL,
  instance_id  INTEGER REFERENCES instances(id),
  PRIMARY KEY (user_id, slot)
);

-- ---------- webrings ----------

CREATE TABLE IF NOT EXISTS rings (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ring_members (
  ring_id     INTEGER NOT NULL REFERENCES rings(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  instance_id INTEGER REFERENCES instances(id),
  PRIMARY KEY (ring_id, position)
);

-- ---------- sets ----------

CREATE TABLE IF NOT EXISTS sets (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS set_designs (
  set_id     INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  design_id  INTEGER NOT NULL REFERENCES designs(id),
  PRIMARY KEY (set_id, design_id)
);

-- ---------- fusion ----------

CREATE TABLE IF NOT EXISTS fusions (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  input_a      INTEGER NOT NULL REFERENCES instances(id),
  input_b      INTEGER NOT NULL REFERENCES instances(id),
  output_id    INTEGER NOT NULL REFERENCES instances(id),
  created_at   INTEGER NOT NULL
);

-- ---------- moderation ----------

CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY,
  reporter_id  INTEGER REFERENCES users(id),
  design_id    INTEGER REFERENCES designs(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',   -- open | actioned | dismissed
  created_at   INTEGER NOT NULL
);

-- ---------- daily pulls & guestbooks (also in migrations/002_pulls_guestbook.sql) ----------
CREATE TABLE IF NOT EXISTS daily_pulls (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  options      TEXT NOT NULL,              -- JSON array of 3 design ids
  status       TEXT NOT NULL DEFAULT 'open', -- open | done
  kept_index   INTEGER,
  passed_index INTEGER,
  passed_to    INTEGER REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Guestbook messages. A signer can attach one of their banners as a gift (the "stamp");
-- it moves to the page owner and stays shown next to the message.
CREATE TABLE IF NOT EXISTS guestbook_entries (
  id           INTEGER PRIMARY KEY,
  page_user    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id),
  message      TEXT NOT NULL,
  instance_id  INTEGER REFERENCES instances(id),
  day          TEXT NOT NULL,               -- YYYY-MM-DD (UTC), for one-per-day
  created_at   INTEGER NOT NULL,
  UNIQUE (page_user, author_id, day)
);
CREATE INDEX IF NOT EXISTS idx_guestbook_page ON guestbook_entries(page_user, created_at);

-- ---------- visitor counter (also in migrations/003_counter.sql) ----------
CREATE TABLE IF NOT EXISTS counters (
  name   TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('visits', 0);
INSERT OR IGNORE INTO counters (name, value) VALUES ('bots_day', 0);

-- ---------- the ledger (also in migrations/005_sources_ledger.sql) ----------
-- One hash chain over design creations and ownership changes. See lib/ledger.js.
CREATE TABLE IF NOT EXISTS ledger (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,        -- design | transfer
  ref_id      INTEGER NOT NULL,
  record      TEXT NOT NULL,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  UNIQUE (kind, ref_id)
);

-- ---------- bot schedule (also in migrations/007_bot_schedule.sql) ----------
CREATE TABLE IF NOT EXISTS bot_runs (
  bot_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,      -- YYYY-MM-DD in Hawaii time (the bots' day)
  action      TEXT NOT NULL,      -- 'pull' or 'sign1', 'sign2', ...
  done_at     INTEGER NOT NULL,
  PRIMARY KEY (bot_id, day, action)
);

-- ---------- performance (also in migrations/009_perf.sql) ----------
CREATE TABLE IF NOT EXISTS meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_reason ON ownership_history(reason, id);

CREATE INDEX IF NOT EXISTS idx_wall_instance ON wall_slots(instance_id);
