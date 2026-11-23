import products from '../data/products.json';
import { Layer, circle, dimLayer, dither, ellipse, hline, line, lit, polygon, px, rect, stamp, vline, T } from './pixel';
import { KEYS, KEY_INDEX, type Mood, type PaletteKey } from './palette';
import { drawMini } from './productIcon';

export type Shift = 'afternoon' | 'dawn';
export const W = 320;
export const H = 180;
export const COUNTER_Y = 132;
export const CUSTOMER_X = 160;

/** 새벽 스탠드: 위치와 빛 반경 */
export const LAMP = { x: 236, y: 120, cx: 218, cy: 120, rx: 112, ry: 84 };

export interface SceneBake {
  /** 배경: 벽, 선반, 마네킹, 문, 거울, 바닥 (손님 뒤) */
  back: Layer;
  /** 전경: 유리 카운터 (손님 앞) */
  front: Layer;
}

const catalog = (shift: Shift, cat: string): string[] =>
  (products as { id: string; shift: string; category: string }[]).filter((p) => p.shift === shift && p.category === cat).map((p) => p.id);

/** 9칸(3단×3) 가방 배치. 오후는 무채색 위주에 로즈 2개 */
const BAG_PATTERN: Record<Shift, number[]> = {
  afternoon: [2, 3, 2, 1, 2, 3, 0, 4, 1],
  dawn: [2, 3, 0, 0, 1, 2, 3, 0, 1],
};
export const SHELF_Y = [52, 76, 100];
export const SHELF_X = [120, 160, 200];

// ───────────────────────── 벽, 천장, 바닥

function drawWall(l: Layer): void {
  rect(l, 'oxw', 0, 0, W, 110);
  // 퀼팅: 홈(shadow) + 바로 옆 하이라이트(stone)로 도톰한 마름모 박음질
  for (let y = 10; y < 110; y++)
    for (let x = 0; x < W; x++) {
      const a = (x + y) % 32 === 0, b = (((x - y) % 32) + 32) % 32 === 0;
      if (!a && !b) continue;
      if (y % 2 === 0) {
        px(l, 'oxm', x, y);
        if (l.get(x + 1, y) === KEY_INDEX.oxw) px(l, 'oxl', x + 1, y);
      } else px(l, 'oxm', x, y);
    }
  // 교차점의 단추
  for (let y = 16; y < 110; y += 16)
    for (let x = 0; x < W; x += 16) {
      if ((x / 16 + y / 16) % 2 !== 0) continue;
      rect(l, 'oxl', x - 1, y - 1, 3, 3);
      px(l, 'ash', x - 1, y - 1);
      px(l, 'oxm', x + 1, y + 1);
      px(l, 'oxw', x, y);
    }
  // 천장 모서리로 갈수록 어두워짐 (체커 디더 → 단색)
  for (let y = 10; y < 110; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - 160) * 0.75, (y - 50) * 1.15);
      const v = l.get(x, y);
      if (v !== KEY_INDEX.oxw) continue;
      if (d > 205) l.set(x, y, KEY_INDEX.oxm);
      else if (d > 175 && (x + y) & 1) l.set(x, y, KEY_INDEX.oxm);
    }
  // 천장 몰딩
  rect(l, 'ink', 0, 0, W, 7);
  hline(l, 'oxd', 0, 5, W);
  hline(l, 'oxm', 0, 7, W);
  hline(l, 'oxw', 0, 8, W);
  hline(l, 'ink', 0, 9, W);
  for (let x = 0; x < W; x += 4) px(l, 'oxm', x, 6);
  // 왼쪽 옆벽(어두운 면)과 모서리
  rect(l, 'oxd', 0, 10, 47, 100);
  for (let y = 10; y < 110; y++) for (let x = 0; x < 47; x++) if (((x + y) % 32 === 0 || (((x - y) % 32) + 32) % 32 === 0) && y % 2 === 0) px(l, 'oxm', x, y);
  dither(l, 'ink', null, 0, 10, 47, 3);
  vline(l, 'ink', 47, 9, 102);
  vline(l, 'oxw', 48, 10, 100);
  vline(l, 'oxl', 49, 10, 100);
  // 걸레받이
  rect(l, 'oxd', 0, 107, W, 3);
  hline(l, 'oxw', 0, 107, W);
  hline(l, 'ink', 0, 110, W);
}

