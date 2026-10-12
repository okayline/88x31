-- Hash-chained ownership ledger.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/004_ledger.sql
-- Each ownership_history row gets sealed in order: `record` is a frozen copy of the
-- entry, and `hash` = SHA-256(prev_hash + record). Changing any old entry breaks
-- every hash after it.
ALTER TABLE ownership_history ADD COLUMN record TEXT;
ALTER TABLE ownership_history ADD COLUMN prev_hash TEXT;
ALTER TABLE ownership_history ADD COLUMN hash TEXT;
CREATE INDEX IF NOT EXISTS idx_history_unsealed ON ownership_history(hash, id);
