import { describe, expect, it } from 'vitest';
import { act, encOf, newGame, playCorrect, reject, st, toTexting } from './helpers';

function afternoonTexting() {
  const g = newGame(4);
  act(g, { type: 'ackBriefing' });
  return g;
}
function dawnTexting() {
  const g = newGame(4);
  toTexting(g, 'dawn');
  return g;
}
const slotIds = (g: ReturnType<typeof newGame>) => st(g).slots.map((s) => s.customerId);

describe('문자 판정', () => {
  it('선호 템플릿: 방문 + 시작 호감 +15, 선호 답장', () => {
    const g = afternoonTexting();
    const ev = act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
    expect(ev).toContainEqual({ type: 'phone', from: '강도윤', text: '오 신상? 세 시 반쯤 갈게요.' });
    expect(st(g).visitors['kang']).toEqual({ time: '15:30', bonus: 15 });
    act(g, { type: 'finishTexting' });
    playCorrect(g); act(g, { type: 'advance' });
    expect(encOf(g).customerId).toBe('kang');
    expect(slotIds(g)).toEqual(['hanyeoreum', 'kang']);
  });

  it('시작 호감: 기본 40, 선호 문자 55', () => {
    const g = afternoonTexting();
    act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
    act(g, { type: 'finishTexting' });
    expect(encOf(g).affinity).toBe(40); // 한여름
    playCorrect(g); act(g, { type: 'advance' });
    expect(encOf(g).customerId).toBe('kang');
    expect(encOf(g).affinity).toBe(55);
  });

  it('중립 템플릿: 방문하지만 보너스 없음', () => {
    const g = afternoonTexting();
    const ev = act(g, { type: 'sendText', contactId: 'kang', template: 'private' });
    expect(ev).toContainEqual({ type: 'phone', from: '강도윤', text: '네 이따 들를게요.' });
    expect(st(g).visitors['kang']).toEqual({ time: '15:30', bonus: 0 });
  });

  it('비선호 템플릿: 방문하지 않고 차가운 답장', () => {
    const g = afternoonTexting();
    const ev = act(g, { type: 'sendText', contactId: 'kang', template: 'greeting' });
    expect(ev).toContainEqual({ type: 'phone', from: '강도윤', text: '아 네… 바빠서요.' });
    expect(st(g).visitors['kang']).toBeUndefined();
    act(g, { type: 'finishTexting' });
    expect(slotIds(g)).toEqual(['hanyeoreum']);
  });

  it('문자를 안 받은 고객은 방문하지 않는다 (한여름은 항상)', () => {
    const g = afternoonTexting();
    act(g, { type: 'finishTexting' });
    expect(slotIds(g)).toEqual(['hanyeoreum']);
  });

  it('진영숙: 선호 private → 17:30, 비선호 new_arrival → 오지 않음', () => {
    const g = afternoonTexting();
    const ev = act(g, { type: 'sendText', contactId: 'jin', template: 'private' });
    expect(ev).toContainEqual({ type: 'phone', from: '진영숙 (진 마담)', text: '다섯 시 반. 조용히 보고 싶네요.' });
    const h = afternoonTexting();
    const ev2 = act(h, { type: 'sendText', contactId: 'jin', template: 'new_arrival' });
    expect(ev2).toContainEqual({ type: 'phone', from: '진영숙 (진 마담)', text: '단체 문자는 사양할게요.' });
    expect(st(h).visitors['jin']).toBeUndefined();
  });

  it('오미란: 무슨 문자든 오늘은 못 온다', () => {
    for (const t of ['new_arrival', 'private', 'greeting'] as const) {
      const g = afternoonTexting();
      const ev = act(g, { type: 'sendText', contactId: 'oh', template: t });
      expect(ev).toContainEqual({ type: 'phone', from: '오미란', text: '어머 이번 주는 어렵겠어요 ㅠ 주말에 꼭 갈게요!' });
      act(g, { type: 'finishTexting' });
      expect(slotIds(g)).not.toContain('oh');
    }
  });

  it('새벽: 마시 선호 dawn_offer → 02:22 방문 +15 / 중립 → 보너스 없음 / 비선호 dawn_name → 오지 않음', () => {
    const a = dawnTexting();
    const ev = act(a, { type: 'sendText', contactId: 'marsh', template: 'dawn_offer' });
    expect(ev).toContainEqual({ type: 'phone', from: '마시 씨', text: '진주. 진주. 두 시 이십이 분에 올라가겠습니다.' });
    expect(st(a).visitors['marsh']).toEqual({ time: '02:22', bonus: 15 });

    const b = dawnTexting();
    act(b, { type: 'sendText', contactId: 'marsh', template: 'dawn_open' });
    expect(st(b).visitors['marsh']).toEqual({ time: '02:22', bonus: 0 });

    const c = dawnTexting();
    const ev3 = act(c, { type: 'sendText', contactId: 'marsh', template: 'dawn_name' });
    expect(ev3).toContainEqual({ type: 'phone', from: '마시 씨', text: '이름을 함부로 부르지 마십시오.' });
    act(c, { type: 'finishTexting' });
    expect(slotIds(c)).toEqual(['faceless', 'baek']); // 마시는 오지 않는다
  });

  it('baek 예외: 문자를 안 받아도 04:20에 초대 없이 온다 / 받으면 03:33', () => {
    const none = dawnTexting();
    act(none, { type: 'finishTexting' });
    expect(st(none).slots.map((s) => [s.customerId, s.time, s.uninvited])).toEqual([
      ['faceless', '03:03', false],
      ['baek', '04:20', true],
    ]);

    const sent = dawnTexting();
    const ev2 = act(sent, { type: 'sendText', contactId: 'baek', template: 'dawn_name' });
    expect(ev2).toContainEqual({ type: 'phone', from: '백설', text: '문자 고마워요. 늘 고마워요. 세 시 삼십삼 분에 갈게요.' });
    act(sent, { type: 'finishTexting' });
    expect(st(sent).slots.find((s) => s.customerId === 'baek')).toMatchObject({ time: '03:33', uninvited: false });
    expect(st(sent).visitors['baek']!.bonus).toBe(15);

    const neutral = dawnTexting();
    const ev3 = act(neutral, { type: 'sendText', contactId: 'baek', template: 'dawn_open' });
    expect(ev3).toContainEqual({ type: 'phone', from: '백설', text: '고마워요. 갈게요.' });
    expect(st(neutral).visitors['baek']!.bonus).toBe(0);
  });

  it('baek 초대 없이 방문 시 openingUninvited 대사를 쓴다', () => {
    const g = dawnTexting();
    act(g, { type: 'finishTexting' });
    playCorrect(g); // 얼굴 없는 여자 (boxRed)
    const ev = act(g, { type: 'advance' });
    expect(ev).toContainEqual({ type: 'line', speaker: '백설', text: '문자를… 안 주셨더라고요. 그래서 제가 왔어요.' });
    // 초대 없이 왔어도 잊힌 단골이 아니므로 시작 호감은 기본 40
    expect(encOf(g).affinity).toBe(40);
    expect(st(g).composure).toBe(100);
  });

  it('zero: 보내는 즉시 답장, 평정심 −5, 방문 안 함', () => {
    const g = dawnTexting();
    const ev = act(g, { type: 'sendText', contactId: 'zero', template: 'dawn_open' });
    expect(ev).toContainEqual({ type: 'phone', from: '(빈칸)', text: '담당자님은 거기 없어요.' });
    expect(ev).toContainEqual({ type: 'composure', delta: -5, value: 95 });
    expect(st(g).composure).toBe(95);
    act(g, { type: 'finishTexting' });
    expect(slotIds(g)).not.toContain('zero');
  });

  it('교대별 발송 한도: 영업 문자 오후 2 / 새벽 2, 총 4 / 3을 영업·관리가 나눠 쓴다', () => {
    const g = afternoonTexting();
    expect(st(g).texting.afternoon.remaining).toBe(4);
    act(g, { type: 'sendText', contactId: 'kang', template: 'new_arrival' });
    act(g, { type: 'sendText', contactId: 'jin', template: 'private' });
    reject(g, { type: 'sendText', contactId: 'oh', template: 'private' }); // 세 번째 영업 문자
    reject(g, { type: 'sendText', contactId: 'kang', template: 'private' }); // 같은 손님 두 번
    expect(st(g).texting.afternoon.remaining).toBe(2);

    const d = dawnTexting();
    expect(st(d).texting.dawn.remaining).toBe(3);
    act(d, { type: 'sendText', contactId: 'marsh', template: 'dawn_offer' });
    act(d, { type: 'sendText', contactId: 'baek', template: 'dawn_name' });
    reject(d, { type: 'sendText', contactId: 'zero', template: 'dawn_open' });
    expect(st(d).texting.dawn.remaining).toBe(1);
  });

  it('다른 교대의 템플릿/연락처는 보낼 수 없다', () => {
    const g = afternoonTexting();
    reject(g, { type: 'sendText', contactId: 'marsh', template: 'dawn_offer' });
    reject(g, { type: 'sendText', contactId: 'kang', template: 'dawn_open' });
  });
});