/** 대리석 바닥: 3줄 원근, 성긴 결(vein), 위쪽 줄일수록 작은 타일 */
function drawFloor(l: Layer): void {
  const rows: [number, number, number][] = [[111, 117, 14], [117, 125, 19], [125, COUNTER_Y, 26]];
  rows.forEach(([y0, y1, tw], ri) => {
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < W; x++) {
        const col = Math.floor((x - 160 + tw * 100) / tw);
        const dark = (col + ri) % 2 === 0;
        let k: PaletteKey = dark ? 'oxl' : 'ash';
        // 타일 위쪽 모서리 하이라이트, 아래쪽 줄눈 그림자
        if (y === y0) k = dark ? 'ash' : 'bone';
        else if (y === y1 - 1) k = dark ? 'oxw' : 'oxl';
        px(l, k, x, y);
      }
  });
  // 벽 아래 그림자 (접지)
  dither(l, 'oxw', null, 0, 111, W, 1);
  // 원근에 따른 좌우 가장자리 어둡게
  for (let y = 111; y < COUNTER_Y; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - 160);
      if (d > 150 && (x + y) & 1) px(l, 'oxw', x, y);
      else if (d > 120 && d <= 150 && (x + y) & 1 && l.get(x, y) === KEY_INDEX.oxl) px(l, 'oxw', x, y);
    }
}

// ───────────────────────── 거울, 문, 마네킹

function drawMirror(l: Layer): void {
  const x0 = 6, x1 = 41, top = 22, bot = 124;
  // 틀 (브라스 3톤 + 그림자)
  const frame = (k: PaletteKey, inset: number): void => {
    ellipse(l, k, 23, top + 13, 17 - inset, 13 - inset);
    rect(l, k, x0 + inset, top + 13, x1 - x0 - inset * 2 + 1, bot - top - 13 - inset);
  };
  frame('ink', -1);
  frame('brass', 0);
  frame('brass-dark', 2);
  // 유리 (비추는 것 없음)
  const gx0 = x0 + 3, gx1 = x1 - 3, gtop = top + 4, gbot = bot - 3;
  ellipse(l, 'stone', 23, gtop + 10, 14 - 0, 10);
  rect(l, 'stone', gx0, gtop + 10, gx1 - gx0 + 1, gbot - gtop - 10);
  // 위에서 아래로 어두워지는 유리: 디더 띠
  for (let y = gtop; y <= gbot; y++) for (let x = gx0; x <= gx1; x++) {
    if (l.get(x, y) !== KEY_INDEX.stone) continue;
    const t = (y - gtop) / (gbot - gtop);
    if (t > 0.75) l.set(x, y, KEY_INDEX.dusk);
    else if (t > 0.6 && (x + y) & 1) l.set(x, y, KEY_INDEX.dusk);
    else if (t < 0.25 && (x + y) & 1) l.set(x, y, KEY_INDEX.mist);
  }
  // 대각 하이라이트 2줄
  for (let i = 0; i < 26; i++) {
    px(l, 'bone', 18 + 0 + ((26 - i) >> 1), 46 + i);
    px(l, 'bone', 19 + ((26 - i) >> 1), 46 + i);
    px(l, 'ash', 20 + ((26 - i) >> 1), 46 + i);
  }
  for (let i = 0; i < 14; i++) {
    px(l, 'bone', 14 + ((14 - i) >> 1), 82 + i);
    px(l, 'ash', 15 + ((14 - i) >> 1), 82 + i);
  }
  // 틀 하이라이트 (왼쪽·위) 와 장식
  vline(l, 'brass-light', x0, top + 13, bot - top - 13);
  for (let i = 0; i < 12; i++) px(l, 'brass-light', 23 - Math.round(Math.sqrt(Math.max(0, 17 * 17 * (1 - ((i - 13) / 13.5) ** 2)))) , top + i);
  vline(l, 'brass-dark', x1, top + 13, bot - top - 13);
  hline(l, 'brass-light', 7, bot - 1, 34);
  // 정수리 장식 (리본)
  rect(l, 'brass', 21, top - 4, 5, 4);
  rect(l, 'brass-light', 22, top - 5, 3, 1);
  px(l, 'brass-light', 21, top - 3);
  circle(l, 'brass-light', 23, top - 6, 1);
  // 발
  rect(l, 'brass-dark', x0 - 1, bot, 5, 2);
  rect(l, 'brass-dark', x1 - 3, bot, 5, 2);
  // 거울 아래 접지 그림자
  dither(l, 'stone', null, x0 - 2, bot + 2, 40, 2);
}

