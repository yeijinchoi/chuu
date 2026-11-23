import { describe, expect, it } from 'vitest';
import { newCard, rolloverCards, scoreCare, tierFor } from '../../src/core/care';
import type { ClientCard, GameEvent } from '../../src/core/types';
import { act, customer, data, encOf, newGame, registered, reject, rig, st, toAftercare, toTexting } from './helpers';

const score = (g: ReturnType<typeof newGame>, id: string) => st(g).cards[id]!.score;
const ofType = <T extends GameEvent['type']>(ev: GameEvent[], t: T) => ev.filter((e) => e.type === t) as Extract<GameEvent, { type: T }>[];

function afterGame(id: string, card: Partial<ClientCard>, shift: 'afternoon' | 'dawn' = 'afternoon', day = 1) {
  const g = newGame(1);
  st(g).day = day;
  st(g).cards[id] = registered(id, shift, card);
  toAftercare(g, shift);
  return g;
}

describe('고객 관리: 점수 규칙 (GDD §6-2)', () => {
  it('thanks: 구매 당일 +1, 다음 날부터 +0', () => {
    const same = afterGame('hanyeoreum', { purchases: [{ productId: 'luna_tote_beige', day: 1 }] }, 'afternoon', 1);
    act(same, { type: 'sendCare', customerId: 'hanyeoreum', template: 'thanks' });
    expect(score(same, 'hanyeoreum')).toBe(3);
    const next = afterGame('hanyeoreum', { purchases: [{ productId: 'luna_tote_beige', day: 1 }], lastContactDay: 1 }, 'afternoon', 2);
    act(next, { type: 'sendCare', customerId: 'hanyeoreum', template: 'thanks' });
    expect(score(next, 'hanyeoreum')).toBe(2);
  });

  it('occasion: 기록된 기념일 당일 +2, 날짜가 틀리면 −1', () => {
    const card = { occasion: { label: '엄마 생신', day: 2 }, purchases: [{ productId: 'luna_tote_beige', day: 1 }] };
    const right = afterGame('hanyeoreum', card, 'afternoon', 2);
    act(right, { type: 'sendCare', customerId: 'hanyeoreum', template: 'occasion' });
    expect(score(right, 'hanyeoreum')).toBe(4);
    const wrong = afterGame('hanyeoreum', card, 'afternoon', 1);
    act(wrong, { type: 'sendCare', customerId: 'hanyeoreum', template: 'occasion' });
    expect(score(wrong, 'hanyeoreum')).toBe(1);
    const unknown = afterGame('hanyeoreum', {}, 'afternoon', 2); // 기념일을 알아내지 못했다
    act(unknown, { type: 'sendCare', customerId: 'hanyeoreum', template: 'occasion' });
    expect(score(unknown, 'hanyeoreum')).toBe(1);
  });

  it('recommend: 부서·색이 카드와 맞으면 +1, 다르면 −1, 상품 필수', () => {
    const card = { category: 'bag' as const, color: 'beige' as const };
    const ok = afterGame('hanyeoreum', card);
    act(ok, { type: 'sendCare', customerId: 'hanyeoreum', template: 'recommend', productId: 'luna_tote_beige' });
    expect(score(ok, 'hanyeoreum')).toBe(3);
    const bad = afterGame('hanyeoreum', card);
    act(bad, { type: 'sendCare', customerId: 'hanyeoreum', template: 'recommend', productId: 'tailored_suit' });
    expect(score(bad, 'hanyeoreum')).toBe(1);
    reject(afterGame('hanyeoreum', card), { type: 'sendCare', customerId: 'hanyeoreum', template: 'recommend' });
    reject(afterGame('hanyeoreum', card), { type: 'sendCare', customerId: 'hanyeoreum', template: 'recommend', productId: 'inner_bag' }); // 새벽 상품
  });

  it('checkin: 싫어하는 손님(강도윤) −1, 그 밖은 +1', () => {
    const kang = afterGame('kang', {});
    act(kang, { type: 'sendCare', customerId: 'kang', template: 'checkin' });
    expect(score(kang, 'kang')).toBe(1);
    const park = afterGame('park', {});
    act(park, { type: 'sendCare', customerId: 'park', template: 'checkin' });
    expect(score(park, 'park')).toBe(3);
  });

  it('과잉 연락: 같은 날 2통째는 −1 (오미란은 0)', () => {
    const g = afterGame('park', { occasion: { label: '결혼 40주년', day: 2 } }, 'afternoon', 2);
    act(g, { type: 'sendCare', customerId: 'park', template: 'checkin' }); // +1
    act(g, { type: 'sendCare', customerId: 'park', template: 'occasion' }); // +2 −1
    expect(score(g, 'park')).toBe(2 + 1 + 1);
    const oh = afterGame('oh', {});
    act(oh, { type: 'sendCare', customerId: 'oh', template: 'checkin' });
    act(oh, { type: 'sendCare', customerId: 'oh', template: 'checkin' });
    expect(score(oh, 'oh')).toBe(4); // 과잉 연락 페널티 없음
  });

  it('답장 선택: 성격에 맞는 답장 +1', () => {
    const g = afterGame('hanyeoreum', { purchases: [{ productId: 'luna_tote_beige', day: 1 }] });
    const ev = act(g, { type: 'sendCare', customerId: 'hanyeoreum', template: 'thanks' });
    expect(ofType(ev, 'replyChoices')).toHaveLength(1);
    expect(score(g, 'hanyeoreum')).toBe(3);
    act(g, { type: 'chooseReply', customerId: 'hanyeoreum', option: 0 });
    expect(score(g, 'hanyeoreum')).toBe(4);
    reject(g, { type: 'chooseReply', customerId: 'hanyeoreum', option: 0 }); // 이미 답했다
    const h = afterGame('hanyeoreum', { purchases: [{ productId: 'luna_tote_beige', day: 1 }] });
    act(h, { type: 'sendCare', customerId: 'hanyeoreum', template: 'thanks' });
    act(h, { type: 'chooseReply', customerId: 'hanyeoreum', option: 1 });
    expect(score(h, 'hanyeoreum')).toBe(3);
  });

  it('등급 경계: ≤0 lost, 2~4 regular, 5~9 vip, 10+ lifetime', () => {
    expect([-1, 0].map(tierFor)).toEqual(['lost', 'lost']);
    expect([2, 3, 4].map(tierFor)).toEqual(['regular', 'regular', 'regular']);
    expect([5, 9].map(tierFor)).toEqual(['vip', 'vip']);
    expect([10, 11].map(tierFor)).toEqual(['lifetime', 'lifetime']);
  });

  it('등급은 관리 결과로 바뀌고 relationship 이벤트가 나온다. lost는 되돌아오지 않는다', () => {
    const g = afterGame('park', { score: 4 }, 'afternoon', 2);
    st(g).cards['park']!.occasion = { label: '결혼 40주년', day: 2 };
    const ev = act(g, { type: 'sendCare', customerId: 'park', template: 'occasion' });
    expect(ofType(ev, 'relationship')[0]).toMatchObject({ delta: 2, score: 6, tier: 'vip' });
    const lose = afterGame('kang', { score: 1 });
    const ev2 = act(lose, { type: 'sendCare', customerId: 'kang', template: 'checkin' });
    expect(ofType(ev2, 'relationship')[0]).toMatchObject({ score: 0, tier: 'lost' });
    reject(lose, { type: 'sendCare', customerId: 'kang', template: 'thanks' }); // 이탈: 반응 없음
  });

  it('단골 등록: 관계 점수 2에서 시작', () => {
    const g = rig('hanyeoreum', 'afternoon');
    act(g, { type: 'greet', style: 'warm' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'propose', productId: encOf(g).offered.find((id) => id === 'luna_tote_beige') ?? encOf(g).offered[0]! });
    act(g, { type: 'close', choice: 'boxGold' });
    expect(st(g).cards['hanyeoreum']).toMatchObject({ score: 0, tier: 'new' });
    const ev = act(g, { type: 'regularOffer', accept: true });
    expect(st(g).cards['hanyeoreum']).toMatchObject({ score: 2, tier: 'regular' });
    expect(ofType(ev, 'regular')).toHaveLength(1);
  });
});

