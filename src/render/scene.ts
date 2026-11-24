import products from '../data/products.json';
import { Layer, circle, dimLayer, dither, ellipse, ellipseLine, hline, line, lit, polygon, px, rect, remap, stamp, vline, T } from './pixel';
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

/**
 * 이야기에 따라 바뀌는 배경(굽기에 들어가는 것). 대사의 서술과 맞춘다.
 * - 2일차 "마네킹이 한 칸 옮겨져 있다": 드레스 마네킹이 거울 쪽으로 한 칸, 원래 자리엔 받침대 자국
 * - 4일차 "마네킹이 세 개로 늘어 있다": 거울 앞에 단발 마네킹(서윤의 유니폼). 한서진이 보는 "단발 마네킹",
 *   마지막 밤 "가장 왼쪽의 단발"이 이것이다
 * - 바깥에서 온 색 "진열장의 장밋빛 하나가 영원히 회색이 된다": 선반의 첫 분홍 가방이 회색
 */
export interface SceneLayout { day: number; roseGray: boolean }
export const DEFAULT_LAYOUT: SceneLayout = { day: 1, roseGray: false };
export type MannequinKind = 'dress' | 'coat' | 'bob' | 'uniform';

export function mannequinSlots(day: number): { cx: number; kind: MannequinKind }[] {
  const out: { cx: number; kind: MannequinKind }[] = [];
  if (day >= 4) out.push({ cx: 22, kind: 'bob' });
  out.push({ cx: day >= 2 ? 48 : 66, kind: 'dress' });
  out.push({ cx: 258, kind: 'coat' });
  return out;
}
/** 잠깐 늘어나는 마네킹 자리: 진열대 끝(문 앞), 선반 앞 */
export const EXTRA_MANNEQUIN_X = [292, 112];

const isPink = (id: string): boolean => (products as { id: string; color: string | null }[]).find((p) => p.id === id)?.color === 'pink';
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

/** 서윤의 단발 가발: 정수리 캡 + 이마를 덮는 앞머리 + 턱선(58)에서 끝나는 옆머리. 턱 아래를 막지 않아야 얼굴이 드러난다 */
function bobWig(l: Layer, cx: number, faceRight = false): void {
  ellipse(l, 'hair', cx, 51, 6, 3);
  rect(l, 'hair', cx - 5, 50, 11, 3); // 앞머리 (눈썹 위까지)
  hline(l, 'shadow', cx - 4, 53, 9); // 앞머리 끝 그림자
  rect(l, 'hair', faceRight ? cx - 6 : cx - 6, 52, 2, 7); // 왼쪽 옆머리
  rect(l, 'hair', faceRight ? cx + 6 : cx + 5, 52, 2, 7); // 오른쪽 옆머리
  px(l, 'shadow', cx - 6, 58);
  px(l, 'shadow', cx + (faceRight ? 7 : 6), 58);
}

/** 왼쪽 마네킹(드레스) 머리 위 얼굴 연출. 평소엔 얼굴이 없지만, dread부터 고개가 손님 쪽으로 돌고 눈이 생긴다.
 * collapse·breach에서는 여기에 단발 가발(서윤의 보브)이 더해진다. 그 외 mood는 아무것도 그리지 않는다. */
export function drawMannequinHeadOverlay(l: Layer, mood: Mood, cx = 66, force = false): void {
  // force: 마지막 밤 "가장 왼쪽의 단발이 고개만 돌려 이쪽을 본다" (mood와 상관없이)
  if (!force && mood !== 'dread' && mood !== 'collapse' && mood !== 'breach') return;
  // 고개가 1도트 왼쪽 아래로 기울어 정면을 본다
  ellipse(l, 'bone', cx - 1, 57, 4, 6);
  if (mood !== 'dread' || force) {
    bobWig(l, cx);
  }
  // 눈 두 개 (얼굴 중앙, 가발 안쪽)
  px(l, 'ink', cx - 2, 55);
  px(l, 'ink', cx + 1, 55);
}

