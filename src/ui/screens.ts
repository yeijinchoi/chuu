import type { CustomerDef, DayResult, GameData } from '../core/types';
import { button, el, t, won } from './dom';
import { sfx } from './sfx';

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

/**
 * S00: 타이틀 (SCRIPT_DAY1). 검은 화면 0.4초 → 필리그리 프레임 → 로고 → "•••" 입력 중(1.2초, phone_buzz)
 * → 「방문 일정을 말씀해 주세요.」 말풍선 → 메뉴. Space·Enter·클릭은 끝 상태로 건너뛴다.
 * 움직임을 줄이면 처음부터 끝 상태다.
 */
export function titleScreen(host: HTMLElement, o: { canResume: boolean; corrupt: boolean; trophies?: string[]; onStart: () => void; onResume: () => void }): Overlay {
  const root = el('div', 'screen screen--title');
  const frame = el('div', 'title__frame');
  const art = el('div', 'title__art');
  const logo = el('img', 'title__logo');
  logo.src = 'art/brand/logo-full.png';
  logo.alt = '';
  logo.width = 200;
  logo.height = 205;
  art.append(logo, el('span', 'title__glint'));
  const h = el('h1', 'visually-hidden', t('title.message'));
  const typing = el('div', 'title__typing');
  const typingRow = el('div', 'bubble-row bubble-row--in');
  const dots = el('div', 'bubble bubble--in bubble--typing');
  dots.setAttribute('role', 'status');
  dots.setAttribute('aria-label', t('phone.typing'));
  for (let i = 0; i < 3; i++) dots.append(el('i'));
  typingRow.append(dots);
  typing.append(typingRow);
  const msg = el('div', 'title__msg');
  const from = el('div', 'title__from', t('title.from'));
  const msgRow = el('div', 'bubble-row bubble-row--in');
  msgRow.append(el('div', 'bubble bubble--in', t('title.message')));
  const line = el('div', 'title__line'); // 시각은 말풍선 옆에 붙는다
  line.append(msgRow, el('div', 'title__time', t('title.time')));
  msg.append(from, line);
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
  if (o.trophies && o.trophies.length > 0) {
    const row = el('div', 'trophies trophies--title');
    const seen = ENDING_IDS.filter((id) => (o.trophies ?? []).includes(id));
    row.append(el('span', 'trophies__h', `${t('title.trophies')} ${seen.length}/${ENDING_IDS.length}`));
    for (const id of seen) row.append(el('span', 'trophy trophy--on', endingTitle(id)));
    menu.append(row);
  }
  frame.append(art, typing, msg, menu);
  root.append(h, frame);
  host.appendChild(root);

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // 단계는 클래스를 더하기만 한다. is-msg가 붙으면 CSS가 입력 중 말풍선을 가린다.
  const add = (c: string): void => { root.classList.add(c); };
  const timers: number[] = [];
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    timers.forEach((id) => window.clearTimeout(id));
    add('is-frame'); add('is-logo'); add('is-typing'); add('is-msg'); add('is-menu');
    start.focus();
  };
  // 시간표: 0.4 프레임 · 1.0 로고 · 1.6 입력 중(1.2초, phone_buzz) · 2.8 제목 · 3.0 메뉴
  if (reduced) finish();
  else {
    timers.push(window.setTimeout(() => add('is-frame'), 400));
    timers.push(window.setTimeout(() => add('is-logo'), 1000));
    timers.push(window.setTimeout(() => { add('is-typing'); sfx.play('phone_buzz'); }, 1600));
    timers.push(window.setTimeout(() => add('is-msg'), 2800));
    timers.push(window.setTimeout(() => finish(), 3000));
  }

  const ov: Overlay = {
    root,
    key: (e) => {
      if (!done) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { finish(); return true; }
        return true;
      }
      if (e.key === 'Enter' && document.activeElement === document.body) { o.onStart(); return true; }
      if ((e.key === 'c' || e.key === 'C') && o.canResume) { o.onResume(); return true; }
      return false;
    },
    close: () => { timers.forEach((id) => window.clearTimeout(id)); root.remove(); },
  };
  root.addEventListener('click', (e) => {
    if (!done && !(e.target as HTMLElement).closest('button')) finish();
  });
  return ov;
}

/** S00 이름 입력: 최대 6자, 기본값 정연 (strings defaultPlayerName) */
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

