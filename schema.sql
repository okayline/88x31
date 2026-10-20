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
  my_button   INTEGER,                      -- instance shown as their calling card in Cool Links
  created_at  INTEGER NOT NULL,
  came_from   TEXT,                         -- v0.29: site they first came from
  joined_via  TEXT                          -- v0.29: free pack / sign-up form
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
  created_at  INTEGER NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0   -- v0.38: a "cLuB Ring #N" new players are grouped into (owned by the webmaster)
);

CREATE TABLE IF NOT EXISTS ring_members (
  ring_id     INTEGER NOT NULL REFERENCES rings(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  instance_id INTEGER REFERENCES instances(id),
  PRIMARY KEY (ring_id, position)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ring_members_user ON ring_members(ring_id, user_id) WHERE user_id IS NOT NULL;

-- ---------- Theme Wall (v0.38; also migrations/028_theme_walls.sql) ----------
-- One wall per ring per week; pins are pointers to copies (see lib/themewall.js).
CREATE TABLE IF NOT EXISTS ring_walls (
  id          INTEGER PRIMARY KEY,
  ring_id     INTEGER NOT NULL REFERENCES rings(id) ON DELETE CASCADE,
  week        INTEGER NOT NULL,
  theme       TEXT NOT NULL,
  size        INTEGER NOT NULL,
  slots       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  locked_at   INTEGER,
  snapshot    TEXT,
  height      INTEGER,                         -- v0.46.5 (migration 030): canvas height in px; NULL = square (size x size)
  UNIQUE (ring_id, week)
);
CREATE TABLE IF NOT EXISTS wall_pins (
  wall_id     INTEGER NOT NULL REFERENCES ring_walls(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  instance_id INTEGER REFERENCES instances(id),
  x           INTEGER NOT NULL,
  y           INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (wall_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wall_pins_instance ON wall_pins(instance_id);

-- ---------- sets ----------

CREATE TABLE IF NOT EXISTS sets (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  slug        TEXT,
  secret      INTEGER NOT NULL DEFAULT 0,   -- hidden until finished
  reward_design_id INTEGER REFERENCES designs(id),
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_slug ON sets(slug);

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

-- ---------- set rewards & link exchange (also in migrations/012_sets_links.sql) ----------
CREATE TABLE IF NOT EXISTS set_claims (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id      INTEGER NOT NULL REFERENCES sets(id),
  instance_id INTEGER REFERENCES instances(id),
  claimed_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, set_id)
);
CREATE TABLE IF NOT EXISTS link_exchanges (
  from_user   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (from_user, to_user)
);
CREATE INDEX IF NOT EXISTS idx_links_to ON link_exchanges(to_user, status);

-- ---------- v0.18: foils, tiers, uploads, webmaster actions (also in migrations/013_foils_uploads.sql) ----------
--   npx wrangler d1 execute 88x31-db --remote --file=013_foils_uploads.sql

-- ---------- foils ----------
-- The foil is the owned layer around a copy. The art is shared; each copy's foil is its own.
-- effect = which overlay the site draws (unknown or unfinished effects show as clear).
-- weight = chance out of 1000 when a new copy is made. max_per_design = cap per design (NULL = no cap).
-- design_id = a signature foil that only that design can get. rarities = JSON list it can land on (NULL = any).
CREATE TABLE IF NOT EXISTS foils (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  effect          TEXT NOT NULL DEFAULT 'clear',
  params          TEXT NOT NULL DEFAULT '{}',
  weight          INTEGER NOT NULL DEFAULT 0,
  max_per_design  INTEGER,
  design_id       INTEGER REFERENCES designs(id),
  rarities        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',   -- active | draft
  sort            INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO foils (id, name, effect, weight, max_per_design, sort) VALUES ('clear', 'Clear', 'clear', 920, NULL, 0);
INSERT OR IGNORE INTO foils (id, name, effect, weight, max_per_design, sort) VALUES ('holo', 'Holo', 'holo', 80, 25, 10);

-- NULL foil = a First Print copy, made before foils existed.
ALTER TABLE instances ADD COLUMN foil TEXT;
ALTER TABLE instances ADD COLUMN foil_seed INTEGER;

-- ---------- tiers & uploads ----------
-- tier: original (the cLuB's own art) | permissioned | archive (found in the wild, not relicensed)
ALTER TABLE designs ADD COLUMN tier TEXT NOT NULL DEFAULT 'original';
ALTER TABLE designs ADD COLUMN found_by INTEGER REFERENCES users(id);
ALTER TABLE designs ADD COLUMN original_image_key TEXT;   -- kept while a design is removed

-- Uploaded GIFs live in the database (88x31 GIFs are tiny).
CREATE TABLE IF NOT EXISTS design_images (
  design_id  INTEGER PRIMARY KEY REFERENCES designs(id),
  data       BLOB NOT NULL
);

ALTER TABLE users ADD COLUMN upload_blocked INTEGER NOT NULL DEFAULT 0;

-- ---------- webmaster actions (sealed into the ledger as kind 'admin') ----------
CREATE TABLE IF NOT EXISTS admin_actions (
  id          INTEGER PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,    -- remove_design | restore_design | block_uploader | unblock_uploader
  design_id   INTEGER REFERENCES designs(id),
  user_id     INTEGER REFERENCES users(id),
  note        TEXT,
  created_at  INTEGER NOT NULL
);


-- ---------- v0.19: foil tiers, patterns, effects, fusion (also in migrations/014_foil_tiers_fusion.sql) ----------

-- The foils table now holds three kinds of thing:
--   kind 'foil'    - the material. tier 0 = base (Clear, Glitter, Sheen), 1-3 = real foils.
--   kind 'pattern' - how a real foil's shine is cut (Fracture, Etched, Surge). Only on tier 1+ foils.
--   kind 'effect'  - how the whole button plays on screen (Dial-Up, Marquee, CRT, VHS, CRT+VHS).
-- Weights are relative within each kind. Pattern and effect chances live in lib/game.js.
ALTER TABLE foils ADD COLUMN kind TEXT NOT NULL DEFAULT 'foil';
ALTER TABLE foils ADD COLUMN tier INTEGER NOT NULL DEFAULT 0;

-- foils (weights out of 10000): base 91%, tier 1 8%, tier 2 0.9%, tier 3 0.1%
UPDATE foils SET weight = 7600, tier = 0, sort = 0, name = 'None' WHERE id = 'clear';
UPDATE foils SET weight = 267, tier = 1, max_per_design = NULL, sort = 10 WHERE id = 'holo';
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, sort) VALUES
  ('glitter',        'Glitter',        'glitter',        'foil', 0, 750, 1),
  ('sheen',          'Sheen',          'sheen',          'foil', 0, 750, 2),
  ('galaxy',         'Galaxy',         'galaxy',         'foil', 1, 267, 11),
  ('ripple',         'Ripple',         'ripple',         'foil', 1, 266, 12),
  ('chrome',         'Chrome',         'chrome',         'foil', 2, 30, 20),
  ('gold',           'Gold',           'gold',           'foil', 2, 30, 21),
  ('oil_slick',      'Oil Slick',      'oil-slick',      'foil', 2, 30, 22),
  ('prismatic',      'Prismatic',      'prismatic',      'foil', 3, 4, 30),
  ('double_rainbow', 'Double Rainbow', 'double-rainbow', 'foil', 3, 3, 31),
  ('liquid_metal',   'Liquid Metal',   'liquid-metal',   'foil', 3, 3, 32);

-- patterns (relative weights)
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, sort) VALUES
  ('fracture', 'Fracture', 'fracture', 'pattern', 0, 34, 50),
  ('etched',   'Etched',   'etched',   'pattern', 0, 33, 51),
  ('surge',    'Surge',    'surge',    'pattern', 0, 33, 52);

-- effects (relative weights; CRT+VHS only comes from fusion)
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, sort) VALUES
  ('dialup',  'Dial-Up', 'dialup',  'effect', 0, 400, 70),
  ('marquee', 'Marquee', 'marquee', 'effect', 0, 400, 71),
  ('crt',     'CRT',     'crt',     'effect', 0, 150, 72),
  ('vhs',     'VHS',     'vhs',     'effect', 0, 50, 73),
  ('crt_vhs', 'CRT+VHS', 'crt-vhs', 'effect', 0, 0, 74);

ALTER TABLE instances ADD COLUMN pattern TEXT;
ALTER TABLE instances ADD COLUMN effect TEXT;

-- Fusion: 3 copies of one button in, the lowest-numbered one survives upgraded (output_id),
-- the other two (input_a, input_b) are used up. The result is recorded here and sealed into the ledger.
ALTER TABLE fusions ADD COLUMN foil TEXT;
ALTER TABLE fusions ADD COLUMN pattern TEXT;
ALTER TABLE fusions ADD COLUMN effect TEXT;
ALTER TABLE fusions ADD COLUMN prev_foil TEXT;
CREATE INDEX IF NOT EXISTS idx_instances_design ON instances(design_id, consumed);

-- ---------- v0.20: set showcase (also in migrations/015_set_showcase.sql) ----------
ALTER TABLE set_claims ADD COLUMN showcase INTEGER NOT NULL DEFAULT 0;

-- ---------- v0.22: series and sealed packs (also in migrations/016_series_packs.sql) ----------

-- ---------- series ----------
-- The cLuB's own original buttons come in Series (Alpha, Beta, Gamma...). Found buttons are
-- outside series. status: upcoming (loaded, not in packs) | active (in packs) | retired (out of packs).
-- Up to 3 active at once; packs favor the newest (lib/game.js SERIES_WEIGHTS).
CREATE TABLE IF NOT EXISTS series (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'upcoming',
  sort         INTEGER NOT NULL DEFAULT 0,
  released_at  INTEGER,
  created_at   INTEGER NOT NULL
);
INSERT OR IGNORE INTO series (id, name, status, sort, released_at, created_at)
  VALUES (1, 'Alpha', 'active', 1, strftime('%s','now'), strftime('%s','now'));

ALTER TABLE designs ADD COLUMN series_id INTEGER REFERENCES series(id);
ALTER TABLE sets ADD COLUMN series_id INTEGER REFERENCES series(id);
-- everything the cLuB made until today is Series Alpha (found buttons stay outside series)
UPDATE designs SET series_id = 1 WHERE tier != 'archive';
UPDATE sets SET series_id = 1;

-- ---------- sealed packs ----------
-- A pack is an item until it's opened: it can sit on your shelf, be given away, and is
-- recorded on the ledger. Its buttons are rolled only when it's opened.
-- series_id NULL = a mixed pack (like the daily one). keep = how many of the 3 you keep.
CREATE TABLE IF NOT EXISTS packs (
  id          INTEGER PRIMARY KEY,
  owner_id    INTEGER REFERENCES users(id),
  series_id   INTEGER REFERENCES series(id),
  source      TEXT NOT NULL,     -- webmaster | milestone | set | request | ...
  note        TEXT,
  keep        INTEGER NOT NULL DEFAULT 2,
  locked      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  opened_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_packs_owner ON packs(owner_id, opened_at);

-- Every time a pack is made or changes hands (sealed into the ledger as kind 'pack').
CREATE TABLE IF NOT EXISTS pack_history (
  id          INTEGER PRIMARY KEY,
  pack_id     INTEGER NOT NULL REFERENCES packs(id),
  from_user   INTEGER REFERENCES users(id),
  to_user     INTEGER REFERENCES users(id),
  reason      TEXT NOT NULL,     -- made | gift
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pack_history_pack ON pack_history(pack_id);

-- What a pack held and what was kept (sealed into the ledger as kind 'pack_open' once finished).
CREATE TABLE IF NOT EXISTS pack_openings (
  pack_id     INTEGER PRIMARY KEY REFERENCES packs(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  options     TEXT NOT NULL,     -- JSON: the 3 design ids that were in it
  kept        TEXT,              -- JSON: the new copies' instance ids, once chosen
  opened_at   INTEGER NOT NULL,
  done_at     INTEGER
);

-- ---------- ad-blocker-proof file names ----------
-- Some blockers hide images with "hit-counter" / "visitor" in the name. Same art, new file name.
UPDATE designs SET image_key = 'banners/tally-88.gif' WHERE image_key = 'banners/hit-counter.gif';
UPDATE designs SET image_key = 'banners/big-milestone.gif' WHERE image_key = 'banners/1-000-000th-visitor.gif';
UPDATE designs SET original_image_key = 'banners/tally-88.gif' WHERE original_image_key = 'banners/hit-counter.gif';
UPDATE designs SET original_image_key = 'banners/big-milestone.gif' WHERE original_image_key = 'banners/1-000-000th-visitor.gif';

-- ---------- v0.23: requests and open trades (also in migrations/017_requests_open_trades.sql) ----------

-- A request is a wish for a common or uncommon button (optionally a specific foil).
-- Whoever fills it gives a copy and gets a sealed pack from the cLuB (max 1 request-pack a day).
-- Posting is sealed into the ledger (kind 'request'); the filled copy's move is a normal transfer.
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  design_id    INTEGER NOT NULL REFERENCES designs(id),
  foil         TEXT,                          -- NULL = any copy
  status       TEXT NOT NULL DEFAULT 'open',  -- open | filled | cancelled | expired
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  filled_by    INTEGER REFERENCES users(id),
  instance_id  INTEGER REFERENCES instances(id),
  resolved_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id, status);

-- An open trade: "I'll give these for a copy of that", which anyone holding one can accept.
-- The offered copies are locked with the trade's token while it's open.
CREATE TABLE IF NOT EXISTS open_trades (
  id              INTEGER PRIMARY KEY,
  from_user       INTEGER NOT NULL REFERENCES users(id),
  want_design_id  INTEGER NOT NULL REFERENCES designs(id),
  want_foil       TEXT,                          -- NULL = any copy
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | accepted | cancelled | expired
  lock_token      INTEGER,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  accepted_by     INTEGER REFERENCES users(id),
  got_instance    INTEGER REFERENCES instances(id),
  resolved_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_open_trades_status ON open_trades(status, created_at);
CREATE INDEX IF NOT EXISTS idx_open_trades_token ON open_trades(lock_token);

CREATE TABLE IF NOT EXISTS open_trade_items (
  open_id      INTEGER NOT NULL REFERENCES open_trades(id),
  instance_id  INTEGER NOT NULL REFERENCES instances(id),
  PRIMARY KEY (open_id, instance_id)
);

-- ---------- v0.24: front-page free packs (also in migrations/018_free_packs.sql) ----------

-- A visitor's one-card free pack. The card is rolled by the server and remembered against an
-- anonymous browser cookie (only its hash is stored). Nothing is minted and nothing goes on the
-- ledger until they sign it, which creates their account and makes the copy theirs.
-- Unsigned cards are dropped after a day.
CREATE TABLE IF NOT EXISTS free_packs (
  token_hash   TEXT PRIMARY KEY,
  design_id    INTEGER NOT NULL REFERENCES designs(id),
  foil         TEXT NOT NULL,
  foil_seed    INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  claimed_by   INTEGER REFERENCES users(id),
  instance_id  INTEGER REFERENCES instances(id),
  claimed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_free_packs_created ON free_packs(created_at);

-- ---------- v0.25: special packs, Series Beta (also in migrations/019_series_beta_special_packs.sql) ----------

-- ---------- special packs ----------
-- Special sealed packs: better rarity and foil odds, one foil guaranteed, keep 2 of 3.
-- Their finishes are rolled when the pack is opened and shown on the cards before you choose.
ALTER TABLE packs ADD COLUMN special INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pack_openings ADD COLUMN finishes TEXT;   -- JSON: [{foil, seed, pattern, effect}] per card (special packs)

-- ---------- Series Beta ----------
-- 90s hacker / home-computer buttons: 2 ultras (inspired by a CC0 Wikimedia Commons GIF, redrawn from
-- scratch), 6 fractal rares (25 copies each), 6 uncommons, 12 commons. Released right away.
INSERT OR IGNORE INTO series (id, name, status, sort, released_at, created_at)
  VALUES (2, 'Beta', 'active', 2, strftime('%s','now'), strftime('%s','now'));
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('20 GOTO 20', 'banners/beta/ultra-20-goto-20.gif', 'c2d9d1c36344f10214b92966d836bd6b8ccbe91b1bcdba275cc9b5922be97364', 'construction', 'ultra', '{}', 1, 'active', strftime('%s','now'), 'Inspired by: Locomotive BASIC loading a picture from disk', 'Wikimedia Commons (CC0)', 'https://commons.wikimedia.org/wiki/File:Locomotive_BASIC_loading_a_picture_from_disk.gif', 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('FRAKTAL.PIC', 'banners/beta/ultra-fraktal-pic.gif', 'ee39ab1b028f9657bd462d38f0d6bd7ba11e007112e4882f3d10a20f5ecdfe35', 'neon', 'ultra', '{}', 1, 'active', strftime('%s','now'), 'Inspired by: Locomotive BASIC loading a picture from disk', 'Wikimedia Commons (CC0)', 'https://commons.wikimedia.org/wiki/File:Locomotive_BASIC_loading_a_picture_from_disk.gif', 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Fraktal', 'banners/beta/fraktal-classic.gif', '7c8a21e87423396f4a0f725dcc7c9b4cee81a939ef6b18901bd642a9cefd9059', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Fraktal', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Seahorse Valley', 'banners/beta/fraktal-seahorse.gif', '914ceef5b6fd1a5f80795cbd5dec5e2b559e890bb8aa5fd072b98880974503a9', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Seahorse Valley', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Elephant Valley', 'banners/beta/fraktal-elephant.gif', '179c7609c39b5f3966948324abc31112a334c2c71752d3e8d3dc5ca9a1721e9e', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Elephant Valley', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Tendrils', 'banners/beta/fraktal-tendrils.gif', '3d938809624aa0c1428a4b562e8b843acf598f5a90ce4de5e8c7efc543514aec', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Tendrils', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Spiral', 'banners/beta/fraktal-spiral.gif', '0343f10f207b6b29880c279f6e60223fa9149bbe4bcfb769d154c67b5fe4f4b4', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Spiral', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Mini-Fraktal', 'banners/beta/fraktal-minibrot.gif', 'e48e49839698f0f62e584c616c822562dda2b58dc2d7f023865278f9ec083d70', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Mini-Fraktal', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Access Granted', 'banners/beta/beta-access-granted.gif', 'd0a2439647dbad9a3dd64c851a4043ffbc0199bdc05878946610f9b0c0b104de', 'webring', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Access Granted', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Mainframe', 'banners/beta/beta-mainframe.gif', '88d17e53df262ade53776dc3d94ef026347946ada6926ccc160c4aa9e465524f', 'counter', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Mainframe', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Cyberspace', 'banners/beta/beta-cyberspace.gif', '84b0372e146a65d4e360067b62593f756710f052dbf23e570b4e9e1ed8218fd2', 'webring', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Cyberspace', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Firewall', 'banners/beta/beta-firewall.gif', '834258ae1de834bea14528c9861fa5ae416a58ed7fb72ea34a0913bb13a5fb1d', 'construction', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Firewall', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Virus Alert', 'banners/beta/beta-virus-alert.gif', '879df1060d46f228955c93b2e82cfe9399107bea6739e34971f35c09df2440ec', 'construction', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Virus Alert', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('2600 Hz', 'banners/beta/beta-2600-hz.gif', '7070a4d57d272c82cf7c8aaae7f9a0a37897bff2381ddb17d900a090a24b71e4', 'counter', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), '2600 Hz', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('DOS Prompt', 'banners/beta/beta-dos-prompt.gif', 'b58b086f9bb3c57de3ac81d26615ce0b2b173cb7d029820a8f62d1863f5806e0', 'construction', 'common', '{}', NULL, 'active', strftime('%s','now'), 'DOS Prompt', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Access Denied', 'banners/beta/beta-access-denied.gif', 'c6721cc0454f41da989385f0aadd6f876be3420087542121584ea0efbcf188dc', 'webring', 'common', '{}', NULL, 'active', strftime('%s','now'), 'Access Denied', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Blue Screen', 'banners/beta/beta-blue-screen.gif', '8dad9f1d1fe5d6cb9cd177c3c7b2b60cf36157cd0f319b2d6aedb4256e6a2b2d', 'construction', 'common', '{}', NULL, 'active', strftime('%s','now'), 'Blue Screen', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Hex Dump', 'banners/beta/beta-hex-dump.gif', 'beea609750162e8e262c259dd73cbdb5252ab039884f1ef07b6a0f1f5a485bd9', 'counter', 'common', '{}', NULL, 'active', strftime('%s','now'), 'Hex Dump', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Carrier Detect', 'banners/beta/beta-carrier-detect.gif', '86ea414e6ba3879bee8abd795a0c8398f577a5adb2a9e33ca0f708799c4fbed7', 'counter', 'common', '{}', NULL, 'active', strftime('%s','now'), 'Carrier Detect', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('BBS Online', 'banners/beta/beta-bbs-online.gif', 'eb1a2b8990efc4a4d7a9694dd194d3d6ab50f4e7ac9fa1b58df2d6fd898d1acb', 'guestbook', 'common', '{}', NULL, 'active', strftime('%s','now'), 'BBS Online', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('IRC', 'banners/beta/beta-irc.gif', 'd9e95377da5dd7dd740b4722f979bcd32e6442b71b9af7196636bda0bbf8a367', 'guestbook', 'common', '{}', NULL, 'active', strftime('%s','now'), 'IRC', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('127.0.0.1', 'banners/beta/beta-127-0-0-1.gif', '8faf4d04a067ffa645700c6d865d5134bb8d26d5baf3b20dd75d125ec0d42649', 'webring', 'common', '{}', NULL, 'active', strftime('%s','now'), '127.0.0.1', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('root', 'banners/beta/beta-root.gif', 'dfe040cb3199e2941b6797b9429f6c52ddc689eae60281ab1668f540c414b273', 'construction', 'common', '{}', NULL, 'active', strftime('%s','now'), 'root', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Password Cracker', 'banners/beta/beta-password-cracker.gif', '53e94aedc8b9822c537500d54cd1c7c11f8de5f6beca60940512412aa52ce58a', 'construction', 'common', '{}', NULL, 'active', strftime('%s','now'), 'Password Cracker', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('Defrag', 'banners/beta/beta-defrag.gif', '635ee09a74d78c8762f3e1df3563891145a2fa0a58fd9a8103fd75e25119894b', 'counter', 'common', '{}', NULL, 'active', strftime('%s','now'), 'Defrag', '88x31', NULL, 'Original', 'original', 2);
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) VALUES ('1337', 'banners/beta/beta-1337.gif', 'ddbc2567769d501608724e6bb4c1bb73b1357ce8b355b86567e3cb675b5f2f93', 'neon', 'common', '{}', NULL, 'active', strftime('%s','now'), '1337', '88x31', NULL, 'Original', 'original', 2);

-- Signature foils: each ultra's one copy comes in its own look (only that design can get it).
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, design_id, sort)
  SELECT 'phosphor', 'Phosphor Glow', 'phosphor', 'foil', 3, 1000000, id, 40 FROM designs WHERE name = 'FRAKTAL.PIC' AND series_id = 2;
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, design_id, sort)
  SELECT 'scanline', 'Scanline Shimmer', 'scanline', 'foil', 3, 1000000, id, 41 FROM designs WHERE name = '20 GOTO 20' AND series_id = 2;

-- ---------- v0.25.1: Series Beta tape-era rares (also in migrations/020_beta_tape_era.sql) ----------
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Blinking 12:00', 'banners/beta/beta-blinking-1200.gif', 'fc9e60840da0f4d2894e80bba6f5e091436f4dd1db58b84a59c37cd0cf8f723d', 'counter', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Blinking 12:00', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'REC', 'banners/beta/beta-rec.gif', '7ef127f0e51a33fcbcd6a6d87d2f20871a05a1f8021d395ab202e4cbe159e6b9', 'neon', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'REC', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Be Kind Rewind', 'banners/beta/beta-be-kind-rewind.gif', '36fda401c8677d55368aca60a2b8a9321f89504dee90c3c5f554e2edb61fd317', 'construction', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Be Kind Rewind', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Side A', 'banners/beta/beta-side-a.gif', 'f07ce80b8581dd08e135e5eb089334305e8f7bee92be77b5c9bf821bf017605e', 'neon', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Side A', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Fast Forward', 'banners/beta/beta-fast-forward.gif', 'c7d8f9b4707a2041f4ae1d4767e1040fd6e026698c1d0a2363186f3f28d31dea', 'counter', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Fast Forward', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Hi-Fi Stereo', 'banners/beta/beta-hi-fi-stereo.gif', 'f37c7340b39ba5c7122dfe2fea67d645f40815f57ec7a67756adf1e3fc59c6e1', 'neon', 'uncommon', '{}', NULL, 'active', strftime('%s','now'), 'Hi-Fi Stereo', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Tracking', 'banners/beta/beta-tracking.gif', '196fdec6444c9baef2aa190709315f1fc5407ab51b74f2f1295462796ee48786', 'construction', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Tracking', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Hi-Speed Dubbing', 'banners/beta/beta-hi-speed-dubbing.gif', '1296d6b1b1984bb04e6bf1566ed3ef02e4c959ec631bd99d523c44e4de78edfc', 'webring', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Hi-Speed Dubbing', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Boom Box', 'banners/beta/beta-boom-box.gif', 'fa039d1826c4a3efb66da4f2b2a7fbc3f8d9596bec235d3c348e730c0094d7d1', 'neon', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Boom Box', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Press Play on Tape', 'banners/beta/beta-press-play-on-tape.gif', 'fa375e1a46262dca92150e725d29468a6a27bdfa0332f89c9cb0e39918cab0fc', 'webring', 'rare', '{}', 25, 'active', strftime('%s','now'), 'Press Play on Tape', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';

-- ---------- v0.26: print runs, limited special packs, passkeys (also in migrations/021_print_runs_limited_passkeys.sql) ----------
-- ---------- print runs ----------
-- Each series prints a set number of copies, all its buttons together (NULL = no limit).
-- When it's used up the series is "out of print": packs stop making it (sealed packs already out
-- still open with it), and it stays active until the webmaster retires it.
-- Rares (25) and ultras (1) keep their own caps inside the run.
ALTER TABLE series ADD COLUMN print_run INTEGER;

-- ---------- limited special packs ----------
-- Every series has its own numbered special packs with their own name ("Beta Gold Master Pack #7 of 25").
ALTER TABLE series ADD COLUMN special_name TEXT;
ALTER TABLE series ADD COLUMN special_limit INTEGER NOT NULL DEFAULT 25;
ALTER TABLE packs ADD COLUMN special_no INTEGER;          -- this pack's number in its series' run
CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_special_no ON packs(series_id, special_no) WHERE special_no IS NOT NULL;

-- Beta prints 500. Alpha prints 150 more than it has right now.
UPDATE series SET print_run = 500, special_name = 'Gold Master' WHERE name = 'Beta';
UPDATE series SET print_run = (SELECT COUNT(*) FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.series_id = series.id) + 150,
                  special_name = 'Cool Site of the Day' WHERE name = 'Alpha';

-- ---------- passkeys ----------
-- Log in with your phone or computer's passkey (fingerprint, face, PIN). The save code stays as the backup.
CREATE TABLE IF NOT EXISTS passkeys (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cred_id       TEXT NOT NULL UNIQUE,      -- base64url credential id
  public_key    TEXT NOT NULL,             -- JWK (JSON)
  alg           INTEGER NOT NULL,          -- -7 ES256 or -257 RS256
  sign_count    INTEGER NOT NULL DEFAULT 0,
  label         TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

-- One-time challenges for adding a passkey or logging in with one (a few minutes each).
CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge    TEXT PRIMARY KEY,
  user_id      INTEGER,                    -- set when adding a passkey to an account
  kind         TEXT NOT NULL,              -- 'register' | 'login'
  expires_at   INTEGER NOT NULL
);

-- ---------- v0.30: hidden until seen, quests, streaks (also in migrations/023_quests_streaks_seen.sql) ----------
CREATE TABLE IF NOT EXISTS seen_designs (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  design_id  INTEGER NOT NULL REFERENCES designs(id),
  PRIMARY KEY (user_id, design_id)
);
CREATE TABLE IF NOT EXISTS rewards (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);
CREATE TABLE IF NOT EXISTS visits (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_day   TEXT NOT NULL,
  streak     INTEGER NOT NULL DEFAULT 1
);
-- v0.31: rarity 'prototype' = 4 copies (max_editions 4); rares made from now on have no cap. See migrations/024_prototypes.sql.

-- ---------- v0.34: packs in trades and guestbook gifts (also in migrations/025_pack_trades.sql) ----------
CREATE TABLE IF NOT EXISTS trade_packs (
  trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  pack_id    INTEGER NOT NULL REFERENCES packs(id),
  side       TEXT NOT NULL,
  PRIMARY KEY (trade_id, pack_id)
);
-- (guestbook_entries.pack_id INTEGER REFERENCES packs(id) is added by migration 025)

-- ---------- v0.35: mirror into the shared item registry (also in migrations/026_shared_registry.sql) ----------
-- This game's ledger stays the master; lib/registry.js mirrors original-tier buttons (not specials, not uploads) and
-- their copies, trades and fusions into the dungeon-items registry. These columns remember how far that has got.
ALTER TABLE designs ADD COLUMN registry_item INTEGER;
ALTER TABLE designs ADD COLUMN registry_retired INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instances ADD COLUMN registry_copy INTEGER;
ALTER TABLE instances ADD COLUMN registry_owner INTEGER;
ALTER TABLE instances ADD COLUMN registry_spent INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_instances_registry ON instances(registry_copy, registry_spent);
-- v0.46 (also in migrations/029_registry_marks.sql): what lib/registry.js has stamped as marks on each copy there
ALTER TABLE instances ADD COLUMN registry_marks TEXT;
