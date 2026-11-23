"""캐릭터 시트에서 손님 스프라이트와 눈 깜빡임 프레임을 만든다.

입력: docs/concept/sheets/sheet-<x>-open.png  (4명이 한 줄, 평평한 회색 배경, 1344x752)
      docs/concept/sheets/sheet-<x>-closed.png (같은 시트, 눈만 감음. 없으면 깜빡임 없음)
      docs/concept/sheets/sheet-<x>-alpha.png  (힉스필드 배경 제거 결과의 알파. 없으면 배경색으로 분리)
출력: public/art/customers/<id>.png         게임 해상도 스프라이트
      public/art/customers/<id>.blink.png   눈 감은 프레임에서 달라진 픽셀만 (투명 바탕)
      public/art/customers/manifest.json    장면 좌표와 숨쉬기 분할선

규칙
- 모든 시트를 같은 배율(SCALE)로 줄인다 → 손님마다 도트 밀도와 머리 크기가 같다.
- 배경색에서 먼 픽셀을 캐릭터로 보고, 열(column)별 가장 큰 덩어리만 남긴 뒤 안쪽 구멍을 채운다.
- 색은 매장 팔레트(Dusk Mono 24)에 Lab 거리로 맞춘다. 그래야 배경과 같은 색·같은 또렷함으로 섞인다.
- 바깥 테두리는 한 단계 어두운 색(sel-out)으로 둘러 배경 물체와 같은 외곽 처리를 한다.
- 스프라이트 아래 끝(카운터에 올린 손)을 장면의 COUNTER_Y에 맞추고 가로 중앙(CUSTOMER_X)에 둔다.
"""
import json, math, os, re
from collections import deque
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- 매장 팔레트(Dusk Mono 24)에 맞추기: Lab 거리, 포인트 색은 원본 채도가 충분할 때만, 고립 잡티 제거, 바깥 테두리 한 단계 어둡게(sel-out)
pal=re.findall(r"'?([\w-]+)'?: '#([0-9a-f]{6})'", open(os.path.join(ROOT, 'src/render/palette.ts')).read())
cols={k:tuple(int(h[i:i+2],16) for i in (0,2,4)) for k,h in pal}
def lab(c):
    def f(u):
        u/=255; return ((u+0.055)/1.055)**2.4 if u>0.04045 else u/12.92
    r,g,b=map(f,c)
    X=(0.4124*r+0.3576*g+0.1805*b)/0.95047; Y=0.2126*r+0.7152*g+0.0722*b; Z=(0.0193*r+0.1192*g+0.9505*b)/1.08883
    g2=lambda t: t**(1/3) if t>0.008856 else 7.787*t+16/116
    return (116*g2(Y)-16, 500*(g2(X)-g2(Y)), 200*(g2(Y)-g2(Z)))
L={k:lab(v) for k,v in cols.items()}
ACCENT={k for k in cols if k.split('-')[0] in ('rose','brass','steel','wine')}
memo={}
def nearest(c, chroma_min=14):
    if c in memo: return memo[c]
    lc=lab(c); chroma=math.hypot(lc[1],lc[2])
    cand=[k for k in L if chroma>=chroma_min or k not in ACCENT]
    best=min(cand,key=lambda k:(lc[0]-L[k][0])**2*1.0+(lc[1]-L[k][1])**2+(lc[2]-L[k][2])**2)
    memo[c]=best; return best
DARK={'paper':'bone','bone':'ash','ash':'mist','mist':'stone','stone':'dusk','dusk':'shadow','shadow':'ink','ink':'ink','skin-c':'skin-a','skin-a':'skin-b','skin-b':'stone','hair':'ink','rose':'rose-dark','rose-light':'rose','rose-dark':'wine-dark','taupe':'stone','brass':'brass-dark','brass-light':'brass','brass-dark':'shadow','steel':'steel-dark','steel-light':'steel','steel-dark':'dusk','wine':'wine-dark','wine-dark':'ink'}
def convert(rgb, mask, x0, x1, selout=True):
    w,h=rgb.size; ip=rgb.load(); keys={}
    for y in range(h):
        for x in range(x0,x1):
            if mask[y][x]: keys[(x,y)]=nearest(ip[x,y])
    # 고립 잡티 제거: 4방향 이웃이 모두 다른 키면 가장 많은 이웃 키로
    for (x,y),k in list(keys.items()):
        nb=[keys.get((x+dx,y+dy)) for dx,dy in((1,0),(-1,0),(0,1),(0,-1))]
        nb=[n for n in nb if n]
        if len(nb)>=3 and k not in nb:
            keys[(x,y)]=max(set(nb),key=nb.count)
    if selout:
        out={}
        for (x,y),k in keys.items():
            edge=any((x+dx,y+dy) not in keys for dx,dy in((1,0),(-1,0),(0,1),(0,-1)))
            out[(x,y)]=DARK[k] if edge else k
        keys=out
    return keys

