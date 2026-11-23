import { Layer, circle, dither, ellipse, hline, line, lit, polygon, px, rect, selOutline, smooth, stamp, vline } from './pixel';
import type { PaletteKey } from './palette';
import { COUNTER_Y, CUSTOMER_X, type Shift } from './scene';

/**
 * 손님 도트. 사람형은 파라미터 생성기(머리 · 피부 · 옷 · 소품), 크리처는 전용 함수.
 * 로컬 좌표: 가로 중심 CX, 카운터 윗선이 BASE. 월드로는 (CUSTOMER_X-CX, COUNTER_Y-BASE)만큼 옮긴다.
 */
export interface SpriteParams {
  hair?: string; hairColor?: string; skin?: string; outfit?: string; accent?: string; face?: string; mask?: string;
  kind?: string; draw?: string;
}
export interface Anim { t: number; reduced: boolean; shift: Shift }
export interface Targets { mid: Layer; top: Layer }

type K = PaletteKey;
const CX = 56;
const BASE = 100;
const SW = 112;
const SH = 112;

type Tones = readonly [K, K, K]; // [어두움, 기본, 밝음]
const HAIR_TONES: Record<string, Tones> = {
  ink: ['ink', 'shadow', 'stone'],
  hair: ['ink', 'hair', 'mist'],
  bone: ['ash', 'bone', 'paper'],
  paper: ['bone', 'paper', 'paper'],
  stone: ['dusk', 'stone', 'mist'],
  ash: ['stone', 'ash', 'bone'],
};
const SKIN_TONES: Record<string, Tones> = {
  'skin-a': ['skin-b', 'skin-a', 'skin-c'],
  'skin-b': ['stone', 'skin-b', 'skin-a'],
  paper: ['ash', 'bone', 'paper'],
};
const OUTFIT_TONES: Record<string, Tones> = {
  shadow: ['ink', 'shadow', 'stone'],
  dusk: ['shadow', 'dusk', 'mist'],
  stone: ['dusk', 'stone', 'ash'],
  rose: ['rose-dark', 'rose', 'rose-light'],
  paper: ['bone', 'paper', 'paper'],
  brass: ['brass-dark', 'brass', 'brass-light'],
  ink: ['ink', 'ink', 'dusk'],
};
const tone = (m: Record<string, Tones>, k: string | undefined, fb: string): Tones => (m[k ?? fb] ?? m[fb]) as Tones;

/** 이 손님만의 보정 (데이터의 sprite 파라미터 위에 얹는다) */
interface Extra { hairLen?: number; glasses?: boolean; mood?: 'smile' | 'stern' | 'soft' | 'flat' | 'grin' | 'worry'; style?: string; hair?: string; taller?: number }
const EXTRA: Record<string, Extra> = {
  hanyeoreum: { mood: 'soft', style: 'dress' },
  kang: { mood: 'stern', style: 'suit' },
  jin: { mood: 'flat', style: 'mourning' },
  oh: { mood: 'grin', style: 'fur' },
  cha: { mood: 'grin', style: 'hoodie', hair: 'beanie', glasses: true },
  park: { mood: 'soft', style: 'cardigan' },
  yoon: { mood: 'flat', style: 'turtle', glasses: true },
  seojin: { mood: 'flat', style: 'coat', hairLen: 100 },
  marsh: { mood: 'flat', style: 'suit' },
  faceless: { style: 'coat', hairLen: 98 },
  baek: { mood: 'flat', style: 'coat', hairLen: 92 },
  actor: { style: 'cloak', taller: 5 },
  seoyun: { mood: 'flat', style: 'suit', hair: 'bob' },
};

// ───────────────────────── 머리카락

function hairBack(l: Layer, style: string, T3: Tones, len: number): void {
  const [lo, base, hi] = T3;
  switch (style) {
    case 'bob':
      ellipse(l, base, CX, 34, 15, 17);
      rect(l, base, CX - 15, 36, 31, 17);
      break;
    case 'perm': {
      for (const [dx, dy, r] of [[-12, -6, 7], [0, -13, 8], [12, -6, 7], [-16, 4, 6], [16, 4, 6], [-14, 14, 6], [14, 14, 6], [0, -6, 12], [-7, -11, 6], [7, -11, 6]] as const) circle(l, base, CX + dx, 32 + dy, r);
      rect(l, base, CX - 17, 32, 35, 14);
      break;
    }
    case 'long':
      ellipse(l, base, CX, 33, 15, 17);
      polygon(l, base, [[CX - 16, 34], [CX + 16, 34], [CX + 20, len - 8], [CX + 14, len], [CX - 14, len], [CX - 20, len - 8]]);
      break;
    case 'bun':
      ellipse(l, base, CX, 33, 13, 15);
      circle(l, base, CX, 14, 7);
      circle(l, hi, CX - 2, 12, 2);
      hline(l, lo, CX - 5, 18, 11);
      break;
    case 'ponytail':
      ellipse(l, base, CX, 33, 13, 15);
      polygon(l, base, [[CX + 10, 26], [CX + 20, 30], [CX + 22, 56], [CX + 16, 66], [CX + 12, 50]]);
      line(l, hi, CX + 17, 32, CX + 18, 54);
      break;
    case 'wet':
      ellipse(l, base, CX, 33, 13, 15);
      break;
    case 'beanie':
      ellipse(l, 'hair', CX, 34, 13, 14);
      break;
    case 'slick':
    case 'short':
      ellipse(l, base, CX, 32, 13, 15);
      break;
    default:
      break;
  }
}

