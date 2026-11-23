import { Renderer } from '../render/renderer';
import { prefersReducedMotion } from '../render/effects';

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

/** 장면 렌더러를 stage 캔버스에 붙이고 루프를 시작한다. */
export function mountScene(s: Stage): Renderer {
  const r = new Renderer(prefersReducedMotion());
  r.start(s.ctx);
  return r;
}
