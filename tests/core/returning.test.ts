import { describe, expect, it } from 'vitest';
import { act, ctxOf, customer, newGame, registered, rig, st } from './helpers';
import { newCard } from '../../src/core/care';
import { startEncounter } from '../../src/core/encounter';
import type { GameEvent } from '../../src/core/types';

/** 응대를 시작하면서 나온 이벤트를 모아, 손님의 첫 대사를 돌려준다 */
function openingWith(id: string, shift: 'afternoon' | 'dawn', visits: number, regular = false): string {
  const g = newGame(7);
  const state = st(g);
  state.shift = shift;
  state.slots = [{ shift, time: shift === 'dawn' ? '02:22' : '13:30', customerId: id, uninvited: false, forgotten: false }];
  if (regular) state.cards[id] = registered(id, shift, { tier: 'regular', score: 2 });
  const card = state.cards[id] ?? (state.cards[id] = newCard(id, shift));
  card.visits = visits - 1; // startEncounter가 1 올린다
  const events: GameEvent[] = [];
  startEncounter({ ...ctxOf(g), emit: (e: GameEvent) => events.push(e) }, 0);
  const first = events.find((e) => e.type === 'line' && e.speaker === customer(id).name);
  return (first as { text: string } | undefined)?.text ?? '';
}

describe('재방문 대사', () => {
  it('첫 방문은 첫 방문 대사, 2회째·3회째는 서로 다른 대사다', () => {
    for (const [id, shift] of [['hanyeoreum', 'afternoon'], ['kang', 'afternoon'], ['jin', 'afternoon'], ['marsh', 'dawn'], ['faceless', 'dawn'], ['baek', 'dawn']] as const) {
      const first = openingWith(id, shift, 1);
      const second = openingWith(id, shift, 2);
      const third = openingWith(id, shift, 3);
      expect(first).toBe(customer(id).lines.opening);
      expect(second).not.toBe(first);
      expect(third).not.toBe(second);
      expect(third).not.toBe(first);
    }
  });

  it('단골로 등록된 손님은 2회째에 openingRegular를 쓴다', () => {
    const regular = openingWith('hanyeoreum', 'afternoon', 2, true);
    expect(regular).toBe(customer('hanyeoreum').returns?.['2']?.openingRegular);
  });

  it('returns가 없는 손님은 몇 번째 방문이든 첫 방문 대사를 쓴다', () => {
    const c = customer('oh');
    expect(openingWith('oh', 'afternoon', 3)).toBe(c.lines.opening);
  });

  it('응대를 시작할 때마다 카드의 방문 횟수가 1씩 오른다', () => {
    const g = rig('hanyeoreum', 'afternoon');
    expect(st(g).cards.hanyeoreum?.visits).toBe(1);
    act(g, { type: 'greet', style: 'warm' });
    expect(st(g).cards.hanyeoreum?.visits).toBe(1);
  });

  it('2회째 방문에서도 품목·용도·예산 질문에 첫 방문과 다른 답을 한다', () => {
    const g = rig('hanyeoreum', 'afternoon', 7, (s) => {
      s.cards.hanyeoreum = { customerId: 'hanyeoreum', book: 'afternoon', notes: [], purchases: [], score: 0, tier: 'new', lastContactDay: null, sentToday: 0, visits: 1 };
    });
    act(g, { type: 'greet', style: 'warm' });
    const ev = act(g, { type: 'probe', probe: 'askCategory' });
    const said = ev.filter((e) => e.type === 'line').map((e) => (e as { text: string }).text);
    expect(said).toContain(customer('hanyeoreum').returns?.['2']?.askCategory);
    expect(said).not.toContain(customer('hanyeoreum').lines.askCategory);
  });
});
