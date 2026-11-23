import { narrate, setClock, setPhase, str, strList, thought, type Ctx } from './ctx';
import { isRegistered } from './care';
import type { CustomerDef, EndingId, PlotBeat } from './types';

/** 줄거리 단서·플래그와 5일차 마지막 장면(서윤의 04:44) 및 엔딩 3종 (SCRIPT_DAY2_3 §2~3). */

export function hasFlag(ctx: Ctx, flag: string): boolean {
  return ctx.state.flags[flag] === true;
}

export function setFlag(ctx: Ctx, flag: string): void {
  ctx.state.flags[flag] = true;
}

/** 단서 메모를 얻는다 (메모 앱 「손님 메모」 폴더). 같은 단서는 한 번만. */
export function grantClue(ctx: Ctx, id: string): void {
  if (ctx.state.clues.includes(id)) return;
  ctx.state.clues.push(id);
  ctx.emit({ type: 'clue', id });
}

/**
 * 재방문 대사·사건에 쓰는 방문 횟수. 마지막 날(5일차)에 온 손님은 두 번째 방문이어도 마지막 대사(3회째)를 쓴다
 * (SCRIPT_DAY2_3 §0-1). 그 전 날들은 실제 방문 횟수를 그대로 쓴다.
 */
export function effectiveVisit(ctx: Ctx, customerId: string): number {
  const v = ctx.state.cards[customerId]?.visits ?? 1;
  return v >= 2 && ctx.state.day >= FINAL_DAY ? Math.max(v, 3) : v;
}

/** 마지막 근무일 */
export const FINAL_DAY = 5;

/** "> "로 시작하면 지문, 아니면 손님의 대사 */
export function sayLine(ctx: Ctx, c: CustomerDef | null, text: string): void {
  if (text.startsWith('> ')) ctx.emit({ type: 'line', speaker: null, text: text.slice(2) });
  else ctx.emit({ type: 'line', speaker: c?.name ?? null, text });
}

export function playBeat(ctx: Ctx, c: CustomerDef, beat: PlotBeat): void {
  for (const l of beat.lines ?? []) sayLine(ctx, c, l);
  thought(ctx, beat.thought);
  if (beat.clue) grantClue(ctx, beat.clue);
  if (beat.flag) setFlag(ctx, beat.flag);
}

/** 이 방문에 해당하는 사건만 골라 실행 */
export function runBeats(ctx: Ctx, c: CustomerDef, beats: readonly PlotBeat[] | undefined): void {
  if (!beats) return;
  const s = ctx.state;
  const visit = effectiveVisit(ctx, c.id);
  for (const b of beats) {
    if (b.day !== undefined && b.day !== s.day) continue;
    if (b.visit !== undefined && visit < b.visit) continue; // N번째 방문 이후
    if (b.clue && s.clues.includes(b.clue)) continue; // 이미 얻은 단서의 사건은 되풀이하지 않는다
    playBeat(ctx, c, b);
  }
}

// ------------------------------------------------------------------ 5일차 04:44

export const SEOYUN = '서윤';

/** 엔딩 C 조건 (§S3-10): ① 한서진 협력 ② 서윤의 마지막 말 ③ 서윤의 시계 ④ 새벽 VIP 2명 이상 */
export function trueEndingMissing(ctx: Ctx): string[] {
  const s = ctx.state;
  const miss: string[] = [];
  if (!hasFlag(ctx, 'ally')) miss.push('ally');
  if (!hasFlag(ctx, 'lastWords')) miss.push('lastWords');
  if (!hasFlag(ctx, 'watch')) miss.push('watch');
  const dawnVips = ctx.data.customers.filter((c) => {
    const card = s.cards[c.id];
    return c.shift === 'dawn' && card !== undefined && (card.tier === 'vip' || card.tier === 'lifetime');
  }).length;
  if (dawnVips < 2) miss.push('vip');
  return miss;
}

/** 5일 누적 매출이 이만큼이면 "실적 1위" */
export const TOP_SELLER_REVENUE = 40_000_000;
/** 마지막 밤 평정심이 이만큼 남아 있고 위반이 없으면 "정규직 전환" */
export const TENURE_COMPOSURE = 70;
const DAWN_BONDS = ['marsh', 'baek', 'faceless'] as const;

/** "…네."의 결말: 한서진에게 문자했다가 부족했다면 자매가 함께 진열되고, 실적이 높으면 실적 1위로 진열된다 */
export function yesEnding(ctx: Ctx, allyTried: boolean): EndingId {
  if (allyTried) return 'twinDisplay';
  return ctx.state.totalRevenue >= TOP_SELLER_REVENUE ? 'topSeller' : 'display';
}

