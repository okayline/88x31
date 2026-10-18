# 88x31 cLuB Changelog — v0.35–v0.39

Newest first. Times are Hawaii time (HST). Older entries: `changelog-v0.34.md`.

---

## v0.39 — "Everybody Gets One"
**Sat Oct 17, 2026 · 10:40 PM HST**

- **Daily packs now send one on.** After you pick the button to keep, one of the other two goes to somebody: you choose who from a drop-down, or pick "Random person" (the default, so it's just one click). The "no thanks" choice is gone, so twice as many buttons come out of every daily pack. Ultras only go to real players.

## v0.38 — "Theme Wall"
**Sat Oct 17, 2026 · 9:30 PM HST** (migration `028_theme_walls.sql`)

- **Theme Wall.** Every week has a theme (a type of button, like neon). You're grouped into a small ring of players, and the ring builds one wall together: put up one of your buttons and drag it anywhere. Every button on the wall that fits the theme (and every found button) adds a ★ to a row above the wall. Putting a button up is only a display, so it never leaves your collection. Everyone in the ring sees every button on its wall, even ones they haven't met yet.
- If a button leaves your collection (trade, gift, fusion, going away to another game) your spot on the wall goes empty but stays yours, so you can put up another one in the same place.
- The wall locks at Monday 00:00 UTC (Sunday afternoon in Hawaii) and is sealed into the Ledger.
- Rings are made by the webmaster, who chooses who is in them (a new Rings page). Players who aren't in one are grouped into "~*~cLuB~*~ Ring #N" automatic "~*~cLuB~*~ Ring #N" rings of up to 8 the first time they open the wall. A new "Theme Wall" link is in the menu.
- Later the same evening: the Theme Wall page is now your ring's **Webring** page, with the ring's name in the title, the lock time and "earlier week" under the wall, and a funny rotating line under the theme. The footer webring shows your ring (with room for a 100x100 logo) and its Prev / Next / Random / List Rings links hop between rings. Any logged-in player can look at any ring's wall (only members can put buttons up). Two bot rings, "Bot Hangout" and "Bots Only", were added, and the bots put up buttons on their walls. The bots now spread their visits out instead of doing a pile of things in one minute.
- Trades page: a new **Start a Trade** panel with a player dropdown and a Trade! button. Rings can now be open to join, or ask-to-join (the webmaster chooses and approves). On the Wall, if you have lots of buttons still to find, you now see just a couple of rows of ? tiles and "...and more!". Filled requests show in Trade History, and the last gift you got and gave are bigger on your page.

## v0.37.2 — "A Few More Mysteries"
**Sat Oct 17, 2026 · 11:12 AM HST**

- **Logged out, the Wall** shows about 25 mystery buttons and a couple of found buttons along with ~*~ cLuB ~*~ commons.

## v0.37.1 — "Five Mysteries"
**Sat Oct 17, 2026 · 10:58 AM HST**

- **Logged out, the Wall** shows ~*~ cLuB ~*~ commons with about five mystery buttons mixed in, instead of a wall of hundreds of ?s.
- **Packs can't be selected** like text any more (and no long-press menu on phones).
- **Webmasters** pick who gets packs from a list.
- **Fixed:** on a phone, foiled buttons and buttons with an effect in your collection came out cropped or stretched. They're sized like the rest now.
- **The green scroll bar** has lots of new lines: a button spotted on the Wall, how many buttons there are, button facts, and more of the old web.
- **"You have found..."** above the title changes every visit: stumbled upon, discovered, surfed onto, dialed into...

## v0.37 — "Plain Windows"
**Sat Oct 17, 2026 · 10:25 AM HST**

- **Windows stay open.** The » headings no longer fold their windows away; every window is just a window again.
- **The Ledger leads with the button.** Every line now starts with the button or pack and says who after it: "LUNA.GIF #5 was pulled by kura", "Sealed pack #12 was opened by kura!"
- **~*~cLuB~*~ Singles on your visit streak.** Day 4 and day 6 of every streak week now bring a ~*~cLuB~*~ Single: a pack with one card in it.
- **Your collection is bigger.** Buttons on your page show at twice the size, still pixel-crisp (two to a row on a phone).
- **Singles have their own look:** a guestbook page with a 1 CARD stamp and a hit counter, a starry homepage with a rainbow SINGLE box and a NEW! sticker, or a plain white page with a rainbow rule and a webring. No shine.
- **The "Buttons you can collect" strip moves on phones too,** even with Reduce Motion on, and loops without a jump.
- **The bottom menu** is the same size as the top one, and the Trades link is gone from it.
- **Effects are the rarest thing now.** A new button rolls a screen effect (Dial-Up, Marquee, CRT, VHS) about 1 time in 2,000, rarer than any foil. Fusion can still give one.
- **Fair Play:** tier 2 foils read "Chrome, Gold, ???", and the line about patterns and effects is gone The Ledger now goes: The Ledger, Ledger Status, then Bitcoin Receipts.
- **Webmasters** can hand out ~*~cLuB~*~ Singles and Welcome packs.
- **Logged out, the Wall keeps more secrets.** Visitors who aren't logged in see only ~*~ cLuB ~*~ commons; everything else is a mystery until you join.

## v0.36 — "Visiting Hours"
**Sat Oct 17, 2026 · 4:55 AM HST**

- **Your buttons can visit 4Dungeon!** Open one of your original buttons and press **Send to my 4Dungeon**.
- **Away, not gone.** A visiting button stays yours: same edition, same foil, same travel log. It's greyed out with "away" in your collection, and it can't be traded, fused, given or put on your wall until it comes home.
- **Coming home:** send it back from 4Dungeon (Account → Inventory) and it unlocks here by itself.
- **Dungeon items can visit you too.** Things you find in 4Dungeon can be sent here, and show up under **Visiting from 4Dungeon** on your page. Just visiting for now: send them back any time.
- Both games need to know it's you: sign in to 4Dungeon with the same save code or passkey.

## v0.35 — "One Big List"
**Sat Oct 17, 2026 · 4:25 AM HST**

- **The cLuB's original buttons are on the shared item list** that all the 88x31 games use, and every copy you own is recorded there too, with trades and fusions as they happen.
- **The rarity ladder is shared now:** common, uncommon, rare, prototype, relic and ultra. Ultras are still 1-of-1, everywhere. Specials stay cLuB-only, and so do found and uploaded buttons for now.
- **Nothing changes in the cLuB.** Its own ledger is still the master record of every button.