/**
 * RulesNote: 크림색 종이 쪽지(−2°). 새벽 쪽지는 한 단계 어두운 종이.
 * 종이는 스크롤하지 않는다: 줄을 채우다 넘치면 다음 장으로 넘긴다(장 수는 화면 크기에 맞춰 잰다).
 */
export function noteScreen(host: HTMLElement, o: { lines: string[]; dawn: boolean; action: string; onDone: () => void }): Overlay {
  const root = el('div', 'screen screen--note');
  const paper = el('div', `note${o.dawn ? ' note--dawn' : ''}`);
  const [head, ...rest] = o.lines;
  // 받는 사람("신입 씨에게")처럼 짧은 첫 줄만 큰 머리말로. 긴 안내 문장은 본문 크기로 쓴다
  const heading = el('div', (head ?? '').length <= 14 ? 'note__head' : 'note__line note__lead', head ?? '');
  const rows = rest.map((l) => {
    const bold = /^메종 뤼미에르/.test(l);
    const row = el('p', bold ? 'note__title' : /^\d+\./.test(l) ? 'note__rule' : l.startsWith('—') ? 'note__sign' : 'note__line', l);
    if (/^6\./.test(l)) row.classList.add('torn');
    return row;
  });
  const btnLabel = el('span');
  const done = button('btn note__btn', '', () => next());
  done.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), btnLabel);
  const pageNo = el('span', 'note__page');
  const hint = el('div', 'note__hint');
  hint.append(el('span', '', `[R] ${t('note.rereadHint')}`), pageNo);
  root.append(paper, hint, done);
  const ov = mount(host, root);

  let pages: HTMLElement[][] = [[heading, ...rows]];
  let page = 0;
  /** 넘치기 직전까지 한 장에 담는다. 첫 장만 머리말(받는 사람)이 있다. */
  const overflows = (): boolean => paper.scrollHeight > paper.clientHeight + 1;
  /** 줄 묶음: 수칙 제목은 그 아래 수칙·서명과 한 묶음, 나머지 줄은 한 줄씩 */
  const blocks: HTMLElement[][] = [];
  for (const r of rows) {
    const joins = r.classList.contains('note__rule') || r.classList.contains('note__sign');
    const last = blocks[blocks.length - 1];
    if (joins && last && last[0]?.classList.contains('note__title')) last.push(r);
    else blocks.push([r]);
  }
  /** 넘치기 직전까지 한 장에 담는다. 묶음이 안 들어가면 통째로 다음 장, 묶음이 한 장보다 길면 줄 단위로 나눈다. */
  const paginate = (): void => {
    const out: HTMLElement[][] = [];
    let cur: HTMLElement[] = [heading];
    const newPage = (): void => { out.push(cur); cur = []; paper.replaceChildren(); };
    paper.replaceChildren(heading);
    for (const block of blocks) {
      paper.append(...block);
      if (!overflows()) { cur.push(...block); continue; }
      block.forEach((r) => r.remove());
      const hasBody = cur.some((x) => x !== heading);
      if (hasBody) {
        newPage();
        paper.append(...block);
        if (!overflows()) { cur.push(...block); continue; }
        block.forEach((r) => r.remove());
      }
      // 한 장에도 안 들어가는 묶음: 줄 단위로. 서명은 바로 앞 줄과 붙여서 혼자 넘어가지 않게 한다
      const units: HTMLElement[][] = [];
      for (const r of block) {
        const prev = units[units.length - 1];
        if (r.classList.contains('note__sign') && prev) prev.push(r);
        else units.push([r]);
      }
      for (const u of units) {
        paper.append(...u);
        if (overflows() && cur.some((x) => x !== heading)) { u.forEach((r) => r.remove()); newPage(); paper.append(...u); }
        cur.push(...u);
      }
    }
    out.push(cur);
    pages = out.filter((pg) => pg.length > 0);
    page = Math.min(page, pages.length - 1);
    show();
  };
  const show = (): void => {
    paper.replaceChildren(...(pages[page] ?? []));
    paper.classList.toggle('note--cont', page > 0);
    const last = page === pages.length - 1;
    btnLabel.textContent = ` ${last ? o.action : t('note.nextPage')}`;
    pageNo.textContent = pages.length > 1 ? ` · ${page + 1} / ${pages.length}` : '';
    done.focus();
  };
  const next = (): void => {
    if (page < pages.length - 1) { page++; sfx.play('paper_turn'); show(); return; }
    o.onDone();
  };
  const prev = (): void => { if (page > 0) { page--; show(); } };
  paginate();
  // 손글씨 글꼴이 늦게 오면 줄 높이가 바뀌므로 다시 잰다
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && !fonts.check('16px GameHand')) void fonts.load('16px GameHand').then(() => { if (root.isConnected) paginate(); });
  ov.key = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); return true; }
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); prev(); return true; }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (page < pages.length - 1) next(); return true; }
    return false;
  };
  return ov;
}

