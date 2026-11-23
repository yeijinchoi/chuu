import strings from '../data/strings.ko.json';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** strings.ko.json 점 경로 조회. {0} {name} 형태의 자리표시자를 치환한다. 없으면 경로를 돌려준다(개발 중 누락 확인용). */
export function t(path: string, vars?: Record<string, string | number>): string {
  let cur: unknown = strings;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return path;
    cur = (cur as Record<string, unknown>)[k];
  }
  if (typeof cur !== 'string') return path;
  return vars ? cur.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : cur;
}

export function tList(path: string): string[] {
  let cur: unknown = strings;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return [];
    cur = (cur as Record<string, unknown>)[k];
  }
  return Array.isArray(cur) ? (cur as string[]) : [];
}

export const won = (n: number): string => `₩${n.toLocaleString('en-US')}`;

export function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
