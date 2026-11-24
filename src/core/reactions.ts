import { narrate, thought, type Ctx } from './ctx';
import type { CloseId, CustomerDef, CustomerReactions, GreetStyle, Product } from './types';
import { effectiveBudget } from './encounter';
import { effectiveVisit, returnsFor } from './plot';

/** 반응 종류 → 데이터 경로. 손님 데이터(reactions)에 없으면 strings의 공통 반응을 쓴다. */
export type ReactionKey =
  | 'greet.match' | 'greet.mismatch'
  | 'propose.perfect' | 'propose.deptOnly' | 'propose.wrong' | 'propose.overBudget' | 'propose.notThis'
  | 'close.tryOn' | 'close.box' | 'close.checkout'
  | 'regular.accept' | 'regular.decline'
  | 'manner' | 'leave';

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
  // 이 방문만의 반응 → 손님 반응 → (손님 거절 반응) → 공통 반응
  const visit = returnsFor(ctx, c)?.reactions;
  const own = pick(visit, key, sub) ?? pick(c.reactions, key, sub);
  if (own) return own;
  if (key === 'propose.notThis') return reactionText(ctx, c, 'propose.wrong');
  return pick(ctx.data.strings, `reactions.common.${key}`, sub);
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

export type ProposeKind = 'perfect' | 'deptOnly' | 'wrong' | 'overBudget' | 'notThis';

/** 이 방문에 손님이 원하는 상품 목록(없으면 undefined = 카테고리·색으로 판단) */
export function acceptsFor(ctx: Ctx, c: CustomerDef): string[] | undefined {
  return returnsFor(ctx, c)?.accepts ?? c.accepts;
}

/** 제안 결과 분류: 다른 카테고리 → wrong, 예산 초과 → overBudget, 색까지 맞음 → perfect, 아니면 deptOnly. "아무거나" 손님은 항상 perfect */
export function classifyProposal(ctx: Ctx, c: CustomerDef, product: Product): ProposeKind {
  if (c.traits.wantsAnything || c.category === 'any') return 'perfect';
  if (product.category !== c.category) return 'wrong';
  const budget = effectiveBudget(c, ctx.state.cards[c.id]);
  if (budget !== null && product.price > budget) return 'overBudget';
  if (c.color !== null && product.color !== c.color) return 'deptOnly';
  // 같은 카테고리·색이어도 손님이 찾는 그 물건이 아니면 거절 (진주를 찾는데 시계 등)
  const accepts = acceptsFor(ctx, c);
  if (accepts && !accepts.includes(product.id)) return 'notThis';
  return 'perfect';
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
  // 재방문이면 첫 만남의 속마음("나도 처음인데")을 되풀이하지 않는다
  if (effectiveVisit(ctx, c.id) >= 2) thought(ctx, returnsFor(ctx, c)?.thought?.[key]);
  else thought(ctx, c.reactions?.thought?.[key]);
}

