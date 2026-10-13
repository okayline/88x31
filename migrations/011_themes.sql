-- Guestbook color themes.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/011_themes.sql
ALTER TABLE users ADD COLUMN theme TEXT;  -- one of the preset theme names (lib/themes list in app.js)
