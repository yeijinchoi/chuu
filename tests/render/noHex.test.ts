import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

describe('render palette discipline', () => {
  it('has no hex colors outside palette.ts', () => {
    const dir = new URL('../../src/render/', import.meta.url);
    for (const f of readdirSync(dir)) {
      if (f === 'palette.ts') continue;
      expect(readFileSync(new URL(f, dir), 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });
  it('core does not import render', () => {
    const dir = new URL('../../src/core/', import.meta.url);
    for (const f of readdirSync(dir)) expect(readFileSync(new URL(f, dir), 'utf8'), f).not.toMatch(/from ['"]\.\.\/render/);
  });
});
