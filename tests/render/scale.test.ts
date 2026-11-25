import { describe, expect, it } from 'vitest';
import { computeScale } from '../../src/ui/stage';

describe('무대 배율', () => {
  it('1920 미만 창에서도 1배에 머물지 않고 창에 맞춰 커진다', () => {
    expect(computeScale(1280, 800)).toBeCloseTo(1.3, 5);
    expect(computeScale(1440, 900)).toBeCloseTo(1.5, 5);
    expect(computeScale(1366, 768)).toBeCloseTo(1.4, 5);
  });
  it('정수 배에 아주 가까우면 정수로 붙는다 (도트가 또렷하게)', () => {
    expect(computeScale(1920, 1080)).toBe(2);
    expect(computeScale(1930, 1090)).toBe(2);
    expect(computeScale(960, 540)).toBe(1);
  });
  it('작은 창에서는 줄어든다', () => {
    expect(computeScale(800, 450)).toBeLessThan(1);
  });
  it('태블릿 글자 모드: CSS 1px가 화면 정수 픽셀이 되게 내린다 (아이패드 가로 1000×583, dpr 2 → 1배)', () => {
    expect(computeScale(1000, 583, 2, true)).toBe(1);
    expect(computeScale(1500, 950, 2, true)).toBe(1.5);
    expect(computeScale(1000, 583)).toBe(1); // 그냥 배율도 1 (1.04를 1/20 단위로 내림)
  });
});