function drawDoor(l: Layer): void {
  const x0 = 276, x1 = 314, top = 26, bot = 110;
  rect(l, 'ink', x0 - 2, top - 2, x1 - x0 + 4, bot - top + 2);
  rect(l, 'shadow', x0, top, x1 - x0, bot - top);
  // 프레임 깊이: 안쪽 하이라이트와 그림자
  vline(l, 'stone', x0, top, bot - top);
  hline(l, 'stone', x0, top, x1 - x0);
  vline(l, 'ink', x1 - 1, top, bot - top);
  // 윗창 (트랜섬) 2칸
  for (const gx of [x0 + 3, (x0 + x1) / 2 + 1]) {
    rect(l, 'dusk', gx, top + 3, 15, 9);
    dither(l, 'stone', null, gx, top + 3, 15, 9);
  }
  // 문짝 유리 2장: 김 서린 mist 톤 + 나무
  for (const gx of [x0 + 3, (x0 + x1) / 2 + 1]) {
    const gy = top + 16, gh = 44;
    rect(l, 'stone', gx, gy, 15, gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < 15; x++) {
      const t = y / gh;
      if (t < 0.45 && (x + y) & 1) px(l, 'mist', gx + x, gy + y);
      else if (t < 0.25) px(l, 'mist', gx + x, gy + y);
    }
    // 앙상한 나무
    const tx = gx + 7;
    vline(l, 'dusk', tx, gy + 12, gh - 12);
    for (const [dy, dir, len] of [[18, -1, 5], [18, 1, 5], [26, -1, 4], [26, 1, 4], [12, 1, 3], [12, -1, 3]] as const) line(l, 'dusk', tx, gy + dy, tx + dir * len, gy + dy - len + 1);
    dither(l, 'mist', null, gx, gy + 30, 15, 14); // 바닥 김
    vline(l, 'bone', gx, gy, gh); // 유리 왼쪽 반사
    vline(l, 'ink', gx + 14, gy, gh);
    hline(l, 'bone', gx, gy, 15);
  }
  // 하단 패널: 브라스 테두리 사각형
  for (const gx of [x0 + 3, (x0 + x1) / 2 + 1]) {
    rect(l, 'dusk', gx, 90, 15, 16);
    rect(l, 'brass-dark', gx + 1, 91, 13, 1);
    rect(l, 'brass-dark', gx + 1, 104, 13, 1);
    vline(l, 'brass-dark', gx + 1, 91, 14);
    vline(l, 'brass-dark', gx + 13, 91, 14);
    hline(l, 'brass', gx + 1, 91, 13);
  }
  // 손잡이
  rect(l, 'brass', 294, 70, 2, 9);
  rect(l, 'brass', 298, 70, 2, 9);
  px(l, 'brass-light', 294, 70);
  px(l, 'brass-light', 298, 70);
  vline(l, 'ink', 296, 26 + 12, 72);
  // 문턱 그림자
  hline(l, 'ink', x0 - 2, bot, x1 - x0 + 4);
}

/** 왼쪽 마네킹(드레스) 머리 위 얼굴 연출. 평소엔 얼굴이 없지만, dread부터 고개가 손님 쪽으로 돌고 눈이 생긴다.
 * collapse·breach에서는 여기에 단발 가발(서윤의 보브)이 더해진다. 그 외 mood는 아무것도 그리지 않는다. */
