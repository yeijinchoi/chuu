import '../ui/styles/fonts.css';
import '../ui/styles/tokens.css';
import './editor.css';
import { publishChanges, type PublishResult } from './github';
import { LIVE, loadPatch, PATCH_KEY, savePatch } from './store';
import { buildScript, type DayInfo, type ScriptChapter, type ScriptLine } from './script';
import day1 from '../data/day1.json';
import day2 from '../data/day2.json';
import day3 from '../data/day3.json';
import day4 from '../data/day4.json';
import day5 from '../data/day5.json';
import {
  applyPatch, collectAll, FILE_IDS, FILE_NAMES, isNarration, labelOf, missingPlaceholders, splitId,
  type DataSet, type Label, type Leaf, type Patch,
} from './textmap';

/** 편집기가 보는 원문은 로드 직후 복사본이다(게임용 LIVE 객체는 건드리지 않는다). */
const ORIGINAL: DataSet = JSON.parse(JSON.stringify(LIVE)) as DataSet;

interface Row {
  id: string;
  leaf: Leaf;
  label: Label;
  /** 검색용 소문자 문자열 */
  hay: string;
}

const LEAVES = collectAll(ORIGINAL);
const ROWS: Row[] = LEAVES.map((leaf) => {
  const label = labelOf(leaf, ORIGINAL);
  const id = `${leaf.file}/${leaf.path.join('/')}`;
  return { id, leaf, label, hay: `${label.group} ${label.section} ${label.name} ${id} ${leaf.text}`.toLowerCase() };
});
/** 손님 묶음 안에서는 자주 고치는 글(첫 대사·재방문)부터 보여 준다. 나머지는 파일 순서를 지킨다. */
const SECTION_RANK: Record<string, number> = {
  '첫 방문 대사': 0, '재방문 2회째': 1, '재방문 3회째': 2, '상황별 반응': 3, '대접(탄산수·초콜릿)': 4, '수칙 위반': 5,
  '판매 뒤 사건': 6, '방문 직후 사건': 7, '선택 대화': 8, '관리 문자 답장': 9, '관리': 10, '새벽 관리 금기': 11, '기본': 12,
};
const rank = (r: Row): number => (r.label.group.startsWith('손님') ? SECTION_RANK[r.label.section] ?? 13 : 0);
const ORDER = new Map(ROWS.map((r, i) => [r.id, i]));
ROWS.sort((a, b) => (a.label.group === b.label.group ? rank(a) - rank(b) : 0) || (ORDER.get(a.id) as number) - (ORDER.get(b.id) as number));
const ROW_BY_ID = new Map(ROWS.map((r) => [r.id, r]));

/** 대본 보기: n일차 → 장면 → 게임에 나오는 순서대로 */
const SCRIPT = buildScript(ORIGINAL, [day1, day2, day3, day4, day5] as unknown as DayInfo[], LEAVES);
const REST_KEY = 'rest';
const chapterIds = (c: ScriptChapter): string[] => c.scenes.flatMap((s) => s.lines.map((l) => l.id));
const MODE_KEY = 'closing-time.editor.mode';
const savedMode = ((): 'script' | 'list' => { try { return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'script'; } catch { return 'script'; } })();

// ------------------------------------------------------------ 상태
const state = {
  patch: {} as Patch,
  /** 저장소 상태: ok = 저장됨, failed = 저장 실패(내려받아 두어야 함), unknown = 아직 저장한 적 없음 */
  save: 'unknown' as 'unknown' | 'ok' | 'failed',
  savedAt: '',
  group: null as string | null,
  mode: savedMode,
  chapter: 'day1',
  query: '',
  changedOnly: false,
  limit: 60,
  loadError: null as null | 'corrupt' | 'blocked',
};

const stored = loadPatch();
let cleaned = 0;
if (stored.ok) {
  // 이미 게시돼 사이트 원문이 된 수정(원문과 같아진 것)은 목록에서 정리한다
  for (const [id, text] of Object.entries(stored.patch)) {
    const r = ROW_BY_ID.get(id);
    if (!r) { cleaned++; continue; }
    if (r.leaf.text === text) { cleaned++; continue; }
    state.patch[id] = text;
  }
  if (cleaned > 0) savePatch(state.patch);
} else state.loadError = stored.reason;

