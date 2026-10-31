# 88x31: working notes

## This repo

The 88x31 cLuB: a daily-visit collecting game where the creatures are 88x31 web buttons (packs, foils, trades, fusion). Live at 88x31.app. Every copy is numbered, never reused, and written into a public hash-chained ledger.

**Layout** (the README has more)
- `public/` is the site. `functions/api/` is the API, one file per route (Cloudflare Pages Functions). `lib/` is the game: packs, pulls, trades, fusion, sets, rings and Theme Walls, bots, the ledger, the shared registry mirror and accounts.
- `migrations/` holds numbered database changes, `schema.sql` the tables, `seed_*.sql` the starter banners and sets.
- `sources/` holds the open-licensed art the remixed buttons came from, with credits. Keep the credits when you touch it.
- `tools/` holds the scripts that made the button art.

**Hosting.** Cloudflare Pages (`wrangler.toml`: output directory `public`, no build command). Every push to `main` updates the site, and the D1 database is `88x31-db`. The "Updating to vX" sections in the README are the history of one-off migrations, not setup steps to repeat. For the current state, read `migrations/` and `schema.sql`.

**Services.** Save codes and passkeys are the shared Accounts service in dungeon-items, called over HTTP (`lib/shared.js`). Both projects need the same `ACCOUNTS_KEY` secret. Deploy dungeon-items first.

**Used by other sites**
- okayline.dev reads `/api/collection?user=kura`. The addresses allowed to call it are `SHOW_ON` in `functions/api/collection.js` (okayline.dev, www.okayline.dev and a.88x31.app). A new site has to be added there.
- 88x31-anchors stamps the ledger head from `/api/ledger` every hour, and the registry head from `/api/registry/head`. Don't change what those return without checking `stamp.py` there.

**Testing.** There are no tests in this repo (no `package.json`, no test folder). "A quick check of whatever changed" means checking by hand, and your answer says what you ran and what you didn't.

**Versions.** The version is `data-version` on the footer script in `public/index.html`. Changelog entries go in `changelog-v0.35.md` here (v0.35 onward, newest first; older ones are in `changelog-v0.34.md`). Files with the same names, much longer, are in the private dungeon-notes repo under `88x31/`; add the detailed entry there.
