import { resolve, type Mood, type PaletteKey } from '../render/palette';

/** 폰 홈 화면의 앱 아이콘(16×16 도트). 팔레트 키만 쓰고 mood를 따른다. 표시는 CSS로 3~4배. */
export type AppIcon = 'book' | 'black';

const cache = new Map<string, string>();

export function appIconUrl(kind: AppIcon, mood: Mood): string {
  const key = `${kind}|${mood}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d');
  if (!g) return '';
  const rect = (k: PaletteKey, x: number, y: number, w: number, h: number): void => {
    g.fillStyle = resolve(k, mood);
    g.fillRect(x, y, w, h);
  };
  const notch = (): void => { for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) g.clearRect(x as number, y as number, 1, 1); };
  if (kind === 'book') {
    rect('ink', 0, 0, 16, 16);
    rect('dusk', 1, 1, 14, 14);
    rect('brass-dark', 3, 2, 1, 12);
    rect('paper', 4, 2, 9, 12);
    rect('bone', 12, 2, 1, 12);
    for (const y of [5, 7, 9]) rect('ash', 6, y, 5, 1);
    rect('rose', 6, 3, 2, 1);
    rect('brass', 3, 2, 1, 1);
    notch();
  } else {
    rect('ink', 0, 0, 16, 16);
    rect('shadow', 1, 1, 14, 14);
    rect('ink', 2, 2, 12, 12);
    rect('stone', 2, 2, 12, 1);
    rect('dusk', 7, 7, 2, 2); // 열리지 않는 검은 아이콘: 가운데에 어두운 점 하나
    notch();
  }
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
