import { describe, expect, it } from 'vitest';
import { act, bestOffer, data, encOf, newGame, playAfternoon, playCorrect, st, toAftercare, txt } from './helpers';
import type { GameEvent } from '../../src/core/types';

function goldenPath(seed: number): { events: GameEvent[]; game: ReturnType<typeof newGame> } {
  const g = newGame(seed);
  const events: GameEvent[] = [];
  const A = (a: Parameters<typeof act>[1]): void => void events.push(...act(g, a));

  // ---- 오후
  expect(st(g).phase).toEqual({ kind: 'briefing', shift: 'afternoon' });
  A({ type: 'ackBriefing' });
  A({ type: 'sendText', contactId: 'kang', template: 'new_arrival' });
  A({ type: 'sendText', contactId: 'jin', template: 'private' });
  A({ type: 'finishTexting' });
  const order: string[] = [];
  for (const close of ['boxGold', 'boxRed', 'boxRed'] as const) {
    order.push(encOf(g).customerId);
    const c = data.customers.find((x) => x.id === encOf(g).customerId)!;
    A({ type: 'greet', style: c.greetPref });
    // VIP 대접: 진영숙(VVIP)만 이 단계가 있다. 메모대로 탄산수.
    if (encOf(g).step === 'serve') A({ type: 'serve', drink: 'water' });
    A({ type: 'probe', probe: 'askCategory' });
    A({ type: 'probe', probe: 'askOccasion' });
    const pid = bestOffer(g);
    A({ type: 'propose', productId: pid });
    A({ type: 'close', choice: close });
    if (encOf(g).step === 'regularOffer') A({ type: 'regularOffer', accept: true });
    A({ type: 'advance' });
  }
  expect(order).toEqual(['hanyeoreum', 'kang', 'jin']);
  expect(st(g).phase).toEqual({ kind: 'aftercare', shift: 'afternoon' });
  expect(st(g).clock).toBe('20:00');
  A({ type: 'sendCare', customerId: 'hanyeoreum', template: 'thanks' });
  A({ type: 'sendCare', customerId: 'jin', template: 'thanks' });
  A({ type: 'finishAftercare' });
  expect(st(g).phase.kind).toBe('shiftBreak');
  A({ type: 'ackShiftBreak' });
  expect(st(g).phase).toEqual({ kind: 'briefing', shift: 'dawn' });
  expect(st(g).shift).toBe('dawn');

  // ---- 새벽
  A({ type: 'ackBriefing' });
  expect(st(g).clock).toBe('01:50');
  A({ type: 'sendText', contactId: 'marsh', template: 'dawn_offer' });
  A({ type: 'sendText', contactId: 'baek', template: 'dawn_name' });
  A({ type: 'finishTexting' });
  const dawnOrder: string[] = [];
  const times: string[] = [];
  for (const close of ['checkout', 'boxRed', 'boxGold'] as const) {
    dawnOrder.push(encOf(g).customerId);
    times.push(st(g).clock);
    const c = data.customers.find((x) => x.id === encOf(g).customerId)!;
    A({ type: 'greet', style: c.greetPref });
    A({ type: 'probe', probe: 'askCategory' });
    A({ type: 'probe', probe: 'askOccasion' });
    const pid = bestOffer(g);
    A({ type: 'propose', productId: pid });
    A({ type: 'close', choice: close });
    if (encOf(g).step === 'regularOffer') A({ type: 'regularOffer', accept: true });
    A({ type: 'advance' });
  }
  expect(dawnOrder).toEqual(['marsh', 'faceless', 'baek']);
  expect(times).toEqual(['02:22', '03:03', '03:33']);
  expect(st(g).phase).toEqual({ kind: 'closingText' });
  expect(st(g).clock).toBe('04:44');
  A({ type: 'closingText', reply: false }); // 무시
  expect(st(g).phase).toEqual({ kind: 'aftercare', shift: 'dawn' });
  A({ type: 'sendCare', customerId: 'baek', template: 'dawn_thanks' });
  A({ type: 'sendCare', customerId: 'marsh', template: 'dawn_thanks' });
  A({ type: 'finishAftercare' });
  return { events, game: g };
}