describe('고객 관리: 방치', () => {
  const customers = Object.fromEntries(data.customers.map((c) => [c.id, c]));
  it('2일 연속 연락 없으면 오후 단골 −1 (1일 경과는 무사)', () => {
    const cards = { hanyeoreum: registered('hanyeoreum', 'afternoon', { lastContactDay: 1 }) };
    expect(rolloverCards(cards, 2, customers).decayed).toHaveLength(0);
    expect(cards.hanyeoreum.score).toBe(2);
    const r = rolloverCards(cards, 3, customers);
    expect(r.decayed[0]).toMatchObject({ customerId: 'hanyeoreum', delta: -1, score: 1 });
    rolloverCards(cards, 4, customers);
    expect(cards.hanyeoreum.tier).toBe('lost');
  });

  it('nextDay: 감점 후 다음 날 오후 브리핑, 하루 단위 값 초기화', () => {
    const g = newGame(1);
    const s = st(g);
    s.day = 3;
    s.cards['hanyeoreum'] = registered('hanyeoreum', 'afternoon', { lastContactDay: 1, sentToday: 2 });
    s.phase = { kind: 'results' };
    const ev = act(g, { type: 'nextDay' });
    expect(s.day).toBe(4);
    expect(s.phase).toEqual({ kind: 'briefing', shift: 'afternoon' });
    expect(ofType(ev, 'relationship')[0]).toMatchObject({ customerId: 'hanyeoreum', delta: -1 });
    expect(s.cards['hanyeoreum']!.sentToday).toBe(0);
    expect(s.salesCount).toBe(0);
  });

  it('새벽 단골 방치: 점수 대신 잊힌 단골 예약 (문 밖의 손님 제외)', () => {
    const customers2 = Object.fromEntries(data.customers.map((c) => [c.id, c]));
    const cards = {
      marsh: registered('marsh', 'dawn', { lastContactDay: 1 }),
      door: registered('door', 'dawn', { lastContactDay: 1 }),
    };
    const r = rolloverCards(cards, 3, customers2);
    expect(r.uninvited).toEqual(['marsh']);
    expect(cards.marsh.score).toBe(2);
  });
});