/** 가장 가까운 새벽 단골(VIP 이상 중 관계 점수가 가장 높은 손님) */
export function dawnBond(ctx: Ctx): (typeof DAWN_BONDS)[number] | null {
  let best: (typeof DAWN_BONDS)[number] | null = null;
  let score = -Infinity;
  for (const id of DAWN_BONDS) {
    const card = ctx.state.cards[id];
    if (!card || (card.tier !== 'vip' && card.tier !== 'lifetime')) continue;
    if (card.score > score) { best = id; score = card.score; }
  }
  return best;
}

/** "퇴근할게요"의 결말: 한서진이 도착했다면 서진의 문, 아니면 새벽 단골 > 무사고 근무 > 빈 명부 > 퇴사 순 */
export function leaveEnding(ctx: Ctx, allyTried: boolean): EndingId {
  if (allyTried) return 'sisterDoor';
  const bond = dawnBond(ctx);
  if (bond) return bond;
  const s = ctx.state;
  if (s.totalViolations + s.violations === 0 && s.composure >= TENURE_COMPOSURE) return 'tenure';
  if (endingSummary(ctx).regulars === 0) return 'emptyBook';
  return 'resign';
}

export function beginFinale(ctx: Ctx): void {
  setPhase(ctx, { kind: 'finale', allyTried: false });
  setClock(ctx, ctx.data.days[ctx.state.day]?.clocks.closingText ?? '04:44');
  const from = str(ctx.data, 'finale.from');
  for (const text of strList(ctx.data, 'finale.incoming')) ctx.emit({ type: 'phone', from, text });
  ctx.emit({ type: 'sfx', id: 'phone_buzz' });
  ctx.emit({ type: 'sfx', id: 'phone_buzz' });
  ctx.emit({ type: 'horror', customerId: null, kind: 'blackout' });
  for (const l of strList(ctx.data, 'finale.scene')) narrate(ctx, l);
  for (const l of strList(ctx.data, 'finale.seoyun')) ctx.emit({ type: 'line', speaker: SEOYUN, text: l });
}

export function doFinale(ctx: Ctx, choice: 'yes' | 'ally' | 'leave'): boolean {
  const p = ctx.state.phase;
  if (p.kind !== 'finale') return false;
  if (choice === 'yes') return endWith(ctx, yesEnding(ctx, p.allyTried));
  if (choice === 'leave') return endWith(ctx, leaveEnding(ctx, p.allyTried));
  // 한서진에게 문자한다: 협력자여야만 가능
  if (!hasFlag(ctx, 'ally') || p.allyTried) return false;
  for (const l of strList(ctx.data, 'finale.allyText')) ctx.emit({ type: 'phone', from: str(ctx.data, 'finale.allyFrom'), text: l });
  ctx.emit({ type: 'sfx', id: 'phone_buzz' });
  const miss = trueEndingMissing(ctx);
  if (miss.length === 0) return endWith(ctx, 'regulars');
  p.allyTried = true;
  for (const l of strList(ctx.data, 'finale.notEnough')) ctx.emit({ type: 'line', speaker: SEOYUN, text: l });
  const hint = str(ctx.data, `finale.hint.${miss[0]}`);
  if (hint) ctx.emit({ type: 'line', speaker: SEOYUN, text: hint });
  return true;
}

function endWith(ctx: Ctx, ending: EndingId): boolean {
  for (const raw of strList(ctx.data, `ending.${ending}.scene`)) {
    const l = raw.replace(/\{name\}/g, ctx.state.playerName);
    if (l.startsWith('> ')) narrate(ctx, l.slice(2));
    else {
      const i = l.indexOf(': ');
      const speaker = i > 0 && i < 14 ? l.slice(0, i) : null;
      ctx.emit({ type: 'line', speaker, text: speaker ? l.slice(i + 2) : l });
    }
  }
  ctx.emit({ type: 'ending', ending });
  if (ctx.state.phase.kind !== 'badEnding') setPhase(ctx, { kind: 'ending', ending });
  return true;
}

/** 엔딩 요약용: 얼마나 모았나 */
export function endingSummary(ctx: Ctx): { vips: number; regulars: number } {
  const cards = Object.values(ctx.state.cards);
  return { vips: cards.filter((c) => c.tier === 'vip' || c.tier === 'lifetime').length, regulars: cards.filter((c) => isRegistered(c)).length };
}