function hairFront(l: Layer, style: string, T3: Tones, len: number, a: { blink: boolean }): void {
  const [lo, base, hi] = T3;
  const fringe = (y1: number, depth: number): void => {
    for (let x = CX - 12; x <= CX + 12; x++) {
      const d = Math.round(depth - Math.abs(x - CX - 2) * 0.12 + ((x * 7) % 3 === 0 ? 1 : 0));
      vline(l, base, x, 21, y1 - 21 + d);
    }
  };
  switch (style) {
    case 'bob':
      ellipse(l, base, CX, 27, 13, 8);
      fringe(30, 3);
      // 옆머리 + 안쪽으로 말린 끝
      rect(l, base, CX - 15, 34, 5, 16); rect(l, base, CX + 11, 34, 5, 16);
      px(l, base, CX - 11, 50); px(l, base, CX + 11, 50);
      for (const dx of [-13, -11, 12, 14]) vline(l, lo, CX + dx, 36, 13);
      hline(l, hi, CX - 10, 24, 8);
      px(l, hi, CX - 11, 26); px(l, hi, CX + 4, 25);
      hline(l, lo, CX - 14, 51, 6); hline(l, lo, CX + 10, 51, 6);
      break;
    case 'perm':
      for (const [dx, r] of [[-9, 5], [-3, 5], [4, 5], [10, 5]] as const) circle(l, base, CX + dx, 22, r);
      for (const [dx, dy] of [[-9, 18], [2, 17], [9, 20], [-4, 21]] as const) px(l, hi, CX + dx, dy);
      for (const dx of [-14, -12, 13, 15]) circle(l, lo, CX + dx, 44, 1);
      circle(l, hi, CX - 12, 12, 1); circle(l, hi, CX + 6, 11, 1);
      break;
    case 'long': {
      fringe(30, 2);
      // 가운데 가르마
      vline(l, lo, CX, 18, 8);
      rect(l, base, CX - 16, 30, 7, len - 30); rect(l, base, CX + 10, 30, 7, len - 30);
      for (const dx of [-14, -12, 12, 14]) vline(l, lo, CX + dx, 32, len - 34);
      vline(l, hi, CX - 15, 34, 24); vline(l, hi, CX + 11, 34, 18);
      hline(l, hi, CX - 9, 21, 8);
      break;
    }
    case 'bun':
      ellipse(l, base, CX, 24, 13, 6);
      fringe(27, 2);
      hline(l, hi, CX - 9, 22, 7);
      hline(l, lo, CX - 12, 28, 4); hline(l, lo, CX + 9, 28, 4);
      rect(l, base, CX - 14, 30, 3, 10); rect(l, base, CX + 12, 30, 3, 10);
      break;
    case 'ponytail':
      ellipse(l, base, CX, 24, 13, 6);
      fringe(29, 1);
      hline(l, hi, CX - 8, 22, 8);
      px(l, hi, CX - 4, 25);
      // 헤어핀
      rect(l, 'brass', CX - 12, 29, 5, 2); px(l, 'brass-light', CX - 12, 29);
      break;
    case 'slick':
      ellipse(l, base, CX, 24, 13, 6);
      rect(l, base, CX - 13, 24, 27, 5);
      line(l, lo, CX - 3, 18, CX - 6, 27);
      hline(l, hi, CX - 8, 21, 14);
      px(l, hi, CX + 8, 23);
      rect(l, base, CX - 14, 28, 3, 8); rect(l, base, CX + 12, 28, 3, 8);
      break;
    case 'short':
      ellipse(l, base, CX, 24, 13, 6);
      fringe(27, 2);
      hline(l, hi, CX - 8, 21, 7);
      rect(l, base, CX - 14, 28, 3, 6); rect(l, base, CX + 12, 28, 3, 6);
      break;
    case 'beanie': {
      ellipse(l, 'shadow', CX, 22, 14, 8);
      rect(l, 'shadow', CX - 14, 22, 29, 8);
      for (let x = CX - 14; x <= CX + 14; x += 2) vline(l, 'dusk', x, 26, 5);
      hline(l, 'stone', CX - 12, 19, 8);
      rect(l, 'dusk', CX - 14, 29, 29, 1);
      // 삐져나온 앞머리
      for (const dx of [-9, -5, 3, 8]) px(l, 'hair', CX + dx, 31);
      circle(l, 'steel', CX, 11, 3);
      px(l, 'steel-light', CX - 1, 10);
      break;
    }
    case 'wet':
      ellipse(l, base, CX, 25, 13, 7);
      for (let x = CX - 12; x <= CX + 12; x += 3) vline(l, base, x, 24, 7 + ((x * 5) % 4));
      for (let x = CX - 13; x <= CX + 12; x += 3) vline(l, lo, x + 1, 22, 8);
      hline(l, hi, CX - 8, 21, 8);
      // 물방울 (steel)
      px(l, 'steel-light', CX - 11, 36 + (a.blink ? 1 : 0)); px(l, 'steel', CX + 12, 38);
      break;
    default:
      break;
  }
}

// ───────────────────────── 얼굴

function face(l: Layer, S: Tones, H: Tones, e: Extra, o: { eyesClosed: boolean; flat?: boolean; noFace?: boolean; big?: boolean; look?: number }): void {
  const [lo, base, hi] = S;
  const cy = 36;
  ellipse(l, base, CX, cy, 11, 13);
  rect(l, base, CX - 10, cy - 2, 21, 8);
  lit(l, base, hi, lo, CX - 11, cy - 13, 23, 27, [-0.6, -0.5], false);
  // 턱 선: 아래쪽 좁힘
  px(l, lo, CX - 8, cy + 11); px(l, lo, CX + 8, cy + 11);
  // 귀
  rect(l, base, CX - 12, cy, 2, 4); rect(l, base, CX + 11, cy, 2, 4);
  px(l, lo, CX - 12, cy + 1); px(l, lo, CX + 12, cy + 1);
  // 목
  rect(l, base, CX - 5, cy + 12, 11, 8);
  rect(l, lo, CX - 5, cy + 12, 11, 3);
  vline(l, lo, CX + 5, cy + 12, 8);
  if (o.noFace) return;
  const eyeY = cy + 1;
  const lookX = o.look ?? 0;
  const eye = (cx: number): void => {
    if (o.eyesClosed) { hline(l, 'ink', cx - 1, eyeY + 1, 3); return; }
    if (o.big) {
      // 마시 씨: 깜빡이지 않는 큰 steel 눈, 눈꺼풀 없음
      rect(l, 'steel', cx - 2, eyeY - 2, 5, 5);
      rect(l, 'steel-light', cx - 2, eyeY - 2, 5, 1);
      rect(l, 'steel-dark', cx - 2, eyeY + 2, 5, 1);
      rect(l, 'ink', cx - 1 + lookX, eyeY - 1, 2, 3);
      px(l, 'paper', cx - 1 + lookX, eyeY - 1);
      return;
    }
    rect(l, 'paper', cx - 2, eyeY, 5, 2);
    rect(l, 'ink', cx - 1 + lookX, eyeY, 2, 2);
    px(l, 'paper', cx - 1 + lookX, eyeY);
    hline(l, lo, cx - 2, eyeY - 1, 5); // 윗눈꺼풀 그림자
    hline(l, lo, cx - 2, eyeY + 2, 5);
  };
  eye(CX - 5);
  eye(CX + 5);
  // 눈썹
  const [, bc] = H;
  const brow = (x: number, dy: number, tilt: number): void => { hline(l, bc, x - 2, eyeY - 3 + dy, 5); px(l, bc, x + 2 * tilt, eyeY - 3 + dy - 1); };
  if (e.mood === 'stern') { brow(CX - 5, 0, 1); brow(CX + 5, 0, -1); }
  else if (e.mood === 'worry') { brow(CX - 5, -1, -1); brow(CX + 5, -1, 1); }
  else { brow(CX - 5, 0, 0); brow(CX + 5, 0, 0); }
  if (e.glasses) {
    for (const cx of [CX - 5, CX + 5]) {
      rect(l, 'ink', cx - 4, eyeY - 2, 9, 1); rect(l, 'ink', cx - 4, eyeY + 4, 9, 1);
      vline(l, 'ink', cx - 4, eyeY - 2, 7); vline(l, 'ink', cx + 4, eyeY - 2, 7);
      px(l, 'steel-light', cx - 3, eyeY - 1);
    }
    hline(l, 'ink', CX - 1, eyeY, 3);
  }
  // 코: 그림자 1~2도트
  px(l, lo, CX, cy + 5); px(l, lo, CX - 1, cy + 6); px(l, hi, CX - 1, cy + 4);
  // 볼 음영
  px(l, lo, CX - 8, cy + 6); px(l, lo, CX + 8, cy + 6);
  // 입: 성격별 표정
  const my = cy + 9;
  switch (e.mood) {
    case 'smile': case 'soft':
      hline(l, 'wine-dark', CX - 1, my, 3); px(l, lo, CX - 3, my - 1); px(l, lo, CX + 3, my - 1); hline(l, lo, CX - 2, my + 1, 5);
      break;
    case 'grin':
      rect(l, 'wine-dark', CX - 4, my - 1, 9, 3);
      rect(l, 'paper', CX - 3, my - 1, 7, 1);
      px(l, 'wine-dark', CX - 5, my - 2); px(l, 'wine-dark', CX + 5, my - 2);
      break;
    case 'stern':
      hline(l, 'wine-dark', CX - 3, my, 7); px(l, 'wine-dark', CX - 4, my + 1); px(l, 'wine-dark', CX + 4, my + 1);
      break;
    case 'worry':
      hline(l, 'wine-dark', CX - 2, my, 5);
      break;
    default:
      hline(l, 'wine-dark', CX - 2, my, 5);
      px(l, lo, CX, my + 1);
  }
}

