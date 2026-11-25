/**
 * 문구 편집기의 핵심 로직 (DOM 없음).
 * 데이터 JSON 여섯 개에서 "사람이 읽는 글"만 골라 낱개(Leaf)로 펼치고, 낱개마다 고유한 경로 id를 준다.
 * 편집 내용은 { 경로 id: 새 글 } 패치로 저장·내보내기·게임 미리보기에 쓰인다.
 */

export type FileId = 'strings' | 'customers' | 'contacts' | 'rules' | 'templates' | 'products';
export const FILE_IDS: readonly FileId[] = ['strings', 'customers', 'contacts', 'rules', 'templates', 'products'];
export const FILE_NAMES: Record<FileId, string> = {
  strings: 'strings.ko.json',
  customers: 'customers.json',
  contacts: 'contacts.json',
  rules: 'rules.json',
  templates: 'templates.json',
  products: 'products.json',
};

export type DataSet = Record<FileId, unknown>;

/** 글이 아닌 키(식별자·분류·수치·연출 값). 이 키 아래에 있는 문자열은 편집 대상에서 뺀다. */
const SKIP_KEYS = new Set([
  'id', 'shift', 'category', 'color', 'greetPref', 'form', 'speaksVia', 'sprite', 'rules', 'traits', 'onlyProduct',
  'pref', 'flag', 'clue', 'book', 'customerId', 'prefers', 'dislikes', 'likes', 'template', 'stage', 'forbid', 'require',
  'exempts', 'motif', 'neglectEvent', 'draftLines', 'day', 'visit', 'best', 'time',
  'accepts', 'condition', 'candidates', 'scene', // 정답 상품·일정 조건·배경 연출은 글이 아니라 설정이다
]);
/** SKIP 키이지만 그 안에 글이 들어 있는 예외: customers.care.forbid[].note */
const KEEP_UNDER_SKIP = new Set(['note']);

export interface Leaf {
  file: FileId;
  /** 경로 조각: 객체 키, 배열 안의 id 있는 항목은 그 id, 그 밖의 배열 항목은 "#번호" */
  path: string[];
  text: string;
}

export const leafId = (file: FileId, path: readonly string[]): string => `${file}/${path.join('/')}`;

export function splitId(id: string): { file: FileId; path: string[] } | null {
  const i = id.indexOf('/');
  if (i < 0) return null;
  const file = id.slice(0, i) as FileId;
  if (!FILE_IDS.includes(file)) return null;
  return { file, path: id.slice(i + 1).split('/') };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function segmentOf(item: unknown, index: number): string {
  if (isObj(item) && (typeof item.id === 'string' || typeof item.id === 'number')) return String(item.id);
  return `#${index}`;
}

/** 파일 하나에서 글 낱개를 모은다 (문서 순서 그대로) */
export function collectLeaves(file: FileId, data: unknown): Leaf[] {
  const out: Leaf[] = [];
  const walk = (node: unknown, path: string[], skipped: boolean): void => {
    if (typeof node === 'string') {
      // 영어 소문자 식별자는 설정값이다 (상품 id, 오프닝 진행 종류 kind: "in"/"out" …). 상품의 kind("토트백")는 글이다
      const ident = /^[a-z][a-z0-9_]*$/.test(node) && (file !== 'strings' || path[path.length - 1] === 'kind');
      if (!skipped && node !== '' && !ident) out.push({ file, path, text: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, segmentOf(item, i)], skipped));
      return;
    }
    if (isObj(node)) {
      for (const [k, v] of Object.entries(node)) {
        const skip = file !== 'strings' && SKIP_KEYS.has(k) && !KEEP_UNDER_SKIP.has(k);
        // 객체의 id 키는 값이 문자열이라 위의 SKIP으로 걸러진다. forbid 아래의 note만 살린다.
        walk(v, [...path, k], skipped || skip);
        if (skip && k === 'forbid') walkNotes(v, [...path, k]);
      }
    }
  };
  const walkNotes = (node: unknown, path: string[]): void => {
    if (!Array.isArray(node)) return;
    node.forEach((item, i) => {
      if (isObj(item) && typeof item.note === 'string' && item.note !== '') out.push({ file, path: [...path, segmentOf(item, i), 'note'], text: item.note });
    });
  };
  walk(data, [], false);
  return out;
}

