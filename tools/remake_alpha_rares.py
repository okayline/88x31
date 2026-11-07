"""(v0.51.20, Nov 7 2026) Remade Alpha rares: writes <name>-A.gif (the new picture of Lava Lamp Blacklight, CD-ROM Rainbow,
Have a Nice Day Gold and Virtual Pet Golden Egg) and <name>-B.gif (the new rares Black Light Lava, Nice Day Coin and
Virtual Pet Hatchling) to made/."""
import math, random, colorsys
from PIL import Image, ImageDraw, ImageFont, ImageChops
W,H=88,31
FD="/usr/share/fonts/truetype/dejavu/"
B={n:ImageFont.truetype(FD+"DejaVuSans-Bold.ttf",n) for n in range(6,14)}
C={n:ImageFont.truetype(FD+"DejaVuSansCondensed-Bold.ttf",n) for n in range(6,14)}
M={n:ImageFont.truetype(FD+"DejaVuSansMono-Bold.ttf",n) for n in range(6,11)}
import os
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"made")+"/"; os.makedirs(OUT,exist_ok=True)
def cv(bg):
    im=Image.new("RGB",(W,H),bg); d=ImageDraw.Draw(im); d.fontmode="1"; return im,d
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def hsv(h,s=1,v=1): return tuple(int(c*255) for c in colorsys.hsv_to_rgb(h%1,s,v))
def textmask(t,f,size=(W,H),xy=(0,0)):
    m=Image.new("L",size,0); d=ImageDraw.Draw(m); d.fontmode="1"; d.text(xy,t,font=f,fill=255); return m
def stamp(im,mask,fill_fn,edge=None,shadow=None):
    px=im.load(); mp=mask.load()
    def on(x,y): return 0<=x<W and 0<=y<H and mp[x,y]
    if shadow:
        for x in range(W):
            for y in range(H):
                if on(x-1,y-1) and not on(x,y): px[x,y]=shadow
    if edge:
        for x in range(W):
            for y in range(H):
                if not on(x,y) and any(on(x+dx,y+dy) for dx in (-1,0,1) for dy in (-1,0,1)): px[x,y]=edge
    for x in range(W):
        for y in range(H):
            if on(x,y): px[x,y]=fill_fn(x,y)
def tw(t,f): return int(ImageDraw.Draw(Image.new("L",(1,1))).textlength(t,font=f))
def frame(d,o,i): d.rectangle([0,0,W-1,H-1],outline=o); d.rectangle([1,1,W-2,H-2],outline=i)
def save(fr,name,ms):
    p=[f.convert("P",palette=Image.ADAPTIVE,colors=128) for f in fr]
    p[0].save(OUT+name+".gif",save_all=True,append_images=p[1:],duration=ms,loop=0,disposal=1)
def holo(img,k,n,strength=.55,seed=0,sparkles=3):
    band=Image.new("RGB",(W,H)); bd=ImageDraw.Draw(band); pos=-40+(W+80)*k/n
    for i in range(7):
        x=pos+i*4; c=hsv(i/7,.7,1)
        bd.polygon([(x,0),(x+4,0),(x-14,H),(x-18,H)],fill=tuple(int(v*strength) for v in c))
    out=ImageChops.screen(img,band); d=ImageDraw.Draw(out); r=random.Random(seed*100+k)
    for _ in range(sparkles):
        x,y=r.randrange(4,W-4),r.randrange(4,H-4); d.point([(x,y)],fill=(255,255,255)); d.point([(x-1,y),(x+1,y),(x,y-1),(x,y+1)],fill=(255,255,210))
    return out

