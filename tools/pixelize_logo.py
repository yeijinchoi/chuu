"""브랜드 로고(힉스필드 원본)를 게임 팔레트의 금색 도트로 바꾼다.

입력: docs/concept/brand/logo-a.png (검은 바탕 금색 로고)
출력: public/art/brand/logo-full.png  (엠블럼 + 글자, 타이틀용)
      public/art/brand/emblem.png     (엠블럼만, 폰 배경화면용)
규칙: 어두운 바탕은 투명, 밝기에 따라 brass-dark / brass / brass-light / paper 4단계로 매핑.
      진주(채도 낮고 밝은 부분)는 bone/paper.
"""
import os, re
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pal = dict(re.findall(r"'?([\w-]+)'?: '#([0-9a-f]{6})'", open(os.path.join(ROOT, 'src/render/palette.ts')).read()))
C = {k: tuple(int(v[i:i+2], 16) for i in (0, 2, 4)) for k, v in pal.items()}

def gold(img, out, width):
    h = round(img.height * width / img.width)
    small = img.resize((width, h), Image.BOX)
    o = Image.new('RGBA', (width, h), (0, 0, 0, 0))
    sp, op = small.load(), o.load()
    for y in range(h):
        for x in range(width):
            r, g, b = sp[x, y]
            l = 0.3 * r + 0.59 * g + 0.11 * b
            sat = max(r, g, b) - min(r, g, b)
            if l < 34: continue
            if sat < 40 and l > 170: k = 'paper'          # 진주
            elif l < 70: k = 'brass-dark'
            elif l < 125: k = 'brass'
            elif l < 190: k = 'brass-light'
            else: k = 'paper'
            op[x, y] = C[k] + (255,)
    o.save(out)
    return o

src = Image.open(os.path.join(ROOT, 'docs/concept/brand/logo-a.png')).convert('RGB')
# 밝은 픽셀 경계로 자르기
bw = src.convert('L').point(lambda v: 255 if v > 34 else 0)
full = src.crop(bw.getbbox())
gold(full, os.path.join(ROOT, 'public/art/brand/logo-full.png'), 200)
# 엠블럼만: 글자 위쪽(글자 줄 바로 위에서 자름)
rows = [sum(1 for x in range(full.width) if full.getpixel((x, y))[0] > 34) for y in range(full.height)]
cut = full.height
for y in range(full.height - 1, 0, -1):
    if rows[y] == 0 and any(rows[y - 20:y]) is False:
        pass
# 글자 줄 시작점 = 아래에서부터 처음 만나는 빈 줄 구간의 위
y = full.height - 1
while y > 0 and rows[y] > 0: y -= 1           # 글자
while y > 0 and rows[y] == 0: y -= 1          # 빈 줄
emblem = full.crop((0, 0, full.width, y + 1))
eb = emblem.convert('L').point(lambda v: 255 if v > 34 else 0).getbbox()
gold(emblem.crop(eb), os.path.join(ROOT, 'public/art/brand/emblem.png'), 96)
print('ok')
