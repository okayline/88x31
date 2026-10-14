-- v0.34: sealed packs can be traded and stamped as guestbook gifts. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=migrations/025_pack_trades.sql
-- Packs in a trade offer. The offerer's packs are locked with the trade's token (packs.locked),
-- like buttons; the other side's are checked when it's accepted.
CREATE TABLE IF NOT EXISTS trade_packs (
  trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  pack_id    INTEGER NOT NULL REFERENCES packs(id),
  side       TEXT NOT NULL,   -- give (from sender) | want (from recipient)
  PRIMARY KEY (trade_id, pack_id)
);
-- A guestbook entry can stamp a sealed pack as its gift (instead of a button).
ALTER TABLE guestbook_entries ADD COLUMN pack_id INTEGER REFERENCES packs(id);