export function collectAll(data: DataSet): Leaf[] {
  return FILE_IDS.flatMap((f) => collectLeaves(f, data[f]));
}

/** 경로로 노드를 찾는다. 없으면 undefined */
export function getAt(data: unknown, path: readonly string[]): unknown {
  let cur: unknown = data;
  for (const seg of path) {
    if (Array.isArray(cur)) {
      if (seg.startsWith('#')) cur = cur[Number(seg.slice(1))];
      else cur = cur.find((x) => isObj(x) && String(x.id) === seg);
    } else if (isObj(cur)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}

/** 경로에 있는 문자열을 바꾼다. 문자열이 아니면 false */
export function setAt(data: unknown, path: readonly string[], value: string): boolean {
  if (path.length === 0) return false;
  const parent = getAt(data, path.slice(0, -1));
  const last = path[path.length - 1] as string;
  if (Array.isArray(parent)) {
    const i = last.startsWith('#') ? Number(last.slice(1)) : parent.findIndex((x) => isObj(x) && String(x.id) === last);
    if (typeof parent[i] !== 'string') return false;
    parent[i] = value;
    return true;
  }
  if (isObj(parent) && typeof parent[last] === 'string') {
    parent[last] = value;
    return true;
  }
  return false;
}

export type Patch = Record<string, string>;

/** 패치를 데이터에 제자리에서 적용한다. 적용한 수와, 찾지 못한 id를 돌려준다. */
export function applyPatch(data: Partial<DataSet>, patch: Patch): { applied: number; missing: string[] } {
  let applied = 0;
  const missing: string[] = [];
  for (const [id, text] of Object.entries(patch)) {
    const p = splitId(id);
    const root = p ? data[p.file] : undefined;
    if (p && root !== undefined && setAt(root, p.path, text)) applied++;
    else missing.push(id);
  }
  return { applied, missing };
}

/** "{name}" "{n}" 같은 자리표시자. 편집하다 지우면 게임에서 글자 그대로 나오지 않으므로 경고한다. */
export function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])];
}

export function missingPlaceholders(original: string, edited: string): string[] {
  const now = new Set(placeholders(edited));
  return placeholders(original).filter((p) => !now.has(p));
}

/** 지문("> "로 시작) 여부: 손님 대사가 아니라 장면 묘사로 나온다 */
export const isNarration = (text: string): boolean => text.startsWith('> ');

// ------------------------------------------------------------------ 이름표

