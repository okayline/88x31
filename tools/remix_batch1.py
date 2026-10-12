"""Batch 1 remixes from public-domain Openclipart art (sources/openclipart/).
Writes 88x31 GIFs to made/; then run tools/add_banner.py on each to add credits + seed."""
import colorsys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "sources", "openclipart") + "/"; OUT = os.path.join(ROOT, "made") + "/"
os.makedirs(OUT, exist_ok=True)
W,H=88,31
F="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def flatten(im, bg):
    im=im.convert("RGBA"); b=Image.new("RGBA", im.size, bg); b.alpha_composite(im); return b.convert("RGB")

def fit_crop(im, cx, cy, w):
    h=round(w*H/W); return im.crop((cx-w//2, cy-h//2, cx-w//2+w, cy-h//2+h))

def save(frames, path, ms):
    pal=[f.convert("P", palette=Image.ADAPTIVE, colors=128) for f in frames]
    if len(pal)==1: pal[0].save(path)
    else: pal[0].save(path, save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=1)

def outline_text(d, xy, text, font, fill, edge, width=1):
    x,y=xy
    for dx in range(-width,width+1):
        for dy in range(-width,width+1):
            if dx or dy: d.text((x+dx,y+dy), text, font=font, fill=edge)
    d.text((x,y), text, font=font, fill=fill)

# 1. Bodacious: tight crop on the word, starburst colors cycle, text stays put
src=flatten(Image.open(SRC+"bodacious.png"), (20,0,40))
base=fit_crop(src, 412, 398, 590).resize((W,H), Image.LANCZOS)
frames=[]
for k in range(4):
    f=base.copy(); px=f.load()
    for y in range(H):
        for x in range(W):
            r,g,b=px[x,y]; h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if not (0.0<=h<=0.17 and s>0.35):   # leave the orange/yellow lettering alone
                h=(h+k*0.25)%1; r2,g2,b2=colorsys.hsv_to_rgb(h,s,v); px[x,y]=(int(r2*255),int(g2*255),int(b2*255))
    d=ImageDraw.Draw(f); d.rectangle([0,0,W-1,H-1], outline=(255,255,0))
    frames.append(f)
save(frames, OUT+"bodacious.gif", 250)

# 2. Crazy Star: tight crop (points cut off), slowly turning, 90s text on top
star=Image.open(SRC+"crazystar.png").convert("RGBA")
font=ImageFont.truetype(F, 13)
frames=[]
n=8
for k in range(n):
    rot=star.rotate(k*(360/7)/n, resample=Image.BICUBIC, center=(400,400), fillcolor=(0,0,0,0))
    f=flatten(fit_crop(rot, 400, 400, 640), (255,255,255)).resize((W,H), Image.LANCZOS)
    d=ImageDraw.Draw(f); d.fontmode="1"
    t="RADICAL!"; tw=d.textlength(t, font=font)
    outline_text(d, ((W-tw)/2, 7), t, font, (255,255,0), (0,0,0), 1)
    d.rectangle([0,0,W-1,H-1], outline=(0,0,0))
    frames.append(f)
save(frames, OUT+"crazy-star.gif", 110)

# 3. Four Kimono Ladies: the whole strip, trimmed to button shape
src=flatten(Image.open(SRC+"kimono.png"), (232,216,205))
sw,sh=src.size; cw=round(sh*W/H)
f=src.crop(((sw-cw)//2,0,(sw-cw)//2+cw,sh)).resize((W,H), Image.LANCZOS)
d=ImageDraw.Draw(f); d.rectangle([0,0,W-1,H-1], outline=(80,40,30))
save([f], OUT+"kimono-ladies.gif", 0)

# preview sheet at 4x, first frame + a later frame
sheet=Image.new("RGB",(2*(W*4)+30, 3*(H*4)+40),(0,0,51))
for row,(name,fr2) in enumerate([("bodacious",2),("crazy-star",4),("kimono-ladies",0)]):
    g=Image.open(OUT+name+".gif")
    for col,idx in enumerate([0,fr2]):
        g.seek(min(idx, getattr(g,'n_frames',1)-1)); sheet.paste(g.convert("RGB").resize((W*4,H*4),Image.NEAREST),(col*(W*4+10)+5, row*(H*4+12)+5))
sheet.save(OUT+"preview.png"); print("ok")
