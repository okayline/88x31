-- v0.18: foils, the archive tier, player uploads, and the webmaster kill switch.
-- Only adds things: no existing button, copy or ledger entry is changed (except freezing
-- the old baked-in holo designs so no NEW copies of them are made).
--   npx wrangler d1 execute 88x31-db --remote --file=013_foils_uploads.sql

-- ---------- foils ----------
-- The foil is the owned layer around a copy. The art is shared; each copy's foil is its own.
-- effect = which overlay the site draws (unknown or unfinished effects show as clear).
-- weight = chance out of 1000 when a new copy is made. max_per_design = cap per design (NULL = no cap).
-- design_id = a signature foil that only that design can get. rarities = JSON list it can land on (NULL = any).
CREATE TABLE IF NOT EXISTS foils (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  effect          TEXT NOT NULL DEFAULT 'clear',
  params          TEXT NOT NULL DEFAULT '{}',
  weight          INTEGER NOT NULL DEFAULT 0,
  max_per_design  INTEGER,
  design_id       INTEGER REFERENCES designs(id),
  rarities        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',   -- active | draft
  sort            INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO foils (id, name, effect, weight, max_per_design, sort) VALUES ('clear', 'Clear', 'clear', 920, NULL, 0);
INSERT OR IGNORE INTO foils (id, name, effect, weight, max_per_design, sort) VALUES ('holo', 'Holo', 'holo', 80, 25, 10);

-- NULL foil = a First Print copy, made before foils existed.
ALTER TABLE instances ADD COLUMN foil TEXT;
ALTER TABLE instances ADD COLUMN foil_seed INTEGER;

-- ---------- tiers & uploads ----------
-- tier: original (the cLuB's own art) | permissioned | archive (found in the wild, not relicensed)
ALTER TABLE designs ADD COLUMN tier TEXT NOT NULL DEFAULT 'original';
ALTER TABLE designs ADD COLUMN found_by INTEGER REFERENCES users(id);
ALTER TABLE designs ADD COLUMN original_image_key TEXT;   -- kept while a design is removed

-- Uploaded GIFs live in the database (88x31 GIFs are tiny).
CREATE TABLE IF NOT EXISTS design_images (
  design_id  INTEGER PRIMARY KEY REFERENCES designs(id),
  data       BLOB NOT NULL
);

ALTER TABLE users ADD COLUMN upload_blocked INTEGER NOT NULL DEFAULT 0;

-- ---------- webmaster actions (sealed into the ledger as kind 'admin') ----------
CREATE TABLE IF NOT EXISTS admin_actions (
  id          INTEGER PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,    -- remove_design | restore_design | block_uploader | unblock_uploader
  design_id   INTEGER REFERENCES designs(id),
  user_id     INTEGER REFERENCES users(id),
  note        TEXT,
  created_at  INTEGER NOT NULL
);

-- ---------- freeze the old baked-in holo designs ----------
-- Existing copies stay exactly as they are; no new copies get made.
UPDATE designs SET status = 'frozen' WHERE status = 'active' AND stats LIKE '%"variant": "Holo"%';
