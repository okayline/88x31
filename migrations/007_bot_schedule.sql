-- Staggered bots: each bot action for a day is claimed once, when its scheduled time has passed.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/007_bot_schedule.sql
CREATE TABLE IF NOT EXISTS bot_runs (
  bot_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,      -- YYYY-MM-DD in Hawaii time (the bots' day)
  action      TEXT NOT NULL,      -- 'pull' or 'sign1', 'sign2', ...
  done_at     INTEGER NOT NULL,
  PRIMARY KEY (bot_id, day, action)
);
-- when a bot was last online (shown on its guestbook)
ALTER TABLE users ADD COLUMN last_seen INTEGER;
