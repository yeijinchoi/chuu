import { Renderer } from '../render/renderer';
import { prefersReducedMotion } from '../render/effects';
import { el, t } from './dom';
import { Layout } from './layout';
import { Sheets } from './sheets';

export const STAGE_W = 960;
export const STAGE_H = 540;
/** 장면 캔버스는 응대 뷰포트와 같은 640×360. 장면(320×180)은 2배로 그린다. */
export const CANVAS_W = 640;
export const CANVAS_H = 360;

/** 정수배 맞춤. 창이 무대보다 작으면 비율 유지 소수 배율. */
/**
 * 무대(960×540)를 창에 맞춰 키운다. 정수 배로만 키우면 1920 미만의 창(1280×800, 1440×900 노트북)에서
 * 1배에 머물러 화면 가운데에 작게 뜨고 글자가 작다. 그래서 창에 꽉 차는 소수 배율을 쓴다(1/20 단위로 내림:
 * 창 크기가 조금 바뀔 때마다 배율이 흔들리지 않게). 정수 배에 아주 가까우면 정수로 붙여 도트를 또렷하게 둔다.
 */
export function computeScale(vw: number, vh: number): number {
  const fit = Math.min(vw / STAGE_W, vh / STAGE_H);
  const whole = Math.round(fit);
  if (whole >= 1 && Math.abs(fit - whole) < 0.04) return whole;
  return Math.max(0.1, Math.floor(fit * 20) / 20);
}

export interface Stage {
  root: HTMLElement;
  stage: HTMLElement;
  /** 응대 프레임 안의 장면 뷰포트. 데스크톱 640×360, 모바일은 폭에 맞춘 16:9. HUD(단계·하트)가 여기에 겹친다. */
  viewport: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 진열 프레임 안쪽 640×92 (모바일: 시트 본문) */
  display: HTMLElement;
  /** 폰 프레임 안쪽 232×470 (모바일: 시트 본문) */
  phone: HTMLElement;
  frames: { serve: HTMLElement; display: HTMLElement; phone: HTMLElement };
  /** 대화창·선택지가 붙는 곳. 데스크톱에서는 뷰포트 위에 겹치고, 모바일에서는 장면 아래로 흐른다. */
  serve: HTMLElement;
  layout: Layout;
  sheets: Sheets;
  /** 모바일 상단 상태 명판 */
  mStatus: HTMLElement;
  /** 모바일 하단 탭 바 */
  tabbar: { root: HTMLElement; serve: HTMLButtonElement; display: HTMLButtonElement; phone: HTMLButtonElement };
}

function grab(): HTMLButtonElement {
  const g = el('button', 'sheet-grab');
  g.type = 'button';
  g.setAttribute('aria-label', t('mobile.closeSheet'));
  g.append(el('span', 'sheet-grab__bar'));
  return g;
}

function tabButton(id: 'serve' | 'display' | 'phone'): HTMLButtonElement {
  const b = el('button', 'm-tab');
  b.type = 'button';
  b.dataset.tab = id;
  b.append(el('span', 'm-tab__label', t(`mobile.tabs.${id}`)), el('span', 'm-tab__dot'));
  return b;
}

/** 세로로 돌려 주세요: 작은 가로 화면에서 게임 대신 보이는 프레임 안내 */
function rotateNotice(): HTMLElement {
  const root = el('div', 'rotate');
  root.setAttribute('role', 'alert');
  const box = el('div', 'rotate__box');
  const icon = el('div', 'rotate__icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.append(el('i', 'rotate__phone'), el('i', 'rotate__arrow'));
  box.append(icon, el('div', 'rotate__title', t('rotate.title')), el('div', 'rotate__sub', t('rotate.sub')));
  root.append(box);
  return root;
}

export function createStage(label: string): Stage {
  const layout = new Layout();
  const root = el('div', 'stage-wrap');
  const stage = el('div', 'stage');
  stage.setAttribute('aria-label', label);

  const mStatus = el('div', 'm-status');
  mStatus.setAttribute('aria-label', t('a11y.status'));

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

  const displayFrame = el('section', 'frame frame--main frame--display');
  displayFrame.setAttribute('aria-label', t('a11y.display'));
  const display = el('div', 'display');
  const displaySign = el('div', 'cartouche cartouche--sheet', t('mobile.displaySign'));
  displayFrame.append(grab(), display, displaySign);

  const phoneFrame = el('section', 'frame frame--main frame--phone');
  phoneFrame.setAttribute('aria-label', t('a11y.phone'));
  const phone = el('div', 'phone');
  const phoneSign = el('div', 'cartouche cartouche--phone', t('phone.signboard'));
  const home = el('div', 'phone__chin');
  phoneFrame.append(grab(), phone, phoneSign, home);

  const tabbar = el('nav', 'm-tabbar');
  tabbar.setAttribute('aria-label', t('a11y.tabbar'));
  const tabs = { serve: tabButton('serve'), display: tabButton('display'), phone: tabButton('phone') };
  tabbar.append(tabs.serve, tabs.display, tabs.phone);
  const backdrop = el('div', 'm-backdrop');

  stage.append(mStatus, serve, displayFrame, phoneFrame, backdrop, tabbar);
  root.append(stage, rotateNotice());

  const sheets = new Sheets({ display: displayFrame, phone: phoneFrame }, backdrop, stage);

  const apply = (): void => {
    if (layout.mobile) { stage.style.transform = ''; return; }
    const s = computeScale(window.innerWidth, window.innerHeight);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  apply();
  window.addEventListener('resize', apply);
  layout.onChange(() => { apply(); sheets.close(); });

  return {
    root, stage, viewport, canvas, ctx, display, phone, serve, layout, sheets, mStatus,
    frames: { serve, display: displayFrame, phone: phoneFrame },
    tabbar: { root: tabbar, ...tabs },
  };
}

/** 장면 렌더러를 stage 캔버스에 붙이고 루프를 시작한다. */
export function mountScene(s: Stage): Renderer {
  const r = new Renderer(prefersReducedMotion());
  r.start(s.ctx);
  return r;
}
