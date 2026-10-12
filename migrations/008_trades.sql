-- Trading: each open offer locks the offerer's buttons with its own token, and expires.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/008_trades.sql
ALTER TABLE trades ADD COLUMN lock_token INTEGER;
ALTER TABLE trades ADD COLUMN expires_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(lock_token);