const LINE_KEYS: Record<string, string> = {
  opening: '첫 대사',
  openingUninvited: '초대 없이 왔을 때 첫 대사',
  openingRegular: '단골일 때 첫 대사',
  askCategory: '[찾는 것?] 대답',
  askOccasion: '[용도?] 대답',
  askBudget: '[예산?] 대답',
  observe: '[관찰] 묘사',
  success: '판매 성공 대사',
  successNote: '판매 성공 지문',
  fail: '판매 실패 대사',
  failNote: '판매 실패 지문',
  farewell: '작별 대사',
};
const REACTION_KEYS: Record<string, string> = {
  enter: '입장 지문',
  leave: '퇴장 지문',
  manner: '매너 실수 뒤 지문',
  match: '맞았을 때',
  mismatch: '안 맞았을 때',
  quiet: '정중한 인사였을 때',
  direct: '바로 소개했을 때',
  warm: '밝은 인사였을 때',
  perfect: '딱 맞는 상품',
  deptOnly: '카테고리만 맞는 상품(거절)',
  wrong: '다른 카테고리 상품(거절)',
  overBudget: '예산 초과(거절)',
  notThis: '찾는 물건과 다른 상품(거절)',
  tryOn: '시착',
  box: '포장',
  red: '빨간 상자',
  gold: '금색 상자',
  checkout: '결제',
  accept: '단골 등록 수락',
  decline: '단골 등록 거절',
  opening: '첫 대사 뒤 속마음',
  observe: '관찰 뒤 속마음',
  farewell: '작별 뒤 속마음',
  sold: '판매 뒤 속마음',
  greet: '인사',
  propose: '상품 제안',
  close: '클로징',
  regular: '단골 등록',
  thought: '속마음',
  entrance: '새벽 입장 묘사',
  enter2: '입장',
};
const CARE_KEYS: Record<string, string> = {
  memo: '서윤의 메모(고객 관리)',
  occasionLabel: '기념일 이름',
  vipReveal: 'VIP가 되면 하는 말',
  reply: '관리 문자 답장',
  options: '답장 선택지',
  note: '새벽 관리 금기 설명',
};
const HOSP_KEYS: Record<string, string> = { match: '대접이 맞을 때', mismatch: '대접이 안 맞을 때', none: '대접하지 않았을 때' };
const TOP_NAMES: Record<string, string> = {
  loading: '로딩', stage: '무대', unknown: '알 수 없음', defaultPlayerName: '기본 이름', briefing: '출근 쪽지·브리핑', choices: '선택지 문구',
  stage_labels: '응대 단계 이름', manner: '매너 실수', violation: '수칙 위반', composure: '평정심', text: '짧은 지문', closingText: '04:44 문자',
  badEnding: '배드엔딩', tier: '관계 단계', results: '정산서', save: '저장', speaksVia: '말하는 방식 이름표', debug: '디버그', shiftBreak: '휴게',
  thoughts: '주인공 속마음', reactions: '공통 손님 반응', title: '타이틀', frame: '프레임', hud: 'HUD', note: '쪽지 화면', display: '진열 패널', phone: '업무폰',
  categories: '카테고리 이름', toast: '토스트', cardFieldNames: '고객 카드 항목', tutorial: '튜토리얼 알림', ending: '엔딩', keys: '키 안내', stepper: '단계 표시',
  a11y: '접근성 라벨', mobile: '모바일', rotate: '화면 회전 안내', drinks: '대접 이름', notify: '알림', finale: '5일차 서윤 장면', clues: '단서 메모',
};
const SEG_NAMES: Record<string, string> = { lines: '첫 방문', returns: '재방문', reactions: '반응', care: '관리', hospitality: '대접', afterSale: '판매 뒤 사건', onVisit: '방문 직후 사건', talk: '선택 대화' };

export interface Label {
  /** 사이드바 묶음 (예: "손님 · 한여름") */
  group: string;
  /** 묶음 안의 소제목 (예: "재방문 2회째") */
  section: string;
  /** 한 줄 이름 */
  name: string;
}

