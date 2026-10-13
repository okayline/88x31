"""Set reward buttons (original art). Simple for small sets, fancier for big ones,
and the Webmaster Starter Kit gets the works. Writes GIFs to made/ plus made/preview-rewards.png."""
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "made") + "/"
os.makedirs(OUT, exist_ok=True)
W, H = 88, 31
FD = "/usr/share/fonts/truetype/dejavu/"
B7 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 7)
B8 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 8)
B9 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 9)
B10 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 10)
S9 = ImageFont.truetype(FD + "DejaVuSerif-Bold.ttf", 9)
RAINBOW = [(255,80,80),(255,200,60),(255,255,120),(120,255,140),(100,220,255),(150,120,255),(255,120,230)]

def canvas(bg):
    im = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(im); d.fontmode = "1"; return im, d

def save(frames, name, ms):
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=200) for f in frames]
    if len(pal) == 1: pal[0].save(OUT + name + ".gif")
    else: pal[0].save(OUT + name + ".gif", save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=1)

def center(d, y, t, f, fill, x0=0, x1=W):
    w = d.textlength(t, font=f); d.text((x0 + (x1 - x0 - w) / 2, y), t, font=f, fill=fill)

def outline(d, xy, t, f, fill, edge):
    x, y = xy
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy: d.text((x + dx, y + dy), t, font=f, fill=edge)
    d.text((x, y), t, font=f, fill=fill)

# --- Island Time (2 buttons): simple, sun slowly sinking ---
def island_time():
    frames = []
    for k in range(6):
        im, d = canvas((255, 170, 120))
        for y in range(H):
            t = y / H
            d.line([(0, y), (W, y)], fill=(255, int(190 - 80 * t), int(130 - 40 * t)))
        sy = 13 + k
        d.ellipse([10, sy - 7, 24, sy + 7], fill=(255, 235, 120))
        d.rectangle([0, 21, W, H], fill=(70, 120, 180))
        d.line([(0, 21), (W, 21)], fill=(255, 255, 255))
        d.text((30, 3), "ISLAND", font=B9, fill=(90, 40, 120))
        d.text((30, 12), "TIME", font=B9, fill=(90, 40, 120))
        d.text((30, 22), "set complete", font=B7, fill=(255, 255, 255))
        d.rectangle([0, 0, W-1, H-1], outline=(90, 40, 120))
        frames.append(im)
    save(frames, "reward-island-time", 400)

# --- Under Construction (3 buttons): simple, "WE BUILT IT!" with a blinking check ---
def built_it():
    frames = []
    for k in range(2):
        im, d = canvas((255, 204, 0))
        for x in range(-H, W, 8):
            d.polygon([(x, H), (x + 4, H), (x + 4 + 6, H - 6), (x + 6, H - 6)], fill=(0, 0, 0))
        d.rectangle([0, 0, W-1, H-1], outline=(0, 0, 0))
        # hard hat
        d.pieslice([4, 5, 22, 21], 180, 360, fill=(255, 255, 255), outline=(0, 0, 0))
        d.rectangle([2, 13, 24, 15], fill=(255, 255, 255), outline=(0, 0, 0))
        center(d, 3, "WE BUILT", B8, (0, 0, 0), 25, W - 2)
        center(d, 13, "IT!", B9, (0, 0, 0), 25, W - 12)
        if k == 0:
            d.line([(72, 16), (75, 20), (82, 11)], fill=(0, 140, 0), width=2)
        frames.append(im)
    save(frames, "reward-built-it", 500)