describe('고객 카드: 모르는 칸은 undefined', () => {
  it('새 카드의 알 수 없는 칸은 0이나 빈 문자열이 아니다', () => {
    const c = newCard('x', 'afternoon');
    for (const k of ['category', 'wants', 'color', 'budget', 'occasion'] as const) expect(c[k]).toBeUndefined();
    expect(c.notes).toEqual([]);
    expect(c.purchases).toEqual([]);
  });

  it('응대 중 알아낸 칸만 채워진다', () => {
    const g = rig('hanyeoreum', 'afternoon');
    act(g, { type: 'greet', style: 'warm' });
    const ev = act(g, { type: 'probe', probe: 'askCategory' });
    expect(ofType(ev, 'cardUpdate').map((e) => e.field)).toEqual(['category', 'wants']);
    const card = st(g).cards['hanyeoreum']!;
    expect(card).toMatchObject({ category: 'bag', wants: '토트백' });
    expect(card.color).toBeUndefined();
    expect(card.budget).toBeUndefined();
    expect(card.occasion).toBeUndefined();
    act(g, { type: 'probe', probe: 'observe' });
    expect(card.notes).toEqual(['긴장을 잘 함']);
    expect(card.color).toBeUndefined(); // 관찰은 색을 알려 주지 않는다
  });

  it('용도 → 색·기념일, 예산 → 예산', () => {
    const g = rig('kang', 'afternoon');
    act(g, { type: 'greet', style: 'direct' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'probe', probe: 'askBudget' });
    const card = st(g).cards['kang']!;
    expect(card).toMatchObject({ color: 'black', budget: 5000000, occasion: { label: '계약식', day: 2 } });
    expect(card.category).toBeUndefined();
  });

  it('"아무거나" 손님의 카드는 부서가 비어 있다', () => {
    const g = rig('faceless', 'dawn');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    expect(st(g).cards['faceless']!.category).toBeUndefined();
  });

  it('구매 이력과 마지막 연락', () => {
    const g = rig('hanyeoreum', 'afternoon');
    act(g, { type: 'greet', style: 'warm' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'propose', productId: encOf(g).offered[0]! });
    act(g, { type: 'close', choice: 'boxGold' });
    const card = st(g).cards['hanyeoreum']!;
    expect(card.purchases).toHaveLength(encOf(g).outcome === 'sold' ? 1 : 0);
    expect(card.lastContactDay).toBe(1);
  });
});

