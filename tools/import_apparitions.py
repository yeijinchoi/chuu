"""새벽 괴현상 그림(힉스필드 시트)을 게임 도트로 들여온다.

입력: docs/concept/sheets/horror-<a|b>-open.png  (4칸 한 줄, 평평한 회색 배경)
      docs/concept/sheets/horror-<a|b>-alpha.png (배경 제거 결과의 알파)
출력: public/art/apparitions/<kind>.png, manifest.json (화면 좌표: 640×360 캔버스 기준)

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
    ('a', 0): dict(kind='doorGapEyes', box=(34, 120), at=(590, 132), anchor='center', vcrop=(0.24, 0.70), thr=110),  # 얼굴·눈이 있는 가운데만   # 출입문 두 짝 사이 틈
    ('a', 1): dict(kind='hallHand', box=(30, 52), at=(588, 240), anchor='bottom'),       # 문 앞 바닥에서 올라온 손
    ('a', 2): dict(kind='shelfFingers', box=(34, 16), at=(356, 108), anchor='bottom'),   # 맨 위 선반 가장자리
    ('a', 3): dict(kind='mirrorFace', box=(62, 84), at=(46, 112), anchor='center'),      # 거울 유리에 붙은 얼굴
    ('b', 0): dict(kind='mirrorFigure', box=(48, 150), at=(46, 240), anchor='bottom'),   # 거울 안에 선 사람
    ('b', 1): dict(kind='giantEye', box=(130, 70), at=(216, 46), anchor='center'),       # 벽 위 거대한 눈 (두 번 그린다)
    ('b', 2): dict(kind='eyesMany', box=(54, 84), at=(462, 58), anchor='center'),        # 선반 끝과 문 사이 벽
    ('b', 3): dict(kind='blood', box=(40, 110), at=(196, 26), anchor='top', thr=50),  # 얇은 줄기를 살리려고 문턱값을 낮춘다             # 벽을 타고 흘러내리는 피
}


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
            keys, _ = cust.convert_limited(small, mask, 0, w, max_keys=10)
            out = Image.new('RGBA', size, (0, 0, 0, 0))
            op = out.load()
            for (x, y), k in keys.items():
                op[x, y] = cust.cols[k] + (255,)
            out.save(os.path.join(OUT, f"{item['kind']}.png"))
            ax, ay = item['at']
            x = ax - w // 2
            y = ay - h // 2 if item['anchor'] == 'center' else (ay - h if item['anchor'] == 'bottom' else ay)
            manifest[item['kind']] = {'x': x, 'y': y, 'w': w, 'h': h}
            print(item['kind'], manifest[item['kind']])
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
