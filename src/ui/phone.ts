import { baseKind, isRegistered } from '../core/care';
import type { Game } from '../core/game';
import { ruleText } from '../core/rules';
import { renderTemplate, type BlockReason } from '../core/texting';
import type {
  Action, CareTemplateId, ClientCard, ContactDef, CustomerDef, GameData, Product, RuleDef, Shift, TemplateDef,
} from '../core/types';
import type { Mood } from '../render/palette';
import { iconUrl } from './display';
import { button, el, t, won } from './dom';
import { Notifier } from './notify';
import { phoneGlyph, type PhoneGlyph } from './phoneIcons';
import { sfx } from './sfx';
import { batteryEl, fillMobileStatus, regularsOf } from './status';

/** 업무폰의 앱 화면. card는 연락처 앱 안의 「카드」 탭이다. */
export type PhoneTab = 'messages' | 'contacts' | 'card' | 'notes';
type AppId = 'messages' | 'contacts' | 'notes';
const APP_OF: Record<PhoneTab, AppId> = { messages: 'messages', contacts: 'contacts', card: 'contacts', notes: 'notes' };
const ME = 'me'; // 04:44 문자의 발신자 "나"

interface Msg {
  id: number;
  key: string;
  dir: 'in' | 'out' | 'sys';
  from: string;
  text: string;
  /** 보낸/받은 게임 시각(HH:MM) */
  at: string;
  status?: 'sending' | 'sent';
}

type ChipStage = 'sending' | 'sent' | 'replied';

/** 입력줄과 템플릿 패널이 함께 쓰는 작성 상태 */
interface Plan {
  none: boolean;
  shift: Shift;
  mode: 'sales' | 'care';
  canSales: boolean;
  canCare: boolean;
  contact?: ContactDef;
  care?: CustomerDef;
  templates: TemplateDef[];
  reasons: Map<string, BlockReason | null>;
  picked?: TemplateDef;
  needsProduct: boolean;
  text: string;
  ready: boolean;
}

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
  /** 알림 점이 켜지거나 꺼질 때 (모바일 탭 바의 점) */
  onBadge(on: boolean): void;
  /** 04:44 선택이 시작될 때 (장면의 실루엣을 옅게 하는 데 쓴다) */
  onClosing(reply: boolean): void;
}

/** 템플릿 한 줄의 비활성 사유 문장 */
const whyText = (r: BlockReason): string => t(`phone.block.${r}`);

