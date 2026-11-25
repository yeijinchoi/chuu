import { describe, expect, it } from 'vitest';
import { customer, data } from './helpers';

describe('데이터 무결성', () => {
  it('상품 48종: 오후 26 + 새벽 22 (확장 22종 포함), 새벽 상품은 설명 포함', () => {
    expect(data.products).toHaveLength(48);
    expect(data.products.filter((p) => p.shift === 'afternoon')).toHaveLength(26);
    const dawn = data.products.filter((p) => p.shift === 'dawn');
    expect(dawn).toHaveLength(22);
    for (const p of dawn) expect(p.description, p.id).toBeTruthy();
    expect(new Set(data.products.map((p) => p.id)).size).toBe(48);
    expect(data.products.find((p) => p.id === 'empty_box')).toMatchObject({ color: null, price: 0 });
  });

  it('손님마다 정답 상품(accepts)이 실제 상품이고, 그 손님의 교대 상품이다', () => {
    for (const c of data.customers) {
      for (const id of c.accepts ?? []) {
        const p = data.products.find((x) => x.id === id);
        expect(p, `${c.id} → ${id}`).toBeTruthy();
        expect(p?.shift, `${c.id} → ${id}`).toBe(c.shift);
      }
    }
  });

  it('손님 29명: 본편 16(오후 8·새벽 8) + 확장 13(오후 7·새벽 6)', () => {
    expect(data.customers).toHaveLength(29);
    const aft = data.customers.filter((c) => c.shift === 'afternoon');
    expect(aft).toHaveLength(15);
    expect(data.customers.filter((c) => c.shift === 'dawn')).toHaveLength(14);
    // 본편 오후 손님의 부서 분포 (가방3·의류3·주얼리2)
    const main = aft.filter((c) => ['hanyeoreum', 'kang', 'jin', 'oh', 'cha', 'park', 'yoon', 'seojin'].includes(c.id));
    expect(main.filter((c) => c.category === 'bag')).toHaveLength(3);
    expect(main.filter((c) => c.category === 'apparel')).toHaveLength(3);
    expect(main.filter((c) => c.category === 'jewelry')).toHaveLength(2);
    // 오후 손님은 수칙·특수 지불이 없다
    for (const c of aft) {
      expect(c.rules).toEqual([]);
      expect(c.specialPayment).toBeUndefined();
    }
  });

  it('모든 손님 대사 필드가 채워져 있고, draftLines는 2~3일차 10명과 확장 13명에만', () => {
    for (const c of data.customers) {
      for (const k of ['opening', 'askCategory', 'askOccasion', 'askBudget', 'observe', 'success', 'fail'] as const) {
        expect(c.lines[k], `${c.id}.${k}`).toBeTruthy();
      }
      for (const r of c.rules) expect(data.rules.some((x) => x.id === r), `${c.id} rule ${r}`).toBe(true);
    }
    const drafted = data.customers.filter((c) => c.draftLines).map((c) => c.id).sort();
    expect(drafted).toEqual([
      'actor', 'borrowed', 'cats', 'cha', 'colour', 'cylinder', 'do', 'door', 'hound', 'hwangbo', 'jamie', 'jung',
      'lee', 'ma', 'mirror', 'nametag', 'oh', 'park', 'rain', 'seojin', 'sleeper', 'song', 'yoon',
    ]);
    for (const id of ['hanyeoreum', 'kang', 'jin', 'marsh', 'faceless', 'baek']) expect(customer(id).draftLines).toBeUndefined();
  });

  it('1일차 손님의 핵심 대사가 비어 있지 않다 (문구는 편집기로 고치므로 원문 대조는 하지 않는다)', () => {
    for (const t of [customer('jin').lines.violation['manner'], customer('jin').lines.farewell, customer('marsh').lines.violation['5'],
      customer('faceless').lines.violation['4'], customer('baek').lines.openingUninvited, customer('hanyeoreum').lines.askOccasion]) {
      expect(t?.trim().length).toBeGreaterThan(0);
    }
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
    expect(data.templates.sales.find((t) => t.id === 'dawn_name')!.text).toContain('{contact}');
    expect(data.templates.care.find((t) => t.id === 'thanks')!.text).toContain('{customer}');
  });
});
