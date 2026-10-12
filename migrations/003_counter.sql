-- Visitor counter.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/003_counter.sql
CREATE TABLE IF NOT EXISTS counters (
  name   TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('visits', 0);
