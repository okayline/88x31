"""Batch 5: 20 original buttons (10 common, 3 uncommon, 5 rare variants, 2 ultras).
Writes GIFs to made/ and made/preview-batch5.png."""
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "made") + "/"
os.makedirs(OUT, exist_ok=True)
W, H = 88, 31
FD = "/usr/share/fonts/truetype/dejavu/"
F = {n: ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", n) for n in (6, 7, 8, 9, 10, 11, 12)}
M = {n: ImageFont.truetype(FD + "DejaVuSansMono-Bold.ttf", n) for n in (7, 8, 9)}
RAINBOW = [(255,80,80),(255,200,60),(255,255,120),(120,255,140),(100,220,255),(150,120,255),(255,120,230)]
GOLD = [(255,215,0),(255,236,140),(200,150,0)]

def canvas(bg):
    im = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(im); d.fontmode = "1"; return im, d

def save(frames, name, ms):
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=200) for f in frames]
    if len(pal) == 1: pal[0].save(OUT + name + ".gif")
    else: pal[0].save(OUT + name + ".gif", save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=1)

def text_c(d, y, t, f, fill, x0=0, x1=W):
    w = d.textlength(t, font=f); d.text((x0 + (x1 - x0 - w) / 2, y), t, font=f, fill=fill)

def outline(d, xy, t, f, fill, edge):
    x, y = xy
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy: d.text((x + dx, y + dy), t, font=f, fill=edge)
    d.text((x, y), t, font=f, fill=fill)

def bevel(d, light=(255, 255, 255), dark=(60, 60, 60)):
    d.line([(0, 0), (W-1, 0)], fill=light); d.line([(0, 0), (0, H-1)], fill=light)
    d.line([(0, H-1), (W-1, H-1)], fill=dark); d.line([(W-1, 0), (W-1, H-1)], fill=dark)

def foil(img, k, n, colors=RAINBOW, strength=0.75, tint=(40, 30, 60), seed=0, sparkles=3):
    band = Image.new("RGB", (W, H)); bd = ImageDraw.Draw(band)
    pos = -40 + (W + 80) * k / n
    for i, c in enumerate(colors):
        x = pos + i * 4
        bd.polygon([(x, 0), (x + 4, 0), (x - 14, H), (x - 18, H)], fill=tuple(int(v * strength) for v in c))
    out = ImageChops.screen(img, band)
    out = Image.blend(out, ImageChops.screen(out, Image.new("RGB", (W, H), tint)), 0.5)
    d = ImageDraw.Draw(out); rnd = random.Random(seed + k)
    for _ in range(sparkles):
        x, y = rnd.randrange(3, W - 3), rnd.randrange(3, H - 3)
        d.point([(x, y)], fill=(255, 255, 255)); d.point([(x-1, y), (x+1, y), (x, y-1), (x, y+1)], fill=(255, 255, 200))
    return out

def double_border(d, outer, inner):
    d.rectangle([0, 0, W-1, H-1], outline=outer); d.rectangle([1, 1, W-2, H-2], outline=inner)

# ---------------- commons ----------------

def cyber_cafe(k):
    im, d = canvas((60, 30, 20)); bevel(d, (140, 90, 60), (20, 10, 5))
    d.rectangle([6, 13, 20, 25], fill=(255, 255, 255), outline=(0, 0, 0))
    d.arc([18, 15, 25, 22], 270, 90, fill=(255, 255, 255))
    d.rectangle([7, 14, 19, 16], fill=(110, 60, 20))
    for i, x in enumerate((9, 13, 17)):
        y0 = 11 - ((k + i) % 3)
        d.line([(x, y0), (x + (1 if (k + i) % 2 else -1), y0 - 3)], fill=(220, 220, 220))
    d.text((29, 4), "CYBER", font=F[9], fill=(255, 220, 150))
    d.text((29, 15), "CAFE", font=F[11], fill=(255, 255, 255))
    return im

def new_mail(k):
    im, d = canvas((0, 0, 128)); bevel(d, (120, 120, 255), (0, 0, 40))
    on = k % 2 == 0
    d.rectangle([5, 9, 25, 23], fill=(255, 255, 255), outline=(0, 0, 0))
    d.line([(5, 9), (15, 17), (25, 9)], fill=(0, 0, 0))
    if on:
        d.ellipse([20, 4, 28, 12], fill=(255, 0, 0)); d.text((22, 4), "1", font=F[7], fill=(255, 255, 255))
    d.text((32, 5), "NEW", font=F[10], fill=(255, 255, 0) if on else (180, 180, 60))
    d.text((32, 16), "MAIL!", font=F[10], fill=(255, 255, 255))
    return im

