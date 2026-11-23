import { describe, expect, it } from 'vitest';
import { checkChoice, checkClosingReply, checkRequire } from '../../src/core/rules';
import { act, customer, data, encOf, rig, st } from './helpers';

const R = data.rules;
const violates = (cust: string, stage: Parameters<typeof checkChoice>[1], choice: string) =>
  checkChoice(customer(cust), stage, choice, R, 'dawn');

describe('수칙 판정 (rules.json 데이터 기반, 범용 checkChoice)', () => {
  it('rules.json: 11개, 6번은 판정 없음', () => {
    expect(R).toHaveLength(11);
    const six = R.find((r) => r.id === 6)!;
    expect(six.forbid).toBeUndefined();
    expect(six.require).toBeUndefined();
  });

  it('수칙 1: 서리 맺힌 손님(백설)에게 시착 = 위반 / 다른 클로징 = 정상', () => {
    expect(violates('baek', 'close', 'tryOn')).toEqual({ kind: 'rule', rule: 1 });
    for (const ok of ['boxRed', 'boxGold', 'checkout']) expect(violates('baek', 'close', ok)).toBeNull();
    expect(violates('marsh', 'close', 'tryOn')).toBeNull(); // 서리 없는 손님
  });

  it('수칙 2: 새벽 askBudget = 위반 (가격을 먼저 언급한 마시 씨는 제외)', () => {
    expect(violates('faceless', 'probe', 'askBudget')).toEqual({ kind: 'rule', rule: 2 });
    expect(violates('baek', 'probe', 'askBudget')).toEqual({ kind: 'rule', rule: 2 });
    expect(violates('baek', 'probe', 'askCategory')).toBeNull();
    expect(violates('marsh', 'probe', 'askBudget')).toBeNull(); // mentionsPrice
  });

  it('같은 askBudget: 오후 manner / 새벽 규칙 2 / 문 밖의 손님은 필수', () => {
    // 오후: 가격을 먼저 언급하지 않은 손님이면 매너 실수, 먼저 언급한 손님이면 무사
    expect(checkChoice(customer('hanyeoreum'), 'probe', 'askBudget', R, 'afternoon')).toEqual({ kind: 'manner' });
    expect(checkChoice(customer('jin'), 'probe', 'askBudget', R, 'afternoon')).toEqual({ kind: 'manner' });
    expect(checkChoice(customer('kang'), 'probe', 'askBudget', R, 'afternoon')).toBeNull();
    // 오후에는 다른 판정이 없다
    expect(checkChoice(customer('hanyeoreum'), 'probe', 'observe', R, 'afternoon')).toBeNull();
    expect(checkChoice(customer('hanyeoreum'), 'greet', 'direct', R, 'afternoon')).toBeNull();
    // 새벽
    expect(violates('faceless', 'probe', 'askBudget')).toEqual({ kind: 'rule', rule: 2 });
    // 문 밖의 손님: 2번은 적용되지 않고(예외), askBudget이 필수
    expect(violates('door', 'probe', 'askBudget')).toBeNull();
    expect(checkRequire(customer('door'), 'probe', ['askCategory', 'observe'], R, 'dawn')).toBe(9);
    expect(checkRequire(customer('door'), 'probe', ['askCategory', 'askBudget'], R, 'dawn')).toBeNull();
    // 같은 require가 오후에는 걸리지 않는다
    expect(checkRequire(customer('door'), 'probe', ['askCategory', 'observe'], R, 'afternoon')).toBeNull();
  });

  it('수칙 4: "아무거나" 손님은 boxRed가 필수', () => {
    expect(checkRequire(customer('faceless'), 'close', ['boxRed'], R, 'dawn')).toBeNull();
    for (const bad of ['boxGold', 'checkout', 'tryOn']) {
      expect(checkRequire(customer('faceless'), 'close', [bad], R, 'dawn')).toBe(4);
    }
    // 다른 손님에게는 필수가 아니다
    expect(checkRequire(customer('baek'), 'close', ['checkout'], R, 'dawn')).toBeNull();
  });

  it('수칙 5: 마시 씨 관찰 = 위반', () => {
    expect(violates('marsh', 'probe', 'observe')).toEqual({ kind: 'rule', rule: 5 });
    expect(violates('marsh', 'probe', 'askCategory')).toBeNull();
    expect(violates('baek', 'probe', 'observe')).toBeNull(); // 소금 냄새 손님이 아니면 괜찮다
  });

  it('수칙 7: 노란 옷의 배우에게 밝은 인사 = 위반 (quiet 정답, direct는 일반 불일치)', () => {
    expect(violates('actor', 'greet', 'warm')).toEqual({ kind: 'rule', rule: 7 });
    expect(violates('actor', 'greet', 'quiet')).toBeNull();
    expect(violates('actor', 'greet', 'direct')).toBeNull();
    expect(violates('marsh', 'greet', 'warm')).toBeNull();
  });

  it('수칙 8: 원통을 든 손님에게 용도 묻기 = 위반', () => {
    expect(violates('cylinder', 'probe', 'askOccasion')).toEqual({ kind: 'rule', rule: 8 });
    expect(violates('cylinder', 'probe', 'askCategory')).toBeNull();
    expect(violates('baek', 'probe', 'askOccasion')).toBeNull();
  });

  it('수칙 9: 문 밖의 손님 — 두 칸 다 쓰고 askBudget이 없으면 위반 (위 테스트 + 응대 흐름)', () => {
    const g = rig('door', 'dawn');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    const ev = act(g, { type: 'probe', probe: 'observe' });
    expect(ev.some((e) => e.type === 'violation' && e.rule === 9)).toBe(true);
    expect(st(g).composure).toBe(75);

    const ok = rig('door', 'dawn');
    act(ok, { type: 'greet', style: 'quiet' });
    const e1 = act(ok, { type: 'probe', probe: 'askBudget' });
    expect(e1.some((e) => e.type === 'violation')).toBe(false);
    expect(e1.some((e) => e.type === 'mannerSlip')).toBe(false);
    act(ok, { type: 'probe', probe: 'askCategory' });
    expect(encOf(ok).step).toBe('propose');
    expect(st(ok).composure).toBe(100);
  });

  it('수칙 10: 바깥에서 온 색 — 카드 4장, empty_box가 아니면 위반 / empty_box는 정상', () => {
    const bad = rig('colour', 'dawn');
    act(bad, { type: 'greet', style: 'quiet' });
    act(bad, { type: 'probe', probe: 'askCategory' });
    act(bad, { type: 'probe', probe: 'askOccasion' });
    const e = encOf(bad);
    expect(e.offered).toHaveLength(4);
    expect(e.offered).toContain('empty_box');
    const wrong = e.offered.find((id) => id !== 'empty_box')!;
    const ev = act(bad, { type: 'propose', productId: wrong });
    expect(ev.some((x) => x.type === 'violation' && x.rule === 10)).toBe(true);
    expect(st(bad).composure).toBe(75);

    const good = rig('colour', 'dawn');
    act(good, { type: 'greet', style: 'quiet' });
    act(good, { type: 'probe', probe: 'askCategory' });
    act(good, { type: 'probe', probe: 'askOccasion' });
    act(good, { type: 'propose', productId: 'empty_box' });
    act(good, { type: 'close', choice: 'boxRed' });
    expect(encOf(good).outcome).toBe('sold');
    expect(st(good).composure).toBe(100);
  });

  it('수칙 11: 모퉁이의 개 — 상자 포장 = 위반, 결제 안내는 정상', () => {
    for (const c of ['boxRed', 'boxGold'])
      expect(violates('hound', 'close', c)).toEqual({ kind: 'rule', rule: 11 });
    expect(violates('hound', 'close', 'checkout')).toBeNull();
    expect(violates('hound', 'close', 'tryOn')).toBeNull();
    expect(violates('baek', 'close', 'boxRed')).toBeNull();
  });

  it('수칙 3: 04:44 답장 = 위반, 무시 = 정상', () => {
    expect(checkClosingReply(true, R)).toBe(3);
    expect(checkClosingReply(false, R)).toBeNull();
  });

  it('응대 흐름에서의 위반 처리: violation + horror, 평정심 −25, 응대 종료, 매출 없음', () => {
    const g = rig('baek', 'dawn');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'propose', productId: encOf(g).offered.find((id) => id === 'warm_memory_glove') ?? encOf(g).offered[0]! });
    const ev = act(g, { type: 'close', choice: 'tryOn' });
    const kinds = ev.map((e) => e.type);
    expect(kinds).toContain('violation');
    expect(kinds).toContain('horror');
    expect(kinds).toContain('composure');
    expect(ev.find((e) => e.type === 'line' && e.speaker === '백설')).toBeTruthy();
    expect(st(g).composure).toBe(75);
    expect(st(g).violations).toBe(1);
    expect(st(g).salesCount).toBe(0);
    expect(st(g).dawnLedger).toHaveLength(0);
    expect(encOf(g).outcome).toBe('horror');
    expect(encOf(g).step).toBe('done');
  });

  it('오후 매너 실수: 호감 −10, mannerSlips++, 응대는 계속, 평정심 불변', () => {
    const g = rig('jin', 'afternoon');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'serve', drink: 'water' });
    const before = encOf(g).affinity;
    const ev = act(g, { type: 'probe', probe: 'askBudget' });
    expect(ev.some((e) => e.type === 'mannerSlip')).toBe(true);
    expect(ev.find((e) => e.type === 'line')).toMatchObject({ text: '그런 건 묻는 거 아니에요.' });
    expect(encOf(g).affinity).toBe(before - 10);
    expect(encOf(g).mannerSlips).toBe(1);
    expect(st(g).mannerSlips).toBe(1);
    expect(st(g).composure).toBe(100);
    expect(encOf(g).step).toBe('probe');
    expect(st(g).cards['jin']!.budget).toBeUndefined(); // 대답을 못 들었다
  });

  it('규칙 9 손님: 규칙 2는 적용되지 않는다 (askBudget이 위반 아님)', () => {
    expect(violates('door', 'probe', 'askBudget')).toBeNull();
  });
});
