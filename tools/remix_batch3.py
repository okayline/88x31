"""Batch 3: Synthwave and Island Life (public-domain Openclipart art by j4p4n).
Writes 88x31 GIFs to made/: synthwave, synthwave-holo, island-life, island-life-moonlight."""
import os, random, colorsys
from PIL import Image, ImageDraw, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "sources", "openclipart") + "/"
OUT = os.path.join(ROOT, "made") + "/"
os.makedirs(OUT, exist_ok=True)
W, H = 88, 31
RAINBOW = [(255,80,80),(255,200,60),(255,255,120),(120,255,140),(100,220,255),(150,120,255),(255,120,230)]

def flatten(im, bg):
    im = im.convert("RGBA"); b = Image.new("RGBA", im.size, bg); b.alpha_composite(im); return b.convert("RGB")

def fit_crop(im, cx, cy, w):
    h = round(w * H / W); return im.crop((cx - w//2, cy - h//2, cx - w//2 + w, cy - h//2 + h))

def save(frames, path, ms):
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=200) for f in frames]
    if len(pal) == 1: pal[0].save(path)
    else: pal[0].save(path, save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=1)

def border(d, outer, inner=None):
    d.rectangle([0, 0, W-1, H-1], outline=outer)
    if inner: d.rectangle([1, 1, W-2, H-2], outline=inner)

def holo(img, k, n, seed):
    band = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(band)
    pos = -40 + (W + 80) * k / n
    for i, c in enumerate(RAINBOW):
        x = pos + i * 4
        d.polygon([(x, 0), (x + 4, 0), (x + 4 - 18, H), (x - 18, H)], fill=tuple(int(v * 0.75) for v in c))
    out = ImageChops.screen(img, band)
    out = Image.blend(out, ImageChops.screen(out, Image.new("RGB", (W, H), (40, 30, 60))), 0.5)
    rnd = random.Random(seed + k); d = ImageDraw.Draw(out)
    for _ in range(3):
        x, y = rnd.randrange(3, W - 3), rnd.randrange(3, H - 3)
        d.point([(x, y)], fill=(255, 255, 255)); d.point([(x-1, y), (x+1, y), (x, y-1), (x, y+1)], fill=(255, 255, 200))
    return out

# ---------- Synthwave: sun + script, neon grid pulsing ----------
src = flatten(Image.open(SRC + "synthwave.png"), (66, 50, 74))
base = fit_crop(src, 1015, 700, 1060).resize((W, H), Image.LANCZOS)
def is_magenta(r, g, b): return r > 150 and b > 150 and g < 120
def pulse(img, level):
    f = img.copy(); px = f.load()
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if is_magenta(r, g, b):
                px[x, y] = (min(255, int(r * level)), min(255, int(g * level + 40 * (level - 1))), min(255, int(b * level)))
    return f
levels = [0.75, 0.85, 1.0, 1.15, 1.25, 1.15, 1.0, 0.85]
frames = []
for lv in levels:
    f = pulse(base, lv); border(ImageDraw.Draw(f), (255, 60, 230)); frames.append(f)
save(frames, OUT + "synthwave.gif", 120)
n = 12
frames = []
for k in range(n):
    f = holo(pulse(base, levels[k % len(levels)]), k, n, 5)
    border(ImageDraw.Draw(f), RAINBOW[k % 7], (255, 255, 255)); frames.append(f)
save(frames, OUT + "synthwave-holo.gif", 90)

# ---------- Island Life: sunset and palms ----------
src = flatten(Image.open(SRC + "island-life.png"), (255, 255, 255))
crop = fit_crop(src, 1000, 840, 1640)
island = crop.resize((W, H), Image.LANCZOS)
f = island.copy(); border(ImageDraw.Draw(f), (106, 124, 190))
save([f], OUT + "island-life.gif", 0)

# ---------- Island Life Moonlight: the same scene at night ----------
cw, ch = crop.size
night = crop.copy(); px = night.load()
sun_c = (1015 - (1000 - cw // 2), 855 - (840 - ch // 2)); sun_r = 300
for y in range(ch):
    for x in range(cw):
        r, g, b = px[x, y]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        in_sun = (x - sun_c[0]) ** 2 + (y - sun_c[1]) ** 2 < sun_r ** 2
        if s < 0.12 and v > 0.85:                      # white stripes and gaps
            px[x, y] = (40, 44, 90)
        elif 0.55 < h < 0.75 and s > 0.25 and b > r:   # palms and island (blue-violet)
            px[x, y] = (14, 12, 34)
        elif 0.5 < h < 0.6:                            # ocean stripes
            px[x, y] = (20, 50, 80)
        elif in_sun:                                   # sun becomes the moon
            t = (y - (sun_c[1] - sun_r)) / (2 * sun_r)
            px[x, y] = (int(235 - 25 * t), int(235 - 20 * t), int(210 - 10 * t))
        else:                                          # warm sky becomes night sky
            t = y / ch
            px[x, y] = (int(18 + 40 * t), int(16 + 18 * t), int(60 + 50 * t))
night_small = night.resize((W, H), Image.LANCZOS)
rnd = random.Random(21)
stars = [(rnd.randrange(2, W - 2), rnd.randrange(2, 14), rnd.randrange(8)) for _ in range(14)]
frames = []
for k in range(8):
    f = night_small.copy(); d = ImageDraw.Draw(f)
    for (x, y, ph) in stars:
        r0, g0, b0 = f.getpixel((x, y))
        if r0 + g0 + b0 > 400 or (b0 < 50 and r0 < 30): continue  # not on the moon or a palm
        lvl = [255, 200, 140, 90, 70, 90, 140, 200][(k + ph) % 8]
        d.point([(x, y)], fill=(lvl, lvl, min(255, lvl + 30)))
    border(d, (200, 200, 255), (40, 44, 90)); frames.append(f)
save(frames, OUT + "island-life-moonlight.gif", 160)

# preview
names = ["synthwave", "synthwave-holo", "island-life", "island-life-moonlight"]
sheet = Image.new("RGB", (2 * (W * 4) + 30, len(names) * (H * 4 + 12) + 10), (0, 0, 51))
for r, nme in enumerate(names):
    g = Image.open(OUT + nme + ".gif"); N = getattr(g, "n_frames", 1)
    for c, idx in enumerate([0, N // 2]):
        g.seek(min(idx, N - 1)); sheet.paste(g.convert("RGB").resize((W * 4, H * 4), Image.NEAREST), (c * (W * 4 + 10) + 5, r * (H * 4 + 12) + 5))
sheet.save(OUT + "preview3.png"); print("ok")
