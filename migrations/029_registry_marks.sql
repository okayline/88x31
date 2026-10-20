-- v0.46: each copy's history as marks in the shared item registry (lib/registry.js, step 7). Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/029_registry_marks.sql
-- Run after dungeon-items has the HTTP door's addMark (its branch with "HTTP door gains addMark"), before this game's push.
ALTER TABLE instances ADD COLUMN registry_marks TEXT;   -- JSON { h: last ownership_history id read, v: mark values stamped }; NULL = none yet
