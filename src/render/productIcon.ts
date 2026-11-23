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

