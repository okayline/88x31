-- v0.20: players choose which finished sets to show off on their page.
--   npx wrangler d1 execute 88x31-db --remote --file=015_set_showcase.sql
ALTER TABLE set_claims ADD COLUMN showcase INTEGER NOT NULL DEFAULT 0;
