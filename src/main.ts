import './ui/styles/fonts.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/ui.css';
import './ui/styles/phone.css';
import './ui/styles/mobile.css';
import strings from './data/strings.ko.json';
import { createStage, mountScene } from './ui/stage';
import { mountDebug } from './ui/debug';
import { startApp } from './ui/app';
import { prefersReducedMotion } from './render/effects';
import { loadCustomerSprites } from './render/sprites';

const FONT_TIMEOUT_MS = 4000;
const FACES = [
  '11px Galmuri11',
  'bold 11px Galmuri11',
  '14px Galmuri14',
  '9px Galmuri9',
  '11px GalmuriMono11',
  '11px GameBody',
  'bold 11px GameBody',
  '14px GameBodyM',
  '16px GameHand',
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 모든 글꼴을 불러온다. 성공이면 true, 실패·시간초과면 false. 진행률 콜백 제공. */
async function loadFonts(onProgress: (done: number, total: number) => void): Promise<boolean> {
  let done = 0;
  const loads = FACES.map((f) =>
    document.fonts
      .load(f, '가')
      .then((r) => {
        if (r.length === 0) throw new Error(`no face: ${f}`);
        onProgress(++done, FACES.length);
      }),
  );
  let timer = 0;
  const timeout = new Promise<never>((_, rej) => {
    timer = window.setTimeout(() => rej(new Error('font timeout')), FONT_TIMEOUT_MS);
  });
  try {
    await Promise.race([Promise.all(loads), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const loading = el('div', 'loading');
  loading.appendChild(el('div', 'loading__text', strings.loading.title));
  const bar = el('div', 'loading__bar');
  bar.setAttribute('role', 'progressbar');
  const fill = el('div', 'loading__fill');
  bar.appendChild(fill);
  loading.appendChild(bar);
  app.appendChild(loading);

  const ok = await loadFonts((d, t) => {
    // 픽셀 막대: 8px 칸 단위로 채운다
    const w = Math.floor((d / t) * 20) * 8;
    fill.style.width = `${w}px`;
  });

  const stage = createStage(strings.stage.label);
  const renderer = mountScene(stage);
  loading.remove();
  app.appendChild(stage.root);
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  if (debug) mountDebug(stage.root, renderer);
  else startApp(stage, renderer, { debug: new URLSearchParams(location.search).get('test') === '1', reduced: prefersReducedMotion() });
  void loadCustomerSprites().then((sp) => renderer.setSprites(sp));

  if (!ok) {
    const notice = el('div', 'notice', strings.loading.fontFail);
    notice.setAttribute('role', 'status');
    app.appendChild(notice);
  }
}

void boot();