describe('1일차 정답 루트 (dispatch만 사용)', () => {
  it('판매 6건, 매너 실수 0, 위반 0, 감사 문자 4통, 등급 S', () => {
    const { game: g } = goldenPath(11);
    const s = st(g);
    expect(s.phase.kind).toBe('results');
    expect(s.salesCount).toBe(6);
    expect(s.mannerSlips).toBe(0);
    expect(s.violations).toBe(0);
    expect(s.thanksSent).toBe(4);
    expect(s.composure).toBe(100);
    expect(s.results?.grade).toBe('S');
    expect(s.results?.comment).toBe(txt('strings/results/gradeComment/S'));
    // 오후 매출 = 세 상품 가격 합, 새벽은 장부로
    expect(s.revenue).toBeGreaterThan(0);
    expect(s.dawnLedger.map((x) => x.customerId)).toEqual(['marsh', 'faceless', 'baek']);
    expect(s.results?.dawnLedgerTotal).toBe(8800000 + 3333333 + 4400000);
    expect(s.newRegulars.length).toBe(6);
  });

  it('같은 시드면 같은 이벤트 로그, 다른 시드면 제안 순서가 달라질 수 있다', () => {
    const a = goldenPath(5);
    const b = goldenPath(5);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('하루 흐름: title → briefing → texting → encounter → aftercare → shiftBreak → … → results', () => {
    const g = newGame(3);
    const kinds: string[] = [];
    const seen = (): void => {
      const k = st(g).phase.kind;
      if (kinds[kinds.length - 1] !== k) kinds.push(k);
    };
    seen();
    act(g, { type: 'ackBriefing' }); seen();
    act(g, { type: 'finishTexting' }); seen(); // 아무에게도 문자 안 보냄 → 한여름만
    playCorrect(g); act(g, { type: 'advance' }); seen();
    act(g, { type: 'finishAftercare' }); seen();
    act(g, { type: 'ackShiftBreak' }); seen();
    act(g, { type: 'ackBriefing' }); seen();
    act(g, { type: 'finishTexting' }); seen();
    expect(kinds).toEqual(['briefing', 'texting', 'encounter', 'aftercare', 'shiftBreak', 'briefing', 'texting', 'encounter']);
    // 문자를 안 받은 단골은 오지 않는다: 오후는 한여름 한 명뿐
  });
});

describe('평정심 0 → 배드엔딩', () => {
  it('위반 루트: 마시 관찰(−25), 얼굴 없는 여자 가격(−25), 백설 시착(−25), 04:44 답장(−30)', () => {
    const g = newGame(9);
    playAfternoon(g);
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'ackShiftBreak' });
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'sendText', contactId: 'marsh', template: 'dawn_offer' });
    act(g, { type: 'finishTexting' });
    // 마시: 눈을 본다 (수칙 5)
    act(g, { type: 'greet', style: 'quiet' });
    const ev1 = act(g, { type: 'probe', probe: 'observe' });
    expect(ev1.some((e) => e.type === 'violation' && e.rule === 5)).toBe(true);
    expect(ev1.some((e) => e.type === 'horror' && e.kind === 'breach')).toBe(true);
    expect(st(g).composure).toBe(75);
    expect(encOf(g).outcome).toBe('horror');
    act(g, { type: 'advance' });
    // 얼굴 없는 여자: 가격 (수칙 2)
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askBudget' });
    expect(st(g).composure).toBe(50);
    act(g, { type: 'advance' });
    // 백설: 시착 (수칙 1)
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'propose', productId: bestOffer(g) });
    act(g, { type: 'close', choice: 'tryOn' });
    expect(st(g).composure).toBe(25);
    expect(st(g).violations).toBe(3);
    act(g, { type: 'advance' });
    // 04:44 답장 (수칙 3): 평정심 25 → 0
    const ev = act(g, { type: 'closingText', reply: true });
    expect(ev.some((e) => e.type === 'violation' && e.rule === 3)).toBe(true);
    expect(st(g).composure).toBe(0);
    expect(st(g).phase.kind).toBe('badEnding');
    expect(ev.some((e) => e.type === 'phase' && e.phase === 'badEnding')).toBe(true);
  });

  it('어느 단계에서든 평정심 0이면 즉시 배드엔딩 (응대 중 위반)', () => {
    const g = newGame(2);
    playAfternoon(g);
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'ackShiftBreak' });
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'finishTexting' }); // 마시 없음, 얼굴 없는 여자 먼저
    st(g).composure = 20;
    act(g, { type: 'greet', style: 'quiet' });
    const ev = act(g, { type: 'probe', probe: 'askBudget' });
    expect(st(g).composure).toBe(0);
    expect(st(g).phase.kind).toBe('badEnding');
    expect(ev.at(-1)).toEqual({ type: 'phase', phase: 'badEnding' });
    // 배드엔딩에서는 더 이상 액션이 없다
    expect(g.availableActions()).toEqual([]);
  });

  it('04:44 무시하면 위반 없이 애프터케어로', () => {
    const g = newGame(2);
    playAfternoon(g);
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'ackShiftBreak' });
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'finishTexting' });
    for (let i = 0; i < 2; i++) { playCorrect(g); act(g, { type: 'advance' }); }
    expect(st(g).phase.kind).toBe('closingText');
    const ev = act(g, { type: 'closingText', reply: false });
    expect(ev.filter((e) => e.type === 'phone').map((e) => (e as { text: string }).text).at(-1)).toBe(txt('strings/closingText/ignored/#2'));
    expect(st(g).violations).toBe(0);
    expect(st(g).phase).toEqual({ kind: 'aftercare', shift: 'dawn' });
  });
});

describe('잘못된 액션', () => {
  it('throw하지 않고 [] 반환 + console.warn', () => {
    const g = newGame(1);
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned++; };
    try {
      expect(g.dispatch({ type: 'greet', style: 'warm' })).toEqual([]);
      expect(g.dispatch({ type: 'close', choice: 'boxRed' })).toEqual([]);
      expect(g.dispatch({ type: 'sendText', contactId: 'nobody', template: 'private' })).toEqual([]);
      expect(warned).toBe(3);
    } finally {
      console.warn = warn;
    }
    toAftercare(g, 'afternoon');
  });
});
