import { baseKind, isRegistered } from '../core/care';
import type { Game } from '../core/game';
import { renderTemplate, type BlockReason } from '../core/texting';
import type {
  Action, CareTemplateId, ClientCard, ContactDef, CustomerDef, GameData, Product, Shift, TemplateDef,
} from '../core/types';
import type { Mood } from '../render/palette';
import { iconUrl } from './display';
import { button, el, t, won } from './dom';
import { appIconUrl } from './icons';
import { sfx } from './sfx';
import { batteryEl, fillMobileStatus, regularsOf } from './status';

export type PhoneTab = 'chat' | 'book' | 'cards' | 'rules';
const TABS: PhoneTab[] = ['chat', 'book', 'cards', 'rules'];
const ME = 'me'; // 04:44 문자의 발신자 "나"

interface Msg {
  id: number;
  key: string;
  dir: 'in' | 'out' | 'sys';
  from: string;
  text: string;
  status?: 'sending' | 'sent';
}

type ChipStage = 'sending' | 'sent' | 'replied';

export interface PhoneHost {
  game: Game;
  data: GameData;
  /** 코어 액션 전달. 대사가 진행 중이면 무시된다. */
  dispatch(a: Action): void;
  /** 브리지가 이벤트를 흘려보내는 중이다(답장 대기 포함) */
  busy(): boolean;
}

export interface PhoneOpts {
  reduced: boolean;
  /** 모바일 상단 명판 (데스크톱에서는 숨겨진다) */
  mirror: HTMLElement;
  /** 홈 화면 배경(매장 사진)으로 쓸 장면 캔버스 */
  wallSource: HTMLCanvasElement;
  /** 알림 점이 켜지거나 꺼질 때 (모바일 탭 바의 점) */
  onBadge(on: boolean): void;
  /** 04:44 선택이 시작될 때 (장면의 실루엣을 옅게 하는 데 쓴다) */
  onClosing(reply: boolean): void;
}

/** 템플릿 한 줄의 비활성 사유 문장 */
const whyText = (r: BlockReason): string => t(`phone.block.${r}`);

/** 업무폰 화면: 상태바, 매출 줄, 탭 4개와 문자·명부·카드·수칙. 홈 화면에서 앱을 고른다. */
export class Phone {
  tab: PhoneTab = 'book';
  /** 홈 화면(앱 아이콘 두 개)이 떠 있다 */
  home = false;
  /** 열려 있는 대화방: 손님 id(영업 연락처는 contact id) */
  private view: string | null = null;
  private feed: Msg[] = [];
  private nextId = 1;
  private awaiting = new Set<string>();
  private chipStage = new Map<string, ChipStage>();
  private preDelivered = new Set<string>();
  private compose: { mode: 'sales' | 'care'; template: string | null; product: string | null } = { mode: 'sales', template: null, product: null };
  private deferred: { key: string; text: string }[] = [];
  private inflight = 0;
  private lastKey: string | null = null;
  private lastSig = '';
  private lastCount = 0;
  private hit: { delta: number; until: number } | null = null;
  private closing = false;
  private closingPreview: string | null = null;
  private facedown = false;
  private dawnRules = false;
  private cardSel: string | null = null;
  private visible = true;
  private mood: Mood = 'calm';
  private unread = new Set<PhoneTab>();
  private pulseNow = new Set<PhoneTab>();
  private tipText = '';
  private lastBadge = false;
  private readonly root: HTMLElement;
  private readonly status = el('div', 'phone__status');
  private readonly money = el('div', 'phone__money');
  private readonly div = el('div', 'divider');
  private readonly tabs = el('div', 'phone__tabs');
  private readonly body = el('div', 'phone__body');
  private readonly foot = el('div', 'phone__foot');
  private readonly tip = el('div', 'tip tip--phone');

  constructor(root: HTMLElement, private readonly host: PhoneHost, private readonly opts: PhoneOpts) {
    this.root = root;
    root.append(this.status, this.money, this.div, this.tabs, this.tip, this.body, this.foot);
    this.tabs.setAttribute('role', 'tablist');
    this.tip.hidden = true;
    this.tip.setAttribute('role', 'status');
    this.tip.addEventListener('click', () => this.hideTip());
    this.refresh();
  }

  private get s() { return this.host.game.getState(); }
  private get data() { return this.host.data; }
  private ms(n: number): number { return this.opts.reduced ? Math.min(n, 150) : n; }
  private later(fn: () => void, ms: number): void { window.setTimeout(fn, this.ms(ms)); }

  // ---------------------------------------------------------------- 바깥에서 쓰는 것

  setMood(m: Mood): void { this.mood = m; this.refresh(); }
  unlockDawnRules(): void { this.dawnRules = true; this.pulse('rules'); }
  get hasUnread(): boolean { return this.unread.size > 0; }
  /** 폰 화면이 실제로 보이는지(모바일 시트가 열려 있는지). 보이는 탭의 알림은 바로 꺼진다. */
  setVisible(v: boolean): void {
    this.visible = v;
    if (v) { this.unread.delete(this.tab); this.refresh(); }
  }

  /** 입력이 잠겨 있다: 전송 애니메이션 중이거나 브리지가 답장을 기다린다 */
  get locked(): boolean { return this.inflight > 0 || this.host.busy(); }

