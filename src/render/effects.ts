import { resolve } from './palette';

export const FLICKER_MIN_MS = 350;

/** 샹들리에 깜빡임. 최소 간격 350ms. reduced면 항상 1(켜짐). 반환: 0 = 평소 밝기, 1 = 한 단계 어두움 */
export interface Flicker {
  update(dt: number): void;
  readonly level: 0 | 1;
}

export function createFlicker(reduced: boolean, rand: () => number = Math.random): Flicker {
  let level: 0 | 1 = 0;
  let timer = 2 + rand() * 4; // 초
  let dimLeft = 0;
  return {
    update(dt: number) {
      if (reduced) { level = 0; return; }
      timer -= dt;
      if (level === 1) {
        dimLeft -= dt;
        if (dimLeft <= 0) { level = 0; timer = Math.max(FLICKER_MIN_MS / 1000, 2 + rand() * 5); }
      } else if (timer <= 0) {
        level = 1;
        dimLeft = FLICKER_MIN_MS / 1000; // 최소 간격 이상 유지
      }
    },
    get level() { return level; },
  };
}

/** 스캔라인: 짝수 줄에 ink 20% */
export function scanlines(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = resolve('ink');
  for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
