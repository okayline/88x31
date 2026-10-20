# 88x31


88x31 is a daily-visit button collecting game for the old web. Open packs, find foils and hidden rares, trade and gift with friends, and fuse duplicates into something new. Every copy is numbered, never reused, and written into a public ledger with its full history. Free in your browser at 88x31.app
A collecting game where the creatures are 88x31 web buttons: collect, trade, and show them off.


A daily-visit, asynchronous, Gacha-style pack-opening, persistent, scarcity-driven, collectible web-button trading game with numbered, never-reused copies, rarity tiers, foils, fusions, hidden items, p2p trading and gifting using a public hash-chained ownership ledger tracking items with provenance.


## What's here

```
public/            the site (index.html, style.css, app.js, banners/)
functions/api/     the API (Cloudflare Pages Functions), one file per route
lib/               the game: packs, pulls, trades, fusion, sets, rings and Theme Walls, bots, the ledger,
                   the shared registry mirror (registry.js) and its public ledger passed through at /registry (registry-view.js), travel to 4Dungeon, accounts (shared.js, auth.js)
migrations/        database changes, in order (002 to 028)
schema.sql         database tables
seed_*.sql         starter banners and sets
sources/           open-licensed art the remixed buttons came from, with credits
tools/             scripts that made the button art, add_banner.py and make_key.mjs
wrangler.toml      Cloudflare config
```

Login uses **save codes** (a random 20-character code like `K7QM-2XPA-9RTD-HV4C-8NBE`) and **passkeys**. Both are kept by the
shared Accounts service in dungeon-items (see its `ACCOUNTS.md`), so one account works across the 88x31.app games. Only
hashes of codes are stored. Players can hold up to 5 codes. No email, no outside services.

## Setup (once)

From a terminal in this folder, with Node.js installed (on Windows PowerShell, these work as-is):

```
npx wrangler login
npx wrangler d1 create 88x31-db
```

Copy the `database_id` it prints into `wrangler.toml`, then:

```
npx wrangler d1 execute 88x31-db --remote --file=schema.sql
```

### Updating an existing database

If the database was set up before daily pulls and guestbooks, add the new tables once:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/002_pulls_guestbook.sql
npx wrangler d1 execute 88x31-db --remote --file=002_pulls_guestbook.sql
```

Visitor counter table:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/003_counter.sql
npx wrangler d1 execute 88x31-db --remote --file=003_counter.sql
```

Ledger columns (004, now superseded by 005 but already run on the live database):

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/004_ledger.sql
npx wrangler d1 execute 88x31-db --remote --file=004_ledger.sql
```

Design sources/licenses and the unified ledger:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/005_sources_ledger.sql
npx wrangler d1 execute 88x31-db --remote --file=005_sources_ledger.sql
```

### Placeholder banners

10 temporary banners live in `public/banners/` (made by `tools/make_placeholders.py`). Add them to the database with:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/seed_banners.sql
npx wrangler d1 execute 88x31-db --remote --file=seed_banners.sql
```

## Deploy

In the Cloudflare dashboard: Workers & Pages → Create → Pages → connect this GitHub repo.
Build command: none. Output directory: `public`. After that, every push to `main` updates the site.

The D1 binding is read from `wrangler.toml` (`DB` → `88x31-db`).

## Updating to v0.18 (foils, the archive, Found a Button, webmaster tools)

Run once, **before** (or right after) the v0.18 push goes live. It only adds things; no existing
copy or ledger entry changes. It freezes the four old baked-in holo designs (no new copies).

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/013_foils_uploads.sql
npx wrangler d1 execute 88x31-db --remote --file=013_foils_uploads.sql
```

How it fits together:

- **Designs vs. copies.** The art is a shared design nobody owns. Players own numbered copies.
- **Foils.** Every new copy gets a foil, rolled from the `foils` table (weight out of 1000, optional
  cap per design, optional signature foil locked to one design, optional rarity list). The site
  draws each foil's `effect` as an overlay; effects it doesn't know yet show as clear. Copies made
  before v0.18 have no foil and show as **First Print**. Each copy's foil is sealed into the ledger.
- **Tiers.** `original` (the cLuB's own art), `permissioned`, `archive` (found in the wild, shown
  as found, credited where known, not relicensed). Only originals can be downloaded.
