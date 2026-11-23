import { KEYS, KEY_INDEX, darken, type PaletteKey } from './palette';

/** 투명 인덱스 */
export const T = 255;

/** 팔레트 키 인덱스로 채우는 화면 버퍼. 모든 좌표는 정수다. */
export class Layer {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h).fill(T);
  }
  clear(): void {
    this.data.fill(T);
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T;
    return this.data[y * this.w + x] as number;
  }
  set(x: number, y: number, idx: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = idx;
  }
  copyFrom(o: Layer): void {
    this.data.set(o.data);
  }
}

const I = (k: PaletteKey): number => KEY_INDEX[k];

export function px(l: Layer, k: PaletteKey, x: number, y: number): void {
  l.set(x | 0, y | 0, I(k));
}

export function rect(l: Layer, k: PaletteKey, x: number, y: number, w: number, h: number): void {
  const v = I(k);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) l.set(x + i, y + j, v);
}

export function hline(l: Layer, k: PaletteKey, x: number, y: number, w: number): void {
  rect(l, k, x, y, w, 1);
}
export function vline(l: Layer, k: PaletteKey, x: number, y: number, h: number): void {
  rect(l, k, x, y, 1, h);
}

/** 브레젠험 직선 */
export function line(l: Layer, k: PaletteKey, x0: number, y0: number, x1: number, y1: number): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(l, k, x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 채운 타원 (중심 cx,cy, 반지름 rx,ry) */
export function ellipse(l: Layer, k: PaletteKey, cx: number, cy: number, rx: number, ry: number): void {
  const v = I(k);
  for (let y = -ry; y <= ry; y++) {
    const t = ry === 0 ? 0 : y / (ry + 0.5);
    const half = Math.floor((rx + 0.5) * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = -half; x <= half; x++) l.set(cx + x, cy + y, v);
  }
}
export function circle(l: Layer, k: PaletteKey, cx: number, cy: number, r: number): void {
  ellipse(l, k, cx, cy, r, r);
}

/** 타원 테두리 1도트 */
export function ellipseLine(l: Layer, k: PaletteKey, cx: number, cy: number, rx: number, ry: number): void {
  const v = I(k);
  const inside = (x: number, y: number, a: number, b: number): boolean => {
    if (a <= 0 || b <= 0) return false;
    const tx = x / (a + 0.5), ty = y / (b + 0.5);
    return tx * tx + ty * ty <= 1;
  };
  for (let y = -ry - 1; y <= ry + 1; y++)
    for (let x = -rx - 1; x <= rx + 1; x++)
      if (inside(x, y, rx, ry) && !inside(x, y, rx - 1, ry - 1)) l.set(cx + x, cy + y, v);
}

/** 다각형 채우기 (정점은 정수) */
export function polygon(l: Layer, k: PaletteKey, pts: readonly (readonly [number, number])[]): void {
  const v = I(k);
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as readonly [number, number], b = pts[(i + 1) % pts.length] as readonly [number, number];
      if (a[1] === b[1]) continue;
      const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      if (y + 0.5 < y0 || y + 0.5 >= y1) continue;
      xs.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.round(xs[i] as number); x < Math.round(xs[i + 1] as number); x++) l.set(x, y, v);
  }
}

/** 2×2 체커 디더. k2를 주면 두 색을 번갈아 쓰고, 없으면 k1만 찍는다. */
export function dither(l: Layer, k1: PaletteKey, k2: PaletteKey | null, x: number, y: number, w: number, h: number): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if ((x + i + y + j) & 1) l.set(x + i, y + j, I(k1));
      else if (k2) l.set(x + i, y + j, I(k2));
    }
}

/** 좌우 반전 복사본 */
export function flipX(src: Layer): Layer {
  const o = new Layer(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
}

/** src의 불투명 도트를 dst에 찍는다. */
export function stamp(dst: Layer, src: Layer, dx: number, dy: number, flip = false): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const v = src.get(flip ? src.w - 1 - x : x, y);
      if (v !== T) dst.set(dx + x, dy + y, v);
    }
}

/** 불투명 도트 바깥 1도트(상하좌우)를 k로 감싼다. */
export function outline(l: Layer, k: PaletteKey = 'ink'): void {
  const v = I(k);
  const add: number[] = [];
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      if (l.get(x, y) !== T) continue;
      if (l.get(x - 1, y) !== T || l.get(x + 1, y) !== T || l.get(x, y - 1) !== T || l.get(x, y + 1) !== T) add.push(y * l.w + x);
    }
  for (const i of add) l.data[i] = v;
}

/** 모든 도트를 한 키로 칠한다 (실루엣 검사용) */
export function silhouette(src: Layer, k: PaletteKey = 'ink'): Layer {
  const o = new Layer(src.w, src.h);
  for (let i = 0; i < src.data.length; i++) if (src.data[i] !== T) o.data[i] = I(k);
  return o;
}

/** 레이어의 모든 도트를 steps단계 어둡게 (조명 반경 밖 처리) */
export function dimLayer(l: Layer, steps: number, test?: (x: number, y: number) => boolean): void {
  const map = KEYS.map((k) => KEY_INDEX[darken(k, steps)]);
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      const v = l.data[y * l.w + x] as number;
      if (v === T) continue;
      if (test && !test(x, y)) continue;
      l.data[y * l.w + x] = map[v] as number;
    }
}

