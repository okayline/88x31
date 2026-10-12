"""Batch 2: special variants. Holo (foil) Bodacious and Radical!, and an ultra rare Gold Leaf
Four Kimono Ladies. Sources: sources/openclipart/ (public domain). Writes GIFs to made/."""
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "sources", "openclipart") + "/"
OUT = os.path.join(ROOT, "made") + "/"
os.makedirs(OUT, exist_ok=True)
W, H = 88, 31
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
RAINBOW = [(255,80,80),(255,200,60),(255,255,120),(120,255,140),(100,220,255),(150,120,255),(255,120,230)]

def flatten(im, bg):
    im = im.convert("RGBA"); b = Image.new("RGBA", im.size, bg); b.alpha_composite(im); return b.convert("RGB")

def fit_crop(im, cx, cy, w):
    h = round(w * H / W); return im.crop((cx - w//2, cy - h//2, cx - w//2 + w, cy - h//2 + h))

def save(frames, path, ms):
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=200) for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=1)

def outline_text(d, xy, text, font, fill, edge):
    x, y = xy
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy: d.text((x+dx, y+dy), text, font=font, fill=edge)
    d.text((x, y), text, font=font, fill=fill)

def holo(img, k, n, seed):
    """Foil shine: a rainbow band sweeping diagonally, screen-blended, plus twinkles."""
    band = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(band)
    pos = -40 + (W + 80) * k / n
    for i, c in enumerate(RAINBOW):
        x = pos + i * 4
        d.polygon([(x, 0), (x + 4, 0), (x + 4 - 18, H), (x - 18, H)], fill=tuple(int(v * 0.75) for v in c))
    out = ImageChops.screen(img, band)
    # constant faint foil tint so every frame reads as "special"
    out = Image.blend(out, ImageChops.screen(out, Image.new("RGB", (W, H), (40, 30, 60))), 0.5)
    rnd = random.Random(seed + k); d = ImageDraw.Draw(out)
    for _ in range(3):
        x, y = rnd.randrange(3, W - 3), rnd.randrange(3, H - 3)
        d.point([(x, y)], fill=(255, 255, 255)); d.point([(x-1, y), (x+1, y), (x, y-1), (x, y+1)], fill=(255, 255, 200))
    return out

def foil_border(d, k):
    c = RAINBOW[k % len(RAINBOW)]
    d.rectangle([0, 0, W-1, H-1], outline=c); d.rectangle([1, 1, W-2, H-2], outline=(255, 255, 255))

# ---- Bodacious Holo ----
src = flatten(Image.open(SRC + "bodacious.png"), (20, 0, 40))
base = fit_crop(src, 412, 398, 590).resize((W, H), Image.LANCZOS)
n = 12
frames = []
for k in range(n):
    f = holo(base, k, n, 1); foil_border(ImageDraw.Draw(f), k); frames.append(f)
save(frames, OUT + "bodacious-holo.gif", 90)

# ---- Radical! Holo ----
star = Image.open(SRC + "crazystar.png").convert("RGBA")
font = ImageFont.truetype(FONT, 13)
n = 12
frames = []
for k in range(n):
    rot = star.rotate(k * (360 / 7) / n, resample=Image.BICUBIC, center=(400, 400), fillcolor=(0, 0, 0, 0))
    f = flatten(fit_crop(rot, 400, 400, 640), (255, 255, 255)).resize((W, H), Image.LANCZOS)
    f = holo(f, k, n, 2)
    d = ImageDraw.Draw(f); d.fontmode = "1"
    t = "RADICAL!"; tw = d.textlength(t, font=font)
    outline_text(d, ((W - tw) / 2, 7), t, font, RAINBOW[k % len(RAINBOW)], (0, 0, 0))
    foil_border(d, k + 3); frames.append(f)
save(frames, OUT + "radical-holo.gif", 90)

# ---- Four Kimono Ladies: Gold Leaf (ultra rare) ----
src = flatten(Image.open(SRC + "kimono.png"), (232, 216, 205))
sw, sh = src.size; cw = round(sh * W / H)
big = src.crop(((sw - cw)//2, 0, (sw - cw)//2 + cw, sh))
# swap the pale background for gold leaf (checked at full size, then shrunk)
gold = Image.new("RGB", big.size); gp = gold.load(); rnd = random.Random(7)
tile = 24
for y in range(big.size[1]):
    for x in range(big.size[0]):
        t = ((x // tile) + (y // tile)) % 2  # faint squares like gold-leaf sheets
        v = 0.9 + 0.1 * t + rnd.uniform(-0.04, 0.04)
        gp[x, y] = (int(222 * v), int(178 * v), int(60 * v))
bp = big.load(); gl = gold.load(); out = big.copy(); op = out.load()
for y in range(big.size[1]):
    for x in range(big.size[0]):
        r, g, b = bp[x, y]
        if r > 200 and g > 185 and b > 170 and abs(r - b) < 60:  # pale background tones
            op[x, y] = gl[x, y]
gold_base = out.resize((W, H), Image.LANCZOS)
plain_base = big.resize((W, H), Image.LANCZOS)

def frame_border(d, outer, inner):
    d.rectangle([0, 0, W-1, H-1], outline=outer); d.rectangle([1, 1, W-2, H-2], outline=inner)

# Gold Leaf: gold background, a shimmer crossing once per loop
n = 14
frames = []
for k in range(n):
    f = gold_base.copy()
    sx = -20 + (W + 40) * k / n
    for yy in range(H):
        for dx in range(3):
            xx = int(sx - yy * 0.6) + dx
            if 0 <= xx < W:
                r, g, b = f.getpixel((xx, yy)); f.putpixel((xx, yy), (min(255, r + 55), min(255, g + 50), min(255, b + 25)))
    frame_border(ImageDraw.Draw(f), (255, 215, 0), (140, 90, 0)); frames.append(f)
save(frames, OUT + "kimono-gold-leaf.gif", 100)

# Sakura: original colors, cherry blossom petals drifting down and across
rnd = random.Random(11)
petals = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(0.6, 1.2)) for _ in range(9)]
n = 16
frames = []
for k in range(n):
    f = plain_base.copy(); d = ImageDraw.Draw(f)
    for (x0, y0, sp) in petals:
        x = (x0 + k * 5.5 * sp) % (W + 4) - 2
        y = (y0 + k * 2.0 * sp) % (H + 4) - 2
        d.rectangle([x, y, x + 1, y + 1], fill=(255, 150, 175)); d.point([(x + 1, y)], fill=(255, 225, 232))
    # light pink foil: a soft pink sheen sweeping across, plus a faint pink glaze
    band = Image.new("RGB", (W, H), (0, 0, 0)); bd = ImageDraw.Draw(band)
    pos = -40 + (W + 80) * k / n
    for i, c in enumerate([(120, 60, 80), (200, 110, 140), (255, 190, 215), (200, 110, 140), (120, 60, 80)]):
        x = pos + i * 4
        bd.polygon([(x, 0), (x + 4, 0), (x + 4 - 18, H), (x - 18, H)], fill=c)
    f = ImageChops.screen(f, band)
    f = Image.blend(f, ImageChops.screen(f, Image.new("RGB", (W, H), (60, 20, 40))), 0.5)
    d = ImageDraw.Draw(f)
    frame_border(d, (255, 150, 175), (255, 255, 255)); frames.append(f)
save(frames, OUT + "kimono-sakura.gif", 110)
print("ok")
