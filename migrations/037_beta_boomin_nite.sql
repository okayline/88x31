-- v0.51.22: a new Series Beta rare, Boomin' Nite, the second design of the redrawn Boom Box (kura, Nov 7). Rares have no copy cap
-- of their own (v0.31). Additive only, re-runnable (INSERT OR IGNORE). Push first (so the GIF is live), then:
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/037_beta_boomin_nite.sql
INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, source_title, source_author, source_url, license, tier, series_id) SELECT 'Boomin'' Nite', 'banners/beta/beta-boomin-nite.gif', '9726f6e65a19b253a6237fccaa6962ad488ecfdb26617bf31377b12ee76e0623', 'neon', 'rare', '{"variant_of": "Boom Box", "variant": "Nite"}', NULL, 'active', strftime('%s','now'), 'Boomin'' Nite', '88x31', NULL, 'Original', 'original', id FROM series WHERE name = 'Beta';
-- Fair Play's odds are cached: let them refresh with the new button counts right away.
DELETE FROM meta WHERE key = 'odds';
