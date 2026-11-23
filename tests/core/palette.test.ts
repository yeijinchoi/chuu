import { describe, expect, it } from 'vitest';
import { KEYS, MOODS, PALETTE, resolve, resolveKey, type PaletteKey } from '../../src/render/palette';
import { readFileSync } from 'node:fs';

const tokensCss = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');

describe('palette', () => {
  it('has 24 valid hex colors', () => {
    const entries = Object.entries(PALETTE);
    expect(entries).toHaveLength(24);
    for (const [, hex] of entries) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches tokens.css', () => {
    for (const [key, hex] of Object.entries(PALETTE)) {
      expect(tokensCss).toContain(`--${key}: ${hex};`);
    }
  });

  it('calm is the base color', () => {
    for (const k of KEYS) expect(resolve(k, 'calm')).toBe(PALETTE[k]);
  });

  it('uneasy: brass family -> gray, neutrals one step darker, rose kept', () => {
    expect(resolveKey('brass', 'uneasy')).toBe('mist');
    expect(resolveKey('rose', 'uneasy')).toBe('rose');
    expect(resolveKey('paper', 'uneasy')).toBe('bone');
    expect(resolveKey('ink', 'uneasy')).toBe('ink');
    expect(resolveKey('stone', 'uneasy')).toBe('dusk');
  });

  it('dread/collapse: only the wine family survives, neutrals two steps darker', () => {
    for (const mood of ['dread', 'collapse'] as const) {
      expect(resolveKey('wine', mood)).toBe('wine');
      expect(resolveKey('paper', mood)).toBe('ash');
      expect(resolveKey('bone', mood)).toBe('mist');
      for (const k of KEYS) {
        const r = resolveKey(k, mood);
        if (!r.startsWith('wine')) expect(['rose', 'brass', 'steel']).not.toContain(r.split('-')[0]);
      }
    }
  });

  it('breach: ink/wine two-tone, only the brightest stays paper', () => {
    const allowed = new Set<PaletteKey>(['ink', 'wine', 'paper']);
    for (const k of KEYS) expect(allowed.has(resolveKey(k, 'breach'))).toBe(true);
    expect(resolveKey('paper', 'breach')).toBe('paper');
    expect(resolveKey('shadow', 'breach')).toBe('ink');
    expect(resolveKey('ash', 'breach')).toBe('wine');
  });

  it('every mood resolves every key to a palette color', () => {
    for (const m of MOODS) for (const k of KEYS) expect(Object.values(PALETTE)).toContain(resolve(k, m));
  });

  it('drained keys turn gray', () => {
    expect(resolveKey('rose-light', 'calm', new Set<PaletteKey>(['rose']))).toBe('ash');
  });
});