// ------------------------------------------------------------ DOM 도우미
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label: string, cls: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', on);
  return b;
}

const isChanged = (id: string): boolean => id in state.patch;
const currentText = (r: Row): string => state.patch[r.id] ?? r.leaf.text;

// ------------------------------------------------------------ 저장
let saveTimer = 0;
function persist(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const ok = savePatch(state.patch);
    state.save = ok ? 'ok' : 'failed';
    if (ok) state.savedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    paintStatus();
  }, 250);
}

function setText(r: Row, text: string): void {
  if (text === r.leaf.text) delete state.patch[r.id];
  else state.patch[r.id] = text;
  persist();
  paintCounts();
}

// ------------------------------------------------------------ 골격
const app = document.getElementById('app') as HTMLElement;
const top = el('header', 'ed-top');
const side = el('nav', 'ed-side');
const main = el('main', 'ed-main');
const toast = el('div', 'ed-toast');
toast.setAttribute('role', 'status');
app.append(top, side, main, toast);

let toastTimer = 0;
function say(text: string, kind: 'ok' | 'warn' = 'ok'): void {
  toast.textContent = text;
  toast.dataset.kind = kind;
  toast.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-on'), 3200);
}

// ------------------------------------------------------------ 위쪽 바
const title = el('h1', 'ed-title', '문구 편집기');
const search = el('input', 'ed-search');
search.type = 'search';
search.placeholder = '검색: 대사·경로·손님 이름';
search.setAttribute('aria-label', '문구 검색');
search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); state.limit = 60; if (state.mode === 'script') renderSide(); renderList(); });
const changedToggle = el('label', 'ed-check');
const changedBox = el('input');
changedBox.type = 'checkbox';
changedBox.addEventListener('change', () => { state.changedOnly = changedBox.checked; state.limit = 60; if (state.mode === 'script') renderSide(); renderList(); });
changedToggle.append(changedBox, el('span', '', '수정한 것만'));
const status = el('div', 'ed-status');
status.setAttribute('aria-live', 'polite');

const actions = el('div', 'ed-actions');
const previewLink = el('a', 'ed-btn ed-btn--accent', '게임에서 미리보기');
previewLink.href = './?edited=1';
previewLink.target = '_blank';
previewLink.rel = 'noopener';
previewLink.title = '이 브라우저에 저장된 수정 내용으로 게임을 새 탭에서 엽니다';
const publishBtn = btn('게임에 반영(게시)', 'ed-btn ed-btn--primary', () => openPublish());
publishBtn.title = '수정한 글을 저장소의 게임 데이터에 올려, 배포된 게임 전체에 반영합니다';
actions.append(
  publishBtn,
  previewLink,
  btn('패치 복사', 'ed-btn', () => void copyPatch()),
  btn('패치 내려받기', 'ed-btn', downloadPatch),
  btn('수정된 JSON 내려받기', 'ed-btn', downloadFiles),
  btn('불러오기', 'ed-btn', () => importDialog.showModal()),
  btn('모두 되돌리기', 'ed-btn ed-btn--danger', resetAll),
);
const modeSeg = el('div', 'ed-seg');
modeSeg.setAttribute('role', 'group');
modeSeg.setAttribute('aria-label', '보기');
const modeBtns = (['script', 'list'] as const).map((m) => {
  const b = btn(m === 'script' ? '대본 보기' : '목록 보기', 'ed-seg__btn', () => {
    state.mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* 기억 못 해도 된다 */ }
    paintMode();
    renderSide();
    renderList();
  });
  b.dataset.mode = m;
  return b;
});
modeSeg.append(...modeBtns);
function paintMode(): void { for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); }
top.append(title, modeSeg, search, changedToggle, status, actions);

