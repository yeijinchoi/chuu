import type { Mood, Shift } from './types';

/** 평정심 → mood 단계 (GDD §8). 오후에는 항상 calm. */
export function moodFor(composure: number, shift: Shift): Mood {
  if (shift === 'afternoon') return 'calm';
  if (composure >= 70) return 'uneasy';
  if (composure >= 40) return 'dread';
  return 'collapse';
}
