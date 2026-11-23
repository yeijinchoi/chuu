import customers from '../data/customers.json';
import products from '../data/products.json';
import strings from '../data/strings.ko.json';
import { MOODS, type Mood } from '../render/palette';
import { ICON_IDS, drawIcon, drawMini } from '../render/productIcon';
import { buildLut } from '../render/palette';
import { Layer, toImageData } from '../render/pixel';
import type { Renderer } from '../render/renderer';
import type { SpriteDef } from '../render/customerSprite';

/** 개발·확인용 디버그 뷰. 프로덕션 빌드에서도 동작한다.
 *  F1 손님 순환 · F2 교대 · F3 아이콘 격자 · F4 mood 순환. URL ?c=id&shift=dawn&mood=dread&icons=1 로 바로 열 수 있다. */
interface Cust { id: string; name: string; shift: 'afternoon' | 'dawn'; form: 'humanoid' | 'creature'; sprite: SpriteDef['sprite'] }
const list = customers as unknown as Cust[];

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function paint(layer: Layer, scale: number, mood: Mood): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = layer.w;
  c.height = layer.h;
  c.style.width = `${layer.w * scale}px`;
  c.style.height = `${layer.h * scale}px`;
  const x = c.getContext('2d')!;
  const img = x.createImageData(layer.w, layer.h);
  toImageData(layer, buildLut(mood), img);
  x.putImageData(img, 0, 0);
  return c;
}

export function mountDebug(host: HTMLElement, r: Renderer): void {
  const label = el('div', 'debug-label');
  const hint = el('div', 'debug-hint', strings.debug.hint);
  const grid = el('div', 'debug-icons');
  grid.hidden = true;
  host.append(label, hint, grid);

  let index = 0;
  let showIcons = false;
  const params = new URLSearchParams(location.search);

  const refreshLabel = (): void => {
    const c = list[index] as Cust;
    label.textContent = `${c.name} · ${strings.debug.shift[r.shift]} · ${strings.debug.mood[r.mood]}`;
  };
  const defaultMood = (): Mood => (r.shift === 'dawn' ? 'uneasy' : 'calm');
  const setCustomer = (i: number): void => {
    index = (i + list.length) % list.length;
    const c = list[index] as Cust;
    r.setCustomer({ id: c.id, form: c.form, sprite: c.sprite });
    if (c.shift !== r.shift) { r.setShift(c.shift); }
    r.setMood(defaultMood());
    refreshLabel();
  };
  const buildIcons = (): void => {
    grid.replaceChildren();
    const byId = new Map((products as { id: string; name: string; shift: string }[]).map((p) => [p.id, p]));
    for (const id of ICON_IDS) {
      const cell = el('div', 'debug-icons__cell');
      const row = el('div', 'debug-icons__row');
      row.append(paint(drawIcon(id), 2, 'calm'), paint(drawMini(id), 2, 'calm'), paint(drawMini(id), 1, 'calm'));
      cell.append(row, el('div', 'debug-icons__name', `${byId.get(id)?.name ?? id}`));
      grid.append(cell);
    }
  };
  const setIcons = (on: boolean): void => {
    showIcons = on;
    if (on) buildIcons();
    grid.hidden = !on;
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1') { e.preventDefault(); setCustomer(index + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'F2') { e.preventDefault(); r.setShift(r.shift === 'dawn' ? 'afternoon' : 'dawn'); r.setMood(defaultMood()); refreshLabel(); }
    else if (e.key === 'F3') { e.preventDefault(); setIcons(!showIcons); }
    else if (e.key === 'F4') { e.preventDefault(); r.setMood(MOODS[(MOODS.indexOf(r.mood) + 1) % MOODS.length] as Mood); refreshLabel(); if (showIcons) buildIcons(); }
  });

  const start = list.findIndex((c) => c.id === (params.get('c') ?? 'hanyeoreum'));
  setCustomer(start < 0 ? 0 : start);
  const sh = params.get('shift');
  if (sh === 'dawn' || sh === 'afternoon') { r.setShift(sh); r.setMood(defaultMood()); }
  const m = params.get('mood') as Mood | null;
  if (m && MOODS.includes(m)) r.setMood(m);
  if (params.get('scan') === '1') r.scan = true;
  refreshLabel();
  if (params.get('icons') === '1') setIcons(true);
}