describe('새벽 단골 관리 (뒤틀린 규칙)', () => {
  const dawnCare = (id: string, template: string, extra: Partial<ClientCard> = {}) => {
    const g = afterGame(id, { purchases: [{ productId: 'x', day: 1 }], ...extra }, 'dawn');
    const ev = act(g, { type: 'sendCare', customerId: id, template: template as never });
    return { g, ev };
  };

  it('마시 씨: dawn_thanks +1, 이름이 들어간 템플릿 −2 (평정심은 그대로)', () => {
    const a = dawnCare('marsh', 'dawn_thanks');
    expect(score(a.g, 'marsh')).toBe(3);
    const b = dawnCare('marsh', 'dawn_checkin');
    expect(score(b.g, 'marsh')).toBe(0);
    expect(st(b.g).cards['marsh']!.tier).toBe('lost');
  });

  it('노란 옷의 배우: occasion·checkin 평정심 −15, 위반(공포 이벤트)은 아니다', () => {
    for (const t of ['dawn_occasion', 'dawn_checkin']) {
      const { g, ev } = dawnCare('actor', t);
      expect(st(g).composure).toBe(85);
      expect(ofType(ev, 'composure')[0]).toMatchObject({ delta: -15 });
      expect(ofType(ev, 'horror')).toHaveLength(0);
      expect(st(g).violations).toBe(0);
    }
    const { g } = dawnCare('actor', 'dawn_thanks'); // 칭찬이 아니다
    expect(st(g).composure).toBe(100);
  });

  it('모퉁이의 개: occasion 금기, 원통을 든 손님: checkin 금기 −15', () => {
    const h = dawnCare('hound', 'dawn_occasion');
    expect(st(h.g).composure).toBe(90);
    const c = dawnCare('cylinder', 'dawn_checkin');
    expect(st(c.g).composure).toBe(85);
    const c2 = dawnCare('cylinder', 'dawn_thanks');
    expect(st(c2.g).composure).toBe(100);
  });

  it('문 밖의 손님: 어떤 문자든 평정심 −10 + 다음 등장 1슬롯 빨라짐, 점수 영향 없음', () => {
    for (const t of ['dawn_thanks', 'dawn_occasion', 'dawn_recommend', 'dawn_checkin']) {
      const g = afterGame('door', { score: 0, tier: 'new', purchases: [{ productId: 'drowned_choker', day: 1 }] }, 'dawn');
      const id = t === 'dawn_recommend' ? { productId: 'drowned_choker' } : {};
      act(g, { type: 'sendCare', customerId: 'door', template: t as never, ...id });
      expect(st(g).composure).toBe(90);
      expect(st(g).earlierSlots['door']).toBe(1);
      expect(st(g).cards['door']!.tier).toBe('new');
    }
  });

  it('문 밖의 손님: 슬롯이 앞당겨진다', () => {
    const g = newGame(1);
    st(g).earlierSlots['marsh'] = 2; // 마시를 2슬롯 앞으로 (일정상 첫 번째라 그대로)
    st(g).earlierSlots['baek'] = 1;
    st(g).visitors['marsh'] = { time: '02:22', bonus: 0 };
    st(g).visitors['baek'] = { time: '03:33', bonus: 0 };
    toTexting(g, 'dawn');
    act(g, { type: 'finishTexting' });
    expect(st(g).slots.map((s) => [s.customerId, s.time])).toEqual([
      ['marsh', '02:22'], ['baek', '03:03'], ['faceless', '03:33'],
    ]);
    expect(st(g).earlierSlots).toEqual({});
  });

  it('얼굴 없는 여자: 애프터케어 때 빨간 상자 두기 (+1, 문자 1통 소모, 하루 한 번)', () => {
    const g = afterGame('faceless', {}, 'dawn');
    const before = st(g).texting.dawn.remaining;
    const ev = act(g, { type: 'placeRedBox' });
    expect(score(g, 'faceless')).toBe(3);
    expect(st(g).texting.dawn.remaining).toBe(before - 1);
    expect(ofType(ev, 'relationship')).toHaveLength(1);
    reject(g, { type: 'placeRedBox' });
    // 단골이 아니면 불가
    const h = newGame(1);
    toAftercare(h, 'dawn');
    reject(h, { type: 'placeRedBox' });
  });

  it('백설: 방문 날 감사 문자를 안 보내면 다음 새벽 방문 예약 (보내면 예약 없음)', () => {
    const none = afterGame('baek', { lastVisitDay: 1, purchases: [{ productId: 'warm_memory_glove', day: 1 }] }, 'dawn');
    act(none, { type: 'finishAftercare' });
    expect(st(none).pendingUninvited).toEqual(['baek']);

    const thanked = afterGame('baek', { lastVisitDay: 1, purchases: [{ productId: 'warm_memory_glove', day: 1 }] }, 'dawn');
    act(thanked, { type: 'sendCare', customerId: 'baek', template: 'dawn_thanks' });
    act(thanked, { type: 'finishAftercare' });
    expect(st(thanked).pendingUninvited).toEqual([]);
  });

  it('잊힌 단골은 다음 새벽에 초대 없이 와서 시작 호감 30, 평정심 −10', () => {
    const g = afterGame('baek', { lastVisitDay: 1, purchases: [{ productId: 'warm_memory_glove', day: 1 }] }, 'dawn');
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'nextDay' });
    expect(st(g).pendingUninvited).toEqual(['baek']);
    // 하루 건너뛰어 새벽으로
    toTexting(g, 'dawn');
    // 문자로 초대하지 않는다 → 잊힌 단골
    const ev = act(g, { type: 'finishTexting' });
    expect(st(g).slots.find((s) => s.customerId === 'baek')).toMatchObject({ uninvited: true, forgotten: true });
    expect(st(g).pendingUninvited).toEqual([]);
    // 얼굴 없는 여자 → 백설
    expect(ofType(ev, 'customerEnter')[0]!.customerId).toBe('faceless');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'propose', productId: encOf(g).offered[0]! });
    act(g, { type: 'close', choice: 'boxRed' });
    if (encOf(g).step === 'regularOffer') act(g, { type: 'regularOffer', accept: false });
    const ev2 = act(g, { type: 'advance' });
    expect(encOf(g).customerId).toBe('baek');
    expect(encOf(g).affinity).toBe(30);
    expect(st(g).composure).toBe(90);
    expect(ofType(ev2, 'composure')[0]).toMatchObject({ delta: -10 });
  });
});

describe('scoreCare 순수 함수', () => {
  it('프로필 없는 기본 동작', () => {
    const card = registered('x', 'afternoon');
    const profile = customer('park').care;
    expect(scoreCare(card, profile, 'checkin', 1)).toBe(1);
    expect(scoreCare({ ...card, sentToday: 1 }, profile, 'checkin', 1)).toBe(0);
  });
});