# --- Neon Lights (6 buttons): neon sign flickering through colors ---
def neon_master():
    frames = []
    cols = [(255, 60, 220), (60, 220, 255), (120, 255, 120), (255, 240, 80)]
    seq = [0, 0, 1, 1, 2, 2, 3, 3, -1, 3]
    for k, ci in enumerate(seq):
        im, d = canvas((8, 0, 20))
        c = (60, 40, 70) if ci < 0 else cols[ci]
        dim = tuple(v // 3 for v in c)
        d.rounded_rectangle([1, 1, W-2, H-2], radius=4, outline=c)
        d.rounded_rectangle([3, 3, W-4, H-4], radius=3, outline=dim)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            center(d, 5 + dy, "NEON", B10, dim, dx, W + dx)
        center(d, 5, "NEON", B10, c)
        center(d, 17, "~ MASTER ~", B8, (255, 255, 255) if ci >= 0 else (90, 90, 90))
        frames.append(im)
    save(frames, "reward-neon-master", 160)

# --- Webmaster Starter Kit (5 buttons, the "cool" one): CERTIFIED WEBMASTER, spinning globe,
#     sparkles, gold frame, scrolling marquee strip ---
def webmaster():
    frames = []
    n = 16
    rnd = random.Random(9)
    msg = " *** HTML * GIFS * GUESTBOOKS * WEBRINGS * HIT COUNTERS"
    strip = Image.new("RGB", (600, 7), (0, 0, 0)); sd = ImageDraw.Draw(strip); sd.fontmode = "1"
    sd.text((0, -1), msg + msg, font=B7, fill=(0, 255, 0))
    for k in range(n):
        im, d = canvas((0, 0, 70))
        # gold frame that shimmers
        g = 200 + int(55 * math.sin(k / n * 2 * math.pi))
        d.rectangle([0, 0, W-1, H-1], outline=(g, int(g * 0.8), 0))
        d.rectangle([1, 1, W-2, H-2], outline=(120, 80, 0))
        # spinning wireframe globe
        cx, cy, r = 13, 12, 9
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 40, 140), outline=(120, 200, 255))
        a = k / n * math.pi
        for j in range(3):
            w = abs(r * math.cos(a + j * math.pi / 3))
            d.ellipse([cx - w, cy - r, cx + w, cy + r], outline=(80, 170, 255))
        d.line([(cx - r, cy), (cx + r, cy)], fill=(80, 170, 255))
        d.line([(cx - r + 2, cy - 5), (cx + r - 2, cy - 5)], fill=(80, 170, 255))
        d.line([(cx - r + 2, cy + 5), (cx + r - 2, cy + 5)], fill=(80, 170, 255))
        # title, rainbow on "WEBMASTER"
        center(d, 2, "CERTIFIED", B7, (255, 255, 255), 24, W - 2)
        word = "WEBMASTER"; f = B8
        x = 24 + (W - 26 - d.textlength(word, font=f)) / 2
        for i, ch in enumerate(word):
            d.text((x, 10), ch, font=f, fill=RAINBOW[(i + k) % 7])
            x += d.textlength(ch, font=f)
        # scrolling marquee strip along the bottom
        d.rectangle([2, 22, W - 3, H - 3], fill=(0, 0, 0))
        off = (k * 6) % 300
        im.paste(strip.crop((off, 0, off + W - 6, 7)), (3, 23))
        # sparkles
        for _ in range(2):
            sx, sy = rnd.randrange(4, W - 4), rnd.randrange(3, 20)
            d.point([(sx, sy)], fill=(255, 255, 255))
            d.point([(sx - 1, sy), (sx + 1, sy), (sx, sy - 1), (sx, sy + 1)], fill=(255, 255, 180))
        frames.append(im)
    save(frames, "reward-certified-webmaster", 110)

# --- Holo Hunter (secret, 3 holos): full rainbow holo shimmer with a trophy ---
def holo_hunter():
    frames = []
    n = 12
    for k in range(n):
        im, d = canvas((30, 10, 50))
        for x in range(W):
            c = RAINBOW[((x + k * 4) // 6) % 7]
            d.line([(x, 0), (x, H)], fill=tuple(int(v * 0.35) for v in c))
        # trophy
        d.polygon([(6, 5), (20, 5), (18, 15), (8, 15)], fill=(255, 215, 0), outline=(140, 90, 0))
        d.arc([2, 6, 10, 13], 90, 270, fill=(255, 215, 0))
        d.arc([16, 6, 24, 13], 270, 90, fill=(255, 215, 0))
        d.rectangle([11, 15, 15, 20], fill=(255, 215, 0))
        d.rectangle([7, 20, 19, 24], fill=(140, 90, 0))
        outline(d, (27, 3), "HOLO", B10, RAINBOW[k % 7], (0, 0, 0))
        outline(d, (27, 15), "HUNTER", B10, (255, 255, 255), (0, 0, 0))
        # foil sweep
        band = Image.new("RGB", (W, H), (0, 0, 0)); bd = ImageDraw.Draw(band)
        pos = -40 + (W + 80) * k / n
        for i, c in enumerate(RAINBOW):
            xx = pos + i * 4
            bd.polygon([(xx, 0), (xx + 4, 0), (xx + 4 - 18, H), (xx - 18, H)], fill=tuple(int(v * 0.7) for v in c))
        im = ImageChops.screen(im, band)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W-1, H-1], outline=RAINBOW[k % 7]); d.rectangle([1, 1, W-2, H-2], outline=(255, 255, 255))
        frames.append(im)
    save(frames, "reward-holo-hunter", 90)

island_time(); built_it(); neon_master(); webmaster(); holo_hunter()
names = ["reward-island-time", "reward-built-it", "reward-neon-master", "reward-certified-webmaster", "reward-holo-hunter"]
sheet = Image.new("RGB", (3 * (W * 4) + 40, len(names) * (H * 4 + 12) + 10), (0, 0, 51))
for r, nme in enumerate(names):
    g = Image.open(OUT + nme + ".gif"); N = getattr(g, "n_frames", 1)
    for c, idx in enumerate([0, N // 3, 2 * N // 3]):
        g.seek(min(idx, N - 1)); sheet.paste(g.convert("RGB").resize((W * 4, H * 4), Image.NEAREST), (c * (W * 4 + 12) + 6, r * (H * 4 + 12) + 6))
sheet.save(OUT + "preview-rewards.png"); print("ok")
