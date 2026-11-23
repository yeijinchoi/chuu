import { str, type Ctx } from './ctx';
import type { DayResult, Grade } from './types';

/** 등급 (GDD §10). S: 판매 5건 이상, 위반 0, 감사 문자 4통 이상 */
export function gradeFor(sales: number, violations: number, thanks: number): Grade['grade'] {
  if (sales >= 5 && violations === 0 && thanks >= 4) return 'S';
  if (sales >= 4 && violations <= 1) return 'A';
  if (sales >= 3) return 'B';
  return 'C';
}

export function computeResults(ctx: Ctx): DayResult {
  const s = ctx.state;
  const grade = gradeFor(s.salesCount, s.violations, s.thanksSent);
  return {
    grade,
    comment: str(ctx.data, `results.gradeComment.${grade}`),
    revenue: s.revenue,
    dawnLedger: s.dawnLedger.map((x) => ({ ...x })),
    dawnLedgerTotal: s.dawnLedger.reduce((a, x) => a + x.amount, 0),
    salesCount: s.salesCount,
    mannerSlips: s.mannerSlips,
    violations: s.violations,
    thanksSent: s.thanksSent,
    composure: s.composure,
    newRegulars: [...s.newRegulars],
  };
}
