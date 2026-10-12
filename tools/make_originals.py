"""Original 88x31 buttons drawn from scratch for the cLuB (no outside art).
Writes GIFs to made/: mix-tape, y2k-ready, save-often, aliens-welcome."""
import os, math, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "made") + "/"
os.makedirs(OUT, exist_ok=True)
W, H = 88, 31
FD = "/usr/share/fonts/truetype/dejavu/"
B7 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 7)
B8 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 8)
B9 = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 9)
M9 = ImageFont.truetype(FD + "DejaVuSansMono-Bold.ttf", 9)

def canvas(bg):
    im = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(im); d.fontmode = "1"; return im, d

def save(frames, name, ms):
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=128) for f in frames]
    pal[0].save(OUT + name + ".gif", save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=1)

def bevel(d, light=(255, 255, 255), dark=(60, 60, 60)):
    d.line([(0, 0), (W-1, 0)], fill=light); d.line([(0, 0), (0, H-1)], fill=light)
    d.line([(0, H-1), (W-1, H-1)], fill=dark); d.line([(W-1, 0), (W-1, H-1)], fill=dark)

# ---- Mix Tape: cassette with spinning reels ----
def mix_tape():
    frames = []
    for k in range(6):
        im, d = canvas((255, 102, 178))
        bevel(d, (255, 190, 225), (150, 30, 100))
        d.rounded_rectangle([4, 3, 46, 27], radius=3, fill=(30, 30, 40), outline=(0, 0, 0))
        d.rectangle([8, 6, 42, 13], fill=(255, 245, 200))
        # handwritten label scribble
        d.line([(10, 8), (14, 10), (18, 8), (22, 10), (26, 8)], fill=(200, 0, 120))
        d.line([(10, 11), (16, 11)], fill=(60, 60, 200)); d.line([(19, 11), (30, 11)], fill=(60, 60, 200))
        d.text((32, 6), "<3", font=B7, fill=(200, 0, 120))
        d.rectangle([12, 16, 38, 24], fill=(90, 70, 60))
        for cx in (17, 33):
            d.ellipse([cx - 4, 16, cx + 4, 24], fill=(240, 240, 240), outline=(0, 0, 0))
            a = k * math.pi / 3
            for j in range(3):
                ang = a + j * 2 * math.pi / 3
                d.line([(cx, 20), (cx + 3 * math.cos(ang), 20 + 3 * math.sin(ang))], fill=(0, 0, 0))
        d.text((50, 4), "MIX", font=B9, fill=(255, 255, 255))
        d.text((50, 16), "TAPE", font=B9, fill=(255, 255, 0))
        frames.append(im)
    save(frames, "mix-tape", 110)

# ---- Y2K READY: clock rolls 1999 -> 2000, then a check mark ----
def y2k():
    frames = []
    seq = ["1999"] * 4 + ["2000"] * 6
    for i, year in enumerate(seq):
        im, d = canvas((0, 0, 0))
        d.rectangle([0, 0, W-1, H-1], outline=(0, 160, 0))
        d.rectangle([3, 4, 39, 26], fill=(10, 30, 10), outline=(0, 120, 0))
        d.text((7, 4), "12:00" if year == "2000" else "11:59", font=M9, fill=(0, 255, 0))
        d.text((9, 15), year, font=M9, fill=(255, 255, 0) if year == "2000" else (0, 200, 0))
        d.text((44, 4), "Y2K", font=B9, fill=(255, 255, 255))
        ready = year == "2000"
        d.text((44, 16), "READY", font=B9, fill=(0, 255, 0) if ready else (80, 80, 80))
        if ready and i % 2 == 0:
            d.line([(78, 8), (80, 11), (85, 4)], fill=(0, 255, 0), width=2)
        frames.append(im)
    save(frames, "y2k-ready", 300)

# ---- Save Often: floppy disk with a progress bar ----
def save_often():
    frames = []
    steps = 8
    for k in range(steps + 3):
        im, d = canvas((200, 200, 210))
        bevel(d)
        d.rectangle([4, 4, 26, 26], fill=(40, 60, 140), outline=(0, 0, 40))
        d.rectangle([9, 4, 21, 11], fill=(190, 190, 200)); d.rectangle([17, 5, 20, 10], fill=(40, 60, 140))
        d.rectangle([8, 15, 22, 26], fill=(245, 245, 245)); d.line([(10, 19), (20, 19)], fill=(150, 150, 150)); d.line([(10, 22), (20, 22)], fill=(150, 150, 150))
        t1, t2 = "SAVE", "OFTEN"
        w1, w2 = d.textlength(t1, font=B8), d.textlength(t2, font=B8)
        x0 = 31 + (54 - (w1 + 3 + w2)) / 2
        d.text((x0, 4), t1, font=B8, fill=(0, 0, 128))
        d.text((x0 + w1 + 3, 4), t2, font=B8, fill=(160, 0, 0))
        d.rectangle([31, 16, 84, 25], fill=(255, 255, 255), outline=(80, 80, 80))
        filled = min(k, steps)
        for j in range(filled):
            x = 33 + j * 6
            d.rectangle([x, 18, x + 4, 23], fill=(0, 0, 160))
        frames.append(im)
    save(frames, "save-often", 180)

# ---- Aliens Welcome: saucer bobbing, beam blinking ----
def aliens():
    frames = []
    rnd = random.Random(4)
    stars = [(rnd.randrange(W), rnd.randrange(H)) for _ in range(16)]
    for k in range(8):
        im, d = canvas((5, 5, 30))
        for i, (x, y) in enumerate(stars):
            if (i + k) % 4: d.point((x, y), fill=(200, 200, 255))
        dy = [0, 1, 2, 1, 0, -1, -2, -1][k]
        cx, cy = 16, 11 + dy
        if k % 2 == 0:
            d.polygon([(cx - 3, cy + 3), (cx + 3, cy + 3), (cx + 8, H - 2), (cx - 8, H - 2)], fill=(80, 255, 120))
        d.ellipse([cx - 5, cy - 6, cx + 5, cy + 1], fill=(150, 220, 255), outline=(255, 255, 255))
        d.ellipse([cx - 12, cy - 2, cx + 12, cy + 4], fill=(170, 170, 190), outline=(90, 90, 110))
        for j, lx in enumerate((cx - 7, cx, cx + 7)):
            d.point((lx, cy + 1), fill=(255, 60, 60) if (j + k) % 3 == 0 else (255, 255, 0))
        d.text((32, 4), "ALIENS", font=B9, fill=(80, 255, 120))
        d.text((32, 16), "WELCOME", font=B9, fill=(255, 255, 255))
        frames.append(im)
    save(frames, "aliens-welcome", 140)

mix_tape(); y2k(); save_often(); aliens()
names = ["mix-tape", "y2k-ready", "save-often", "aliens-welcome"]
sheet = Image.new("RGB", (2 * (W * 4) + 30, len(names) * (H * 4 + 12) + 10), (0, 0, 51))
for r, n in enumerate(names):
    g = Image.open(OUT + n + ".gif"); N = g.n_frames
    for c, idx in enumerate([0, N - 1]):
        g.seek(idx); sheet.paste(g.convert("RGB").resize((W * 4, H * 4), Image.NEAREST), (c * (W * 4 + 10) + 5, r * (H * 4 + 12) + 5))
sheet.save(OUT + "preview4.png"); print("ok")
