-- v0.29: where new players came from. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/022_came_from.sql
-- came_from: the site a new player first arrived from (just the site name, e.g. "itch.io"),
--   "direct" if none, or "ref:<word>" from a ?ref= link. Never a full address.
-- joined_via: how the account was made ("free pack" or "sign-up form").
ALTER TABLE users ADD COLUMN came_from TEXT;
ALTER TABLE users ADD COLUMN joined_via TEXT;
