import { Layer, T, circle, dither, ellipse, ellipseLine, hline, line, lit, polygon, px, rect, selOutline, smooth, vline } from './pixel';
import { KEY_INDEX, type PaletteKey } from './palette';

/**
 * 상품 아이콘 32×32. 실루엣 1개 + 핵심 특징 1~2개. 재질마다 3톤(빛은 왼쪽 위), 윤곽선은 selective outline.
 * body = 실루엣, feat = 핵심 특징(16×16 축소판에도 남는다), extra = 버려도 되는 디테일(축소판에서 제외).
 */
type Pen = (body: Layer, feat: Layer, extra: Layer) => void;
type K = PaletteKey;

const S = 32;

function arch(l: Layer, k: K, cx: number, cy: number, rx: number, ry: number, thick: number): void {
  for (let i = 0; i < thick; i++) ellipseLine(l, k, cx, cy, rx - i, ry - i);
}
function bagBody(l: Layer, k: K, hi: K, lo: K, top = 14): void {
  polygon(l, k, [[6, top], [26, top], [28, 27], [4, 27]]);
  rect(l, k, 5, top + 1, 22, 2);
  lit(l, k, hi, lo, 4, top, 24, 28 - top);
  hline(l, 'ink', 5, 28, 22); // 접지 그림자
}
/** 패턴(퀼팅·엮은 결)을 몸통이 칠해진 칸 안에만 그린다. 실루엣 밖으로 삐져나가면 테두리가 보풀처럼 일어난다. */
function clipped(dst: Layer, mask: Layer, draw: (l: Layer) => void): void {
  const t = new Layer(S, S);
  draw(t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = t.get(x, y);
    if (v !== T && mask.get(x, y) !== T) dst.set(x, y, v);
  }
}
/** 구슬(진주) */
function pearl(l: Layer, cx: number, cy: number, r: number, base: K, hi: K, lo: K): void {
  circle(l, base, cx, cy, r);
  lit(l, base, hi, lo, cx - r, cy - r, 2 * r + 1, 2 * r + 1);
  if (r >= 2) px(l, hi, cx - 1, cy - 1);
}
function tooth(l: Layer, x: number, y: number, up: boolean): void {
  rect(l, 'paper', x, y, 2, 2);
  px(l, 'bone', x + 1, up ? y : y + 1);
}
/** 타원을 따라 이빨을 놓는다 */
function teethRing(l: Layer, cx: number, cy: number, rx: number, ry: number): void {
  for (let a = 0; a < 360; a += 24) {
    const r = (a * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(r) * rx), y = Math.round(cy + Math.sin(r) * ry);
    tooth(l, x - 1, y - 1, Math.sin(r) > 0);
  }
}

/** 상의 실루엣: 어깨 + 몸통 + 양 소매. long이면 코트 */
function jacket(b: Layer, k: K, hi: K, lo: K, long = false): void {
  const hem = long ? 29 : 27;
  polygon(b, k, [[10, 5], [22, 5], [26, 7], [29, 12], [28, hem - 4], [24, hem - 4], [25, hem], [7, hem], [8, hem - 4], [4, hem - 4], [3, 12], [6, 7]]);
  lit(b, k, hi, lo, 3, 5, 26, hem - 5);
  vline(b, lo, 9, 12, hem - 14);
  vline(b, lo, 23, 12, hem - 14);
  vline(b, 'ink', 16, 15, hem - 15);
  hline(b, lo, 4, hem - 4, 5);
  hline(b, lo, 24, hem - 4, 5);
}

const tote = (k: K, hi: K, lo: K): Pen => (b, f) => {
  arch(b, lo, 16, 11, 7, 8, 2);
  bagBody(b, k, hi, lo, 14);
  hline(b, hi, 7, 14, 18); // 덮개 윗선 하이라이트
  hline(b, lo, 8, 19, 16); // 덮개 아랫선
  const metal: [K, K, K] = k === 'rose' ? ['ash', 'bone', 'mist'] : ['brass', 'brass-light', 'brass-dark'];
  rect(f, metal[0], 14, 17, 5, 4);
  rect(f, metal[1], 14, 17, 5, 1);
  px(f, metal[2], 18, 20);
};

