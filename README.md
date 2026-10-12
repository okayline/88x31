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

Ledger columns:

```
curl.exe -O https://raw.githubusercontent.com/okayline/88x31/main/migrations/004_ledger.sql
npx wrangler d1 execute 88x31-db --remote --file=004_ledger.sql
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
