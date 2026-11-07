"""(v0.51.22, Nov 7 2026) Remade Beta rares: <name>-A.gif (new pictures of Be Kind Rewind, Hi-Speed Dubbing, Boom Box) and boom-box-B.gif (Boomin' Nite). Needs tools/remake_alpha_rares.py beside it."""
import sys; pass
import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"remake_alpha_rares.py")).read().split("# ---------- LAVA LAMP")[0])
import math
def reel(d,cx,cy,r,k,n,hub=(230,230,235),body=(30,30,34),spokes=3):
    d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=body,outline=(90,90,100))
    d.ellipse([cx-r+1.5,cy-r+1.5,cx+r-1.5,cy+r-1.5],fill=hub)
    a=k/n*2*math.pi
    for s in range(spokes):
        t=a+s*2*math.pi/spokes
        d.point([(round(cx+math.cos(t)*(r-2)),round(cy+math.sin(t)*(r-2)))],fill=body)
    d.point([(cx,cy)],fill=body)
def cassette(im,x,y,w,h,k,n,label=(240,235,220),stripe=None,shell=(40,40,46),speed=1,text=None):
    d=ImageDraw.Draw(im); d.fontmode="1"
    d.rectangle([x,y,x+w-1,y+h-1],fill=shell,outline=(110,110,120))
    d.line([(x+1,y+1),(x+w-2,y+1)],fill=(80,80,90))
    d.rectangle([x+2,y+2,x+w-3,y+h-6],fill=label)
    if stripe:
        for i,c in enumerate(stripe): d.line([(x+2,y+3+i),(x+w-3,y+3+i)],fill=c)
    wy=y+h//2+1; d.rectangle([x+w//2-9,wy-3,x+w//2+8,wy+3],fill=(20,20,24))
    reel(d,x+w//2-5,wy,3,k*speed,n); reel(d,x+w//2+5,wy,3,k*speed,n)
    d.polygon([(x+5,y+h-1),(x+8,y+h-5),(x+w-9,y+h-5),(x+w-6,y+h-1)],fill=(70,70,78))
    for hx in (x+11,x+w-12): d.point([(hx,y+h-3)],fill=(10,10,10))
    if text: stamp(im,textmask(text[0],text[1],xy=text[2]),lambda X,Y:text[3])

# ---- BE KIND REWIND ----
def bkr_a(k,n=12):
    im,d=cv((20,20,60)); px=im.load()
    for x in range(W):
        for y in range(H):
            if (x+y*2)%9==0: px[x,y]=(30,30,80)
    # VHS tape
    d.rectangle([2,3,61,27],fill=(22,22,26),outline=(90,90,100))
    d.rectangle([4,5,37,25],fill=(250,210,40)); d.rectangle([4,5,37,7],fill=(30,60,170))
    stamp(im,textmask("BE KIND",C[7],xy=(6,8)),lambda x,y:(30,60,170))
    stamp(im,textmask("REWIND!",C[7],xy=(5,16)),lambda x,y:(200,20,30))
    d.rectangle([40,9,59,21],fill=(10,10,12))
    pos=k/n  # rewinding: tape moves from right reel to left
    rl=2+int(3*pos); rr=5-int(3*pos)
    d.ellipse([45-rl,15-rl,45+rl,15+rl],fill=(60,40,30)); d.ellipse([54-rr,15-rr,54+rr,15+rr],fill=(60,40,30))
    reel(d,45,15,2,-k*2,n,hub=(220,220,225),body=(60,40,30)); reel(d,54,15,2,-k*2,n,hub=(220,220,225),body=(60,40,30))
    d.rectangle([40,22,59,24],fill=(40,40,46))
    # OSD
    on=k%4<2
    if on: stamp(im,textmask("◀◀",B[8],xy=(67,4)),lambda x,y:(255,255,255),edge=(0,0,0))
    t=max(0,59-k*5); stamp(im,textmask("0:%02d"%t,M[8],xy=(64,17)),lambda x,y:(120,255,160),edge=(0,0,0))
    frame(d,(250,210,40),(30,60,170)); return im
def bkr_b(k,n=12):
    im,d=cv((0,0,0)); px=im.load()
    # CRT blue screen with OSD
    for x in range(2,W-2):
        for y in range(2,H-2):
            px[x,y]=(10,30,170) if y%2 else (16,40,190)
    band=(k*3)%40-6
    for x in range(2,W-2):
        for y in range(max(2,band),min(H-2,band+3)):
            if random.Random(x*7+y+k).random()<.5: px[x,y]=(200,200,230)
    stamp(im,textmask("◀◀",B[10],xy=(5,3)),lambda x,y:(255,255,255),edge=(0,0,60))
    stamp(im,textmask("REWIND",M[9],xy=(22,4)),lambda x,y:(255,255,255),edge=(0,0,60))
    stamp(im,textmask("PLEASE",C[7],xy=(5,17)),lambda x,y:(255,240,120),edge=(0,0,60))
    # sticker
    d.ellipse([47,13,85,29],fill=(250,210,40),outline=(160,40,20))
    stamp(im,textmask("BE KIND!",C[7],xy=(52,16)),lambda x,y:(160,20,20))
    d.rectangle([0,0,W-1,H-1],outline=(60,60,70)); d.rectangle([1,1,W-2,H-2],outline=(25,25,30))
    return im

# ---- HI-SPEED DUBBING ----
def brushed(im,col=(178,180,188)):
    px=im.load(); r=random.Random(4)
    for y in range(H):
        for x in range(W):
            v=r.randint(-10,10)+(6 if y%3==0 else 0); px[x,y]=tuple(max(0,min(255,c+v)) for c in col)
def hsd_a(k,n=12):
    im,d=cv((0,0,0)); brushed(im); d=ImageDraw.Draw(im); d.fontmode="1"
    for x0 in (3,46):
        d.rectangle([x0,3,x0+38,19],fill=(20,20,24),outline=(90,90,100))
        cassette(im,x0+3,5,33,13,k,n,label=(230,225,210),stripe=[(220,40,40),(240,160,30)],speed=2 if x0>10 else 2)
    for i in range(3):
        ax=41+((k+i*2)%6)-1
        d.point([(ax,10),(ax+1,11),(ax,12)],fill=(255,80,40))
    for i,x0 in enumerate((4,46)):
        for b in range(8):
            lv=int(4+3*math.sin(k*1.3+b*.9+i))
            c=(60,220,80) if b<5 else (240,200,40) if b<7 else (240,50,40)
            if b<lv: d.rectangle([x0+b*3,22,x0+b*3+1,23],fill=c)
            else: d.rectangle([x0+b*3,22,x0+b*3+1,23],fill=(50,50,55))
    stamp(im,textmask("HI-SPEED",C[7],xy=(32,22)),lambda x,y:(20,20,30))
    stamp(im,textmask("DUB",B[7],xy=(68,22)),lambda x,y:(200,30,30) if k%4<2 else (90,20,20))
    d.rectangle([0,0,W-1,H-1],outline=(80,80,90)); d.line([(1,1),(W-2,1)],fill=(235,235,240)); return im
def hsd_b(k,n=12):
    im,d=cv((15,10,30))
    cassette(im,2,4,30,18,k,n,label=(240,90,170),speed=3)
    cassette(im,56,4,30,18,k,n,label=(80,220,240),speed=3)
    for x in range(32,56):
        y=12+int(2*math.sin((x-k*3)/2.5))
        d.point([(x,y)],fill=(100,60,40))
        if (x-k*3)%8==0: d.point([(x,y-1),(x,y+1)],fill=(255,240,120))
    stamp(im,textmask("HI-SPEED DUBBING",C[7],xy=(6,23)),lambda x,y:hsv((x-k*4)/60,.6,1),edge=(0,0,0))
    frame(d,(160,120,255),(40,20,80)); return im

# ---- BOOM BOX ----
def boombox(im,k,n,x,y,w,h,body=(205,205,215),accent=(255,60,160)):
    d=ImageDraw.Draw(im)
    d.rectangle([x+w//2-14,y-3,x+w//2+14,y],outline=(140,140,150)); d.line([(x+w-6,y),(x+w+2,y-8)],fill=(170,170,180))
    d.rectangle([x,y,x+w-1,y+h-1],fill=body,outline=(70,70,80))
    d.line([(x+1,y+1),(x+w-2,y+1)],fill=(245,245,250)); d.line([(x+1,y+h-2),(x+w-2,y+h-2)],fill=(140,140,150))
    beat=1 if k%4 in (0,1) else 0
    for cx in (x+8,x+w-9):
        r=6+beat
        d.ellipse([cx-r,y+h//2-r,cx+r,y+h//2+r],fill=(40,40,46),outline=(20,20,22))
        d.ellipse([cx-3,y+h//2-3,cx+3,y+h//2+3],fill=(90,90,100)); d.point([(cx-1,y+h//2-1)],fill=(200,200,210))
    mx=x+w//2
    d.rectangle([mx-10,y+3,mx+9,y+10],fill=(30,30,36)); d.rectangle([mx-9,y+4,mx+8,y+9],fill=(220,215,200))
    reel(d,mx-4,y+6,2,k*2,n); reel(d,mx+4,y+6,2,k*2,n)
    for b in range(7):
        lv=int(2+2*abs(math.sin(k*1.1+b)))
        for j in range(lv): d.point([(mx-8+b*2+1,y+h-4-j)],fill=accent if j>1 else (80,255,120))
def bb_a(k,n=16):
    im,d=cv((255,90,170)); px=im.load()
    for x in range(W):
        for y in range(H):
            if (x+y)%4==0: px[x,y]=(255,130,200)
    boombox(im,k,n,13,8,62,20)
    d=ImageDraw.Draw(im); d.fontmode="1"
    for i,(nx,ph) in enumerate(((3,0),(78,5))):
        yy=18-((k+ph)%16)
        if 2<yy<26: d.text((nx,yy),"♪" if i%2 else "♫",font=B[9],fill=(255,255,255))
    frame(d,(255,255,255),(200,30,120)); return im
def bb_b(k,n=16):
    im,d=cv((10,0,30)); px=im.load()
    for x in range(W):
        for y in range(H):
            if y>22 and (x//4+y//2+k)%2: px[x,y]=(60,0,90) if (x//4)%2 else (0,60,90)
    beat=k%4<2
    for r in ((6,10,14) if beat else (8,12,16)):
        d.arc([44-r-20,16-r,44+r+20,16+r],200,340,fill=(80,30,140))
    boombox(im,k,n,15,10,58,18,body=(40,40,48),accent=(0,255,240))
    stamp(im,textmask("BOOM",C[8],xy=(2,0)),lambda x,y:(255,240,80),edge=(120,0,90))
    stamp(im,textmask("BOX",C[8],xy=(70,0)),lambda x,y:(255,240,80),edge=(120,0,90))
    d=ImageDraw.Draw(im); frame(d,(0,255,240),(80,0,120)); return im

SETS=[("be-kind-rewind",bkr_a,bkr_b,12,140),("hi-speed-dubbing",hsd_a,hsd_b,12,100),("boom-box",bb_a,bb_b,16,120)]
for name,a,b,n,ms in SETS:
    save([a(k,n) for k in range(n)],name+"-A",ms); save([b(k,n) for k in range(n)],name+"-B",ms)
