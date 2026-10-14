-- v0.30: hidden until seen, starter quests, visit streaks, trade-ins. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/023_quests_streaks_seen.sql

-- Buttons a player has come across on someone's page (owning one, or seeing it in a pull or pack,
-- is worked out from the history tables, so it isn't stored here).
CREATE TABLE IF NOT EXISTS seen_designs (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  design_id  INTEGER NOT NULL REFERENCES designs(id),
  PRIMARY KEY (user_id, design_id)
);

-- One row per reward handed out, so the same reward can never be given twice:
--   kind 'quest'     key 'starter'      finishing the starter quests
--   kind 'streak'    key YYYY-MM-DD     that day's streak reward
--   kind 'rare_fill' key YYYY-MM-DD     the one series pack a day for filling a rare request
CREATE TABLE IF NOT EXISTS rewards (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);

-- Visit streaks: the last day (UTC, like daily packs) a player came by, and how many days in a row.
CREATE TABLE IF NOT EXISTS visits (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_day   TEXT NOT NULL,
  streak     INTEGER NOT NULL DEFAULT 1
);
