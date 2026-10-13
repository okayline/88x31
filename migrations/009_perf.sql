-- Keeping reads small as the game grows.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/009_perf.sql
-- Small key/value store: remembers how far the ledger has been checked, and caches the ticker.
CREATE TABLE IF NOT EXISTS meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- lets the ticker jump straight to the latest gifts instead of scanning all history
CREATE INDEX IF NOT EXISTS idx_history_reason ON ownership_history(reason, id);
