-- v0.26: print runs, limited (numbered) special packs per series, passkeys. Additive only.
--   npx wrangler d1 execute 88x31-db --remote --file=021_print_runs_limited_passkeys.sql

-- ---------- print runs ----------
-- Each series prints a set number of copies, all its buttons together (NULL = no limit).
-- When it's used up the series is "out of print": packs stop making it (sealed packs already out
-- still open with it), and it stays active until the webmaster retires it.
-- Rares (25) and ultras (1) keep their own caps inside the run.
ALTER TABLE series ADD COLUMN print_run INTEGER;

-- ---------- limited special packs ----------
-- Every series has its own numbered special packs with their own name ("Beta Gold Master Pack #7 of 25").
ALTER TABLE series ADD COLUMN special_name TEXT;
ALTER TABLE series ADD COLUMN special_limit INTEGER NOT NULL DEFAULT 25;
ALTER TABLE packs ADD COLUMN special_no INTEGER;          -- this pack's number in its series' run
CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_special_no ON packs(series_id, special_no) WHERE special_no IS NOT NULL;

-- Beta prints 500. Alpha prints 150 more than it has right now.
UPDATE series SET print_run = 500, special_name = 'Gold Master' WHERE name = 'Beta';
UPDATE series SET print_run = (SELECT COUNT(*) FROM instances i JOIN designs d ON d.id = i.design_id WHERE d.series_id = series.id) + 150,
                  special_name = 'Cool Site of the Day' WHERE name = 'Alpha';

-- ---------- passkeys ----------
-- Log in with your phone or computer's passkey (fingerprint, face, PIN). The save code stays as the backup.
CREATE TABLE IF NOT EXISTS passkeys (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cred_id       TEXT NOT NULL UNIQUE,      -- base64url credential id
  public_key    TEXT NOT NULL,             -- JWK (JSON)
  alg           INTEGER NOT NULL,          -- -7 ES256 or -257 RS256
  sign_count    INTEGER NOT NULL DEFAULT 0,
  label         TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

-- One-time challenges for adding a passkey or logging in with one (a few minutes each).
CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge    TEXT PRIMARY KEY,
  user_id      INTEGER,                    -- set when adding a passkey to an account
  kind         TEXT NOT NULL,              -- 'register' | 'login'
  expires_at   INTEGER NOT NULL
);
