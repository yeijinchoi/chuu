import { narrate, thought, type Ctx } from './ctx';
import type { CloseId, CustomerDef, CustomerReactions, GreetStyle, Product } from './types';
import { effectiveBudget } from './encounter';
import { effectiveVisit, returnsFor } from './plot';

/** 반응 종류 → 데이터 경로. 손님 데이터(reactions)에 없으면 strings의 공통 반응을 쓴다. */
export type ReactionKey =
  | 'greet.match' | 'greet.mismatch'
  | 'propose.perfect' | 'propose.deptOnly' | 'propose.wrong' | 'propose.overBudget'
  | 'close.tryOn' | 'close.box' | 'close.checkout'
  | 'regular.accept' | 'regular.decline';

function pick(root: unknown, path: string, sub?: string): string | undefined {
  let cur: unknown = root;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  if (typeof cur === 'string') return cur;
  if (sub && cur !== null && typeof cur === 'object') {
    const v = (cur as Record<string, unknown>)[sub];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/** 손님별 ★ 반응 → 공통 반응 순으로 찾는다. sub: greet.mismatch의 인사 방식, close.box의 red/gold */
export function reactionText(ctx: Ctx, c: CustomerDef, key: ReactionKey, sub?: string): string | undefined {
  return pick(c.reactions, key, sub) ?? pick(ctx.data.strings, `reactions.common.${key}`, sub);
}

/** "> "로 시작하거나 "(…)"로 감싼 문자열은 지문, 아니면 손님의 대사 */
export function emitReaction(ctx: Ctx, c: CustomerDef, text: string | undefined): void {
  if (!text) return;
  if (text.startsWith('>')) narrate(ctx, text.replace(/^>\s*/, ''));
  else if (/^\(.*\)$/.test(text)) narrate(ctx, text);
  else ctx.emit({ type: 'line', speaker: c.name, text });
}

export function react(ctx: Ctx, c: CustomerDef, key: ReactionKey, sub?: string): void {
  emitReaction(ctx, c, reactionText(ctx, c, key, sub));
}

export function reactGreet(ctx: Ctx, c: CustomerDef, style: GreetStyle): void {
  if (style === c.greetPref) react(ctx, c, 'greet.match');
  else react(ctx, c, 'greet.mismatch', style);
}

export type ProposeKind = 'perfect' | 'deptOnly' | 'wrong' | 'overBudget';

/** 제안 결과 분류: 다른 카테고리 → wrong, 예산 초과 → overBudget, 색까지 맞음 → perfect, 아니면 deptOnly. "아무거나" 손님은 항상 perfect */
export function classifyProposal(ctx: Ctx, c: CustomerDef, product: Product): ProposeKind {
  if (c.traits.wantsAnything || c.category === 'any') return 'perfect';
  if (product.category !== c.category) return 'wrong';
  const budget = effectiveBudget(c, ctx.state.cards[c.id]);
  if (budget !== null && product.price > budget) return 'overBudget';
  return c.color === null || product.color === c.color ? 'perfect' : 'deptOnly';
}

export function reactPropose(ctx: Ctx, c: CustomerDef, product: Product): void {
  react(ctx, c, `propose.${classifyProposal(ctx, c, product)}`);
}

export function reactClose(ctx: Ctx, c: CustomerDef, choice: CloseId): void {
  if (choice === 'tryOn') react(ctx, c, 'close.tryOn');
  else if (choice === 'checkout') react(ctx, c, 'close.checkout');
  else react(ctx, c, 'close.box', choice === 'boxRed' ? 'red' : 'gold');
}

export function reactThought(ctx: Ctx, c: CustomerDef, key: keyof NonNullable<CustomerReactions['thought']>): void {
  // 재방문이면 첫 만남의 속마음("나도 처음인데", "첫 판매다")을 되풀이하지 않는다
  if (effectiveVisit(ctx, c.id) >= 2) thought(ctx, returnsFor(ctx, c)?.thought?.[key]);
  // "첫 판매다"는 정말 그날 첫 판매일 때만
  else if (key === 'sold' && ctx.state.salesCount > 1) return;
  else thought(ctx, c.reactions?.thought?.[key]);
}