# ---------- LAVA LAMP BLACKLIGHT ----------
def lamp(im,k,n,cx,blob_cols,glass_top,glass_bot,glow=True):
    px=im.load(); d=ImageDraw.Draw(im)
    top,bot=4,24
    def half(y): return 3+ (y-top)/(bot-top)*6   # glass widens down
    if glow:
        for x in range(W):
            for y in range(H):
                dist=abs(x-cx)/ (half(min(max(y,top),bot))+5)
                if dist<1 and (x+y)%2==0 and top-2<=y<=bot+2:
                    px[x,y]=lerp(px[x,y],(90,0,170),.45*(1-dist))
    t=k/n*2*math.pi
    blobs=[(cx+2*math.sin(t),top+3+ (bot-top-6)*(.5+.5*math.sin(t)),2.6),(cx-1.5*math.cos(t*1),top+3+(bot-top-6)*(.5+.5*math.sin(t+2.2)),2.0),(cx+.5,bot-1.5,3.4),(cx,top+1+ (bot-top-4)*(.5+.5*math.sin(t+4.4)),1.6)]
    for y in range(top,bot+1):
        hw=half(y)
        for x in range(int(cx-hw),int(cx+hw)+1):
            u=(x-(cx-hw))/(2*hw)
            g=lerp(glass_top,glass_bot,(y-top)/(bot-top))
            g=lerp(g,(0,0,0),.35*abs(u-.45)*2)
            f=sum(r*r/((x-bx)**2+(y-by)**2+.01) for bx,by,r in blobs)
            if f>1.0:
                c=blob_cols[0] if f>1.6 else blob_cols[1]
                if u<.35 and f>1.6: c=blob_cols[2]
                g=c
            if u<.18: g=lerp(g,(255,255,255),.25)
            px[x,y]=g
    # cap and base, metal
    for y in range(top-3,top):
        w=4+(y-(top-3))*.3
        for x in range(int(cx-w),int(cx+w)+1): px[x,y]=lerp((70,70,90),(190,190,210),1-abs(x-cx)/w)
    for y in range(bot+1,H-1):
        w=9-(y-bot-1)*.6+ (2 if y>=H-3 else 0)
        for x in range(int(cx-w),int(cx+w)+1): px[x,y]=lerp((50,50,70),(170,170,190),max(0,1-abs(x-cx+2)/w))

def lava_a(k,n=12):
    im,d=cv((6,0,18))
    r=random.Random(3)
    for _ in range(14):
        x,y=r.randrange(W),r.randrange(H)
        if (k+x)%4: im.putpixel((x,y),(60,0,110))
    lamp(im,k,n,15,[(40,255,120),(0,170,70),(200,255,210)],(70,0,140),(30,0,80))
    def gl(x,y): return lerp((180,255,200),(0,230,110),y/12)
    stamp(im,textmask("LAVA",B[13],xy=(33,0)),gl,edge=(0,90,40),shadow=None)
    def pg(x,y): return hsv(.78+.04*math.sin((x+k*2)/4),.55,1)
    stamp(im,textmask("GLOW",B[10],xy=(35,16)),pg,edge=(60,0,90))
    d=ImageDraw.Draw(im); frame(d,(150,0,255),(40,0,70))
    if k%3==0: d.point([(84,4)],fill=(220,180,255))
    return im
def lava_b(k,n=12):
    im,d=cv((0,0,0))
    px=im.load()
    for x in range(W):
        for y in range(H):
            v=math.sin(x/5+k*.5)+math.sin((x+y)/7)+math.sin(math.hypot(x-60,y-15)/3-k*.5)
            if (x+y)%2==0: px[x,y]=lerp((0,0,0),hsv(.75+v*.05,1,.45),max(0,v/3))
    lamp(im,k,n,74,[(255,60,200),(170,0,140),(255,200,240)],(40,0,110),(10,0,50))
    d=ImageDraw.Draw(im); d.fontmode="1"
    stamp(im,textmask("BLACK LIGHT",C[7],xy=(5,3)),lambda x,y:(200,140,255),edge=(20,0,40))
    def gl(x,y): return lerp((255,255,140),(120,255,60),(y-11)/12)
    stamp(im,textmask("LAVA",B[13],xy=(10,11)),gl,edge=(0,0,0),shadow=(170,0,140))
    frame(d,(255,60,200),(30,0,60))
    return im

# ---------- CD-ROM RAINBOW ----------
def disc(im,cx,cy,r,k,n,squash=1.0):
    px=im.load(); rot=k/n*2*math.pi
    for x in range(W):
        for y in range(H):
            dx=(x-cx)/squash; dy=y-cy; rr=math.hypot(dx,dy)
            if rr<=r+.4:
                a=math.atan2(dy,dx)
                if rr<3.2: px[x,y]=(10,0,25) if rr<1.8 else (200,200,215); continue
                if rr<5: px[x,y]=(160,165,185); continue
                hue=(a+rot)/(2*math.pi)*2 + rr/40
                v=.75+.25*math.cos(2*(a-rot*.5))
                c=hsv(hue,.55,v)
                glare=max(0,math.cos(2*(a-rot)))**8
                c=lerp(c,(255,255,255),glare*.8)
                if rr>r-1: c=lerp(c,(90,90,110),.6)
                px[x,y]=c
