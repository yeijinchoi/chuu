import { Renderer } from '../render/renderer';
import { prefersReducedMotion } from '../render/effects';
import { el, t } from './dom';

export const STAGE_W = 960;
export const STAGE_H = 540;
/** 장면 캔버스는 응대 뷰포트와 같은 640×360. 장면(320×180)은 2배로 그린다. */
export const CANVAS_W = 640;
export const CANVAS_H = 360;

/** 정수배 맞춤. 창이 무대보다 작으면 비율 유지 소수 배율. */
export function computeScale(vw: number, vh: number): number {
  const fit = Math.min(vw / STAGE_W, vh / STAGE_H);
  return fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
}

export interface Stage {
  root: HTMLElement;
  stage: HTMLElement;
  /** 응대 프레임 안의 장면 뷰포트 640×360. 대화창·선택지·HUD는 여기에 겹친다. */
  viewport: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 진열 프레임 안쪽 640×92 */
  display: HTMLElement;
  /** 폰 프레임 안쪽 232×492 */
  phone: HTMLElement;
  frames: { serve: HTMLElement; display: HTMLElement; phone: HTMLElement };
}

export function createStage(label: string): Stage {
  const root = el('div', 'stage-wrap');
  const stage = el('div', 'stage');
  stage.setAttribute('aria-label', label);

  const serve = el('section', 'frame frame--main frame--serve');
  serve.setAttribute('aria-label', t('a11y.dialogue'));
  const viewport = el('div', 'viewport');
  const canvas = el('canvas', 'viewport__canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = false;
  viewport.appendChild(canvas);
  const sign = el('div', 'cartouche cartouche--serve', t('frame.signboard'));
  serve.append(viewport, sign);

  const displayFrame = el('section', 'frame frame--display');
  displayFrame.setAttribute('aria-label', t('a11y.display'));
  const display = el('div', 'display');
  displayFrame.appendChild(display);

  const phoneFrame = el('section', 'frame frame--phone');
  phoneFrame.setAttribute('aria-label', t('a11y.phone'));
  const phone = el('div', 'phone');
  const phoneSign = el('div', 'cartouche cartouche--phone', t('phone.signboard'));
  const home = el('div', 'phone__chin');
  phoneFrame.append(phone, phoneSign, home);

  stage.append(serve, displayFrame, phoneFrame);
  root.appendChild(stage);

  const apply = (): void => {
    const s = computeScale(window.innerWidth, window.innerHeight);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  apply();
  window.addEventListener('resize', apply);

  return { root, stage, viewport, canvas, ctx, display, phone, frames: { serve, display: displayFrame, phone: phoneFrame } };
}

/** 장면 렌더러를 stage 캔버스에 붙이고 루프를 시작한다. */
export function mountScene(s: Stage): Renderer {
  const r = new Renderer(prefersReducedMotion());
  r.start(s.ctx);
  return r;
}
