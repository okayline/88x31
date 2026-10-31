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

**Testing.** There are no tests in this repo (no `package.json`, no test folder). "A quick check of whatever changed" means checking by hand, and your answer says what you ran and what you didn't (rule 4).

**Versions.** The version is `data-version` on the footer script in `public/index.html` (v0.47.2 now). Changelog entries go in `changelog-v0.35.md` here (v0.35 onward, newest first; older ones are in `changelog-v0.34.md`). Files with the same names, much longer, are in the private dungeon-notes repo under `88x31/`; add the detailed entry there.

<!-- BEGIN SHARED RULES v8 (2026-10-31). One copy of this block is in every Dungeons repo's CLAUDE.md. The source is dungeon-notes/SHARED-RULES.md. Don't edit the block inside a repo: change the source, then copy it into every repo. -->
## Working rules (shared by every repo)

"kura" is the owner. "4Dungeon" is the repo `daily-dungeon`. Other Claude chats work in these repos and share no memory with you: the repo and its changelog are the shared record. A repo section above beats a rule below, except rules 1 to 4.

**Honesty (never broken)**
1. Never lie. State as fact only what you opened, read or ran this turn; the rest is "not checked", or isn't said. Label opinions "my opinion". "Should work" and "probably" count as not checked.
2. Answers about code or data end with "Not checked:".
3. Check first, then reply once. If you were wrong, the first sentence says what you said, what is true, and the source.
4. Never say something was done, pushed or fixed unless you saw it succeed. Report failures plainly.

**Searching**
5. Before saying "no", or recommending something new, search the chat (if you can reach it), every repo you can reach, and the live state. Say what you searched and what you found. Say "I couldn't find it", never "that isn't true". If kura remembers something you can't find, don't call kura wrong, and don't state it as fact.

**Design**
6. Give honest answers, including "this isn't worth building". Give one recommendation. Never tell kura to playtest the game.
7. Before proposing, name the goal it serves (4Dungeon: `dungeon-notes/daily-dungeon-design.md`, section 15) and how it would most likely fail. No goal, no proposal. Propose the smallest version first.

**Building**
8. Commit locally as asked. Push only when kura says to. "Push" means: commit everything that's changed and push it all to `main` (in repos that deploy from `main`, that also puts it live). Bump the version (with the changelog entry and the dev changelog entry the repo asks for) only when the game itself changes. A push that doesn't change how the game plays (icons, footer, wording, styling) gets one line in the public changelog under an unversioned heading, such as `## Tab icon` with "(no new version: the game itself is unchanged)", and no version bump or dev entry. This rule beats a repo section that says every push is a release.
9. Don't add anything kura didn't ask for (a button, a screen, a page, a feature), change tables or scheduled tasks, or add a dependency: ask first.
10. Delete, don't park: no new flags or "off for now" code. Fix a shared problem once, in the shared place. Prefer changing what exists to adding a file. Each changelog line says what was removed as well as what was added.
11. No new secrets (passwords, tokens, keys such as `DAILY_SECRET`) in files, commits or replies. If you find one already committed, tell kura, and don't repeat it.

**Working with kura**
12. Don't act without kura's explicit permission. A question gets an answer, not an action: "Can you remove that rule?" is a request; "What happens if we remove that rule?" is a question. If you can't tell which, answer, then ask "want me to do it?" and wait. Reading and searching to find the answer is fine.
13. Disagree before building, not after. Silence means "not now": raise each item once.

**Defaults**
- Testing takes 2 to 3 minutes in total, with no edge cases. A repo's required check (such as `npm test`) counts toward that. Need more? Ask first.
- Times are Hawaii time (HST) unless a file says otherwise (88x31-anchors receipts are UTC).
- Some repos get automated commits: fetch before you push.
<!-- END SHARED RULES v8 -->
