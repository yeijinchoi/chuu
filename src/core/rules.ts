import type { CustomerDef, RuleDef, RuleId, Shift, Stage } from './types';

export type CheckResult = { kind: 'manner' } | { kind: 'rule'; rule: RuleId } | null;

/** 04:44 문자 수칙 (stage 'event'). 판정은 closingText 처리에서 직접 한다. */
export const CLOSING_TEXT_RULE: RuleId = 3;

/** 새벽에 이 손님에게 적용되는 수칙: 손님에게 걸린 것 + universal(2번), 예외(9번) 반영 */
export function applicableRules(customer: CustomerDef, ruleDefs: readonly RuleDef[]): RuleDef[] {
  const own = ruleDefs.filter((r) => customer.rules.includes(r.id));
  const exempted = new Set<RuleId>(own.flatMap((r) => r.exempts ?? []));
  const universal = ruleDefs.filter(
    (r) =>
      r.universal &&
      !customer.rules.includes(r.id) &&
      !exempted.has(r.id) &&
      !(r.unlessMentionsPrice && customer.mentionsPrice),
  );
  return [...own.filter((r) => !exempted.has(r.id)), ...universal];
}

/**
 * 범용 판정. 수칙은 RuleDef 데이터가 정한다.
 * - 오후: askBudget && !mentionsPrice → manner. 그 밖의 판정 없음.
 * - 새벽: 적용 수칙의 forbid에 든 선택이면 위반.
 */
export function checkChoice(
  customer: CustomerDef,
  stage: Stage,
  choice: string,
  ruleDefs: readonly RuleDef[],
  shift: Shift,
): CheckResult {
  if (shift === 'afternoon') {
    if (stage === 'probe' && choice === 'askBudget' && !customer.mentionsPrice) return { kind: 'manner' };
    return null;
  }
  for (const r of applicableRules(customer, ruleDefs)) {
    if (r.stage === stage && r.forbid?.includes(choice)) return { kind: 'rule', rule: r.id };
  }
  return null;
}

/**
 * 단계가 끝날 때 검사하는 require 수칙. picked는 그 단계에서 고른 것 전체
 * (니즈 파악: 쓴 질문들, 제안: [상품 id], 클로징: [선택]). 새벽에만 적용된다.
 */
export function checkRequire(
  customer: CustomerDef,
  stage: Stage,
  picked: readonly string[],
  ruleDefs: readonly RuleDef[],
  shift: Shift,
): RuleId | null {
  if (shift !== 'dawn') return null;
  for (const r of applicableRules(customer, ruleDefs)) {
    if (r.stage === stage && r.require !== undefined && !picked.includes(r.require)) return r.id;
  }
  return null;
}

/** 3번: 04:44 문자에 답장하면 위반 */
export function checkClosingReply(reply: boolean, ruleDefs: readonly RuleDef[]): RuleId | null {
  if (!reply) return null;
  return ruleDefs.some((r) => r.id === CLOSING_TEXT_RULE && r.stage === 'event') ? CLOSING_TEXT_RULE : null;
}
