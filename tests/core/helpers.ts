import { expect } from 'vitest';
import { startEncounter } from '../../src/core/encounter';
import { makeLookups, type Ctx } from '../../src/core/ctx';
import { Game } from '../../src/core/game';
import { loadGameData } from '../../src/core/gameData';
import type {
  Action, ClientCard, CustomerDef, GameEvent, GameState, Product, Shift, StorageAdapter,
} from '../../src/core/types';
import { newCard } from '../../src/core/care';
import { classifyProposal } from '../../src/core/reactions';

export const data = loadGameData();
export const customer = (id: string): CustomerDef => data.customers.find((c) => c.id === id) as CustomerDef;
export const product = (id: string): Product => data.products.find((p) => p.id === id) as Product;

export function newGame(seed = 7, storage?: StorageAdapter): Game {
  const g = new Game(data, storage);
  g.dispatch({ type: 'start', playerName: '테스터', seed });
  return g;
}

/** 유효해야 하는 액션: 이벤트가 하나 이상 나온다 */
export function act(g: Game, a: Action): GameEvent[] {
  const ev = g.dispatch(a);
  expect(ev.length, `action should be valid: ${JSON.stringify(a)} in ${g.getState().phase.kind}`).toBeGreaterThan(0);
  return ev;
}

/** 무효여야 하는 액션 */
export function reject(g: Game, a: Action): void {
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    expect(g.dispatch(a)).toEqual([]);
  } finally {
    console.warn = warn;
  }
}

export function st(g: Game): GameState {
  return g.getState() as GameState;
}

export function encOf(g: Game) {
  const p = st(g).phase;
  if (p.kind !== 'encounter') throw new Error(`not in encounter: ${p.kind}`);
  return p.enc;
}

/** 정답 상품: 부서·색이 모두 맞는 제안 카드 */
export function bestOffer(g: Game): string {
  const e = encOf(g);
  const c = customer(e.customerId);
  const ctx = ctxOf(g);
  const exact = e.offered.find((id) => classifyProposal(ctx, c, product(id)) === 'perfect');
  return exact ?? (e.offered[0] as string);
}

/** 대접 단계의 정답: 취향 그대로 (any는 탄산수, taboo는 아무것도 내지 않기) */
export function rightDrink(c: CustomerDef): 'water' | 'chocolate' | 'none' {
  const pref = c.hospitality?.pref;
  if (pref === 'taboo') return 'none';
  if (pref === 'any' || pref === undefined) return 'water';
  return pref === 'none' ? 'none' : pref;
}

/** 손님 하나를 정답 루트로 끝까지 응대한다 (단골 권유는 accept 인자) */
export function playCorrect(
  g: Game,
  opts: { probes?: ('askCategory' | 'askOccasion' | 'askBudget' | 'observe')[]; close?: 'tryOn' | 'boxRed' | 'boxGold' | 'checkout'; accept?: boolean } = {},
): void {
  const e = encOf(g);
  const c = customer(e.customerId);
  act(g, { type: 'greet', style: c.greetPref });
  if (encOf(g).step === 'serve') act(g, { type: 'serve', drink: rightDrink(c) });
  for (const p of opts.probes ?? ['askCategory', 'askOccasion']) act(g, { type: 'probe', probe: p });
  act(g, { type: 'propose', productId: bestOffer(g) });
  const close = opts.close ?? (c.rules.includes(11) ? 'checkout' : c.traits.wantsAnything ? 'boxRed' : 'boxRed');
  act(g, { type: 'close', choice: close });
  if (encOf(g).step === 'regularOffer') act(g, { type: 'regularOffer', accept: opts.accept ?? false });
}

/** 오후: 문자 보낸 뒤 응대까지 모두 진행하고 애프터케어 진입 */
export function ctxOf(g: Game): Ctx {
  const { customers, products } = makeLookups(data);
  return { state: st(g), data, customers, products, emit: () => undefined };
}

/** 임의 손님과의 응대를 바로 시작하는 장치 (일정 밖의 손님을 테스트하기 위한 것) */
export function rig(customerId: string, shift: Shift, seed = 7, extra?: (s: GameState) => void): Game {
  const g = newGame(seed);
  const s = st(g);
  s.shift = shift;
  s.slots = [{ shift, time: shift === 'dawn' ? '02:22' : '13:30', customerId, uninvited: false, forgotten: false }];
  extra?.(s);
  startEncounter(ctxOf(g), 0);
  return g;
}

export function registered(customerId: string, book: Shift, extra: Partial<ClientCard> = {}): ClientCard {
  return { ...newCard(customerId, book), score: 2, tier: 'regular', lastContactDay: 1, ...extra };
}

/** 단계를 건너뛰어 애프터케어에 들어간다 (고객 관리 테스트용) */
export function toAftercare(g: Game, shift: Shift): void {
  const s = st(g);
  s.shift = shift;
  s.phase = { kind: 'aftercare', shift };
  s.aftercareRemaining = 2;
}

export function toTexting(g: Game, shift: Shift): void {
  const s = st(g);
  s.shift = shift;
  s.phase = { kind: 'texting', shift };
}

/** 오후 전체를 정답 루트로 (문자: kang=new_arrival, jin=private) */
export function playAfternoon(g: Game, accept = true): void {
  act(g, { type: 'ackBriefing' });
  act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
  act(g, { type: 'sendText', contactId: 'jin', template: 'private' });
  act(g, { type: 'finishTexting' });
  for (let i = 0; i < 3; i++) {
    playCorrect(g, { accept, close: i === 0 ? 'boxGold' : 'boxRed' });
    act(g, { type: 'advance' });
  }
}
