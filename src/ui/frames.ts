import { resolve, type Mood, type PaletteKey } from '../render/palette';

/**
 * 프레임 "메종 필리그리" (DESIGN_SYSTEM §7-1).
 * 9-slice 이미지를 오프스크린 캔버스에 팔레트 키로 그려 data URL로 만들고, CSS 변수로 노출한다.
 * mood가 바뀌면 palette.resolve가 키를 바꿔 주므로(황동 → 회색, breach → wine) 다시 생성하면 된다.
 */

type Pen = (x: number, y: number, k: PaletteKey) => void;

function canvasOf(w: number, h: number, mood: Mood): { cv: HTMLCanvasElement; px: Pen } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (!g) throw new Error('Canvas 2D unavailable');
  const px: Pen = (x, y, k) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    g.fillStyle = resolve(k, mood);
    g.fillRect(x, y, 1, 1);
  };
  return { cv, px };
}

function clear(cv: HTMLCanvasElement, x: number, y: number): void {
  cv.getContext('2d')?.clearRect(x, y, 1, 1);
}

/** 가장자리 줄무늬: 위치 → 키. 모서리는 마이터(대각선 이음)로 잇는다. */
type Band = Partial<Record<number, PaletteKey>>;

function frame(size: number, depth: number, band: Band, mood: Mood, ornament?: (px: Pen, cv: HTMLCanvasElement) => void, chamfer: Partial<Record<number, number>> = {}): string {
  const { cv, px } = canvasOf(size, size, mood);
  const edge = (d: number, k: PaletteKey): void => {
    // 한 줄: 바깥에서 d만큼 들어온 사각형 윤곽을 그리되, 모서리를 chamfer만큼 깎는다
    const c = chamfer[d] ?? 0;
    for (let i = d + c; i < size - d - c; i++) {
      px(i, d, k); px(i, size - 1 - d, k); px(d, i, k); px(size - 1 - d, i, k);
    }
    for (let j = 0; j < c; j++) {
      // 모서리 대각선 잇기
      const a = d + c - j;
      const b = d + j;
      px(a, b, k); px(b, a, k);
      px(size - 1 - a, b, k); px(size - 1 - b, a, k);
      px(a, size - 1 - b, k); px(b, size - 1 - a, k);
      px(size - 1 - a, size - 1 - b, k); px(size - 1 - b, size - 1 - a, k);
    }
  };
  void depth;
  for (const [d, k] of Object.entries(band)) edge(Number(d), k as PaletteKey);
  ornament?.(px, cv);
  return cv.toDataURL('image/png');
}

/** 16×16 모서리 장식(왼쪽 위 기준)을 네 모서리에 대칭으로 찍는다 */
function stampCorners(px: Pen, size: number, map: readonly string[], legend: Record<string, PaletteKey>): void {
  const n = map.length;
  map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const k = legend[ch];
      if (!k) return;
      px(x, y, k); px(size - 1 - x, y, k); px(x, size - 1 - y, k); px(size - 1 - x, size - 1 - y, k);
    });
  });
  void n;
}

const LEG: Record<string, PaletteKey> = {
  d: 'brass-dark', s: 'stone', u: 'dusk', b: 'brass', l: 'brass-light', p: 'paper', o: 'bone', a: 'ash', k: 'ink', m: 'mist',
};

/** 주 프레임 모서리 필리그리: 진주 한 알과 안쪽으로 말린 덩굴 두 갈래(명품관의 퀼팅 마름모를 닮은 작은 마름모 포함) */
const MAIN_CORNER = [
  '................',
  '................',
  '................',
  '................',
  '......b.........',
  '.....blb........',
  '......b.........',
  '.......oop.b....',
  '..b....oaa.lbbb.',
  '.blb...aaa....b.',
  '..b...b.......bl',
  '......lb.......b',
  '.......b........',
  '.......bb.......',
  '................',
  '................',
];
/** 두 번째 덩굴(대각선 대칭)은 stampCorners 전에 행/열을 바꿔 합친다 */
function symmetrize(map: readonly string[]): string[] {
  const n = map.length;
  const g = map.map((r) => [...r]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = (map[x] as string)[y] as string;
    if (c !== '.' && g[y]?.[x] === '.') (g[y] as string[])[x] = c;
  }
  return g.map((r) => r.join(''));
}

function mainFrame(mood: Mood): string {
  return frame(48, 16, { 0: 'brass-dark', 2: 'stone', 5: 'dusk', 14: 'stone', 15: 'ink' }, mood, (px) => {
    // 안쪽 두 줄 사이를 비워 두고 모서리에서만 선을 끊는다
    stampCorners(px, 48, symmetrize(MAIN_CORNER), LEG);
  }, { 0: 4, 2: 3 });
}