def cd_a(k,n=12):
    im,d=cv((8,0,24))
    px=im.load()
    for y in range(H):
        for x in range(W):
            if (x*3+y*5)%17==0: px[x,y]=(30,20,60)
    disc(im,15,15,13,k,n)
    def rb(x,y): return hsv((x/40)-k/n,.65,1)
    stamp(im,textmask("CD-ROM",B[12],xy=(31,1)),rb,edge=(0,0,0),shadow=(60,40,120))
    stamp(im,textmask("650 MB!",M[8],xy=(36,17)),lambda x,y:(170,210,255),edge=(10,0,40))
    d=ImageDraw.Draw(im); frame(d,(120,110,160),(30,20,60))
    return im
def cd_b(k,n=12):
    im,d=cv((20,20,30))
    # beige drive on left
    d.rectangle([2,6,34,24],fill=(205,198,170),outline=(90,85,70))
    d.line([(3,7),(33,7)],fill=(240,235,210)); d.line([(3,7),(3,23)],fill=(240,235,210))
    d.rectangle([4,13,32,15],fill=(40,40,40))
    d.rectangle([27,19,31,21],fill=(150,145,125),outline=(90,85,70)); d.point([(6,20)],fill=(0,255,0) if k%2 else (0,90,0))
    # tray sliding out with disc
    s=abs(((k%n)/n)*2-1)  # 0..1..0
    tx=int(8+s*0)
    disc(im,18,14,9,k,n,squash=1.0) if False else None
    out=int(4+ 10*min(1,2*abs(.5-k/n)))
    d.rectangle([4,15,4+out+14,17],fill=(30,30,30))
    disc(im,4+out+7,16,6,k,n,squash=2.2)
    def rb(x,y): return hsv((x+y)/50-k/n,.6,1)
    stamp(im,textmask("CD-ROM",C[11],xy=(39,2)),rb,edge=(0,0,0))
    stamp(im,textmask("MULTIMEDIA",C[7],xy=(38,17)),lambda x,y:(255,230,120),edge=(0,0,0))
    frame(d,(150,150,170),(60,60,80))
    return im

# ---------- HAVE A NICE DAY GOLD ----------
GOLDS=[(90,55,0),(170,115,0),(235,175,20),(255,220,80),(255,248,190)]
def gold_at(t): t=max(0,min(.999,t)); i=t*(len(GOLDS)-1); a=int(i); return lerp(GOLDS[a],GOLDS[a+1],i-a)
def smile(im,cx,cy,r,k,n,squash=1.0,wink=False):
    px=im.load()
    for x in range(W):
        for y in range(H):
            dx=(x-cx)/squash; dy=y-cy; rr=math.hypot(dx,dy)
            if rr<=r:
                l=(-dx*.6-dy*.8)/r
                c=gold_at(.55+.45*l - (.25 if rr>r-1.2 else 0))
                px[x,y]=c
    d=ImageDraw.Draw(im)
    ey=cy-5
    for ex,w in ((cx-4*squash,False),(cx+4*squash,wink)):
        ex=round(ex)
        if w: d.line([(ex-1,ey+3),(ex+1,ey+3)],fill=(50,25,0)); d.point([(ex-2,ey+2),(ex+2,ey+2)],fill=(50,25,0))
        elif squash>.5: d.rectangle([ex-1,ey,ex,ey+4],fill=(50,25,0))
        else: d.line([(ex,ey),(ex,ey+4)],fill=(50,25,0))
    for i in range(15):
        a=math.pi*(.15+.7*i/14); x=round(cx-7*squash*math.cos(a)); y=round(cy+1+6*math.sin(a))
        d.point([(x,y),(x,y-1)],fill=(50,25,0))