  openTab(tab: PhoneTab, focus = false): void {
    this.tab = tab;
    this.home = false;
    this.view = null;
    this.unread.delete(tab);
    this.refresh();
    if (focus) this.tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  /** 홈 화면으로 */
  openHome(): void { this.home = true; this.view = null; this.refresh(); }

  pulse(tab: PhoneTab): void {
    if (this.tab !== tab || !this.visible || this.home) this.unread.add(tab);
    this.pulseNow.add(tab);
    this.refresh();
  }

  showTip(text: string): void { this.tipText = text; this.refresh(); }
  hideTip(): void { this.tipText = ''; this.refresh(); }

  /** 04:44: 폰이 강제로 열리고 "나"와의 대화방이 뜬다 */
  setClosing(on: boolean): void {
    this.closing = on;
    this.closingPreview = null;
    this.facedown = false;
    if (on) { this.tab = 'chat'; this.home = false; this.view = ME; this.unread.delete('chat'); }
    this.refresh();
  }

  /** 04:44 선택. 답장: 미리보기를 쓰고 보낸다 / 엎어 둔다: 화면이 꺼진 채 계속 진동한다 */
  closingChoice(reply: boolean): void {
    if (!this.closing || this.locked || this.closingPreview !== null) return;
    this.opts.onClosing(reply);
    const send = (): void => {
      this.deferred = [];
      if (reply) {
        this.beginSend(ME, t('closingText.replyPreview'), {});
      } else {
        this.facedown = true;
        this.feed.push({ id: this.nextId++, key: ME, dir: 'sys', from: '', text: t('closingText.facedown') });
        this.refresh();
      }
      this.host.dispatch({ type: 'closingText', reply });
    };
    if (reply) {
      this.closingPreview = t('closingText.replyPreview');
      this.refresh();
      this.later(send, 550);
    } else send();
  }

  /** 04:44 선택지 [1] [2] 키보드 */
  closingKey(n: number): boolean {
    if (!this.closing || (n !== 1 && n !== 2)) return false;
    this.closingChoice(n === 1);
    return true;
  }

  /** 안 보이는 대화방에 놓이는 시스템 줄(속마음, 지문): 이름표 없는 말 */
  addNote(text: string): void {
    this.feed.push({ id: this.nextId++, key: this.view ?? this.lastKey ?? ME, dir: 'sys', from: '', text });
    this.refresh();
  }

  /** 관계 변화 같은 결과 줄은 큐가 빌 때 한꺼번에 놓는다 */
  deferNote(key: string, text: string): void { this.deferred.push({ key, text }); }
  flushNotes(): void {
    if (this.deferred.length === 0) return;
    for (const d of this.deferred.splice(0)) this.feed.push({ id: this.nextId++, key: d.key, dir: 'sys', from: '', text: d.text });
    this.refresh();
  }

  /** 평정심이 깎였다: 배터리가 깜빡이고 변화량이 뜬다 */
  hitBattery(delta: number): void {
    if (delta === 0) return;
    this.hit = { delta, until: performance.now() + 1500 };
    this.refresh();
    window.setTimeout(() => { if (this.hit && performance.now() >= this.hit.until) { this.hit = null; this.refresh(); } }, 1550);
  }

  /** 문자 발신자 이름(연락처 이름, 손님 이름, "나")으로 대화방 키를 찾는다 */
  keyOfName(name: string): string {
    if (name === t('closingText.from')) return ME;
    const c = this.data.contacts.find((x) => x.name === name);
    if (c) return c.customerId ?? c.id;
    return this.data.customers.find((x) => x.name === name)?.id ?? name;
  }

  /** 들어온 문자. delay(ms) 뒤에 말풍선이 붙고 done이 불린다. */
  deliver(from: string, text: string, delay: number, done: () => void): void {
    const key = this.keyOfName(from);
    if (this.preDelivered.delete(key)) { this.later(done, 350); return; } // 보내기 전에 이미 와 있던 답장
    this.awaiting.add(key);
    this.refresh();
    this.later(() => {
      this.awaiting.delete(key);
      this.feed.push({ id: this.nextId++, key, dir: 'in', from, text });
      const seeing = this.visible && !this.home && this.view === key;
      if (!seeing) this.unread.add('chat');
      if (this.chipStage.has(key)) {
        this.chipStage.set(key, 'replied');
        this.later(() => { if (this.chipStage.get(key) === 'replied') { this.chipStage.delete(key); this.refresh(); } }, 1300);
      }
      sfx.play('msg_recv');
      if (this.facedown) this.vibrate();
      this.refresh();
      done();
    }, delay);
  }

  /** 도착 진동 (phone_buzz) */
  buzz(): void { if (!this.opts.reduced) this.vibrate(); }

  /** 검은 아이콘이 열린다: 새벽에 「검은 수첩」으로 들어간다 */
  openApp(): void {
    this.openTab('book');
    if (this.opts.reduced) return;
    this.root.classList.remove('phone--opening');
    void this.root.offsetWidth;
    this.root.classList.add('phone--opening');
  }

  private vibrate(): void {
    this.root.classList.remove('phone--buzz');
    void this.root.offsetWidth;
    this.root.classList.add('phone--buzz');
  }

  /** 폰 전체 다시 그리기 (상태가 바뀔 때마다) */
  refresh(): void {
    const top = this.body.scrollTop;
    const stick = this.body.scrollHeight - this.body.clientHeight - top < 40;
    this.root.classList.toggle('phone--home', this.home);
    this.root.classList.toggle('phone--facedown', this.facedown);
    this.root.classList.toggle('phone--closing', this.closing);
    this.renderStatus();
    this.renderTabs();
    this.renderBody();
    this.renderFoot();
    this.renderTip();
    const sig = `${this.home}|${this.tab}|${this.view}`;
    const n = this.feed.length + (this.awaiting.size ? 1 : 0);
    if (sig !== this.lastSig) this.body.scrollTop = 0; // 화면이 바뀌면 맨 위부터
    else if (this.view !== null && stick && n !== this.lastCount) {
      // 새 말풍선이 보이도록: 대화 끝이 화면 아래쪽 60% 지점에 오게 하고, 작성칸은 그 아래에 둔다
      const chat = this.body.querySelector<HTMLElement>('.chat');
      const end = chat ? chat.offsetTop + chat.offsetHeight : this.body.scrollHeight;
      this.body.scrollTop = Math.max(0, end - this.body.clientHeight * 0.6);
    }
    else this.body.scrollTop = top;
    this.lastSig = sig;
    this.lastCount = n;
    const badge = this.unread.size > 0;
    if (badge !== this.lastBadge) { this.lastBadge = badge; this.opts.onBadge(badge); }
  }

  // ---------------------------------------------------------------- 상태줄

  private renderStatus(): void {
    const s = this.s;
    const hit = this.hit && performance.now() < this.hit.until ? this.hit.delta : 0;
    this.status.replaceChildren();
    const homeBtn = button('phone__home', '', () => { sfx.play('sheet_open'); this.home ? this.openTab(this.tab) : this.openHome(); });
    homeBtn.setAttribute('aria-label', t(this.home ? 'phone.leaveHome' : 'phone.goHome'));
    homeBtn.append(el('i', 'phone__home-glyph'));
    this.status.append(
      el('span', 'phone__day', `${t('hud.day')} ${s.day}`),
      el('span', 'phone__clock num', s.clock),
      batteryEl(s.composure, hit),
      homeBtn,
    );
    this.money.replaceChildren(el('span', 'num', `₩ ${s.revenue.toLocaleString('en-US')}`), el('span', 'phone__sub', `${t('phone.regularsCount')} ${regularsOf(s)}`));
    if (s.dawnLedger.length > 0) this.money.append(el('span', 'phone__sub', `${t('phone.ledgerCount')} ${s.dawnLedger.length}`));
    fillMobileStatus(this.opts.mirror, s, hit);
  }

  private renderTabs(): void {
    this.tabs.replaceChildren();
    this.tabs.hidden = this.home;
    for (const id of TABS) {
      const b = button('tab', t(`phone.tabs.${id}`), () => this.openTab(id));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === this.tab && !this.home));
      if (this.unread.has(id) && id !== this.tab) b.dataset.dot = '1';
      if (this.unread.has(id) && id === this.tab && !this.visible) b.dataset.dot = '1';
      if (this.pulseNow.has(id)) b.dataset.pulse = '1';
      this.tabs.append(b);
    }
    this.pulseNow.clear();
    this.div.hidden = this.home;
  }

  private renderTip(): void {
    this.tip.hidden = this.tipText === '';
    this.tip.textContent = this.tipText;
  }

  private renderBody(): void {
    this.body.replaceChildren();
    this.body.dataset.tab = this.home ? 'home' : this.tab;
    this.body.dataset.view = this.view !== null ? 'thread' : 'list';
    if (this.home) { this.homeScreen(); return; }
    if (this.view !== null) { this.thread(this.view); return; }
    ({ chat: () => this.chatList(), book: () => this.book(), cards: () => this.cards(), rules: () => this.rules() })[this.tab]();
  }

  private renderFoot(): void {
    this.foot.replaceChildren();
    const p = this.s.phase;
    const lock = this.locked;
    const done = (label: string, a: Action): HTMLButtonElement => {
      const b = button('phone-btn phone-btn--primary', label, () => { if (!this.locked) this.host.dispatch(a); });
      if (lock) { b.setAttribute('aria-disabled', 'true'); b.title = t('phone.waitReply'); }
      return b;
    };
    if (p.kind === 'texting') {
      this.foot.append(this.counter(), done(t('phone.finishTexting'), { type: 'finishTexting' }));
    } else if (p.kind === 'aftercare') {
      const d = this.data.days[this.s.day] ?? this.data.days[1];
      this.foot.append(
        el('div', 'phone__counter', t('phone.aftercareLeft', { left: this.s.aftercareRemaining, total: d?.aftercare.perShift ?? 0 })),
        done(t('phone.finishAftercare'), { type: 'finishAftercare' }),
      );
    } else if (p.kind === 'closingText' && this.closing) {
      const row = el('div', 'phone__choices');
      [t('choices.closingReply.reply'), t('choices.closingReply.ignore')].forEach((label, i) => {
        const b = el('button', 'phone-btn phone-btn--choice');
        b.type = 'button';
        b.append(el('span', 'btn__key', `[${i + 1}]`), el('span', '', label));
        b.addEventListener('click', () => this.closingChoice(i === 0));
        if (lock || this.closingPreview !== null) b.setAttribute('aria-disabled', 'true');
        row.append(b);
      });
      this.foot.append(row);
    }
  }

  private counter(): HTMLElement {
    const s = this.s;
    const d = this.data.days[s.day] ?? this.data.days[1];
    return el('div', 'phone__counter', t(s.shift === 'dawn' ? 'phone.textsLeftDawn' : 'phone.textsLeft', {
      left: s.texting[s.shift].remaining, total: d?.texting[s.shift].total ?? 0, sales: d?.texting[s.shift].sales ?? 0,
    }));
  }

  // ---------------------------------------------------------------- 홈 화면

  private homeScreen(): void {
    const dawn = this.s.shift === 'dawn';
    const wall = el('canvas', 'phone__wall');
    wall.width = 116;
    wall.height = 65;
    wall.setAttribute('aria-hidden', 'true');
    const g = wall.getContext('2d');
    if (g) { g.imageSmoothingEnabled = false; g.drawImage(this.opts.wallSource, 0, 0, wall.width, wall.height); }
    const clock = el('div', 'phone__home-clock');
    clock.append(el('span', 'num', this.s.clock), el('span', 'phone__sub', `${t('hud.day')} ${this.s.day}`));
    const grid = el('div', 'apps');
    grid.append(
      this.appIcon('book', t('phone.apps.book'), !dawn, () => this.openTab('book')),
      this.appIcon('black', '', dawn, () => this.openTab('book'), t('phone.apps.black')),
    );
    this.body.append(wall, clock, grid);
  }

  /** active가 아니면 눌러도 아이콘이 0.2초 흔들릴 뿐이다 (S01: 휴게 시간 전까지 검은 아이콘은 잠김) */
  private appIcon(kind: 'book' | 'black', label: string, active: boolean, open: () => void, aria?: string): HTMLElement {
    const b = el('button', 'app');
    b.type = 'button';
    b.dataset.app = kind;
    b.setAttribute('aria-label', aria ?? label);
    if (!active) b.setAttribute('aria-disabled', 'true');
    const img = el('img', 'app__icon');
    img.src = appIconUrl(kind, this.mood);
    img.alt = '';
    b.append(img, el('span', 'app__label', label));
    b.addEventListener('click', () => {
      if (active) { open(); return; }
      sfx.play('icon_shake');
      if (this.opts.reduced) return;
      img.classList.remove('is-shake');
      void img.offsetWidth;
      img.classList.add('is-shake');
    });
    return b;
  }

  // ---------------------------------------------------------------- 문자: 대화방 목록과 대화방

  private titleOf(key: string): string {
    if (key === ME) return t('closingText.from');
    const c = this.data.contacts.find((x) => (x.customerId ?? x.id) === key);
    if (c) return c.name;
    return this.data.customers.find((x) => x.id === key)?.name ?? key;
  }

  private chatList(): void {
    const keys: string[] = [];
    for (const m of [...this.feed].reverse()) if (m.dir !== 'sys' && !keys.includes(m.key)) keys.push(m.key);
    if (keys.length === 0) { this.body.append(el('div', 'empty', t('phone.noChat'))); return; }
    const list = el('div', 'threads');
    for (const key of keys) {
      const last = [...this.feed].reverse().find((m) => m.key === key && m.dir !== 'sys') as Msg;
      const row = button('thread-row', '', () => this.openThread(key));
      row.append(el('span', 'thread-row__name', this.titleOf(key)), el('span', 'thread-row__last', `${last.dir === 'out' ? '↗ ' : ''}${last.text}`));
      if (this.s.pendingReplies[key]) row.append(el('span', 'chip-state chip-state--sent', t('phone.replyWaiting')));
      list.append(row);
    }
    this.body.append(list);
  }

  openThread(key: string, template: string | null = null): void {
    this.view = key;
    this.home = false;
    this.tipText = '';
    this.compose = { mode: this.defaultMode(key), template, product: null };
    if (template) this.compose.template = template;
    this.unread.delete(this.tab);
    this.refresh();
  }

  private contactOf(key: string): ContactDef | undefined {
    return this.data.contacts.find((c) => (c.customerId ?? c.id) === key && c.book === this.s.shift);
  }

  private defaultMode(key: string): 'sales' | 'care' {
    const p = this.s.phase;
    const contact = this.contactOf(key);
    if (p.kind === 'texting' && contact && !(contact.id in this.s.texting[this.s.shift].sent)) return 'sales';
    if (this.careTarget(key)) return 'care';
    return 'sales';
  }

  /** 관리 문자를 보낼 수 있는 손님(카드가 있고 이 교대 소속) */
  private careTarget(key: string): CustomerDef | undefined {
    const c = this.data.customers.find((x) => x.id === key && x.shift === this.s.shift);
    const card = c ? this.s.cards[c.id] : undefined;
    return c && card ? c : undefined;
  }

  private thread(key: string): void {
    const s = this.s;
    const contact = this.data.contacts.find((c) => (c.customerId ?? c.id) === key);
    const head = el('div', 'thread__head');
    const back = button('thread__back', '', () => { this.view = null; this.refresh(); });
    back.setAttribute('aria-label', t('phone.back'));
    back.append(el('span', '', `‹ ${t('phone.back')}`));
    head.append(back, el('span', 'thread__name', this.titleOf(key)));
    const chip = contact ? this.chipFor(contact) : '';
    if (chip) head.append(el('span', `chip-state chip-state--${chip}`, t(`phone.chip.${chip}`)));
    this.body.append(head);

    const log = el('div', 'chat');
    if (key === ME && this.s.shift === 'dawn') log.dataset.me = '1';
    const msgs = this.feed.filter((m) => m.key === key);
    // (빈칸): 답장이 보내기 전에 이미 와 있다 (S08)
    const pre = contact && contact.composureOnSend && contact.replies.any && !(contact.id in s.texting[s.shift].sent);
    if (pre) {
      const row = el('div', 'bubble-row bubble-row--in');
      row.append(el('div', 'bubble__from', contact.name), el('div', 'bubble bubble--in bubble--wrong', contact.replies.any));
      log.append(row);
    }
    if (msgs.length === 0 && !pre && key !== ME) log.append(el('div', 'empty', t('phone.noChat')));
    msgs.forEach((m) => {
      if (m.dir === 'sys') { log.append(el('div', 'sys', m.text)); return; }
      const row = el('div', `bubble-row bubble-row--${m.dir}`);
      if (m.dir === 'in') row.append(el('div', 'bubble__from', m.from));
      row.append(el('div', `bubble bubble--${m.dir}`, m.text));
      if (m.dir === 'out') row.append(el('div', `bubble__status${m.status === 'sending' ? ' is-sending' : ''}`, t(m.status === 'sending' ? 'phone.sendWait' : 'phone.chip.sent')));
      log.append(row);
    });
    if (this.awaiting.has(key)) log.append(el('div', 'typing', '…'));
    // 답장 선택지 2개: 마지막 받은 말풍선 아래
    if (s.pendingReplies[key] && !this.awaiting.has(key)) {
      const chat = this.data.customers.find((x) => x.id === key)?.care.chat;
      if (chat) {
        const box = el('div', 'reply');
        box.setAttribute('role', 'group');
        chat.options.forEach((label, i) => {
          const b = button('reply__opt', label, () => this.chooseReply(key, i === 0 ? 0 : 1, label));
          if (this.locked) b.setAttribute('aria-disabled', 'true');
          box.append(b);
        });
        log.append(box);
      }
    }
    this.body.append(log);

    if (this.closing && key === ME) this.body.append(this.closingInput());
    else this.body.append(this.composer(key));
  }

  private chooseReply(key: string, option: 0 | 1, label: string): void {
    if (this.locked) return;
    this.lastKey = key;
    this.feed.push({ id: this.nextId++, key, dir: 'out', from: '', text: label, status: 'sent' });
    sfx.play('msg_send');
    this.host.dispatch({ type: 'chooseReply', customerId: key, option });
  }


  private closingInput(): HTMLElement {
    const box = el('div', 'closing-input');
    const field = el('div', 'closing-input__field');
    if (this.closingPreview !== null) field.append(el('span', '', this.closingPreview));
    field.append(el('i', 'caret'));
    box.append(el('div', 'closing-input__label', t('phone.replyField')), field);
    return box;
  }

  // ---------------------------------------------------------------- 작성 화면 (영업 · 관리)

  private composer(key: string): HTMLElement {
    const s = this.s;
    const box = el('div', 'compose');
    const p = s.phase;
    const contact = this.contactOf(key);
    const care = this.careTarget(key);
    const texting = p.kind === 'texting';
    const canSales = texting && !!contact;
    const canCare = (texting || p.kind === 'aftercare') && !!care;
    if (!canSales && !canCare) {
      box.append(el('div', 'hint', t(p.kind === 'texting' || p.kind === 'aftercare' ? 'phone.composeNone' : 'phone.composeClosed')));
      return box;
    }
    let mode = this.compose.mode;
    if (mode === 'sales' && !canSales) mode = 'care';
    if (mode === 'care' && !canCare) mode = 'sales';
    this.compose.mode = mode;

    if (canSales && canCare) {
      const seg = el('div', 'seg');
      for (const m of ['sales', 'care'] as const) {
        const b = button('seg__btn', t(`phone.mode.${m}`), () => { this.compose = { mode: m, template: null, product: null }; this.refresh(); });
        b.setAttribute('aria-pressed', String(m === mode));
        seg.append(b);
      }
      box.append(seg);
    }
    box.append(el('div', 'compose__h', t(mode === 'sales' ? 'phone.composeSales' : 'phone.composeCare')));

    const shift: Shift = s.shift;
    const templates: TemplateDef[] = mode === 'sales'
      ? this.data.templates.sales.filter((x) => x.shift === shift)
      : this.data.templates.care.filter((x) => x.shift === shift);
    const probeProduct = this.productsOf(shift)[0]?.id;
    const group = el('div', 'radios');
    group.setAttribute('role', 'radiogroup');
    const reasons = new Map<string, BlockReason | null>(templates.map((tpl) => [tpl.id, mode === 'sales'
      ? this.host.game.blockReason({ type: 'sendText', contactId: (contact as ContactDef).id, template: tpl.id as never })
      : this.host.game.blockReason({ type: 'sendCare', customerId: key, template: tpl.id as CareTemplateId, productId: probeProduct })]));
    if (this.compose.template && reasons.get(this.compose.template) !== null) this.compose.template = null;
    for (const tpl of templates) {
      const reason = reasons.get(tpl.id) ?? null;
      const r = el('button', 'radio');
      r.type = 'button';
      r.setAttribute('role', 'radio');
      r.setAttribute('aria-checked', String(this.compose.template === tpl.id));
      r.append(el('span', 'radio__name', tpl.name));
      if (reason) {
        r.disabled = true;
        r.append(el('span', 'radio__why', whyText(reason)));
      } else r.addEventListener('click', () => { this.compose.template = tpl.id; this.refresh(); });
      group.append(r);
    }
    box.append(group);
    if (this.compose.template && !templates.some((x) => x.id === this.compose.template)) this.compose.template = null;

    const picked = templates.find((x) => x.id === this.compose.template);
    const needsProduct = mode === 'care' && !!picked && baseKind(picked.id as CareTemplateId) === 'recommend';
    if (needsProduct) box.append(this.picker(shift));
    if (!picked) {
      box.append(el('div', 'hint', t('phone.pickTemplate')));
    } else {
      const text = this.previewText(picked, key, contact, care);
      box.append(el('div', 'compose__label', t('phone.preview')), el('div', 'bubble bubble--out bubble--small bubble--preview', text));
      const ready = !needsProduct || this.compose.product !== null;
      const send = button('phone-btn phone-btn--primary phone-btn--send', t('phone.sendLabel'), () => this.send(key, mode, picked, text));
      if (!ready || this.locked) send.setAttribute('aria-disabled', 'true');
      if (!ready) send.title = t('phone.pickProduct');
      box.append(send);
      if (!ready) box.append(el('div', 'hint', t('phone.pickProduct')));
    }
    return box;
  }

  private productsOf(shift: Shift): Product[] {
    return this.data.products.filter((p) => p.shift === shift && p.id !== 'empty_box');
  }

  /** 맞춤 추천: 상품 고르기 (타일 격자, 선택한 이름은 아래 한 줄) */
  private picker(shift: Shift): HTMLElement {
    const wrap = el('div', 'picker');
    const grid = el('div', 'picker__grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', t('phone.pickProduct'));
    for (const p of this.productsOf(shift)) {
      const b = el('button', 'tile');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(this.compose.product === p.id));
      b.setAttribute('aria-label', p.name);
      b.title = p.name;
      const img = el('img', 'tile__icon');
      img.src = iconUrl(p.id, this.mood);
      img.alt = '';
      b.append(img);
      b.addEventListener('click', () => { this.compose.product = p.id; this.refresh(); });
      grid.append(b);
    }
    const chosen = this.compose.product ? this.data.products.find((p) => p.id === this.compose.product) : undefined;
    wrap.append(grid, el('div', chosen ? 'picker__name' : 'picker__name picker__name--none', chosen ? `${chosen.name} · ${shift === 'dawn' ? t('display.conversion') + ' ' : ''}${won(chosen.price)}` : t('phone.pickProduct')));
    return wrap;
  }

  private previewText(tpl: TemplateDef, key: string, contact: ContactDef | undefined, care: CustomerDef | undefined): string {
    const s = this.s;
    const card = s.cards[key] as ClientCard | undefined;
    const last = card?.purchases[card.purchases.length - 1];
    const productId = baseKind(tpl.id as CareTemplateId) === 'thanks' ? last?.productId : this.compose.product;
    const product = this.data.products.find((x) => x.id === productId);
    return renderTemplate(tpl.text, {
      name: s.playerName,
      contact: contact?.name,
      customer: care?.name ?? contact?.name,
      product: product?.name ?? t('phone.productSlot'),
      event: card?.occasion?.label ?? t('phone.eventSlot'),
    });
  }

  private send(key: string, mode: 'sales' | 'care', tpl: TemplateDef, text: string): void {
    if (this.locked) return;
    const contact = this.contactOf(key);
    let action: Action;
    if (mode === 'sales' && contact) action = { type: 'sendText', contactId: contact.id, template: tpl.id as never };
    else action = { type: 'sendCare', customerId: key, template: tpl.id as CareTemplateId, productId: this.compose.product ?? undefined };
    if (this.host.game.blockReason(action) !== null) return;
    this.deferred = [];
    this.beginSend(key, text, { pre: mode === 'sales' && contact?.composureOnSend ? contact.replies.any : undefined, from: this.titleOf(key) });
    this.compose = { mode: this.compose.mode, template: null, product: null };
    this.host.dispatch(action);
    this.endSend(key);
  }

  /** 보낸 말풍선(rose) → "전송 중…" 0.6초 → "보냄". 답장은 코어 이벤트가 오면 deliver가 붙인다. */
  private beginSend(key: string, text: string, o: { pre?: string; from?: string }): void {
    this.lastKey = key;
    if (o.pre) {
      this.feed.push({ id: this.nextId++, key, dir: 'in', from: o.from ?? '', text: o.pre });
      this.preDelivered.add(key);
    }
    const m: Msg = { id: this.nextId++, key, dir: 'out', from: '', text, status: 'sending' };
    this.feed.push(m);
    this.chipStage.set(key, 'sending');
    this.inflight++;
    sfx.play('msg_send');
    this.later(() => {
      m.status = 'sent';
      if (this.chipStage.get(key) === 'sending') this.chipStage.set(key, 'sent');
      this.inflight--;
      this.refresh();
    }, 600);
    this.refresh();
  }

  private endSend(key: string): void {
    if (this.awaiting.has(key) || this.preDelivered.has(key)) return;
    // 답장이 없는 문자: 칩이 보냄을 거쳐 최종 상태로 돌아간다
    this.later(() => { if (!this.awaiting.has(key)) { this.chipStage.delete(key); this.refresh(); } }, 1000);
  }

  // ---------------------------------------------------------------- 명부 / 애프터케어

  private book(): void {
    const s = this.s;
    const p = s.phase;
    const dawn = s.shift === 'dawn';
    this.body.append(el('div', 'phone__h', t(dawn ? 'phone.bookDawn' : 'phone.bookAfternoon')));
    if (dawn) this.body.append(el('div', 'note-page', t('briefing.dawn.notebook')));
    if (p.kind === 'aftercare') { this.served(); return; }
    const list = el('div', 'contacts');
    if (p.kind === 'texting') list.append(el('div', 'hint', t('phone.pickContact')));
    for (const c of this.data.contacts.filter((x) => x.book === s.shift)) {
      const key = c.customerId ?? c.id;
      const row = el('div', 'contact');
      const head = button('contact__head', '', () => this.openThread(key));
      head.append(el('span', 'contact__name', c.name));
      const chip = this.chipFor(c);
      if (chip) head.append(el('span', `chip-state chip-state--${chip}`, t(`phone.chip.${chip}`)));
      row.append(head);
      if (c.address) row.append(el('div', 'contact__addr', c.address));
      row.append(el('div', 'contact__memo', c.memo));
      if (c.memoStruck) row.append(el('div', 'contact__memo contact__memo--struck', c.memoStruck));
      list.append(row);
    }
    this.body.append(list);
    this.careList(list);
  }

  /** 단골 관리: 카드가 있고 단골로 등록된 손님에게 관리 문자 */
  private careList(into: HTMLElement, skip: Set<string> = new Set()): void {
    const s = this.s;
    const regs = this.data.customers.filter((c) => c.shift === s.shift && !skip.has(c.id) && isRegistered(s.cards[c.id]));
    if (regs.length === 0) return;
    into.append(el('div', 'phone__h phone__h--sub', t('phone.careList')));
    for (const c of regs) {
      const row = el('div', 'contact');
      const head = button('contact__head', '', () => this.openThread(c.id));
      head.append(el('span', 'contact__name', c.name), el('span', 'chip-state chip-state--sent', t(`tier.${(s.cards[c.id] as ClientCard).tier}`)));
      row.append(head);
      if (c.care.memo && s.shift === 'dawn') row.append(el('div', 'contact__memo', c.care.memo));
      into.append(row);
    }
  }

  private chipFor(c: ContactDef): 'sending' | 'sent' | 'replied' | 'coming' | 'no' | '' {
    const key = c.customerId ?? c.id;
    const stage = this.chipStage.get(key);
    if (stage) return stage;
    const sent = this.s.texting[this.s.shift].sent;
    if (!(c.id in sent)) return '';
    return c.customerId && this.s.visitors[c.customerId] ? 'coming' : 'no';
  }

  private served(): void {
    const s = this.s;
    const wrap = el('div', 'contacts');
    wrap.append(el('div', 'phone__h phone__h--sub', t('phone.served')));
    const acts = this.host.game.availableActions();
    const people = this.data.customers.filter((c) => c.shift === s.shift && s.cards[c.id]?.lastVisitDay === s.day);
    if (people.length === 0) wrap.append(el('div', 'empty', t('phone.noServed')));
    for (const c of people) {
      const card = s.cards[c.id] as ClientCard;
      const sold = card.purchases.some((x) => x.day === s.day);
      const row = el('div', 'contact');
      const head = el('div', 'contact__head contact__head--static');
      head.append(el('span', 'contact__name', c.name), el('span', `chip-state chip-state--${sold ? 'coming' : 'no'}`, t(sold ? 'phone.soldMark' : 'phone.failMark')));
      row.append(head);
      if (c.care.memo && s.shift === 'dawn') row.append(el('div', 'contact__memo', c.care.memo));
      const thanksId: CareTemplateId = s.shift === 'dawn' ? 'dawn_thanks' : 'thanks';
      if (card.lastThanksDay === s.day) row.append(el('div', 'hint', t('phone.thanksDone')));
      else if (card.purchases.length > 0 && !c.care.unreachable) {
        row.append(button('phone-btn phone-btn--small', t('phone.thanks'), () => this.openThread(c.id, thanksId)));
      }
      if (c.care.redBoxCare && acts.some((a) => a.type === 'placeRedBox')) {
        const b = button('phone-btn phone-btn--small', t('phone.placeRedBox'), () => {
          if (this.locked) return;
          this.lastKey = c.id;
          this.host.dispatch({ type: 'placeRedBox' });
        });
        row.append(b);
      }
      wrap.append(row);
    }
    this.body.append(wrap);
    const rest = el('div', 'contacts');
    this.careList(rest, new Set(people.map((c) => c.id)));
    if (rest.childElementCount) this.body.append(rest);
  }

  // ---------------------------------------------------------------- 고객 카드

  private cards(): void {
    const s = this.s;
    const list = Object.values(s.cards).sort((a, b) => (b.lastVisitDay ?? 0) - (a.lastVisitDay ?? 0));
    const wrap = el('div', 'cards');
    wrap.append(el('div', 'phone__h', t('phone.cardTitle')));
    if (list.length === 0) wrap.append(el('div', 'empty', t('phone.cardEmpty')));
    else {
      const sel = list.find((c) => c.customerId === this.cardSel) ?? list[0] as ClientCard;
      if (list.length > 1) {
        const pick = el('div', 'card-pick');
        pick.setAttribute('role', 'tablist');
        for (const c of list) {
          const def = this.data.customers.find((x) => x.id === c.customerId) as CustomerDef;
          const b = button('card-pick__btn', def.name, () => { this.cardSel = c.customerId; this.refresh(); });
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-selected', String(c === sel));
          pick.append(b);
        }
        wrap.append(pick);
      }
      wrap.append(this.cardSheet(sel));
    }
    wrap.append(this.schedule());
    this.body.append(wrap);
  }

  private cardSheet(card: ClientCard): HTMLElement {
    const c = this.data.customers.find((x) => x.id === card.customerId) as CustomerDef;
    const box = el('div', 'card-sheet');
    box.dataset.tier = card.tier;
    const head = el('div', 'card-sheet__head');
    head.append(el('span', 'card-sheet__name', c.name), el('span', 'card-sheet__tier', t(`phone.cardBook.${card.book}`)));
    box.append(head);
    const dept = card.category ? t(`categories.${card.category}`) : undefined;
    const rows: [string, string | undefined][] = [
      ['category', dept && card.wants ? `${dept} · ${card.wants}` : card.wants ?? dept],
      ['color', card.color ? t(`display.colors.${card.color}`) : undefined],
      ['budget', card.budget !== undefined ? won(card.budget) : undefined],
      ['drink', card.drink ? t(`drinks.${card.drink}`) : undefined],
      ['occasion', card.occasion ? `${card.occasion.label} (${t('phone.dayN', { n: card.occasion.day })})` : undefined],
      ['notes', card.notes.length ? card.notes.join(' · ') : undefined],
      ['purchases', card.purchases.length ? card.purchases.map((x) => `${this.data.products.find((p) => p.id === x.productId)?.name ?? x.productId} (${t('phone.dayN', { n: x.day })})`).join(', ') : undefined],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'kv');
      r.append(el('span', 'kv__k', t(`phone.cardFields.${k}`)), el('span', v === undefined ? 'kv__v kv__v--unknown' : 'kv__v', v ?? t('unknown')));
      box.append(r);
    }
    // 관계 단계: 하트 칸 + 라벨
    const hearts = { new: 0, regular: 2, vip: 3, lifetime: 4, lost: 0 }[card.tier];
    const rel = el('div', 'kv');
    const heartBox = el('span', 'kv__v rel');
    heartBox.append(el('span', 'rel__hearts', '♥'.repeat(hearts) + '♡'.repeat(4 - hearts)), el('span', 'rel__tier', t(`tier.${card.tier}`)));
    heartBox.setAttribute('aria-label', `${t('phone.cardFields.relation')} ${t(`tier.${card.tier}`)}`);
    rel.append(el('span', 'kv__k', t('phone.cardFields.relation')), heartBox);
    box.append(rel);
    const last = el('div', 'kv');
    last.append(el('span', 'kv__k', t('phone.cardFields.lastContact')), el('span', card.lastContactDay === null ? 'kv__v kv__v--unknown' : 'kv__v', card.lastContactDay === null ? t('unknown') : t('phone.dayN', { n: card.lastContactDay })));
    box.append(last);
    return box;
  }

  /** 오늘 방문 일정: 문자를 보낸 연락처의 결과 */
  private schedule(): HTMLElement {
    const s = this.s;
    const box = el('div', 'sched');
    const rows = this.data.contacts.filter((c) => c.book === s.shift && c.id in s.texting[s.shift].sent);
    if (rows.length === 0) return box;
    box.append(el('div', 'phone__h phone__h--sub', t('phone.schedule')));
    for (const c of rows) {
      const v = c.customerId ? s.visitors[c.customerId] : undefined;
      const row = el('div', v ? 'sched__row' : 'sched__row sched__row--no');
      row.append(el('span', 'sched__name', c.name), el('span', 'sched__state', v ? `${t('phone.chip.coming')} ${v.time}` : t('phone.chip.no')));
      box.append(row);
    }
    return box;
  }

  // ---------------------------------------------------------------- 수칙

  private rules(): void {
    const wrap = el('div', 'rules');
    wrap.append(el('div', 'phone__h', t('phone.rulesAfternoon')));
    const ol = el('ol', 'rules__list');
    for (const l of this.afternoonRules()) ol.append(el('li', '', l));
    wrap.append(ol);
    wrap.append(el('div', 'divider'));
    wrap.append(el('div', 'phone__h', t('phone.rulesDawn')));
    if (!this.dawnRules) wrap.append(el('div', 'empty', t('phone.rulesDawnLocked')));
    else {
      const dl = el('ol', 'rules__list rules__list--dawn');
      for (const r of this.data.rules.filter((x) => x.day <= this.s.day)) {
        const li = el('li', r.id === 6 ? 'torn' : '', r.text);
        li.value = r.id;
        dl.append(li);
      }
      wrap.append(dl);
    }
    this.body.append(wrap);
  }

  private afternoonRules(): string[] {
    const lines = (this.data.strings as { briefing: { afternoon: { lines: string[] } } }).briefing.afternoon.lines;
    return lines.filter((x) => /^\d\./.test(x)).map((x) => x.replace(/^\d\.\s*/, ''));
  }
}