function paintStatus(): void {
  const n = Object.keys(state.patch).length;
  status.replaceChildren();
  status.append(el('b', '', `수정 ${n}개`));
  const s = el('span', `ed-status__save ed-status__save--${state.save}`);
  if (state.save === 'ok') s.textContent = `이 브라우저에 저장됨 · ${state.savedAt}`;
  else if (state.save === 'failed') s.textContent = '저장하지 못했어요 — 지금 "패치 내려받기"로 따로 보관하세요';
  else s.textContent = n > 0 ? '저장된 수정 내용을 불러왔어요' : '아직 수정한 글이 없어요';
  status.append(s);
}

// ------------------------------------------------------------ 사이드바
interface Group { name: string; ids: string[] }
const GROUPS: Group[] = (() => {
  const m = new Map<string, string[]>();
  for (const r of ROWS) {
    const list = m.get(r.label.group) ?? [];
    list.push(r.id);
    m.set(r.label.group, list);
  }
  const kindOf = (n: string): number => (n.startsWith('손님') ? 0 : n.startsWith('UI') ? 2 : 1);
  return [...m].map(([name, ids]) => ({ name, ids })).sort((a, b) => kindOf(a.name) - kindOf(b.name));
})();

function renderSide(): void {
  side.replaceChildren();
  if (state.mode === 'script') { renderScriptSide(); return; }
  const all = btn('', 'ed-group', () => { state.group = null; state.limit = 60; renderSide(); renderList(); });
  all.dataset.on = String(state.group === null);
  all.append(el('span', 'ed-group__name', '전체'), el('span', 'ed-group__n', String(ROWS.length)));
  side.append(all);
  let lastKind = '';
  for (const g of GROUPS) {
    const kind = g.name.startsWith('손님') ? '손님' : g.name.startsWith('UI') ? 'UI·시스템 문구' : '수칙·연락처·문자·상품';
    if (kind !== lastKind) {
      side.append(el('div', 'ed-side__h', kind));
      lastKind = kind;
    }
    const changed = g.ids.filter(isChanged).length;
    const b = btn('', 'ed-group', () => { state.group = g.name; state.limit = 60; renderSide(); renderList(); });
    b.dataset.on = String(state.group === g.name);
    const name = g.name.replace(/^(손님|UI·시스템) · /, '');
    b.append(el('span', 'ed-group__name', name));
    if (changed > 0) b.append(el('span', 'ed-group__dot', `${changed}`));
    b.append(el('span', 'ed-group__n', String(g.ids.length)));
    side.append(b);
  }
}

/** 수정 개수가 바뀔 때 사이드바 점과 상태 줄만 갱신한다 */
function paintCounts(): void {
  paintStatus();
  renderSide();
}

// ------------------------------------------------------------ 목록
function visibleRows(): Row[] {
  let rows = ROWS;
  if (state.group !== null) rows = rows.filter((r) => r.label.group === state.group);
  if (state.changedOnly) rows = rows.filter((r) => isChanged(r.id));
  if (state.query) {
    const q = state.query;
    rows = rows.filter((r) => r.hay.includes(q) || (isChanged(r.id) && currentText(r).toLowerCase().includes(q)));
  }
  return rows;
}

