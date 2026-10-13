"""Add a finished 88x31 banner to the game, with its credits baked into the GIF.

Usage:
  python3 tools/add_banner.py made/globe.gif --name "Spinning Globe" --type webring --rarity uncommon \
      --source-title "Blue Globe" --author "jsmith" --url "https://openclipart.org/detail/12345" \
      --license "CC0 1.0" [--cap 50]

It:
  1. checks the GIF is exactly 88x31
  2. writes public/banners/<slug>.gif with a GIF comment holding the credit line
  3. appends an INSERT to seed_new_banners.sql (run that on the database to add it)
"""
import argparse, hashlib, json, os, re, sys, time
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "banners")
SEED = os.path.join(ROOT, "seed_new_banners.sql")
TYPES = {"neon", "construction", "guestbook", "webring", "counter", "divider"}
RARITIES = {"common", "uncommon", "rare", "ultra", "special"}

def sq(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("gif")
    p.add_argument("--name", required=True)
    p.add_argument("--type", required=True, choices=sorted(TYPES))
    p.add_argument("--rarity", default="common", choices=sorted(RARITIES))
    p.add_argument("--cap", type=int, default=None, help="max copies (default: 50 rare, 1 ultra, unlimited otherwise)")
    p.add_argument("--variant-of", help="name of the regular design this is a special version of")
    p.add_argument("--variant", help='variant label, e.g. "Holo", "Gold Leaf"')
    p.add_argument("--status", default="active", choices=["active", "reward"], help="reward = only given by set rewards, never in packs")
    p.add_argument("--source-title")
    p.add_argument("--author", required=True)
    p.add_argument("--url")
    p.add_argument("--license", required=True, help='e.g. "CC0 1.0", "CC BY 4.0", "Public domain (NASA)", "Original"')
    a = p.parse_args()

    if re.search(r"\b(NC|ND)\b", a.license, re.I):
        sys.exit("Refusing: NC/ND licenses don't allow this kind of use.")

    im = Image.open(a.gif)
    if im.size != (88, 31):
        sys.exit(f"Not 88x31 (got {im.size[0]}x{im.size[1]}).")

    slug = re.sub(r"[^a-z0-9]+", "-", a.name.lower()).strip("-")
    out = os.path.join(OUT_DIR, slug + ".gif")
    if os.path.exists(out):
        sys.exit(f"{out} already exists. Pick another name.")

    made = time.strftime("%Y-%m-%d")
    credit = f"88x31 game | {a.name} | art: {a.source_title or 'untitled'} by {a.author}"
    if a.url: credit += f" ({a.url})"
    credit += f" | license: {a.license} | made {made}"

    frames, durations = [], []
    for f in ImageSequence.Iterator(im):
        frames.append(f.convert("RGBA").convert("P", palette=Image.ADAPTIVE) if f.mode not in ("P", "L") else f.copy())
        durations.append(f.info.get("duration", 100))
    kw = dict(comment=credit.encode("utf-8"))
    if len(frames) > 1:
        kw.update(save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=1)
    frames[0].save(out, **kw)

    h = hashlib.sha256(open(out, "rb").read()).hexdigest()
    cap = a.cap if a.cap is not None else {"rare": 50, "ultra": 1}.get(a.rarity)
    stats = {}
    if a.variant_of: stats["variant_of"] = a.variant_of
    if a.variant: stats["variant"] = a.variant
    sql = (
        "INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at, "
        "source_title, source_author, source_url, license) VALUES ("
        f"{sq(a.name)}, {sq('banners/' + slug + '.gif')}, {sq(h)}, {sq(a.type)}, {sq(a.rarity)}, {sq(json.dumps(stats))}, "
        f"{cap if cap else 'NULL'}, {sq(a.status)}, strftime('%s','now'), "
        f"{sq(a.source_title)}, {sq(a.author)}, {sq(a.url)}, {sq(a.license)});\n"
    )
    new_file = not os.path.exists(SEED)
    with open(SEED, "a") as fh:
        if new_file:
            fh.write("-- New banners made from open-licensed sources.\n"
                     "-- npx wrangler d1 execute 88x31-db --remote --file=seed_new_banners.sql\n")
        fh.write(sql)
    print("wrote", out)
    print("credit:", credit)

if __name__ == "__main__":
    main()