// ───────────────────────── 옷

function torsoBase(l: Layer, O: Tones, bodyY = 56): void {
  const [lo, base, hi] = O;
  polygon(l, base, [[28, bodyY + 10], [32, bodyY + 4], [44, bodyY], [68, bodyY], [80, bodyY + 4], [84, bodyY + 10], [86, BASE], [26, BASE]]);
  lit(l, base, hi, lo, 26, bodyY, 61, BASE - bodyY, [-0.45, -0.3]);
  // 팔 경계 (소매 솔기)와 접힘
  vline(l, lo, 36, bodyY + 12, BASE - bodyY - 12);
  vline(l, lo, 76, bodyY + 12, BASE - bodyY - 12);
  line(l, lo, 40, bodyY + 22, 44, BASE - 8);
  line(l, lo, 72, bodyY + 24, 68, BASE - 6);
  // 목 아래 AO
  rect(l, lo, CX - 5, bodyY, 11, 2);
}

function garment(l: Layer, style: string, O: Tones, S: Tones, accent: K): void {
  const [lo, base, hi] = O;
  const bodyY = style === 'cloak' ? 52 : 56;
  torsoBase(l, O, bodyY);
  const neckSkin = S[1];
  switch (style) {
    case 'dress': { // 한여름: 검은 원피스 + 흰 피터팬 칼라 + 단추
      polygon(l, 'paper', [[CX - 14, bodyY + 2], [CX - 4, bodyY + 4], [CX, bodyY + 9], [CX + 4, bodyY + 4], [CX + 14, bodyY + 2], [CX + 12, bodyY + 9], [CX, bodyY + 14], [CX - 12, bodyY + 9]]);
      lit(l, 'paper', 'paper', 'bone', CX - 14, bodyY + 2, 28, 12);
      hline(l, 'ash', CX - 11, bodyY + 9, 8); hline(l, 'ash', CX + 4, bodyY + 9, 8);
      for (const y of [bodyY + 16, bodyY + 22, bodyY + 28]) { px(l, 'bone', CX, y); px(l, 'ash', CX + 1, y + 1); }
      vline(l, lo, CX, bodyY + 14, 30);
      // 어깨 가방 끈 (rose)
      line(l, 'rose', CX + 15, bodyY + 4, CX + 22, BASE - 10); line(l, 'rose', CX + 16, bodyY + 4, CX + 23, BASE - 10);
      line(l, 'rose-light', CX + 14, bodyY + 4, CX + 21, BASE - 10);
      rect(l, 'rose', CX + 18, BASE - 10, 10, 10);
      rect(l, 'rose-light', CX + 18, BASE - 10, 10, 2);
      rect(l, 'rose-dark', CX + 18, BASE - 3, 10, 3);
      rect(l, 'brass', CX + 22, BASE - 8, 3, 2);
      break;
    }
    case 'suit': case 'cardigan': {
      // 칼라 + 셔츠 + 타이 + 라펠
      polygon(l, 'paper', [[CX - 8, bodyY], [CX + 8, bodyY], [CX, bodyY + 18]]);
      lit(l, 'paper', 'paper', 'bone', CX - 8, bodyY, 16, 18);
      if (style === 'suit') { polygon(l, 'ink', [[CX - 2, bodyY + 3], [CX + 2, bodyY + 3], [CX + 3, bodyY + 18], [CX, bodyY + 21], [CX - 3, bodyY + 18]]); vline(l, 'dusk', CX - 1, bodyY + 4, 14); }
      polygon(l, lo, [[CX - 8, bodyY], [CX - 11, bodyY + 4], [CX - 2, bodyY + 24], [CX - 1, bodyY + 18]]);
      polygon(l, lo, [[CX + 8, bodyY], [CX + 11, bodyY + 4], [CX + 2, bodyY + 24], [CX + 1, bodyY + 18]]);
      line(l, hi, CX - 11, bodyY + 4, CX - 3, bodyY + 22);
      vline(l, lo, CX, bodyY + 24, BASE - bodyY - 24);
      for (const y of [bodyY + 26, bodyY + 34]) rect(l, hi, CX + 3, y, 2, 2);
      // 가슴주머니
      hline(l, hi, CX + 12, bodyY + 20, 8); rect(l, lo, CX + 12, bodyY + 21, 8, 1);
      break;
    }
    case 'mourning': { // 진영숙: 높은 목선 + 진주 목걸이 (알 하나 빠짐)
      rect(l, neckSkin, CX - 6, bodyY, 13, 3);
      polygon(l, lo, [[CX - 8, bodyY - 1], [CX + 8, bodyY - 1], [CX + 5, bodyY + 3], [CX - 5, bodyY + 3]]);
      polygon(l, neckSkin, [[CX - 5, bodyY], [CX + 5, bodyY], [CX, bodyY + 8]]);
      // 진주 알 (9개 중 하나 빠짐)
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = Math.round(CX - 11 + 22 * t), y = Math.round(bodyY + 4 + 8 * Math.sin(Math.PI * t));
        if (i === 6) continue;
        circle(l, 'bone', x, y, 1); px(l, 'paper', x, y);
      }
      // 빠진 자리의 빈 점 (줄이 드러남)
      px(l, 'ash', CX + 6, bodyY + 11);
      // 브로치
      rect(l, 'ash', CX - 10, bodyY + 16, 3, 3); px(l, 'bone', CX - 10, bodyY + 16);
      for (const dx of [-14, 14]) line(l, hi, CX + dx, bodyY + 20, CX + dx * 0.8, BASE - 6);
      break;
    }
    case 'fur': { // 오미란: 퍼 칼라 코트
      for (let x = CX - 22; x <= CX + 22; x += 2) {
        const h = 6 + ((x * 3) % 3);
        rect(l, 'ash', x, bodyY - 2 + (Math.abs(x - CX) > 14 ? 4 : 0), 2, h);
      }
      for (let x = CX - 22; x <= CX + 22; x += 3) px(l, 'bone', x, bodyY + (Math.abs(x - CX) > 14 ? 4 : 0));
      polygon(l, S[1], [[CX - 6, bodyY], [CX + 6, bodyY], [CX, bodyY + 10]]);
      for (let x = CX - 22; x <= CX + 22; x += 3) px(l, 'mist', x + 1, bodyY + 6 + (Math.abs(x - CX) > 14 ? 4 : 0));
      // 진주 목걸이 줄 (화려)
      for (let i = 0; i < 7; i++) { const t = i / 6; px(l, 'paper', Math.round(CX - 8 + 16 * t), Math.round(bodyY + 8 + 6 * Math.sin(Math.PI * t))); }
      vline(l, lo, CX, bodyY + 14, 30);
      break;
    }
    case 'hoodie': { // 차은호: 후드 + 끈
      polygon(l, lo, [[CX - 18, bodyY + 2], [CX - 6, bodyY - 2], [CX + 6, bodyY - 2], [CX + 18, bodyY + 2], [CX + 12, bodyY + 12], [CX - 12, bodyY + 12]]);
      polygon(l, S[1], [[CX - 6, bodyY - 1], [CX + 6, bodyY - 1], [CX, bodyY + 8]]);
      vline(l, 'bone', CX - 4, bodyY + 8, 12); vline(l, 'bone', CX + 4, bodyY + 8, 12);
      px(l, 'ash', CX - 4, bodyY + 20); px(l, 'ash', CX + 4, bodyY + 20);
      rect(l, lo, CX - 14, BASE - 18, 29, 2); // 캥거루 주머니 윗선
      hline(l, hi, CX - 13, BASE - 19, 27);
      // 백팩 끈 (steel)
      vline(l, 'steel-dark', CX - 20, bodyY + 6, 36); vline(l, 'steel', CX - 19, bodyY + 6, 36);
      vline(l, 'steel-dark', CX + 20, bodyY + 6, 36); vline(l, 'steel', CX + 19, bodyY + 6, 36);
      break;
    }
    case 'turtle': { // 윤재희: 터틀넥 + rose 스카프
      rect(l, base, CX - 7, bodyY - 6, 15, 8);
      hline(l, hi, CX - 7, bodyY - 6, 15); for (let y = bodyY - 4; y < bodyY + 2; y += 2) hline(l, lo, CX - 7, y, 15);
      polygon(l, 'rose', [[CX + 8, bodyY + 4], [CX + 22, bodyY + 12], [CX + 26, BASE - 4], [CX + 14, BASE - 4], [CX + 14, bodyY + 20]]);
      lit(l, 'rose', 'rose-light', 'rose-dark', CX + 8, bodyY + 4, 19, 40);
      line(l, 'rose-dark', CX + 16, bodyY + 18, CX + 19, BASE - 6);
      break;
    }
    case 'coat': { // 단추를 끝까지 채운 긴 코트
      polygon(l, hi, [[CX - 8, bodyY], [CX - 12, bodyY + 3], [CX - 3, bodyY + 20], [CX - 1, bodyY + 12]]);
      polygon(l, lo, [[CX + 8, bodyY], [CX + 12, bodyY + 3], [CX + 3, bodyY + 20], [CX + 1, bodyY + 12]]);
      polygon(l, S[1], [[CX - 5, bodyY], [CX + 5, bodyY], [CX, bodyY + 10]]);
      vline(l, lo, CX, bodyY + 20, BASE - bodyY - 20);
      for (const y of [bodyY + 22, bodyY + 30, bodyY + 38]) { rect(l, accent === 'rose' ? 'rose-dark' : lo, CX + 2, y, 2, 2); px(l, hi, CX + 2, y); }
      for (const dx of [-12, 14]) line(l, lo, CX + dx, bodyY + 14, CX + dx + (dx < 0 ? -1 : 1), BASE - 4);
      break;
    }
    case 'cloak': { // 배우: 해진 황동 망토, 세운 깃
      polygon(l, base, [[22, 47], [34, 52], [CX - 6, bodyY - 8], [CX + 6, bodyY - 8], [78, 52], [90, 47], [86, 64], [86, BASE], [26, BASE], [26, 64]]);
      lit(l, base, hi, lo, 22, 47, 68, BASE - 47, [-0.5, -0.4]);
      polygon(l, lo, [[34, 52], [42, 46], [CX - 6, bodyY - 8]]);
      polygon(l, lo, [[78, 52], [70, 46], [CX + 6, bodyY - 8]]);
      for (const [x, y, w, h] of [[34, 70, 2, 10], [60, 64, 2, 14], [74, 78, 2, 12], [44, 84, 3, 10]] as const) rect(l, 'ink', x, y, w, h); // 해진 구멍
      for (let x = 26; x <= 84; x += 4) rect(l, 'brass-dark', x, BASE - 4 + ((x * 3) % 3), 2, 4); // 너덜한 단
      line(l, lo, 40, 58, 36, BASE);
      line(l, lo, 72, 58, 78, BASE);
      break;
    }
    default:
      break;
  }
}

