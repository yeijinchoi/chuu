import { describe, expect, it } from 'vitest';
import { EMPTY_BOX, pickOffers, SCORE } from '../../src/core/encounter';
import { deriveRng, mulberry32 } from '../../src/core/rng';
import { moodFor } from '../../src/core/mood';
import { act, customer, data, encOf, newGame, playAfternoon, playCorrect, product, rig, st } from './helpers';

describe('pickOffers', () => {
  it('같은 시드면 같은 결과, 다른 시드면 달라질 수 있다', () => {
    for (const c of data.customers) {
      const a = pickOffers(c, data.products, mulberry32(42));
      const b = pickOffers(c, data.products, mulberry32(42));
      expect(a).toEqual(b);
    }
    const c = customer('hanyeoreum');
    const variants = new Set<string>();
    for (let seed = 0; seed < 40; seed++) variants.add(pickOffers(c, data.products, mulberry32(seed)).join(','));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('부서·색이 모두 맞는 상품이 항상 포함되고, 부서만 맞는/다른 부서 카드가 섞인다', () => {
    for (const c of data.customers) {
      if (c.category === 'any') continue;
      for (let seed = 0; seed < 30; seed++) {
        const ids = pickOffers(c, data.products, mulberry32(seed));
        const ps = ids.map(product);
        const exact = ps.filter((p) => p.category === c.category && c.color !== null && p.color === c.color);
        if (c.color !== null) expect(exact.length, `${c.id}/${seed}`).toBeGreaterThanOrEqual(1);
        expect(ps.some((p) => p.category === c.category && p.color !== c.color)).toBe(true);
        expect(ps.some((p) => p.category !== c.category)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('3장 (onlyProduct 손님은 4장 + empty_box)', () => {
    for (const c of data.customers) {
      const ids = pickOffers(c, data.products, mulberry32(3));
      expect(ids).toHaveLength(c.onlyProduct ? 4 : 3);
      if (c.onlyProduct) expect(ids).toContain(EMPTY_BOX);
      else expect(ids).not.toContain(EMPTY_BOX);
    }
  });

  it('"아무거나" 손님은 무작위 3장', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 20; s++) for (const id of pickOffers(customer('faceless'), data.products, mulberry32(s))) seen.add(id);
    expect(seen.size).toBeGreaterThan(5);
  });

  it('응대 중 제안은 손님·날짜 파생 시드를 쓴다 (같은 게임 시드 = 같은 카드)', () => {
    const a = deriveRng(9, 1, 'jin', 'offers');
    const b = deriveRng(9, 1, 'jin', 'offers');
    expect(a()).toBe(b());
  });
});

describe('교대 분리', () => {
  it('오후 손님에게 새벽 상품이, 새벽 손님에게 오후 상품이 제안되지 않는다', () => {
    for (const c of data.customers) {
      for (let seed = 0; seed < 25; seed++) {
        for (const id of pickOffers(c, data.products, mulberry32(seed))) {
          expect(product(id).shift, `${c.id} ← ${id}`).toBe(c.shift);
        }
      }
    }
  });

  it('오후에는 평정심이 바뀌지 않는다 (매너 실수·판매 성공 포함)', () => {
    const g = newGame(6);
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'sendText', contactId: 'jin', template: 'private' });
    act(g, { type: 'finishTexting' });
    // 한여름: 매너 실수 후 판매
    act(g, { type: 'greet', style: 'direct' }); // 불일치 −10
    act(g, { type: 'probe', probe: 'askBudget' }); // 매너 실수
    act(g, { type: 'probe', probe: 'observe' });
    act(g, { type: 'propose', productId: st(g).phase.kind === 'encounter' ? (st(g).phase as { enc: { offered: string[] } }).enc.offered[0]! : '' });
    act(g, { type: 'close', choice: 'tryOn' });
    expect(st(g).mannerSlips).toBe(1);
    expect(st(g).composure).toBe(100);
    const g2 = newGame(6);
    playAfternoon(g2);
    expect(st(g2).composure).toBe(100);
    expect(st(g2).log.some((e) => e.type === 'composure')).toBe(false);
    expect(st(g2).log.filter((e) => e.type === 'mood')).toEqual([{ type: 'mood', mood: 'calm' }]);
  });

  it('새벽에 들어서면 shift 이벤트와 mood가 바뀐다', () => {
    const g = newGame(6);
    playAfternoon(g);
    act(g, { type: 'finishAftercare' });
    const ev = act(g, { type: 'ackShiftBreak' });
    expect(ev).toContainEqual({ type: 'shift', shift: 'dawn' });
    expect(ev).toContainEqual({ type: 'mood', mood: 'uneasy' });
    // 쪽지에 수칙 1~6번이 뜬다
    const lines = ev.filter((e) => e.type === 'line').map((e) => (e as { text: string }).text);
    expect(lines.some((t) => t.startsWith('6. 서윤이가 돌아오면 ━━━━'))).toBe(true);
    expect(lines.some((t) => t.startsWith('7.'))).toBe(false);
  });

  it('새벽 판매는 매출이 아니라 장부로, 평정심은 판매로 오르지 않는다', () => {
    const g = newGame(6);
    playAfternoon(g);
    const revenue = st(g).revenue;
    act(g, { type: 'finishAftercare' });
    act(g, { type: 'ackShiftBreak' });
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'finishTexting' });
    st(g).composure = 80;
    playCorrect(g);
    expect(st(g).revenue).toBe(revenue);
    expect(st(g).dawnLedger).toHaveLength(1);
    expect(st(g).composure).toBe(80);
  });
});

describe('mood / 점수 상수', () => {
  it('평정심 → mood 단계 (GDD §8)', () => {
    expect([100, 70].map((v) => moodFor(v, 'dawn'))).toEqual(['uneasy', 'uneasy']);
    expect([69, 40].map((v) => moodFor(v, 'dawn'))).toEqual(['dread', 'dread']);
    expect([39, 1].map((v) => moodFor(v, 'dawn'))).toEqual(['collapse', 'collapse']);
    expect(moodFor(10, 'afternoon')).toBe('calm');
  });

  it('SCORE 상수는 GDD §5 값', () => {
    expect(SCORE).toMatchObject({
      baseAffinity: 40, textBonus: 15, greetMatch: 15, greetMismatch: -10, probe: 3, mannerSlip: -10,
      deptMatch: 20, colorMatch: 10, withinBudget: 10, overBudget: -15, anything: 10, tryOn: 10, giftBox: 5,
      sold: 60, regularOffer: 85, violationComposure: -25, closingReplyComposure: -30,
    });
  });
});

describe('판정 임계값', () => {
  it('호감 60 미만이면 판매 실패 (오후: walked, 새벽: 사라짐)', () => {
    const g = newGame(6);
    act(g, { type: 'ackBriefing' });
    act(g, { type: 'finishTexting' });
    act(g, { type: 'greet', style: 'direct' }); // 40 −10
    act(g, { type: 'probe', probe: 'observe' });
    act(g, { type: 'probe', probe: 'askCategory' }); // +3
    const e0 = (st(g).phase as { enc: { offered: string[] } }).enc.offered;
    const wrong = e0.find((id) => product(id).category !== 'bag')!; // 부서 불일치
    act(g, { type: 'propose', productId: wrong });
    act(g, { type: 'close', choice: 'checkout' });
    const enc = (st(g).phase as { enc: { outcome: string } }).enc;
    expect(enc.outcome).toBe('walked');
    expect(st(g).salesCount).toBe(0);
  });

  it('호감 85 미만이면 단골 권유가 없다 (오후), 85 이상이면 권유', () => {
    for (const [affinity, step] of [[84, 'done'], [85, 'regularOffer']] as const) {
      const g = rig('hanyeoreum', 'afternoon');
      act(g, { type: 'greet', style: 'warm' });
      act(g, { type: 'probe', probe: 'askCategory' });
      act(g, { type: 'probe', probe: 'askOccasion' });
      act(g, { type: 'propose', productId: encOf(g).offered[0]! });
      encOf(g).affinity = affinity; // 닫기 직전 호감을 고정 (+0 클로징)
      act(g, { type: 'close', choice: 'boxRed' });
      expect(encOf(g).outcome).toBe('sold');
      expect(encOf(g).step).toBe(step);
    }
  });

  it('새벽은 호감과 상관없이 규칙을 지킨 판매면 단골 권유', () => {
    const g = rig('baek', 'dawn');
    act(g, { type: 'greet', style: 'quiet' });
    act(g, { type: 'probe', probe: 'askCategory' });
    act(g, { type: 'probe', probe: 'askOccasion' });
    act(g, { type: 'propose', productId: encOf(g).offered[0]! });
    encOf(g).affinity = 60;
    act(g, { type: 'close', choice: 'checkout' });
    expect(encOf(g)).toMatchObject({ outcome: 'sold', step: 'regularOffer' });
  });
});
