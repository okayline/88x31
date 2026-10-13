-- v0.23: the request board and open trades. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=017_requests_open_trades.sql

-- A request is a wish for a common or uncommon button (optionally a specific foil).
-- Whoever fills it gives a copy and gets a sealed pack from the cLuB (max 1 request-pack a day).
-- Posting is sealed into the ledger (kind 'request'); the filled copy's move is a normal transfer.
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  design_id    INTEGER NOT NULL REFERENCES designs(id),
  foil         TEXT,                          -- NULL = any copy
  status       TEXT NOT NULL DEFAULT 'open',  -- open | filled | cancelled | expired
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  filled_by    INTEGER REFERENCES users(id),
  instance_id  INTEGER REFERENCES instances(id),
  resolved_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id, status);

-- An open trade: "I'll give these for a copy of that", which anyone holding one can accept.
-- The offered copies are locked with the trade's token while it's open.
CREATE TABLE IF NOT EXISTS open_trades (
  id              INTEGER PRIMARY KEY,
  from_user       INTEGER NOT NULL REFERENCES users(id),
  want_design_id  INTEGER NOT NULL REFERENCES designs(id),
  want_foil       TEXT,                          -- NULL = any copy
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | accepted | cancelled | expired
  lock_token      INTEGER,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  accepted_by     INTEGER REFERENCES users(id),
  got_instance    INTEGER REFERENCES instances(id),
  resolved_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_open_trades_status ON open_trades(status, created_at);
CREATE INDEX IF NOT EXISTS idx_open_trades_token ON open_trades(lock_token);

CREATE TABLE IF NOT EXISTS open_trade_items (
  open_id      INTEGER NOT NULL REFERENCES open_trades(id),
  instance_id  INTEGER NOT NULL REFERENCES instances(id),
  PRIMARY KEY (open_id, instance_id)
);
