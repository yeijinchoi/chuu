/**
 * 업무폰 도트 아이콘. 글리프는 문자 격자로 그리고 SVG rect 줄로 펼친다.
 * 색은 class(g-a, g-b, g-c)로만 정하고, CSS가 토큰(--g-a 등)을 읽는다. hex는 쓰지 않는다.
 *  a: 주 글자색, b: 포인트, c: 바탕 반대색(선·점)
 */
const NS = 'http://www.w3.org/2000/svg';

export type PhoneGlyph = 'messages' | 'contacts' | 'notes' | 'black' | 'signal' | 'wifi' | 'search' | 'plus' | 'send' | 'back' | 'tips';

/** 행 단위 격자: '.'은 빈칸, 그 밖의 글자는 색 class */
const grid = (w: number, h: number, on: (x: number, y: number) => string | null): string[] =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (__, x) => on(x, y) ?? '.').join(''));

const PAGE = grid(14, 14, (x, y) => {
  if (x < 2 || x > 11 || y < 1 || y > 12) return null;
  if (y % 2 === 1 && y >= 3 && y <= 9 && x >= 4 && x <= 9) return 'c';
  return 'a';
});

const NOTEBOOK = grid(14, 14, (x, y) => {
  if (x < 3 || x > 10 || y < 1 || y > 12) return null;
  if (x === 4) return 'c'; // 제본 줄
  if (x === 8 && y >= 9) return 'b'; // 책갈피 끈
  return 'a';
});

const SIGNAL_H = [3, 5, 7, 8];
const SIGNAL = grid(11, 8, (x, y) => {
  const bar = Math.floor(x / 3);
  if (x % 3 === 2 || bar > 3) return null;
  return y >= 8 - (SIGNAL_H[bar] ?? 0) ? 'a' : null;
});

const WIFI = [
  '....aaa....',
  '..aa...aa..',
  '.a.......a.',
  '...aaaaa...',
  '..a.....a..',
  '.....a.....',
  '.....a.....',
];

const SEARCH = [
  '..aaaa...',
  '.a....a..',
  'a......a.',
  'a......a.',
  'a......a.',
  '.a....a..',
  '..aaaa...',
  '......aa.',
  '.......aa',
];

const PLUS = ['...a...', '...a...', '...a...', 'aaaaaaa', '...a...', '...a...', '...a...'];

const BACK = ['....aa', '...aa.', '..aa..', '.aa...', 'aa....', '.aa...', '..aa..', '...aa.', '....aa'];

const SEND = ['....a....', '...aaa...', '..aaaaa..', '.aa.a.aa.', '....a....', '....a....', '....a....', '....a....', '....a....'];

const TIPS = [
  '...aaaaa...',
  '..aaaaaaa..',
  '.aaaaaaaaa.',
  '.aaaaaaaaa.',
  '.aaaaaaaaa.',
  '..aaaaaaa..',
  '...aaaaa...',
  '...aaaaa...',
  '....ccc....',
  '...aaaaa...',
  '....ccc....',
];

const GLYPHS: Record<PhoneGlyph, string[]> = {
  messages: [
    '..............',
    '..............',
    '..aaaaaaaaaa..',
    '.aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa.',
    '.aaccaccaccaa.',
    '.aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa.',
    '..aaaaaaaaaa..',
    '..aa..........',
    '..a...........',
    '..............',
    '..............',
    '..............',
  ],
  contacts: [
    '....aaaaaa....',
    '....aaaaaa....',
    '....aaaaaa....',
    '....aaaaaa....',
    '.....aaaa.....',
    '..............',
    '...aaaaaaaa...',
    '..aaaaaaaaaa..',
    '..aaaaaaaaaa..',
    '.aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa.',
    '..............',
    '..............',
  ],
  notes: PAGE,
  black: NOTEBOOK,
  signal: SIGNAL,
  wifi: WIFI,
  search: SEARCH,
  plus: PLUS,
  send: SEND,
  back: BACK,
  tips: TIPS,
};

/** 글리프 하나를 SVG로 만든다. viewBox는 격자 크기다. */
export function phoneGlyph(kind: PhoneGlyph, cls = 'pico'): SVGSVGElement {
  const rows = GLYPHS[kind];
  const w = Math.max(...rows.map((r) => r.length));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${rows.length}`);
  svg.setAttribute('class', cls);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x] as string;
      let end = x;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== '.') {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(x));
        r.setAttribute('y', String(y));
        r.setAttribute('width', String(end - x));
        r.setAttribute('height', '1');
        r.setAttribute('class', `g-${ch}`);
        svg.append(r);
      }
      x = end;
    }
  });
  return svg;
}
