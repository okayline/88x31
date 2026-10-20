-- v0.46.9: a daily pull's three buttons are sealed on the ledger as soon as they're rolled (kind 'pull_roll'). Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/032_pull_rolls.sql
-- Run before this game's push. Pulls rolled before it keep roll_id NULL and aren't sealed as rolls
-- (the copies kept and passed from them are on the ledger already, as transfers).
ALTER TABLE daily_pulls ADD COLUMN roll_id INTEGER;   -- the pull's number on the ledger (kind 'pull_roll', ref_id)
CREATE UNIQUE INDEX IF NOT EXISTS daily_pulls_roll ON daily_pulls (roll_id);
