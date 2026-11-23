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
- 색은 시트 전체에서 48색으로 정리한다(시트 안 캐릭터끼리 팔레트 공유, 디더 없음).
- 스프라이트 아래 끝(카운터에 올린 손)을 장면의 COUNTER_Y에 맞추고 가로 중앙(CUSTOMER_X)에 둔다.
"""
import json, os
from collections import deque
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = os.path.join(ROOT, 'docs/concept/sheets')
OUT = os.path.join(ROOT, 'public/art/customers')
SCALE = 0.15          # 시트 1344px → 약 200px. 머리~허리가 장면에서 약 80px
COUNTER_Y = 132
CUSTOMER_X = 160
HANDS_ROWS = 10       # 아래 10줄(카운터 위 손)은 숨쉴 때 움직이지 않는다
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


def fill_holes(keep, w, h):
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
    return {(x, y) for y in range(h) for x in range(w) if (x, y) not in outside}


def process_sheet(key, ids, manifest):
    opened = Image.open(os.path.join(SHEETS, f'sheet-{key}-open.png')).convert('RGB')
    size = (round(opened.width * SCALE), round(opened.height * SCALE))
    small = opened.resize(size, Image.BOX)
    pal = small.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = pal.convert('RGB')
    closed_path = os.path.join(SHEETS, f'sheet-{key}-closed.png')
    qc = None
    if os.path.exists(closed_path):
        closed = Image.open(closed_path).convert('RGB').resize(size, Image.BOX)
        qc = closed.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
    w, h = size
    alpha_path = os.path.join(SHEETS, f'sheet-{key}-alpha.png')
    if os.path.exists(alpha_path):
        ap = Image.open(alpha_path).convert('L').resize(size, Image.BOX).load()
        mask = [[ap[x, y] >= 128 for x in range(w)] for y in range(h)]
    else:
        mask = mask_of(small, bg_color(small))
    col = w / len(ids)
    for i, cid in enumerate(ids):
        x0, x1 = int(i * col), int((i + 1) * col)
        comps = sorted(components(mask, w, h, x0, x1), key=len, reverse=True)
        keep = {p for c in comps if len(c) >= 0.2 * len(comps[0]) for p in c}
        keep = fill_holes(keep, w, h)
        xs = [x for x, _ in keep]; ys = [y for _, y in keep]
        bx0, by0, bx1, by1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
        sw, sh = bx1 - bx0, by1 - by0
        sprite = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
        blink = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
        sp, bp, qp = sprite.load(), blink.load(), q.load()
        qcp = qc.load() if qc else None
        blink_px = 0
        for x, y in keep:
            sp[x - bx0, y - by0] = qp[x, y] + (255,)
            # 깜빡임: 눈 높이(위 15~45%)에서 크게 달라진 픽셀만. 미세한 색 차이는 무시해 머리카락이 떨리지 않게 한다
            if qcp and cid not in NO_BLINK and sh * 0.15 < (y - by0) < sh * 0.45 and sum(abs(qcp[x, y][k] - qp[x, y][k]) for k in range(3)) > 90:
                bp[x - bx0, y - by0] = qcp[x, y] + (255,)
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
