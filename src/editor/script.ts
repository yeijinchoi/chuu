/**
 * 문구 편집기 "대본" 보기 (DOM 없음).
 * 글 낱개(Leaf)를 게임에서 나오는 순서대로 n일차 → 장면 → 줄로 늘어놓는다.
 * 오프닝 → 오후(쪽지·문자·손님·관리) → 휴게 → 새벽(쪽지·덮개·문자·손님·04:44·관리) → 정산, 마지막에 엔딩.
 * 어디에도 놓이지 않은 글(공통 반응·UI 문구 등)은 "그 밖의 글"로 남긴다.
 */
import { getAt, isNarration, leafId, type DataSet, type Leaf } from './textmap';

export interface DaySlot { shift: 'afternoon' | 'dawn'; time: string; customerId: string; condition: string; candidates?: string[]; altTime?: string }
export interface DayInfo { day: number; schedule: DaySlot[] }

export interface ScriptLine { id: string; who: string; kind: 'speech' | 'narration' | 'thought' | 'text' | 'note' | 'ui' }
export interface ScriptScene { key: string; title: string; sub?: string; lines: ScriptLine[] }
export interface ScriptChapter { key: string; title: string; scenes: ScriptScene[] }

interface Customer { id: string; name: string; shift: 'afternoon' | 'dawn'; returns?: Record<string, unknown> }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 손님 한 방문 안에서 줄의 순서 (경로 앞부분이 맞는 가장 긴 것) */
const VISIT_ORDER: string[][] = [
  ['entranceNote'], ['entrance'], ['reactions', 'enter'], ['enter'],
  ['lines', 'opening'], ['opening'], ['lines', 'openingRegular'], ['openingRegular'], ['lines', 'openingUninvited'], ['openingUninvited'],
  ['reactions', 'thought', 'opening'], ['thought', 'opening'], ['onVisit'],
  ['hospitality'], ['reactions', 'greet'],
  ['lines', 'askCategory'], ['askCategory'], ['lines', 'askOccasion'], ['askOccasion'], ['lines', 'askBudget'], ['askBudget'],
  ['lines', 'observe'], ['observe'], ['reactions', 'thought', 'observe'], ['thought', 'observe'], ['reactions', 'manner'],
  ['reactions', 'propose'], ['reactions', 'close'], ['lines', 'violation'],
  ['lines', 'success'], ['success'], ['lines', 'successNote'], ['lines', 'fail'], ['fail'], ['lines', 'failNote'],
  ['afterSale'], ['talk'], ['reactions', 'regular'],
  ['lines', 'farewell'], ['farewell'], ['reactions', 'thought', 'farewell'], ['thought', 'farewell'],
  ['reactions', 'leave'], ['reactions', 'thought', 'sold'], ['thought', 'sold'],
  ['name'], ['wants'], ['cardNote'], ['specialPayment'],
];
function visitRank(path: readonly string[]): number {
  let best = VISIT_ORDER.length;
  let len = 0;
  VISIT_ORDER.forEach((pre, i) => {
    if (pre.length > len && pre.every((s, j) => path[j] === s)) { best = i; len = pre.length; }
  });
  return best;
}

const COND: Record<string, string> = {
  always: '',
  invited: '문자로 초대했을 때',
  invitedElse: '초대했으면 이 시각, 아니면 초대 없이 늦게',
  returning: '재방문 (산 적 있는 손님 중 한 명)',
  walkIn: '지나가는 손님 (후보 중 한 명)',
};

