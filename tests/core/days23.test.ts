import { describe, expect, it } from 'vitest';
import { applicableRules, checkChoice } from '../../src/core/rules';
import type { Game } from '../../src/core/game';
import type { CloseId, CustomerDef, GreetStyle, ProbeId } from '../../src/core/types';
import { act, customer, data, encOf, newGame, registered, rightDrink, st } from './helpers';

const PROBES: ProbeId[] = ['askCategory', 'askOccasion', 'observe', 'askBudget'];
const CLOSES: CloseId[] = ['boxGold', 'checkout', 'boxRed', 'tryOn'];

/** 규칙을 지키는 정답 루트로 한 손님을 끝까지 응대한다 */
function serveSafely(g: Game, talkOption: 0 | 1 = 1): string {
  const e0 = encOf(g);
  const c: CustomerDef = customer(e0.customerId);
  const shift = e0.shift;
  const rules = data.rules;
  const greet = ([c.greetPref, 'quiet', 'direct', 'warm'] as GreetStyle[]).find((s) => checkChoice(c, 'greet', s, rules, shift) === null) as GreetStyle;
  act(g, { type: 'greet', style: greet });
  if (encOf(g).step === 'serve') act(g, { type: 'serve', drink: rightDrink(c) });
  const must = applicableRules(c, rules).filter((r) => shift === 'dawn' && r.stage === 'probe' && r.require).map((r) => r.require as ProbeId);
  const probes = [...must];
  for (const p of PROBES) {
    if (probes.length >= 2) break;
    if (!probes.includes(p) && checkChoice(c, 'probe', p, rules, shift) === null && !(p === 'askBudget' && shift === 'afternoon' && !c.mentionsPrice)) probes.push(p);
  }
  for (const p of probes) act(g, { type: 'probe', probe: p });
  const offered = encOf(g).offered;
  const exact = c.onlyProduct ?? offered.find((id) => {
    const pr = data.products.find((x) => x.id === id)!;
    return pr.category === c.category && c.color !== null && pr.color === c.color;
  }) ?? offered[0]!;
  act(g, { type: 'propose', productId: exact });
  const needClose = applicableRules(c, rules).find((r) => shift === 'dawn' && r.stage === 'close' && r.require)?.require as CloseId | undefined;
  const close = needClose ?? CLOSES.find((x) => checkChoice(c, 'close', x, rules, shift) === null) as CloseId;
  act(g, { type: 'close', choice: close });
  if (encOf(g).step === 'talk') act(g, { type: 'talk', option: talkOption });
  if (encOf(g).step === 'regularOffer') act(g, { type: 'regularOffer', accept: true });
  const outcome = encOf(g).outcome;
  act(g, { type: 'advance' });
  return `${c.id}:${outcome}`;
}

/** 한 교대의 응대를 모두 끝낸다 */
function serveAll(g: Game): string[] {
  const out: string[] = [];
  while (st(g).phase.kind === 'encounter') out.push(serveSafely(g));
  return out;
}

function playDay(g: Game): { afternoon: string[]; dawn: string[] } {
  act(g, { type: 'ackBriefing' });
  act(g, { type: 'finishTexting' });
  const afternoon = serveAll(g);
  act(g, { type: 'finishAftercare' });
  act(g, { type: 'ackShiftBreak' });
  act(g, { type: 'ackBriefing' });
  act(g, { type: 'finishTexting' });
  const dawn = serveAll(g);
  return { afternoon, dawn };
}

