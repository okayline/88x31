-- v0.24: the front-page free pack. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=018_free_packs.sql

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