SHEETS = os.path.join(ROOT, 'docs/concept/sheets')
OUT = os.path.join(ROOT, 'public/art/customers')
# 손님은 장면(320×180)의 2배 촘촘한 화면 해상도(640×360)로 그린다. 장면 해상도로 줄이면 눈·코·입이 1~2도트가 되어 사라진다.
DENSITY = 2
SCALE = 0.15 * DENSITY  # 시트 1344px → 약 400px. 머리~허리가 화면에서 약 160px(장면 기준 80px)
COUNTER_Y = 132 * DENSITY
CUSTOMER_X = 160 * DENSITY
HANDS_ROWS = 10 * DENSITY  # 카운터 위 손은 숨쉴 때 움직이지 않는다
SHEET_IDS = {
    'a': ['hanyeoreum', 'kang', 'jin', 'oh'],
    'b': ['cha', 'park', 'yoon', 'seojin'],
    'c': ['marsh', 'faceless', 'baek', 'actor'],
}
NO_BLINK = {'marsh', 'faceless', 'actor'}  # 마시: 눈꺼풀이 없다. 얼굴 없는 여자·가면 배우: 눈이 안 보인다


def bg_color(im):
    px = im.load()
    corners = [px[2, 2], px[im.width - 3, 2], px[2, im.height - 3], px[im.width - 3, im.height - 3]]
    return tuple(sorted(c[i] for c in corners)[1] for i in range(3))


def mask_of(im, bg, tol=26):
    w, h = im.size
    px = im.load()
    return [[max(abs(px[x, y][i] - bg[i]) for i in range(3)) > tol for x in range(w)] for y in range(h)]


def components(mask, w, h, x0, x1):
    seen = set()
    comps = []
    for y in range(h):
        for x in range(x0, x1):
            if mask[y][x] and (x, y) not in seen:
                q = deque([(x, y)]); seen.add((x, y)); comp = []
                while q:
                    cx, cy = q.popleft(); comp.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if x0 <= nx < x1 and 0 <= ny < h and mask[ny][nx] and (nx, ny) not in seen:
                            seen.add((nx, ny)); q.append((nx, ny))
                comps.append(comp)
    return comps


def fill_holes(keep, w, h, max_hole=120):
    outside = set()
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if (x, y) not in keep: outside.add((x, y)); q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if (x, y) not in keep and (x, y) not in outside: outside.add((x, y)); q.append((x, y))
    while q:
        cx, cy = q.popleft()
        for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in keep and (nx, ny) not in outside:
                outside.add((nx, ny)); q.append((nx, ny))
    # 바깥과 이어지지 않은 빈칸 중 작은 것(옷 사이 틈 등)만 채운다. 큰 빈칸은 배경이 맞다.
    holes = {(x, y) for y in range(h) for x in range(w) if (x, y) not in outside and (x, y) not in keep}
    filled = set(keep)
    seen = set()
    for p in holes:
        if p in seen: continue
        q = deque([p]); seen.add(p); comp = [p]
        while q:
            cx, cy = q.popleft()
            for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if n in holes and n not in seen: seen.add(n); q.append(n); comp.append(n)
        if len(comp) <= max_hole: filled.update(comp)
    return filled


