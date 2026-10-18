-- v0.38: the Theme Wall. Each ring builds one wall a week; every member pins one button on it.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/028_theme_walls.sql
--
-- rings / ring_members already exist (schema.sql, unused until now). A default ring ("cLuB Ring #N") is a ring with
-- is_default = 1, owned by the webmaster so deleting a player never deletes it. ring_members.position is the seat number.

ALTER TABLE rings ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ring_members_user ON ring_members(ring_id, user_id) WHERE user_id IS NOT NULL;

-- One wall per ring per week. week = whole weeks since Mon Jan 5 1970 00:00 UTC (lib/themewall.js weekOf).
-- size is the square canvas side in pixels, fixed when the wall is made. locked_at is the Monday 00:00 UTC the week ended;
-- snapshot is the frozen pins [[user_id, copy_id, design_id, x, y], ...] (copy and design are null for an empty spot),
-- NULL when nobody had a button up (those walls are not sealed into the ledger).
CREATE TABLE IF NOT EXISTS ring_walls (
  id          INTEGER PRIMARY KEY,
  ring_id     INTEGER NOT NULL REFERENCES rings(id) ON DELETE CASCADE,
  week        INTEGER NOT NULL,
  theme       TEXT NOT NULL,
  size        INTEGER NOT NULL,
  slots       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  locked_at   INTEGER,
  snapshot    TEXT,
  UNIQUE (ring_id, week)
);

-- A pin is a pointer: it never moves a button. instance_id is the copy shown; when that copy changes owner, is used
-- up or goes away, the wall draws the spot empty (checked when drawn) and the x/y stay reserved for the member.
CREATE TABLE IF NOT EXISTS wall_pins (
  wall_id     INTEGER NOT NULL REFERENCES ring_walls(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  instance_id INTEGER REFERENCES instances(id),
  x           INTEGER NOT NULL,
  y           INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (wall_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wall_pins_instance ON wall_pins(instance_id);
