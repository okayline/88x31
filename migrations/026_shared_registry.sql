-- v0.35: mirror buttons into the shared item registry (the dungeon-items Worker). Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/026_shared_registry.sql
-- This game's own ledger stays the master. lib/registry.js copies what happens here into the shared one: original-tier
-- buttons become shared items (not specials, not archive/found uploads), every copy of them is registered, and trades
-- and fusions are mirrored as moves and spends. These columns only remember how far that mirror has got.
ALTER TABLE designs ADD COLUMN registry_item INTEGER;                       -- the shared item id, once added
ALTER TABLE designs ADD COLUMN registry_retired INTEGER NOT NULL DEFAULT 0; -- 1 once retired there (frozen or removed here)
ALTER TABLE instances ADD COLUMN registry_copy INTEGER;                     -- the shared copy number (0 = refused there, see the log)
ALTER TABLE instances ADD COLUMN registry_owner INTEGER;                    -- who the shared registry thinks holds it
ALTER TABLE instances ADD COLUMN registry_spent INTEGER NOT NULL DEFAULT 0; -- 1 once a used-up copy is spent there too
CREATE INDEX IF NOT EXISTS idx_instances_registry ON instances(registry_copy, registry_spent);
