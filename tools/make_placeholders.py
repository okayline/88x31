"""Make placeholder 88x31 banners (some animated) and page decorations.

Temporary art, to be replaced by real banners later.
Run:  python3 tools/make_placeholders.py
Writes gifs to public/banners/ and public/deco/, and seed SQL to seed_banners.sql.
"""
import json, os, hashlib
from PIL import Image, ImageDraw, ImageFont

W, H = 88, 31
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAN = os.path.join(ROOT, "public", "banners")
DECO = os.path.join(ROOT, "public", "deco")
os.makedirs(BAN, exist_ok=True)
os.makedirs(DECO, exist_ok=True)

FD = "/usr/share/fonts/truetype/dejavu/"
def font(name, size):
    return ImageFont.truetype(FD + name, size)

BOLD8 = font("DejaVuSans-Bold.ttf", 8)
BOLD9 = font("DejaVuSans-Bold.ttf", 9)
BOLD11 = font("DejaVuSans-Bold.ttf", 11)
MONO10 = font("DejaVuSansMono-Bold.ttf", 10)
SERIF10 = font("DejaVuSerif-Bold.ttf", 10)

RAINBOW = [(255,0,0),(255,153,0),(255,255,0),(0,255,0),(0,255,255),(0,0,255),(255,0,255)]

def canvas(bg):
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    d.fontmode = "1"  # crisp pixel text, no smoothing
    return im, d

def bevel(d, light=(255,255,255), dark=(64,64,64)):
    d.line([(0,0),(W-1,0)], fill=light); d.line([(0,0),(0,H-1)], fill=light)
    d.line([(0,H-1),(W-1,H-1)], fill=dark); d.line([(W-1,0),(W-1,H-1)], fill=dark)

def border(d, color):
    d.rectangle([0,0,W-1,H-1], outline=color)

def center(d, y, text, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)

def save(path, frames, ms=200):
    if len(frames) == 1:
        frames[0].save(path)
    else:
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=ms, loop=0, disposal=1)

# ---------- banners ----------

def neon_nite():
    frames = []
    for on in [1, 1, 1, 0, 1, 0, 1, 1]:
        im, d = canvas((10, 0, 20))
        border(d, (255, 0, 255) if on else (90, 0, 90))
        c = (255, 80, 255) if on else (80, 20, 80)
        center(d, 3, "NEON", BOLD11, c)
        center(d, 17, "* NITE *", BOLD8, (0, 255, 255) if on else (0, 80, 80))
        frames.append(im)
    return frames, 150

