import { describe, expect, it } from 'vitest';
import { act, customer, data, newGame, registered, rig, st, toAftercare, toTexting, txt } from './helpers';
import { strAt } from '../../src/core/ctx';
import type { GameEvent } from '../../src/core/types';

/** 대사 점검(처음부터 끝까지 자동 플레이 대본)에서 찾은 문제들이 다시 생기지 않게 막는다 */
const lines = (ev: GameEvent[]) => ev.flatMap((e) => (e.type === 'line' ? [e] : []));

describe('대사 흐름', () => {
  it('날마다 같은 지문이 되풀이되지 않는다: 교대 쪽지·덮개·새벽 머리말은 날짜별로 다르다', () => {
    for (const key of ['shiftBreak.narration', 'thoughts.shiftBreak']) {
      const days = [0, 1, 2, 3, 4].map((i) => strAt(data, key, i));
      expect(new Set(days).size).toBe(5);
    }
    for (const key of ['briefing.dawn.coverAgain', 'briefing.dawn.introAgain']) {
      const days = [0, 1, 2, 3].map((i) => strAt(data, key, i));
      expect(new Set(days).size).toBe(4);
    }
  });

  it('다시 뽑기 지문은 한 손님 안에서 세 번 모두 다르다', () => {
    expect(new Set([0, 1, 2].map((i) => strAt(data, 'text.rerolled', i))).size).toBe(3);
  });

  it('관찰 결과는 손님의 말이 아니라 지문이다', () => {
    const g = rig('hanyeoreum', 'afternoon');
    act(g, { type: 'greet', style: 'warm' });
    const ev = lines(act(g, { type: 'probe', probe: 'observe' }));
    expect(ev.some((l) => l.speaker === null && l.text === customer('hanyeoreum').lines.observe)).toBe(true);
    expect(ev.some((l) => l.speaker === '한여름' && l.text.includes('손끝이 떨린다'))).toBe(false);
  });

  it('사라짐·장면 묘사인 성공/실패 줄은 "> " 지문 표시가 붙어 있다', () => {
    for (const c of data.customers) {
      for (const k of ['fail', 'success'] as const) {
        const t = c.lines[k];
        if (t && !t.startsWith('> ')) expect(t, `${c.id}.${k}`).not.toMatch(/사라져 있다\.$|사라진다\./);
      }
    }
  });

  it('수칙 위반 장면은 지문으로 나온다', () => {
    const g = rig('baek', 'dawn');
    act(g, { type: 'greet', style: 'quiet' });
    const ev = lines(act(g, { type: 'probe', probe: 'askBudget' }));
    const scene = customer('baek').lines.violation['2'] as string;
    expect(ev.some((l) => l.speaker === null && l.text === scene)).toBe(true);
    expect(ev.some((l) => l.speaker === '백설' && l.text === scene)).toBe(false);
  });

  it('같은 손님이 연달아 같은 첫마디를 하지 않는다 (차은호 "오 득템", 모퉁이의 개 "샀다")', () => {
    const cha = customer('cha');
    const beat = (cha.afterSale ?? []).flatMap((b) => b.lines ?? []);
    expect(beat.some((l) => l.startsWith('오 득템'))).toBe(false);
    const hound = customer('hound');
    const checkout = hound.reactions?.close?.checkout ?? '';
    expect(hound.lines.success?.startsWith(checkout)).toBe(false);
  });

  it('초대 답장은 날짜별 문구를 쓴다 (2일차 강도윤은 2일차 시각을 말한다)', () => {
    const g = newGame(4);
    st(g).day = 2;
    toTexting(g, 'afternoon');
    const ev = act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
    const phone = ev.find((e) => e.type === 'phone') as { text: string };
    expect(phone.text).toBe(txt('contacts/kang/repliesByDay/2/prefer'));
    expect(phone.text).not.toBe(txt('contacts/kang/replies/prefer')) // 2일차 답장은 1일차 답장과 다르다;
  });

  it('새벽 손님에게 관리 문자를 보내면 반응 지문이 하나 나온다', () => {
    const g = newGame(1);
    st(g).cards['marsh'] = registered('marsh', 'dawn', { purchases: [{ productId: 'breathing_pearl', day: 1 }] });
    toAftercare(g, 'dawn');
    const ev = lines(act(g, { type: 'sendCare', customerId: 'marsh', template: 'dawn_thanks' }));
    expect(ev.some((l) => l.speaker === null && l.text === customer('marsh').care.ack)).toBe(true);
  });

  it('재방문 손님은 판매 반응·받은 물건·퇴장 지문이 첫 방문과 다르다', () => {
    for (const id of ['marsh', 'faceless', 'baek']) {
      const c = customer(id);
      for (const n of ['2', '3'] as const) {
        const r = c.returns?.[n];
        expect(r?.successNote, `${id} ${n} successNote`).toBeTruthy();
        expect(r?.successNote).not.toBe(c.lines.successNote);
        expect(r?.reactions?.leave).not.toBe(c.reactions?.leave);
      }
    }
  });

  it('재방문 대사의 "어제"는 바로 다음 날 오는 방문에만 쓴다 (방문 사이가 하루가 아닐 수 있다)', async () => {
    const r = customer('hanyeoreum').returns ?? {};
    // 한여름 2번째 방문은 늘 2일차(1일차 13:30에 반드시 오고, 2일차 재방문 칸의 후보가 한여름뿐이다) → "어제"가 맞다
    const day2 = (await import('../../src/data/day2.json')).default as { schedule: { condition: string; candidates?: string[] }[] };
    const onlyHan = day2.schedule.some((x) => x.condition === 'returning' && JSON.stringify(x.candidates) === '["hanyeoreum"]');
    if (!onlyHan) expect(JSON.stringify(r['2'] ?? {})).not.toContain('어제');
    // 3번째 방문(4·5일차)은 바로 다음 날이 아니다
    for (const [n, v] of Object.entries(r)) if (Number(n) >= 3) expect(JSON.stringify(v), `${n}번째 방문`).not.toContain('어제');
  });
});

describe('초대에 응한 손님은 반드시 온다', () => {
  it('재방문 슬롯은 관계 점수보다 오늘 초대한 손님을 먼저 고른다', async () => {
    const { buildSlots } = await import('../../src/core/dayFlow');
    const { ctxOf } = await import('./helpers');
    const g = newGame(7);
    const s = st(g);
    s.day = 5;
    s.cards['faceless'] = registered('faceless', 'dawn', { score: 9, visits: 2, purchases: [{ productId: 'breathing_pearl', day: 1 }] });
    s.cards['baek'] = registered('baek', 'dawn', { score: 2, visits: 2, purchases: [{ productId: 'breathing_pearl', day: 1 }] });
    s.visitors['baek'] = { time: '03:33', bonus: 15 };
    const ids = buildSlots(ctxOf(g), 'dawn').map((x) => x.customerId);
    expect(ids).toContain('baek');
  });
});
