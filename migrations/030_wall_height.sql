-- v0.46.5: Theme Walls can be shorter than they are wide. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/030_wall_height.sql
-- Run before this game's push. NULL (every wall made so far) means a square: the height is the same as `size`.
ALTER TABLE ring_walls ADD COLUMN height INTEGER;   -- canvas height in px; NULL = square (size x size)
