import { el } from './dom';
import { prefersReducedMotion } from '../render/effects';

export type LineKind = 'speech' | 'narration' | 'thought';

const CPS = 40;

/** 대화창: 이름표 + 타자기 출력(초당 40자). 상태: typing → complete(▼ 깜빡임) */
export class Dialogue {
  readonly root = el('div', 'dialogue');
  private plate = el('div', 'dialogue__plate');
  private text = el('div', 'dialogue__text');
  private arrow = el('span', 'dialogue__arrow', '▼');
  private full = '';
  private shown = 0;
  private timer = 0;
  private onDone: (() => void) | null = null;
  /** collapse: 줄이 끝난 뒤 가끔 글자 하나가 ▒로 깨졌다가 돌아온다 (표시만. 저장된 글은 그대로) */
  private glitchTimer = 0;
  private glitchRestore = 0;

  constructor(private readonly instant: boolean) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'log');
    this.root.setAttribute('aria-live', 'polite');
    this.root.append(this.plate, this.text, this.arrow);
  }

  get visible(): boolean { return !this.root.hidden; }
  get typing(): boolean { return this.timer !== 0; }
  /** 줄이 끝까지 나온 뒤 넘기기를 기다리는 중 */
  get waiting(): boolean { return this.onDone !== null; }

  show(speaker: string | null, text: string, kind: LineKind, done: () => void): void {
    this.stop();
    this.clearGlitch();
    this.root.hidden = false;
    this.root.dataset.kind = kind;
    this.root.dataset.state = 'typing';
    this.plate.hidden = speaker === null || kind !== 'speech';
    this.plate.textContent = speaker ?? '';
    this.full = text;
    this.shown = 0;
    this.onDone = done;
    if (this.instant) { this.finish(); return; }
    const start = performance.now();
    this.timer = window.setInterval(() => {
      const n = Math.min(this.full.length, Math.floor(((performance.now() - start) / 1000) * CPS) + 1);
      if (n !== this.shown) { this.shown = n; this.text.textContent = this.full.slice(0, n); }
      if (n >= this.full.length) this.finish();
    }, 16);
  }

  private stop(): void {
    if (this.timer) { window.clearInterval(this.timer); this.timer = 0; }
  }

  private finish(): void {
    this.stop();
    this.shown = this.full.length;
    this.text.textContent = this.full;
    this.root.dataset.state = 'complete';
    this.armGlitch();
  }

  private clearGlitch(): void {
    window.clearTimeout(this.glitchTimer);
    window.clearTimeout(this.glitchRestore);
    this.glitchTimer = 0;
    this.glitchRestore = 0;
  }

  /** collapse에서만, 줄이 다 나온 뒤 2.5~4초마다 한 번 */
  private armGlitch(): void {
    this.clearGlitch();
    if (this.instant || prefersReducedMotion() || document.documentElement.dataset.mood !== 'collapse') return;
    this.glitchTimer = window.setTimeout(() => this.glitch(), 2500 + Math.random() * 1500);
  }

  private glitch(): void {
    this.glitchTimer = 0;
    if (this.root.dataset.state !== 'complete' || document.documentElement.dataset.mood !== 'collapse') return;
    const idx: number[] = [];
    for (let i = 0; i < this.full.length; i++) if (/\S/.test(this.full[i] as string)) idx.push(i);
    if (idx.length === 0) { this.armGlitch(); return; }
    const at = idx[Math.floor(Math.random() * idx.length)] as number;
    this.text.textContent = this.full.slice(0, at) + '▒' + this.full.slice(at + 1);
    this.glitchRestore = window.setTimeout(() => {
      this.glitchRestore = 0;
      this.text.textContent = this.full;
      this.armGlitch();
    }, 120);
  }

  /** Space/Enter/클릭: 타이핑 중이면 전체 표시, 끝났으면 다음으로. 소비했으면 true. */
  advance(): boolean {
    if (!this.onDone) return false;
    if (this.timer) { this.finish(); return true; }
    this.clearGlitch();
    const d = this.onDone;
    this.onDone = null;
    this.root.dataset.state = 'await';
    d();
    return true;
  }

  hide(): void {
    this.stop();
    this.clearGlitch();
    this.onDone = null;
    this.root.hidden = true;
  }
}

export interface ChoiceItem { label: string; disabled?: boolean; reason?: string; pick: () => void; selected?: boolean; keep?: boolean }

/** 선택지 패널: 키 1~4. disabled는 이유를 툴팁으로 보여 준다. */
export class ChoicePanel {
  readonly root = el('div', 'choices');
  private buttons: HTMLButtonElement[] = [];
  private items: ChoiceItem[] = [];

  constructor() {
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
  }

  get active(): boolean { return !this.root.hidden; }

  set(items: ChoiceItem[]): void {
    this.items = items;
    this.root.replaceChildren();
    this.buttons = items.map((it, i) => {
      const b = el('button', 'choice');
      b.type = 'button';
      b.append(el('span', 'choice__key', `[${i + 1}]`), el('span', 'choice__label', it.label));
      if (it.disabled) {
        b.setAttribute('aria-disabled', 'true');
        b.dataset.disabled = '1';
        if (it.reason) b.title = it.reason;
      }
      b.addEventListener('click', () => { if (!it.disabled) it.pick(); });
      this.root.append(b);
      return b;
    });
    this.root.hidden = false;
    // 첫 활성 선택지에 포커스(키보드 사용자)
    const first = this.buttons.find((_, i) => !items[i]?.disabled);
    first?.focus({ preventScroll: true });
  }

  clear(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.buttons = [];
    this.items = [];
  }

  pick(n: number): boolean {
    const it = this.items[n - 1];
    if (!this.active || !it || it.disabled) return false;
    it.pick();
    return true;
  }
}
