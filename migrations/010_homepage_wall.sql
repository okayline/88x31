-- Homepage links on guestbooks, and arranging your wall.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/010_homepage_wall.sql
ALTER TABLE users ADD COLUMN homepage TEXT;  -- player's own website (http/https only)
-- wall_slots (already in the schema) stores the order a player arranged their buttons in.
CREATE INDEX IF NOT EXISTS idx_wall_instance ON wall_slots(instance_id);