def modem(k):
    im, d = canvas((210, 210, 200)); bevel(d)
    d.rounded_rectangle([3, 8, 33, 23], radius=2, fill=(90, 90, 95), outline=(30, 30, 30))
    for i in range(5):
        on = (k + i * 3) % 4 != 0
        d.rectangle([6 + i * 5, 12, 8 + i * 5, 13], fill=(0, 255, 0) if on else (0, 70, 0))
    d.text((7, 16), "56K", font=F[6], fill=(220, 220, 220))
    d.text((38, 3), "DIAL-UP", font=F[8], fill=(0, 0, 0))
    d.text((38, 15), "~*bzzt*~" if k % 2 else "~*eeee*~", font=F[7], fill=(0, 0, 160))
    return im

def html4life(k):
    im, d = canvas((0, 0, 0)); d.rectangle([0, 0, W-1, H-1], outline=(0, 180, 0))
    t = "<HTML>" if k < 3 else "</HTML>"
    d.text((5, 3), t, font=M[9], fill=(0, 255, 0))
    d.text((5, 16), "4 LIFE", font=F[10], fill=(255, 255, 255))
    if k % 2 == 0: d.rectangle([60, 18, 64, 26], fill=(0, 255, 0))
    return im

def virtual_pet(k, golden=False):
    bg = (255, 220, 240) if not golden else (60, 40, 0)
    im, d = canvas(bg)
    egg = (255, 120, 180) if not golden else GOLD[0]
    d.ellipse([4, 2, 26, 29], fill=egg, outline=(80, 0, 40) if not golden else (120, 80, 0))
    d.rectangle([9, 9, 21, 20], fill=(190, 210, 170), outline=(40, 40, 40))
    hop = k % 2
    d.rectangle([13, 13 - hop, 17, 17 - hop], fill=(30, 30, 30))
    d.point([(14, 14 - hop), (16, 14 - hop)], fill=(190, 210, 170))
    for i, x in enumerate((10, 15, 20)):
        d.ellipse([x - 1, 23, x + 1, 25], fill=(255, 255, 255) if not golden else (255, 250, 200))
    fg = (120, 0, 70) if not golden else GOLD[1]
    d.text((31, 4), "VIRTUAL", font=F[8], fill=fg)
    d.text((31, 15), "PET <3" if k % 4 < 2 else "PET :3", font=F[10], fill=fg)
    return im

def cd_rom(k, rainbow=False):
    im, d = canvas((20, 20, 40) if not rainbow else (10, 0, 30))
    cx, cy, r = 15, 15, 12
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(200, 200, 215), outline=(120, 120, 140))
    a = k * math.pi / 4
    for j in range(3 if not rainbow else 7):
        ang = a + j * (2 * math.pi / (3 if not rainbow else 7))
        c = (240, 240, 255) if not rainbow else RAINBOW[j]
        d.pieslice([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], math.degrees(ang), math.degrees(ang) + (25 if not rainbow else 50), fill=c)
    d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(20, 20, 40) if not rainbow else (10, 0, 30), outline=(150, 150, 160))
    d.text((32, 4), "CD-ROM", font=F[9], fill=(255, 255, 255) if not rainbow else RAINBOW[k % 7])
    d.text((32, 16), "650 MB!", font=F[8], fill=(150, 200, 255))
    return im

def lava_lamp(k, blacklight=False):
    bg = (40, 0, 60) if not blacklight else (5, 0, 15)
    im, d = canvas(bg)
    glass = (255, 120, 0) if not blacklight else (60, 0, 120)
    blob = (255, 230, 0) if not blacklight else (0, 255, 120)
    d.polygon([(10, 3), (20, 3), (24, 25), (6, 25)], fill=glass)
    d.rectangle([5, 25, 25, 29], fill=(150, 150, 160)); d.polygon([(9, 1), (21, 1), (20, 3), (10, 3)], fill=(150, 150, 160))
    for i, (bx, ph, sz) in enumerate(((13, 0, 3), (17, 3, 2), (12, 5, 2))):
        y = 22 - ((k + ph) % 8) * 2.4
        d.ellipse([bx - sz, y - sz, bx + sz, y + sz], fill=blob)
    fg = (255, 200, 120) if not blacklight else (0, 255, 120)
    d.text((31, 4), "LAVA", font=F[11], fill=fg)
    d.text((31, 17), "LAMP" if not blacklight else "GLOW", font=F[9], fill=(255, 255, 255) if not blacklight else (200, 120, 255))
    if blacklight:
        for x in range(0, W, 3):
            if (x + k) % 9 == 0: d.point([(x, 1)], fill=(180, 0, 255))
    return im