export function drawMannequinHeadOverlay(l: Layer, mood: Mood): void {
  if (mood !== 'dread' && mood !== 'collapse' && mood !== 'breach') return;
  const cx = 66;
  // 고개가 1도트 왼쪽 아래로 기울어 정면을 본다
  ellipse(l, 'bone', cx - 1, 57, 4, 6);
  if (mood !== 'dread') {
    // 보브 가발: 정수리 캡(48~54), 양옆 단발(52~59), 목 높이에서 평평하게 자른 밑단(60)
    ellipse(l, 'hair', cx, 51, 5, 3);
    hline(l, 'hair', cx - 4, 54, 9); // 정수리 캡과 단발 사이의 앞머리 줄
    rect(l, 'hair', cx - 5, 52, 2, 8);
    rect(l, 'hair', cx + 4, 52, 2, 8);
    hline(l, 'ink', cx - 5, 60, 11);
  }
  // 눈 두 개 (얼굴 중앙, 가발 안쪽)
  px(l, 'ink', cx - 2, 55);
  px(l, 'ink', cx + 1, 55);
}

/** 마네킹 (키 크기 약 70). cx = 중심 x */
function drawMannequin(l: Layer, cx: number, kind: 'dress' | 'coat', shift: Shift): void {
  const ground = 117;
  // 접지 그림자 (AO)
  ellipse(l, 'mist', cx, ground + 1, 11, 2);
  dither(l, 'stone', null, cx - 11, ground, 23, 3);
  // 받침대: 브라스 폴 + 원판
  vline(l, 'brass-dark', cx, 88, ground - 88);
  vline(l, 'brass-light', cx - 1, 88, ground - 88);
  ellipse(l, 'brass-dark', cx, ground, 8, 2);
  ellipse(l, 'brass', cx, ground - 1, 8, 2);
  hline(l, 'brass-light', cx - 5, ground - 2, 6);
  // 머리, 목
  ellipse(l, 'bone', cx, 56, 4, 6);
  lit(l, 'bone', 'paper', 'ash', cx - 4, 50, 9, 13);
  rect(l, 'ash', cx - 1, 62, 3, 3);
  hline(l, 'mist', cx - 1, 64, 3);
  if (kind === 'dress') {
    // 검은 원피스: 3톤 + 주름
    polygon(l, 'dusk', [[cx - 8, 66], [cx - 2, 64], [cx + 2, 64], [cx + 8, 66], [cx + 6, 78], [cx + 15, 106], [cx - 15, 106], [cx - 6, 78]]);
    lit(l, 'dusk', 'stone', 'shadow', cx - 15, 64, 31, 42);
    polygon(l, 'bone', [[cx - 2, 64], [cx + 2, 64], [cx, 70]]); // V넥
    for (const dx of [-9, -4, 1, 6, 10]) line(l, 'shadow', cx + dx * 0.5, 80, cx + dx * 1.3, 105);
    hline(l, 'stone', cx - 6, 78, 13); // 허리선
    hline(l, 'ink', cx - 15, 106, 31);
    hline(l, 'dusk', cx - 15, 105, 31);
    // 어깨끈 / 팔 없음
  } else {
    // 코트: ash 3톤 + 벨트 + 옷깃 + 단추
    const body: K[] = [];
    void body;
    polygon(l, 'ash', [[cx - 10, 66], [cx - 3, 63], [cx + 3, 63], [cx + 10, 66], [cx + 14, 70], [cx + 13, 104], [cx - 13, 104], [cx - 14, 70]]);
    lit(l, 'ash', 'bone', 'mist', cx - 14, 63, 29, 41);
    rect(l, 'ash', cx - 14, 70, 3, 24);
    rect(l, 'mist', cx + 11, 70, 3, 24);
    polygon(l, 'bone', [[cx - 3, 63], [cx, 74], [cx - 7, 68]]);
    polygon(l, 'bone', [[cx + 3, 63], [cx, 74], [cx + 7, 68]]);
    vline(l, 'mist', cx, 74, 30);
    rect(l, 'mist', cx - 13, 80, 27, 2); // 벨트
    rect(l, 'bone', cx - 1, 80, 3, 2);
    for (const y of [86, 92]) px(l, 'stone', cx + 2, y);
    hline(l, 'stone', cx - 13, 104, 27);
    hline(l, 'ink', cx - 13, 105, 27);
    vline(l, 'mist', cx - 13, 72, 32);
    vline(l, 'stone', cx + 13, 72, 32);
  }
  void shift;
}
type K = PaletteKey;

// ───────────────────────── 선반, 진열

