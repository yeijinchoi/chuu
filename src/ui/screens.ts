import type { CustomerDef, DayResult, GameData } from '../core/types';
import { button, el, t, tList, won } from './dom';

export interface Overlay {
  root: HTMLElement;
  /** 키를 소비했으면 true */
  key(e: KeyboardEvent): boolean;
  close(): void;
}

function mount(host: HTMLElement, root: HTMLElement): Overlay {
  host.appendChild(root);
  return { root, key: () => false, close: () => root.remove() };
}

/** S00: 타이틀. 검은 화면, 로고, [Enter] 출근하기 · [C] 이어하기 */
export function titleScreen(host: HTMLElement, o: { canResume: boolean; corrupt: boolean; onStart: () => void; onResume: () => void }): Overlay {
  const root = el('div', 'screen screen--title');
  const logo = el('h1', 'title__logo');
  logo.setAttribute('aria-label', t('title.logo'));
  for (const line of tList('title.logoLines')) logo.append(el('span', 'title__line', line));
  logo.append(el('span', 'title__glint'));
  const sub = el('div', 'title__sub', t('title.sub'));
  const menu = el('div', 'title__menu');
  const start = button('btn', '', o.onStart);
  start.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${t('title.start')}`));
  menu.append(start);
  if (o.canResume) {
    const c = button('btn', '', o.onResume);
    c.append(el('span', 'btn__key', `[${t('title.keyC')}]`), document.createTextNode(` ${t('title.resume')}`));
    menu.append(c);
  }
  if (o.corrupt) menu.append(el('div', 'title__warn', t('title.corrupt')));
  root.append(logo, sub, menu);
  const ov = mount(host, root);
  start.focus();
  ov.key = (e) => {
    if (e.key === 'Enter' && document.activeElement === document.body) { o.onStart(); return true; }
    if ((e.key === 'c' || e.key === 'C') && o.canResume) { o.onResume(); return true; }
    return false;
  };
  return ov;
}

/** S00 이름 입력: 최대 6자, 기본값 신입 */
export function nameScreen(host: HTMLElement, onDone: (name: string) => void): Overlay {
  const root = el('div', 'screen screen--name');
  const box = el('div', 'panel name');
  const lbl = el('label', 'name__label', t('title.nameIntro'));
  const input = el('input', 'name__input');
  input.type = 'text';
  input.maxLength = 6;
  input.value = t('defaultPlayerName');
  input.id = 'name-input';
  lbl.htmlFor = input.id;
  const ok = button('btn', '', () => onDone(input.value.trim() || t('defaultPlayerName')));
  ok.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${t('title.confirm')}`));
  box.append(lbl, input, ok);
  root.append(box);
  const ov = mount(host, root);
  input.focus();
  input.select();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onDone(input.value.trim() || t('defaultPlayerName')); }
  });
  return ov;
}