/** 마네킹 (키 크기 약 70). cx = 중심 x */
export function drawMannequin(l: Layer, cx: number, kind: MannequinKind, shift: Shift): void {
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
  if (kind === 'bob' || kind === 'uniform') {
    // 메종 뤼미에르 어드바이저 유니폼. 드레스 마네킹과 같은 키·어깨, 잘록한 허리 + H라인(일자) 치마
    polygon(l, 'shadow', [[cx - 8, 66], [cx - 2, 64], [cx + 2, 64], [cx + 8, 66], [cx + 6, 78], [cx + 7, 84], [cx + 7, 104], [cx - 7, 104], [cx - 7, 84], [cx - 6, 78]]);
    lit(l, 'shadow', 'dusk', 'ink', cx - 8, 64, 17, 41);
    // 짧은 재킷: 허리 아래로 살짝 퍼지는 밑단 + 흰 깃 + 왼가슴 명찰
    polygon(l, 'dusk', [[cx - 6, 78], [cx + 6, 78], [cx + 8, 84], [cx - 8, 84]]);
    hline(l, 'ink', cx - 8, 84, 17);
    polygon(l, 'paper', [[cx - 2, 64], [cx + 2, 64], [cx, 70]]);
    px(l, 'bone', cx - 3, 65);
    px(l, 'bone', cx + 3, 65);
    rect(l, 'brass', cx - 6, 70, 3, 2);
    px(l, 'brass-light', cx - 6, 70);
    hline(l, 'stone', cx - 6, 78, 13); // 허리선
    vline(l, 'ink', cx, 98, 6); // 일자 치마 밑단 트임
    vline(l, 'dusk', cx - 7, 86, 18); // 옆선
    hline(l, 'ink', cx - 7, 104, 15);
    if (kind === 'bob') bobWig(l, cx);
  } else if (kind === 'dress') {
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

const ROSE_TO_GRAY: Partial<Record<PaletteKey, PaletteKey>> = { rose: 'mist', 'rose-light': 'ash', 'rose-dark': 'stone' };

function drawShelves(l: Layer, shift: Shift, roseGray = false): void {
  const bags = catalog(shift, 'bag');
  let grayed = !roseGray;
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
      let mini = drawMini(id);
      if (!grayed && isPink(id)) {
        // drawMini는 캐시를 돌려준다: 복사본에만 칠해야 진열 칸의 같은 가방이 회색이 되지 않는다
        const copy = new Layer(mini.w, mini.h);
        copy.data.set(mini.data);
        mini = copy;
        // 바깥에서 온 색이 가져간 장밋빛: 이 가방만 영원히 회색
        for (const [from, to] of Object.entries(ROSE_TO_GRAY)) remap(mini, from as PaletteKey, to as PaletteKey);
        grayed = true;
      }
      stamp(l, mini, cx - 8, y - 16);
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

export function bakeScene(shift: Shift, layout: SceneLayout = DEFAULT_LAYOUT): SceneBake {
  const back = new Layer(W, H);
  const front = new Layer(W, H);
  drawWall(back);
  drawFloor(back);
  drawMirror(back);
  drawDoor(back);
  drawShelves(back, shift, layout.roseGray);
  if (layout.day >= 2 && layout.day < 4) {
    // 옮겨진 마네킹의 원래 자리: 받침대 자국만 남았다
    ellipseLine(back, 'stone', 66, 117, 8, 2);
    dither(back, 'mist', null, 60, 117, 13, 1);
  }
  for (const m of mannequinSlots(layout.day)) drawMannequin(back, m.cx, m.kind, shift);
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

// ───────────────────────── 이야기 연출 (가운데 층, 매 프레임)

/**
 * 손님 대사에 맞춰 잠깐 바뀌는 배경. 대사 문구가 아니라 데이터의 scene 설정값(customers.json)으로 연결된다.
 * extra_one: 마네킹 하나가 늘어 있다 · extra_two: 둘 · uniform_added: 진열대 끝에 유니폼 마네킹
 * all_turn_door: 마네킹들이 모두 문 쪽을 보고 있다
 */
export type SceneCueView = 'extra_one' | 'extra_two' | 'uniform_added' | 'all_turn_door';

function headToDoor(l: Layer, cx: number, bob: boolean): void {
  // 고개를 오른쪽(문)으로 돌린 옆얼굴: 머리가 1도트 오른쪽, 눈 하나, 코끝
  ellipse(l, 'bone', cx + 1, 56, 4, 6);
  lit(l, 'bone', 'paper', 'ash', cx - 3, 50, 9, 13);
  if (bob) bobWig(l, cx + 1, true);
  px(l, 'ink', cx + 3, 55);
  px(l, 'ash', cx + 5, 57);
}

export function drawSceneCue(l: Layer, cue: SceneCueView, layout: SceneLayout, shift: Shift): void {
  const t = new Layer(W, H);
  const [a, b] = EXTRA_MANNEQUIN_X as [number, number];
  if (cue === 'extra_one') drawMannequin(t, a, 'dress', shift);
  else if (cue === 'extra_two') { drawMannequin(t, a, 'dress', shift); drawMannequin(t, b, 'coat', shift); }
  else if (cue === 'uniform_added') drawMannequin(t, a, 'uniform', shift);
  else for (const m of mannequinSlots(layout.day)) headToDoor(t, m.cx, m.kind === 'bob');
  if (shift === 'dawn') lighting([t]); // 굽힌 배경과 같은 새벽 조명 아래에 서 있게
  for (let i = 0; i < t.data.length; i++) if (t.data[i] !== T) l.data[i] = t.data[i] as number;
}

/**
 * 새벽에 가끔 배경에 나타났다 사라지는 것들 (1초 남짓). 눈 · 손자국 · 핏자국 · 거울 속 얼굴.
 * 자리는 벽의 어두운 구석·문 유리·거울 안. p = 0~1 진행도(나타나는 동안), reduced면 움직임 없이 그대로.
 */
export type ApparitionKind =
  | 'eyes' | 'eyesMany' | 'hand' | 'blood' | 'mirrorFace'
  | 'doorGapEyes' | 'mirrorFigure' | 'mirrorVoid' | 'noiseFigure' | 'hallHand' | 'shelfFingers' | 'giantEyes' | 'mannequinTwitch';
/**
 * tier: 이 단계부터 나온다 (0 평온 · 1 불안 · 2 공포 · 3 붕괴). 평온할 때는 작고 짧은 것만,
 * 평정심이 떨어질수록 크고 노골적인 것이 풀린다. (레퍼런스: docs/HORROR_REFERENCES.md)
 */
export interface Apparition { kind: ApparitionKind; x: number; y: number; tier: 0 | 1 | 2 | 3; mirror?: boolean }
export const APPARITION_SPOTS: readonly Apparition[] = [
  // 평온: 작고 짧은 것 — "방금 뭐였지?"
  { kind: 'eyes', x: 84, y: 24, tier: 0 }, // 샹들리에 왼쪽 벽 위 어둠
  { kind: 'doorGapEyes', x: 303.5, y: 64, tier: 0 }, // 오른쪽 문짝 유리 너머에서 들여다보는 얼굴
  { kind: 'hallHand', x: 294, y: 120, tier: 0 }, // 출입문 앞 바닥에서 작게 올라온 손 하나
  { kind: 'shelfFingers', x: 178, y: 54, tier: 0 }, // 맨 위 선반, 가방 사이로 걸친 손가락
  { kind: 'mirrorVoid', x: 23, y: 72, tier: 0, mirror: true }, // 거울이 아무것도 비추지 않는다
  { kind: 'mannequinTwitch', x: 0, y: 0, tier: 0 }, // 맨 왼쪽 마네킹이 고개를 확 돌렸다가 원래대로
  // 불안
  { kind: 'eyes', x: 252, y: 12, tier: 1 }, // 코트 마네킹 위 벽
  { kind: 'hand', x: 292, y: 62, tier: 1 }, // 문 유리에 바깥에서 짚은 손
  { kind: 'hand', x: 22, y: 78, tier: 1, mirror: true }, // 거울 안쪽에서 짚은 손
  { kind: 'blood', x: 88, y: 12, tier: 1 }, // 벽을 타고 흘러내리는 핏자국
  { kind: 'blood', x: 228, y: 18, tier: 1 },
  { kind: 'mirrorFace', x: 23, y: 56, tier: 1, mirror: true }, // 거울 속에서 이쪽을 보는 얼굴
  { kind: 'noiseFigure', x: 93, y: 117, tier: 1 }, // 마네킹과 선반 사이, 지직거리는 사람 모양
  // 공포
  { kind: 'eyesMany', x: 231, y: 29, tier: 2 }, // 선반 끝과 문 사이 위쪽 벽
  { kind: 'mirrorFigure', x: 23, y: 120, tier: 2, mirror: true }, // 거울 안에 서 있는 긴 머리 실루엣
  // 붕괴: 압도하는 크기
  { kind: 'giantEyes', x: 160, y: 23, tier: 3 }, // 벽 위쪽 전체를 덮는 거대한 두 눈
];

/** 그날·그 분위기에 보이는 것만: 4일차부터는 거울 앞에 단발 마네킹이 서서 거울 속이 가려진다 */
export function apparitionSpots(day: number, moodTier: 0 | 1 | 2 | 3 = 3): readonly Apparition[] {
  const mirrorBlocked = mannequinSlots(day).some((m) => m.cx < 42);
  return APPARITION_SPOTS.filter((a) => a.tier <= moodTier && !(mirrorBlocked && a.mirror));
}

/**
 * 그림(public/art/apparitions)으로 그리는 종류와 그림 기준점. 자리(x, y)는 장면 좌표, 그림은 2배 촘촘한 화면에 놓는다.
 * 그림이 없으면 drawApparition의 코드 도트로 대신한다.
 */
export const APPARITION_ART: Partial<Record<ApparitionKind, { art: string; anchor: 'center' | 'bottom' | 'top' }>> = {
  doorGapEyes: { art: 'doorGapEyes', anchor: 'center' },
  hallHand: { art: 'hallHand', anchor: 'bottom' },
  shelfFingers: { art: 'shelfFingers', anchor: 'bottom' },
  mirrorFace: { art: 'mirrorFace', anchor: 'center' },
  mirrorFigure: { art: 'mirrorFigure', anchor: 'bottom' },
  giantEyes: { art: 'giantEye', anchor: 'center' },
  eyesMany: { art: 'eyesMany', anchor: 'center' },
  blood: { art: 'blood', anchor: 'top' },
};

/** 나타나 있는 시간(초): 작은 것일수록 짧게 */
export function apparitionDuration(a: Apparition): number {
  switch (a.kind) {
    case 'blood': return 2.6;
    case 'giantEyes': return 2.0;
    case 'eyesMany': case 'mirrorFigure': return 1.8;
    case 'hallHand': return 1.5;
    case 'mirrorFace': case 'noiseFigure': return 1.3;
    case 'doorGapEyes': case 'shelfFingers': return 1.1;
    case 'mannequinTwitch': return 0.45;
    case 'mirrorVoid': return 0.6;
    default: return 0.9;
  }
}

/** 오른쪽 문짝 유리 한 칸 (장면 좌표): 문틈 얼굴은 이 안에만 보인다 */
export const DOOR_GLASS = { x: 296, y: 42, w: 15, h: 44 };

/**
 * 괴현상 그림의 움직임 (그리지 않고 계산만). 도트 게임답게 초당 12장으로 끊어 움직이고,
 * 반투명 대신 체커 무늬로 스민다(dither 0~4: 0 = 안 보임, 4 = 다 보임). 팔레트 밖 중간색이 생기지 않게.
 * clip: 그림의 보이는 부분(0~1 비율, [왼, 위, 오른, 아래]). dx·dy는 화면 도트, sx·sy는 배율.
 */
/** lid: 눈꺼풀 0 뜸 · 1 반쯤 감김 · 2 감김 (눈 종류만. 감은 그림에서 잘라 온 눈꺼풀 덧그림을 고른다) */
export interface ApparitionAnim { show: boolean; dx: number; dy: number; sx: number; sy: number; clip: [number, number, number, number]; dither: number; glass?: number; lid: 0 | 1 | 2 }

/**
 * 눈꺼풀 (초당 12장 기준 장 번호 n, 전체 total장).
 * 처음 open장 동안 감김(마지막 두 장은 반쯤) → 뜸. blinks의 각 시각(초)에 반쯤·감김·반쯤 세 장.
 * 마지막 close장 동안 반쯤(처음 두 장) → 감김.
 */
function lidAt(n: number, total: number, open: number, close: number, blinks: readonly number[]): 0 | 1 | 2 {
  const left = total - n;
  if (n < open - 2 || left <= close - 2) return 2;
  if (n < open || left <= close) return 1;
  for (const b of blinks) {
    const k = n - Math.round(b * 12);
    if (k === 1) return 2;
    if (k === 0 || k === 2) return 1;
  }
  return 0;
}

export function apparitionAnim(kind: ApparitionKind, tt: number, dur: number, reduced: boolean): ApparitionAnim {
  const base: ApparitionAnim = { show: true, dx: 0, dy: 0, sx: 1, sy: 1, clip: [0, 0, 1, 1], dither: 4, lid: 0 };
  if (reduced) return base;
  const f = Math.floor(tt * 12) / 12; // 초당 12장
  const end = dur - f; // 남은 시간
  const ramp = (t: number, len: number): number => Math.min(1, Math.max(0, Math.floor((t / len) * 4) / 4)); // 4단계
  const n = Math.floor(tt * 12), total = Math.round(dur * 12);
  switch (kind) {
    case 'doorGapEyes': {
      // 유리가 먼저 어둡게 꺼지고(glass) 그 안에서 뜬 눈의 얼굴이 스며 나온다 → 깜빡이지 않고 쳐다보다 스며 사라진다
      const inn = ramp(f, 0.3), out = ramp(end, 0.2);
      return { ...base, glass: Math.min(ramp(f, 0.15), ramp(end, 0.12)), dither: Math.round(4 * Math.min(inn, out)) };
    }
    case 'hallHand': {
      // 바닥에서 천천히 올라온다 → 손가락이 경련하듯 떨린다 → 휙 꺼진다
      const up = Math.min(1, f / 0.5), down = end < 0.12 ? 0 : 1;
      const rise = Math.floor(up * 8) / 8 * down;
      return { ...base, show: rise > 0, clip: [0, 1 - rise, 1, 1], dy: 0, dx: f > 0.5 && Math.floor(f * 12) % 3 === 0 ? 1 : 0 };
    }
    case 'shelfFingers': {
      // 가장자리로 기어 올라온다 → 끝에서 툭 미끄러져 사라진다
      const up = Math.floor(Math.min(1, f / 0.35) * 4) / 4;
      if (end < 0.12) return { ...base, show: false };
      return { ...base, clip: [0, 1 - up, 1, 1] };
    }
    case 'mirrorFace': {
      // 스며 나온다 → 유리에 쾅 부딪히듯 한 번 커진다 → 스며 사라진다
      const slam = f >= 0.5 && f < 0.67;
      return { ...base, dither: Math.round(4 * Math.min(ramp(f, 0.3), ramp(end, 0.3))), sx: slam ? 1.12 : 1, sy: slam ? 1.12 : 1 };
    }
    case 'mirrorFigure': {
      // 멀리 서 있다가 끊기듯 두 번 다가온다 (움직이는 장면은 보이지 않고 위치만 바뀐다) → 툭 사라진다
      const s = f < 0.6 ? 0.62 : f < 1.2 ? 0.8 : 1;
      return { ...base, sx: s, sy: s, dither: f < 0.15 ? 2 : 4 };
    }
    case 'giantEyes': {
      // 감긴 채 스며 나온다 → 눈꺼풀이 천천히 올라간다 → 한 번 깜빡인다 → 감기고 스며 사라진다
      return { ...base, dither: Math.round(4 * Math.min(ramp(f, 0.25), ramp(end, 0.17))), lid: lidAt(n, total, 6, 5, [dur * 0.55]) };
    }
    case 'eyesMany': {
      // 감긴 채 스며 나와 한꺼번에 뜬다 → 숨 쉬듯 부풀었다 줄었다 하며 한 번 깜빡인다 → 감기고 스며 사라진다
      const breathe = Math.floor(f * 4) % 2 === 0 ? 1 : 0.94;
      return { ...base, dither: Math.round(4 * Math.min(ramp(f, 0.4), ramp(end, 0.2))), sx: breathe, sy: breathe, lid: lidAt(n, total, 6, 5, [dur * 0.5]) };
    }
    case 'blood': {
      // 손자국에서 아래로 흘러내린다 (16단계)
      const flow = Math.max(0.18, Math.floor(Math.min(1, f / 1.4) * 16) / 16);
      return { ...base, clip: [0, 0, 1, flow] };
    }
    default:
      return base;
  }
}

function eye(l: Layer, x: number, y: number, shut: boolean): void {
  if (shut) { hline(l, 'mist', x - 2, y, 5); return; }
  hline(l, 'paper', x - 2, y, 5);
  hline(l, 'bone', x - 1, y - 1, 3);
  hline(l, 'bone', x - 1, y + 1, 3);
  px(l, 'ink', x, y);
}

export function drawApparition(l: Layer, a: Apparition, p: number, reduced: boolean): void {
  const shut = !reduced && p > 0.82; // 사라지기 직전에 눈을 감는다
  switch (a.kind) {
    case 'eyes':
      eye(l, a.x - 4, a.y, shut);
      eye(l, a.x + 4, a.y, shut);
      break;
    case 'eyesMany':
      for (const [dx, dy, d] of [[0, 0, 0], [8, -6, 0.15], [-7, 9, 0.3], [6, 12, 0.45], [-3, 22, 0.6]] as const) {
        if (!reduced && p < d) continue; // 하나씩 뜬다
        eye(l, a.x + dx - 3, a.y + dy, shut);
        eye(l, a.x + dx + 3, a.y + dy, shut);
      }
      break;
    case 'hand': {
      // 창백한 손바닥 + 손가락 다섯 (유리에 눌린 자국)
      rect(l, 'bone', a.x - 3, a.y, 7, 6);
      for (const [dx, h] of [[-3, 4], [-1, 6], [1, 6], [3, 5]] as const) vline(l, 'bone', a.x + dx, a.y - h, h);
      line(l, 'bone', a.x - 4, a.y + 2, a.x - 7, a.y - 1); // 엄지
      dither(l, 'ash', null, a.x - 3, a.y, 7, 6);
      hline(l, 'mist', a.x - 3, a.y + 6, 7);
      break;
    }
    case 'blood': {
      // 위에서 번진 얼룩이 한 줄기로 흘러내린다
      ellipse(l, 'wine', a.x, a.y, 3, 2);
      px(l, 'wine-dark', a.x + 2, a.y + 1);
      const len = reduced ? 22 : Math.round(4 + 22 * Math.min(1, p * 1.6));
      vline(l, 'wine', a.x, a.y, len);
      vline(l, 'wine-dark', a.x + 1, a.y + 2, Math.max(0, len - 6));
      vline(l, 'wine', a.x - 2, a.y + 1, Math.round(len * 0.4));
      px(l, 'wine', a.x, a.y + len + 1); // 맺힌 방울
      break;
    }
    case 'doorGapEyes': {
      // 출입문 두 짝 사이가 한 뼘 벌어져 있다. 그 어둠 속에 눈 두 개 (레퍼런스: 문틈의 눈)
      rect(l, 'ink', a.x - 2, 32, 5, 76);
      vline(l, 'shadow', a.x - 3, 32, 76);
      if (!shut) { px(l, 'paper', a.x - 1, a.y); px(l, 'paper', a.x + 1, a.y); px(l, 'bone', a.x - 1, a.y + 1); px(l, 'bone', a.x + 1, a.y + 1); }
      break;
    }
    case 'hallHand': {
      // 작게, 손바닥을 이쪽으로 든 하얀 손 하나 (레퍼런스: 복도 끝의 손)
      rect(l, 'bone', a.x - 2, a.y, 5, 4);
      for (const [dx, h] of [[-2, 3], [-1, 4], [0, 4], [1, 4]] as const) vline(l, 'bone', a.x + dx, a.y - h, h);
      px(l, 'bone', a.x + 3, a.y + 1);
      vline(l, 'ash', a.x, a.y + 4, 6); // 아래로 가늘게 이어지는 팔
      break;
    }
    case 'shelfFingers':
      // 맨 위 선반 너머로 걸친 손가락 넷: 선반 뒤에 무언가가 있다
      for (const dx of [0, 3, 6, 9]) { rect(l, 'bone', a.x + dx, a.y - 3, 2, 3); px(l, 'paper', a.x + dx, a.y - 3); px(l, 'mist', a.x + dx + 1, a.y - 1); }
      break;
    case 'mirrorVoid':
      // 거울이 아무것도 비추지 않는다: 유리 전체가 검은 면 (레퍼런스: 창 대신 뚫린 어둠)
      ellipse(l, 'ink', a.x, 35, 14, 10);
      rect(l, 'ink', 10, 35, 27, 85);
      break;
    case 'mirrorFigure': {
      // 거울 안에 서 있는 긴 머리 실루엣 (레퍼런스: 금 간 거울 속 인물)
      const fx = a.x, foot = a.y;
      polygon(l, 'shadow', [[fx - 6, foot], [fx - 5, foot - 44], [fx - 7, foot - 58], [fx + 7, foot - 58], [fx + 5, foot - 44], [fx + 6, foot]]);
      ellipse(l, 'ink', fx, foot - 64, 5, 7);
      rect(l, 'ink', fx - 6, foot - 64, 12, 18); // 얼굴을 덮은 긴 머리
      for (const dx of [-5, -2, 2, 5]) vline(l, 'ink', fx + dx, foot - 46, 8 + (dx & 3));
      line(l, 'ash', fx - 13, foot - 80, fx + 12, foot - 30); // 거울에 간 금
      break;
    }
    case 'noiseFigure': {
      // 지직거리는 노이즈로 된 사람 모양 (레퍼런스: "YOU'RE FINALLY HERE."). 그릴 때마다 노이즈가 바뀐다
      // 지직거리며 한두 도트씩 흔들린다
      const fx = a.x + (reduced ? 0 : Math.floor(Math.random() * 3) - 1), foot = a.y;
      const inside = (x: number, y: number): boolean => {
        const hy = foot - 52;
        if ((x - fx) ** 2 / 16 + (y - hy) ** 2 / 25 <= 1) return true; // 머리
        if (y >= foot - 46 && y <= foot) { const half = 5 + Math.round((y - (foot - 46)) * 0.12); return Math.abs(x - fx) <= half; } // 몸
        return false;
      };
      let seed = reduced ? 7 : Math.floor(Math.random() * 1e6);
      const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let y = foot - 58; y <= foot; y++) for (let x = fx - 11; x <= fx + 11; x++) {
        if (!inside(x, y)) continue;
        const r = rnd();
        px(l, r < 0.45 ? 'paper' : r < 0.7 ? 'ash' : r < 0.85 ? 'mist' : 'ink', x, y);
      }
      break;
    }
    case 'giantEyes': {
      // 벽 위쪽 전체를 덮는 거대한 두 눈 (레퍼런스: 하늘을 덮은 분홍 눈). 붕괴 단계에서만
      for (const ex of [a.x - 52, a.x + 52]) {
        ellipse(l, shut ? 'shadow' : 'bone', ex, a.y, 26, shut ? 2 : 10);
        if (shut) continue;
        ellipse(l, 'rose-dark', ex, a.y, 9, 9);
        ellipse(l, 'rose', ex, a.y, 7, 7);
        ellipse(l, 'ink', ex, a.y, 3, 4);
        px(l, 'paper', ex - 3, a.y - 3);
        ellipseLine(l, 'ink', ex, a.y, 26, 10);
      }
      break;
    }
    case 'mirrorFace':
      // 거울 속, 내 쪽을 보는 창백한 얼굴
      ellipse(l, 'bone', a.x, a.y, 5, 7);
      dither(l, 'ash', null, a.x - 5, a.y + 2, 11, 5);
      rect(l, 'ink', a.x - 3, a.y - 2, 2, 2);
      rect(l, 'ink', a.x + 2, a.y - 2, 2, 2);
      hline(l, 'ink', a.x - 1, a.y + 4, 3);
      break;
  }
}