// ───────────────────────── 손과 소품 (카운터 위)

function hand(l: Layer, x: number, y: number, S: Tones, fingers = 4, flip = false): void {
  const [lo, base, hi] = S;
  rect(l, base, x, y, 9, 5);
  rect(l, base, x + (flip ? 0 : 1), y + 5, 7, 2);
  hline(l, hi, x + 1, y, 6);
  hline(l, lo, x, y + 6, 9);
  for (let i = 0; i < fingers; i++) vline(l, lo, x + 1 + Math.floor((i * 7) / fingers) + 1, y + 3, 3);
  px(l, lo, x + 8, y + 1); // 엄지 그림자
  // 카운터에 닿는 곳 AO
  hline(l, 'ink', x + 1, y + 7, 8);
}
function cuff(l: Layer, x: number, w: number, O: Tones, y = 99): void {
  rect(l, O[1], x, y, w, 4);
  hline(l, O[2], x, y, w);
  hline(l, O[0], x, y + 3, w);
}

// ───────────────────────── 사람형

export interface HumanOut { mid: Layer; top: Layer }

export function drawHuman(id: string, p: SpriteParams, anim: Anim): HumanOut {
  const e = EXTRA[id] ?? {};
  const mid = new Layer(SW, SH), top = new Layer(SW, SH);
  const S = tone(SKIN_TONES, p.skin, 'skin-a');
  const O = tone(OUTFIT_TONES, p.outfit, 'shadow');
  const hairKey = p.hairColor ?? 'hair';
  const H = tone(HAIR_TONES, hairKey, 'hair');
  const style = e.hair ?? p.hair ?? 'short';
  const len = e.hairLen ?? 74;
  const accent = (p.accent ?? 'ash') as K;
  const blink = id === 'seoyun' || (!anim.reduced && Math.floor(anim.t * 10) % 40 === 0 && id !== 'marsh'); // 서윤은 눈을 감고 있다
  const isMarsh = id === 'marsh';

  const up = e.taller ?? 0; // 배우는 더 크다: 머리를 위로 올린다
  const body = new Layer(SW, SH);
  if (style !== 'none') hairBack(body, style, H, len);
  garment(body, e.style ?? 'dress', O, S, accent);
  // 얼굴
  const head = new Layer(SW, SH);
  if (p.mask === 'porcelain') drawMask(head);
  else {
    face(head, S, H, e, { eyesClosed: blink, flat: true, noFace: p.face === 'none', big: isMarsh, look: id === 'seojin' ? -1 : 0 });
    if (isMarsh) { line(head, 'ink', CX + 9, 49, CX + 9, 53); line(head, 'ink', CX + 8, 50, CX + 8, 54); vline(head, 'steel-dark', CX + 7, 48, 4); }
  }
  if (style !== 'none' && p.mask !== 'porcelain') hairFront(head, style, H, len, { blink });
  if (id === 'faceless') {
    // 머리카락 커튼이 얼굴을 반쯤 가린다 (이목구비 없음)
    const [lo, base, hi] = H;
    rect(head, base, CX - 11, 26, 8, 24); rect(head, base, CX + 4, 26, 8, 24);
    for (const dx of [-9, -6, 6, 9]) vline(head, lo, CX + dx, 28, 22);
    vline(head, hi, CX - 10, 28, 18);
  }
  // 합성: 배우는 몸 위로 머리를 올린다
  const dy = -up;
  stamp(mid, body, 0, 0);
  stamp(mid, head, 0, dy);
  if (style === 'long') {
    // 긴 머리 앞쪽 가닥이 어깨 위로 흘러내린다 (몸 위에 다시)
    const [lo, base, hi] = H;
    for (const sx of [CX - 21, CX + 14]) {
      rect(mid, base, sx, 50, 8, len - 50);
      vline(mid, hi, sx + 1, 52, len - 60);
      for (const dx of [3, 5]) vline(mid, lo, sx + dx, 52, len - 54);
      hline(mid, lo, sx, len - 1, 8);
    }
  }
  if (p.mask === 'porcelain') {
    // 가면 아래에서 무언가 움직인다
    const wob = Math.round(Math.sin(anim.t * 3) * 1);
    hline(mid, 'ink', CX - 5 + wob, 54 + dy, 10);
    px(mid, 'shadow', CX - 3 + wob, 55 + dy); px(mid, 'shadow', CX + 3 - wob, 55 + dy);
  }
  if (!isMarsh) { /* 표정은 face()가 처리 */ }
  decorate(id, mid, top, S, O, anim, accent);
  // 윤곽선: 몸 전체 selective outline
  smooth(mid);
  selOutline(mid);
  return { mid, top };
}