/** RulesNote: 크림색 종이 쪽지(−2°). 새벽 쪽지는 한 단계 어두운 종이. */
export function noteScreen(host: HTMLElement, o: { lines: string[]; dawn: boolean; action: string; onDone: () => void }): Overlay {
  const root = el('div', 'screen screen--note');
  const paper = el('div', `note${o.dawn ? ' note--dawn' : ''}`);
  const [head, ...rest] = o.lines;
  const heading = el('div', 'note__head', head ?? '');
  paper.append(heading);
  for (const l of rest) {
    const bold = /^메종 뤼미에르/.test(l);
    const row = el('p', bold ? 'note__title' : /^\d\./.test(l) ? 'note__rule' : l.startsWith('—') ? 'note__sign' : 'note__line', l);
    if (/^6\./.test(l)) row.classList.add('torn');
    paper.append(row);
  }
  const done = button('btn note__btn', '', o.onDone);
  done.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${o.action}`));
  root.append(paper, el('div', 'note__hint', `[R] ${t('note.rereadHint')}`), done);
  const ov = mount(host, root);
  done.focus();
  ov.key = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onDone(); return true; }
    return false;
  };
  return ov;
}

/** S14 정산서(결재 서류). 왼쪽 오후, 오른쪽 새벽, 아래 단골·평정심, 등급 도장 */
export function resultsScreen(host: HTMLElement, o: { result: DayResult; data: GameData; saved: boolean | null; clock: string; onRestart: () => void }): Overlay {
  const r = o.result;
  const root = el('div', 'screen screen--results');
  const sheet = el('div', 'panel ledger');
  sheet.append(el('h2', 'ledger__title', t('results.title')));
  const cols = el('div', 'ledger__cols');
  const left = el('div', 'ledger__col');
  left.append(el('h3', 'ledger__h', t('results.afternoon')));
  const kv = (box: HTMLElement, k: string, v: string, cls = ''): void => {
    const row = el('div', 'kv');
    row.append(el('span', 'kv__k', k), el('span', `kv__v num ${cls}`, v));
    box.append(row);
  };
  kv(left, t('phone.revenue'), won(r.revenue), 'money');
  kv(left, t('results.sales'), String(r.salesCount));
  kv(left, t('results.manner'), String(r.mannerSlips));
  const right = el('div', 'ledger__col');
  right.append(el('h3', 'ledger__h', t('results.dawn')));
  if (r.dawnLedger.length === 0) right.append(el('div', 'empty', t('results.noDawn')));
  for (const l of r.dawnLedger) kv(right, l.label, won(l.amount), 'money');
  if (r.dawnLedger.length) kv(right, t('results.dawnTotal'), won(r.dawnLedgerTotal), 'money');
  kv(right, t('results.violations'), String(r.violations));
  cols.append(left, el('div', 'ledger__rule'), right);
  const foot = el('div', 'ledger__foot');
  const names = r.newRegulars.map((id) => (o.data.customers.find((c) => c.id === id) as CustomerDef | undefined)?.name ?? id);
  const reg = el('div', 'ledger__line');
  reg.append(el('span', 'kv__k', t('results.regulars')), el('span', 'kv__v', names.length ? names.join(', ') : t('results.noRegulars')));
  const misc = el('div', 'ledger__line');
  misc.append(el('span', 'kv__k', `${t('results.thanks')} ${r.thanksSent} · ${t('results.composure')} ${r.composure}`));
  foot.append(reg, misc);
  const stamp = el('div', 'stamp', r.grade);
  stamp.setAttribute('role', 'img');
  stamp.setAttribute('aria-label', `${t('results.grade')} ${r.grade}`);
  const comment = el('p', 'ledger__comment', r.comment);
  const teaser = el('p', 'ledger__teaser', t('results.teaser'));
  const thought = el('p', 'ledger__thought', `(${t('thoughts.results')})`);
  const save = el('div', `ledger__save${o.saved === false ? ' ledger__save--fail' : ''}`,
    o.saved === null ? '' : o.saved ? t('toast.saved', { clock: o.clock }) : t('toast.saveFail'));
  const restart = button('btn', '', o.onRestart);
  restart.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${t('results.restart')}`));
  sheet.append(cols, foot, comment, teaser, thought, save, restart, stamp);
  root.append(sheet);
  const ov = mount(host, root);
  restart.focus();
  ov.key = (e) => { if (e.key === 'Enter') { e.preventDefault(); o.onRestart(); return true; } return false; };
  return ov;
}

/** S-BAD: 마감 시간입니다 */
export function endingScreen(host: HTMLElement, o: { onRestart: () => void; onLoad: (() => void) | null }): Overlay {
  const root = el('div', 'screen screen--ending');
  root.append(el('h2', 'ending__title', t('ending.title')), el('p', 'ending__text', t('ending.nextDay')));
  const menu = el('div', 'title__menu');
  const a = button('btn', '', o.onRestart);
  a.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${t('ending.restart')}`));
  menu.append(a);
  if (o.onLoad) {
    const b = button('btn', '', o.onLoad);
    b.append(el('span', 'btn__key', `[${t('title.keyC')}]`), document.createTextNode(` ${t('ending.load')}`));
    menu.append(b);
  }
  root.append(menu);
  const ov = mount(host, root);
  a.focus();
  ov.key = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); o.onRestart(); return true; }
    if ((e.key === 'c' || e.key === 'C') && o.onLoad) { o.onLoad(); return true; }
    return false;
  };
  return ov;
}
