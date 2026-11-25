import { describe, expect, it } from 'vitest';
import { act, customer, encOf, registered, rig, st, txt } from './helpers';
import type { GameEvent } from '../../src/core/types';

const vip = { tier: 'vip' as const, score: 5 };

/** 인사 후 대접을 하고, 대접 전후의 호감·평정심과 이벤트를 돌려준다 */
function serveOnce(customerId: string, shift: 'afternoon' | 'dawn', drink: 'water' | 'chocolate' | 'none', card?: 'vip') {
  const g = rig(customerId, shift, 7, (s) => {
    if (card === 'vip') s.cards[customerId] = registered(customerId, shift, vip);
  });
  const c = customer(customerId);
  act(g, { type: 'greet', style: c.greetPref });
  const affinity = encOf(g).affinity;
  const composure = st(g).composure;
  const ev: GameEvent[] = act(g, { type: 'serve', drink });
  return { g, ev, affinity, composure, delta: encOf(g).affinity - affinity, composureDelta: st(g).composure - composure };
}

describe('대접 단계: 대상 손님', () => {
  it('진영숙(VVIP)은 인사 뒤 대접 단계가 있고, 한여름은 없다', () => {
    const jin = rig('jin', 'afternoon');
    act(jin, { type: 'greet', style: 'quiet' });
    expect(encOf(jin).step).toBe('serve');
    expect(st(jin).cards.jin?.drink).toBeUndefined();

    const han = rig('hanyeoreum', 'afternoon');
    act(han, { type: 'greet', style: 'warm' });
    expect(encOf(han).step).toBe('probe');
  });

  it('VIP 카드 손님은 대접 단계가 있고, 취향이 없는 바깥에서 온 색은 없다', () => {
    const marsh = rig('marsh', 'dawn', 7, (s) => { s.cards.marsh = registered('marsh', 'dawn', vip); });
    act(marsh, { type: 'greet', style: 'quiet' });
    expect(encOf(marsh).step).toBe('serve');

    const colour = rig('colour', 'dawn', 7, (s) => { s.cards.colour = registered('colour', 'dawn', vip); });
    act(colour, { type: 'greet', style: 'quiet' });
    expect(encOf(colour).step).toBe('probe');
  });

  it('대접 단계의 선택지는 세 가지다', () => {
    const g = rig('jin', 'afternoon');
    act(g, { type: 'greet', style: 'quiet' });
    const drinks = g.availableActions().filter((a) => a.type === 'serve');
    expect(drinks).toEqual([
      { type: 'serve', drink: 'water' },
      { type: 'serve', drink: 'chocolate' },
      { type: 'serve', drink: 'none' },
    ]);
  });
});

describe('오후 대접', () => {
  it('취향과 맞으면 호감 +10, 카드에 취향이 기록되고, 관계 점수 +1 (단골일 때)', () => {
    const { g, ev, delta } = serveOnce('jin', 'afternoon', 'water', 'vip');
    expect(delta).toBe(10);
    expect(st(g).cards.jin?.drink).toBe('water');
    expect(ev).toContainEqual({ type: 'cardUpdate', customerId: 'jin', field: 'drink' });
    expect(ev.filter((e) => e.type === 'relationship')).toEqual([
      { type: 'relationship', customerId: 'jin', delta: 1, score: 6, tier: 'vip' },
    ]);
    expect(ev).toContainEqual({ type: 'line', speaker: '진영숙', text: customer('jin').hospitality!.match }); // 문구는 편집기로 바뀔 수 있어 데이터에서 읽는다
  });

  it('다른 것을 내면 호감 −5, 관계 점수는 오르지 않고 취향은 기록된다', () => {
    const { g, ev, delta } = serveOnce('jin', 'afternoon', 'chocolate', 'vip');
    expect(delta).toBe(-5);
    expect(ev.some((e) => e.type === 'relationship')).toBe(false);
    expect(st(g).cards.jin?.drink).toBe('water');
  });

  it('아무것도 내지 않으면 호감 −5, 카드에 취향은 기록되지 않는다', () => {
    const { g, ev, delta } = serveOnce('jin', 'afternoon', 'none', 'vip');
    expect(delta).toBe(-5);
    expect(st(g).cards.jin?.drink).toBeUndefined();
    expect(ev.some((e) => e.type === 'cardUpdate' && e.field === 'drink')).toBe(false);
    expect(ev).toContainEqual({ type: 'line', speaker: '진영숙', text: customer('jin').hospitality!.none });
  });

  it('대접 뒤에는 probe 단계로 간다', () => {
    const { g } = serveOnce('jin', 'afternoon', 'water', 'vip');
    expect(encOf(g).step).toBe('probe');
  });
});

describe('새벽 대접', () => {
  it('마시(VIP)에게 취향과 다른 것을 내면 평정심 −5, 호감은 그대로', () => {
    const { ev, delta, composureDelta, g } = serveOnce('marsh', 'dawn', 'chocolate', 'vip');
    expect(delta).toBe(0);
    expect(composureDelta).toBe(-5);
    expect(ev.some((e) => e.type === 'relationship')).toBe(false);
    expect(st(g).cards.marsh?.drink).toBe('water');
  });

  it('마시(VIP)에게 취향대로 내면 호감 +10, 평정심 불변', () => {
    const { delta, composureDelta } = serveOnce('marsh', 'dawn', 'water', 'vip');
    expect(delta).toBe(10);
    expect(composureDelta).toBe(0);
  });

  it('아무것도 내지 않으면 새벽에도 호감 −5', () => {
    const { delta, composureDelta } = serveOnce('marsh', 'dawn', 'none', 'vip');
    expect(delta).toBe(-5);
    expect(composureDelta).toBe(0);
  });
});

describe('취향 any / taboo', () => {
  it('얼굴 없는 여자(any): 탄산수도 초콜릿도 맞다', () => {
    for (const drink of ['water', 'chocolate'] as const) {
      const { delta, composureDelta, g } = serveOnce('faceless', 'dawn', drink, 'vip');
      expect(delta).toBe(10);
      expect(composureDelta).toBe(0);
      expect(st(g).cards.faceless?.drink).toBe('any');
    }
  });

  it('문 밖의 손님(taboo): 아무것도 내지 않으면 호감 +10', () => {
    const { delta, composureDelta, g } = serveOnce('door', 'dawn', 'none', 'vip');
    expect(delta).toBe(10);
    expect(composureDelta).toBe(0);
    expect(st(g).cards.door?.drink).toBeUndefined();
  });

  it('문 밖의 손님(taboo): 무엇이든 내밀면 평정심 −10, 취향은 금기로 기록', () => {
    for (const drink of ['water', 'chocolate'] as const) {
      const { g, composureDelta, ev } = serveOnce('door', 'dawn', drink, 'vip');
      expect(composureDelta).toBe(-10);
      expect(st(g).cards.door?.drink).toBe('taboo');
      expect(ev).toContainEqual({ type: 'line', speaker: null, text: txt('customers/door/hospitality/mismatch').replace(/^>\s*/, '') });
    }
  });
});