- **Found a Button.** Members add real 88x31 GIFs (100 KB max, 10 a day, no duplicates) from the
  Wall of Buttons. They land as archive commons, never ultras; the finder gets copy #1 and a
  "found by" credit on the ledger. Images are stored in D1 (`design_images`).
- **Webmaster tools.** Admin accounts get a box on button pages: remove a design (it leaves packs
  at once; every copy turns into "removed by request" but stays with its owner), restore it,
  block or unblock whoever found it (optionally removing everything they added). Every action is
  sealed into the ledger.

Adding a foil kind (it shows as clear until the site knows its effect):

```
npx wrangler d1 execute 88x31-db --remote --command "INSERT INTO foils (id, name, effect, weight) VALUES ('gold', 'Gold', 'gold', 10)"
```

Weights are out of 1000 across all active foils; lower `clear` to make room.

## Updating to v0.19 (foil tiers, patterns, effects, fusion)

Run once, **before** pushing the v0.19 code. Additive only; existing copies keep their foil.

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/014_foil_tiers_fusion.sql
npx wrangler d1 execute 88x31-db --remote --file=014_foil_tiers_fusion.sql
```

Each copy has three layers, rolled when it's made and sealed into the ledger:

- **Foil** (the material). Base: Clear, Glitter, Sheen. Tier 1: Holo, Galaxy, Ripple. Tier 2: Chrome,
  Gold, Oil Slick. Tier 3: Prismatic, ???, ???. Pack odds: base 91%, tier 1 8%,
  tier 2 0.9%, tier 3 0.1% (weights in the `foils` table, kind `foil`).
- **Pattern** (cuts a real foil's shine): Fracture, Etched, Surge. 5% of tier 1+ copies.
- **Effect** (how the button plays): Dial-Up, Marquee, CRT, VHS; CRT+VHS only from fusion. 10% of copies.

**Fusion** (`/api/fuse`, `lib/fusion.js`): 3 copies of the same button → the lowest-numbered one
survives, the other two are used up and leave play for good (caps count every copy ever made, so
capped buttons get scarcer). The survivor gets the best foil going in plus one tier; at tier 3 it
gains a pattern, then an effect, then CRT+VHS. Patterns and effects carry over (random if they
differ); with no effect going in there's a 10% surprise one. Ultras can't be fused.

## Updating to v0.20 (set showcase)

Run once, before pushing the v0.20 code:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/015_set_showcase.sql
npx wrangler d1 execute 88x31-db --remote --file=015_set_showcase.sql
```

Sets are private now: players see only sets they've started (missing buttons and the reward stay
"?"), and visitors only see finished sets the owner chose to show off (secret ones as "a secret set").
Player homepages were removed (the `users.homepage` column stays, unused).

## v0.21 notes (no migration)

- **Packs** are 1 found (archive-tier) button + 2 originals (`FOUND_PER_PACK` in lib/game.js);
  all originals while nothing has been found. Bots' packs work the same way.
- **Batch uploads**: webmasters can drop many GIFs or a whole folder on Found a Button. With
  "Batch mode" on they're credited "Found on the internets", have no finder and no copy #1,
  and go straight into packs. Webmasters have no upload limits.
- **Bots fuse** at most once a day, only buttons with no copy limit (commons/uncommons):
  hoarders often, givers rarely.

## Updating to v0.22 (series, sealed packs)

Run once, **before** pushing the v0.22 code:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/016_series_packs.sql
npx wrangler d1 execute 88x31-db --remote --file=016_series_packs.sql
```

- **Series**: the cLuB's originals belong to a series (`series` table: upcoming / active / retired).
  Everything made before v0.22 is Series Alpha. Up to 3 active; each original card in a pack picks a
  series by `SERIES_WEIGHTS` (60/25/15, newest first). Found buttons are outside series.
- **Sealed packs** (lib/packs.js): items made when earned (webmaster gift, visitor milestone, finishing
  a set). Contents roll when opened; earned packs keep 2 of 3. Made/given/opened are sealed into the
  ledger (kinds `pack`, `pack_open`); copies from a pack carry reason `pack` + the pack id.
- **Webmasters** give packs to a player or everyone (bots too) from the Hi! box.
- **Milestones**: `MILESTONES` in functions/api/hit.js; each one gives everyone a pack, once.

## Updating to v0.23 (request board, open trades)

Run once, **before** pushing the v0.23 code:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/017_requests_open_trades.sql
npx wrangler d1 execute 88x31-db --remote --file=017_requests_open_trades.sql
```