function drawMask(l: Layer): void {
  const cy = 36;
  ellipse(l, 'paper', CX, cy, 11, 14);
  rect(l, 'paper', CX - 10, cy, 21, 8);
  lit(l, 'paper', 'paper', 'bone', CX - 11, cy - 14, 23, 29, [-0.7, -0.4]);
  vline(l, 'bone', CX + 8, cy - 6, 18);
  // 눈구멍 없음. 이마 균열 + 코 선만
  line(l, 'ash', CX + 3, cy - 13, CX + 6, cy - 6);
  px(l, 'ash', CX + 6, cy - 5);
  vline(l, 'bone', CX, cy + 1, 6);
  hline(l, 'ash', CX - 1, cy + 7, 3);
  // 눈썹 아치와 광대 음영 (눈구멍은 없다)
  hline(l, 'ash', CX - 8, cy - 4, 5); hline(l, 'ash', CX + 4, cy - 4, 5);
  px(l, 'ash', CX - 9, cy - 3); px(l, 'ash', CX + 9, cy - 3);
  px(l, 'bone', CX - 7, cy + 3); px(l, 'bone', CX + 7, cy + 3);
  hline(l, 'bone', CX - 8, cy + 4, 3); hline(l, 'bone', CX + 6, cy + 4, 3);
  rect(l, 'bone', CX - 4, cy + 11, 9, 1);
  // 목
  rect(l, 'bone', CX - 4, cy + 13, 9, 6);
}