/** 게임 시각 "13:52" → "오후 01:52" */
const kTime = (clock: string): string => {
  const [h = 0, m = 0] = clock.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${t(h >= 12 ? 'phone.time.pm' : 'phone.time.am')} ${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** 이니셜 아바타 */
const avatar = (name: string, cls = ''): HTMLElement => el('span', `avatar ${cls}`.trim(), name.trim().charAt(0) || '?');

/** 업무폰 화면: 기기 틀 안의 상태줄, 홈 화면(앱 4개와 독), 메시지·연락처·메모 앱. */
export class Phone {
  tab: PhoneTab = 'contacts';
  /** 홈 화면이 떠 있다 */
  home = true; // 처음에는 홈 화면(S01)
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
  /** 연락처 명부에서 연 고객 카드(키) */
  private contactKey: string | null = null;
  /** 고객 카드의 버튼 중 펼쳐 둔 줄: 단골 등급 · 메모 · 통화(거절) */
  private cardAct: 'tier' | 'memo' | 'call' | null = null;
  /** 메모 앱에서 연 수칙 */
  private noteSel: string | null = null;
  private noteFolder: 'rules' | 'tips' | 'clues' | 'trash' | null = null;
  private readonly clueMeta: Record<string, { day: number; at: string; shift: 'afternoon' | 'dawn'; fresh: boolean }> = {};
  private readonly tipNotes: { id: string; text: string; day: number; at: string }[] = [];
  /** 새벽 수칙이 막 열렸다: 메모 목록에서 한 번 맥박친다 */
  private dawnNew = false;
  /** 알림 배너: 보낸 대화방 키와 자동 숨김 타이머 */
  private notifier!: Notifier;
  private visible = true;
  private mood: Mood = 'calm';
  /** 앱별 알림 점(메시지 배지는 unreadKeys로 센다) */
  private unread = new Set<AppId>();
  /** 읽지 않은 대화방 */
  private unreadKeys = new Set<string>();
  private pulseNow = new Set<AppId>();
  private lastBadge = false;
  /** 입력줄을 눌러 템플릿 패널(키보드 자리)이 올라와 있다 */
  private panelOpen = false;
  private readonly root: HTMLElement;
  private readonly screen = el('div', 'phone__screen');
  private readonly island = el('div', 'phone__island');
  private readonly status = el('div', 'phone__status');
  private readonly money = el('div', 'phone__money');
  private readonly bar = el('div', 'phone__bar');
  private readonly body = el('div', 'phone__body');
  private readonly dock = el('div', 'phone__dock');
  private readonly foot = el('div', 'phone__foot');
  private readonly homeBar = button('phone__home-bar', '', () => { sfx.play('sheet_open'); if (this.home) this.openTab(this.tab); else this.openHome(); });

  constructor(root: HTMLElement, private readonly host: PhoneHost, private readonly opts: PhoneOpts) {
    this.root = root;
    root.append(this.screen);
    this.screen.append(this.island, this.status, this.money, this.bar, this.body, this.dock, this.foot, this.homeBar);
    this.notifier = new Notifier(this.screen, this.opts.reduced, 'notif--phone');
    this.island.setAttribute('aria-hidden', 'true');
    this.refresh();
  }

  private get s() { return this.host.game.getState(); }
  private get data() { return this.host.data; }
  private ms(n: number): number { return this.opts.reduced ? Math.min(n, 150) : n; }
  private later(fn: () => void, ms: number): void { window.setTimeout(fn, this.ms(ms)); }

  // ---------------------------------------------------------------- 바깥에서 쓰는 것

  setMood(m: Mood): void { this.mood = m; this.refresh(); }
  unlockDawnRules(): void { this.dawnRules = true; this.dawnNew = true; this.pulse('notes'); }
  get hasUnread(): boolean { return this.unread.size > 0 || this.unreadKeys.size > 0; }
  /** 폰 화면이 실제로 보이는지(모바일 시트가 열려 있는지). 보이는 앱의 알림은 바로 꺼진다. */
  setVisible(v: boolean): void {
    this.visible = v;
    if (v) { this.unread.delete(APP_OF[this.tab]); this.refresh(); }
  }

  /** 입력이 잠겨 있다: 전송 애니메이션 중이거나 브리지가 답장을 기다린다 */
  get locked(): boolean { return this.inflight > 0 || this.host.busy(); }

  openTab(tab: PhoneTab, focus = false): void {
    this.tab = tab;
    this.home = false;
    this.view = null;
    this.panelOpen = false;
    this.contactKey = null;
    this.noteSel = null;
    this.noteFolder = null;
    this.unread.delete(APP_OF[tab]);
    this.refresh();
    if (focus) this.body.querySelector<HTMLElement>('button')?.focus();
  }

  /** 홈 화면으로 */
  openHome(): void { this.home = true; this.view = null; this.panelOpen = false; this.refresh(); }

  pulse(tab: PhoneTab): void {
    const app = APP_OF[tab];
    if (APP_OF[this.tab] !== app || !this.visible || this.home) this.unread.add(app);
    this.pulseNow.add(app);
    this.refresh();
  }

  /** 튜토리얼은 화면을 가리는 박스가 아니라 알림으로 보낸다 */
  /** 받은 팁은 메모의 「접객 팁」 폴더에 남는다 */
  rememberTip(text: string): void {
    if (!this.tipNotes.some((n) => n.text === text)) this.tipNotes.unshift({ id: `tip${this.tipNotes.length}`, text, day: this.s.day, at: this.s.clock });
  }
  showTip(text: string): void {
    this.rememberTip(text);
    this.notifier.show({ app: 'tips', title: t('notify.tipSender'), body: text, stay: 5000 });
  }
  hideTip(): void { this.notifier.hide(); }

  /** 04:44: 폰이 강제로 열리고 "나"와의 대화방이 뜬다 */
  setClosing(on: boolean): void {
    this.closing = on;
    this.closingPreview = null;
    this.facedown = false;
    if (on) { this.tab = 'messages'; this.home = false; this.view = ME; this.unreadKeys.delete(ME); }
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
        this.feed.push({ id: this.nextId++, key: ME, dir: 'sys', from: '', text: t('closingText.facedown'), at: this.s.clock });
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

  /** 단서 메모를 얻었다: 「손님 메모」 폴더에 새 메모가 생기고 메모 앱에 점이 찍힌다. 알림에 쓸 제목과 첫 줄을 돌려준다. */
  noteClue(id: string): { title: string; body: string } {
    this.clueMeta[id] = { day: this.s.day, at: this.s.clock, shift: this.s.shift, fresh: true };
    this.pulse('notes');
    const c = this.clueText(id);
    return { title: c.title, body: c.lines[0] ?? '' };
  }

  private clueText(id: string): { title: string; lines: string[] } {
    const c = (this.data.strings as { clues?: Record<string, { title: string; lines: string[] }> }).clues?.[id];
    return c ?? { title: id, lines: [] };
  }

  /** 새 메모 알림: 눌러서 「손님 메모」 폴더로 간다 */
  noteBanner(title: string, body: string): void {
    this.notifier.show({ app: 'notes', title, body, stay: 5000, onTap: () => { this.openTab('notes'); this.noteFolder = 'clues'; this.refresh(); } });
  }

  /** 새 날 아침: 어제의 전송 상태·대기 중인 답장을 비우고 홈 화면으로 돌아온다 */
  newDay(): void {
    this.chipStage.clear();
    this.preDelivered.clear();
    this.awaiting.clear();
    this.deferred.length = 0;
    this.view = null;
    this.contactKey = null;
    this.openHome();
  }

  /** 안 보이는 대화방에 놓이는 시스템 줄(속마음, 지문): 이름표 없는 말 */
  addNote(text: string): void {
    this.feed.push({ id: this.nextId++, key: this.view ?? this.lastKey ?? ME, dir: 'sys', from: '', text, at: this.s.clock });
    this.refresh();
  }

  /** 관계 변화 같은 결과 줄은 큐가 빌 때 한꺼번에 놓는다 */
  deferNote(key: string, text: string): void { this.deferred.push({ key, text }); }
  flushNotes(): void {
    if (this.deferred.length === 0) return;
    for (const d of this.deferred.splice(0)) this.feed.push({ id: this.nextId++, key: d.key, dir: 'sys', from: '', text: d.text, at: this.s.clock });
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
      this.feed.push({ id: this.nextId++, key, dir: 'in', from, text, at: this.s.clock });
      const seeing = this.visible && !this.home && this.view === key;
      if (!seeing) this.unreadKeys.add(key);
      // 보고 있지 않은 대화방의 답장과 04:44 "나"의 문자는 알림 배너로 내려온다
      if (!seeing || key === ME) this.showBanner(key, from, text);
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

  /** 메시지 알림: 지금 보고 있는 대화가 아니면 위에서 내려온다. 누르면 그 대화방이 열린다. */
  private showBanner(key: string, from: string, text: string): void {
    this.notifier.show({ app: 'messages', title: from || this.titleOf(key), body: text, onTap: () => this.openThread(key) });
  }

  /** 검은 아이콘이 열린다: 새벽에 「검은 수첩」으로 들어간다 */
  openApp(): void {
    this.openTab('contacts');
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
    this.renderBar();
    this.renderBody();
    this.renderDock();
    this.renderFoot();
    this.renderTip();
    this.homeBar.setAttribute('aria-label', t(this.home ? 'phone.leaveHome' : 'phone.goHome'));
    const sig = `${this.home}|${this.tab}|${this.view}|${this.contactKey}|${this.noteFolder}|${this.noteSel}`;
    const n = this.feed.length + (this.awaiting.size ? 1 : 0);
    if (sig !== this.lastSig) this.body.scrollTop = 0; // 화면이 바뀌면 맨 위부터
    else if (this.view !== null && stick && n !== this.lastCount) {
      // 새 말풍선이 보이도록: 대화 끝이 화면 아래쪽 60% 지점에 오게 한다
      const chat = this.body.querySelector<HTMLElement>('.chat');
      const end = chat ? chat.offsetTop + chat.offsetHeight : this.body.scrollHeight;
      this.body.scrollTop = Math.max(0, end - this.body.clientHeight * 0.6);
    } else this.body.scrollTop = top;
    this.lastSig = sig;
    this.lastCount = n;
    this.pulseNow.clear();
    const badge = this.hasUnread;
    if (badge !== this.lastBadge) { this.lastBadge = badge; this.opts.onBadge(badge); }
  }

  // ---------------------------------------------------------------- 상태줄과 대화방 머리

  private renderStatus(): void {
    const s = this.s;
    const hit = this.hit && performance.now() < this.hit.until ? this.hit.delta : 0;
    const sys = el('span', 'phone__sys');
    sys.append(phoneGlyph('signal', 'pico pico--signal'), phoneGlyph('wifi', 'pico pico--wifi'), batteryEl(s.composure, hit));
    this.status.replaceChildren(el('span', 'phone__time num', s.clock), sys);
    this.money.replaceChildren(el('span', 'phone__day num', `${t('hud.day')} ${s.day}`), el('span', 'num', `₩ ${s.revenue.toLocaleString('en-US')}`), el('span', 'phone__sub', `${t('phone.regularsCount')} ${regularsOf(s)}`));
    if (s.dawnLedger.length > 0) this.money.append(el('span', 'phone__sub', `${t('phone.ledgerCount')} ${s.dawnLedger.length}`));
    this.money.hidden = this.home || this.view !== null;
    fillMobileStatus(this.opts.mirror, s, hit);
  }

  /** 대화방 머리: ‹ (읽지 않은 수 배지) · 아바타 + 이름 › */
  private renderBar(): void {
    this.bar.replaceChildren();
    const key = this.view;
    this.bar.hidden = this.home || key === null;
    if (this.home || key === null) return;
    const name = this.titleOf(key);
    const back = button('bar__back', '', () => { this.view = null; this.panelOpen = false; this.refresh(); });
    back.setAttribute('aria-label', t('phone.back'));
    back.append(phoneGlyph('back', 'pico pico--back'));
    const n = this.unreadKeys.size;
    if (n > 0) back.append(el('span', 'badge num', String(n)));
    const who = el('div', 'bar__who');
    who.append(avatar(name, 'avatar--sm'), el('span', 'bar__name', `${name} ›`));
    this.bar.append(back, who, el('span', 'bar__spacer'));
  }

  private renderTip(): void {
  }

  private renderBody(): void {
    this.body.replaceChildren();
    this.body.dataset.tab = this.home ? 'home' : this.tab;
    this.body.dataset.view = this.view !== null ? 'thread' : 'list';
    if (this.home) { this.homeScreen(); return; }
    if (this.view !== null) { this.thread(this.view); return; }
    ({ messages: () => this.chatList(), contacts: () => this.book(), card: () => this.cards(), notes: () => this.rules() })[this.tab]();
  }

  /** 대화방의 아래쪽: 문자 수 줄, 답장 칩, 입력줄, 템플릿 패널(키보드 자리) */
  private renderDock(): void {
    this.dock.replaceChildren();
    const key = this.view;
    this.dock.hidden = this.home || key === null;
    if (this.home || key === null) return;
    if (this.closing && key === ME) { this.dock.append(this.closingInput()); return; }
    const plan = this.plan(key);
    const line = this.statusLine();
    if (line) this.dock.append(line);
    if (this.s.pendingReplies[key] && !this.awaiting.has(key)) this.dock.append(this.replyChips(key));
    this.dock.append(this.inputBar(key, plan));
    if (this.panelOpen) this.dock.append(this.panel(key, plan));
  }

  private renderFoot(): void {
    this.foot.replaceChildren();
    if (this.home || (this.view !== null && !this.closing)) return; // 대화방에서는 ‹로 목록에 돌아와 마친다
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
      this.foot.append(this.aftercareCounter(), done(t('phone.finishAftercare'), { type: 'finishAftercare' }));
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

  private aftercareCounter(): HTMLElement {
    const d = this.data.days[this.s.day] ?? this.data.days[1];
    return el('div', 'phone__counter', t('phone.aftercareLeft', { left: this.s.aftercareRemaining, total: d?.aftercare.perShift ?? 0 }));
  }

  /** 대화방 아래 줄에 붙는 문자 수 */
  private statusLine(): HTMLElement | null {
    const p = this.s.phase;
    if (p.kind === 'texting') return this.counter();
    if (p.kind === 'aftercare') return this.aftercareCounter();
    return null;
  }

  // ---------------------------------------------------------------- 홈 화면

  private homeScreen(): void {
    const dawn = this.s.shift === 'dawn';
    // 배경화면: 그늘색 바탕에 옅은 퀼팅 마름모, 가운데 엠블럼(새벽에는 녹슨 회색)
    const wall = el('div', 'phone__wall');
    wall.setAttribute('aria-hidden', 'true');
    const emblem = el('img', 'wall__emblem');
    emblem.src = 'art/brand/emblem.png';
    emblem.alt = '';
    wall.append(emblem);
    const clock = el('div', 'home-clock');
    clock.append(el('span', 'home-clock__time num', this.s.clock), el('span', 'home-clock__date', `${t('hud.day')} ${this.s.day}`));
    const unread = this.unreadKeys.size;
    const grid = el('div', 'apps');
    grid.append(
      this.appIcon('messages', t('phone.apps.messages'), !dawn, () => this.openTab('messages'), { badge: unread }),
      this.appIcon('contacts', t('phone.apps.contacts'), !dawn, () => this.openTab('contacts')),
      this.appIcon('notes', t('phone.apps.notes'), true, () => this.openTab('notes')),
      // 휴게 전에는 이름이 없다(흔들기만 된다). 새벽에 「검은 수첩」이 된다.
      this.appIcon('black', dawn ? t('phone.apps.black') : '', dawn, () => this.openTab('contacts')),
    );
    // 독: 앞의 세 앱 (같은 앱의 되풀이라 보조 기술에서는 숨긴다)
    const dock = el('div', 'apps-dock');
    dock.append(
      this.appIcon('messages', '', !dawn, () => this.openTab('messages'), { badge: unread, decorative: true }),
      this.appIcon('contacts', '', !dawn, () => this.openTab('contacts'), { decorative: true }),
      this.appIcon('notes', '', true, () => this.openTab('notes'), { decorative: true }),
    );
    this.body.append(wall, clock, grid, dock);
  }

  /** active가 아니면 눌러도 아이콘이 0.2초 흔들릴 뿐이다 (S01: 휴게 시간 전까지 검은 아이콘은 잠김) */
  private appIcon(
    kind: PhoneGlyph & ('messages' | 'contacts' | 'notes' | 'black'), label: string, active: boolean, open: () => void,
    o: { badge?: number; decorative?: boolean } = {},
  ): HTMLElement {
    const b = el('button', 'app');
    b.type = 'button';
    b.dataset.app = kind;
    if (o.decorative) { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); } else b.setAttribute('aria-label', label || t('phone.apps.blackHidden'));
    if (!active) b.setAttribute('aria-disabled', 'true');
    const tile = el('span', 'app__tile');
    tile.append(phoneGlyph(kind, 'pico pico--app'));
    const app: AppId | null = kind === 'black' ? null : kind;
    if (o.badge && o.badge > 0) tile.append(el('span', 'app__badge num', String(o.badge)));
    else if (app && this.unread.has(app)) tile.append(el('span', 'app__dot'));
    if (app && this.pulseNow.has(app)) tile.classList.add('is-pulse');
    b.append(tile, el('span', 'app__label', label));
    b.addEventListener('click', () => {
      if (active) { open(); return; }
      sfx.play('icon_shake');
      if (this.opts.reduced) return;
      tile.classList.remove('is-shake');
      void tile.offsetWidth;
      tile.classList.add('is-shake');
    });
    return b;
  }

  // ---------------------------------------------------------------- 메시지: 대화방 목록과 대화방

  private titleOf(key: string): string {
    if (key === ME) return t('closingText.from');
    const c = this.data.contacts.find((x) => (x.customerId ?? x.id) === key);
    if (c) return c.name;
    return this.data.customers.find((x) => x.id === key)?.name ?? key;
  }

  private header(title: string, extra?: HTMLElement): HTMLElement {
    const h = el('div', 'screen-title');
    h.append(el('div', 'screen-title__text', title));
    if (extra) h.append(extra);
    return h;
  }

  private chatList(): void {
    this.body.append(this.header(t('phone.apps.messages')));
    const search = el('div', 'search');
    search.append(phoneGlyph('search', 'pico pico--search'), el('span', 'search__text', t('phone.search')));
    this.body.append(search);
    const feedRev = [...this.feed].reverse();
    const keys: string[] = [];
    for (const m of feedRev) if (m.dir !== 'sys' && !keys.includes(m.key)) keys.push(m.key);
    if (keys.length === 0) { this.body.append(el('div', 'empty', t('phone.noChat'))); return; }
    const list = el('div', 'threads');
    for (const key of keys) {
      const last = feedRev.find((m) => m.key === key && m.dir !== 'sys') as Msg;
      const row = button('thread-row', '', () => this.openThread(key));
      if (this.unreadKeys.has(key)) row.classList.add('is-unread');
      const main = el('span', 'thread-row__main');
      const top = el('span', 'thread-row__top');
      top.append(el('span', 'thread-row__name', this.titleOf(key)), el('span', 'thread-row__time num', kTime(last.at)));
      main.append(top, el('span', 'thread-row__last', `${last.dir === 'out' ? `${t('closingText.from')}: ` : ''}${last.text}`));
      const contact = this.contactOf(key);
      const chip = contact ? this.chipFor(contact) : '';
      if (chip) main.append(el('span', `chip-state chip-state--${chip}`, t(`phone.chip.${chip}`)));
      else if (this.s.pendingReplies[key]) main.append(el('span', 'chip-state chip-state--sent', t('phone.replyWaiting')));
      row.append(el('span', 'thread-row__dot'), avatar(this.titleOf(key)), main);
      list.append(row);
    }
    this.body.append(list);
  }

  openThread(key: string, template: string | null = null): void {
    this.view = key;
    this.home = false;
    this.panelOpen = false;
    this.compose = { mode: this.defaultMode(key), template, product: null };
    this.unreadKeys.delete(key);
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
    const log = el('div', 'chat');
    if (key === ME && s.shift === 'dawn') log.dataset.me = '1';
    const head = el('div', 'thread-date');
    head.append(el('span', '', t('phone.threadKind')), el('span', '', t('phone.today', { time: kTime(s.clock) })));
    log.append(head);
    const msgs = this.feed.filter((m) => m.key === key);
    // (빈칸): 답장이 보내기 전에 이미 와 있다 (S08)
    const pre = contact && contact.composureOnSend && contact.replies.any && !(contact.id in s.texting[s.shift].sent);
    if (pre) {
      const row = el('div', 'bubble-row bubble-row--in');
      row.append(el('div', 'bubble bubble--in bubble--wrong', contact.replies.any));
      log.append(row);
    }
    if (msgs.length === 0 && !pre && key !== ME) log.append(el('div', 'empty', t('phone.noChat')));
    const lastOut = msgs.reduce((acc, m, i) => (m.dir === 'out' ? i : acc), -1);
    msgs.forEach((m, i) => {
      if (m.dir === 'sys') { log.append(el('div', 'sys', m.text)); return; }
      const row = el('div', `bubble-row bubble-row--${m.dir}`);
      row.append(el('div', `bubble bubble--${m.dir}`, m.text));
      if (m.dir === 'out' && i === lastOut) row.append(el('div', `bubble__status${m.status === 'sending' ? ' is-sending' : ''}`, this.deliveryLabel(msgs, i)));
      log.append(row);
    });
    if (this.awaiting.has(key)) {
      // 답장 대기: 입력 중 말풍선 (점은 움직임을 줄이면 가만히 있다)
      const row = el('div', 'bubble-row bubble-row--in');
      const typing = el('div', 'bubble bubble--in bubble--typing');
      typing.setAttribute('role', 'status');
      typing.setAttribute('aria-label', t('phone.typing'));
      for (let i = 0; i < 3; i++) typing.append(el('i'));
      row.append(typing);
      log.append(row);
    }
    this.body.append(log);
  }

  /** 마지막 보낸 말풍선 아래 줄: 전송 중… → 전송됨 → 읽음 (받은 답장의 시각) */
  private deliveryLabel(msgs: Msg[], i: number): string {
    const m = msgs[i] as Msg;
    if (m.status === 'sending') return t('phone.sendWait');
    const reply = msgs.slice(i + 1).find((x) => x.dir === 'in');
    return reply ? t('phone.read', { time: kTime(reply.at) }) : t('phone.delivered');
  }

  private replyChips(key: string): HTMLElement {
    const box = el('div', 'reply');
    box.setAttribute('role', 'group');
    const chat = this.data.customers.find((x) => x.id === key)?.care.chat;
    chat?.options.forEach((label, i) => {
      const b = button('reply__opt', label, () => this.chooseReply(key, i === 0 ? 0 : 1, label));
      if (this.locked) b.setAttribute('aria-disabled', 'true');
      box.append(b);
    });
    return box;
  }

  private chooseReply(key: string, option: 0 | 1, label: string): void {
    if (this.locked) return;
    this.lastKey = key;
    this.feed.push({ id: this.nextId++, key, dir: 'out', from: '', text: label, status: 'sent', at: this.s.clock });
    sfx.play('msg_send');
    this.host.dispatch({ type: 'chooseReply', customerId: key, option });
  }

  /** 입력줄: + (템플릿 패널), 입력칸(누르면 패널), 보내기 화살표 */
  private inputBar(key: string, plan: Plan): HTMLElement {
    const bar = el('div', 'inputbar');
    const plus = button('inputbar__plus', '', () => { this.panelOpen = !this.panelOpen; this.refresh(); });
    plus.setAttribute('aria-label', t('phone.attach'));
    plus.setAttribute('aria-expanded', String(this.panelOpen));
    plus.append(phoneGlyph('plus', 'pico pico--plus'));
    const field = button('inputbar__field', '', () => { if (plan.none) return; this.panelOpen = true; this.refresh(); });
    field.setAttribute('aria-label', t('phone.fieldPlaceholder'));
    if (plan.none) field.setAttribute('aria-disabled', 'true');
    if (plan.picked) field.append(el('span', 'inputbar__text', plan.text));
    else field.append(el('span', 'inputbar__hint', t('phone.fieldPlaceholder')));
    const enabled = !!plan.picked && plan.ready && !plan.none && !this.locked;
    const send = button('inputbar__send', '', () => {
      if (!enabled || !plan.picked) return;
      this.send(key, plan.mode, plan.picked, plan.text);
      this.panelOpen = false;
    });
    send.setAttribute('aria-label', t('phone.sendLabel'));
    if (!enabled) send.setAttribute('aria-disabled', 'true');
    if (plan.picked && !plan.ready) send.title = t('phone.pickProduct');
    send.append(phoneGlyph('send', 'pico pico--send'));
    bar.append(plus, field, send);
    return bar;
  }

  /** 04:44 답장 입력줄: 보내기 없이 미리보기만 놓인다 */
  private closingInput(): HTMLElement {
    const box = el('div', 'closing-input');
    box.append(el('div', 'closing-input__label', t('phone.replyField')));
    const bar = el('div', 'inputbar inputbar--closing');
    const field = el('div', 'inputbar__field');
    if (this.closingPreview !== null) field.append(el('span', 'inputbar__text', this.closingPreview));
    else field.append(el('span', 'inputbar__hint', t('phone.fieldPlaceholder')));
    field.append(el('i', 'caret'));
    bar.append(field);
    box.append(bar);
    return box;
  }

  /** 템플릿 패널: 영업/관리 전환, 문구 목록(미리보기 포함), 상품 고르기 */
  private panel(key: string, plan: Plan): HTMLElement {
    const box = el('div', 'tpl-panel');
    if (plan.none) {
      box.append(el('div', 'hint', t(this.s.phase.kind === 'texting' || this.s.phase.kind === 'aftercare' ? 'phone.composeNone' : 'phone.composeClosed')));
      return box;
    }
    if (plan.canSales && plan.canCare) {
      const seg = el('div', 'seg');
      for (const m of ['sales', 'care'] as const) {
        const b = button('seg__btn', t(`phone.mode.${m}`), () => { this.compose = { mode: m, template: null, product: null }; this.refresh(); });
        b.setAttribute('aria-pressed', String(m === plan.mode));
        seg.append(b);
      }
      box.append(seg);
    }
    box.append(el('div', 'compose__h', t(plan.mode === 'sales' ? 'phone.composeSales' : 'phone.composeCare')));
    const group = el('div', 'tpl-list');
    group.setAttribute('role', 'radiogroup');
    for (const tpl of plan.templates) {
      const reason = plan.reasons.get(tpl.id) ?? null;
      const r = el('button', 'tpl');
      r.type = 'button';
      r.setAttribute('role', 'radio');
      r.setAttribute('aria-checked', String(plan.picked?.id === tpl.id));
      r.append(el('span', 'tpl__name', tpl.name));
      if (reason) {
        r.disabled = true;
        r.append(el('span', 'tpl__why', whyText(reason)));
      } else {
        r.append(el('span', 'tpl__text', this.previewText(tpl, key, plan.contact, plan.care)));
        r.addEventListener('click', () => { this.compose.template = tpl.id; this.refresh(); });
      }
      group.append(r);
    }
    box.append(group);
    if (plan.needsProduct) box.append(this.picker(plan.shift));
    if (!plan.picked) box.append(el('div', 'hint', t('phone.pickTemplate')));
    else if (!plan.ready) box.append(el('div', 'hint', t('phone.pickProduct')));
    return box;
  }

  /** 작성 상태 계산: 영업/관리 가능 여부, 고른 문구, 보낼 수 있는지 */
  private plan(key: string): Plan {
    const s = this.s;
    const p = s.phase;
    const shift: Shift = s.shift;
    const contact = this.contactOf(key);
    const care = this.careTarget(key);
    const texting = p.kind === 'texting';
    const canSales = texting && !!contact;
    const canCare = (texting || p.kind === 'aftercare') && !!care;
    if (!canSales && !canCare) {
      return { none: true, shift, mode: 'sales', canSales, canCare, contact, care, templates: [], reasons: new Map(), needsProduct: false, text: '', ready: false };
    }
    let mode = this.compose.mode;
    if (mode === 'sales' && !canSales) mode = 'care';
    if (mode === 'care' && !canCare) mode = 'sales';
    this.compose.mode = mode;

    const templates: TemplateDef[] = mode === 'sales'
      ? this.data.templates.sales.filter((x) => x.shift === shift)
      : this.data.templates.care.filter((x) => x.shift === shift);
    const probeProduct = this.productsOf(shift)[0]?.id;
    const reasons = new Map<string, BlockReason | null>(templates.map((tpl) => [tpl.id, mode === 'sales'
      ? this.host.game.blockReason({ type: 'sendText', contactId: (contact as ContactDef).id, template: tpl.id as never })
      : this.host.game.blockReason({ type: 'sendCare', customerId: key, template: tpl.id as CareTemplateId, productId: probeProduct })]));
    if (this.compose.template && reasons.get(this.compose.template) !== null) this.compose.template = null;
    const picked = templates.find((x) => x.id === this.compose.template);
    const needsProduct = mode === 'care' && !!picked && baseKind(picked.id as CareTemplateId) === 'recommend';
    const ready = !needsProduct || this.compose.product !== null;
    const text = picked ? this.previewText(picked, key, contact, care) : '';
    return { none: false, shift, mode, canSales, canCare, contact, care, templates, reasons, picked, needsProduct, text, ready };
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

  /** 보낸 말풍선 → "전송 중…" 0.6초 → "전송됨". 답장은 코어 이벤트가 오면 deliver가 붙인다. */
  private beginSend(key: string, text: string, o: { pre?: string; from?: string }): void {
    this.lastKey = key;
    if (o.pre) {
      this.feed.push({ id: this.nextId++, key, dir: 'in', from: o.from ?? '', text: o.pre, at: this.s.clock });
      this.preDelivered.add(key);
    }
    const m: Msg = { id: this.nextId++, key, dir: 'out', from: '', text, status: 'sending', at: this.s.clock };
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

  // ---------------------------------------------------------------- 연락처 (명부 · 카드) / 애프터케어

  private appSeg(): HTMLElement {
    const seg = el('div', 'seg seg--app');
    for (const [tab, label] of [['contacts', t('phone.tabs.book')], ['card', t('phone.tabs.cards')]] as const) {
      const b = button('seg__btn', label, () => this.openTab(tab));
      b.setAttribute('aria-pressed', String(this.tab === tab));
      seg.append(b);
    }
    return seg;
  }

  private book(): void {
    if (this.contactKey !== null) { this.contactDetail(this.contactKey); return; }
    const s = this.s;
    const p = s.phase;
    const dawn = s.shift === 'dawn';
    this.body.append(this.header(t(dawn ? 'phone.bookDawn' : 'phone.apps.contacts'), this.appSeg()));
    if (dawn) this.body.append(el('div', 'note-page', t('briefing.dawn.notebook')));
    if (p.kind === 'aftercare') { this.served(); return; }
    const list = el('div', 'contacts');
    if (p.kind === 'texting') list.append(el('div', 'hint', t('phone.pickContact')));
    for (const c of this.data.contacts.filter((x) => x.book === s.shift)) {
      const key = c.customerId ?? c.id;
      const row = el('div', 'contact');
      const head = button('contact__head', '', () => this.openContact(key));
      const chip = this.chipFor(c);
      const text = el('span', 'contact__text');
      text.append(el('span', 'contact__name', c.name));
      if (c.address) text.append(el('span', 'contact__addr', c.address));
      text.append(el('span', 'contact__memo', c.memo));
      if (c.memoStruck) text.append(el('span', 'contact__memo contact__memo--struck', c.memoStruck));
      head.append(avatar(c.name), text);
      if (chip) head.append(el('span', `chip-state chip-state--${chip}`, t(`phone.chip.${chip}`)));
      row.append(head);
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
      const head = button('contact__head', '', () => this.openContact(c.id));
      const text = el('span', 'contact__text');
      text.append(el('span', 'contact__name', c.name));
      if (c.care.memo && s.shift === 'dawn') text.append(el('span', 'contact__memo', c.care.memo));
      head.append(avatar(c.name), text, el('span', 'chip-state chip-state--sent', t(`tier.${(s.cards[c.id] as ClientCard).tier}`)));
      row.append(head);
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
      const text = el('span', 'contact__text');
      text.append(el('span', 'contact__name', c.name));
      if (c.care.memo && s.shift === 'dawn') text.append(el('span', 'contact__memo', c.care.memo));
      head.append(avatar(c.name), text, el('span', `chip-state chip-state--${sold ? 'coming' : 'no'}`, t(sold ? 'phone.soldMark' : 'phone.failMark')));
      row.append(head);
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

  // ---------------------------------------------------------------- 고객 카드 (연락처 · 카드 탭)

  private cards(): void {
    const s = this.s;
    const list = Object.values(s.cards).sort((a, b) => (b.lastVisitDay ?? 0) - (a.lastVisitDay ?? 0));
    const wrap = el('div', 'cards');
    wrap.append(this.header(t('phone.cardTitle'), this.appSeg()));
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
    const box = this.fieldSheet(card);
    const head = el('div', 'card-sheet__head');
    head.append(avatar(c.name, 'avatar--lg'), el('span', 'card-sheet__name', c.name), el('span', 'card-sheet__tier', t(`phone.cardBook.${card.book}`)));
    box.prepend(head);
    return box;
  }

  /** 고객 카드의 필드 목록(회색 카드): 라벨은 작게, 값은 아래. 카드가 없으면 모두 "아직 몰라요". */
  private fieldSheet(card: ClientCard | undefined): HTMLElement {
    const box = el('div', 'card-sheet');
    box.dataset.tier = card?.tier ?? 'new';
    const hearts = card ? { new: 0, regular: 2, vip: 3, lifetime: 4, lost: 0 }[card.tier] : 0;
    const relV = el('span', card ? 'kv__v rel' : 'kv__v kv__v--unknown');
    if (card) relV.append(el('span', 'rel__hearts', '♥'.repeat(hearts) + '♡'.repeat(4 - hearts)), el('span', 'rel__tier', t(`tier.${card.tier}`)));
    else relV.textContent = t('unknown');
    const relRow = el('div', 'kv');
    relRow.append(el('span', 'kv__k', t('phone.cardFields.relation')), relV);
    box.append(relRow);
    const dept = card?.category ? t(`categories.${card.category}`) : undefined;
    const rows: [string, string | undefined][] = [
      ['category', dept && card?.wants ? `${dept} · ${card.wants}` : card?.wants ?? dept],
      ['color', card?.color ? t(`display.colors.${card.color}`) : undefined],
      ['budget', card?.budget !== undefined ? won(card.budget) : undefined],
      ['occasion', card?.occasion ? `${card.occasion.label} (${t('phone.dayN', { n: card.occasion.day })})` : undefined],
      ['drink', card?.drink ? t(`drinks.${card.drink}`) : undefined],
      ['purchases', card && card.purchases.length ? card.purchases.map((x) => `${this.data.products.find((p) => p.id === x.productId)?.name ?? x.productId} (${t('phone.dayN', { n: x.day })})`).join(', ') : undefined],
      ['notes', card && card.notes.length ? card.notes.join(' · ') : undefined],
      ['lastContact', card && card.lastContactDay !== null ? t('phone.dayN', { n: card.lastContactDay }) : undefined],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'kv');
      r.append(el('span', 'kv__k', t(`phone.cardFields.${k}`)), el('span', v === undefined ? 'kv__v kv__v--unknown' : 'kv__v', v ?? t('unknown')));
      box.append(r);
    }
    return box;
  }

  /** 연락처 상세 = 고객 카드: 큰 아바타, 이름, 버튼 4개(메시지·통화·단골·메모), 필드 목록 */
  private contactDetail(key: string): void {
    const s = this.s;
    const contact = this.contactOf(key) ?? this.data.contacts.find((c) => (c.customerId ?? c.id) === key);
    const def = this.data.customers.find((x) => x.id === key);
    const card = s.cards[key] as ClientCard | undefined;
    const name = contact?.name ?? def?.name ?? key;
    const wrap = el('div', 'cdet');
    const back = button('nav-back', '', () => { this.openTab('contacts'); });
    back.append(phoneGlyph('back', 'pico pico--back'), el('span', '', t('phone.apps.contacts')));
    wrap.append(back);
    const head = el('div', 'cdet__head');
    head.append(avatar(name, 'avatar--lg'), el('span', 'cdet__name', name), el('span', 'cdet__tier', t(`phone.cardBook.${contact?.book ?? s.shift}`)));
    wrap.append(head);
    const acts = el('div', 'cdet__acts');
    const act = (id: 'message' | 'call' | 'tier' | 'memo', disabled = false): HTMLElement => {
      const b = el('button', `cdet-act cdet-act--${id}`);
      b.type = 'button';
      b.append(el('span', 'cdet-act__label', t(`phone.act.${id}`)));
      if (disabled) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        if (id === 'message') { this.openThread(key); return; }
        // 통화는 늘 사유를 보여 준다. 단골·메모는 다시 누르면 접힌다.
        this.cardAct = id === 'call' || this.cardAct !== id ? id : null;
        this.refresh();
      });
      return b;
    };
    acts.append(act('message'), act('call', true), act('tier'), act('memo'));
    wrap.append(acts);
    if (this.cardAct !== null) {
      const line = el('div', 'cdet__line');
      if (this.cardAct === 'call') line.textContent = t('phone.callBlocked');
      else if (this.cardAct === 'tier') line.textContent = card ? `${t('phone.cardFields.relation')} · ${t(`tier.${card.tier}`)}` : t('unknown');
      else {
        line.textContent = contact?.memo ?? def?.care.memo ?? t('unknown');
        if (contact?.memoStruck) line.append(el('s', 'cdet__struck', contact.memoStruck));
      }
      wrap.append(line);
    }
    wrap.append(this.fieldSheet(card));
    this.body.append(wrap);
  }

  private openContact(key: string): void {
    this.contactKey = key;
    this.cardAct = null;
    this.refresh();
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

  // ---------------------------------------------------------------- 메모 (폴더 → 목록 → 본문)

  private noteList(folder: 'rules' | 'tips' | 'clues' | 'trash'): NoteItem[] {
    const day = this.s.day;
    if (folder === 'rules') {
      const out: NoteItem[] = [];
      if (this.dawnRules) out.push({ id: 'dawn', title: t('phone.rulesDawn'), lines: this.dawnRuleList().map((r) => ({ n: r.id, text: ruleText(r, day), torn: r.id === 6 })), day, shift: 'dawn', at: '00:30', fresh: this.dawnNew });
      out.push({ id: 'afternoon', title: t('phone.rulesAfternoon'), lines: this.afternoonRules().map((x, i) => ({ n: i + 1, text: x })), day: 1, shift: 'afternoon', at: '12:30' });
      return out;
    }
    if (folder === 'clues') {
      return [...this.s.clues].reverse().map((id) => {
        const meta = this.clueMeta[id] ?? { day: this.s.day, at: '', shift: this.s.shift, fresh: false };
        const c = this.clueText(id);
        return { id: `clue:${id}`, title: c.title, lines: c.lines.map((text) => ({ n: 0, text })), day: meta.day, shift: meta.shift, at: meta.at, fresh: meta.fresh };
      });
    }
    if (folder === 'tips') {
      return this.tipNotes.map((n) => ({ id: n.id, title: n.text.length > 14 ? `${n.text.slice(0, 14)}…` : n.text, lines: [{ n: 0, text: n.text }], day: n.day, shift: n.day === day ? this.s.shift : 'afternoon', at: n.at }));
    }
    return [];
  }

  private folderCount(f: 'rules' | 'tips' | 'clues' | 'trash'): number { return this.noteList(f).length; }

  /** 메모 앱: 폴더 목록 */
  private rules(): void {
    const wrap = el('div', 'rules notes');
    const sel = this.noteFolder;
    if (sel !== null && this.noteSel !== null) { this.noteDoc(wrap, sel, this.noteSel); this.body.append(wrap); return; }
    if (sel !== null) { this.noteListView(wrap, sel); this.body.append(wrap); return; }
    wrap.append(el('div', 'notes__large', t('phone.notes.folders')));
    const group = el('div', 'folder-list');
    const defs: ['rules' | 'tips' | 'clues' | 'trash', string][] = [
      ['rules', t('phone.notes.folderRules')], ['tips', t('phone.notes.folderTips')], ['clues', t('phone.notes.folderClues')], ['trash', t('phone.notes.folderTrash')],
    ];
    for (const [id, label] of defs) {
      const row = button(`folder-row${id === 'trash' ? ' folder-row--dim' : ''}`, '', () => { this.noteFolder = id; this.noteSel = null; this.refresh(); });
      const fresh = id === 'rules' && this.dawnNew;
      row.append(el('span', 'folder-row__icon', ''), el('span', 'folder-row__name', label), fresh ? el('span', 'folder-row__dot', '') : el('span', ''), el('span', 'folder-row__n', String(this.folderCount(id))), phoneGlyph('back', 'pico pico--chev'));
      group.append(row);
    }
    wrap.append(group);
    if (!this.dawnRules) wrap.append(el('div', 'hint', t('phone.rulesDawnLocked')));
    this.body.append(wrap);
  }

  /** 폴더 안 목록: 큰 제목, 검색 칸, 날짜 그룹 머리말, 행(굵은 제목 · 날짜 · 첫 줄) */
  private noteListView(wrap: HTMLElement, folder: 'rules' | 'tips' | 'clues' | 'trash'): void {
    const back = button('nav-back', '', () => { this.noteFolder = null; this.refresh(); });
    back.append(phoneGlyph('back', 'pico pico--back'), el('span', '', t('phone.notes.folders')));
    const titles = { rules: t('phone.notes.folderRules'), tips: t('phone.notes.folderTips'), clues: t('phone.notes.folderClues'), trash: t('phone.notes.folderTrash') };
    const search = el('div', 'search');
    search.append(phoneGlyph('search', 'pico pico--search'), el('span', '', t('phone.notes.search')));
    wrap.append(back, el('div', 'notes__large', titles[folder]), search);
    const items = this.noteList(folder);
    if (items.length === 0) {
      wrap.append(el('div', 'hint', folder === 'clues' ? t('phone.notes.emptyClues') : folder === 'tips' ? t('phone.notes.emptyTips') : t('phone.notes.emptyTrash')));
      return;
    }
    const list = el('div', 'note-list');
    let group = '';
    for (const n of items) {
      const g = n.day === this.s.day ? t('phone.notes.today') : n.day === this.s.day - 1 ? t('phone.notes.yesterday') : t('phone.notes.earlier');
      if (g !== group) { group = g; list.append(el('div', 'note-group', g)); }
      const row = button(`note-row${n.fresh ? ' is-new' : ''}`, '', () => { this.noteSel = n.id; this.refresh(); });
      const top = el('span', 'note-row__top');
      top.append(el('span', 'note-row__title', n.title), n.fresh ? el('span', 'note-row__dot', '') : el('span', ''));
      const first = n.lines[0]?.text ?? '';
      const meta = el('span', 'note-row__meta');
      meta.append(el('span', 'note-row__date', `${t('phone.dayN', { n: n.day })} ${t(`phone.cardBook.${n.shift}`)}`), el('span', 'note-row__line', first));
      row.append(top, meta);
      list.append(row);
    }
    wrap.append(list);
    if (folder === 'rules') this.dawnNew = false;
    if (folder === 'clues') for (const m of Object.values(this.clueMeta)) m.fresh = false;
  }

  /** 메모 본문: 날짜 · 큰 제목 · 번호 목록. 6번은 찢겨 있다. 읽기 전용. */
  private noteDoc(wrap: HTMLElement, folder: 'rules' | 'tips' | 'clues' | 'trash', id: string): void {
    const items = this.noteList(folder);
    const n = items.find((x) => x.id === id);
    const back = button('nav-back', '', () => { this.noteSel = null; this.refresh(); });
    const titles = { rules: t('phone.notes.folderRules'), tips: t('phone.notes.folderTips'), clues: t('phone.notes.folderClues'), trash: t('phone.notes.folderTrash') };
    back.append(phoneGlyph('back', 'pico pico--back'), el('span', '', titles[folder]));
    wrap.append(back);
    if (!n) return;
    wrap.append(el('div', 'note-doc__date', t('phone.notes.edited', { day: t('phone.dayN', { n: n.day }), shift: t(`phone.cardBook.${n.shift}`), time: n.at })));
    wrap.append(el('div', 'note-doc__title', n.title));
    const numbered = n.lines.some((l) => l.n > 0);
    const ol = el(numbered ? 'ol' : 'div', `rules__list${n.shift === 'dawn' ? ' rules__list--dawn' : ''}`);
    for (const l of n.lines) {
      const li = el(numbered ? 'li' : 'p', l.torn ? 'torn' : '', l.text);
      if (numbered && l.n) (li as HTMLLIElement).value = l.n;
      ol.append(li);
    }
    wrap.append(ol);
  }

  private dawnRuleList(): RuleDef[] {
    return this.data.rules.filter((x) => x.day <= this.s.day);
  }

  private afternoonRules(): string[] {
    const lines = (this.data.strings as { briefing: { afternoon: { lines: string[] } } }).briefing.afternoon.lines;
    return lines.filter((x) => /^\d\./.test(x)).map((x) => x.replace(/^\d\.\s*/, ''));
  }
}

interface NoteItem {
  id: string;
  title: string;
  lines: { n: number; text: string; torn?: boolean }[];
  day: number;
  shift: 'afternoon' | 'dawn';
  at: string;
  fresh?: boolean;
}