def smiley(k, gold=False):
    im, d = canvas((0, 120, 255) if not gold else (40, 20, 0))
    face = (255, 230, 0) if not gold else GOLD[0]
    d.ellipse([4, 3, 28, 27], fill=face, outline=(0, 0, 0) if not gold else (140, 90, 0))
    wink = k in (3, 4)
    d.ellipse([10, 9, 13, 14], fill=(0, 0, 0))
    if wink: d.line([(19, 12), (23, 12)], fill=(0, 0, 0))
    else: d.ellipse([19, 9, 22, 14], fill=(0, 0, 0))
    d.arc([9, 11, 23, 23], 20, 160, fill=(0, 0, 0), width=2)
    fg = (255, 255, 255) if not gold else GOLD[1]
    d.text((33, 4), "HAVE A", font=F[8], fill=fg)
    d.text((33, 15), "NICE DAY", font=F[8], fill=(255, 255, 0) if not gold else (255, 255, 255))
    return im

def midi_on(k):
    im, d = canvas((20, 0, 40)); d.rectangle([0, 0, W-1, H-1], outline=(255, 0, 255))
    notes = [(6, 0), (14, 2), (22, 4)]
    for x, ph in notes:
        y = 8 + int(3 * math.sin((k + ph) * math.pi / 3))
        d.ellipse([x, y + 8, x + 4, y + 12], fill=(255, 255, 0)); d.line([(x + 4, y), (x + 4, y + 10)], fill=(255, 255, 0))
        d.line([(x + 4, y), (x + 7, y + 3)], fill=(255, 255, 0))
    d.text((34, 4), "MIDI", font=F[11], fill=(0, 255, 255))
    d.text((34, 17), "ON ♪" if k % 2 else "ON ♫", font=F[9], fill=(255, 255, 255))
    return im

def cool_site(k):
    im, d = canvas((0, 0, 0))
    rnd = random.Random(k)
    for x in range(W):
        h = 6 + int(4 * abs(math.sin((x + k * 3) / 4))) + rnd.randrange(3)
        for y in range(H - h, H):
            t = (y - (H - h)) / max(h, 1)
            d.point((x, y), fill=(255, int(220 * (1 - t)), 0))
    outline(d, (9, 3), "COOL SITE!", F[11], (255, 255, 255), (200, 0, 0))
    return im

# ---------------- uncommons ----------------

def ink_pen(k):
    im, d = canvas((255, 250, 230)); d.rectangle([0, 0, W-1, H-1], outline=(120, 80, 40))
    for y in (11, 17, 23): d.line([(4, y), (84, y)], fill=(180, 200, 230))
    msg = "sign my book!"
    n = min(len(msg), k * 2)
    d.text((6, 11), msg[:n], font=F[9], fill=(0, 0, 140))
    px = 6 + d.textlength(msg[:n], font=F[9])
    d.line([(px, 20), (px + 10, 4)], fill=(30, 30, 30), width=3); d.point([(px, 20)], fill=(0, 0, 140))
    return im

def webring_hub(k):
    im, d = canvas((0, 30, 60)); bevel(d, (90, 160, 220), (0, 10, 20))
    cx, cy, r = 15, 15, 10
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(120, 200, 255))
    for j in range(5):
        a = k * math.pi / 10 + j * 2 * math.pi / 5
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=RAINBOW[j * 2 % 7])
    d.text((30, 4), "WEBRING", font=F[9], fill=(255, 255, 255))
    d.text((30, 16), "<< HUB >>", font=F[8], fill=(255, 255, 0))
    return im

def millionth(k):
    on = k % 2 == 0
    im, d = canvas((255, 0, 0) if on else (255, 255, 0))
    fg = (255, 255, 0) if on else (255, 0, 0)
    text_c(d, 2, "YOU ARE THE", F[7], fg)
    text_c(d, 10, "1,000,000th", F[10], (255, 255, 255) if on else (0, 0, 0))
    text_c(d, 22, "VISITOR!!!", F[7], fg)
    return im

# ---------------- ultras ----------------