const ICONS: Record<string, Pen> = {
  luna_tote_beige: tote('taupe', 'bone', 'mist'),
  luna_tote_rose: tote('rose', 'rose-light', 'rose-dark'),

  opera_shoulder: (b, f) => {
    // 체인 어깨끈
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, x = Math.round(7 + 18 * t), y = Math.round(13 - 4 * Math.sin(Math.PI * t) * 2.6);
      px(b, i % 2 ? 'brass-dark' : 'brass-light', x, y);
      px(b, 'brass', x, y + 1);
    }
    polygon(b, 'shadow', [[5, 14], [27, 14], [28, 26], [4, 26]]);
    lit(b, 'shadow', 'stone', 'ink', 4, 14, 24, 12);
    hline(b, 'dusk', 5, 14, 22);
    hline(b, 'ink', 5, 27, 22);
    rect(f, 'brass', 13, 18, 6, 2);
    rect(f, 'brass-light', 13, 18, 6, 1);
    rect(f, 'brass', 6, 12, 2, 3);
    rect(f, 'brass', 24, 12, 2, 3);
  },

  cloud_hobo: (b, f) => {
    arch(b, 'bone', 16, 11, 9, 9, 2);
    ellipse(b, 'paper', 16, 21, 12, 7);
    rect(b, 'paper', 8, 14, 16, 5);
    // 가운데 오목한 입구
    ellipse(b, 'ink', 16, 14, 7, 1);
    lit(b, 'paper', 'paper', 'bone', 4, 14, 24, 14);
    for (const x of [9, 14, 19, 24]) line(b, 'bone', x, 17, x - 1, 25);
    hline(b, 'ash', 8, 27, 16);
    rect(f, 'brass', 7, 12, 3, 3);
    rect(f, 'brass', 23, 12, 3, 3);
    px(f, 'brass-light', 7, 12);
    px(f, 'brass-light', 23, 12);
  },

  card_wallet: (b, f) => {
    rect(b, 'taupe', 5, 9, 22, 16);
    lit(b, 'taupe', 'bone', 'mist', 5, 9, 22, 16);
    hline(b, 'skin-b', 6, 14, 20);
    hline(b, 'mist', 6, 15, 20);
    hline(b, 'skin-b', 6, 19, 20);
    hline(b, 'mist', 6, 20, 20);
    dither(b, 'mist', null, 6, 10, 20, 1); // 박음질
    rect(f, 'brass', 21, 11, 4, 3);
    px(f, 'brass-light', 21, 11);
  },

  tailored_suit: (b, f) => {
    jacket(b, 'shadow', 'stone', 'ink');
    polygon(f, 'paper', [[13, 5], [19, 5], [16, 15]]);
    vline(f, 'ink', 16, 7, 8);
    polygon(f, 'stone', [[10, 5], [13, 5], [16, 15], [11, 13]]);
    polygon(f, 'stone', [[22, 5], [19, 5], [16, 15], [21, 13]]);
    rect(f, 'brass', 15, 19, 2, 2);
    rect(f, 'brass', 15, 24, 2, 2);
    hline(f, 'paper', 7, 14, 3);
  },

  firstsnow_coat: (b, f) => {
    jacket(b, 'paper', 'paper', 'bone', true);
    polygon(f, 'bone', [[9, 5], [14, 5], [16, 14], [10, 11]]);
    polygon(f, 'bone', [[23, 5], [18, 5], [16, 14], [22, 11]]);
    polygon(f, 'ash', [[12, 5], [14, 5], [16, 12]]);
    polygon(f, 'ash', [[20, 5], [18, 5], [16, 12]]);
    rect(f, 'ash', 9, 19, 14, 2);
    rect(f, 'brass', 14, 18, 5, 4);
    rect(f, 'brass-dark', 15, 19, 3, 2);
    px(f, 'brass-light', 14, 18);
  },

  knit_dress: (b, f) => {
    polygon(b, 'taupe', [[11, 4], [14, 4], [15, 8], [17, 8], [18, 4], [21, 4], [21, 13], [26, 28], [6, 28], [11, 13]]);
    lit(b, 'taupe', 'bone', 'mist', 6, 4, 20, 24);
    for (let x = 9; x <= 24; x += 3) vline(b, 'skin-b', x, 15, 12); // 니트 결
    hline(b, 'ash', 6, 27, 20);
    rect(f, 'mist', 11, 12, 11, 2);
    rect(f, 'brass', 15, 11, 3, 4);
    px(f, 'brass-light', 15, 11);
  },

  garden_scarf: (b, f) => {
    arch(b, 'rose', 16, 9, 8, 6, 3);
    polygon(b, 'rose', [[8, 11], [14, 13], [13, 28], [7, 28]]);
    polygon(b, 'rose', [[24, 11], [18, 13], [19, 29], [25, 29]]);
    lit(b, 'rose', 'rose-light', 'rose-dark', 7, 4, 19, 25);
    for (const x of [8, 10, 12]) vline(b, 'rose-dark', x, 26, 3);
    for (const x of [20, 22, 24]) vline(b, 'rose-dark', x, 27, 3);
    // 꽃무늬: 크게 2개
    for (const [x, y] of [[8, 17], [20, 21]] as const) {
      rect(f, 'paper', x + 1, y, 2, 4);
      rect(f, 'paper', x, y + 1, 4, 2);
      rect(f, 'ash', x + 1, y + 1, 2, 2);
    }
  },

  moondrop_pearl: (b, f) => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, x = Math.round(4 + 24 * t), y = Math.round(5 + 13 * Math.sin(Math.PI * t * 0.5 + (t > 0.5 ? 0 : 0)) * (1 - Math.abs(2 * t - 1) * 0) * 0.0 + 12 * (1 - Math.pow(2 * t - 1, 2)));
      pearl(b, x, y, 1, 'bone', 'paper', 'ash');
    }
    rect(f, 'brass', 15, 17, 3, 3);
    pearl(f, 16, 24, 4, 'bone', 'paper', 'ash');
    px(f, 'paper', 14, 22);
  },

  blackpearl_ear: (b, f) => {
    for (const cx of [10, 22]) {
      rect(f, 'brass', cx - 1, 4, 2, 7);
      px(f, 'brass-light', cx - 1, 4);
      pearl(f, cx, 17, 4, 'dusk', 'ash', 'ink');
      rect(b, 'brass-dark', cx - 2, 10, 4, 2);
    }
  },

  petite_pearl_ring: (b, f) => {
    arch(b, 'brass', 16, 20, 9, 8, 3);
    lit(b, 'brass', 'brass-light', 'brass-dark', 6, 12, 20, 18);
    rect(b, 'brass-dark', 12, 11, 9, 3);
    rect(f, 'brass', 11, 9, 2, 4);
    rect(f, 'brass', 20, 9, 2, 4);
    pearl(f, 16, 9, 4, 'bone', 'paper', 'ash');
  },

  chrono_onyx: (b, f) => {
    rect(b, 'shadow', 11, 2, 10, 28);
    lit(b, 'shadow', 'stone', 'ink', 11, 2, 10, 28);
    for (const y of [4, 7, 25, 28]) px(b, 'mist', 16, y);
    circle(b, 'brass', 16, 16, 10);
    lit(b, 'brass', 'brass-light', 'brass-dark', 6, 6, 21, 21);
    circle(f, 'ink', 16, 16, 7);
    circle(f, 'shadow', 15, 15, 5);
    line(f, 'paper', 16, 16, 16, 11);
    line(f, 'paper', 16, 16, 20, 18);
    px(f, 'brass-light', 16, 16);
    rect(b, 'brass', 26, 14, 3, 4);
  },

  rose_gold_band: (b, f) => {
    arch(b, 'rose', 16, 18, 11, 10, 4);
    lit(b, 'rose', 'rose-light', 'rose-dark', 5, 8, 22, 21);
    rect(f, 'paper', 14, 6, 5, 5);
    rect(f, 'bone', 15, 7, 3, 3);
    px(f, 'paper', 15, 7);
  },

  inner_bag: (b, f, g) => {
    arch(b, 'stone', 16, 11, 7, 8, 2);
    bagBody(b, 'shadow', 'stone', 'ink', 13);
    for (const [x1, y1, x2, y2] of [[6, 22, 10, 26], [26, 22, 22, 26]] as const) line(g, 'dusk', x1, y1, x2, y2);
    // 입구: 눈알 하나 + 이빨 줄
    ellipse(f, 'ink', 16, 19, 11, 6);
    ellipse(f, 'bone', 16, 19, 8, 5);
    lit(f, 'bone', 'paper', 'ash', 8, 14, 17, 11);
    circle(f, 'steel', 16, 19, 3);
    lit(f, 'steel', 'steel-light', 'steel-dark', 13, 16, 7, 7);
    rect(f, 'ink', 15, 18, 2, 2);
    px(f, 'paper', 14, 17);
    teethRing(f, 16, 19, 11, 6);
  },

  weeping_clutch: (b, f, g) => {
    polygon(b, 'rose', [[4, 11], [28, 11], [30, 24], [2, 24]]);
    ellipse(b, 'rose', 16, 24, 14, 3);
    lit(b, 'rose', 'rose-light', 'rose-dark', 2, 10, 28, 17);
    // 감긴 눈꺼풀 + 속눈썹
    ellipse(f, 'rose-light', 16, 17, 9, 4);
    ellipseLine(f, 'rose-dark', 16, 17, 9, 4);
    for (let x = 8; x <= 24; x += 2) vline(f, 'ink', x, 20 + (Math.abs(x - 16) > 6 ? 0 : 1), 3);
    hline(f, 'rose-dark', 9, 17, 14);
    // 눈물
    for (const x of [8, 22]) {
      rect(g, 'paper', x, 26, 2, 2);
      rect(g, 'bone', x, 28, 2, 2);
      px(g, 'paper', x, 26);
    }
  },

  bone_purse: (b, f, g) => {
    arch(b, 'ash', 16, 11, 9, 7, 2);
    circle(b, 'ash', 12, 3, 1);
    circle(b, 'ash', 20, 3, 1);
    ellipse(b, 'paper', 16, 22, 13, 6);
    rect(b, 'paper', 5, 14, 22, 8);
    lit(b, 'paper', 'paper', 'bone', 3, 14, 26, 14);
    for (const x of [7, 12, 17, 22]) vline(b, 'bone', x, 22, 6);
    // 벌린 입: 이빨 줄 + 늘어진 혀
    rect(f, 'ink', 7, 12, 18, 6);
    for (let x = 7; x <= 22; x += 3) { rect(f, 'paper', x, 12, 2, 3); px(f, 'bone', x + 1, 14); }
    for (let x = 8; x <= 22; x += 3) rect(f, 'bone', x, 18, 2, 1);
    rect(f, 'ash', 12, 17, 8, 3);
    rect(f, 'ash', 13, 20, 6, 5);
    rect(f, 'ash', 14, 25, 4, 2);
    hline(f, 'bone', 12, 17, 8);
    vline(g, 'mist', 16, 19, 6);
  },

  empty_box: (b, f) => {
    // 열린 뚜껑
    polygon(b, 'ash', [[4, 3], [26, 3], [28, 9], [6, 9]]);
    lit(b, 'ash', 'bone', 'mist', 4, 3, 24, 6);
    // 상자 앞면
    rect(b, 'mist', 3, 17, 26, 11);
    lit(b, 'mist', 'ash', 'stone', 3, 17, 26, 11);
    hline(b, 'ash', 3, 17, 26);
    hline(b, 'ink', 3, 29, 26);
    // 동심 사각형 3겹 + 가장 안쪽 ink
    const rings: [K, number][] = [['ash', 0], ['stone', 3], ['dusk', 6], ['ink', 9]];
    for (const [k, i] of rings) rect(f, k, 3 + i, 10 + Math.floor(i * 0.6), 26 - 2 * i, 8 - Math.floor(i * 0.6));
    rect(f, 'ink', 12, 14, 8, 3);
  },

  warm_memory_glove: (b, f, g) => {
    const glove = (ox: number, flip: boolean): void => {
      const L = new Layer(14, 28), F = new Layer(14, 28);
      rect(L, 'paper', 1, 14, 9, 11);
      for (const [x, h] of [[1, 8], [4, 11], [7, 10], [10, 7]] as const) rect(L, 'paper', x, 14 - h, 2, h);
      polygon(L, 'paper', [[0, 18], [1, 14], [2, 22], [-1, 22]]);
      rect(L, 'bone', 1, 23, 9, 3);
      lit(L, 'paper', 'paper', 'bone', 0, 3, 12, 23);
      for (const x of [2, 5, 8]) vline(F, 'ash', x, 5, 12); // 손등에 비치는 뼈
      hline(F, 'ash', 2, 17, 7);
      for (const [x, h] of [[1, 8], [4, 11], [7, 10], [10, 7]] as const) rect(F, 'steel-light', x, 14 - h - 1 + 1, 2, 2); // 손끝 서리
      for (let y = 0; y < 28; y++) for (let x = 0; x < 14; x++) {
        const v = L.get(flip ? 13 - x : x, y); if (v !== T) b.set(ox + x, 2 + y, v);
        const w = F.get(flip ? 13 - x : x, y); if (w !== T) f.set(ox + x, 2 + y, w);
      }
    };
    glove(2, false);
    glove(17, true);
    void g;
  },

  nameless_glove: (b, f, g) => {
    rect(b, 'stone', 9, 24, 14, 5);
    lit(b, 'stone', 'ash', 'dusk', 9, 24, 14, 5);
    rect(b, 'dusk', 10, 17, 12, 8);
    lit(b, 'dusk', 'mist', 'shadow', 10, 17, 12, 8);
    // 너무 긴 손가락: 몸통(손바닥)의 2배, 마디마다 끊김
    for (const [x, len] of [[10, 12], [13, 15], [16, 16], [19, 14], [22, 9]] as const) {
      const top = 17 - len;
      rect(f, 'dusk', x, top, 2, len);
      vline(f, 'mist', x, top, len);
      for (const j of [top + 4, top + 9]) if (j < 16) { rect(f, 'ink', x, j, 2, 1); }
    }
    rect(g, 'shadow', 11, 27, 10, 1);
  },

  stage_cloak: (b, f, g) => {
    polygon(b, 'brass', [[2, 2], [9, 6], [12, 4], [20, 4], [23, 6], [30, 2], [29, 10], [28, 27], [25, 29], [22, 27], [19, 29], [16, 27], [13, 29], [10, 27], [7, 29], [4, 27], [3, 10]]);
    lit(b, 'brass', 'brass-light', 'brass-dark', 2, 2, 28, 27);
    polygon(g, 'shadow', [[8, 7], [24, 7], [26, 26], [6, 26]]);
    for (const [x, y] of [[8, 9], [17, 9], [12, 18]] as const) {
      ellipse(f, 'paper', x + 3, y + 4, 3, 4);
      rect(f, 'bone', x + 4, y + 5, 2, 3);
      rect(f, 'ink', x + 1, y + 3, 2, 2); rect(f, 'ink', x + 4, y + 3, 2, 2);
      px(f, 'ink', x + 3, y + 7);
    }
    px(g, 'brass-dark', 4, 12); px(g, 'brass-dark', 27, 15);
  },

  shadow_scarf: (b, f) => {
    polygon(b, 'mist', [[9, 29], [9, 22], [12, 17], [14, 14], [18, 14], [20, 17], [23, 22], [23, 29]]);
    rect(b, 'mist', 13, 8, 6, 8);
    ellipse(b, 'mist', 16, 7, 3, 3);
    lit(b, 'mist', 'ash', 'stone', 9, 5, 14, 24);
    rect(b, 'shadow', 11, 15, 10, 4);
    polygon(b, 'shadow', [[16, 18], [21, 18], [22, 27], [18, 27]]);
    hline(b, 'dusk', 11, 15, 10);
    // 뒤에서 팔을 치켜든 그림자
    polygon(f, 'stone', [[8, 24], [3, 14], [4, 9], [8, 9], [9, 14], [12, 21]]);
    for (const [x, h] of [[1, 5], [4, 7], [7, 7], [10, 5]] as const) rect(f, 'stone', x, 8 - h + 1, 2, h);
    rect(f, 'stone', 1, 7, 11, 3);
    vline(f, 'mist', 4, 3, 6); vline(f, 'mist', 7, 2, 6);
  },

  breathing_pearl: (b, f, g) => {
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, x = Math.round(4 + 24 * t), y = Math.round(3 + 8 * (1 - Math.pow(2 * t - 1, 2)));
      pearl(b, x, y, 1, 'bone', 'paper', 'ash');
    }
    circle(b, 'bone', 16, 20, 9);
    lit(b, 'bone', 'paper', 'ash', 7, 11, 19, 19);
    circle(f, 'paper', 16, 20, 6);
    circle(f, 'steel', 16, 20, 4);
    lit(f, 'steel', 'steel-light', 'steel-dark', 12, 16, 9, 9);
    rect(f, 'ink', 15, 19, 3, 3);
    px(f, 'paper', 14, 18);
    for (const x of [8, 9, 10]) vline(g, 'mist', x, 17 + (x === 9 ? 0 : 1), 7 - (x === 9 ? 0 : 2));
    for (const x of [22, 23, 24]) vline(g, 'mist', x, 17 + (x === 23 ? 0 : 1), 7 - (x === 23 ? 0 : 2));
    rect(b, 'ash', 15, 28, 3, 2);
  },

  drowned_choker: (b, f, g) => {
    arch(b, 'shadow', 16, 19, 13, 7, 4);
    lit(b, 'shadow', 'stone', 'ink', 3, 12, 26, 14);
    for (const [x, y] of [[6, 20], [12, 25], [20, 25], [26, 20]] as const) {
      circle(f, 'bone', x, y, 3);
      lit(f, 'bone', 'paper', 'ash', x - 3, y - 3, 7, 7);
      rect(f, 'ink', x - 1, y - 1, 2, 2);
    }
    // 촉수 2가닥 (가늘게, 서로 떨어져서)
    for (const [x0, dir] of [[9, -1], [23, 1]] as const) {
      let x = x0;
      for (let y = 17; y > 3; y--) {
        px(g, 'rose', x, y);
        if (y % 3 === 0) x += dir * (y > 10 ? 0 : 1) + (y % 6 === 0 ? 1 : -1) * 0;
        if (y === 9) x += dir;
      }
      px(g, 'rose-light', x, 3);
    }
  },

  backward_watch: (b, f, g) => {
    arch(b, 'ash', 16, 4, 4, 3, 2);
    rect(b, 'ash', 14, 5, 5, 3);
    circle(b, 'ash', 16, 19, 12);
    lit(b, 'ash', 'bone', 'mist', 4, 7, 25, 25);
    circle(f, 'ink', 16, 19, 10);
    circle(f, 'shadow', 15, 18, 8);
    for (const [x, y] of [[14, 11], [24, 17], [14, 26], [5, 17]] as const) { rect(f, 'paper', x, y, 3, 4); px(f, 'bone', x + 2, y + 3); }
    // 뼈 손가락 바늘
    line(f, 'bone', 16, 19, 22, 14);
    line(f, 'bone', 16, 20, 22, 15);
    rect(f, 'paper', 22, 12, 2, 2);
    px(g, 'mist', 16, 19);
  },

  voice_locket: (b, f, g) => {
    const heart = (l: Layer, k: K, cx: number, cy: number, r: number, h: number): void => {
      circle(l, k, cx - r + 1, cy, r); circle(l, k, cx + r - 1, cy, r);
      polygon(l, k, [[cx - 2 * r + 1, cy + 1], [cx + 2 * r - 1, cy + 1], [cx, cy + h]]);
    };
    heart(b, 'rose', 13, 11, 5, 17);
    lit(b, 'rose', 'rose-light', 'rose-dark', 3, 6, 20, 22);
    heart(f, 'shadow', 13, 11, 3, 10);
    // 입술
    rect(f, 'rose', 8, 12, 11, 3);
    rect(f, 'rose-light', 9, 11, 4, 2); rect(f, 'rose-light', 14, 11, 4, 2);
    rect(f, 'rose-dark', 9, 15, 9, 2);
    hline(f, 'ink', 9, 14, 9);
    px(f, 'paper', 11, 16);
    // 열린 뚜껑
    heart(g, 'rose-dark', 26, 10, 3, 11);
    heart(g, 'shadow', 26, 10, 2, 7);
  },

  // ───────── 확장 상품 (docs/EXPANSION.md §1·§2, 콘셉트: docs/concept/items-v3/) ─────────

  bucket_ink: (b, f) => {
    arch(b, 'stone', 16, 12, 8, 9, 1);
    polygon(b, 'shadow', [[8, 12], [24, 12], [26, 27], [6, 27]]);
    lit(b, 'shadow', 'stone', 'ink', 6, 12, 20, 16);
    for (let x = 8; x <= 23; x += 2) px(b, 'dusk', x, 13); // 오므린 주름
    hline(b, 'ink', 7, 28, 18);
    // 졸라맨 끈 + 매듭 두 가닥
    hline(f, 'ash', 9, 15, 14);
    for (const x of [14, 18]) { vline(f, 'ash', x, 15, 6); rect(f, 'brass', x - 1 + (x === 14 ? 0 : 0), 21, 2, 2); px(f, 'brass-light', x - 1, 21); }
  },

  chain_clutch_pearl: (b, f, g) => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, x = Math.round(7 + 18 * t), y = Math.round(13 - 9 * (1 - Math.pow(2 * t - 1, 2)));
      pearl(b, x, y, 1, 'bone', 'paper', 'ash');
    }
    rect(b, 'paper', 5, 14, 22, 13);
    lit(b, 'paper', 'paper', 'bone', 5, 14, 22, 13);
    hline(b, 'ash', 5, 27, 22);
    hline(b, 'ink', 6, 28, 20);
    // 퀼팅: 몸통 안에서만, 4칸 간격 마름모
    clipped(g, b, (l) => { for (let k = -12; k <= 24; k += 5) { line(l, 'bone', 5 + k, 26, 17 + k, 14); line(l, 'bone', 17 + k, 26, 5 + k, 14); } });
    // 덮개 + 쇠 장식
    hline(f, 'ash', 5, 20, 22);
    hline(f, 'paper', 5, 15, 22);
    rect(f, 'brass', 14, 19, 4, 3);
    px(f, 'brass-light', 14, 19);
    px(f, 'brass-dark', 17, 21);
  },

  coin_purse_peach: (b, f) => {
    ellipse(b, 'rose', 16, 20, 11, 8);
    rect(b, 'rose', 6, 13, 20, 7);
    lit(b, 'rose', 'rose-light', 'rose-dark', 5, 12, 22, 17);
    for (const x of [10, 14, 18, 22]) vline(b, 'rose-dark', x, 19, 7); // 주름
    hline(b, 'ink', 9, 28, 14);
    // 똑딱이 입구 + 구슬 두 개 (분홍 상품의 쇠붙이는 은색: 포인트 색은 한 계열만)
    hline(f, 'bone', 6, 13, 20);
    hline(f, 'mist', 6, 14, 20);
    for (const x of [13, 19]) { circle(f, 'ash', x, 10, 2); px(f, 'paper', x - 1, 9); }
  },

  weekender_dune: (b, f) => {
    // 말아 쥔 손잡이 두 개 (서로 떨어지게, 가늘게)
    arch(b, 'skin-b', 10, 14, 3, 5, 1);
    arch(b, 'skin-b', 22, 14, 3, 5, 1);
    polygon(b, 'taupe', [[3, 14], [29, 14], [30, 27], [2, 27]]);
    lit(b, 'taupe', 'bone', 'mist', 2, 14, 28, 14);
    hline(b, 'ash', 3, 28, 26);
    hline(b, 'mist', 4, 21, 24); // 박음질 선
    // 지퍼 + 양옆 가죽 탭
    hline(f, 'brass', 5, 15, 22);
    px(f, 'brass-light', 24, 15);
    rect(f, 'skin-b', 3, 17, 3, 6);
    rect(f, 'skin-b', 26, 17, 3, 6);
    px(f, 'brass', 4, 19); px(f, 'brass', 27, 19);
  },

  trench_three: (b, f) => {
    jacket(b, 'taupe', 'bone', 'mist', true);
    polygon(f, 'bone', [[9, 5], [14, 5], [16, 13], [10, 11]]);
    polygon(f, 'bone', [[23, 5], [18, 5], [16, 13], [22, 11]]);
    rect(f, 'skin-b', 4, 19, 24, 2); // 벨트
    rect(f, 'brass', 14, 18, 4, 4);
    rect(f, 'skin-b', 15, 19, 2, 2);
    for (const y of [14, 23, 26]) { px(f, 'shadow', 13, y); px(f, 'shadow', 19, y); } // 더블 단추
  },

  silk_blouse_window: (b, f) => {
    jacket(b, 'paper', 'paper', 'bone');
    vline(b, 'bone', 16, 12, 13);
    // 목에 맨 리본 + 늘어진 끈
    polygon(f, 'bone', [[16, 8], [10, 5], [10, 11]]);
    polygon(f, 'bone', [[16, 8], [22, 5], [22, 11]]);
    rect(f, 'ash', 15, 7, 3, 3);
    polygon(f, 'ash', [[15, 9], [17, 9], [14, 17], [12, 17]]);
    polygon(f, 'ash', [[16, 9], [18, 9], [20, 16], [18, 16]]);
  },

  velvet_jacket_rose: (b, f) => {
    jacket(b, 'rose', 'rose-light', 'rose-dark');
    // 칼라·라펠 + 소맷단 + 덮개 주머니 + 단추 두 줄
    polygon(f, 'rose-dark', [[10, 5], [14, 5], [16, 14], [11, 12]]);
    polygon(f, 'rose-dark', [[22, 5], [18, 5], [16, 14], [21, 12]]);
    line(f, 'rose-light', 11, 6, 15, 13);
    vline(f, 'ink', 16, 15, 12);
    hline(f, 'rose-dark', 4, 21, 4); hline(f, 'rose-dark', 24, 21, 4);
    hline(f, 'rose-dark', 10, 21, 4); hline(f, 'rose-dark', 18, 21, 4);
    for (const y of [16, 20]) { px(f, 'paper', 14, y); px(f, 'paper', 18, y); px(f, 'bone', 14, y + 1); px(f, 'bone', 18, y + 1); }
    px(f, 'rose-light', 6, 9); px(f, 'rose-light', 25, 9);
  },

  leather_glove_night: (b, f) => {
    // 한 짝은 세우고 한 짝은 비스듬히 겹친다. 손가락 사이 틈과 가죽 광택으로 모양을 읽힌다
    const glove = (ox: number, oy: number): void => {
      rect(b, 'dusk', ox, oy + 9, 10, 10);
      for (const [x, h] of [[0, 6], [3, 9], [6, 8], [9, 5]] as const) rect(b, 'dusk', ox + x, oy + 9 - h, 2, h);
      polygon(b, 'dusk', [[ox - 2, oy + 12], [ox, oy + 10], [ox + 1, oy + 15], [ox - 2, oy + 15]]);
      lit(b, 'dusk', 'mist', 'shadow', ox - 2, oy, 13, 19); // 기존 검은 장갑(nameless_glove)과 같은 밝기
      for (const x of [2, 5, 8]) vline(f, 'ink', ox + x, oy + 5, 4); // 손가락 사이
      for (const [x, h] of [[0, 6], [3, 9], [6, 8]] as const) px(f, 'ash', ox + x, oy + 10 - h); // 손끝 광택
      vline(f, 'shadow', ox + 3, oy + 11, 4); // 손등 박음질
      vline(f, 'shadow', ox + 6, oy + 11, 4);
      rect(f, 'shadow', ox, oy + 16, 10, 3); // 손목 띠
      hline(f, 'stone', ox, oy + 16, 10);
      rect(f, 'brass', ox + 7, oy + 16, 2, 3);
      px(f, 'brass-light', ox + 7, oy + 16);
    };
    glove(5, 4);
    glove(17, 8);
  },

  cameo_letter: (b, f) => {
    ellipse(b, 'brass', 16, 16, 10, 13);
    lit(b, 'brass', 'brass-light', 'brass-dark', 6, 3, 21, 27);
    ellipse(b, 'taupe', 16, 16, 8, 11);
    lit(b, 'taupe', 'bone', 'mist', 8, 5, 17, 23);
    // 옆얼굴: 틀어 올린 머리 + 코 + 목
    circle(f, 'paper', 15, 10, 3);
    polygon(f, 'paper', [[12, 12], [18, 11], [20, 14], [19, 15], [20, 17], [18, 19], [18, 24], [13, 24], [12, 18]]);
    rect(f, 'bone', 13, 20, 4, 4);
    px(f, 'mist', 18, 14);
    for (const [x, y] of [[16, 3], [16, 29], [6, 16], [26, 16]] as const) px(f, 'brass-light', x, y);
  },

  tennis_constellation: (b, f) => {
    // 아래로 휜 한 줄 팔찌: 알마다 흰 돌 + 금 테
    for (let i = 0; i <= 11; i++) {
      const t = i / 11, x = Math.round(3 + 26 * t), y = Math.round(10 + 12 * (1 - Math.pow(2 * t - 1, 2)));
      rect(b, 'brass-dark', x - 1, y - 1, 3, 3);
      rect(f, 'paper', x - 1, y - 1, 2, 2);
      px(f, i % 3 === 0 ? 'paper' : 'bone', x, y);
    }
    rect(f, 'brass', 2, 8, 3, 3);
    rect(f, 'brass', 27, 8, 3, 3);
  },

  pearl_pin_morning: (b, f) => {
    // 두 갈래 핀 + 끝의 진주 하나
    line(b, 'brass', 7, 27, 21, 9);
    line(b, 'brass', 10, 28, 23, 11);
    line(b, 'brass-dark', 8, 27, 22, 9);
    rect(b, 'brass', 20, 8, 4, 3);
    pearl(f, 23, 7, 4, 'bone', 'paper', 'ash');
  },

  rosequartz_first: (b, f) => {
    for (let i = 0; i <= 6; i++) {
      px(b, 'ash', 4 + i * 2, 3 + i * 2);
      px(b, 'ash', 28 - i * 2, 3 + i * 2);
    }
    rect(b, 'bone', 15, 15, 3, 2);
    // 하트 펜던트
    circle(f, 'rose', 13, 20, 3); circle(f, 'rose', 19, 20, 3);
    polygon(f, 'rose', [[10, 21], [22, 21], [16, 28]]);
    lit(f, 'rose', 'rose-light', 'rose-dark', 10, 17, 13, 12);
    px(f, 'paper', 12, 19);
  },

  nine_sleep_basket: (b, f, g) => {
    arch(b, 'skin-b', 16, 12, 10, 9, 2);
    polygon(b, 'taupe', [[5, 16], [27, 16], [25, 28], [7, 28]]);
    lit(b, 'taupe', 'bone', 'mist', 5, 16, 22, 13);
    // 엮은 결: 몸통 안에서만, 3칸 간격 가로줄 + 엇갈린 세로 매듭
    clipped(g, b, (l) => {
      for (let y = 19; y <= 26; y += 3) hline(l, 'skin-b', 5, y, 22);
      for (let y = 17; y <= 26; y += 3) for (let x = 7 + (y % 2) * 2; x <= 25; x += 4) px(l, 'bone', x, y);
    });
    hline(b, 'ink', 8, 29, 16);
    // 살짝 들린 뚜껑 + 틈 속 눈 아홉 쌍
    polygon(b, 'taupe', [[4, 11], [26, 8], [27, 10], [5, 13]]);
    lit(b, 'taupe', 'bone', 'mist', 4, 8, 23, 6);
    polygon(f, 'ink', [[5, 13], [27, 10], [27, 16], [5, 16]]);
    for (const [x, y] of [[7, 14], [11, 13], [15, 14], [19, 12], [23, 13], [9, 15], [17, 15], [21, 15], [25, 12]] as const) {
      px(f, 'steel-light', x, y); px(f, 'steel-light', x + 1, y);
    }
  },

  folded_rain_clutch: (b, f, g) => {
    // 접힌 우산 덮개 모양: 위는 은 입구, 아래는 물결 끝
    hline(b, 'bone', 7, 9, 18);
    hline(b, 'mist', 7, 10, 18);
    for (const x of [13, 19]) { circle(b, 'ash', x, 6, 2); px(b, 'paper', x - 1, 5); }
    polygon(b, 'paper', [[7, 11], [25, 11], [29, 21], [26, 23], [22, 21], [19, 23], [16, 21], [13, 23], [10, 21], [6, 23], [3, 21]]);
    lit(b, 'paper', 'paper', 'bone', 3, 11, 26, 12);
    for (const [x0, x1] of [[10, 6], [14, 13], [18, 19], [22, 26]] as const) line(f, 'ash', x0, 11, x1, 21); // 살대
    // 아무것도 없는 위에서 떨어지는 빗방울
    for (const [x, y] of [[6, 25], [11, 27], [16, 25], [21, 28], [26, 25]] as const) { px(g, 'steel-light', x, y); px(g, 'steel', x, y + 1); }
  },

  soundless_purse: (b, f) => {
    ellipse(b, 'shadow', 16, 21, 11, 7);
    rect(b, 'shadow', 6, 15, 20, 6);
    lit(b, 'shadow', 'stone', 'ink', 5, 14, 22, 15);
    for (const x of [10, 14, 18, 22]) vline(b, 'dusk', x, 21, 6); // 주름
    // 벌어진 쇠틀 입구
    ellipse(f, 'ink', 16, 15, 9, 2);
    ellipseLine(f, 'ash', 16, 15, 10, 3);
    hline(f, 'bone', 8, 12, 5);
    for (const x of [6, 26]) { rect(f, 'ash', x - 1, 13, 2, 3); px(f, 'bone', x - 1, 13); }
    // 위로 떠오르는 동전 (그림자가 없다)
    for (const [x, y] of [[14, 9], [19, 6], [12, 4], [21, 2]] as const) {
      rect(f, 'ash', x, y, 3, 2); px(f, 'paper', x, y); px(f, 'mist', x + 2, y + 1);
    }
  },

  borrowed_size_jacket: (b, f) => {
    // 남의 몸에 맞춘 재킷: 어깨 높이가 다르고, 왼소매는 바닥까지, 오른소매는 팔꿈치에서 끊긴다
    polygon(b, 'rose', [[9, 4], [21, 7], [26, 9], [28, 14], [24, 15], [24, 26], [8, 26], [8, 14], [6, 29], [2, 29], [3, 8]]);
    lit(b, 'rose', 'rose-light', 'rose-dark', 2, 4, 26, 26);
    line(b, 'rose-dark', 8, 13, 8, 26); // 왼소매 경계
    line(b, 'rose-dark', 24, 11, 24, 15); // 오른소매 경계
    polygon(f, 'rose-dark', [[10, 5], [14, 6], [16, 15], [11, 12]]);
    polygon(f, 'rose-dark', [[21, 7], [18, 7], [16, 15], [20, 13]]);
    line(f, 'rose-light', 11, 6, 15, 13);
    vline(f, 'ink', 16, 15, 11);
    for (const y of [18, 22]) { px(f, 'paper', 14, y); px(f, 'bone', 14, y + 1); }
    hline(f, 'rose-dark', 18, 21, 4); // 주머니
    rect(f, 'paper', 2, 27, 4, 2); // 너무 긴 소맷단
    hline(f, 'bone', 2, 28, 4);
    hline(f, 'paper', 24, 14, 4); // 너무 짧은 소맷단
  },

  unwaking_gown: (b, f, g) => {
    polygon(b, 'paper', [[12, 2], [20, 2], [22, 8], [21, 13], [27, 25], [24, 26], [8, 26], [5, 25], [11, 13], [10, 8]]);
    lit(b, 'paper', 'paper', 'bone', 5, 2, 22, 25);
    hline(b, 'bone', 8, 25, 16);
    // 안에 누운 사람 자국(텅 빈 주름)
    polygon(f, 'bone', [[14, 6], [18, 6], [19, 13], [21, 23], [11, 23], [13, 13]]);
    polygon(f, 'ash', [[15, 9], [17, 9], [18, 20], [14, 20]]);
    // 받침에서 떠 있다: 밑에 따로 떨어진 그림자
    hline(g, 'dusk', 9, 30, 14);
  },

  wet_lace_veil: (b, f, g) => {
    polygon(b, 'paper', [[14, 2], [18, 2], [27, 22], [24, 25], [20, 23], [16, 25], [12, 23], [8, 25], [5, 22]]);
    lit(b, 'paper', 'paper', 'bone', 5, 2, 22, 23);
    // 레이스: 노이즈 대신 정해진 간격의 꽃무늬 구멍 + 물결 단
    clipped(f, b, (l) => {
      for (let y = 9; y <= 19; y += 5) for (let x = 8 + ((y / 5) % 2) * 2; x <= 24; x += 4) { px(l, 'ash', x, y); px(l, 'bone', x - 1, y); px(l, 'bone', x + 1, y); px(l, 'bone', x, y - 1); }
    });
    for (const x of [8, 12, 16, 20, 24]) px(f, 'ash', x, 23);
    for (const [x, y] of [[8, 25], [16, 25], [24, 25]] as const) { px(f, 'steel-light', x, y + 1); px(f, 'steel', x, y + 2); }
    ellipse(g, 'steel-dark', 16, 29, 11, 1); // 물웅덩이
    hline(g, 'steel', 9, 29, 4);
  },

  dry_handkerchief: (b, f) => {
    polygon(b, 'rose', [[16, 9], [27, 17], [16, 24], [5, 17]]);
    lit(b, 'rose', 'rose-light', 'rose-dark', 5, 9, 23, 16);
    line(b, 'rose-dark', 16, 10, 16, 23);
    polygon(f, 'rose-light', [[16, 9], [21, 13], [16, 17], [11, 13]]); // 접힌 윗장
    // 바싹 마른 손수건 둘레에만 고인 눈물
    for (const [x, y] of [[4, 23], [9, 27], [16, 28], [23, 27], [28, 23], [3, 12], [29, 11]] as const) {
      px(f, 'paper', x, y); px(f, 'ash', x, y + 1);
    }
  },

  unreflecting_brooch: (b, f) => {
    ellipse(b, 'taupe', 16, 16, 11, 13);
    lit(b, 'taupe', 'bone', 'mist', 5, 3, 23, 27);
    for (const [x, y] of [[16, 2], [16, 30], [5, 16], [27, 16], [8, 6], [24, 6], [8, 26], [24, 26]] as const) circle(b, 'bone', x, y, 1);
    // 가운데 거울: 아무것도 비치지 않는 평평한 회색 (하이라이트 없음)
    ellipse(f, 'mist', 16, 16, 7, 9);
    ellipseLine(f, 'stone', 16, 16, 7, 9);
  },

  other_name_tag: (b, f, g) => {
    rect(b, 'stone', 13, 4, 6, 6); // 핀 고리
    rect(b, 'dusk', 14, 5, 4, 4);
    rect(b, 'brass', 2, 11, 28, 13);
    lit(b, 'brass', 'brass-light', 'brass-dark', 2, 11, 28, 13);
    rect(b, 'shadow', 4, 13, 24, 9);
    for (const [x, y] of [[3, 12], [28, 12], [3, 22], [28, 22]] as const) px(b, 'brass-dark', x, y);
    // 이름 자리: 수없이 긁힌 자국
    for (const [x0, y0, x1, y1] of [[6, 20, 15, 14], [9, 21, 20, 14], [13, 20, 25, 15], [7, 15, 24, 20], [17, 21, 26, 14]] as const) line(f, 'mist', x0, y0, x1, y1);
    line(g, 'ash', 11, 15, 19, 20);
  },

  rusted_key_pendant: (b, f, g) => {
    for (let i = 0; i <= 5; i++) { px(b, 'ash', 6 + i * 2, 2 + i); px(b, 'ash', 26 - i * 2, 2 + i); }
    // 열쇠: 고리 자체가 열쇠 구멍 모양. 검은 쇠라도 어두운 진열장에서 읽히게 한 단계 밝게
    circle(b, 'stone', 16, 11, 5);
    rect(b, 'stone', 15, 15, 3, 13);
    rect(b, 'stone', 18, 22, 4, 2);
    rect(b, 'stone', 18, 26, 3, 2);
    lit(b, 'stone', 'mist', 'dusk', 11, 6, 11, 22);
    circle(f, 'ink', 16, 10, 2);
    polygon(f, 'ink', [[15, 11], [17, 11], [18, 15], [14, 15]]);
    // 녹
    for (const [x, y] of [[15, 18], [17, 21], [16, 25], [12, 9], [20, 12]] as const) px(g, 'brass-dark', x, y);
    px(g, 'skin-b', 19, 22);
  },

  voice_dummy: () => undefined,
};
delete (ICONS as Record<string, Pen | undefined>).voice_dummy;