def surf_the_web():
    frames = []
    for i in range(7):
        im, d = canvas((0, 0, 0))
        for x in range(W):
            d.line([(x, 0), (x, 2)], fill=RAINBOW[(x // 6 + i) % 7])
            d.line([(x, H-3), (x, H-1)], fill=RAINBOW[(x // 6 + i) % 7])
        center(d, 6, "SURF THE", BOLD9, (255, 255, 255))
        center(d, 16, "WEB!", BOLD9, (255, 255, 0))
        frames.append(im)
    return frames, 120

def under_construction():
    frames = []
    for shift in range(0, 8, 2):
        im, d = canvas((255, 204, 0))
        for x in range(-H, W + H, 8):
            d.polygon([(x+shift, 0), (x+shift+4, 0), (x+shift+4-6, 6), (x+shift-6, 6)], fill=(0, 0, 0))
            d.polygon([(x+shift, H-6), (x+shift+4, H-6), (x+shift+4-6, H), (x+shift-6, H)], fill=(0, 0, 0))
        center(d, 7, "UNDER", BOLD8, (0, 0, 0))
        center(d, 15, "CONSTRUCTION", BOLD8, (0, 0, 0))
        frames.append(im)
    return frames, 120

def guestbook():
    im, d = canvas((255, 255, 204))
    border(d, (128, 64, 0))
    d.rectangle([4, 6, 20, 24], fill=(153, 51, 0)); d.line([(12, 6), (12, 24)], fill=(255, 255, 204))
    d.text((25, 5), "SIGN MY", font=BOLD9, fill=(128, 0, 0))
    d.text((25, 16), "GUESTBOOK", font=BOLD8, fill=(128, 0, 0))
    return [im], 0

def webring_member():
    im, d = canvas((0, 0, 128))
    bevel(d, (128, 128, 255), (0, 0, 40))
    d.ellipse([4, 6, 22, 24], outline=(255, 255, 0)); d.ellipse([8, 10, 18, 20], outline=(255, 255, 0))
    d.text((27, 5), "WEBRING", font=BOLD9, fill=(255, 255, 255))
    d.text((27, 16), "MEMBER", font=BOLD9, fill=(0, 255, 255))
    return [im], 0

def hit_counter():
    frames = []
    for n in range(36, 44):
        im, d = canvas((0, 0, 0))
        border(d, (128, 128, 128))
        center(d, 2, "HITS", BOLD8, (192, 192, 192))
        digits = f"{n:06d}"
        x0 = (W - 6 * 12) // 2
        for i, ch in enumerate(digits):
            d.rectangle([x0 + i*12, 13, x0 + i*12 + 10, 27], fill=(20, 20, 20), outline=(60, 60, 60))
            d.text((x0 + i*12 + 2, 14), ch, font=MONO10, fill=(0, 255, 0))
        frames.append(im)
    return frames, 400

def rainbow_divider():
    frames = []
    for i in range(7):
        im, d = canvas((255, 255, 255))
        for y in range(H):
            pass
        for x in range(W):
            d.line([(x, 0), (x, H-1)], fill=RAINBOW[((x // 4) + i) % 7])
        d.rectangle([14, 9, W-15, 21], fill=(255, 255, 255))
        center(d, 10, "RAINBOW", BOLD9, (0, 0, 0))
        frames.append(im)
    return frames, 100

def best_viewed():
    im, d = canvas((192, 192, 192))
    bevel(d)
    center(d, 4, "best viewed", BOLD8, (0, 0, 0))
    center(d, 15, "800 x 600", SERIF10, (0, 0, 128))
    return [im], 0

def made_with_notepad():
    im, d = canvas((255, 255, 255))
    border(d, (0, 0, 0))
    d.rectangle([4, 5, 19, 25], fill=(255, 255, 255), outline=(0, 0, 128))
    d.rectangle([4, 5, 19, 8], fill=(0, 0, 128))
    for y in (12, 16, 20):
        d.line([(7, y), (16, y)], fill=(128, 128, 128))
    d.text((24, 5), "MADE WITH", font=BOLD8, fill=(0, 0, 0))
    d.text((24, 15), "NOTEPAD", font=BOLD9, fill=(0, 0, 128))
    return [im], 0

def email_me():
    frames = []
    for open_ in [0, 0, 1, 1]:
        im, d = canvas((0, 128, 128))
        bevel(d, (128, 255, 255), (0, 40, 40))
        d.rectangle([5, 9, 25, 23], fill=(255, 255, 255), outline=(0, 0, 0))
        if open_:
            d.polygon([(5, 9), (15, 2), (25, 9)], fill=(255, 255, 255), outline=(0, 0, 0))
        else:
            d.line([(5, 9), (15, 16), (25, 9)], fill=(0, 0, 0))
        d.text((30, 5), "EMAIL", font=BOLD9, fill=(255, 255, 0))
        d.text((30, 16), "ME!!", font=BOLD9, fill=(255, 255, 255))
        frames.append(im)
    return frames, 300

BANNERS = [
    ("neon-nite",          "Neon Nite",          "neon",         "rare",     neon_nite),
    ("surf-the-web",       "Surf the Web",       "neon",         "uncommon", surf_the_web),
    ("under-construction", "Under Construction", "construction", "common",   under_construction),
    ("made-with-notepad",  "Made with Notepad",  "construction", "common",   made_with_notepad),
    ("sign-my-guestbook",  "Sign My Guestbook",  "guestbook",    "common",   guestbook),
    ("email-me",           "Email Me!!",         "guestbook",    "uncommon", email_me),
    ("webring-member",     "Webring Member",     "webring",      "common",   webring_member),
    ("hit-counter",        "Hit Counter",        "counter",      "uncommon", hit_counter),
    ("rainbow-divider",    "Rainbow",            "divider",      "rare",     rainbow_divider),
    ("best-viewed",        "Best Viewed 800x600","divider",      "common",   best_viewed),
]

sql = ["-- Placeholder starter banners. Safe to re-run (skips existing).",
       "-- npx wrangler d1 execute 88x31-db --remote --file=seed_banners.sql"]
for slug, name, typ, rarity, fn in BANNERS:
    frames, ms = fn()
    path = os.path.join(BAN, slug + ".gif")
    save(path, frames, ms)
    h = hashlib.sha256(open(path, "rb").read()).hexdigest()
    esc = name.replace("'", "''")
    cap = "50" if rarity == "rare" else "NULL"   # rares are limited editions
    sql.append(
        f"INSERT OR IGNORE INTO designs (name, image_key, image_hash, type, rarity, stats, max_editions, status, created_at) "
        f"VALUES ('{esc}', 'banners/{slug}.gif', '{h}', '{typ}', '{rarity}', '{{\"placeholder\":true}}', {cap}, 'active', strftime('%s','now'));"
    )
open(os.path.join(ROOT, "seed_banners.sql"), "w").write("\n".join(sql) + "\n")

# ---------- page decorations ----------

def deco_construction_worker():
    # small digger sign, 40x40, bobbing
    frames = []
    for dy in [0, 1, 2, 1]:
        im = Image.new("RGB", (40, 40), (0, 0, 51))
        d = ImageDraw.Draw(im)
        d.polygon([(20, 3 + dy), (37, 34 + dy), (3, 34 + dy)], fill=(255, 204, 0), outline=(0, 0, 0))
        d.rectangle([18, 13 + dy, 22, 25 + dy], fill=(0, 0, 0))
        d.rectangle([18, 28 + dy, 22, 31 + dy], fill=(0, 0, 0))
        frames.append(im)
    frames[0].save(os.path.join(DECO, "warning.gif"), save_all=True, append_images=frames[1:],
                   duration=200, loop=0, disposal=2)

def deco_new():
    frames = []
    for on in [1, 0]:
        im = Image.new("RGB", (32, 14), (0, 0, 51))
        d = ImageDraw.Draw(im); d.fontmode = "1"
        if on:
            d.rectangle([0, 0, 31, 13], fill=(255, 0, 0))
            d.text((3, 1), "NEW!", font=BOLD9, fill=(255, 255, 0))
        frames.append(im)
    frames[0].save(os.path.join(DECO, "new.gif"), save_all=True, append_images=frames[1:],
                   duration=500, loop=0, disposal=2)

def deco_star():
    frames = []
    for s in [1, 2, 3, 2]:
        im = Image.new("RGB", (15, 15), (0, 0, 51))
        d = ImageDraw.Draw(im)
        c = 7
        d.line([(c - s*2, c), (c + s*2, c)], fill=(255, 255, 200))
        d.line([(c, c - s*2), (c, c + s*2)], fill=(255, 255, 200))
        if s > 1:
            d.point([(c-1, c-1), (c+1, c+1), (c-1, c+1), (c+1, c-1)], fill=(255, 255, 255))
        frames.append(im)
    frames[0].save(os.path.join(DECO, "sparkle.gif"), save_all=True, append_images=frames[1:],
                   duration=180, loop=0, disposal=2)

deco_new()
print("banners:", len(BANNERS))

# ---------- looping starfield background tile ----------
def deco_starfield():
    import random
    rnd = random.Random(88)
    size, n = 128, 8
    stars = [(rnd.randrange(size), rnd.randrange(size), rnd.choice([1, 1, 1, 2]), rnd.randrange(n)) for _ in range(26)]
    frames = []
    for f in range(n):
        im = Image.new("RGB", (size, size), (0, 0, 51))
        d = ImageDraw.Draw(im)
        for x, y, s, phase in stars:
            t = (f - phase) % n
            b = [255, 200, 140, 90, 60, 90, 140, 200][t]
            c = (b, b, min(255, b + 30))
            d.point((x, y), fill=c)
            if s == 2 and t < 2:
                d.point([(x-1, y), (x+1, y), (x, y-1), (x, y+1)], fill=(b // 2, b // 2, b // 2 + 20))
        frames.append(im)
    frames[0].save(os.path.join(DECO, "stars.gif"), save_all=True, append_images=frames[1:], duration=160, loop=0)

deco_starfield()
