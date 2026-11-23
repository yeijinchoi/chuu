/**
 * 레이아웃 전환 (DESIGN_SYSTEM §7-2).
 * 폭 < 760 이고 세로면 모바일(흐르는 CSS px 레이아웃), 그 밖에는 960×540 무대.
 * 작은 가로 화면(높이 < 500)은 게임 대신 "세로로 돌려 주세요" 안내를 띄운다.
 */
export type LayoutMode = 'desktop' | 'mobile';

export const MOBILE_MAX_W = 760;
export const ROTATE_MAX_H = 500;

export interface LayoutInfo { mode: LayoutMode; rotate: boolean }

export function computeLayout(w: number, h: number): LayoutInfo {
  const portrait = h >= w;
  if (w < MOBILE_MAX_W && portrait) return { mode: 'mobile', rotate: false };
  return { mode: 'desktop', rotate: !portrait && h < ROTATE_MAX_H };
}

export class Layout {
  mode: LayoutMode = 'desktop';
  rotate = false;
  private readonly listeners = new Set<(l: Layout) => void>();

  constructor() {
    this.apply();
    window.addEventListener('resize', () => this.apply());
    window.addEventListener('orientationchange', () => this.apply());
  }

  get mobile(): boolean { return this.mode === 'mobile'; }

  onChange(fn: (l: Layout) => void): void { this.listeners.add(fn); }

  private apply(): void {
    const next = computeLayout(window.innerWidth, window.innerHeight);
    const changed = next.mode !== this.mode || next.rotate !== this.rotate;
    this.mode = next.mode;
    this.rotate = next.rotate;
    const html = document.documentElement;
    html.dataset.layout = next.mode;
    html.dataset.rotate = next.rotate ? '1' : '0';
    if (changed) for (const fn of this.listeners) fn(this);
  }
}