def fireworks(k, n=16):
    im, d = canvas((0, 0, 20))
    rnd = random.Random(2000)
    bursts = [(rnd.randrange(8, 80), rnd.randrange(5, 18), rnd.randrange(n), RAINBOW[i % 7]) for i in range(6)]
    for bx, by, start, c in bursts:
        t = (k - start) % n
        if t < 6:
            rad = 2 + t * 2
            fade = 1 - t / 6
            col = tuple(int(v * fade + 30 * (1 - fade)) for v in c)
            for j in range(10):
                a = j * math.pi / 5
                x, y = bx + rad * math.cos(a), by + rad * math.sin(a)
                d.point([(x, y)], fill=col)
                if t < 3: d.point([(x - math.cos(a), y - math.sin(a))], fill=col)
        elif t > n - 3:
            d.line([(bx, H), (bx, by + (n - t) * 4)], fill=(255, 200, 120))
    outline(d, (21, 17), "* 2000 *", F[10], GOLD[0], (90, 0, 90))
    double_border(d, GOLD[0], (90, 0, 90))
    return im

def golden_floppy(k, n=14):
    im, d = canvas((50, 30, 0))
    d.rectangle([4, 4, 26, 26], fill=GOLD[0], outline=(120, 80, 0))
    d.rectangle([9, 4, 21, 11], fill=GOLD[1]); d.rectangle([17, 5, 20, 10], fill=GOLD[2])
    d.rectangle([8, 15, 22, 26], fill=(255, 250, 220)); d.line([(10, 19), (20, 19)], fill=(200, 160, 60)); d.line([(10, 22), (20, 22)], fill=(200, 160, 60))
    outline(d, (31, 3), "THE GOLDEN", F[7], GOLD[1], (60, 30, 0))
    outline(d, (31, 14), "FLOPPY", F[11], (255, 255, 255), (120, 80, 0))
    im = foil(im, k, n, colors=[(255, 230, 120), (255, 255, 220), (255, 200, 60)], strength=0.8, tint=(60, 40, 0), seed=77, sparkles=4)
    d = ImageDraw.Draw(im); double_border(d, GOLD[0], (255, 255, 255) if k % 2 else GOLD[2])
    return im

# ---------------- render ----------------

def anim(fn, name, n, ms, **kw):
    save([fn(k, **kw) for k in range(n)], name, ms)

def holo_of(fn, name, n, ms, border=None, **kw):
    frames = []
    for k in range(n):
        f = foil(fn(k % 6 if n > 6 else k, **kw), k, n, seed=len(name))
        d = ImageDraw.Draw(f); double_border(d, RAINBOW[k % 7] if border is None else border, (255, 255, 255))
        frames.append(f)
    save(frames, name, ms)

anim(cyber_cafe, "cyber-cafe", 6, 220)
anim(new_mail, "new-mail", 4, 400)
anim(modem, "56k-modem", 8, 180)
anim(html4life, "html-4-life", 6, 350)
anim(virtual_pet, "virtual-pet", 4, 300)
anim(cd_rom, "cd-rom", 8, 90)
anim(lava_lamp, "lava-lamp", 8, 200)
anim(smiley, "smiley", 6, 300)
anim(midi_on, "midi-on", 6, 180)
anim(cool_site, "cool-site", 6, 120)
anim(ink_pen, "ink-pen", 8, 220)
anim(webring_hub, "webring-hub", 10, 120)
anim(millionth, "millionth-visitor", 2, 450)
# rares: special versions
anim(lava_lamp, "lava-lamp-blacklight", 8, 200, blacklight=True)
anim(cd_rom, "cd-rom-rainbow", 8, 80, rainbow=True)
anim(smiley, "smiley-gold", 6, 300, gold=True)
anim(virtual_pet, "virtual-pet-golden-egg", 4, 300, golden=True)
holo_of(cool_site, "cool-site-holo", 12, 100)
# ultras
save([fireworks(k) for k in range(16)], "millennium-fireworks", 120)
save([golden_floppy(k) for k in range(14)], "golden-floppy", 100)

names = ["cyber-cafe", "new-mail", "56k-modem", "html-4-life", "virtual-pet", "cd-rom", "lava-lamp", "smiley", "midi-on", "cool-site",
         "ink-pen", "webring-hub", "millionth-visitor",
         "lava-lamp-blacklight", "cd-rom-rainbow", "smiley-gold", "virtual-pet-golden-egg", "cool-site-holo",
         "millennium-fireworks", "golden-floppy"]
cols = 4
sheet = Image.new("RGB", (cols * (W * 3 + 10) + 10, ((len(names) + cols - 1) // cols) * (H * 3 + 10) + 10), (0, 0, 51))
for i, n in enumerate(names):
    g = Image.open(OUT + n + ".gif"); N = getattr(g, "n_frames", 1); g.seek(N // 3 if N > 2 else 0)
    sheet.paste(g.convert("RGB").resize((W * 3, H * 3), Image.NEAREST), (10 + (i % cols) * (W * 3 + 10), 10 + (i // cols) * (H * 3 + 10)))
sheet.save(OUT + "preview-batch5.png"); print("ok", len(names))
