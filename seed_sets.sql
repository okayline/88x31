-- Set rewards. Run after seed_new_banners.sql. Safe to re-run.
--   npx wrangler d1 execute 88x31-db --remote --file=seed_sets.sql
INSERT OR IGNORE INTO sets (slug, name, description, secret, sort, reward_design_id) VALUES
  ('island-time',  'Island Time',          'Catch the sunset and the moonlight.',        0, 5, (SELECT id FROM designs WHERE name = 'Island Time Complete')),
  ('construction', 'Under Construction',   'Every good homepage starts somewhere.',      0, 4, (SELECT id FROM designs WHERE name = 'We Built It!')),
  ('neon',         'Neon Lights',          'Light up the night with all six neons.',     0, 2, (SELECT id FROM designs WHERE name = 'Neon Master')),
  ('webmaster',    'Webmaster Starter Kit','Everything a 1999 homepage needs.',          0, 1, (SELECT id FROM designs WHERE name = 'Certified Webmaster')),
  ('holo-hunter',  'Holo Hunter',          'A secret set for true holo hunters.',        1, 9, (SELECT id FROM designs WHERE name = 'Holo Hunter'));

INSERT OR IGNORE INTO set_designs (set_id, design_id)
SELECT s.id, d.id FROM sets s JOIN designs d ON
  (s.slug = 'island-time'  AND d.name IN ('Island Life', 'Island Life Moonlight')) OR
  (s.slug = 'construction' AND d.name IN ('Under Construction', 'Made with Notepad', 'Save Often')) OR
  (s.slug = 'neon'         AND d.name IN ('Neon Nite', 'Surf the Web', 'Bodacious', 'Radical!', 'Synthwave', 'Mix Tape')) OR
  (s.slug = 'webmaster'    AND d.name IN ('Sign My Guestbook', 'Webring Member', 'Hit Counter', 'Email Me!!', 'Best Viewed 800x600')) OR
  (s.slug = 'holo-hunter'  AND d.name IN ('Bodacious Holo', 'Radical! Holo', 'Synthwave Holo'));