/** 키 하나를 다른 키로 바꾼다 */
export function remap(l: Layer, from: PaletteKey, to: PaletteKey): void {
  const a = I(from), b = I(to);
  for (let i = 0; i < l.data.length; i++) if (l.data[i] === a) l.data[i] = b;
}

/** 레이어 → ImageData. lut은 buildLut() 결과. 투명은 알파 0. */
export function toImageData(l: Layer, lut: Uint8Array, img: ImageData): void {
  const d = img.data;
  for (let i = 0, n = l.data.length; i < n; i++) {
    const v = l.data[i] as number;
    const o = i * 4;
    if (v === T) { d[o + 3] = 0; continue; }
    d[o] = lut[v * 3] as number;
    d[o + 1] = lut[v * 3 + 1] as number;
    d[o + 2] = lut[v * 3 + 2] as number;
    d[o + 3] = 255;
  }
}

/** 같은 재질 안에서 한 단계 어두운 윤곽선 색 (selective outline) */
const EDGE: Record<PaletteKey, PaletteKey> = {
  ink: 'ink', shadow: 'ink', dusk: 'shadow', stone: 'dusk', mist: 'stone', ash: 'stone', bone: 'mist', paper: 'ash',
  rose: 'rose-dark', 'rose-dark': 'wine-dark', 'rose-light': 'rose-dark',
  brass: 'brass-dark', 'brass-dark': 'shadow', 'brass-light': 'brass-dark',
  steel: 'steel-dark', 'steel-dark': 'dusk', 'steel-light': 'steel-dark',
  wine: 'wine-dark', 'wine-dark': 'ink',
  'skin-a': 'skin-b', 'skin-b': 'stone', 'skin-c': 'skin-b', taupe: 'mist', hair: 'ink',
};
export function edgeKey(k: PaletteKey): PaletteKey {
  return EDGE[k];
}
const DARKNESS: Record<string, number> = {
  ink: 0, shadow: 1, 'wine-dark': 1, dusk: 2, 'steel-dark': 3, 'brass-dark': 3, 'rose-dark': 3, hair: 1, wine: 2, stone: 3,
  mist: 4, taupe: 5, 'skin-b': 5, rose: 4, brass: 4, steel: 5, ash: 5, bone: 6, 'skin-a': 6, 'rose-light': 6, 'brass-light': 6,
  'steel-light': 7, 'skin-c': 7, paper: 8,
};

/** 윤곽선: 이웃한 채움 중 가장 어두운 쪽의 한 단계 어두운 색. 외부 배경이 밝은 곳은 ink로 둔다 */
export function selOutline(l: Layer, forceInk = false): void {
  const add: [number, number][] = [];
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      if (l.get(x, y) !== T) continue;
      let best = -1, bd = 99;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const v = l.get(x + dx, y + dy);
        if (v === T) continue;
        const d = DARKNESS[KEYS[v] as string] as number;
        if (d < bd) { bd = d; best = v; }
      }
      if (best >= 0) add.push([y * l.w + x, best]);
    }
  for (const [i, v] of add) l.data[i] = forceInk ? KEY_INDEX.ink : KEY_INDEX[EDGE[KEYS[v] as PaletteKey]];
}

/** 계단 모서리에 중간 톤 도트 1개를 넣어 곡선을 부드럽게 (수동 안티앨리어싱) */
export function smooth(l: Layer): void {
  const add: [number, number][] = [];
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      if (l.get(x, y) !== T) continue;
      const n = l.get(x, y - 1), s = l.get(x, y + 1), w = l.get(x - 1, y), e = l.get(x + 1, y);
      const pairs: [number, number, number][] = [[n, w, l.get(x + 1, y + 1)], [n, e, l.get(x - 1, y + 1)], [s, w, l.get(x + 1, y - 1)], [s, e, l.get(x - 1, y - 1)]];
      for (const [a, b, opp] of pairs)
        if (a !== T && b !== T && opp === T) {
          const da = DARKNESS[KEYS[a] as string] as number, db = DARKNESS[KEYS[b] as string] as number;
          add.push([y * l.w + x, da <= db ? a : b]);
          break;
        }
    }
  for (const [i, v] of add) l.data[i] = KEY_INDEX[darken(KEYS[v] as PaletteKey, 1)];
}

/**
 * 3톤 라이팅: bbox 안의 `base` 도트를 빛(왼쪽 위)에 따라 hi/base/lo로 나눈다.
 * 경계는 2×2 체커 디더로만 섞는다.
 */
export function lit(
  l: Layer, base: PaletteKey, hi: PaletteKey, lo: PaletteKey,
  x: number, y: number, w: number, h: number, light: readonly [number, number] = [-0.55, -0.8], dith = true,
): void {
  const b = I(base), H = I(hi), L = I(lo);
  const cx = x + w / 2, cy = y + h / 2;
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      if (l.get(i, j) !== b) continue;
      const u = (i + 0.5 - cx) / (w / 2), v = (j + 0.5 - cy) / (h / 2);
      const t = -(light[0] * u + light[1] * v) / (Math.abs(light[0]) + Math.abs(light[1]));
      const chk = (i + j) & 1;
      let out = b;
      if (t > 0.5) out = H;
      else if (dith && t > 0.38) out = chk ? H : b;
      else if (t < -0.4) out = L;
      else if (dith && t < -0.28) out = chk ? L : b;
      l.data[j * l.w + i] = out;
    }
}
