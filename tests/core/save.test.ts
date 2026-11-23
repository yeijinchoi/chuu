import { describe, expect, it } from 'vitest';
import { buildSave, createMemoryStorage, JsonStorageAdapter, MemoryBackend, parseSave, SAVE_KEY } from '../../src/core/save';
import { Game } from '../../src/core/game';
import { act, data, newGame, playAfternoon, playCorrect, st } from './helpers';

function finishDay(g: Game): void {
  playAfternoon(g);
  act(g, { type: 'sendCare', customerId: 'hanyeoreum', template: 'thanks' });
  act(g, { type: 'finishAftercare' });
  act(g, { type: 'ackShiftBreak' });
  act(g, { type: 'ackBriefing' });
  act(g, { type: 'finishTexting' });
  for (let i = 0; i < 2; i++) { playCorrect(g, { accept: true }); act(g, { type: 'advance' }); }
  act(g, { type: 'closingText', reply: false });
  act(g, { type: 'finishAftercare' });
}

describe('저장', () => {
  it('왕복(save → load)이 일치한다', () => {
    const { adapter, backend } = createMemoryStorage();
    const g = newGame(8, adapter);
    finishDay(g);
    expect(st(g).phase.kind).toBe('results');
    const saved = buildSave(st(g));
    const loaded = adapter.load();
    expect(loaded).toEqual(saved);
    expect(backend.getItem(SAVE_KEY)).toBeTruthy();
    expect((loaded as NonNullable<typeof loaded> & object)).toMatchObject({ version: 1, day: 1, playerName: '테스터' });
    expect(Object.keys((loaded as { regulars: object }).regulars).length).toBeGreaterThan(0);
  });

  it('정산 직후 자동 저장하고 save 이벤트를 보낸다 (성공 / 실패를 정직하게)', () => {
    const ok = createMemoryStorage();
    const g1 = newGame(8, ok.adapter);
    playAfternoon(g1);
    act(g1, { type: 'finishAftercare' });
    act(g1, { type: 'ackShiftBreak' }); act(g1, { type: 'ackBriefing' }); act(g1, { type: 'finishTexting' });
    for (let i = 0; i < 2; i++) { playCorrect(g1); act(g1, { type: 'advance' }); }
    act(g1, { type: 'closingText', reply: false });
    const ev = act(g1, { type: 'finishAftercare' });
    expect(ev).toContainEqual({ type: 'save', ok: true });

    const blocked = createMemoryStorage();
    blocked.backend.failWrites = true;
    const g2 = newGame(8, blocked.adapter);
    playAfternoon(g2);
    act(g2, { type: 'finishAftercare' });
    act(g2, { type: 'ackShiftBreak' }); act(g2, { type: 'ackBriefing' }); act(g2, { type: 'finishTexting' });
    for (let i = 0; i < 2; i++) { playCorrect(g2); act(g2, { type: 'advance' }); }
    act(g2, { type: 'closingText', reply: false });
    const ev2 = act(g2, { type: 'finishAftercare' });
    expect(ev2).toContainEqual({ type: 'save', ok: false });
    expect(st(g2).phase.kind).toBe('results'); // 저장 실패가 게임을 막지 않는다
  });

  it('저장이 없으면 null, 손상된 JSON·모양이 틀린 데이터는 corrupt', () => {
    const { adapter, backend } = createMemoryStorage();
    expect(adapter.load()).toBeNull();
    backend.setItem(SAVE_KEY, '{not json');
    expect(adapter.load()).toBe('corrupt');
    backend.setItem(SAVE_KEY, JSON.stringify({ version: 2 }));
    expect(adapter.load()).toBe('corrupt');
    backend.setItem(SAVE_KEY, JSON.stringify({ version: 1, day: 'x' }));
    expect(adapter.load()).toBe('corrupt');
    expect(parseSave(null)).toBeNull();
  });

  it('저장소가 예외를 던져도 save는 false, load는 corrupt', () => {
    const bad = new JsonStorageAdapter({
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    });
    expect(bad.save({ version: 1, day: 1, playerName: 'a', totalRevenue: 0, dawnLedger: [], regulars: {}, savedAtClock: '05:00' })).toBe(false);
    expect(bad.load()).toBe('corrupt');
    expect(new MemoryBackend().getItem('x')).toBeNull();
  });

  it('resume: 저장에서 이어서 다음 날 오후 브리핑으로', () => {
    const { adapter } = createMemoryStorage();
    const g = newGame(8, adapter);
    finishDay(g);
    const save = adapter.load();
    expect(save).not.toBe('corrupt');
    const g2 = new Game(data, adapter);
    g2.dispatch({ type: 'start', playerName: '무시됨', seed: 1 });
    const ev = g2.resume(save as never);
    expect(ev.length).toBeGreaterThan(0);
    expect(st(g2).day).toBe(2);
    expect(st(g2).playerName).toBe('테스터');
    expect(st(g2).phase).toEqual({ kind: 'briefing', shift: 'afternoon' });
    expect(Object.keys(st(g2).cards).length).toBeGreaterThan(0);
    expect(st(g2).totalRevenue).toBe(st(g).totalRevenue);
  });
});
