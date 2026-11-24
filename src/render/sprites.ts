import { KEYS, PALETTE, resolveKey, type Mood, type PaletteKey } from './palette';

/**
 * 컨셉 아트에서 오린 손님 스프라이트(public/art/customers).
 * tools/import_customer_sprites.py 가 만든 PNG와 manifest.json(장면 좌표)을 읽는다.
 * mood가 calm이 아니면 각 픽셀을 가장 가까운 팔레트 키로 보고, 장면과 같은 mood 규칙으로 바꾼다.
 */
export interface SpriteEntry { x: number; y: number; w: number; h: number; breathSplit: number; blink: boolean }
export interface CustomerSprite extends SpriteEntry { img: HTMLImageElement; blinkImg: HTMLImageElement | null }

const BASE = 'art/customers/';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite load failed: ${src}`));
    img.src = src;
  });
}

/** 실패한 스프라이트는 빠지고, 그 손님은 코드로 그린 도트로 대체된다. */
export async function loadCustomerSprites(): Promise<Map<string, CustomerSprite>> {
  const out = new Map<string, CustomerSprite>();
  let manifest: Record<string, SpriteEntry>;
  try {
    const res = await fetch(BASE + 'manifest.json');
    if (!res.ok) return out;
    manifest = (await res.json()) as Record<string, SpriteEntry>;
  } catch {
    return out;
  }
  await Promise.all(
    Object.entries(manifest).map(async ([id, e]) => {
      try {
        const img = await loadImage(`${BASE}${id}.png`);
        const blinkImg = e.blink ? await loadImage(`${BASE}${id}.blink.png`).catch(() => null) : null;
        out.set(id, { ...e, img, blinkImg });
      } catch {
        /* 코드 도트로 대체 */
      }
    }),
  );
  return out;
}

/** 새벽 괴현상 그림(public/art/apparitions, tools/import_apparitions.py). 못 불러오면 코드 도트로 대신한다 */
export async function loadApparitionArt(): Promise<Map<string, CustomerSprite>> {
  const out = new Map<string, CustomerSprite>();
  const base = 'art/apparitions/';
  let manifest: Record<string, { x: number; y: number; w: number; h: number }>;
  try {
    const res = await fetch(base + 'manifest.json');
    if (!res.ok) return out;
    manifest = (await res.json()) as typeof manifest;
  } catch {
    return out;
  }
  await Promise.all(Object.entries(manifest).map(async ([kind, e]) => {
    try {
      const img = await loadImage(`${base}${kind}.png`);
      out.set(kind, { ...e, breathSplit: e.h, blink: false, img, blinkImg: null });
    } catch { /* 코드 도트로 대체 */ }
  }));
  return out;
}

const RGB: [PaletteKey, number, number, number][] = KEYS.filter((k) => !k.startsWith('ox')).map((k) => { // 환경 램프(ox*)는 사람에게 쓰지 않는다
  const n = parseInt(PALETTE[k].slice(1), 16);
  return [k, (n >> 16) & 255, (n >> 8) & 255, n & 255];
});

function nearestKey(r: number, g: number, b: number): PaletteKey {
  let best: PaletteKey = 'ink';
  let bd = Infinity;
  for (const [k, kr, kg, kb] of RGB) {
    const d = (r - kr) * (r - kr) * 0.3 + (g - kg) * (g - kg) * 0.59 + (b - kb) * (b - kb) * 0.11;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

const cache = new Map<string, HTMLCanvasElement>();

/** mood가 적용된 스프라이트 캔버스. calm이면 원본 그대로. */
export function spriteFor(id: string, s: CustomerSprite, mood: Mood, blink = false): CanvasImageSource {
  const src = blink && s.blinkImg ? s.blinkImg : s.img;
  if (mood === 'calm') return src;
  const key = `${id}|${mood}|${blink ? 'b' : 'o'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = s.w;
  cv.height = s.h;
  const cx = cv.getContext('2d');
  if (!cx) return src;
  cx.drawImage(src, 0, 0);
  const data = cx.getImageData(0, 0, s.w, s.h);
  const px = data.data;
  const memo = new Map<number, [number, number, number]>();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] ?? 0, g = px[i + 1] ?? 0, b = px[i + 2] ?? 0;
    if ((px[i + 3] ?? 0) === 0) continue;
    const packed = (r << 16) | (g << 8) | b;
    let rgb = memo.get(packed);
    if (!rgb) {
      const k = resolveKey(nearestKey(r, g, b), mood);
      const n = parseInt(PALETTE[k].slice(1), 16);
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      memo.set(packed, rgb);
    }
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
  }
  cx.putImageData(data, 0, 0);
  cache.set(key, cv);
  return cv;
}
