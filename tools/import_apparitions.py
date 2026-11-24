"""새벽 괴현상 그림(힉스필드 시트)을 게임 도트로 들여온다.

입력: docs/concept/sheets/horror-<a|b>-open.png  (4칸 한 줄, 평평한 회색 배경)
      docs/concept/sheets/horror-<a|b>-alpha.png (배경 제거 결과의 알파)
      docs/concept/sheets/horror-<a|b>-closed.png (같은 시트, 눈만 감음)
출력: public/art/apparitions/<kind>.png, manifest.json (화면 좌표: 640×360 캔버스 기준)
      눈 종류는 <kind>.lid1.png(반쯤 감김), <kind>.lid2.png(감김): 눈 부분만 있는 덧그림(투명 바탕)

손님 스프라이트와 같은 처리(tools/import_customer_sprites.py의 팔레트 맞추기·색 수 제한·외곽 sel-out)를 쓴다.
그래서 그림체·도트 밀도·색이 손님·장면과 같다. 크기는 장면 소품에 맞춘 목표 크기로 줄인다.
"""
import importlib.util
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('cust', os.path.join(ROOT, 'tools/import_customer_sprites.py'))
cust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cust)

SHEETS = os.path.join(ROOT, 'docs/concept/sheets')
OUT = os.path.join(ROOT, 'public/art/apparitions')

# 시트·칸 → 이름, 목표 크기(가로·세로 최대, 화면 px), 장면에 붙는 자리(화면 px)와 기준점
# anchor: 'center' | 'bottom' (아래 가운데) | 'top' (위 가운데)
ITEMS = {
    ('a', 0): dict(kind='doorGapEyes', box=(30, 88), at=(607, 128), anchor='center', vcrop=(0.26, 0.68), thr=110),  # 오른쪽 문짝 유리 한 칸(30×88)에 맞춘다. 얼굴·눈이 있는 가운데만   # 출입문 두 짝 사이 틈
    ('a', 1): dict(kind='hallHand', box=(30, 52), at=(588, 240), anchor='bottom'),       # 문 앞 바닥에서 올라온 손
    ('a', 2): dict(kind='shelfFingers', box=(34, 16), at=(356, 108), anchor='bottom'),   # 맨 위 선반 가장자리
    ('a', 3): dict(kind='mirrorFace', box=(62, 84), at=(46, 112), anchor='center'),      # 거울 유리에 붙은 얼굴
    ('b', 0): dict(kind='mirrorFigure', box=(48, 150), at=(46, 240), anchor='bottom'),   # 거울 안에 선 사람
    ('b', 1): dict(kind='giantEye', box=(130, 70), at=(216, 46), anchor='center'),       # 벽 위 거대한 눈 (두 번 그린다)
    ('b', 2): dict(kind='eyesMany', box=(54, 84), at=(462, 58), anchor='center'),        # 선반 끝과 문 사이 벽
    ('b', 3): dict(kind='blood', box=(40, 110), at=(196, 26), anchor='top', thr=50),  # 얇은 줄기를 살리려고 문턱값을 낮춘다             # 벽을 타고 흘러내리는 피
}


# 눈꺼풀: 눈 감은 시트에서 눈 부분만 잘라 덧그림으로 만든다.
# 눈 상자(그림 크기에 대한 비율). None이면 열린 그림의 밝은 덩어리(흰자·홍채)를 눈으로 찾는다.
# 감은 시트는 다시 그린 그림이라 머리카락 같은 다른 곳도 미세하게 다르다. 그래서 눈 상자 밖은 버린다.
LIDS = {
    'giantEye': [(0.0, 0.0, 1.0, 1.0)],
    'eyesMany': None,
}
# 완전히 감길 때는 그림 전체를 감은 그림으로 (작은 눈 하나라도 남지 않게). 반쯤은 눈 상자마다.
LID_FULL_WHOLE = {'eyesMany'}