def nice_a(k,n=8):
    im,d=cv((40,20,0)); px=im.load()
    for x in range(W):
        for y in range(H):
            if (x+y)%2 and ((x//4+y//4)%2): px[x,y]=(55,30,0)
    smile(im,15,15,12,k,n,wink=(k in (5,6)))
    if k%4<2: d.point([(9,7)],fill=(255,255,255)); d.point([(8,7),(10,7),(9,6),(9,8)],fill=(255,250,200))
    stamp(im,textmask("HAVE A",B[9],xy=(33,2)),lambda x,y:gold_at(1-(y-2)/12),edge=(40,15,0))
    stamp(im,textmask("NICE DAY",B[10],xy=(31,14)),lambda x,y:gold_at(.95-(y-14)/14+ .25*math.sin((x-k*8)/6)),edge=(40,15,0),shadow=(20,8,0))
    frame(d,(255,220,80),(120,80,0))
    return im
def nice_b(k,n=12):
    im,d=cv((0,0,80)); px=im.load()
    r=random.Random(7)
    for _ in range(18):
        x,y=r.randrange(W),r.randrange(H)
        if (x+k)%3: px[x,y]=(255,230,120) if r.random()<.3 else (90,90,170)
    sq=abs(math.cos(k/n*2*math.pi))
    # coin rim
    for x in range(W):
        for y in range(H):
            dx=(x-15)/max(sq,.12); rr=math.hypot(dx,y-15)
            if rr<=13.5: px[x,y]=(130,85,0)
    smile(im,15,15,12,k,n,squash=max(sq,.12))
    stamp(im,textmask("HAVE A NICE",C[8],xy=(33,3)),lambda x,y:(255,255,255),edge=(0,0,40))
    stamp(im,textmask("DAY!",B[12],xy=(42,13)),lambda x,y:gold_at(1-(y-13)/14),edge=(60,30,0),shadow=(0,0,30))
    frame(d,(255,220,80),(0,0,150))
    return im

# ---------- VIRTUAL PET GOLDEN EGG ----------
def egg(im,cx,cy,k,gold=True):
    px=im.load()
    for x in range(W):
        for y in range(H):
            dx=(x-cx)/10.5; dy=(y-cy)/(13.5 if y<cy else 12.5); rr=math.hypot(dx*(1+.12*(y<cy)),dy)
            if rr<=1:
                l=(-dx*.5-dy*.8)
                px[x,y]=gold_at(.55+.4*l-(.3 if rr>.9 else 0))
def pet(d,x,y,k):
    hop=[0,1,0,1][k%4]
    body=[(1,0),(2,0),(3,0),(0,1),(1,1),(2,1),(3,1),(4,1),(0,2),(1,2),(2,2),(3,2),(4,2),(0,3),(1,3),(2,3),(3,3),(4,3),(1,4),(3,4)]
    for bx,by in body: d.point([(x+bx,y+by-hop)],fill=(30,40,30))
    d.point([(x+1,y+1-hop),(x+3,y+1-hop)],fill=(160,180,140))
def vpet_a(k,n=8):
    im,d=cv((50,30,0)); px=im.load()
    for x in range(W):
        for y in range(H):
            if (x//2+y//2+k)%7==0: px[x,y]=(70,45,0)
    egg(im,15,16,k)
    d.rectangle([9,8,21,19],fill=(70,60,20)); d.rectangle([10,9,20,18],fill=(160,180,140))
    for i in range(0,11,2): d.point([(10+i,9)],fill=(140,160,120))
    pet(d,13,12,k)
    if k%4==2: d.point([(18,10),(20,10),(19,11)],fill=(200,40,60))
    for i,x in enumerate((11,15,19)): d.ellipse([x-1,22,x+1,24],fill=(255,250,220) if k%4!=i else (255,180,60),outline=(120,80,0))
    d.ellipse([13,0,17,4],outline=(200,170,60))
    stamp(im,textmask("VIRTUAL",B[9],xy=(31,2)),lambda x,y:gold_at(1-(y-2)/12),edge=(30,15,0))
    heart=("PET <3","PET :3","PET <3","PET ^^")[k%4]
    stamp(im,textmask(heart,B[11],xy=(31,14)),lambda x,y:(255,250,220),edge=(110,60,0),shadow=(20,10,0))
    frame(d,(255,215,0),(110,70,0))
    return im
def vpet_b(k,n=8):
    im,d=cv((255,210,230)); px=im.load()
    for x in range(W):
        for y in range(H):
            if (x+y)%6==0: px[x,y]=(255,190,215)
    egg(im,72,16,k)
    d.rectangle([65,8,79,20],fill=(70,60,20)); d.rectangle([66,9,78,19],fill=(160,180,140))
    stage=k%8
    if stage<2:  # egg wobble
        d.ellipse([69+(stage%2),11,75+(stage%2),18],fill=(250,250,240),outline=(30,40,30))
    elif stage<4:
        d.ellipse([69,13,75,18],fill=(250,250,240),outline=(30,40,30)); d.line([(69,13),(71,15),(73,13),(75,15)],fill=(30,40,30))
    else: pet(d,70,12,k)
    for i,x in enumerate((68,72,76)): d.ellipse([x-1,22,x+1,24],fill=(255,250,220),outline=(120,80,0))
    stamp(im,textmask("VIRTUAL",B[10],xy=(4,1)),lambda x,y:(150,0,90),edge=(255,255,255))
    stamp(im,textmask("PET",B[12],xy=(6,14)),lambda x,y:gold_at(1-(y-14)/14),edge=(120,0,70))
    hx=34+ (k%2); d.text((hx,13),"♥",font=B[11],fill=(230,0,90))
    frame(d,(255,215,0),(200,80,140))
    return im

# ---------- COOL SITE! HOLO ----------
FIREPAL=[(0,0,0),(40,0,0),(110,10,0),(190,40,0),(240,100,0),(255,170,20),(255,230,80),(255,255,200)]
def fire_frames(n,seed=1):
    r=random.Random(seed); f=[[0]*W for _ in range(H)]; out=[]
    for step in range(n+40):
        for x in range(W): f[H-1][x]=7 if r.random()<.7 else 4
        for y in range(H-1):
            for x in range(W):
                sx=min(W-1,max(0,x+r.choice((-1,0,0,1))))
                v=f[y+1][sx]-(1 if r.random()<.55 else 0)
                f[y][x]=max(0,v)
        if step>=40: out.append([row[:] for row in f])
    return out
FIRE=None
def cool_a(k,n=12):
    global FIRE
    FIRE=FIRE or fire_frames(12)
    im,d=cv((0,0,0)); px=im.load(); ff=FIRE[k]
    for y in range(H):
        for x in range(W): px[x,y]=FIREPAL[min(7,ff[y][x]+ (1 if y>24 else 0))] if y>8 else FIREPAL[max(0,ff[y][x]-3)]
    def holo_fill(x,y): return lerp((255,255,255),hsv((x-y)/40-k/n,.6,1),.55)
    stamp(im,textmask("COOL SITE!",B[12],xy=(5,4)),holo_fill,edge=(150,0,0),shadow=(60,0,0))
    im=holo(im,k,n,strength=.35,seed=5,sparkles=2)
    d=ImageDraw.Draw(im); frame(d,(255,80,60),(120,0,0))
    return im
def cool_b(k,n=12):
    global FIRE
    FIRE=FIRE or fire_frames(12)
    im,d=cv((0,0,20)); px=im.load(); ff=FIRE[k]
    for y in range(14,H):
        for x in range(W):
            v=ff[y][x]
            if v>1: px[x,y]=lerp(FIREPAL[v],hsv((x/30)+k/n,.8,1),.45)
    for x in range(0,W,2):
        if (x+k)%6==0: px[x,2]=(255,255,255)
    def chrome(x,y): return lerp((255,255,255),(120,140,200),abs((y-4)/12-.4))
    stamp(im,textmask("COOL",C[13],xy=(5,2)),chrome,edge=(0,0,60),shadow=(255,0,150))
    stamp(im,textmask("SITE!",C[13],xy=(45,2)),lambda x,y:hsv((x+y)/45-k/n,.7,1),edge=(0,0,60),shadow=(0,200,255))
    im=holo(im,k,n,strength=.3,seed=9,sparkles=3)
    d=ImageDraw.Draw(im); frame(d,(255,80,60),(60,0,90))
    return im

SETS=[("lava-lamp-blacklight",lava_a,lava_b,12,150),("cd-rom-rainbow",cd_a,cd_b,12,80),("have-a-nice-day-gold",nice_a,nice_b,8,250),("virtual-pet-golden-egg",vpet_a,vpet_b,8,300)]
for name,a,b,n,ms in SETS:
    save([a(k,n) for k in range(n)],name+"-A",ms); save([b(k,n) for k in range(n)],name+"-B",ms)
