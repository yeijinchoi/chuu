import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CORE = new URL('../../src/core/', import.meta.url);
const FORBIDDEN = ['document', 'window', 'HTMLElement', 'CanvasRenderingContext2D', 'localStorage'];

describe('경계 검사: src/core는 DOM/Canvas/저장소에 접근하지 않는다', () => {
  const files = readdirSync(CORE).filter((f) => f.endsWith('.ts'));
  it('core 파일이 존재한다', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });
  for (const f of files) {
    it(`${f}에 금지 문자열이 없다`, () => {
      const text = readFileSync(new URL(f, CORE), 'utf8');
      for (const word of FORBIDDEN) expect(text.includes(word), `${f} contains ${word}`).toBe(false);
    });
  }
  it('core는 data JSON 외에는 core 밖을 import하지 않는다', () => {
    for (const f of files) {
      const text = readFileSync(new URL(f, CORE), 'utf8');
      for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1] as string;
        expect(/^\.\/|^\.\.\/data\//.test(spec), `${f} imports ${spec}`).toBe(true);
      }
    }
  });
});
