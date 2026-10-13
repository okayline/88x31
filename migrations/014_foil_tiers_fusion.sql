-- v0.19: foil tiers, patterns, effects, and fusion.
-- Only adds things. Existing copies keep exactly the foil they have (Clear, Holo, or none = First Print).
--   npx wrangler d1 execute 88x31-db --remote --file=014_foil_tiers_fusion.sql

-- The foils table now holds three kinds of thing:
--   kind 'foil'    - the material. tier 0 = base (Clear, Glitter, Sheen), 1-3 = real foils.
--   kind 'pattern' - how a real foil's shine is cut (Fracture, Etched, Surge). Only on tier 1+ foils.
--   kind 'effect'  - how the whole button plays on screen (Dial-Up, Marquee, CRT, VHS, CRT+VHS).
-- Weights are relative within each kind. Pattern and effect chances live in lib/game.js.
ALTER TABLE foils ADD COLUMN kind TEXT NOT NULL DEFAULT 'foil';
ALTER TABLE foils ADD COLUMN tier INTEGER NOT NULL DEFAULT 0;

-- foils (weights out of 10000): base 91%, tier 1 8%, tier 2 0.9%, tier 3 0.1%
-- 'clear' is shown to players as "None" (the id stays 'clear')
UPDATE foils SET weight = 7600, tier = 0, sort = 0, name = 'None' WHERE id = 'clear';
UPDATE foils SET weight = 267, tier = 1, max_per_design = NULL, sort = 10 WHERE id = 'holo';
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, sort) VALUES
  ('glitter',        'Glitter',        'glitter',        'foil', 0, 750, 1),
  ('sheen',          'Sheen',          'sheen',          'foil', 0, 750, 2),
  ('galaxy',         'Galaxy',         'galaxy',         'foil', 1, 267, 11),
  ('ripple',         'Ripple',         'ripple',         'foil', 1, 266, 12),
  ('chrome',         'Chrome',         'chrome',         'foil', 2, 30, 20),
  ('gold',           'Gold',           'gold',           'foil', 2, 30, 21),
  ('oil_slick',      'Oil Slick',      'oil-slick',      'foil', 2, 30, 22),
  ('prismatic',      'Prismatic',      'prismatic',      'foil', 3, 4, 30),
  ('double_rainbow', 'Double Rainbow', 'double-rainbow', 'foil', 3, 3, 31),
  ('liquid_metal',   'Liquid Metal',   'liquid-metal',   'foil', 3, 3, 32);

-- patterns (relative weights)
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, sort) VALUES
  ('fracture', 'Fracture', 'fracture', 'pattern', 0, 34, 50),
  ('etched',   'Etched',   'etched',   'pattern', 0, 33, 51),
  ('surge',    'Surge',    'surge',    'pattern', 0, 33, 52);

-- effects (relative weights; CRT+VHS only comes from fusion)
INSERT OR IGNORE INTO foils (id, name, effect, kind, tier, weight, sort) VALUES
  ('dialup',  'Dial-Up', 'dialup',  'effect', 0, 400, 70),
  ('marquee', 'Marquee', 'marquee', 'effect', 0, 400, 71),
  ('crt',     'CRT',     'crt',     'effect', 0, 150, 72),
  ('vhs',     'VHS',     'vhs',     'effect', 0, 50, 73),
  ('crt_vhs', 'CRT+VHS', 'crt-vhs', 'effect', 0, 0, 74);

ALTER TABLE instances ADD COLUMN pattern TEXT;
ALTER TABLE instances ADD COLUMN effect TEXT;

-- Fusion: 3 copies of one button in, the lowest-numbered one survives upgraded (output_id),
-- the other two (input_a, input_b) are used up. The result is recorded here and sealed into the ledger.
ALTER TABLE fusions ADD COLUMN foil TEXT;
ALTER TABLE fusions ADD COLUMN pattern TEXT;
ALTER TABLE fusions ADD COLUMN effect TEXT;
ALTER TABLE fusions ADD COLUMN prev_foil TEXT;
CREATE INDEX IF NOT EXISTS idx_instances_design ON instances(design_id, consumed);
