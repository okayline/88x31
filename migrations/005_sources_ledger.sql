-- Design sources/licenses, and one ledger chain for both design creations and ownership changes.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/005_sources_ledger.sql

-- Where each design's art came from.
ALTER TABLE designs ADD COLUMN source_title  TEXT;  -- e.g. "Blue Globe"
ALTER TABLE designs ADD COLUMN source_author TEXT;  -- e.g. "jsmith"
ALTER TABLE designs ADD COLUMN source_url    TEXT;  -- link to the original
ALTER TABLE designs ADD COLUMN license       TEXT;  -- e.g. "CC0 1.0", "CC BY 4.0", "Original"

-- The placeholders were drawn for this game.
UPDATE designs SET license = 'Original', source_author = '88x31'
WHERE license IS NULL AND stats LIKE '%"placeholder":true%';

-- The ledger: one hash chain over every event, in the order it was sealed.
--   kind = 'design'   -> ref_id is designs.id          (a new button design was added)
--   kind = 'transfer' -> ref_id is ownership_history.id (a copy was made or changed hands)
-- hash = SHA-256(prev_hash + "|" + record)
CREATE TABLE IF NOT EXISTS ledger (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  ref_id      INTEGER NOT NULL,
  record      TEXT NOT NULL,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  UNIQUE (kind, ref_id)
);
