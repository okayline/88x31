-- Set rewards, "My Button", and link exchange.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/012_sets_links.sql
-- (then add the sets themselves with seed_sets.sql, after seed_new_banners.sql)

-- sets: a unique key, secret sets stay hidden until you finish them, and each has a reward design
ALTER TABLE sets ADD COLUMN slug TEXT;
ALTER TABLE sets ADD COLUMN secret INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sets ADD COLUMN reward_design_id INTEGER REFERENCES designs(id);
ALTER TABLE sets ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_slug ON sets(slug);

-- one reward per set per player
CREATE TABLE IF NOT EXISTS set_claims (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id      INTEGER NOT NULL REFERENCES sets(id),
  instance_id INTEGER REFERENCES instances(id),
  claimed_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, set_id)
);

-- the button a player shows as their calling card (in Cool Links)
ALTER TABLE users ADD COLUMN my_button INTEGER REFERENCES instances(id);

-- link exchange: a request from one player to another; 'accepted' shows in both Cool Links
CREATE TABLE IF NOT EXISTS link_exchanges (
  from_user   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (from_user, to_user)
);
CREATE INDEX IF NOT EXISTS idx_links_to ON link_exchanges(to_user, status);