function drawShelves(l: Layer, shift: Shift): void {
  const bags = catalog(shift, 'bag');
  const pat = BAG_PATTERN[shift];
  SHELF_Y.forEach((y, ti) => {
    // 판: 윗면 하이라이트, 앞면, 밑면 그림자, 벽에 드리운 그림자
    rect(l, 'dusk', 104, y, 112, 3);
    hline(l, 'brass', 104, y, 112);
    hline(l, 'mist', 104, y + 1, 112);
    hline(l, 'dusk', 104, y + 2, 112);
    hline(l, 'ink', 104, y + 3, 112);
    dither(l, 'shadow', null, 105, y + 4, 110, 2);
    // 브라켓
    for (const bx of [110, 210]) { rect(l, 'brass-dark', bx, y + 3, 2, 4); px(l, 'brass', bx, y + 3); }
    // 아이템 (16×16) + 접지 그림자
    SHELF_X.forEach((cx, ci) => {
      const id = bags[(pat[ti * 3 + ci] as number) % bags.length] as string;
      hline(l, 'ink', cx - 6, y - 1, 13);
      stamp(l, drawMini(id), cx - 8, y - 16);
    });
  });
}

const APPAREL_MINI: Record<Shift, [string, string]> = {
  afternoon: ['garden_scarf', 'tailored_suit'],
  dawn: ['warm_memory_glove', 'stage_cloak'],
};

function drawPedestals(l: Layer, shift: Shift): void {
  [90, 232].forEach((cx, i) => {
    const id = APPAREL_MINI[shift][i] as string;
    stamp(l, drawMini(id), cx - 8, 92);
    rect(l, 'stone', cx - 9, 108, 19, 8);
    hline(l, 'ash', cx - 9, 108, 19);
    hline(l, 'mist', cx - 9, 109, 19);
    hline(l, 'dusk', cx - 9, 114, 19);
    hline(l, 'ink', cx - 9, 116, 19);
    dither(l, 'mist', null, cx - 10, 117, 21, 1);
  });
}

// ───────────────────────── 카운터

const JEWELRY_X: Record<number, number[]> = { 5: [32, 76, 160, 244, 288], 4: [36, 76, 244, 284] };