describe('2·3일차', () => {
  it('2일차 일정: 오미란 → 한여름(재방문) → 윤재희 → 박정호, 새벽은 원통 → 배우 → 개', () => {
    const g = newGame(11);
    const d1 = playDay(g);
    expect(d1.afternoon.filter((x) => x.endsWith(':sold')).map((x) => x.split(':')[0])).toContain('hanyeoreum');
    act(g, { type: 'closingText', reply: false });
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'nextDay' });
    expect(st(g).day).toBe(2);
    // 2일차 아침: 오후 브리핑에 새 수칙 7·8·11이 오른다
    const ev = g.getState().log.slice(-40).filter((e) => e.type === 'line' && e.kind === 'note').map((e) => (e as { text: string }).text);
    expect(ev.some((t) => t.startsWith('7.'))).toBe(true);
    expect(ev.some((t) => t.startsWith('11.'))).toBe(true);
    expect(ev.some((t) => t.startsWith('9.'))).toBe(false);
    const d2 = playDay(g);
    expect(d2.afternoon.map((x) => x.split(':')[0])).toEqual(['oh', 'hanyeoreum', 'yoon', 'park']);
    expect(d2.dawn.map((x) => x.split(':')[0])).toEqual(['cylinder', 'actor', 'hound', 'baek']); // 04:10 잊힌 단골이 끼어든다
    // 줄거리 단서
    expect(st(g).clues).toEqual(expect.arrayContaining(['friday', 'sketchbook', 'guardLog']));
    // 재방문 한여름은 2회째
    expect(st(g).cards['hanyeoreum']?.visits).toBe(2);
  });

  it('2일차 04:44는 실루엣이 안쪽에서 보내는 문자', () => {
    const g = newGame(12);
    playDay(g);
    act(g, { type: 'closingText', reply: false });
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'nextDay' });
    playDay(g);
    const ev = act(g, { type: 'closingText', reply: false });
    const texts = ev.filter((e) => e.type === 'phone').map((e) => (e as { text: string }).text);
    expect(texts).toEqual(['……', '……', '……', '내일은 들어갈게.']);
  });

  it('3일차: 차은호 → 한서진 → 재방문, 새벽은 색 → 문 → 재방문, 그리고 서윤', () => {
    const g = newGame(13);
    playDay(g);
    act(g, { type: 'closingText', reply: false });
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'nextDay' });
    playDay(g);
    act(g, { type: 'closingText', reply: false });
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'nextDay' });
    expect(st(g).day).toBe(3);
    // 새벽 재방문·VIP 조건을 만들어 둔다 (이 시나리오는 마시 씨를 한 번 만났다고 가정)
    st(g).cards['marsh'] = registered('marsh', 'dawn', { visits: 2, purchases: [{ productId: 'breathing_pearl', day: 1 }], score: 9, tier: 'vip' });
    st(g).cards['baek'] = { ...(st(g).cards['baek'] as object), tier: 'vip', score: 8 } as never;
    const d3 = playDay(g);
    expect(d3.afternoon.slice(0, 2).map((x) => x.split(':')[0])).toEqual(['cha', 'seojin']);
    expect(['jin', 'kang', 'hanyeoreum']).toContain(d3.afternoon[2]!.split(':')[0]);
    expect(d3.dawn.map((x) => x.split(':')[0]).slice(0, 3)).toEqual(['colour', 'door', 'marsh']);
    expect(st(g).flags).toMatchObject({ ally: true, photo: true, lastWords: true, watch: true });
    expect(st(g).phase).toEqual({ kind: 'finale', allyTried: false });
    const acts = g.availableActions().map((a) => (a.type === 'finale' ? a.choice : a.type)).sort();
    expect(acts).toEqual(['ally', 'leave', 'yes']);
    const ev = act(g, { type: 'finale', choice: 'ally' });
    expect(ev.some((e) => e.type === 'ending' && e.ending === 'regulars')).toBe(true);
    expect(st(g).phase).toEqual({ kind: 'ending', ending: 'regulars' });
  });

  it('조건이 부족하면 서윤이 힌트를 주고 진열·퇴사만 남는다', () => {
    const g = newGame(14);
    st(g).day = 3;
    st(g).phase = { kind: 'finale', allyTried: false };
    st(g).flags = { ally: true };
    const ev = act(g, { type: 'finale', choice: 'ally' });
    expect(ev.some((e) => e.type === 'ending')).toBe(false);
    expect(ev.some((e) => e.type === 'line' && e.speaker === '서윤')).toBe(true);
    const acts = g.availableActions().map((a) => (a.type === 'finale' ? a.choice : a.type)).sort();
    expect(acts).toEqual(['leave', 'yes']);
    const end = act(g, { type: 'finale', choice: 'yes' });
    expect(end.some((e) => e.type === 'ending' && e.ending === 'display')).toBe(true);
  });

  it('협력자가 아니면 문자 선택지가 없다', () => {
    const g = newGame(15);
    st(g).phase = { kind: 'finale', allyTried: false };
    const acts = g.availableActions().map((a) => (a.type === 'finale' ? a.choice : a.type)).sort();
    expect(acts).toEqual(['leave', 'yes']);
    const end = act(g, { type: 'finale', choice: 'leave' });
    expect(end.some((e) => e.type === 'ending' && e.ending === 'resign')).toBe(true);
  });
});
