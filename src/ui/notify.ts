import { phoneGlyph, type PhoneGlyph } from './phoneIcons';
import { t } from './dom';

/**
 * 스마트폰 알림 배너. 위에서 내려와 머물다 위로 올라간다.
 * 구성: 앱 아이콘 · 앱 이름과 시각("지금") · 보낸 사람(굵게) · 내용(최대 2줄).
 * 새 알림은 쌓이지 않고 이전 알림을 밀어 올리며 교체된다. 탭하면 onTap, 위로 쓸면 닫힌다.
 */
export type NotifyApp = 'messages' | 'notes' | 'tips';

export interface NotifyOptions {
  app: NotifyApp;
  title: string;
  body: string;
  onTap?: () => void;
  /** 머무는 시간(ms). 기본 4000 */
  stay?: number;
}

const GLYPH: Record<NotifyApp, PhoneGlyph> = { messages: 'messages', notes: 'notes', tips: 'tips' };

export class Notifier {
  private readonly card: HTMLButtonElement;
  private readonly icon: HTMLSpanElement;
  private readonly appName: HTMLSpanElement;
  private readonly time: HTMLSpanElement;
  private readonly title: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private timer = 0;
  private onTap: (() => void) | undefined;
  private startY = 0;

  constructor(container: HTMLElement, private readonly reduced: boolean, extraClass = '') {
    this.card = document.createElement('button');
    this.card.type = 'button';
    this.card.className = `notif ${extraClass}`.trim();
    this.card.hidden = true;
    this.card.setAttribute('role', 'status');
    this.card.setAttribute('aria-live', 'polite');
    this.icon = document.createElement('span');
    this.icon.className = 'notif__icon';
    this.appName = document.createElement('span');
    this.appName.className = 'notif__app';
    this.time = document.createElement('span');
    this.time.className = 'notif__time';
    this.title = document.createElement('span');
    this.title.className = 'notif__title';
    this.text = document.createElement('span');
    this.text.className = 'notif__text';
    const head = document.createElement('span');
    head.className = 'notif__head';
    head.append(this.appName, this.time);
    const body = document.createElement('span');
    body.className = 'notif__body';
    body.append(head, this.title, this.text);
    this.card.append(this.icon, body);
    container.append(this.card);

    this.card.addEventListener('click', () => { const f = this.onTap; this.hide(); f?.(); });
    this.card.addEventListener('pointerdown', (e) => { this.startY = e.clientY; });
    this.card.addEventListener('pointerup', (e) => {
      if (this.startY - e.clientY > 14) { e.preventDefault(); this.hide(); }
    });
  }

  show(o: NotifyOptions): void {
    window.clearTimeout(this.timer);
    this.onTap = o.onTap;
    this.card.dataset.app = o.app;
    this.icon.replaceChildren(phoneGlyph(GLYPH[o.app], 'pico pico--notif'));
    this.appName.textContent = t(`notify.apps.${o.app}`);
    this.time.textContent = t('notify.now');
    this.title.textContent = o.title;
    this.text.textContent = o.body;
    this.card.hidden = false;
    this.card.classList.remove('is-in', 'is-out');
    void this.card.offsetWidth;
    this.card.classList.add(this.reduced ? 'is-shown' : 'is-in');
    this.timer = window.setTimeout(() => this.hide(), o.stay ?? 4000);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    if (this.card.hidden) return;
    this.onTap = undefined;
    if (this.reduced) { this.card.hidden = true; this.card.classList.remove('is-shown'); return; }
    this.card.classList.remove('is-in');
    this.card.classList.add('is-out');
    window.setTimeout(() => { if (this.card.classList.contains('is-out')) { this.card.hidden = true; this.card.classList.remove('is-out'); } }, 240);
  }
}
