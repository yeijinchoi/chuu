import products from '../data/products.json';
import { buildLut, type Mood } from '../render/palette';
import { toImageData } from '../render/pixel';
import { drawIcon } from '../render/productIcon';
import type { Category, Product, Shift } from '../core/types';
import { button, el, t } from './dom';

const ALL = products as unknown as Product[];
const CATS: Category[] = ['bag', 'apparel', 'jewelry'];
const SLOTS = 7;

const iconCache = new Map<string, string>();
/** 32×32 아이콘 → data URL (표시는 CSS로 64×64). mood별로 다시 칠한다. */
export function iconUrl(id: string, mood: Mood): string {
  const key = `${id}|${mood}`;
  let u = iconCache.get(key);
  if (u) return u;
  const layer = drawIcon(id);
  const cv = document.createElement('canvas');
  cv.width = layer.w;
  cv.height = layer.h;
  const g = cv.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(layer.w, layer.h);
  toImageData(layer, buildLut(mood), img);
  g.putImageData(img, 0, 0);
  u = cv.toDataURL('image/png');
  iconCache.set(key, u);
  return u;
}

export const shortWon = (n: number): string => `₩${(Math.round(n / 10000) / 100).toString()}M`;
const fullWon = (n: number): string => `₩${n.toLocaleString('en-US')}`;

function icon(id: string, mood: Mood): HTMLImageElement {
  const i = el('img', 'icon');
  i.src = iconUrl(id, mood);
  i.alt = '';
  i.width = 64;
  i.height = 64;
  return i;
}

/** 진열 프레임: 평소엔 교대의 카탈로그, 제안 단계에선 상품 카드 */
export class DisplayPanel {
  private shift: Shift = 'afternoon';
  private mood: Mood = 'calm';
  private cat: Category = 'bag';
  private offers: { products: Product[]; onPick: (id: string) => void } | null = null;
  private cards: HTMLButtonElement[] = [];

  constructor(private readonly root: HTMLElement) {
    this.render();
  }

  setShift(s: Shift): void { this.shift = s; this.render(); }
  setMood(m: Mood): void { this.mood = m; this.render(); }

  showCatalog(): void { this.offers = null; this.render(); }
  showOffers(ids: string[], onPick: (id: string) => void): void {
    this.offers = { products: ids.map((id) => ALL.find((p) => p.id === id) as Product).filter(Boolean), onPick };
    this.render();
    this.cards[0]?.focus({ preventScroll: true });
  }
  get proposing(): boolean { return this.offers !== null; }
  /** 키 1~4 */
  pick(n: number): boolean {
    const b = this.cards[n - 1];
    if (!b) return false;
    b.click();
    return true;
  }

  private price(p: Product): HTMLElement {
    const box = el('div', 'price');
    if (p.shift === 'dawn') box.append(el('span', 'price__label', t('display.conversion')));
    box.append(el('span', 'price__value', fullWon(p.price)));
    return box;
  }

  private render(): void {
    const r = this.root;
    r.replaceChildren();
    r.dataset.mode = this.offers ? 'offers' : 'catalog';
    const side = el('div', 'display__side');
    const body = el('div', 'display__body');
    if (this.offers) {
      side.append(el('div', 'display__label', t('display.proposeLabel')));
      side.append(el('div', 'display__hint', t('display.proposeHint')));
      this.cards = [];
      const n = this.offers.products.length;
      body.dataset.count = String(n);
      this.offers.products.forEach((p, i) => {
        const b = el('button', 'card');
        b.type = 'button';
        const color = p.color ? t(`display.colors.${p.color}`) : t('display.colorNone');
        b.title = p.description ? `${p.name}\n${p.description}` : p.name;
        const text = el('div', 'card__text');
        text.append(el('span', 'card__key', `[${i + 1}]`), el('span', 'card__name', p.name));
        const meta = el('div', 'card__meta');
        const chip = el('span', 'chip');
        chip.dataset.color = p.color ?? 'none';
        meta.append(chip, el('span', 'card__color', color));
        text.append(meta, this.price(p));
        if (p.description) text.append(el('span', 'card__desc', p.description.split(/(?<=[.。])\s/)[0] ?? p.description));
        b.append(icon(p.id, this.mood), text);
        b.addEventListener('click', () => this.offers?.onPick(p.id));
        body.append(b);
        this.cards.push(b);
      });
    } else {
      for (const c of CATS) {
        const tab = button('dept-tab', t(`display.tabs.${c}`), () => { this.cat = c; this.render(); this.root.querySelector<HTMLElement>('.dept-tab[aria-selected="true"]')?.focus(); });
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(c === this.cat));
        side.append(tab);
      }
      const items = ALL.filter((p) => p.shift === this.shift && p.category === this.cat && p.id !== 'empty_box');
      for (let i = 0; i < SLOTS; i++) {
        const p = items[i];
        const slot = el('div', p ? 'slot' : 'slot slot--empty');
        if (p) {
          slot.title = p.description ? `${p.name}\n${p.description}` : p.name;
          slot.append(icon(p.id, this.mood), el('span', 'slot__price', shortWon(p.price)));
        }
        body.append(slot);
      }
    }
    const title = el('div', 'display__title', `${t('display.title')} ✦ ${t(`display.shift.${this.shift}`)}`);
    r.append(side, body, title);
  }
}
