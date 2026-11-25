import { describe, expect, it } from 'vitest';
import { act, newGame, playAfternoon, playCorrect, registered, st, toAftercare, toTexting, txt } from './helpers';
import type { GameEvent } from '../../src/core/types';

/** M4: 업무폰 UI가 의존하는 코어 동작 (비활성 사유, 효과음 이벤트, 04:44 순서) */

describe('문자 비활성 사유 (blockReason)', () => {
  it('영업 문자: 보낼 수 있으면 null, 보낸 연락처는 sent', () => {
    const g = newGame();
    act(g, { type: 'ackBriefing' });
    expect(g.blockReason({ type: 'sendText', contactId: 'kang', template: 'new_arrival' })).toBeNull();
    act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
    expect(g.blockReason({ type: 'sendText', contactId: 'kang', template: 'private' })).toBe('sent');
  });

  it('영업 문자: 영업 한도 2통을 채우면 salesCap, 총량이 바닥나면 noneLeft', () => {
    const g = newGame();
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
    act(g, { type: 'sendText', contactId: 'jin', template: 'private' });
    expect(g.blockReason({ type: 'sendText', contactId: 'oh', template: 'greeting' })).toBe('salesCap');
    st(g).texting.afternoon.remaining = 0;
    expect(g.blockReason({ type: 'sendText', contactId: 'oh', template: 'greeting' })).toBe('noneLeft');
  });

  it('영업 문자: 지금 교대의 템플릿이 아니면 unknown, 문자 단계가 아니면 phase', () => {
    const g = newGame();
    expect(g.blockReason({ type: 'sendText', contactId: 'kang', template: 'new_arrival' })).toBe('phase');
    act(g, { type: 'ackBriefing' });
    expect(g.blockReason({ type: 'sendText', contactId: 'kang', template: 'dawn_open' })).toBe('unknown');
    expect(g.blockReason({ type: 'sendText', contactId: 'marsh', template: 'new_arrival' })).toBe('unknown');
  });

  it('관리 문자: 구매 없음 / 단골 아님 / 이탈 / 상품 미선택', () => {
    const g = newGame();
    toAftercare(g, 'afternoon');
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'thanks' })).toBe('noPurchase');
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'checkin' })).toBe('notRegistered');
    st(g).cards['kang'] = registered('kang', 'afternoon', { purchases: [{ productId: 'luna_tote_beige', day: 1 }] });
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'thanks' })).toBeNull();
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'recommend' })).toBe('noProduct');
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'recommend', productId: 'luna_tote_beige' })).toBeNull();
    st(g).cards['kang']!.tier = 'lost';
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'checkin' })).toBe('lost');
  });

  it('관리 문자: 감사 문자는 애프터케어 2통 한도(noAftercare), 그 밖은 문자 한도(noneLeft)', () => {
    const g = newGame();
    toAftercare(g, 'afternoon');
    st(g).cards['kang'] = registered('kang', 'afternoon', { purchases: [{ productId: 'luna_tote_beige', day: 1 }] });
    st(g).aftercareRemaining = 0;
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'thanks' })).toBe('noAftercare');
    st(g).texting.afternoon.remaining = 0;
    expect(g.blockReason({ type: 'sendCare', customerId: 'kang', template: 'checkin' })).toBe('noneLeft');
  });

  it('관리 문자: 연락 수단이 없는 손님은 unreachable, 가능한 액션과 사유가 일치한다', () => {
    const g = newGame();
    toTexting(g, 'dawn');
    st(g).cards['colour'] = registered('colour', 'dawn');
    expect(g.blockReason({ type: 'sendCare', customerId: 'colour', template: 'dawn_checkin' })).toBe('unreachable');
    for (const a of g.availableActions()) {
      if (a.type === 'sendText' || a.type === 'sendCare') expect(g.blockReason(a), JSON.stringify(a)).toBeNull();
    }
  });
});

describe('효과음 이벤트', () => {
  it('오후 문자를 마치면 sign_flip(OPEN), 애프터케어에 들어가면 sign_flip(CLOSED)', () => {
    const g = newGame();
    act(g, { type: 'ackBriefing' });
    const ev = act(g, { type: 'finishTexting' });
    expect(ev.filter((e) => e.type === 'sfx' && e.id === 'sign_flip')).toHaveLength(1);
    const evs: GameEvent[] = [];
    while (st(g).phase.kind === 'encounter') { playCorrect(g); evs.push(...act(g, { type: 'advance' })); }
    expect(evs.filter((e) => e.type === 'sfx' && e.id === 'sign_flip')).toHaveLength(1);
    expect(st(g).phase.kind).toBe('aftercare');
  });
});

describe('04:44 문자 (S12)', () => {
  function toClosing() {
    const g = newGame(2);
    playAfternoon(g);
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'ackShiftBreak' });
    act(g, { type: 'ackBriefing' });
    const ev = act(g, { type: 'finishTexting' });
    void ev;
    const all: GameEvent[] = [];
    for (let i = 0; i < 2; i++) { playCorrect(g); all.push(...act(g, { type: 'advance' })); }
    return { g, all };
  }

  it('도착 진동은 두 번, 발신자는 나, 문장은 세 줄', () => {
    const { all } = toClosing();
    expect(all.filter((e) => e.type === 'sfx' && e.id === 'phone_buzz')).toHaveLength(2);
    const lines = all.filter((e): e is Extract<GameEvent, { type: 'phone' }> => e.type === 'phone');
    expect(lines.map((e) => e.from)).toEqual(['나', '나', '나']);
    expect(lines.map((e) => e.text)).toEqual([txt('strings/closingText/incoming/#0'), txt('strings/closingText/incoming/#1'), txt('strings/closingText/incoming/#2')]);
  });

  it('무시: …… ×2 다음 내일 봐.', () => {
    const { g } = toClosing();
    const ev = act(g, { type: 'closingText', reply: false });
    expect(ev.filter((e) => e.type === 'phone').map((e) => (e as { text: string }).text)).toEqual([txt('strings/closingText/ignored/#0'), txt('strings/closingText/ignored/#1'), txt('strings/closingText/ignored/#2')]);
  });

  it('답장: 블랙아웃과 glass_tap이 먼저, 그 뒤에 실루엣의 답장, 마지막에 평정심 감소', () => {
    const { g } = toClosing();
    const ev = act(g, { type: 'closingText', reply: true });
    const idx = (f: (e: GameEvent) => boolean): number => ev.findIndex(f);
    const black = idx((e) => e.type === 'horror' && e.kind === 'blackout');
    const tap = idx((e) => e.type === 'sfx' && e.id === 'glass_tap');
    const reply = idx((e) => e.type === 'phone');
    const comp = idx((e) => e.type === 'composure');
    expect(black).toBeGreaterThanOrEqual(0);
    expect(black).toBeLessThan(reply);
    expect(tap).toBeLessThan(reply);
    expect(reply).toBeLessThan(comp);
    expect((ev[reply] as { text: string }).text).toBe(txt('strings/closingText/replied/#0'));
  });
});