function decorate(id: string, mid: Layer, top: Layer, S: Tones, O: Tones, anim: Anim, accent: K): void {
  const handY = 103;
  const L = 34, R = 69;
  const act = (cuffL = true, cuffR = true): void => {
    if (cuffL) cuff(top, L + 1, 8, O);
    if (cuffR) cuff(top, R, 8, O);
  };
  switch (id) {
    case 'jin': {
      // 포갠 두 손
      cuff(top, 38, 8, O); cuff(top, 66, 8, O);
      hand(top, 45, handY, S, 4); hand(top, 55, handY, S, 4, true);
      rect(top, 'bone', 48, handY + 2, 2, 1);
      break;
    }
    case 'kang': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      // 황동 손목시계 (늘 본다)
      rect(top, 'brass', R + 1, handY - 3, 6, 3); rect(top, 'brass-light', R + 1, handY - 3, 6, 1);
      rect(top, 'paper', R + 3, handY - 2, 2, 1);
      break;
    }
    case 'park': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      rect(top, 'brass', L + 1, handY - 3, 6, 3); rect(top, 'brass-dark', L + 1, handY - 1, 6, 1); // 멈춘 시계
      // 카운터 위 중절모
      polygon(top, 'stone', [[44, 110], [68, 110], [66, 104], [46, 104]]);
      rect(top, 'mist', 46, 104, 20, 1);
      break;
    }
    case 'oh': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      // 쇼핑백 네 개: 양옆 (rose가 한 개)
      const bag = (x: number, w: number, h: number, k: Tones): void => {
        const B = 110, y0 = B - h;
        rect(top, k[1], x, y0, w, h);
        rect(top, k[2], x, y0, w, 2);
        rect(top, k[0], x, B - 2, w, 2);
        vline(top, k[0], x + w - 2, y0 + 2, h - 4);
        vline(top, 'ink', x + 4, y0 - 4, 5); vline(top, 'ink', x + w - 5, y0 - 4, 5); hline(top, 'ink', x + 4, y0 - 4, w - 8);
      };
      bag(0, 20, 30, OUTFIT_TONES.paper as Tones);
      bag(18, 18, 22, OUTFIT_TONES.rose as Tones);
      bag(78, 18, 24, OUTFIT_TONES.stone as Tones);
      bag(94, 18, 30, OUTFIT_TONES.shadow as Tones);
      mid.set(0, 0, 255);
      // 머리 위 선글라스
      rect(mid, 'ink', CX - 12, 16, 9, 4); rect(mid, 'ink', CX + 3, 16, 9, 4); hline(mid, 'ink', CX - 3, 17, 6);
      px(mid, 'steel-light', CX - 10, 17);
      break;
    }
    case 'cha': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      // 올려든 스마트폰: 화면이 진열장을 향한다 (steel)
      rect(mid, 'ink', 80, 40, 9, 16); rect(mid, 'steel-dark', 81, 41, 7, 13);
      rect(mid, 'steel', 81, 41, 7, 5); px(mid, 'steel-light', 82, 42); px(mid, 'steel-light', 83, 42);
      rect(mid, S[1], 79, 54, 6, 8); hline(mid, S[2], 79, 54, 6);
      break;
    }
    case 'yoon': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      // 펼친 스케치북 (카운터 위)
      polygon(top, 'paper', [[30, 112], [56, 108], [56, 120], [30, 124]]);
      polygon(top, 'bone', [[56, 108], [82, 112], [82, 124], [56, 120]]);
      vline(top, 'ash', 56, 108, 12);
      for (const [x, y] of [[36, 112], [44, 111], [64, 114], [72, 115]] as const) { rect(top, 'stone', x, y, 3, 3); rect(top, 'mist', x, y + 3, 3, 5); }
      hline(top, 'ink', 30, 124, 52);
      break;
    }
    case 'hanyeoreum':
    case 'seojin': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      break;
    }
    case 'marsh': {
      act(); hand(top, L, handY, S, 4);
      // 오른손: 손바닥을 위로 내민다
      rect(top, S[1], R - 4, handY, 14, 5); hline(top, S[2], R - 3, handY, 11); hline(top, S[0], R - 4, handY + 5, 14);
      for (let i = 0; i < 4; i++) rect(top, S[1], R + 10 + i * 0, handY + 1 + i, 3, 1);
      rect(top, S[1], R + 10, handY, 3, 4);
      // 카운터에 번지는 물웅덩이 (steel)
      const grow = Math.min(1, anim.t / 6);
      const rx = 14 + Math.round(30 * grow);
      for (let y = 104; y < 112; y++) for (let x = CX - rx; x <= CX + rx; x++) {
        const d = Math.hypot((x - CX) / rx, (y - 108) / 4);
        if (d < 0.8) { px(top, (x + y) & 1 ? 'steel' : 'steel-dark', x, y); }
        else if (d < 1.0 && ((x + y) & 1)) px(top, 'steel-dark', x, y);
      }
      for (let x = CX - rx + 4; x < CX + rx - 4; x += 7) px(top, 'steel-light', x, 106 + (x % 3));
      break;
    }
    case 'faceless': {
      // 너무 많은 손가락: 한 손에 8개, ash
      const fingers = (x0: number, dir: number): void => {
        rect(top, S[1], x0, handY, 18, 3);
        for (let i = 0; i < 8; i++) {
          const x = x0 + i * 2 + (dir > 0 ? 0 : 0);
          rect(top, 'ash', x, handY + 3, 1, 7 + (i % 3));
          px(top, 'bone', x, handY + 3);
          px(top, 'stone', x + 1, handY + 4);
        }
        hline(top, S[2], x0, handY, 18);
      };
      cuff(top, 32, 12, O, 99); cuff(top, 68, 12, O, 99);
      fingers(30, 1); fingers(66, 1);
      break;
    }
    case 'baek': {
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
      // 손끝 서리 + 손 주변 카운터 성에
      for (const x0 of [L, R]) {
        for (let i = 0; i < 4; i++) { px(top, 'steel-light', x0 + 1 + i * 2, handY + 6); px(top, 'steel', x0 + 1 + i * 2, handY + 5); }
        const grow = Math.min(1, anim.t / 5);
        const w = 8 + Math.round(8 * grow);
        for (let y = handY + 5; y < handY + 12; y++) for (let x = x0 - w; x < x0 + 9 + w; x++) {
          const d = Math.hypot((x - (x0 + 4)) / (w + 6), (y - (handY + 7)) / 4);
          if (d < 0.9 && ((x + y) & 1)) px(top, d < 0.6 ? 'steel-light' : 'steel', x, y);
        }
        for (const [dx, dy] of [[-6, 9], [13, 8], [-9, 5], [16, 11]] as const) px(top, 'steel-light', x0 + dx, handY + dy);
      }
      break;
    }
    case 'actor': {
      // 흰 장갑 손 (긴 손)
      cuff(top, 33, 10, O, 99); cuff(top, 69, 10, O, 99);
      hand(top, 32, handY, OUTFIT_TONES.paper as Tones, 4); hand(top, 70, handY, OUTFIT_TONES.paper as Tones, 4, true);
      break;
    }
    default:
      act(); hand(top, L, handY, S, 4); hand(top, R, handY, S, 4, true);
  }
  void accent;
}

// ───────────────────────── 크리처

const world = (l: Layer, f: (ox: number, oy: number) => void): void => { void l; f(0, 0); };

export function drawCornerHound(t: Targets, a: Anim): void {
  const l = t.mid;
  // 왼쪽 벽 모서리에서 스며 나오는 steel 연기
  for (const [x0, ph] of [[36, 0], [48, 1.7], [62, 3.1], [26, 4.4]] as const) {
    let x = x0;
    for (let y = 10; y < 66; y++) {
      if (y % 6 === 0) x += Math.round(Math.sin(y * 0.3 + ph + (a.reduced ? 0 : a.t * 0.8)) * 1.3);
      px(l, y > 40 ? 'steel-dark' : 'steel', x, y);
      if (y % 9 === 0) px(l, 'steel-light', x + 1, y);
    }
  }
  // 각진 폴리곤 몸 (곡선 없음), 오른쪽에서 빛을 받는 면
  polygon(l, 'dusk', [[22, 60], [46, 46], [66, 58], [82, 74], [106, 98], [94, 106], [72, 100], [52, 106], [30, 104], [20, 86]]);
  polygon(l, 'stone', [[46, 46], [66, 58], [60, 74], [40, 64]]);
  polygon(l, 'mist', [[66, 58], [82, 74], [74, 78], [62, 68]]);
  polygon(l, 'shadow', [[30, 104], [52, 106], [48, 90], [24, 84]]);
  polygon(l, 'stone', [[52, 106], [72, 100], [66, 88], [50, 92]]);
  polygon(l, 'ash', [[82, 74], [90, 82], [84, 84]]);
  polygon(l, 'shadow', [[22, 60], [46, 46], [40, 64]]);
  polygon(l, 'mist', [[72, 100], [86, 90], [94, 100], [80, 104]]);
  line(l, 'ash', 46, 46, 66, 58);
  // 머리 + 턱
  polygon(l, 'dusk', [[100, 96], [116, 94], [132, 106], [114, 112], [102, 108]]);
  polygon(l, 'stone', [[100, 96], [116, 94], [122, 100], [106, 102]]);
  polygon(l, 'ash', [[116, 94], [124, 98], [120, 100]]);
  polygon(l, 'shadow', [[102, 108], [114, 112], [112, 106]]);
  rect(l, 'steel-light', 112, 99, 3, 1); px(l, 'steel', 111, 99);
  // 긴 푸른 혀
  const tw = a.reduced ? 0 : Math.round(Math.sin(a.t * 2) * 1);
  for (let x = 128; x < 150; x++) { const y = 107 + Math.round((x - 128) * 0.06) + (x > 140 ? tw : 0); px(l, 'steel', x, y); px(l, 'steel-dark', x, y + 1); }
  px(l, 'steel-light', 149, 109 + tw); px(l, 'steel', 150, 110 + tw);
  // 가는 지그재그 다리
  for (const pts of [[[100, 106], [96, 112], [102, 118]], [[90, 104], [86, 112], [92, 118]], [[46, 104], [40, 112], [48, 118]], [[34, 104], [30, 110], [36, 118]]] as const) {
    for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i] as unknown as number[], B = pts[i + 1] as unknown as number[]; line(l, 'stone', A[0] as number, A[1] as number, B[0] as number, B[1] as number); line(l, 'mist', (A[0] as number) + 1, A[1] as number, (B[0] as number) + 1, B[1] as number); }
  }
  // 모서리가 둥글게 녹아 있다
  dither(l, 'ink', null, 44, 10, 5, 100);
  // 발 아래 접지 그림자
  dither(l, 'ink', null, 28, 118, 76, 2);
  void world;
}