/** 낱개의 사람 말 이름표. 파일 데이터를 참조해 손님 이름 등을 붙인다. */
export function labelOf(leaf: Leaf, data: DataSet): Label {
  const p = leaf.path;
  const at = (i: number): string => p[i] ?? '';
  switch (leaf.file) {
    case 'customers': {
      const id = at(0);
      const c = (data.customers as { id: string; name: string }[]).find((x) => x.id === id);
      const group = `손님 · ${c?.name ?? id}`;
      const rest = p.slice(1);
      const k = rest[0] ?? '';
      if (k === 'name') return { group, section: '기본', name: '이름' };
      if (k === 'wants') return { group, section: '기본', name: '고객 카드 "찾는 것"' };
      if (k === 'cardNote') return { group, section: '기본', name: '고객 카드 관찰 메모' };
      if (k === 'entranceNote') return { group, section: '기본', name: '새벽 입장 묘사' };
      if (k === 'specialPayment') return { group, section: '기본', name: '새벽 지불 물건 이름' };
      if (k === 'lines') {
        if (rest[1] === 'violation') return { group, section: '수칙 위반', name: `수칙 ${rest[2] ?? ''} 위반 장면` };
        return { group, section: '첫 방문 대사', name: LINE_KEYS[rest[1] ?? ''] ?? (rest[1] ?? '') };
      }
      if (k === 'returns') {
        const n = rest[1] ?? '';
        const sub = rest[2] ?? '';
        if (sub === 'enter') return { group, section: `재방문 ${n}회째`, name: '입장 지문' };
        if (sub === 'entrance') return { group, section: `재방문 ${n}회째`, name: '새벽 입장 묘사' };
        if (sub === 'thought') return { group, section: `재방문 ${n}회째`, name: `속마음 · ${REACTION_KEYS[rest[3] ?? ''] ?? rest[3]}` };
        return { group, section: `재방문 ${n}회째`, name: LINE_KEYS[sub] ?? sub };
      }
      if (k === 'reactions') {
        const names = rest.slice(1).map((s) => REACTION_KEYS[s] ?? s);
        return { group, section: '상황별 반응', name: names.join(' › ') };
      }
      if (k === 'hospitality') return { group, section: '대접(탄산수·초콜릿)', name: HOSP_KEYS[rest[1] ?? ''] ?? (rest[1] ?? '') };
      if (k === 'care') {
        const sub = rest[1] ?? '';
        if (sub === 'chat') return { group, section: '관리 문자 답장', name: sub === 'chat' && rest[2] === 'options' ? `선택지 ${Number((rest[3] ?? '#0').slice(1)) + 1}` : '답장' };
        if (sub === 'forbid') return { group, section: '새벽 관리 금기', name: '금기 설명' };
        return { group, section: '관리', name: CARE_KEYS[sub] ?? sub };
      }
      if (k === 'afterSale' || k === 'onVisit') {
        const kind = rest[2] === 'thought' ? '속마음' : '대사·지문';
        return { group, section: SEG_NAMES[k] ?? k, name: `${kind} ${rest[3] ? Number(String(rest[3]).replace('#', '')) + 1 : ''}`.trim() };
      }
      if (k === 'talk') {
        if (rest[1] === 'prompt') return { group, section: '선택 대화', name: `질문 ${Number((rest[2] ?? '#0').slice(1)) + 1}` };
        const opt = Number((rest[2] ?? '#0').slice(1)) + 1;
        if (rest[3] === 'label') return { group, section: '선택 대화', name: `선택지 ${opt} 문구` };
        return { group, section: '선택 대화', name: `선택지 ${opt} 뒤 대답` };
      }
      return { group, section: '기타', name: rest.join(' › ') };
    }
    case 'contacts': {
      const c = (data.contacts as { id: string; name: string }[]).find((x) => x.id === at(0));
      const REPLY: Record<string, string> = { prefer: '좋아하는 문자에', neutral: '그저 그런 문자에', dislike: '싫어하는 문자에', busy: '바빠서 못 올 때', any: '어떤 문자에든' };
      if (at(1) === 'repliesByDay') return { group: '연락처(명부·검은 수첩)', section: c?.name ?? at(0), name: `${at(2)}일차 답장 · ${REPLY[at(3)] ?? at(3)}` };
      return { group: '연락처(명부·검은 수첩)', section: c?.name ?? at(0), name: at(1) === 'replies' ? `답장 · ${REPLY[at(2)] ?? at(2)}` : (({ name: '이름', address: '주소', memo: '서윤의 메모', memoStruck: '취소선 메모' }) as Record<string, string>)[at(1)] ?? at(1) };
    }
    case 'rules':
      return { group: '수칙', section: `수칙 ${at(0)}`, name: at(1) === 'reveal' ? '3~4일차에 더 읽히는 문장' : '수칙 문장' };
    case 'templates': {
      const list = at(0) === 'sales' ? '영업 문자' : '관리 문자';
      return { group: '문자 템플릿', section: list, name: `${at(1)} · ${at(2) === 'name' ? '이름' : '본문'}` };
    }
    case 'products': {
      const pr = (data.products as { id: string; name: string }[]).find((x) => x.id === at(0));
      return { group: '상품', section: pr?.name ?? at(0), name: at(1) === 'name' ? '이름' : at(1) === 'description' ? '설명' : at(1) === 'kind' ? '종류' : at(1) };
    }
    case 'strings': {
      const top = at(0);
      return { group: `UI·시스템 · ${TOP_NAMES[top] ?? top}`, section: TOP_NAMES[top] ?? top, name: p.slice(1).map((s) => (s.startsWith('#') ? `${Number(s.slice(1)) + 1}번째` : s)).join(' › ') || top };
    }
  }
}
