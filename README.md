# 88x31
new game yo

A collecting game where the creatures are 88x31 web buttons: collect, trade, and show them off.

## What's here

```
public/            the site (index.html, style.css, app.js)
functions/api/     the API (Cloudflare Pages Functions)
  signup.js        POST  make an account, get a save code
  login.js         POST  log in with a save code
  logout.js        POST  log out
  me.js            GET   who am I
  codes.js         GET/POST/DELETE  list, add, remove save codes
lib/auth.js        save codes, hashing, sessions, rate limits
schema.sql         database tables
wrangler.toml      Cloudflare config
```

Login uses **save codes**: a random 20-character code (like `K7QM-2XPA-9RTD-HV4C-8NBE`) given at signup. The server stores only a SHA-256 hash of each code, never the code itself. Players can hold up to 5 codes. No email, no outside services.

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
  Gold, Oil Slick. Tier 3: Prismatic, Double Rainbow, Liquid Metal. Pack odds: base 91%, tier 1 8%,
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
