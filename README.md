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

The art itself is CC0 (public domain): anyone can use it anywhere.
