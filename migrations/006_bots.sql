-- Bots: marked accounts that play once a day.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/006_bots.sql
ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
-- which day (UTC, as YYYYMMDD) the bots last played
INSERT OR IGNORE INTO counters (name, value) VALUES ('bots_day', 0);
