import { describe, expect, it } from 'vitest';
import { customer, data } from './helpers';

describe('데이터 무결성', () => {
  it('상품 26종: 오후 14 + 새벽 12, 새벽 상품은 설명 포함', () => {
    expect(data.products).toHaveLength(26);
    expect(data.products.filter((p) => p.shift === 'afternoon')).toHaveLength(14);
    const dawn = data.products.filter((p) => p.shift === 'dawn');
    expect(dawn).toHaveLength(12);
    for (const p of dawn) expect(p.description, p.id).toBeTruthy();
    expect(new Set(data.products.map((p) => p.id)).size).toBe(26);
    expect(data.products.find((p) => p.id === 'empty_box')).toMatchObject({ color: null, price: 0 });
  });

  it('손님 16명: 오후 8 + 새벽 8, 부서 분포 (오후 가방3·의류3·주얼리2)', () => {
    expect(data.customers).toHaveLength(16);
    const aft = data.customers.filter((c) => c.shift === 'afternoon');
    expect(aft).toHaveLength(8);
    expect(aft.filter((c) => c.category === 'bag')).toHaveLength(3);
    expect(aft.filter((c) => c.category === 'apparel')).toHaveLength(3);
    expect(aft.filter((c) => c.category === 'jewelry')).toHaveLength(2);
    expect(data.customers.filter((c) => c.shift === 'dawn')).toHaveLength(8);
    // 오후 손님은 수칙·특수 지불이 없다
    for (const c of aft) {
      expect(c.rules).toEqual([]);
      expect(c.specialPayment).toBeUndefined();
    }
  });

  it('모든 손님 대사 필드가 채워져 있고, draftLines는 2~3일차 10명에만', () => {
    for (const c of data.customers) {
      for (const k of ['opening', 'askCategory', 'askOccasion', 'askBudget', 'observe', 'success', 'fail'] as const) {
        expect(c.lines[k], `${c.id}.${k}`).toBeTruthy();
      }
      for (const r of c.rules) expect(data.rules.some((x) => x.id === r), `${c.id} rule ${r}`).toBe(true);
    }
    const drafted = data.customers.filter((c) => c.draftLines).map((c) => c.id).sort();
    expect(drafted).toEqual(['actor', 'cha', 'colour', 'cylinder', 'door', 'hound', 'oh', 'park', 'seojin', 'yoon']);
    for (const id of ['hanyeoreum', 'kang', 'jin', 'marsh', 'faceless', 'baek']) expect(customer(id).draftLines).toBeUndefined();
  });

  it('1일차 대사는 GDD §7 원문 그대로 (표본)', () => {
    expect(customer('jin').lines.violation['manner']).toBe('그런 건 묻는 거 아니에요.');
    expect(customer('jin').lines.farewell).toBe('새벽까지 있을 거면… 아니에요. 잘 해요.');
    expect(customer('marsh').lines.violation['5']).toBe('"보지 말라고 들었을 텐데요." 카운터 위의 물이 넘쳐 흐르기 시작한다.');
    expect(customer('faceless').lines.violation['4']).toBe('"빨간 상자가 아니네요." 코트가 열린다. 안에는 손가락뿐이다.');
    expect(customer('baek').lines.openingUninvited).toBe('문자를… 안 주셨더라고요. 그래서 제가 왔어요.');
    expect(customer('hanyeoreum').lines.askOccasion).toBe('다음 주가 엄마 생신이에요. 첫 월급 받았거든요. 엄마는 튀는 색 싫어하세요.');
  });

  it('1일차 일정과 문자 한도', () => {
    const d = data.days[1]!;
    expect(d.texting).toEqual({ afternoon: { total: 4, sales: 2 }, dawn: { total: 3, sales: 2 } });
    expect(d.aftercare.perShift).toBe(2);
    expect(d.schedule.map((s) => `${s.time} ${s.customerId}`)).toEqual([
      '13:30 hanyeoreum', '15:30 kang', '17:30 jin', '02:22 marsh', '03:03 faceless', '03:33 baek',
    ]);
    expect(data.contacts.map((c) => c.id)).toEqual(['kang', 'jin', 'oh', 'marsh', 'baek', 'zero']);
  });

  it('템플릿: 영업 6 + 관리 8, {name}/{contact}/{customer} 자리표시자', () => {
    expect(data.templates.sales).toHaveLength(6);
    expect(data.templates.care).toHaveLength(8);
    expect(data.templates.sales.find((t) => t.id === 'dawn_name')!.text).toBe('{contact}님. 기다리고 있습니다.');
    expect(data.templates.care.find((t) => t.id === 'thanks')!.text).toContain('{customer}');
  });
});