def despeckle(keys, passes=2):
    """4방향 이웃 중 3개 이상이 같은 키인데 자기만 다르면 그 키로 바꾼다."""
    for _ in range(passes):
        nxt = dict(keys)
        for (x, y), k in keys.items():
            nb = [keys.get((x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            nb = [n for n in nb if n]
            if nb:
                top = max(set(nb), key=nb.count)
                if top != k and nb.count(top) >= 3:
                    nxt[(x, y)] = top
        keys = nxt
    return keys


def convert_limited(img, mask, x0, x1, allowed=None, max_keys=12):
    """팔레트 매핑 후, 캐릭터에서 많이 쓰인 키 max_keys개만 남겨 다시 매핑한다(드문 색 얼룩 제거).
    눈 감은 프레임은 열린 프레임의 키 집합(allowed)을 그대로 써서 색이 어긋나지 않게 한다."""
    w, h = img.size
    ip = img.load()
    raw = {(x, y): nearest(ip[x, y]) for y in range(h) for x in range(x0, x1) if mask[y][x]}
    if allowed is None:
        counts = {}
        for k in raw.values(): counts[k] = counts.get(k, 0) + 1
        allowed = sorted(counts, key=counts.get, reverse=True)[:max_keys]
    keys = {}
    for (x, y), k in raw.items():
        if k in allowed:
            keys[(x, y)] = k
        else:
            lc = lab(ip[x, y])
            keys[(x, y)] = min(allowed, key=lambda a: sum((lc[i] - L[a][i]) ** 2 for i in range(3)))
    keys = despeckle(keys)
    out = {}
    for (x, y), k in keys.items():
        edge = any((x + dx, y + dy) not in keys for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        out[(x, y)] = DARK[k] if edge else k
    return out, allowed


def process_sheet(key, ids, manifest):
    opened = Image.open(os.path.join(SHEETS, f'sheet-{key}-open.png')).convert('RGB')
    size = (round(opened.width * SCALE), round(opened.height * SCALE))
    small = opened.resize(size, Image.BOX)
    closed_path = os.path.join(SHEETS, f'sheet-{key}-closed.png')
    small_closed = Image.open(closed_path).convert('RGB').resize(size, Image.BOX) if os.path.exists(closed_path) else None
    w, h = size
    alpha_path = os.path.join(SHEETS, f'sheet-{key}-alpha.png')
    if os.path.exists(alpha_path):
        ap = Image.open(alpha_path).convert('L').resize(size, Image.BOX).load()
        color_mask = mask_of(small, bg_color(small), tol=18)
                # 알파가 확실하면 캐릭터. 애매한 가장자리(96~230)는 시트 배경색과 달라야 캐릭터로 본다
        mask = [[ap[x, y] > 230 or (ap[x, y] >= 96 and color_mask[y][x]) for x in range(w)] for y in range(h)]
    else:
        mask = mask_of(small, bg_color(small))
    col = w / len(ids)
    for i, cid in enumerate(ids):
        x0, x1 = int(i * col), int((i + 1) * col)
        comps = sorted(components(mask, w, h, x0, x1), key=len, reverse=True)
        keep = {p for c in comps if len(c) >= 0.2 * len(comps[0]) for p in c}
        keep = fill_holes(keep, w, h)
        cmask = [[(x, y) in keep for x in range(w)] for y in range(h)]
        keys, allowed = convert_limited(small, cmask, x0, x1)
        ckeys = convert_limited(small_closed, cmask, x0, x1, allowed)[0] if small_closed and cid not in NO_BLINK else None
        xs = [x for x, _ in keys]; ys = [y for _, y in keys]
        bx0, by0, bx1, by1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
        sw, sh = bx1 - bx0, by1 - by0
        sprite = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
        blink = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
        sp, bp = sprite.load(), blink.load()
        blink_px = 0
        for (x, y), k in keys.items():
            sp[x - bx0, y - by0] = cols[k] + (255,)
            # 깜빡임: 눈 높이(위 15~45%)에서 팔레트 키가 바뀐 픽셀만
            if ckeys and sh * 0.15 < (y - by0) < sh * 0.45 and ckeys.get((x, y), k) != k:
                bp[x - bx0, y - by0] = cols[ckeys[(x, y)]] + (255,)
                blink_px += 1
        sprite.save(os.path.join(OUT, f'{cid}.png'))
        entry = {'x': CUSTOMER_X - sw // 2, 'y': COUNTER_Y + 2 - sh, 'w': sw, 'h': sh,
                 'breathSplit': sh - HANDS_ROWS, 'blink': False}
        if blink_px:
            blink.save(os.path.join(OUT, f'{cid}.blink.png'))
            entry['blink'] = True
        manifest[cid] = entry
        print(cid, entry, 'blink px', blink_px)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    manifest = {}
    for key, ids in SHEET_IDS.items():
        process_sheet(key, ids, manifest)
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
