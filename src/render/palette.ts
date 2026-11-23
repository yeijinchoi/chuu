// Dusk Mono 24 (16 + 음영 램프 8) — src/ui/styles/tokens.css 와 같은 값을 유지한다.
export const PALETTE = {
  ink: '#0c0a0a',
  shadow: '#1c1a1a',
  dusk: '#2f2c2c',
  stone: '#4a4646',
  mist: '#6e6a69',
  ash: '#9c9693',
  bone: '#cfc8c3',
  paper: '#ece4da',
  rose: '#b85c78',
  brass: '#a88c52',
  steel: '#7a9cb0',
  wine: '#9e2236',
  'skin-a': '#d8c2b4',
  'skin-b': '#a8887a',
  taupe: '#a89a88',
  hair: '#3a2e2a',
  // 음영 램프: 새 색상이 아니라 같은 계열의 명암이다. 면적은 계열 전체가 장면의 10% 이하.
  'rose-dark': '#7e3a52',
  'rose-light': '#d88aa2',
  'brass-dark': '#6f5a32',
  'brass-light': '#cdb57e',
  'steel-dark': '#4e6a7c',
  'steel-light': '#a9c3d2',
  'wine-dark': '#5e1422',
  'skin-c': '#f0dccd',
  // 환경 램프(오크블러드): 벽·바닥·패널 같은 "공간"만 쓴다. 상품·사람·마네킹의 검정/회색은 위 무채색을 쓴다.
  oxd: '#201415',
  oxm: '#371f21',
  oxw: '#5b3636',
  oxl: '#845d5c',
} as const;

export type PaletteKey = keyof typeof PALETTE;
export type Mood = 'calm' | 'uneasy' | 'dread' | 'collapse' | 'breach';
export const MOODS: readonly Mood[] = ['calm', 'uneasy', 'dread', 'collapse', 'breach'];

/** 팔레트 키 배열. 인덱스가 레이어 버퍼에 저장되는 값이다. */
export const KEYS = Object.keys(PALETTE) as PaletteKey[];
export const KEY_INDEX = Object.fromEntries(KEYS.map((k, i) => [k, i])) as Record<PaletteKey, number>;

const NEUTRALS: readonly PaletteKey[] = ['ink', 'shadow', 'dusk', 'stone', 'mist', 'ash', 'bone', 'paper'];
type Family = 'rose' | 'brass' | 'steel' | 'wine';
const FAMILY: Partial<Record<PaletteKey, Family>> = {
  rose: 'rose', 'rose-dark': 'rose', 'rose-light': 'rose',
  brass: 'brass', 'brass-dark': 'brass', 'brass-light': 'brass',
  steel: 'steel', 'steel-dark': 'steel', 'steel-light': 'steel',
  wine: 'wine', 'wine-dark': 'wine',
};

/** 무채색 사다리에서의 밝기 단계 (0 ink … 7 paper). 어둡게/회색으로 만들 때 기준이다. */
const TONE: Record<PaletteKey, number> = {
  ink: 0, shadow: 1, dusk: 2, stone: 3, mist: 4, ash: 5, bone: 6, paper: 7,
  rose: 4, brass: 4, steel: 5, wine: 2, 'skin-a': 6, 'skin-b': 5, taupe: 5, hair: 1,
  'rose-dark': 3, 'rose-light': 5, 'brass-dark': 3, 'brass-light': 5,
  'steel-dark': 3, 'steel-light': 6, 'wine-dark': 1, 'skin-c': 6,
  oxd: 1, oxm: 2, oxw: 3, oxl: 4,
};

/** 환경 램프는 무채색 사다리의 같은 단계를 따라 움직인다 (분위기가 바뀌어도 같은 밝기로 어두워진다). */
const OX_TWIN: Partial<Record<PaletteKey, PaletteKey>> = { oxd: 'shadow', oxm: 'dusk', oxw: 'stone', oxl: 'mist' };
const OX_BACK: Partial<Record<PaletteKey, PaletteKey>> = { shadow: 'oxd', dusk: 'oxm', stone: 'oxw', mist: 'oxl' };

/** 무채색이 아닌 키가 어두워질 때 따라가는 사슬 */
const CHAIN: Partial<Record<PaletteKey, readonly PaletteKey[]>> = {
  'skin-c': ['skin-c', 'skin-a', 'skin-b', 'mist'],
  'skin-a': ['skin-a', 'skin-b', 'mist', 'stone'],
  'skin-b': ['skin-b', 'mist', 'stone', 'dusk'],
  taupe: ['taupe', 'mist', 'stone', 'dusk'],
  hair: ['hair', 'shadow', 'ink'],
};

/** 키를 steps단계 어둡게. 포인트 색은 건드리지 않는다. */
export function darken(key: PaletteKey, steps: number): PaletteKey {
  if (steps <= 0) return key;
  const chain = CHAIN[key];
  if (chain) return chain[Math.min(steps, chain.length - 1)] as PaletteKey;
  const i = NEUTRALS.indexOf(key);
  if (i < 0) return key;
  return NEUTRALS[Math.max(0, i - steps)] as PaletteKey;
}

/** 같은 밝기의 무채색 */
export function grayOf(key: PaletteKey): PaletteKey {
  return NEUTRALS[TONE[key]] as PaletteKey;
}

/** "바깥에서 온 색"이 빨아들이는 순서 */
export const DRAIN_ORDER: readonly PaletteKey[] = ['brass', 'rose', 'steel', 'taupe', 'wine', 'skin-b'];

function isDrained(k: PaletteKey, drained?: ReadonlySet<PaletteKey>): boolean {
  if (!drained) return false;
  const f = FAMILY[k];
  return drained.has(k) || (f !== undefined && drained.has(f));
}

/** mood별로 키를 바꾼다. 그리기 함수는 키만 알고, 실제 색은 여기서 정해진다. */
export function resolveKey(key: PaletteKey, mood: Mood = 'calm', drained?: ReadonlySet<PaletteKey>): PaletteKey {
  const twin = OX_TWIN[key];
  if (twin) {
    const r = resolveKey(twin, mood, drained);
    return OX_BACK[r] ?? r;
  }
  let k = key;
  if (isDrained(k, drained)) k = grayOf(k);
  const fam = FAMILY[k];
  switch (mood) {
    case 'calm':
      return k;
    case 'uneasy':
      if (fam === 'brass') return grayOf(k);
      return fam ? k : darken(k, 1);
    case 'dread':
    case 'collapse':
      if (fam === 'wine') return k;
      if (fam) return darken(grayOf(k), 1);
      return darken(k, 2);
    case 'breach':
      if (k === 'paper') return 'paper';
      if (fam === 'wine') return k === 'wine-dark' ? 'ink' : 'wine';
      return TONE[k] >= 4 ? 'wine' : 'ink';
  }
}

export function resolve(key: PaletteKey, mood: Mood = 'calm'): string {
  return PALETTE[resolveKey(key, mood)];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 레이어 인덱스 → RGB 조회표 (인덱스 16개). */
export function buildLut(mood: Mood, drained?: ReadonlySet<PaletteKey>): Uint8Array {
  const lut = new Uint8Array(KEYS.length * 3);
  KEYS.forEach((k, i) => {
    const rgb = hexToRgb(PALETTE[resolveKey(k, mood, drained)]);
    lut[i * 3] = rgb[0];
    lut[i * 3 + 1] = rgb[1];
    lut[i * 3 + 2] = rgb[2];
  });
  return lut;
}