export function drawDoorTentacle(t: Targets, a: Anim): void {
  const l = t.mid, top = t.top;
  // 문 유리 전체에 가득 찬 눈동자
  const cx = 295, cy = 66;
  ellipse(l, 'stone', cx, cy, 17, 12);
  ellipse(l, 'bone', cx, cy, 15, 10);
  lit(l, 'bone', 'paper', 'ash', cx - 15, cy - 10, 31, 21);
  for (const [x1, y1, x2, y2] of [[cx - 14, cy, cx - 8, cy - 2], [cx + 14, cy + 1, cx + 8, cy + 3], [cx - 10, cy + 6, cx - 6, cy + 4], [cx + 6, cy - 8, cx + 8, cy - 5]] as const) line(l, 'ash', x1, y1, x2, y2);
  const look = a.reduced ? 0 : Math.round(Math.sin(a.t * 0.8) * 2);
  ellipse(l, 'mist', cx + look - 1, cy, 8, 9);
  ellipse(l, 'ash', cx + look - 1, cy, 6, 7);
  ellipseRing(l, 'stone', cx + look - 1, cy, 8, 9);
  rect(l, 'ink', cx + look - 2, cy - 8, 3, 16);
  px(l, 'ink', cx + look - 1, cy - 9); px(l, 'ink', cx + look - 1, cy + 9);
  rect(l, 'paper', cx + look - 6, cy - 5, 2, 2); px(l, 'paper', cx + look - 5, cy - 3);
  hline(l, 'ink', cx - 16, cy - 12, 33); hline(l, 'stone', cx - 14, cy - 11, 29);
  // 김 서림
  dither(l, 'mist', null, 279, 42, 32, 46);
  // 문 아래 물 (steel)
  for (let i = 0; i < 14; i++) { px(l, 'steel', 276 + ((i * 7) % 38), 110 + (i % 4)); }
  for (const x of [281, 296, 309]) vline(l, 'steel-dark', x, 98, 12);
  // 촉수: 문틈에서 들어와 카운터 끝을 더듬는다
  const path: [number, number, number][] = [];
  const P = [[304, 112, 6], [296, 104, 7], [282, 100, 7], [264, 106, 7], [246, 116, 7], [232, 126, 6], [214, 134, 6], [200, 136, 5], [188, 139, 4], [178, 141, 3], [170, 143, 2]] as const;
  for (let i = 0; i + 1 < P.length; i++) {
    const A = P[i] as readonly number[], B = P[i + 1] as readonly number[];
    for (let s = 0; s < 8; s++) { const u = s / 8; path.push([A[0]! + (B[0]! - A[0]!) * u, A[1]! + (B[1]! - A[1]!) * u + (a.reduced ? 0 : Math.sin(a.t * 1.4 + i + u) * 0.8), A[2]! + (B[2]! - A[2]!) * u]); }
  }
  for (const [x, y, r] of path) circle(top, 'ink', Math.round(x), Math.round(y), Math.round(r) + 1);
  for (const [x, y, r] of path) circle(top, 'dusk', Math.round(x), Math.round(y), Math.round(r));
  for (const [x, y, r] of path) circle(top, 'stone', Math.round(x - 1), Math.round(y - 1), Math.max(1, Math.round(r) - 2));
  for (const [x, y, r] of path) if (r > 3) { px(top, 'mist', Math.round(x - r / 2), Math.round(y - r / 2)); px(top, 'shadow', Math.round(x + r / 2), Math.round(y + r / 2)); }
  // 흡반: 작은 눈이 전부 주인공을 본다
  for (let i = 6; i < path.length - 6; i += 9) {
    const [x, y, r] = path[i] as [number, number, number];
    const ex = Math.round(x), ey = Math.round(y + r * 0.45);
    ellipse(top, 'bone', ex, ey, 3, 2);
    ellipseRing(top, 'ash', ex, ey, 3, 2);
    rect(top, 'ink', ex - 1, ey - 1, 2, 3);
    px(top, 'paper', ex - 2, ey - 1);
  }
  // 끝에서 떨어지는 물
  const drip = a.reduced ? 0 : Math.floor((a.t * 6) % 10);
  px(top, 'steel-light', 169, 146 + drip); px(top, 'steel', 168, 156 + (drip >> 1)); px(top, 'steel-dark', 169, 145);
  // 카운터 위 젖은 자국
  for (let x = 160; x < 220; x++) if ((x * 3) % 5 < 2) px(top, 'steel-dark', x, 138 + (x % 3));
}

function ellipseRing(l: Layer, k: K, cx: number, cy: number, rx: number, ry: number): void {
  for (let a = 0; a < 360; a += 6) {
    const r = (a * Math.PI) / 180;
    px(l, k, Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry));
  }
}