function drawCounter(l: Layer, shift: Shift): void {
  // 상판
  rect(l, 'shadow', 0, COUNTER_Y, W, 10);
  hline(l, 'brass', 0, COUNTER_Y, W);
  hline(l, 'brass-dark', 0, COUNTER_Y + 1, W);
  dither(l, 'dusk', null, 0, COUNTER_Y + 2, W, 3);
  hline(l, 'dusk', 0, COUNTER_Y + 5, W);
  hline(l, 'stone', 0, COUNTER_Y + 9, W);
  hline(l, 'ink', 0, COUNTER_Y + 10, W);
  // 앞면
  rect(l, 'shadow', 0, COUNTER_Y + 11, W, 37);
  rect(l, 'ink', 0, 177, W, 3);
  hline(l, 'stone', 0, COUNTER_Y + 11, W);
  // 유리 패널 3칸
  const panels: [number, number][] = [[6, 101], [111, 209], [219, 314]];
  const items = catalog(shift, 'jewelry');
  const xs = JEWELRY_X[items.length] ?? JEWELRY_X[5]!;
  for (const [px0, px1] of panels) {
    const w = px1 - px0 + 1;
    rect(l, 'brass-dark', px0, 146, w, 31);
    rect(l, 'ink', px0 + 2, 148, w - 4, 27);
    hline(l, 'brass-light', px0, 146, w);
    hline(l, 'brass', px0, 147, w);
    hline(l, 'brass-light', px0, 176, w);
    vline(l, 'brass-light', px0, 146, 31);
    vline(l, 'brass-dark', px1, 146, 31);
    // 유리 안쪽 그라데이션 (2×2 체커)
    for (let y = 148; y < 175; y++) for (let x = px0 + 2; x < px1 - 1; x++) {
      const t = (y - 148) / 27;
      if (t < 0.18) px(l, 'shadow', x, y);
      else if (t < 0.3 && (x + y) & 1) px(l, 'shadow', x, y);
    }
    // 벨벳 쿠션
    rect(l, 'dusk', px0 + 2, 168, w - 4, 7);
    hline(l, 'stone', px0 + 2, 168, w - 4);
    dither(l, 'shadow', null, px0 + 2, 173, w - 4, 2);
    // 대각 유리 반사
    for (const off of [10, 46]) {
      for (let i = 0; i < 18; i++) {
        const x = px0 + off + (18 - i) , y = 149 + i;
        if (x < px1 - 2 && x > px0 + 2) { px(l, 'stone', x, y); if (i % 2 === 0) px(l, 'mist', x + 1, y); }
      }
    }
  }
  // 쿠션 위 주얼리 + 접지 그림자
  items.forEach((id, i) => {
    const cx = xs[i] as number;
    hline(l, 'ink', cx - 6, 167, 13);
    stamp(l, drawMini(id), cx - 8, 152);
  });
  // 카운터 위 소품: 보석함, 트레이, 화병
  // 보석함 (좌)
  rect(l, 'stone', 46, 129, 34, 5);
  rect(l, 'ash', 46, 126, 34, 3);
  hline(l, 'bone', 46, 126, 34);
  rect(l, 'mist', 46, 129, 34, 1);
  rect(l, 'stone', 46, 130, 34, 8);
  lit(l, 'stone', 'mist', 'dusk', 46, 130, 34, 8);
  vline(l, 'ink', 46, 126, 12);
  vline(l, 'ink', 79, 126, 12);
  rect(l, 'brass', 61, 130, 5, 4);
  px(l, 'brass-light', 61, 130);
  hline(l, 'ink', 46, 138, 34);
  hline(l, 'dusk', 47, 139, 34);
  // 트레이 (손님 손이 닿는 자리)
  rect(l, 'brass', 112, 134, 96, 7);
  rect(l, 'ash', 114, 135, 92, 5);
  for (let x = 114; x < 206; x++) if (x & 1) px(l, 'bone', x, 135);
  hline(l, 'mist', 114, 139, 92);
  hline(l, 'brass-dark', 112, 141, 96);
  // 화병 + 꽃 (우)
  const vx = 276;
  ellipse(l, 'ash', vx, 133, 7, 6);
  lit(l, 'ash', 'bone', 'mist', vx - 7, 127, 15, 13);
  hline(l, 'ink', vx - 5, 139, 11);
  rect(l, 'mist', vx - 2, 125, 5, 3);
  for (const [fx, fy] of [[vx - 8, 114], [vx, 110], [vx + 8, 114], [vx - 3, 118], [vx + 4, 119]] as const) {
    line(l, 'stone', vx, 126, fx, fy + 3);
    rect(l, 'bone', fx - 2, fy - 2, 5, 5);
    rect(l, 'paper', fx - 1, fy - 2, 3, 3);
    px(l, 'ash', fx, fy);
    px(l, 'mist', fx + 2, fy + 2);
    px(l, 'ash', fx - 2, fy + 2);
  }
  for (const [lx, ly] of [[vx - 5, 124], [vx + 5, 122]] as const) rect(l, 'mist', lx, ly, 3, 2);
  if (shift === 'afternoon') {
    // 향수병 (오후) — 유리 3톤 + 브라스 캡
    rect(l, 'bone', 232, 128, 9, 10);
    lit(l, 'bone', 'paper', 'ash', 232, 128, 9, 10);
    rect(l, 'paper', 234, 130, 5, 4);
    rect(l, 'brass', 234, 124, 5, 4);
    px(l, 'brass-light', 234, 124);
    hline(l, 'ink', 231, 138, 11);
  }
}

/** 새벽 스탠드 (전경). 빛의 웅덩이는 lighting()에서. */
function drawLamp(l: Layer): void {
  const x = LAMP.x;
  ellipse(l, 'stone', x, 138, 7, 2);
  ellipse(l, 'mist', x, 137, 7, 2);
  hline(l, 'ash', x - 3, 136, 5);
  vline(l, 'mist', x, 126, 11);
  vline(l, 'ash', x - 1, 126, 11);
  line(l, 'mist', x, 126, x - 4, 120);
  line(l, 'ash', x - 1, 126, x - 5, 120);
  // 갓: 아래쪽으로 기운 원뿔
  polygon(l, 'stone', [[x - 15, 122], [x - 8, 115], [x - 2, 118], [x - 5, 125]]);
  polygon(l, 'mist', [[x - 14, 121], [x - 9, 116], [x - 4, 118]]);
  line(l, 'ash', x - 14, 121, x - 9, 116);
  // 전구 (밝은 면)
  polygon(l, 'paper', [[x - 15, 122], [x - 9, 126], [x - 5, 125], [x - 8, 121]]);
  px(l, 'bone', x - 13, 123);
  // 접지 그림자
  dither(l, 'ink', null, x - 9, 139, 19, 2);
  // 빛줄기: 갓 아래에서 카운터 상판까지 (체커 디더, 번짐 없음)
  const beam = new Layer(W, H);
  polygon(beam, 'bone', [[x - 15, 123], [x - 7, 126], [x - 50, 134], [x - 86, 134]]);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (beam.get(xx, yy) !== T && ((xx + yy) & 1) && l.get(xx, yy) === T) px(l, 'ash', xx, yy);
}