- **Requests** (lib/board.js): wishes for commons/uncommons (optionally a foil); filling one gives your
  copy to the requester and earns you a sealed pack (1 a day). Max 3 open, 7 days. Posting is sealed
  into the ledger (kind `request`); the copy's move is a transfer with reason `request`.
- **Open trades**: 1-3 of your copies (locked while open) for a copy of a button (optionally a foil);
  anyone with a match can accept. Max 3 open, 7 days, no ultras. Transfers use reason `open_trade`.
- Bots fill requests (givers more often), accept open trades they like, and post their own.
- Webmasters type "everyone" in the give-packs name box. "everyone", "nobody" and "webmaster" can't be signed up.

## Updating to v0.24 (front-page free pack)

Run once, **before** pushing the v0.24 code:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/018_free_packs.sql
npx wrangler d1 execute 88x31-db --remote --file=018_free_packs.sql
```

Visitors open a one-card free pack on the front page (lib/freepack.js): a common or uncommon,
finish up to tier 1, rolled by the server and held against an anonymous cookie for a day.
Signing it with a name creates the account and mints the card (reason `free_pack`).

**Turnstile** (Cloudflare's "are you human" check on the sign step) switches on once both are set.
In the Cloudflare dashboard: Turnstile → Add widget → hostname 88x31.app. Then:

```
npx wrangler pages secret put TURNSTILE_SECRET --project-name 88x31
npx wrangler pages secret put TURNSTILE_SITEKEY --project-name 88x31
```

## Updating to v0.25 (Series Beta, special packs, webmaster series panel)

Run once, **before** pushing the v0.25 code:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/019_series_beta_special_packs.sql
npx wrangler d1 execute 88x31-db --remote --file=019_series_beta_special_packs.sql
```

- Adds `packs.special` and `pack_openings.finishes`, and **Series Beta** (active right away):
  26 originals in `public/banners/beta/` (12 common, 6 uncommon, 6 fractal rares capped at 25
  copies, 2 ultras capped at 1). The ultras credit Wikimedia Commons (CC0) as inspiration.
- Two **signature foils**, `phosphor` (FRAKTAL.PIC) and `scanline` (20 GOTO 20): tier 3, locked to
  their design with a huge weight, so the one copy of each ultra comes out in its own foil.
- **Special packs** (Give packs → tick "special"): one card is at least uncommon, rares and ultras
  twice as likely, real foils ~2.5x (tier 2–3 ×3) and at least one per pack. Finishes are rolled
  when the pack opens and shown before you pick; keep 2.
