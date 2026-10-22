-- v0.46.15: the shared registry sync (lib/registry.js) reads only the rows that need work. Additive only (indexes).
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/034_registry_indexes.sql
-- Run before this game's push. Each is a partial index: it holds only the rows one sync step looks for, and that step's
-- query repeats this WHERE word for word (values written out, not bound), so SQLite reads the index, not the table.
CREATE INDEX IF NOT EXISTS idx_designs_to_add ON designs(id) WHERE registry_item IS NULL AND tier = 'original' AND rarity IN ('common', 'uncommon', 'rare', 'prototype', 'ultra') AND status IN ('active', 'frozen', 'removed');
CREATE INDEX IF NOT EXISTS idx_designs_on_registry ON designs(id) WHERE registry_item IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instances_unborn ON instances(design_id, edition) WHERE registry_copy IS NULL;
CREATE INDEX IF NOT EXISTS idx_instances_to_move ON instances(id) WHERE registry_copy > 0 AND registry_spent = 0 AND consumed = 0 AND owner_id != registry_owner;
CREATE INDEX IF NOT EXISTS idx_instances_to_spend ON instances(id) WHERE registry_copy > 0 AND registry_spent = 0 AND consumed = 1;
CREATE INDEX IF NOT EXISTS idx_designs_to_retire ON designs(id) WHERE registry_item IS NOT NULL AND registry_retired = 0 AND status IN ('frozen', 'removed');
CREATE INDEX IF NOT EXISTS idx_instances_away ON instances(id) WHERE locked = -1;
