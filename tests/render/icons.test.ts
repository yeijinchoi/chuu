import { describe, expect, it } from 'vitest';
import products from '../../src/data/products.json';
import { ICON_IDS, drawIcon, drawMini } from '../../src/render/productIcon';
import { KEYS, type PaletteKey } from '../../src/render/palette';
import { T } from '../../src/render/pixel';

const family = (k: PaletteKey): string | null => {
  const m = /^(rose|brass|steel|wine)/.exec(k);
  return m ? (m[1] as string) : null;
};

describe('product icons', () => {
  it('has one icon per product (26)', () => {
    expect(ICON_IDS).toHaveLength(26);
    for (const p of products as { id: string }[]) expect(ICON_IDS).toContain(p.id);
  });

  it('draws a non-empty 32x32 icon and 16x16 mini, inside the margin', () => {
    for (const id of ICON_IDS) {
      const icon = drawIcon(id), mini = drawMini(id);
      expect([icon.w, icon.h, mini.w, mini.h]).toEqual([32, 32, 16, 16]);
      expect(icon.data.some((v) => v !== T)).toBe(true);
      expect(mini.data.filter((v) => v !== T).length).toBeGreaterThan(20);
    }
  });

  it('uses at most one accent family per icon', () => {
    for (const id of ICON_IDS) {
      const fams = new Set<string>();
      for (const v of drawIcon(id).data) if (v !== T) { const f = family(KEYS[v] as PaletteKey); if (f) fams.add(f); }
      // 윤곽선용 어두운 계열(brass-dark, rose-dark, wine-dark 등)은 음영이므로 제외하고 센다
      const bright = [...fams].filter((f) => {
        for (const v of drawIcon(id).data) { const k = KEYS[v] as PaletteKey; if (v !== T && k === f) return true; if (v !== T && k === `${f}-light`) return true; }
        return false;
      });
      expect(bright.length, `${id}: ${bright.join(',')}`).toBeLessThanOrEqual(1);
    }
  });
});