- **Series panel** on the Buttons page (webmasters): release / retire / hide a series, make a new
  one (starts upcoming), look inside, and put loose originals into a series. The upload box can
  add GIFs as cLuB originals straight into a series, with a rarity and kind (rare = 25 copies,
  ultra = 1; no copy #1).
- `/api/ledger` takes `limit` and `before` and hides spoilers on the server: rares, ultras and
  set rewards the viewer has never owned, and anything in an upcoming series, show as "a mystery
  button" with no name or link.

## Updating to v0.25.1 (10 tape-era Beta buttons)

Push the code first this time (it carries the art), **then** run once:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/020_beta_tape_era.sql
npx wrangler d1 execute 88x31-db --remote --file=020_beta_tape_era.sql
```

Adds 10 buttons to Series Beta (6 rares at 25 copies each, 4 uncommons), art in `public/banners/beta/`. Safe to run twice.

## Updating to v0.26 (print runs, limited packs, passkeys)

Run once, **before** pushing the v0.26 code:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/021_print_runs_limited_passkeys.sql
npx wrangler d1 execute 88x31-db --remote --file=021_print_runs_limited_passkeys.sql
```

- **Print runs** (`series.print_run`): a series prints that many copies in total (every copy of its
  buttons counts; fusion doesn't make copies). Beta 500; Alpha = its copies at migration time + 150.
  When it's used up, packs skip the series (sealed packs of it still open with it), Give packs
  refuses it, and it stays active until the webmaster retires it. Rares (25) and ultras (1) keep
  their own caps. The Series panel shows the bars and can set or raise a run (never below printed).
- **Limited packs**: special packs are numbered per series (`packs.special_no`, unique per series),
  `series.special_limit` (25) of them, named by `series.special_name` ("Beta Gold Master Pack #7 of 25").
  They need a series and never go to bots.
- **Found buttons** turn up in `FOUND_CHANCE` (1 in 5) of daily and mixed packs; never in series or
  special packs. **Bots** are web crawlers: their pulls (and the sealed packs they open) are found
  buttons, with `CRAWLER_SERIES_CHANCE` (10%) of one series card, never ultras.
- **Free pack**: normal odds without ultras (rares possible), held 2 days; a held card counts
  against its button's cap.
- **Passkeys** (`passkeys`, `passkey_challenges`; lib/passkeys.js, /api/passkey): WebAuthn with no
  libraries, ES256 and RS256, discoverable credentials, checked against the request's own origin and
  hostname. Save codes stay as the backup.

## v0.36 (travel)

No migration. `lib/travel.js` and `/api/travel`: send your button to your 4Dungeon (same shared account): it's locked with
`AWAY` (-1) in `instances.locked`, so every trade/fusion/give/wall check that wants `locked = 0` refuses it; the registry
holds it for your 4Dungeon player. It unlocks when the registry holds it in 88x31 again (your collection, or the background
registry pass). Dungeon items held by you in 88x31 show as text cards and can be sent back. Ownership history reasons `away` / `home`.

## Updating to v0.35 (shared item registry)

Already run on the live database on 2026-10-17 (additive columns only):
```
npx wrangler d1 execute 88x31-db --remote --file=migrations/026_shared_registry.sql
```
- `lib/registry.js` mirrors this game into the shared item registry (the dungeon-items Worker, through the same
  `ACCOUNTS` binding and `ACCOUNTS_KEY` as accounts, route `/rpc/registry/*`). **This game's own ledger stays the master.**
- What goes there: **original-tier** buttons on the shared ladder: common, uncommon, rare, prototype, ultra (1-of-1).
  **Specials** (quest rewards) and **archive/found uploads** stay here only.
- Every copy of those buttons is registered (the old ones backfilled, born to their first owner), trades become moves,
  fused or used-up copies are spent, and frozen or removed designs are retired there once all their copies are in.
- It runs in the background after page loads (at most once a minute, 30 calls a pass) and from the webmaster API:
  `POST /api/admin { "action": "registry_sync" }` (120 calls). A refusal is logged and that copy marked `registry_copy = 0`.

## Run locally (optional)

```
npx wrangler d1 execute 88x31-db --local --file=schema.sql
npx wrangler pages dev
```

## Adding banners made from open-licensed art

Only use sources that are public domain, CC0, or CC BY (with credit). Skip anything NC or ND.
Make the 88x31 GIF first, then:

```
python3 tools/add_banner.py made/globe.gif --name "Spinning Globe" --type webring --rarity uncommon --source-title "Blue Globe" --author "jsmith" --url "https://openclipart.org/detail/12345" --license "CC0 1.0"
```

This bakes the credit into the GIF file, saves it to `public/banners/`, and adds a line to
`seed_new_banners.sql`. Run that file on the database to add the new designs; each one is
sealed into the ledger with its art fingerprint and credits.

## Signed button certificates (one-time setup)

Owners can download their copy of a button with a signed certificate inside the GIF.
The cLuB signs with a secret Ed25519 key kept in Cloudflare (never in this repo). Make it once
and pipe it straight into Cloudflare, from the folder where you run wrangler:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/tools/make_key.mjs
node make_key.mjs | npx wrangler pages secret put SIGNING_KEY --project-name 88x31
```

Making a new key later would make every older certificate stop checking out, so keep this one.
The public half is shown on the About page and at `/api/pubkey`.

Only the cLuB's own art (the "original" tier) can be downloaded. Archive buttons can't.
