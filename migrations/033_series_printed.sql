-- v0.46.12: a series' print run is stored on the series, not counted from every copy on every read. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/033_series_printed.sql
-- Run before this game's push. printed = every copy of the series' buttons (fusion makes no new copies);
-- first_copy = when its first copy was made. Kept up to date in the same batch that makes a copy
-- (lib/game.js mintStatements, lib/sets.js claimSet) and recounted when a button moves series (functions/api/series.js).
ALTER TABLE series ADD COLUMN printed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE series ADD COLUMN first_copy INTEGER;
UPDATE series SET
  printed = (SELECT COUNT(*) FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.series_id = series.id),
  first_copy = (SELECT MIN(i.created_at) FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.series_id = series.id);
