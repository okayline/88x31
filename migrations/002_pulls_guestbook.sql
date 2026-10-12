-- Daily pulls and guestbooks.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/002_pulls_guestbook.sql

-- One pull per player per day (UTC). Three design ids are rolled once and stored,
-- so refreshing the page never re-rolls. Copies are only made when you keep or pass one.
CREATE TABLE IF NOT EXISTS daily_pulls (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  options      TEXT NOT NULL,              -- JSON array of 3 design ids
  status       TEXT NOT NULL DEFAULT 'open', -- open | done
  kept_index   INTEGER,
  passed_index INTEGER,
  passed_to    INTEGER REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Guestbook messages. A signer can attach one of their banners as a gift (the "stamp");
-- it moves to the page owner and stays shown next to the message.
CREATE TABLE IF NOT EXISTS guestbook_entries (
  id           INTEGER PRIMARY KEY,
  page_user    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id),
  message      TEXT NOT NULL,
  instance_id  INTEGER REFERENCES instances(id),
  day          TEXT NOT NULL,               -- YYYY-MM-DD (UTC), for one-per-day
  created_at   INTEGER NOT NULL,
  UNIQUE (page_user, author_id, day)
);
CREATE INDEX IF NOT EXISTS idx_guestbook_page ON guestbook_entries(page_user, created_at);
