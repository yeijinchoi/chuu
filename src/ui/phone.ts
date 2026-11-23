import type { Action, ClientCard, CustomerDef, GameData, Shift } from '../core/types';
import type { Game } from '../core/game';
import { renderTemplate } from '../core/texting';
import { button, el, t, tList, won } from './dom';

export type PhoneTab = 'chat' | 'book' | 'cards' | 'rules';
const TABS: PhoneTab[] = ['chat', 'book', 'cards', 'rules'];

interface Msg { dir: 'in' | 'out'; from: string; text: string }

export interface PhoneHost { game: Game; data: GameData; dispatch(a: Action): void }

/** 업무폰 화면: 상태바, 매출 줄, 탭 4개. 문자 영업·애프터케어·04:44는 모두 여기서 일어난다. */
export class Phone {
  tab: PhoneTab = 'book';
  private feed: Msg[] = [];
  private replies = new Map<string, string>();
  private selected: string | null = null;
  private template: string | null = null;
  private dawnRules = false;
  private unread = new Set<PhoneTab>();
  private readonly status = el('div', 'phone__status');
  private readonly money = el('div', 'phone__money');
  private readonly tabs = el('div', 'phone__tabs');
  private readonly body = el('div', 'phone__body');
  private readonly foot = el('div', 'phone__foot');

  constructor(root: HTMLElement, private readonly host: PhoneHost) {
    root.append(this.status, this.money, el('div', 'divider'), this.tabs, this.body, this.foot);
    this.tabs.setAttribute('role', 'tablist');
    this.refresh();
  }

  private get s() { return this.host.game.getState(); }

  unlockDawnRules(): void { this.dawnRules = true; }

  addMessage(dir: 'in' | 'out', from: string, text: string): void {
    this.feed.push({ dir, from, text });
    if (dir === 'in') {
      this.replies.set(from, text);
      if (this.tab !== 'chat') this.unread.add('chat');
    }
    this.refresh();
  }