function minorFrame(mood: Mood): string {
  return frame(24, 8, { 0: 'brass-dark', 2: 'stone' }, mood, (px) => {
    stampCorners(px, 24, symmetrize(['........', '........', '........', '...b....', '..blb...', '...b..b.', '.....b..', '........']), LEG);
  }, { 0: 3, 2: 2 });
}

export interface TinyStyle { outer: PaletteKey; inner: PaletteKey; corner: PaletteKey }
const TINY: Record<string, TinyStyle> = {
  base: { outer: 'brass-dark', inner: 'stone', corner: 'brass' },
  hover: { outer: 'brass-dark', inner: 'brass', corner: 'brass-light' },
  focus: { outer: 'brass', inner: 'stone', corner: 'brass-light' },
  selected: { outer: 'brass-dark', inner: 'rose', corner: 'rose-light' },
  disabled: { outer: 'dusk', inner: 'dusk', corner: 'stone' },
};

/** 작은 프레임(버튼·칸·탭): 바깥 선 1px, 안쪽 선 1px, 모서리 홈 */
function tinyFrame(s: TinyStyle, mood: Mood): string {
  return frame(12, 4, { 0: s.outer, 2: s.inner }, mood, (px, cv) => {
    for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11]] as const) clear(cv, x, y);
    for (const [x, y] of [[1, 1], [10, 1], [1, 10], [10, 10]] as const) px(x, y, s.corner);
  });
}

/** 구분선: 가운데는 한 줄, 양끝으로 갈수록 1px씩 끊기며 사라진다(2×2 체커 디더 페이드) */
function dividerImage(mood: Mood): string {
  const { cv, px } = canvasOf(49, 3, mood);
  for (let x = 0; x < 49; x++) {
    const edge = Math.min(x, 48 - x);
    if (edge < 24 && edge % 2 === 1 && edge < 12) continue;
    if (edge < 4 && (x + 1) % 2 === 0) continue;
    px(x, 1, edge < 12 ? 'stone' : 'brass-dark');
  }
  return cv.toDataURL('image/png');
}

/** 칸 위쪽 가운데 작은 V 장식 (7×3) */
function ornamentV(mood: Mood): string {
  const { cv, px } = canvasOf(9, 4, mood);
  const pts: [number, number, PaletteKey][] = [[0, 0, 'brass-dark'], [1, 1, 'brass'], [2, 2, 'brass'], [3, 3, 'brass-light'], [4, 3, 'brass-light'], [5, 3, 'brass-light'], [6, 2, 'brass'], [7, 1, 'brass'], [8, 0, 'brass-dark']];
  for (const [x, y, k] of pts) px(x, y, k);
  return cv.toDataURL('image/png');
}

/** 폰 몸체 아래 홈 바와 마름모 구슬 */
function diamondImage(mood: Mood): string {
  const { cv, px } = canvasOf(7, 7, mood);
  const pts: [number, number, PaletteKey][] = [[3, 0, 'brass'], [2, 1, 'brass'], [3, 1, 'brass-light'], [4, 1, 'brass'], [1, 2, 'brass-dark'], [2, 2, 'brass'], [3, 2, 'paper'], [4, 2, 'brass'], [5, 2, 'brass-dark'], [0, 3, 'brass-dark'], [1, 3, 'brass'], [2, 3, 'brass-light'], [3, 3, 'brass-light'], [4, 3, 'brass-light'], [5, 3, 'brass'], [6, 3, 'brass-dark'], [1, 4, 'brass-dark'], [2, 4, 'brass'], [3, 4, 'brass-light'], [4, 4, 'brass'], [5, 4, 'brass-dark'], [2, 5, 'brass-dark'], [3, 5, 'brass'], [4, 5, 'brass-dark'], [3, 6, 'brass-dark']];
  for (const [x, y, k] of pts) px(x, y, k);
  return cv.toDataURL('image/png');
}

export interface FrameSet { vars: Record<string, string> }

export function buildFrames(mood: Mood): FrameSet {
  const url = (d: string): string => `url("${d}")`;
  const vars: Record<string, string> = {
    '--fr-main': url(mainFrame(mood)),
    '--fr-minor': url(minorFrame(mood)),
    '--fr-divider': url(dividerImage(mood)),
    '--fr-v': url(ornamentV(mood)),
    '--fr-diamond': url(diamondImage(mood)),
  };
  for (const [name, style] of Object.entries(TINY)) vars[`--fr-tiny-${name}`] = url(tinyFrame(style, mood));
  return { vars };
}

/** 프레임 이미지를 만들어 root의 CSS 변수로 건다. mood가 바뀔 때마다 호출한다. */
export function applyFrames(root: HTMLElement, mood: Mood): void {
  const { vars } = buildFrames(mood);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