/** S14 정산서(결재 서류). 왼쪽 오후, 오른쪽 새벽, 아래 단골·평정심, 등급 도장 */
export function resultsScreen(host: HTMLElement, o: { result: DayResult; data: GameData; day: number; saved: boolean | null; clock: string; onNext: () => void; onRestart: () => void }): Overlay {
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
  const teaser = el('p', 'ledger__teaser', t(`results.teasers.${o.day}`));
  const thought = el('p', 'ledger__thought', `(${t('thoughts.results')})`);
  const save = el('div', `ledger__save${o.saved === false ? ' ledger__save--fail' : ''}`,
    o.saved === null ? '' : o.saved ? t('toast.saved', { clock: o.clock }) : t('toast.saveFail'));
  const next = button('btn', '', o.onNext);
  next.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${t('results.nextDay', { n: o.day + 1 })}`));
  const restart = button('btn', '', o.onRestart);
  restart.append(el('span', 'btn__key', '[R]'), document.createTextNode(` ${t('results.restart')}`));
  const menu = el('div', 'screen-menu');
  menu.append(next, restart);
  sheet.append(cols, foot, comment, teaser, thought, save, menu, stamp);
  root.append(sheet);
  const ov = mount(host, root);
  next.focus();
  ov.key = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); o.onNext(); return true; }
    if (e.key === 'r' || e.key === 'R') { o.onRestart(); return true; }
    return false;
  };
  return ov;
}

/** S-BAD: 마감 시간입니다 */
export function endingScreen(host: HTMLElement, o: { onRestart: () => void; onLoad: (() => void) | null }): Overlay {
  const root = el('div', 'screen screen--ending');
  root.append(el('h2', 'ending__title', t('ending.title')), el('p', 'ending__text', t('ending.nextDay')));
  const menu = el('div', 'screen-menu');
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

/** 3일차 엔딩: 진열 · 퇴사 · 단골의 값. 도장(본 엔딩)과 처음부터 버튼 */
export const ENDING_IDS = ['display', 'resign', 'regulars', 'sisterDoor', 'twinDisplay', 'topSeller', 'tenure', 'emptyBook', 'marsh', 'baek', 'faceless', 'bad'] as const;
const endingTitle = (id: string): string => t(id === 'bad' ? 'ending.bad.title' : `ending.${id}.title`);

export function finalEndingScreen(host: HTMLElement, o: { ending: string; trophies: string[]; onRestart: () => void }): Overlay {
  const root = el('div', `screen screen--ending screen--final screen--final-${o.ending}`);
  root.append(el('h2', 'ending__title', t(`ending.${o.ending}.title`)), el('p', 'ending__text', t(`ending.${o.ending}.final`)));
  const stamps = el('div', 'trophies');
  stamps.setAttribute('aria-label', t('ending.trophies'));
  const seen = ENDING_IDS.filter((id) => o.trophies.includes(id)).length;
  root.append(el('p', 'trophies__count', t('ending.trophyCount', { n: seen, total: ENDING_IDS.length })));
  for (const id of ENDING_IDS) {
    const have = o.trophies.includes(id);
    stamps.append(el('span', `trophy${have ? ' trophy--on' : ''}${id === o.ending ? ' trophy--now' : ''}`, have ? endingTitle(id) : '？'));
  }
  const menu = el('div', 'screen-menu');
  const a = button('btn', '', o.onRestart);
  a.append(el('span', 'btn__key', `[${t('title.keyEnter')}]`), document.createTextNode(` ${t('ending.again')}`));
  menu.append(a);
  root.append(stamps, menu);
  const ov = mount(host, root);
  a.focus();
  ov.key = (e) => { if (e.key === 'Enter') { e.preventDefault(); o.onRestart(); return true; } return false; };
  return ov;
}
