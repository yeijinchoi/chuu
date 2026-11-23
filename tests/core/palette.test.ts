import { describe, expect, it } from 'vitest';
import { PALETTE, resolve } from '../../src/render/palette';
import { readFileSync } from 'node:fs';

const tokensCss = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');

describe('palette', () => {
  it('has 16 valid hex colors', () => {
    const entries = Object.entries(PALETTE);
    expect(entries).toHaveLength(16);
    for (const [, hex] of entries) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches tokens.css', () => {
    for (const [key, hex] of Object.entries(PALETTE)) {
      expect(tokensCss).toContain(`--${key}: ${hex};`);
    }
  });

  it('resolve returns base color', () => {
    expect(resolve('paper', 'dread')).toBe(PALETTE.paper);
  });
});