const cache = new Map<string, Layer>();
const miniCache = new Map<string, Layer>();

function parts(id: string): { b: Layer; f: Layer; g: Layer } {
  const pen = ICONS[id];
  if (!pen) throw new Error(`unknown icon: ${id}`);
  const b = new Layer(S, S), f = new Layer(S, S), g = new Layer(S, S);
  pen(b, f, g);
  return { b, f, g };
}

function merge(...ls: Layer[]): Layer {
  const o = new Layer(S, S);
  for (const l of ls) for (let i = 0; i < l.data.length; i++) if (l.data[i] !== T) o.data[i] = l.data[i] as number;
  return o;
}

/** 32×32 아이콘 (3톤 + selective outline) */
export function drawIcon(id: string): Layer {
  const hit = cache.get(id);
  if (hit) return hit;
  const { b, f, g } = parts(id);
  const o = merge(b, g, f);
  smooth(o);
  selOutline(o);
  cache.set(id, o);
  return o;
}

/** 16×16 축소판: 실루엣 + 핵심 특징만. 특징 레이어가 우선한다. */
export function drawMini(id: string): Layer {
  const hit = miniCache.get(id);
  if (hit) return hit;
  const { b, f } = parts(id);
  const o = new Layer(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const count = (l: Layer): { k: number; n: number }[] => {
        const m = new Map<number, number>();
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const v = l.get(x * 2 + dx, y * 2 + dy);
          if (v !== T) m.set(v, (m.get(v) ?? 0) + 1);
        }
        return [...m].map(([k, n]) => ({ k, n })).sort((p, q) => q.n - p.n);
      };
      const fc = count(f);
      const fn = fc.reduce((s, e) => s + e.n, 0);
      if (fn >= 2) { o.set(x, y, (fc[0] as { k: number }).k); continue; }
      const bc = count(b);
      const bn = bc.reduce((s, e) => s + e.n, 0) + fn;
      if (bn >= 2) o.set(x, y, ((bc[0] ?? fc[0]) as { k: number }).k);
    }
  smooth(o);
  selOutline(o);
  miniCache.set(id, o);
  return o;
}

export const ICON_IDS: readonly string[] = Object.keys(ICONS);

/** 실루엣 검사: ink 한 색으로만 칠한 아이콘 */
export function iconSilhouette(id: string): Layer {
  const src = drawIcon(id);
  const o = new Layer(S, S);
  for (let i = 0; i < src.data.length; i++) if (src.data[i] !== T) o.data[i] = KEY_INDEX.ink;
  return o;
}

