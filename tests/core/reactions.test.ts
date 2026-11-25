import { describe, expect, it } from 'vitest';
import { act, bestOffer, customer, data, encOf, newGame, playAfternoon, rig, st, txt } from './helpers';

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
    expect((log[i + 1] as { text: string }).text).toBe(txt('customers/hanyeoreum/reactions/enter').replace(/^>\s*/, ''));
    expect(log[i + 2]).toMatchObject({ speaker: '한여름' });
    expect(log[i + 3]).toEqual({ type: 'thought', text: txt('customers/hanyeoreum/reactions/thought/opening') });
  });

  it('인사: 맞음/틀림이 다른 반응을 낸다', () => {
    const a = rig('hanyeoreum', 'afternoon');
    expect(lines(act(a, { type: 'greet', style: 'warm' }))).toContain(han().greet!.match);
    const b = rig('hanyeoreum', 'afternoon');
    expect(lines(act(b, { type: 'greet', style: 'direct' }))).toContain(txt('customers/hanyeoreum/reactions/greet/mismatch/direct'));
  });

  it('손님 데이터에 없는 반응은 공통 반응으로 대체한다', () => {
    const g = rig('jin', 'afternoon');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'serve', drink: 'water' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    const wrong = encOf(g).offered.find((id) => data.products.find((p) => p.id === id)!.category !== 'jewelry')!;
    const ev = act(g, { type: 'propose', productId: wrong });
    expect(lines(ev)).toContain(txt('customers/jin/reactions/propose/wrong'));
    const g2 = rig('kang', 'afternoon');
    const common = data.strings as { reactions: { common: { close: { checkout: string } } } };
    expect(common.reactions.common.close.checkout).toBe(txt('strings/reactions/common/close/checkout'));
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
    expect(t).toContain((han().close!.box as { gold?: string }).gold); // 문구는 편집기로 바뀔 수 있어 데이터에서 읽는다
    if (encOf(g).step === 'regularOffer') {
      expect(lines(act(g, { type: 'regularOffer', accept: false }))).toContain(txt('customers/hanyeoreum/reactions/regular/decline').replace(/^>\s*/, ''));
    }
  });

  it('진영숙 관찰 뒤 속마음, 작별 뒤 속마음', () => {
    const g = rig('jin', 'afternoon');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'serve', drink: 'water' });
    const ev = act(g, { type: 'probe', probe: 'observe' });
    expect(ev).toContainEqual({ type: 'thought', text: txt('customers/jin/reactions/thought/observe') });
  });

  it('휴게 전환: 지문과 속마음이 나오고 덮개 컷이 sfx로 온다', () => {
    const g = newGame(6);
    playAfternoon(g);
    const ev = act(g, { type: 'finishAftercare' });
    expect(ev).toContainEqual({ type: 'thought', text: txt('strings/thoughts/shiftBreak/#0') });
    expect(ev).toContainEqual({ type: 'sfx', id: 'lights_off' });
    const ev2 = act(g, { type: 'ackShiftBreak' });
    expect(ev2).toContainEqual({ type: 'thought', text: txt('strings/thoughts/dawnNote') });
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
    expect(ev).toContainEqual({ type: 'thought', text: txt('strings/thoughts/zeroReply') });
  });

  it('1일차 6명 모두 reactions 객체를 가진다', () => {
    for (const id of ['hanyeoreum', 'kang', 'jin', 'marsh', 'faceless', 'baek']) {
      const c = data.customers.find((x) => x.id === id)!;
      expect(c.reactions, id).toBeTruthy();
      expect(c.reactions!.greet?.match, id).toBeTruthy();
    }
  });
});
