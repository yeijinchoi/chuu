import { describe, expect, it } from 'vitest';
import { act, ctxOf, customer, data, encOf, newGame, rig, st } from './helpers';
import { buildSlots } from '../../src/core/dayFlow';
import type { GameEvent } from '../../src/core/types';

/** 확장 손님 13명 (docs/EXPANSION.md §3·§4) */
const AFTERNOON_WALKINS = ['ma', 'do', 'hwangbo', 'jamie', 'song', 'lee', 'jung'];
const DAWN_WALKINS = ['mirror', 'sleeper', 'cats', 'borrowed', 'rain', 'nametag'];

const violations = (ev: GameEvent[]) => ev.flatMap((e) => (e.type === 'violation' ? [e.rule] : []));

function slotsOn(seed: number, day: number, shift: 'afternoon' | 'dawn'): string[] {
  const g = newGame(seed);
  st(g).day = day;
  return buildSlots(ctxOf(g), shift).map((x) => x.customerId);
}

describe('지나가는 손님 (walkIn)', () => {
  it('2~4일차 오후·3~4일차 새벽에 한 명씩, 같은 시드면 늘 같은 손님', () => {
    for (const [day, shift, pool] of [[2, 'afternoon', ['do', 'ma']], [3, 'afternoon', ['hwangbo', 'lee', 'song']], [4, 'afternoon', ['jung', 'jamie']], [3, 'dawn', ['mirror', 'sleeper', 'cats']], [4, 'dawn', ['borrowed', 'rain', 'nametag']]] as const) {
      const a = slotsOn(7, day, shift).filter((id) => (pool as readonly string[]).includes(id));
      expect(a, `${day}일차 ${shift}`).toHaveLength(1);
      expect(slotsOn(7, day, shift)).toEqual(slotsOn(7, day, shift));
    }
  });

  it('시드가 바뀌면 다른 손님이 온다 (다시 플레이하는 맛)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (const id of slotsOn(seed, 3, 'afternoon')) if (['hwangbo', 'lee', 'song'].includes(id)) seen.add(id);
    expect(seen.size).toBe(3);
  });

  it('이미 다녀간 손님은 다시 지나가지 않는다', () => {
    const g = newGame(7);
    const s = st(g);
    s.day = 2;
    const first = buildSlots(ctxOf(g), 'afternoon').find((id) => ['do', 'ma'].includes(id.customerId))!.customerId;
    s.cards[first] = { ...(s.cards[first] ?? {}), visits: 1 } as never;
    const again = buildSlots(ctxOf(g), 'afternoon').map((x) => x.customerId);
    expect(again).not.toContain(first);
    expect(again.some((id) => ['do', 'ma'].includes(id))).toBe(true);
  });

  it('지나가는 손님은 스프라이트·정답 상품·대사를 모두 갖고 있다', () => {
    for (const id of [...AFTERNOON_WALKINS, ...DAWN_WALKINS]) {
      const c = customer(id);
      expect(c.accepts?.length, id).toBeGreaterThan(0);
      expect(c.reactions?.leave, id).toBeTruthy();
      expect(c.reactions?.thought?.opening, id).toBeTruthy();
    }
    for (const id of DAWN_WALKINS) {
      const c = customer(id);
      expect(c.rules, id).toHaveLength(1);
      expect(c.lines.violation[String(c.rules[0])], id).toBeTruthy();
      expect(c.specialPayment, id).toBeTruthy();
      expect(data.rules.find((r) => r.id === c.rules[0])?.day, id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('새벽 수칙 12~17', () => {
  it('12 거울 속 손님: 밝게 인사하면 위반, 조용히 인사하면 괜찮다', () => {
    expect(violations(act(rig('mirror', 'dawn'), { type: 'greet', style: 'warm' }))).toEqual([12]);
    expect(violations(act(rig('mirror', 'dawn'), { type: 'greet', style: 'quiet' }))).toEqual([]);
  });

  it('13 잠든 아이: 바로 상품을 들이밀면 위반', () => {
    expect(violations(act(rig('sleeper', 'dawn'), { type: 'greet', style: 'direct' }))).toEqual([13]);
  });

  it('17 명찰 손님: 용도를 물으면 위반', () => {
    const g = rig('nametag', 'dawn');
    act(g, { type: 'greet', style: 'quiet' });
    expect(violations(act(g, { type: 'probe', probe: 'askOccasion' }))).toEqual([17]);
  });

  /** 정답 상품까지 가서 클로징 하나를 고른다 */
  function toClose(id: string): ReturnType<typeof rig> {
    const g = rig(id, 'dawn', 3);
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'observe' });
    const want = customer(id).accepts![0]!;
    for (let i = 0; i < 3 && !encOf(g).offered.includes(want); i++) act(g, { type: 'reroll' });
    act(g, { type: 'propose', productId: want });
    expect(encOf(g).step).toBe('close');
    return g;
  }

  it('14 고양이 노파: 금색 상자가 아니면 위반, 금색 상자면 판매', () => {
    expect(violations(act(toClose('cats'), { type: 'close', choice: 'boxRed' }))).toEqual([14]);
    const g = toClose('cats');
    expect(violations(act(g, { type: 'close', choice: 'boxGold' }))).toEqual([]);
    expect(encOf(g).outcome).toBe('sold');
  });

  it('15 몸을 빌린 손님: 입혀 보지 않으면 위반 (1번 수칙의 반대)', () => {
    expect(violations(act(toClose('borrowed'), { type: 'close', choice: 'checkout' }))).toEqual([15]);
    expect(violations(act(toClose('borrowed'), { type: 'close', choice: 'tryOn' }))).toEqual([]);
  });

  it('16 비를 데려오는 손님: 포장하면 위반, 바로 계산하면 판매', () => {
    expect(violations(act(toClose('rain'), { type: 'close', choice: 'boxGold' }))).toEqual([16]);
    expect(violations(act(toClose('rain'), { type: 'close', choice: 'checkout' }))).toEqual([]);
  });
});