export function drawCylinderBearer(t: Targets, a: Anim): void {
  const l = t.mid, top = t.top;
  const sway = a.reduced ? 0 : Math.round(Math.sin(a.t * 1.2));
  // 박쥐 날개 (뒤): rose-dark 막 + rose 뼈대
  const wing = (dir: number): void => {
    const X = (x: number): number => CX2 + dir * x;
    polygon(l, 'rose-dark', [[X(22), 84], [X(46), 62 + sway], [X(54), 58], [X(52), 82], [X(56), 102], [X(46), 112], [X(36), 124], [X(24), 116]].map(([x, y]) => [x, y] as [number, number]));
    for (const [x1, y1, x2, y2] of [[22, 84, 54, 58], [26, 90, 52, 82], [28, 100, 56, 102], [26, 110, 46, 112]] as const) line(l, 'rose', X(x1), y1 + (y1 < 90 ? sway : 0), X(x2), y2);
    line(l, 'rose-light', X(24), 84, X(46), 64 + sway);
    for (const [x, y] of [[42, 80], [44, 92], [40, 104]] as const) px(l, 'wine-dark', X(x), y);
  };
  const CX2 = 160;
  wing(-1); wing(1);
  // 몸통: 갑각 판
  polygon(l, 'rose', [[138, 82], [150, 76], [170, 76], [182, 82], [188, 104], [182, 132], [138, 132], [132, 104]]);
  lit(l, 'rose', 'rose-light', 'rose-dark', 132, 76, 57, 56, [-0.5, -0.5]);
  for (const y of [90, 98, 106, 114, 122]) { hline(l, 'wine-dark', 140, y, 41); hline(l, 'rose-light', 141, y + 1, 12); }
  vline(l, 'wine-dark', 160, 84, 48);
  for (let y = 86; y < 130; y += 8) { px(l, 'rose-light', 156, y); px(l, 'rose-light', 164, y); }
  // 어깨 갑옷 + 버섯
  ellipse(l, 'rose', 142, 84, 11, 5); ellipse(l, 'rose', 178, 84, 11, 5);
  hline(l, 'rose-light', 133, 81, 14); hline(l, 'rose-light', 171, 81, 14);
  hline(l, 'wine-dark', 131, 88, 22); hline(l, 'wine-dark', 167, 88, 22);
  for (const [x, y] of [[135, 78], [140, 75], [146, 79], [172, 78], [177, 74], [183, 79]] as const) {
    vline(l, 'paper', x, y, 4); rect(l, 'rose-light', x - 2, y - 2, 5, 2); px(l, 'rose', x - 2, y); px(l, 'rose', x + 2, y);
  }
  // 머리: 주름진 타원 덩어리 + 가시 털
  for (let ang = 200; ang <= 340; ang += 12) {
    const r = (ang * Math.PI) / 180, x0 = 160 + Math.cos(r) * 12, y0 = 62 + Math.sin(r) * 17;
    const x1 = 160 + Math.cos(r) * 20, y1 = 62 + Math.sin(r) * 27;
    line(l, 'rose', Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1));
    px(l, 'rose-light', Math.round(x1), Math.round(y1));
  }
  ellipse(l, 'rose', 160, 64, 12, 17);
  lit(l, 'rose', 'rose-light', 'rose-dark', 148, 47, 25, 35);
  for (let i = 0; i < 5; i++) {
    for (let x = 150; x <= 170; x++) { const y = 52 + i * 6 + Math.round(Math.sin((x + i * 3) * 0.55) * 2); if (Math.hypot((x - 160) / 12, (y - 64) / 17) < 0.92) px(l, i % 2 ? 'wine-dark' : 'rose-dark', x, y); }
  }
  hline(l, 'rose-light', 152, 52, 4); hline(l, 'rose-light', 163, 60, 4);
  rect(l, 'wine-dark', 152, 80, 17, 2); // 목
  // 집게발 + 원통 (카운터 위)
  const claw = (dir: number): void => {
    const X = (x: number): number => 160 + dir * x;
    polygon(l, 'rose', [[X(22), 100], [X(26), 108], [X(24), 122], [X(16), 130], [X(10), 128], [X(14), 114]].map(([x, y]) => [x, y] as [number, number]));
    polygon(top, 'rose', [[X(12), 118], [X(9), 128], [X(8), 138], [X(2), 135], [X(5), 124]].map(([x, y]) => [x, y] as [number, number]));
    polygon(top, 'rose-dark', [[X(9), 128], [X(8), 138], [X(5), 136], [X(6), 128]].map(([x, y]) => [x, y] as [number, number]));
    px(top, 'rose-light', X(10), 120); px(top, 'rose-light', X(9), 124);
    polygon(top, 'rose', [[X(16), 122], [X(14), 132], [X(11), 140], [X(7), 138], [X(10), 128]].map(([x, y]) => [x, y] as [number, number]));
  };
  claw(-1); claw(1);
  // 은색 원통 + 스피커 (paper 하이라이트)
  rect(top, 'ash', 153, 120, 14, 18);
  rect(top, 'bone', 154, 120, 5, 18);
  rect(top, 'paper', 155, 121, 2, 16);
  rect(top, 'mist', 164, 121, 3, 17);
  hline(top, 'paper', 153, 120, 14); hline(top, 'mist', 153, 137, 14);
  for (let y = 124; y < 132; y += 2) for (let x = 157; x < 164; x += 2) px(top, 'ink', x, y);
  rect(top, 'ink', 153, 138, 14, 1);
  // 접지 그림자
  dither(top, 'ink', null, 148, 139, 24, 1);
}

/** 바깥에서 온 색: 팔레트에 없는 유일한 색. 프레임마다 hue가 1도씩 돈다. 캔버스에 직접 칠한다. */
export function drawOutsideColour(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  const frame = Math.floor(t * 60);
  const baseHue = frame % 360; // 한 프레임에 1도
  const cx = 160, cy = 96;
  const hsl = (h: number): string => `hsl(${h % 360} 100% 55%)`;
  const buckets = new Map<number, number[]>();
  for (let y = 54; y < 150; y++)
    for (let x = 84; x < 238; x++) {
      const dx = x - cx, dy = y - cy;
      const ph = reduced ? 0 : t;
      // 덩어리 + 물결치는 팔 + 흘러내리는 줄
      let f = 1.3 + 0.18 * Math.sin(Math.atan2(dy, dx) * 5 + ph * 2) - Math.hypot(dx / 34, (dy + Math.sin(dx * 0.2 + ph * 1.5) * 4) / 19);
      const armY = 4 * Math.sin(dx * 0.16 + ph * 1.3), tw = Math.max(0, 1 - Math.abs(dx) / 74);
      f = Math.max(f, 0.9 - Math.abs(dy - armY - 2) / (3 + tw * 9) - (Math.abs(dx) > 70 ? 0.6 : 0));
      const drip = [-22, -4, 14, 34].some((o, i) => Math.abs(dx - o - Math.sin(ph * 0.5 + i)) < 1 && dy > 6 && dy < 26 + i * 9 + ((frame >> 3) + i * 5) % 7);
      if (f < 0.12 && !drip) continue;
      if (f < 0.3 && !drip && ((x + y) & 1)) continue; // 가장자리는 2×2 체커
      const band = Math.floor((Math.sin(dx * 0.17 + ph * 0.6) + Math.sin(dy * 0.4 - dx * 0.09 + ph * 0.3) + 2) * 1.2);
      const h = (baseHue + band * 75 + 720) % 360;
      const q = Math.round(h / 5) * 5;
      let a = buckets.get(q); if (!a) { a = []; buckets.set(q, a); }
      a.push(x, y);
    }
  for (const [q, pts] of buckets) {
    ctx.fillStyle = hsl(q);
    for (let i = 0; i < pts.length; i += 2) ctx.fillRect(pts[i] as number, pts[i + 1] as number, 1, 1);
  }
}

// ───────────────────────── 진입점

export interface SpriteDef { id: string; form: 'humanoid' | 'creature'; sprite: SpriteParams }

/** 손님을 두 레이어(mid: 카운터 뒤, top: 카운터 위)에 그린다. 바깥에서 온 색은 여기서 그리지 않는다. */
export function drawCustomer(def: SpriteDef, out: Targets, anim: Anim): void {
  const s = def.sprite;
  if (s.kind === 'creature') {
    if (s.draw === 'drawCornerHound') drawCornerHound(out, anim);
    else if (s.draw === 'drawDoorTentacle') drawDoorTentacle(out, anim);
    else if (s.draw === 'drawCylinderBearer') drawCylinderBearer(out, anim);
    return;
  }
  const breath = !anim.reduced && Math.sin(anim.t * 1.9) > 0.55 ? 1 : 0;
  const h = drawHuman(def.id, s, anim);
  const ox = CUSTOMER_X - CX, oy = COUNTER_Y - BASE;
  stamp(out.mid, h.mid, ox, oy + breath);
  selOutline(h.top);
  stamp(out.top, h.top, ox, oy);
  void rect; void lit; void dither;
}