/** 새벽 조명: 빛 반경 밖은 무채색 한 단계 어둡게. 경계는 2×2 체커. */
function lighting(layers: Layer[]): void {
  const dist = (x: number, y: number): number => Math.hypot((x - LAMP.cx) / LAMP.rx, (y - LAMP.cy) / LAMP.ry);
  for (const l of layers) dimLayer(l, 1, (x, y) => {
    const d = dist(x, y);
    if (d < 0.85) return false;
    if (d < 1.15) return ((x + y) & 1) === 1;
    return true;
  });
}

/** 카운터 위 빛의 웅덩이: 상판의 neutral을 한 단계 밝게 (디더 경계) */
function lightPool(front: Layer): void {
  const lighter = KEYS.map((k, i) => {
    const order: PaletteKey[] = ['ink', 'shadow', 'dusk', 'stone', 'mist', 'ash', 'bone', 'paper'];
    const j = order.indexOf(k);
    return j >= 0 ? KEY_INDEX[order[Math.min(7, j + 1)] as PaletteKey] : i;
  });
  const cx = 208, cy = 137;
  for (let y = COUNTER_Y + 1; y < COUNTER_Y + 11; y++)
    for (let x = 140; x < 280; x++) {
      const v = front.get(x, y);
      if (v === T) continue;
      const d = Math.hypot((x - cx) / 62, (y - cy) / 7);
      if (d < 0.8 || (d < 1 && (x + y) & 1)) front.set(x, y, lighter[v] as number);
      if (d < 0.5 || (d < 0.65 && (x + y) & 1)) front.set(x, y, lighter[front.get(x, y)] as number);
    }
}

// ───────────────────────── 굽기

export function bakeScene(shift: Shift): SceneBake {
  const back = new Layer(W, H);
  const front = new Layer(W, H);
  drawWall(back);
  drawFloor(back);
  drawMirror(back);
  drawDoor(back);
  drawShelves(back, shift);
  drawMannequin(back, 66, 'dress', shift);
  drawMannequin(back, 258, 'coat', shift);
  drawPedestals(back, shift);
  drawCounter(front, shift);
  if (shift === 'dawn') {
    drawLamp(front);
    lighting([back, front]);
    lightPool(front);
  }
  return { back, front };
}

// ───────────────────────── 샹들리에 (매 프레임)

