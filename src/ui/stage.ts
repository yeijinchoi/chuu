import { resolve } from '../render/palette';

export const STAGE_W = 640;
export const STAGE_H = 360;
export const CANVAS_W = 320;
export const CANVAS_H = 180;

/** 정수배 맞춤. 창이 무대보다 작으면 비율 유지 소수 배율. */
export function computeScale(vw: number, vh: number): number {
  const fit = Math.min(vw / STAGE_W, vh / STAGE_H);
  return fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
}

export interface Stage {
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function createStage(label: string): Stage {
  const root = document.createElement('div');
  root.className = 'stage-wrap';

  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', label);

  const canvas = document.createElement('canvas');
  canvas.className = 'stage__canvas';
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = false;

  stage.appendChild(canvas);
  root.appendChild(stage);

  const apply = (): void => {
    const s = computeScale(window.innerWidth, window.innerHeight);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  apply();
  window.addEventListener('resize', apply);

  return { root, stage, canvas, ctx };
}

/** M0 임시 장면: 뒷벽 선반과 카운터. 진짜 장면은 M2. */
export function drawPlaceholder(ctx: CanvasRenderingContext2D): void {
  const fill = (key: Parameters<typeof resolve>[0], x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = resolve(key);
    ctx.fillRect(x, y, w, h);
  };
  fill('dusk', 0, 0, CANVAS_W, CANVAS_H);
  // 뒷벽 선반
  for (const x of [24, 124, 224]) {
    fill('stone', x, 40, 72, 3);
    fill('stone', x, 72, 72, 3);
    fill('stone', x, 104, 72, 3);
  }
  // 카운터
  fill('shadow', 0, 132, CANVAS_W, CANVAS_H - 132);
  fill('brass', 0, 132, CANVAS_W, 1);
}