export function buildScript(data: DataSet, days: readonly DayInfo[], leaves: readonly Leaf[]): { chapters: ScriptChapter[]; rest: string[] } {
  const order = new Map<string, number>();
  const byId = new Map<string, Leaf>();
  leaves.forEach((l, i) => { const id = leafId(l.file, l.path); order.set(id, i); byId.set(id, l); });
  const used = new Set<string>();
  const customers = data.customers as Customer[];
  const cust = new Map(customers.map((c) => [c.id, c]));
  const strings = data.strings;

  /** 접두 경로로 시작하는 글을 문서 순서대로 (아직 쓰지 않은 것만) */
  const under = (prefix: string): string[] => {
    const out: string[] = [];
    for (const l of leaves) {
      const id = leafId(l.file, l.path);
      if ((id === prefix || id.startsWith(`${prefix}/`)) && !used.has(id)) out.push(id);
    }
    return out;
  };
  const whoOf = (id: string, fallback: string, base: ScriptLine['kind'] = 'speech'): ScriptLine => {
    const l = byId.get(id) as Leaf;
    if (/\/thoughts?(\/|$)/.test(id)) return { id, who: '속마음', kind: 'thought' };
    if (isNarration(l.text)) return { id, who: '지문', kind: 'narration' };
    return { id, who: fallback, kind: base };
  };
  const take = (ids: string[], fallback: string, base: ScriptLine['kind'] = 'speech'): ScriptLine[] =>
    ids.filter((id) => !used.has(id) && byId.has(id)).map((id) => { used.add(id); return whoOf(id, fallback, base); });
  const takeStr = (prefix: string, fallback: string, base: ScriptLine['kind'] = 'speech'): ScriptLine[] => take(under(`strings/${prefix}`), fallback, base);
  const scene = (key: string, title: string, lines: ScriptLine[], sub?: string): ScriptScene => ({ key, title, sub, lines });

  // 손님 방문 계획: 처음 나오는 날 = 첫 방문. 재방문 대사는 가장 큰 번호(마지막 방문)를 마지막으로 나오는 날에,
  // 나머지는 그 사이 나오는 날에 차례로. 일정표에 한 번만 나오는 손님(초대 없이 다시 오는 새벽 손님)의 재방문은 첫 방문 바로 뒤에.
  type Visit = number | 'first';
  const plan = new Map<string, Map<number, Visit[]>>();
  for (const c of customers) {
    const appear = [...new Set(days.filter((dd) => dd.schedule.some((sl) => sl.customerId === c.id || (sl.candidates ?? []).includes(c.id))).map((dd) => dd.day))].sort((x, y) => x - y);
    if (appear.length === 0) continue;
    const m = new Map<number, Visit[]>();
    const add = (dd: number, v: Visit): void => { m.set(dd, [...(m.get(dd) ?? []), v]); };
    add(appear[0] as number, 'first');
    const keys = Object.keys(c.returns ?? {}).map(Number).sort((x, y) => x - y);
    const later = appear.slice(1);
    const last = keys.pop();
    const lastDay = later.pop();
    const rest: number[] = [];
    for (const k of keys) { const dd = later.shift(); if (dd !== undefined) add(dd, k); else rest.push(k); }
    if (last !== undefined) { if (lastDay !== undefined) add(lastDay, last); else rest.push(last); }
    for (const k of rest) add(appear[0] as number, k);
    plan.set(c.id, m);
  }
  const careShown = new Set<string>();
  const metToday = new Set<string>();
  /** 방문 직후·판매 뒤 사건(onVisit/afterSale)은 visit 번호가 있으면 그 방문에, 없으면 첫 방문에 놓는다 */
  const beatVisit = (c: Customer, kind: string, idx: string): number => {
    const v = getAt(data.customers, [c.id, kind, idx, 'visit']);
    return typeof v === 'number' ? v : 1;
  };
  const visitLines = (c: Customer, v: Visit): ScriptLine[] => {
    const n = v === 'first' ? 1 : v;
    const beats = (id: string): boolean => {
      const p = id.split('/');
      return (p[2] === 'onVisit' || p[2] === 'afterSale') && beatVisit(c, p[2], p[3] as string) === n;
    };
    let ids: string[];
    if (v === 'first') {
      ids = under(`customers/${c.id}`).filter((id) => {
        const seg = id.split('/')[2] ?? '';
        if (seg === 'onVisit' || seg === 'afterSale') return beats(id);
        return seg !== 'returns' && seg !== 'care';
      });
    } else ids = [...under(`customers/${c.id}/returns/${v}`), ...under(`customers/${c.id}/onVisit`).filter(beats), ...under(`customers/${c.id}/afterSale`).filter(beats)];
    const rel = (id: string): string[] => {
      const p = id.split('/').slice(2);
      return p[0] === 'returns' ? p.slice(2) : p;
    };
    ids.sort((a, b) => visitRank(rel(a)) - visitRank(rel(b)) || (order.get(a) as number) - (order.get(b) as number));
    const lines = take(ids, c.name).map((l) => (/\/observe$/.test(l.id) && !/\/thought\//.test(l.id) ? { ...l, who: '관찰', kind: 'narration' as const } : l));
    // 이 방문의 사건에서 생기는 단서 메모
    const clueIds = new Set<string>();
    for (const kind of ['onVisit', 'afterSale']) {
      const list = getAt(data.customers, [c.id, kind]);
      if (!Array.isArray(list)) continue;
      list.forEach((b, i) => { if (isObj(b) && typeof b.clue === 'string' && beatVisit(c, kind, `#${i}`) === n) clueIds.add(b.clue); });
    }
    for (const cl of clueIds) lines.push(...takeStr(`clues/${cl}`, '메모 앱', 'ui'));
    return lines;
  };

  const customerScenes = (day: DayInfo, shift: 'afternoon' | 'dawn'): ScriptScene[] => {
    const slots = day.schedule.filter((sl) => sl.shift === shift).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const out: ScriptScene[] = [];
    for (const sl of slots) {
      const ids = sl.condition === 'returning' || sl.condition === 'walkIn' ? (sl.candidates ?? [sl.customerId]) : [sl.customerId];
      for (const id of ids) {
        const c = cust.get(id);
        const visits = plan.get(id)?.get(day.day);
        if (!c || !visits || visits.length === 0) continue;
        plan.get(id)?.delete(day.day); // 같은 날 다른 칸에 또 나오지 않게
        metToday.add(id);
        const cond = COND[sl.condition] ?? sl.condition;
        const time = sl.condition === 'invitedElse' && sl.altTime ? `${sl.time} / ${sl.altTime}` : sl.time;
        visits.forEach((v, i) => {
          const label = v === 'first' ? '첫 방문' : `${v}번째 방문`;
          const title = i === 0 ? `${time} ${c.name}` : `${c.name} · 다시 올 때`;
          const sub = i === 0 ? [label, cond].filter(Boolean).join(' · ') : `${label} · 일정표 밖에서 다시 찾아온다`;
          out.push(scene(`${day.day}-${shift}-${sl.time}-${id}-${i}`, title, visitLines(c, v), sub));
        });
      }
    }
    return out;
  };

  const careScene = (dayN: number, shift: 'afternoon' | 'dawn'): ScriptScene => {
    const lines: ScriptLine[] = [];
    for (const id of metToday) {
      const c = cust.get(id);
      if (!c || c.shift !== shift || careShown.has(id)) continue;
      careShown.add(id);
      lines.push(...take(under(`customers/${id}/care`), c.name));
    }
    if (dayN === 1) lines.push(...take(under('templates/care').filter((x) => tmplShift(x) === shift), '나(관리 문자)', 'text'));
    return scene(`${dayN}-${shift}-care`, shift === 'afternoon' ? '20:00 감사·관리 문자' : '05:00 새벽 관리 문자', lines);
  };
  const tmplShift = (id: string): string => {
    const p = id.split('/');
    const item = getAt(data.templates, [p[1] as string, p[2] as string]);
    return isObj(item) && typeof item.shift === 'string' ? item.shift : 'afternoon';
  };
  const contactScene = (dayN: number, book: 'afternoon' | 'dawn'): ScriptLine[] => {
    const lines: ScriptLine[] = [];
    for (const ct of data.contacts as { id: string; name: string; book: string }[]) {
      if (ct.book !== book) continue;
      if (dayN === 1) lines.push(...take(under(`contacts/${ct.id}`).filter((x) => !x.includes('/repliesByDay/')), ct.name, 'text'));
      lines.push(...take(under(`contacts/${ct.id}/repliesByDay/${dayN}`), ct.name, 'text'));
    }
    if (dayN === 1) lines.push(...take(under('templates/sales').filter((x) => tmplShift(x) === book), '나(영업 문자)', 'text'));
    return lines;
  };
  const rulesFor = (dayN: number, first: boolean): ScriptLine[] => {
    const ids: string[] = [];
    for (const r of data.rules as { id: number; day: number; reveal?: { day: number } }[]) {
      if (first ? r.day === dayN : r.day === dayN) ids.push(...under(`rules/${r.id}`).filter((x) => !x.includes('/reveal')));
      if (r.reveal?.day === dayN) ids.push(...under(`rules/${r.id}/reveal`));
    }
    return take(ids, '수칙', 'note');
  };

  const chapters: ScriptChapter[] = [];
  // 오프닝: 타이틀 문자 → 서윤의 문자 → 로즈의 연락 → 이름
  const opening: ScriptLine[] = [...takeStr('title/message', '타이틀 문자', 'text'), ...takeStr('title/from', '타이틀', 'ui')];
  for (const id of under('strings/opening/steps')) {
    const p = id.split('/');
    const kind = getAt(strings, ['opening', 'steps', p[3] as string, 'kind']);
    const who = kind === 'in' ? '문자(받음)' : kind === 'out' ? '나(문자)' : kind === 'thought' ? '속마음' : kind === 'scene' ? '장면 자막' : kind === 'narration' ? '지문' : String(kind ?? '');
    used.add(id);
    opening.push({ id, who, kind: kind === 'thought' ? 'thought' : kind === 'narration' || kind === 'scene' ? 'narration' : 'text' });
  }
  opening.push(...takeStr('title/nameIntro', '지문', 'narration'), ...takeStr('defaultPlayerName', '기본 이름', 'ui'));
  chapters.push({ key: 'opening', title: '오프닝', scenes: [scene('opening', '퇴근길 지하철 → 로즈의 연락 → 이름', opening)] });

  for (const day of days) {
    const d = day.day;
    const scenes: ScriptScene[] = [];
    metToday.clear();
    // ── 오후 출근
    const brief: ScriptLine[] = [];
    if (d === 1) {
      brief.push(...takeStr('briefing/afternoon/intro', '지문', 'narration'), ...takeStr('thoughts/afternoonOpen', '속마음', 'thought'));
      brief.push(...takeStr('briefing/afternoon/head', '쪽지(로즈)', 'note'), ...takeStr('briefing/afternoon/title', '쪽지(로즈)', 'note'), ...takeStr('briefing/afternoon/lines', '쪽지(로즈)', 'note'));
      brief.push(...takeStr('thoughts/afterNote', '속마음', 'thought'));
    } else {
      brief.push(...takeStr(`briefing/day${d}/head`, '알림(로즈)', 'note'), ...takeStr(`briefing/day${d}/title`, '알림(로즈)', 'note'), ...rulesFor(d, false), ...takeStr(`briefing/day${d}/thoughts`, '속마음', 'thought'));
    }
    scenes.push(scene(`${d}-brief`, d === 1 ? '12:30 출근 · 점장 쪽지' : '12:30 출근 · 점장의 알림과 새 수칙', brief));
    // ── 오후 문자
    const tex: ScriptLine[] = [];
    if (d === 1) tex.push(...takeStr('briefing/afternoon/phoneHome', '지문', 'narration'), ...takeStr('thoughts/blackIcon', '속마음', 'thought'));
    tex.push(...contactScene(d, 'afternoon'));
    if (d === 1) tex.push(...takeStr('thoughts/visitorsMany', '속마음', 'thought'), ...takeStr('thoughts/visitorsNone', '속마음', 'thought'));
    scenes.push(scene(`${d}-text-a`, '12:40 영업 문자 (연락처)', tex));
    scenes.push(...customerScenes(day, 'afternoon'));
    scenes.push(careScene(d, 'afternoon'));
    // ── 휴게
    const brk = [...take(under(`strings/shiftBreak/narration/#${d - 1}`), '지문', 'narration'), ...take(under(`strings/thoughts/shiftBreak/#${d - 1}`), '속마음', 'thought')];
    scenes.push(scene(`${d}-break`, '휴게 · 두 번째 쪽지', brk));
    metToday.clear();
    // ── 새벽 쪽지·덮개
    const dawn: ScriptLine[] = [];
    if (d === 1) {
      dawn.push(...takeStr('briefing/dawn/intro', '쪽지(로즈)', 'note'), ...takeStr('briefing/dawn/title', '쪽지(로즈)', 'note'), ...rulesFor(1, true), ...takeStr('briefing/dawn/outro', '쪽지(로즈)', 'note'), ...takeStr('thoughts/dawnNote', '속마음', 'thought'));
    } else dawn.push(...take(under(`strings/briefing/dawn/introAgain/#${d - 2}`), '쪽지(로즈)', 'note'));
    if (d === 1) dawn.push(...takeStr('briefing/dawn/cover', '지문', 'narration'), ...takeStr('briefing/dawn/notebook', '지문', 'narration'));
    else dawn.push(...take(under(`strings/briefing/dawn/coverAgain/#${d - 2}`), '지문', 'narration'));
    scenes.push(scene(`${d}-dawn-brief`, '00:30 새벽 근무 쪽지 · 진열장 덮개', dawn));
    const texD: ScriptLine[] = [...contactScene(d, 'dawn')];
    if (d === 1) texD.push(...takeStr('thoughts/zeroReply', '속마음', 'thought'));
    scenes.push(scene(`${d}-text-d`, '01:50 새벽 문자 (검은 수첩)', texD));
    scenes.push(...customerScenes(day, 'dawn'));
    // ── 04:44
    const c444: ScriptLine[] = [];
    if (d === 1) {
      c444.push(...takeStr('closingText/incoming', '"나"의 문자', 'text'), ...takeStr('thoughts/closingWho', '속마음', 'thought'), ...takeStr('thoughts/closingRule3', '속마음', 'thought'));
      c444.push(...takeStr('closingText/replyPreview', '나(답장)', 'text'), ...takeStr('closingText/replied', '"나"의 문자', 'text'), ...takeStr('closingText/ignored', '"나"의 문자', 'text'), ...takeStr('closingText/facedown', '지문', 'narration'), ...takeStr('thoughts/closingIgnored', '속마음', 'thought'));
    } else if (d < 5) {
      c444.push(...takeStr(`closingText/d${d}/thought`, '속마음', 'thought'), ...takeStr(`closingText/d${d}/incoming`, '"나"의 문자', 'text'), ...takeStr(`closingText/d${d}/replied`, '"나"의 문자', 'text'), ...takeStr(`closingText/d${d}/ignored`, '"나"의 문자', 'text'));
    } else {
      c444.push(...takeStr('finale', '서윤', 'speech'));
    }
    scenes.push(scene(`${d}-444`, d === 5 ? '04:44 서윤이 돌아온다' : '04:44 문자', c444));
    scenes.push(careScene(d, 'dawn'));
    // ── 정산
    const res: ScriptLine[] = [];
    if (d === 1) res.push(...takeStr('results/gradeComment', '점장 코멘트', 'note'), ...takeStr('thoughts/results', '속마음', 'thought'));
    res.push(...take(under(`strings/results/teasers/${d}`), '다음 날 예고', 'ui'));
    scenes.push(scene(`${d}-results`, '정산서', res));
    chapters.push({ key: `day${d}`, title: `${d}일차`, scenes: scenes.filter((s) => s.lines.length > 0) });
  }

  // 엔딩
  const endings: ScriptScene[] = [];
  const ending = getAt(strings, ['ending']);
  if (isObj(ending)) {
    for (const [k, v] of Object.entries(ending)) {
      if (!isObj(v)) continue;
      const lines = take(under(`strings/ending/${k}`), '지문', 'narration');
      const t = typeof v.title === 'string' ? v.title : k;
      if (lines.length) endings.push(scene(`ending-${k}`, t, lines));
    }
  }
  const bad = takeStr('badEnding', '지문', 'narration');
  if (bad.length) endings.push(scene('ending-bad', '배드엔딩(진열)', bad));
  chapters.push({ key: 'endings', title: '엔딩', scenes: endings });

  const rest = leaves.map((l) => leafId(l.file, l.path)).filter((id) => !used.has(id));
  return { chapters, rest };
}
