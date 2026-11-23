import { describe, expect, it } from 'vitest';
import customers from '../../src/data/customers.json';

// 대접을 거절당했을 때(none)의 대사. 문과 색은 대접 대상이 아니라 제외한다. 진영숙은 원래 있다.
const EXEMPT = new Set(['door', 'colour', 'jin']);

describe('customer hospitality "none" lines', () => {
  it('every customer that can be served has a non-empty none line', () => {
    for (const c of customers as { id: string; hospitality: { none?: string } }[]) {
      if (EXEMPT.has(c.id)) continue;
      expect(c.hospitality.none, c.id).toBeTruthy();
    }
  });
});
