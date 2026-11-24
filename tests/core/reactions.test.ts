import { describe, expect, it } from 'vitest';
import { act, bestOffer, customer, data, encOf, newGame, playAfternoon, rig, st } from './helpers';

// 대사는 편집기로 바뀔 수 있으니 원문을 적지 않고 데이터에서 읽는다
const han = () => customer('hanyeoreum').reactions!;
import type { GameEvent } from '../../src/core/types';

const lines = (ev: GameEvent[]): string[] =>
  ev.filter((e) => e.type === 'line' || e.type === 'thought').map((e) => (e as { text: string }).text);

describe('★ 반응 대사와 속마음', () => {
  it('한여름: 입장 지문 → 첫 대사 → 속마음 순서', () => {
    const g = newGame(3);
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'finishTexting' });
    const log = st(g).log.filter((e) => e.type === 'line' || e.type === 'thought' || e.type === 'customerEnter');
    const i = log.findIndex((e) => e.type === 'customerEnter');
    expect((log[i + 1] as { text: string }).text).toContain('문이 조심스럽게');
    expect(log[i + 2]).toMatchObject({ speaker: '한여름' });
    expect(log[i + 3]).toEqual({ type: 'thought', text: '나도 처음인데.' });
  });

  it('인사: 맞음/틀림이 다른 반응을 낸다', () => {
    const a = rig('hanyeoreum', 'afternoon');
    expect(lines(act(a, { type: 'greet', style: 'warm' }))).toContain(han().greet!.match);
    const b = rig('hanyeoreum', 'afternoon');
    expect(lines(act(b, { type: 'greet', style: 'direct' }))).toContain('앗, 아직 뭘 볼지도 몰라서요…');
  });

  it('손님 데이터에 없는 반응은 공통 반응으로 대체한다', () => {
    const g = rig('jin', 'afternoon');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'serve', drink: 'water' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    const wrong = encOf(g).offered.find((id) => data.products.find((p) => p.id === id)!.category !== 'jewelry')!;
    const ev = act(g, { type: 'propose', productId: wrong });
    expect(lines(ev)).toContain('진주라고 했어요.');
    const g2 = rig('kang', 'afternoon');
    const common = data.strings as { reactions: { common: { close: { checkout: string } } } };
    expect(common.reactions.common.close.checkout).toBe('계산할게요.');
    expect(g2).toBeTruthy();
  });

  it('제안·클로징·단골 반응과 판매 뒤 속마음', () => {
    const g = rig('hanyeoreum', 'afternoon');
    act(g, { type: 'greet', style: 'warm' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    expect(lines(act(g, { type: 'propose', productId: bestOffer(g) }))).toContain(han().propose!.perfect);
    const ev = act(g, { type: 'close', choice: 'boxGold' });
    const t = lines(ev);
    expect(t).toContain('와, 포장까지… 엄마가 상자만 봐도 놀라시겠다.');
    if (encOf(g).step === 'regularOffer') {
      expect(lines(act(g, { type: 'regularOffer', accept: false }))).toContain('한여름이 꾸벅 인사하고 나간다.');
    }
  });

  it('진영숙 관찰 뒤 속마음, 작별 뒤 속마음', () => {
    const g = rig('jin', 'afternoon');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'serve', drink: 'water' });
    const ev = act(g, { type: 'probe', probe: 'observe' });
    expect(ev).toContainEqual({ type: 'thought', text: '빠진 한 알을 채우러 오셨구나.' });
  });

  it('휴게 전환: 지문과 속마음이 나오고 덮개 컷이 sfx로 온다', () => {
    const g = newGame(6);
    playAfternoon(g);
    const ev = act(g, { type: 'finishAftercare' });
    expect(ev).toContainEqual({ type: 'thought', text: '…아까 분명 치웠는데.' });
    expect(ev).toContainEqual({ type: 'sfx', id: 'lights_off' });
    const ev2 = act(g, { type: 'ackShiftBreak' });
    expect(ev2).toContainEqual({ type: 'thought', text: '이게… 무슨.' });
    expect(ev2.some((e) => e.type === 'line' && e.kind === 'note')).toBe(true);
    const ev3 = act(g, { type: 'ackBriefing' });
    expect(ev3.filter((e) => e.type === 'sfx' && e.id === 'cloth_pull')).toHaveLength(3);
  });

  it('(빈칸)에게 보내면 속마음이 나온다', () => {
    const g = newGame(6);
    playAfternoon(g);
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'ackShiftBreak' });
    act(g, { type: 'ackBriefing' });
    const ev = act(g, { type: 'sendText', contactId: 'zero', template: 'dawn_open' });
    expect(ev).toContainEqual({ type: 'thought', text: '내가 보내기 전에… 답장이 왔다.' });
  });

  it('1일차 6명 모두 reactions 객체를 가진다', () => {
    for (const id of ['hanyeoreum', 'kang', 'jin', 'marsh', 'faceless', 'baek']) {
      const c = data.customers.find((x) => x.id === id)!;
      expect(c.reactions, id).toBeTruthy();
      expect(c.reactions!.greet?.match, id).toBeTruthy();
    }
  });
});