function autosize(t: HTMLTextAreaElement): void {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 2}px`;
}

/** 글 하나를 고치는 칸 (목록·대본 공용). row는 수정 여부 표시(data-changed)를 받는 바깥 요소 */
function editorFor(r: Row, row: HTMLElement, ariaLabel: string): HTMLElement {
  const edit = el('div', 'ed-row__edit');
  const ta = el('textarea', 'ed-ta');
  ta.value = currentText(r);
  ta.rows = 1;
  ta.spellcheck = false;
  ta.setAttribute('aria-label', ariaLabel);
  const foot = el('div', 'ed-row__foot');
  const warn = el('span', 'ed-warn');
  const count = el('span', 'ed-count');
  const reset = btn('원문으로', 'ed-link', () => {
    ta.value = r.leaf.text;
    onInput();
    autosize(ta);
  });
  const orig = el('div', 'ed-orig');
  const paintRow = (): void => {
    const cur = ta.value;
    const changed = cur !== r.leaf.text;
    row.dataset.changed = String(changed);
    count.textContent = `${[...cur].length}자`;
    const miss = missingPlaceholders(r.leaf.text, cur);
    warn.textContent = miss.length ? `${miss.join(' ')} 자리표시자가 빠졌어요` : isNarration(r.leaf.text) && !isNarration(cur) ? '"> "가 없어지면 대사로 나와요' : '';
    warn.hidden = warn.textContent === '';
    reset.hidden = !changed;
    orig.hidden = !changed;
    orig.textContent = changed ? `원문: ${r.leaf.text}` : '';
  };
  const onInput = (): void => {
    setText(r, ta.value);
    paintRow();
  };
  ta.addEventListener('input', () => { onInput(); autosize(ta); });
  foot.append(count, warn, reset);
  edit.append(ta, foot, orig);
  paintRow();
  queueMicrotask(() => autosize(ta));
  return edit;
}

function buildRow(r: Row): HTMLElement {
  const row = el('article', 'ed-row');
  row.dataset.changed = String(isChanged(r.id));
  const meta = el('div', 'ed-row__meta');
  const head = el('div', 'ed-row__head');
  head.append(el('span', 'ed-row__sec', r.label.section));
  if (isNarration(r.leaf.text)) {
    const tag = el('span', 'ed-tag', '지문');
    tag.title = '"> "로 시작하는 글은 대사가 아니라 장면 묘사로 나옵니다. 맨 앞의 "> "는 지우지 마세요.';
    head.append(tag);
  }
  meta.append(head, el('div', 'ed-row__name', r.label.name), el('code', 'ed-row__id', r.id));
  row.append(meta, editorFor(r, row, `${r.label.section} ${r.label.name}`));
  return row;
}

// ------------------------------------------------------------ 대본 보기
function lineVisible(id: string): boolean {
  const r = ROW_BY_ID.get(id);
  if (!r) return false;
  if (state.changedOnly && !isChanged(id)) return false;
  if (state.query) return r.hay.includes(state.query) || (isChanged(id) && currentText(r).toLowerCase().includes(state.query));
  return true;
}

function renderScriptSide(): void {
  side.replaceChildren(el('div', 'ed-side__h', '게임 순서대로'));
  const entry = (key: string, name: string, ids: string[]): void => {
    const changed = ids.filter(isChanged).length;
    const b = btn('', 'ed-group', () => { state.chapter = key; renderSide(); renderList(); });
    b.dataset.on = String(state.chapter === key);
    b.append(el('span', 'ed-group__name', name));
    if (changed > 0) b.append(el('span', 'ed-group__dot', `${changed}`));
    b.append(el('span', 'ed-group__n', String(ids.filter(lineVisible).length)));
    side.append(b);
  };
  for (const c of SCRIPT.chapters) entry(c.key, c.title, chapterIds(c));
  side.append(el('div', 'ed-side__h', '장면에 매이지 않는 글'));
  entry(REST_KEY, '그 밖의 글 (공통·UI)', SCRIPT.rest);
}

function buildLine(line: ScriptLine): HTMLElement {
  const r = ROW_BY_ID.get(line.id) as Row;
  const row = el('div', 'ed-line');
  row.dataset.kind = line.kind;
  row.dataset.changed = String(isChanged(r.id));
  const who = el('div', 'ed-line__who');
  // 상황 이름: 손님·연락처·수칙은 "인사 › 맞았을 때"처럼 뜻이 있다. UI 문구 경로(afternoon › intro › 1번째)는 감춘다
  const what = r.leaf.file === 'strings' ? '' : r.leaf.file === 'rules' ? r.label.section : r.label.name;
  who.append(el('b', '', line.who));
  if (what) who.append(el('span', 'ed-line__what', what));
  who.title = r.id;
  row.append(who, editorFor(r, row, `${line.who} · ${r.label.name}`));
  return row;
}

function renderScript(): void {
  if (state.chapter === REST_KEY) {
    const rows = SCRIPT.rest.filter(lineVisible).map((id) => ROW_BY_ID.get(id) as Row);
    const head = el('div', 'ed-list-head');
    head.append(el('h2', '', '그 밖의 글'), el('span', 'ed-list-n', `${rows.length}개 · 여러 장면에 두루 나오는 공통 반응, 버튼·알림 같은 UI 문구`));
    main.append(head);
    let group = '';
    const list = el('div', 'ed-list');
    for (const r of rows) {
      if (r.label.group !== group) { group = r.label.group; list.append(el('h3', 'ed-scene__title', group)); }
      list.append(buildRow(r));
    }
    main.append(list);
    main.scrollTop = 0;
    return;
  }
  const ch = SCRIPT.chapters.find((c) => c.key === state.chapter) ?? SCRIPT.chapters[0];
  if (!ch) return;
  const head = el('div', 'ed-list-head');
  const n = chapterIds(ch).filter(lineVisible).length;
  head.append(el('h2', '', ch.title), el('span', 'ed-list-n', `${n}줄`));
  main.append(head);
  if (ch.key.startsWith('day')) main.append(el('p', 'ed-script-hint', '조건에 따라 갈리는 줄(단골일 때, 초대 없이 왔을 때, 인사가 맞았을 때 등)도 함께 적혀 있어요. 왼쪽 회색 글씨가 어떤 상황의 줄인지 알려 줘요.'));
  let shown = 0;
  for (const sc of ch.scenes) {
    const lines = sc.lines.filter((l) => lineVisible(l.id));
    if (lines.length === 0) continue;
    const sec = el('section', 'ed-scene');
    const h = el('h3', 'ed-scene__title', sc.title);
    if (sc.sub) h.append(el('span', 'ed-scene__sub', sc.sub));
    sec.append(h);
    for (const l of lines) sec.append(buildLine(l));
    main.append(sec);
    shown += lines.length;
  }
  if (shown === 0) main.append(el('div', 'ed-empty', state.changedOnly && !state.query ? '이 장에서 수정한 글이 없어요.' : '찾는 글이 없어요. 검색어를 바꾸거나 다른 날을 골라 보세요.'));
  main.scrollTop = 0;
}

function renderList(): void {
  main.replaceChildren();
  if (state.mode === 'script') { renderScript(); return; }
  if (state.loadError) {
    const banner = el('div', 'ed-banner');
    banner.setAttribute('role', 'alert');
    banner.append(el('b', '', state.loadError === 'corrupt' ? '저장된 수정 내용을 읽지 못했어요(손상).' : '이 브라우저는 저장소를 막고 있어요.'));
    banner.append(el('span', '', state.loadError === 'corrupt'
      ? ' 아래 편집은 새로 시작되고, 저장하면 이전 내용은 덮어써집니다.'
      : ' 수정은 이 탭이 열려 있는 동안만 유지돼요. "패치 내려받기"로 보관하세요.'));
    main.append(banner);
  }
  const rows = visibleRows();
  const head = el('div', 'ed-list-head');
  const label = state.group ?? '전체';
  head.append(el('h2', '', label), el('span', 'ed-list-n', `${rows.length}개`));
  main.append(head);
  if (rows.length === 0) {
    main.append(el('div', 'ed-empty', state.changedOnly && !state.query ? '아직 수정한 글이 없어요.' : '찾는 글이 없어요. 검색어나 묶음을 바꿔 보세요.'));
    return;
  }
  const list = el('div', 'ed-list');
  for (const r of rows.slice(0, state.limit)) list.append(buildRow(r));
  main.append(list);
  if (rows.length > state.limit) {
    main.append(btn(`더 보기 (${rows.length - state.limit}개 남음)`, 'ed-btn ed-more', () => { state.limit += 60; renderList(); }));
  }
  main.scrollTop = 0;
}

// ------------------------------------------------------------ 내보내기
interface PatchFile {
  version: 1;
  note: string;
  changes: { id: string; before: string; after: string }[];
}

function patchFile(): PatchFile {
  const changes = Object.entries(state.patch).flatMap(([id, after]) => {
    const r = ROW_BY_ID.get(id);
    return r ? [{ id, before: r.leaf.text, after }] : [];
  });
  return { version: 1, note: '문구 편집기 패치. id는 "파일/경로", before는 원문, after는 수정문.', changes };
}

const stamp = (): string => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyPatch(): Promise<void> {
  const text = JSON.stringify(patchFile(), null, 2);
  if (Object.keys(state.patch).length === 0) { say('복사할 수정이 없어요.', 'warn'); return; }
  try {
    await navigator.clipboard.writeText(text);
    say(`수정 ${Object.keys(state.patch).length}개를 복사했어요. 그대로 붙여넣어 전달하세요.`);
  } catch {
    say('복사하지 못했어요(브라우저가 막음). "패치 내려받기"를 써 주세요.', 'warn');
  }
}

function downloadPatch(): void {
  if (Object.keys(state.patch).length === 0) { say('내려받을 수정이 없어요.', 'warn'); return; }
  download(`text-edits-${stamp()}.json`, `${JSON.stringify(patchFile(), null, 2)}\n`);
  say('패치 파일을 내려받았어요.');
}

function downloadFiles(): void {
  const n = Object.keys(state.patch).length;
  if (n === 0) { say('내려받을 수정이 없어요.', 'warn'); return; }
  const copy = JSON.parse(JSON.stringify(ORIGINAL)) as DataSet;
  applyPatch(copy, state.patch);
  const touched = new Set(Object.keys(state.patch).map((id) => splitId(id)?.file).filter((f): f is NonNullable<typeof f> => !!f));
  for (const f of FILE_IDS) if (touched.has(f)) download(FILE_NAMES[f], `${JSON.stringify(copy[f], null, 2)}\n`);
  say(`${touched.size}개 파일을 내려받았어요. src/data/ 에 덮어쓰면 됩니다.`);
}

function resetAll(): void {
  const n = Object.keys(state.patch).length;
  if (n === 0) { say('되돌릴 수정이 없어요.', 'warn'); return; }
  if (!window.confirm(`수정 ${n}개를 모두 원문으로 되돌릴까요? (되돌릴 수 없어요. 먼저 패치를 내려받아 두세요.)`)) return;
  state.patch = {};
  persist();
  renderSide();
  renderList();
  paintStatus();
  say('모두 원문으로 되돌렸어요.');
}

// ------------------------------------------------------------ 게시 (GitHub에 커밋)
const GH_KEY = 'closing-time.editor.gh.v1';
interface GhSettings { repo: string; branch: string; token: string; remember: boolean }
function loadGh(): GhSettings {
  // 토큰은 코드에 넣지 않는다(공개 저장소·배포 파일에 그대로 노출되고 GitHub가 바로 폐기한다).
  // 대신 한 번 넣으면 이 브라우저에 고정해 두고, 다음부터는 묻지 않는다.
  const d: GhSettings = { repo: 'yeijinchoi/chuu', branch: 'claude/trusting-faraday-4mk8i9', token: '', remember: true };
  try {
    const v = JSON.parse(localStorage.getItem(GH_KEY) ?? 'null') as Partial<GhSettings> | null;
    if (v) return { repo: v.repo ?? d.repo, branch: v.branch ?? d.branch, token: v.token ?? '', remember: v.remember ?? true };
  } catch { /* 설정을 못 읽어도 기본값으로 */ }
  return d;
}

const publishDialog = el('dialog', 'ed-dialog');
const pubSummary = el('p', 'ed-dialog__hint');
const pubResult = el('div', 'ed-dialog__result');
pubResult.setAttribute('role', 'status');
const pubGo = btn('게시하기', 'ed-btn ed-btn--primary', () => void doPublish());

function field(label: string, input: HTMLInputElement, hint = ''): HTMLElement {
  const w = el('label', 'ed-field');
  w.append(el('span', 'ed-field__l', label), input);
  if (hint) w.append(el('span', 'ed-field__h', hint));
  return w;
}
const inRepo = el('input', 'ed-input');
const inBranch = el('input', 'ed-input');
const inToken = el('input', 'ed-input');
inToken.type = 'password';
inToken.autocomplete = 'off';
const inRemember = el('input');
inRemember.type = 'checkbox';

/** 입력하는 즉시 이 브라우저에 고정한다 (게시를 누르기 전에 창을 닫아도 남는다) */
function saveGh(): void {
  try {
    const token = inToken.value.trim();
    localStorage.setItem(GH_KEY, JSON.stringify({ repo: inRepo.value.trim(), branch: inBranch.value.trim(), token: inRemember.checked ? token : '', remember: inRemember.checked }));
  } catch { /* 기억하지 못해도 게시는 된다 */ }
}
for (const i of [inRepo, inBranch, inToken, inRemember]) i.addEventListener('change', saveGh);

function openPublish(): void {
  const n = Object.keys(state.patch).length;
  const gh = loadGh();
  inRepo.value = gh.repo;
  inBranch.value = gh.branch;
  inToken.value = gh.token;
  inRemember.checked = gh.remember;
  const files = new Set(Object.keys(state.patch).map((id) => splitId(id)?.file).filter((f): f is NonNullable<typeof f> => !!f));
  pubSummary.textContent = n === 0
    ? '아직 올릴 수정이 없어요.'
    : `수정 ${n}개(${[...files].map((f) => FILE_NAMES[f]).join(', ')})를 저장소의 게임 데이터에 올려요. 올라가면 배포가 다시 돌고, 1~2분 뒤 게임을 여는 모두에게 바뀐 글이 보여요.`;
  pubResult.textContent = '';
  pubResult.dataset.kind = '';
  pubGo.disabled = n === 0;
  publishDialog.showModal();
}

async function doPublish(): Promise<void> {
  const repo = inRepo.value.trim();
  const branch = inBranch.value.trim();
  const token = inToken.value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { showPub({ ok: false, kind: 'notfound', step: '확인', message: '저장소는 "소유자/이름" 형식이어야 해요.' }); return; }
  if (!branch) { showPub({ ok: false, kind: 'notfound', step: '확인', message: '브랜치를 입력해 주세요.' }); return; }
  if (!token) { showPub({ ok: false, kind: 'auth', step: '확인', message: '토큰을 입력해 주세요. 아래 안내대로 만들 수 있어요.' }); return; }
  saveGh();
  pubGo.disabled = true;
  pubGo.textContent = '올리는 중…';
  pubResult.textContent = 'GitHub에 올리는 중이에요. 창을 닫지 마세요.';
  pubResult.dataset.kind = '';
  const changes = Object.entries(state.patch).flatMap(([id, after]) => {
    const r = ROW_BY_ID.get(id);
    return r ? [{ id, before: r.leaf.text, after }] : [];
  });
  const result = await publishChanges({ repo, branch, token }, changes);
  pubGo.disabled = false;
  pubGo.textContent = '게시하기';
  showPub(result);
}

function showPub(r: PublishResult): void {
  pubResult.replaceChildren();
  if (r.ok) {
    pubResult.dataset.kind = 'ok';
    pubResult.append(el('b', '', `${r.applied}개를 저장소에 올렸어요. `), el('span', '', '배포에 1~2분 걸려요. 그동안 이 페이지를 새로고침하지 않아도 돼요.'));
    const a = el('a', 'ed-link', ' 커밋 보기');
    a.href = r.commitUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    pubResult.append(a);
    if (r.skipped.length) pubResult.append(el('div', 'ed-dialog__sub', `${r.skipped.length}개는 건너뛰었어요(저장소의 글이 편집기 원문과 달라진 칸): ${r.skipped.slice(0, 3).map((x) => x.id).join(', ')}${r.skipped.length > 3 ? ' …' : ''}`));
    say(`게시 완료 · ${r.applied}개. 1~2분 뒤 게임에 반영돼요.`);
  } else {
    pubResult.dataset.kind = 'warn';
    pubResult.append(el('b', '', '게시하지 못했어요. '), el('span', '', r.message));
    if (r.skipped?.length) pubResult.append(el('div', 'ed-dialog__sub', `건너뜀 ${r.skipped.length}개: ${r.skipped.slice(0, 3).map((x) => x.id).join(', ')}`));
  }
}

(() => {
  const box = el('div', 'ed-dialog__box');
  const how = el('details', 'ed-how');
  how.append(el('summary', '', '토큰은 어떻게 만드나요?'));
  const ol = el('ol');
  for (const t of [
    'GitHub 로그인 → 오른쪽 위 프로필 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token',
    'Repository access: "Only select repositories" → 이 게임 저장소만 선택',
    'Permissions 칸의 "+ Add permissions" → 목록에서 Contents 선택 → 오른쪽 Access를 Read and write로 (Metadata: Read-only는 자동으로 붙어요)',
    '만든 토큰(github_pat_…)을 아래 칸에 붙여넣기. 토큰은 비밀번호처럼 다루세요.',
  ]) ol.append(el('li', '', t));
  how.append(ol);
  const rememberRow = el('label', 'ed-check');
  rememberRow.append(inRemember, el('span', '', '이 브라우저에 토큰 고정 (한 번 넣으면 다음부터 안 물어봐요. 내 컴퓨터에서만)'));
  const row = el('div', 'ed-dialog__row');
  row.append(pubGo, btn('닫기', 'ed-btn', () => publishDialog.close()));
  box.append(
    el('h2', '', '게임에 반영(게시)'), pubSummary,
    field('저장소', inRepo, '소유자/이름'),
    field('브랜치', inBranch, '이 브랜치가 배포되는 곳이어야 게임에 반영돼요'),
    field('토큰', inToken),
    rememberRow, how, pubResult, row,
  );
  publishDialog.append(box);
  app.append(publishDialog);
})();

// ------------------------------------------------------------ 불러오기
const importDialog = el('dialog', 'ed-dialog');
(() => {
  const form = el('div', 'ed-dialog__box');
  form.append(
    el('h2', '', '패치 불러오기'),
    el('p', 'ed-dialog__hint', '내려받은 패치(.json)를 고르거나 내용을 붙여넣으세요. 같은 글이 이미 수정돼 있으면 불러온 내용으로 바뀝니다.'),
  );
  const file = el('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  const area = el('textarea', 'ed-ta ed-dialog__area');
  area.placeholder = '{ "version": 1, "changes": [ … ] }';
  area.rows = 8;
  const result = el('div', 'ed-dialog__result');
  result.setAttribute('role', 'status');
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) void f.text().then((t) => { area.value = t; });
  });
  const go = btn('불러오기', 'ed-btn ed-btn--accent', () => {
    const r = importPatch(area.value);
    result.textContent = r.message;
    result.dataset.kind = r.ok ? 'ok' : 'warn';
    if (r.ok) { renderSide(); renderList(); paintStatus(); }
  });
  const close = btn('닫기', 'ed-btn', () => importDialog.close());
  const row = el('div', 'ed-dialog__row');
  row.append(go, close);
  form.append(file, area, result, row);
  importDialog.append(form);
  app.append(importDialog);
})();

function importPatch(text: string): { ok: boolean; message: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON을 읽지 못했어요. 패치 파일 전체가 맞는지 확인해 주세요.' };
  }
  const entries: [string, string][] = [];
  if (typeof data === 'object' && data !== null && Array.isArray((data as PatchFile).changes)) {
    for (const c of (data as PatchFile).changes) if (c && typeof c.id === 'string' && typeof c.after === 'string') entries.push([c.id, c.after]);
  } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) if (typeof v === 'string') entries.push([k, v]);
  }
  if (entries.length === 0) return { ok: false, message: '불러올 수정이 없어요. { "changes": [{ "id", "after" }] } 형식인지 확인해 주세요.' };
  let applied = 0;
  const unknown: string[] = [];
  for (const [id, after] of entries) {
    const r = ROW_BY_ID.get(id);
    if (!r) { unknown.push(id); continue; }
    setText(r, after);
    applied++;
  }
  persist();
  const tail = unknown.length ? ` 찾지 못한 ${unknown.length}개: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ' …' : ''}` : '';
  return { ok: applied > 0, message: `${applied}개를 불러왔어요.${tail}` };
}

// ------------------------------------------------------------ 시작
window.addEventListener('beforeunload', (e) => {
  if (state.save === 'failed') { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('storage', (e) => {
  if (e.key === PATCH_KEY) say('다른 탭에서 수정 내용이 바뀌었어요. 새로고침하면 반영돼요.', 'warn');
});
paintMode();
paintStatus();
renderSide();
renderList();