def eye_boxes(keys, w, h):
    """밝은 픽셀(흰자·홍채) 덩어리마다 상자 하나. 어두운 살덩이 속 눈을 찾는다."""
    light = {p for p, k in keys.items() if cust.L[k][0] > 30}
    seen, boxes = set(), []
    for p0 in light:
        if p0 in seen: continue
        stack, blob = [p0], []
        seen.add(p0)
        while stack:
            x, y = stack.pop(); blob.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in light and n not in seen: seen.add(n); stack.append(n)
        if len(blob) < 2: continue
        xs = [x for x, _ in blob]; ys = [y for _, y in blob]
        # 눈꺼풀이 흰자 위아래로 조금 더 덮는다
        boxes.append(((min(xs) - 2) / w, (min(ys) - 3) / h, (max(xs) + 3) / w, (max(ys) + 3) / h))
    return boxes


def lid_frames(keys, ckeys, boxes, w, h):
    """감김(2): 눈 상자 안에서 감은 그림과 다른 픽셀. 반쯤(1): 상자마다 위쪽 절반만 + 그 아래 끝에 눈꺼풀 선."""
    full, half = {}, {}
    for (fx0, fy0, fx1, fy1) in boxes:
        x0, y0 = max(0, round(fx0 * w)), max(0, round(fy0 * h))
        x1, y1 = min(w, round(fx1 * w)), min(h, round(fy1 * h))
        changed = {(x, y): ckeys[(x, y)] for y in range(y0, y1) for x in range(x0, x1)
                   if (x, y) in keys and (x, y) in ckeys and ckeys[(x, y)] != keys[(x, y)]}
        if not changed: continue
        full.update(changed)
        ys = [y for _, y in changed]
        cy0, cy1 = min(ys), max(ys)
        mid = cy0 + (cy1 - cy0) * 0.5
        # 눈꺼풀 선: 감은 그림의 이 상자 안에서 가장 어두운 색
        line = min({k for k in changed.values()}, key=lambda k: cust.L[k][0])
        for (x, y), k in changed.items():
            if y < mid: half[(x, y)] = k
        edge = int(mid)
        # 선은 눈이 뚫린 폭(열린 그림의 밝은 픽셀)만큼만: 눈 밖 피부까지 줄이 그어지지 않게
        lit = [x for x in range(x0, x1) for y in (edge - 1, edge, edge + 1)
               if (x, y) in keys and cust.L[keys[(x, y)]][0] > 30]
        lx0, lx1 = (min(lit), max(lit) + 1) if lit else (x0, x1)
        for x in range(lx0, lx1):
            if (x, edge) in changed or (x, edge) in half:
                half[(x, edge)] = line
    return full, half


