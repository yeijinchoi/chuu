import { moodFor } from './mood';
import type { CustomerDef, DayDef, GameData, GameEvent, GameState, Phase, Product } from './types';

/** 코어 내부 공용 컨텍스트: 상태는 Game이 소유하고, 각 모듈 함수가 제자리에서 바꾼다. */
export interface Ctx {
  state: GameState;
  data: GameData;
  customers: Record<string, CustomerDef>;
  products: Record<string, Product>;
  emit(e: GameEvent): void;
}

export function makeLookups(data: GameData): { customers: Record<string, CustomerDef>; products: Record<string, Product> } {
  const customers: Record<string, CustomerDef> = {};
  for (const c of data.customers) customers[c.id] = c;
  const products: Record<string, Product> = {};
  for (const p of data.products) products[p.id] = p;
  return { customers, products };
}

/** strings.ko.json에서 점 경로로 문자열을 읽는다 */
export function str(data: GameData, path: string): string {
  const v = lookup(data.strings, path);
  return typeof v === 'string' ? v : '';
}

export function strList(data: GameData, path: string): string[] {
  const v = lookup(data.strings, path);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function lookup(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function setPhase(ctx: Ctx, phase: Phase): void {
  ctx.state.phase = phase;
  ctx.emit({ type: 'phase', phase: phase.kind });
}

export function setClock(ctx: Ctx, time: string): void {
  ctx.state.clock = time;
  ctx.emit({ type: 'clock', time });
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 평정심은 새벽에만 바뀐다. 0이 되면 즉시 배드엔딩. */
export function changeComposure(ctx: Ctx, delta: number): void {
  const s = ctx.state;
  if (s.shift !== 'dawn' || delta === 0) return;
  const before = s.composure;
  s.composure = clamp(before + delta, 0, 100);
  const actual = s.composure - before;
  ctx.emit({ type: 'composure', delta: actual, value: s.composure });
  const m0 = moodFor(before, s.shift);
  const m1 = moodFor(s.composure, s.shift);
  if (m0 !== m1) ctx.emit({ type: 'mood', mood: m1 });
  if (s.composure <= 0 && s.phase.kind !== 'badEnding') goBadEnding(ctx);
}

export function goBadEnding(ctx: Ctx): void {
  ctx.emit({ type: 'horror', customerId: null, kind: 'blackout' });
  ctx.emit({ type: 'line', speaker: null, text: str(ctx.data, 'badEnding.line') });
  ctx.emit({ type: 'line', speaker: null, text: str(ctx.data, 'badEnding.note') });
  setPhase(ctx, { kind: 'badEnding' });
}

/** 오늘의 하루 설정. 정의되지 않은 날은 1일차 설정을 반복한다 (M1: 2일차 이후 일정은 없다). */
export function dayDef(ctx: Ctx): DayDef {
  return (ctx.data.days[ctx.state.day] ?? ctx.data.days[1]) as DayDef;
}

/** (속마음) 이벤트 */
export function thought(ctx: Ctx, text: string | undefined): void {
  if (text) ctx.emit({ type: 'thought', text });
}

/** 이름표 없는 지문 */
export function narrate(ctx: Ctx, text: string | undefined): void {
  if (text) ctx.emit({ type: 'line', speaker: null, text });
}