/** level: 0 평소, 1 깜빡임으로 한 단계 어두움. 새벽엔 꺼져 있다. */
export function drawChandelier(l: Layer, shift: Shift, level: 0 | 1): void {
  const on = shift === 'afternoon';
  const arm: PaletteKey = on ? 'brass' : 'stone';
  const armHi: PaletteKey = on ? 'brass-light' : 'mist';
  const armLo: PaletteKey = on ? 'brass-dark' : 'dusk';
  const shade: PaletteKey = on ? (level ? 'ash' : 'bone') : 'mist';
  const shadeHi: PaletteKey = on ? (level ? 'bone' : 'paper') : 'ash';
  const shadeLo: PaletteKey = on ? (level ? 'mist' : 'ash') : 'stone';
  // 체인과 몸통
  vline(l, armLo, 160, 0, 9);
  vline(l, arm, 161, 0, 9);
  rect(l, arm, 158, 9, 5, 3);
  hline(l, armHi, 158, 9, 5);
  vline(l, arm, 160, 12, 16);
  vline(l, armLo, 161, 12, 16);
  circle(l, arm, 160, 29, 2);
  px(l, armHi, 159, 28);
  rect(l, armLo, 160, 32, 1, 3);
  px(l, armHi, 160, 35);
  // 팔: 곡선
  const xs = [128, 144, 160, 176, 192];
  for (const sx of xs) {
    if (sx === 160) continue;
    const dir = sx < 160 ? -1 : 1, span = Math.abs(sx - 160);
    for (let i = 0; i <= span; i++) {
      const t = i / span;
      const y = Math.round(29 - 7 * Math.sin((Math.PI * t) / 2) - (span > 20 ? 1 : 0) * t * 2);
      const x = 160 + dir * i;
      px(l, i % 5 === 1 ? armHi : arm, x, y);
      px(l, armLo, x, y + 1);
    }
    rect(l, armLo, sx - 1, 21, 3, 2); // 받침
    px(l, armHi, sx, 21);
  }
  // 갓
  for (const sx of xs) {
    const top = sx === 160 ? 11 : 14;
    polygon(l, shade, [[sx - 2, top], [sx + 3, top], [sx + 5, top + 8], [sx - 4, top + 8]]);
    vline(l, shadeHi, sx - 1, top + 1, 6);
    vline(l, shadeLo, sx + 3, top + 1, 7);
    hline(l, shadeLo, sx - 4, top + 8, 9);
    px(l, shadeHi, sx - 2, top);
    if (on && !level) px(l, 'paper', sx - 1, top + 2);
  }
  // 윤광 1도트
  if (on && !level) { px(l, 'paper', 128, 26); px(l, 'paper', 192, 26); }
  px(l, 'ink', 160, 36);
}

export function jewelryOf(shift: Shift): string[] {
  return catalog(shift, 'jewelry');
}

// ───────────────────────── 04:44 문 유리의 실루엣 (SCRIPT S12)

/** 문짝 왼쪽 유리(279..293 × 42..85)에 서 있는 단발머리 실루엣의 몸 모양 */
const SIL_X = 286;
function silhouetteHalf(y: number): number {
  if (y < 49 || y > 85) return -1;
  if (y < 51) return 3; // 정수리
  if (y < 53) return 5;
  if (y <= 66) return 7; // 단발: 턱선에서 일자로 떨어진다
  if (y <= 71) return 1; // 목
  return Math.min(7, 2 + (y - 71)); // 어깨
}

/**
 * 문 유리에 비친 실루엣. level 0~1이 짙어지는 정도: 2×2 체커 디더와 단색 단계로만 나타낸다.
 * palm: 유리에 댄 손바닥(블랙아웃 직전). 팔레트 키만 쓰므로 mood와 새벽 조명을 그대로 따른다.
 */
export function drawSilhouette(l: Layer, level: number, palm: boolean): void {
  if (level <= 0.02) return;
  const steps: [PaletteKey, PaletteKey | null][] = [
    ['dusk', null], ['dusk', 'shadow'], ['shadow', null], ['shadow', 'ink'], ['ink', null],
  ];
  const at = Math.min(steps.length - 1, Math.floor(level * steps.length));
  const [a, b] = steps[at] as [PaletteKey, PaletteKey | null];
  for (let y = 49; y <= 85; y++) {
    const h = silhouetteHalf(y);
    if (h < 0) continue;
    for (let x = SIL_X - h; x <= SIL_X + h; x++) {
      if (x < 279 || x > 293) continue;
      const pick = b === null ? a : ((x + y) & 1 ? a : b);
      px(l, pick, x, y);
    }
  }
  if (level > 0.5) {
    // 유리의 밝은 쪽(왼쪽 반사)에 닿는 머리 윤곽에만 mist 한 점
    px(l, 'mist', SIL_X - 7, 58);
    px(l, 'mist', SIL_X - 6, 52);
  }
  if (palm && level > 0.9) {
    // 오른쪽 어깨에서 올라온 손바닥: 손가락 네 개와 엄지
    rect(l, 'ink', 288, 70, 6, 7);
    for (const fx of [288, 290, 292]) rect(l, 'ink', fx, 65, 1, 5);
    rect(l, 'ink', 293, 66, 1, 4);
    px(l, 'bone', 289, 77);
    px(l, 'bone', 292, 76);
  }
}