def element_boxes(img, alpha, n=4):
    """칸을 나누지 않고 덩어리를 찾는다: 알파가 있거나 배경 회색과 색이 확실히 다른 픽셀.
    (배경 제거기가 빨간 핏자국을 배경으로 지워 버려서 색 기준을 함께 쓴다.) 큰 덩어리 n개를 왼쪽부터."""
    sc = 4  # 1/4로 줄여서 찾는다
    small = img.resize((img.width // sc, img.height // sc), Image.BOX)
    sa = alpha.resize(small.size, Image.BOX)
    bg = cust.bg_color(small)
    w, h = small.size
    ip, ap = small.load(), sa.load()
    on = [[ap[x, y] > 128 or max(abs(ip[x, y][i] - bg[i]) for i in range(3)) > 40 for x in range(w)] for y in range(h)]
    comps = sorted(cust.components(on, w, h, 0, w), key=len, reverse=True)[:n]
    boxes = []
    for c in comps:
        xs = [x for x, _ in c]; ys = [y for _, y in c]
        boxes.append((min(xs) * sc, min(ys) * sc, (max(xs) + 1) * sc, (max(ys) + 1) * sc))
    return sorted(boxes, key=lambda b: b[0])


def element_mask(crop, a):
    """알파 + 배경과 다른 색 (핏자국처럼 알파에서 빠진 것도 살린다)"""
    bg = cust.bg_color(crop)
    ip, ap = crop.load(), a.load()
    return lambda x, y: ap[x, y] > 140 or max(abs(ip[x, y][i] - bg[i]) for i in range(3)) > 46


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for key in ('a', 'b'):
        img = Image.open(os.path.join(SHEETS, f'horror-{key}-open.png')).convert('RGB')
        alpha = Image.open(os.path.join(SHEETS, f'horror-{key}-alpha.png')).convert('L')
        boxes = element_boxes(img, alpha)
        cpath = os.path.join(SHEETS, f'horror-{key}-closed.png')
        closed = Image.open(cpath).convert('RGB') if os.path.exists(cpath) else None
        for i, bb in enumerate(boxes):
            item = ITEMS[(key, i)]
            pad = 6
            bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(img.width, bb[2] + pad), min(img.height, bb[3] + pad))
            if 'vcrop' in item:
                t0, t1 = item['vcrop']
                hh = bb[3] - bb[1]
                bb = (bb[0], bb[1] + int(hh * t0), bb[2], bb[1] + int(hh * t1))
            crop = img.crop(bb)
            a = alpha.crop(bb)
            # 알파에서 빠진 부분(핏자국)도 살린 알파를 다시 만든다
            keep = element_mask(crop, a)
            if item['kind'] == 'blood':
                # 핏자국: 붉은 픽셀만 (반투명 가장자리가 점처럼 흩어지지 않게)
                cp = crop.load()
                keep = lambda x, y, cp=cp: cp[x, y][0] - max(cp[x, y][1], cp[x, y][2]) > 38
            a = Image.new('L', crop.size)
            apx = a.load()
            for yy in range(crop.height):
                for xx in range(crop.width):
                    if keep(xx, yy): apx[xx, yy] = 255
            bw, bh = item['box']
            s = min(bw / crop.width, bh / crop.height)
            size = (max(1, round(crop.width * s)), max(1, round(crop.height * s)))
            small = crop.resize(size, Image.BOX)
            sa = a.resize(size, Image.BOX)
            w, h = size
            ap = sa.load()
            thr = item.get('thr', 140)
            mask = [[ap[x, y] > thr for x in range(w)] for y in range(h)]
            keys, allowed = cust.convert_limited(small, mask, 0, w, max_keys=10)

            def save(px, name):
                out = Image.new('RGBA', size, (0, 0, 0, 0))
                op = out.load()
                for (x, y), k in px.items():
                    op[x, y] = cust.cols[k] + (255,)
                out.save(os.path.join(OUT, name))

            save(keys, f"{item['kind']}.png")
            ax, ay = item['at']
            x = ax - w // 2
            y = ay - h // 2 if item['anchor'] == 'center' else (ay - h if item['anchor'] == 'bottom' else ay)
            manifest[item['kind']] = {'x': x, 'y': y, 'w': w, 'h': h}
            if item['kind'] in LIDS and closed is not None:
                # 같은 자리·같은 크기·같은 색 집합으로 감은 그림을 줄인다 (색이 어긋나지 않게)
                csmall = closed.crop(bb).resize(size, Image.BOX)
                ckeys, _ = cust.convert_limited(csmall, mask, 0, w, allowed)
                boxes = LIDS[item['kind']] or eye_boxes(keys, w, h)
                full, half = lid_frames(keys, ckeys, boxes, w, h)
                if item['kind'] in LID_FULL_WHOLE:
                    full = {p: k for p, k in ckeys.items() if keys.get(p) != k}
                save(half, f"{item['kind']}.lid1.png")
                save(full, f"{item['kind']}.lid2.png")
                manifest[item['kind']]['lids'] = True
                print('  lids', len(boxes), 'eyes', len(half), len(full), 'px')
            print(item['kind'], manifest[item['kind']])
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
