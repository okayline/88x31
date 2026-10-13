-- v0.22: Series and sealed packs. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=016_series_packs.sql

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