  openTab(tab: PhoneTab, focus = false): void {
    this.tab = tab;
    this.unread.delete(tab);
    this.refresh();
    if (focus) this.tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  pulse(tab: PhoneTab): void {
    if (this.tab !== tab) { this.unread.add(tab); this.refresh(); }
  }

  /** 폰 전체 다시 그리기 (상태가 바뀔 때마다) */
  refresh(): void {
    this.renderStatus();
    this.renderTabs();
    this.renderBody();
    this.renderFoot();
  }

  private renderStatus(): void {
    const s = this.s;
    this.status.replaceChildren();
    const left = el('span', 'phone__day', `${t('hud.day')} ${s.day}`);
    const clock = el('span', 'phone__clock num', s.clock);
    const bat = el('span', 'battery');
    bat.setAttribute('role', 'img');
    bat.setAttribute('aria-label', `${t('phone.battery')} ${s.composure}`);
    const filled = Math.ceil(s.composure / 10);
    bat.dataset.level = s.composure >= 70 ? 'hi' : s.composure >= 40 ? 'mid' : 'low';
    for (let i = 0; i < 10; i++) bat.append(el('i', i < filled ? 'cell cell--on' : 'cell'));
    this.status.append(left, clock, bat);
    this.money.replaceChildren();
    this.money.append(el('span', 'num', `₩ ${s.revenue.toLocaleString('en-US')}`));
    const reg = Object.values(s.cards).filter((c) => c.tier !== 'new' && c.tier !== 'lost').length;
    this.money.append(el('span', 'phone__sub', `${t('phone.regularsCount')} ${reg}`));
    if (s.dawnLedger.length > 0) this.money.append(el('span', 'phone__sub', `${t('phone.ledgerCount')} ${s.dawnLedger.length}`));
  }

  private renderTabs(): void {
    this.tabs.replaceChildren();
    for (const id of TABS) {
      const b = button('tab', t(`phone.tabs.${id}`), () => this.openTab(id));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === this.tab));
      if (this.unread.has(id)) b.dataset.dot = '1';
      this.tabs.append(b);
    }
  }

  private renderBody(): void {
    this.body.replaceChildren();
    this.body.dataset.tab = this.tab;
    const fn = { chat: () => this.chat(), book: () => this.book(), cards: () => this.cards(), rules: () => this.rules() }[this.tab];
    fn();
  }

  private renderFoot(): void {
    this.foot.replaceChildren();
    const p = this.s.phase;
    if (p.kind === 'texting') {
      this.foot.append(this.counter(), button('phone-btn phone-btn--primary', t('phone.finishTexting'), () => this.host.dispatch({ type: 'finishTexting' })));
    } else if (p.kind === 'aftercare') {
      const d = this.host.data.days[this.s.day] ?? this.host.data.days[1];
      this.foot.append(
        el('div', 'phone__counter', t('phone.aftercareLeft', { left: this.s.aftercareRemaining, total: d?.aftercare.perShift ?? 0 })),
        button('phone-btn phone-btn--primary', t('phone.finishAftercare'), () => this.host.dispatch({ type: 'finishAftercare' })),
      );
    }
  }

  private counter(): HTMLElement {
    const s = this.s;
    const shift = s.shift;
    const d = this.host.data.days[s.day] ?? this.host.data.days[1];
    return el('div', 'phone__counter', t(shift === 'dawn' ? 'phone.textsLeftDawn' : 'phone.textsLeft', {
      left: s.texting[shift].remaining, total: d?.texting[shift].total ?? 0, sales: d?.texting[shift].sales ?? 0,
    }));
  }

  // ---------------------------------------------------------------- 문자

  private chat(): void {
    const log = el('div', 'chat');
    if (this.feed.length === 0) log.append(el('div', 'empty', t('phone.noChat')));
    for (const m of this.feed.slice(-14)) {
      const row = el('div', `bubble-row bubble-row--${m.dir}`);
      if (m.dir === 'in') row.append(el('div', 'bubble__from', m.from));
      row.append(el('div', `bubble bubble--${m.dir}`, m.text));
      log.append(row);
    }
    this.body.append(log);
    // 답장 선택지
    for (const id of Object.keys(this.s.pendingReplies)) {
      const c = this.host.data.customers.find((x) => x.id === id);
      const chat = c?.care.chat;
      if (!c || !chat) continue;
      const box = el('div', 'reply');
      chat.options.forEach((label, i) => {
        box.append(button('reply__opt', label, () => this.host.dispatch({ type: 'chooseReply', customerId: id, option: i === 0 ? 0 : 1 })));
      });
      this.body.append(box);
    }
    queueMicrotask(() => { log.scrollTop = log.scrollHeight; });
  }

  // ---------------------------------------------------------------- 명부 / 애프터케어

  private book(): void {
    const p = this.s.phase;
    if (p.kind === 'aftercare') { this.served(); return; }
    const shift: Shift = this.s.shift;
    const list = el('div', 'contacts');
    if (p.kind === 'texting') list.append(el('div', 'hint', t('phone.pickContact')));
    for (const c of this.host.data.contacts.filter((x) => x.book === shift)) {
      const row = el('div', 'contact');
      const head = button('contact__head', '', () => this.pickContact(c.id));
      head.append(el('span', 'contact__name', c.name));
      const chip = this.chipFor(c.id, c.customerId);
      if (chip) head.append(el('span', `chip-state chip-state--${chip}`, t(`phone.chip.${chip}`)));
      head.setAttribute('aria-expanded', String(this.selected === c.id));
      row.append(head);
      if (c.address) row.append(el('div', 'contact__addr', c.address));
      const memo = el('div', 'contact__memo', c.memo);
      row.append(memo);
      if (c.memoStruck) row.append(el('div', 'contact__memo contact__memo--struck', c.memoStruck));
      const reply = this.replies.get(c.name);
      if (reply) row.append(el('div', 'bubble bubble--in bubble--small', reply));
      if (this.selected === c.id && p.kind === 'texting') row.append(this.compose(c.id));
      list.append(row);
    }
    this.body.append(list);
  }

  private chipFor(contactId: string, customerId: string | null): 'sent' | 'coming' | 'no' | '' {
    const sent = this.s.texting[this.s.shift].sent;
    if (!(contactId in sent)) return '';
    if (customerId && this.s.visitors[customerId]) return 'coming';
    return 'no';
  }

  private pickContact(id: string): void {
    if (this.s.phase.kind !== 'texting') return;
    this.selected = this.selected === id ? null : id;
    this.template = null;
    this.refresh();
  }

  private compose(contactId: string): HTMLElement {
    const box = el('div', 'compose');
    const sent = contactId in this.s.texting[this.s.shift].sent;
    const acts = this.host.game.availableActions().filter((a): a is Extract<Action, { type: 'sendText' }> => a.type === 'sendText' && a.contactId === contactId);
    const contact = this.host.data.contacts.find((c) => c.id === contactId);
    const templates = this.host.data.templates.sales.filter((x) => x.shift === this.s.shift);
    if (sent) { box.append(el('div', 'hint', t('phone.chip.sent'))); return box; }
    const group = el('div', 'radios');
    group.setAttribute('role', 'radiogroup');
    for (const tpl of templates) {
      const ok = acts.some((a) => a.template === tpl.id);
      const r = button('radio', tpl.name, () => { this.template = tpl.id; this.refresh(); });
      r.setAttribute('role', 'radio');
      r.setAttribute('aria-checked', String(this.template === tpl.id));
      if (!ok) r.disabled = true;
      group.append(r);
    }
    box.append(group);
    const picked = templates.find((x) => x.id === this.template);
    if (picked && contact) {
      box.append(el('div', 'bubble bubble--out bubble--small', renderTemplate(picked.text, { name: this.s.playerName, contact: contact.name })));
      box.append(button('phone-btn', t('phone.sendLabel'), () => {
        this.addMessage('out', contact.name, renderTemplate(picked.text, { name: this.s.playerName, contact: contact.name }));
        this.selected = null;
        this.template = null;
        this.host.dispatch({ type: 'sendText', contactId, template: picked.id as never });
      }));
    }
    return box;
  }

  private served(): void {
    const s = this.s;
    const shift = s.shift;
    const wrap = el('div', 'contacts');
    wrap.append(el('div', 'phone__h', t('phone.served')));
    const acts = this.host.game.availableActions();
    const people = this.host.data.customers.filter((c) => c.shift === shift && s.cards[c.id]?.lastVisitDay === s.day);
    if (people.length === 0) wrap.append(el('div', 'empty', t('phone.noServed')));
    for (const c of people) {
      const card = s.cards[c.id] as ClientCard;
      const sold = card.purchases.some((x) => x.day === s.day);
      const row = el('div', 'contact');
      const head = el('div', 'contact__head contact__head--static');
      head.append(el('span', 'contact__name', c.name), el('span', `chip-state chip-state--${sold ? 'coming' : 'no'}`, t(sold ? 'phone.soldMark' : 'phone.failMark')));
      row.append(head);
      if (c.care.memo && shift === 'dawn') row.append(el('div', 'contact__memo', c.care.memo));
      const thanks = acts.find((a) => a.type === 'sendCare' && a.customerId === c.id && (a.template === 'thanks' || a.template === 'dawn_thanks'));
      if (card.lastThanksDay === s.day) row.append(el('div', 'hint', t('phone.thanksDone')));
      else if (thanks) row.append(button('phone-btn phone-btn--small', t('phone.thanks'), () => {
        const tpl = this.host.data.templates.care.find((x) => x.id === (thanks as Extract<Action, { type: 'sendCare' }>).template);
        const prod = card.purchases.length ? this.host.data.products.find((p) => p.id === card.purchases[card.purchases.length - 1]?.productId) : undefined;
        if (tpl) this.addMessage('out', c.name, renderTemplate(tpl.text, { customer: c.name, product: prod?.name }));
        this.host.dispatch(thanks);
      }));
      if (c.care.redBoxCare && acts.some((a) => a.type === 'placeRedBox')) {
        row.append(button('phone-btn phone-btn--small', t('phone.placeRedBox'), () => this.host.dispatch({ type: 'placeRedBox' })));
      }
      wrap.append(row);
    }
    this.body.append(wrap);
  }

  // ---------------------------------------------------------------- 고객 카드

  private cards(): void {
    const s = this.s;
    const wrap = el('div', 'cards');
    const list = Object.values(s.cards).sort((a, b) => (b.lastVisitDay ?? 0) - (a.lastVisitDay ?? 0));
    if (list.length === 0) wrap.append(el('div', 'empty', t('phone.cardEmpty')));
    for (const card of list) {
      const c = this.host.data.customers.find((x) => x.id === card.customerId) as CustomerDef;
      const box = el('div', 'card-sheet');
      box.dataset.tier = card.tier;
      const head = el('div', 'card-sheet__head');
      head.append(el('span', 'card-sheet__name', c.name), el('span', 'card-sheet__tier', `${t(`phone.cardBook.${card.book}`)} · ${t(`tier.${card.tier}`)}`));
      box.append(head);
      const rows: [string, string | undefined][] = [
        ['category', card.wants ?? (card.category ? t(`categories.${card.category}`) : undefined)],
        ['occasion', card.occasion?.label],
        ['budget', card.budget !== undefined ? won(card.budget) : undefined],
        ['color', card.color ? t(`display.colors.${card.color}`) : undefined],
        ['notes', card.notes.length ? card.notes.join(' · ') : undefined],
        ['purchases', card.purchases.length ? card.purchases.map((x) => this.host.data.products.find((p) => p.id === x.productId)?.name ?? x.productId).join(', ') : undefined],
      ];
      for (const [k, v] of rows) {
        const r = el('div', 'kv');
        r.append(el('span', 'kv__k', t(`phone.cardFields.${k}`)));
        r.append(el('span', v === undefined ? 'kv__v kv__v--unknown' : 'kv__v', v ?? t('unknown')));
        box.append(r);
      }
      wrap.append(box);
    }
    this.body.append(wrap);
  }

  // ---------------------------------------------------------------- 수칙

  private rules(): void {
    const wrap = el('div', 'rules');
    wrap.append(el('div', 'phone__h', t('phone.rulesAfternoon')));
    const ol = el('ol', 'rules__list');
    for (const l of tList('briefing.afternoon.lines').filter((x) => /^\d\./.test(x))) ol.append(el('li', '', l.replace(/^\d\.\s*/, '')));
    wrap.append(ol);
    wrap.append(el('div', 'divider'));
    wrap.append(el('div', 'phone__h', t('phone.rulesDawn')));
    if (!this.dawnRules) wrap.append(el('div', 'empty', t('phone.rulesDawnLocked')));
    else {
      const dl = el('ol', 'rules__list rules__list--dawn');
      for (const r of this.host.data.rules.filter((x) => x.day <= this.s.day)) {
        const li = el('li', r.id === 6 ? 'torn' : '', r.text);
        li.value = r.id;
        dl.append(li);
      }
      wrap.append(dl);
    }
    this.body.append(wrap);
  }
}
