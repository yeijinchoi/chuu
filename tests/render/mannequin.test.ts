import { describe, expect, it } from 'vitest';
import { Layer, T } from '../../src/render/pixel';
import { drawMannequinHeadOverlay } from '../../src/render/scene';
import type { Mood } from '../../src/render/palette';

const count = (mood: Mood): number => {
  const l = new Layer(320, 180);
  drawMannequinHeadOverlay(l, mood);
  return l.data.filter((v) => v !== T).length;
};

describe('mannequin head overlay', () => {
  it('draws nothing while calm or uneasy', () => {
    expect(count('calm')).toBe(0);
    expect(count('uneasy')).toBe(0);
  });

  it('turns the head and shows eyes at dread', () => {
    expect(count('dread')).toBeGreaterThan(0);
  });

  it('adds the bob wig at collapse and breach', () => {
    expect(count('collapse')).toBeGreaterThan(count('dread'));
    expect(count('breach')).toBe(count('collapse'));
  });
});
