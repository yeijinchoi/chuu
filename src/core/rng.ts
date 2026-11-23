/** mulberry32 시드 RNG. 같은 시드면 같은 수열. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 → 32비트 해시 (손님·날짜별 파생 시드용) */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function deriveRng(seed: number, ...parts: (string | number)[]): Rng {
  return mulberry32((seed ^ hashString(parts.join(':'))) >>> 0);
}

export function pickOne<T>(rng: Rng, list: readonly T[]): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length)];
}

/** Fisher–Yates. 원본을 바꾸지 않는다. */
export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}
