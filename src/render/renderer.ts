import { DRAIN_ORDER, buildLut, type Mood, type PaletteKey } from './palette';
import { Layer, toImageData } from './pixel';
import { W, H, bakeScene, drawChandelier, type SceneBake, type Shift } from './scene';
import { drawCustomer, drawOutsideColour, type SpriteDef } from './customerSprite';
import { createFlicker, scanlines, type Flicker } from './effects';
import { createLoop, type Loop } from './loop';
import { spriteFor, type CustomerSprite } from './sprites';

/** 오프스크린 320×180 버퍼에 그린 뒤 화면 캔버스로 복사한다. 정적 배경은 교대·mood별로 한 번만 굽는다. */
export class Renderer {
  shift: Shift = 'afternoon';
  mood: Mood = 'calm';
  customer: SpriteDef | null = null;
  reduced: boolean;
  scan = false;
  /** 컨셉 아트에서 오린 손님 스프라이트. 있으면 코드 도트 대신 쓴다. */
  sprites = new Map<string, CustomerSprite>();

  private t = 0;
  private acc = 0;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private bakes = new Map<Shift, SceneBake>();
  private baked = new Map<string, HTMLCanvasElement>();
  private luts = new Map<string, Uint8Array>();
  private mid = new Layer(W, H);
  private top = new Layer(W, H);
  private midCv: HTMLCanvasElement;
  private topCv: HTMLCanvasElement;
  private midImg: ImageData;
  private topImg: ImageData;
  private flicker: Flicker;
  private loop: Loop | null = null;

  constructor(reduced: boolean) {
    this.reduced = reduced;
    this.flicker = createFlicker(reduced);
    this.buffer = this.canvas();
    this.bctx = this.ctx2d(this.buffer);
    this.midCv = this.canvas();
    this.topCv = this.canvas();
    this.midImg = this.ctx2d(this.midCv).createImageData(W, H);
    this.topImg = this.ctx2d(this.topCv).createImageData(W, H);
  }

  private canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }
  private ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
    const x = c.getContext('2d');
    if (!x) throw new Error('Canvas 2D unavailable');
    x.imageSmoothingEnabled = false;
    return x;
  }

  setShift(s: Shift): void { this.shift = s; }
  setMood(m: Mood): void { this.mood = m; }
  setCustomer(c: SpriteDef | null): void { this.customer = c; this.t = 0; this.acc = 1; this.nextBlink = 1.5; }
  setSprites(s: Map<string, CustomerSprite>): void { this.sprites = s; this.acc = 1; }
  /** 라이브2D 느낌의 대기 동작: 2.5~5.5초마다 0.12초 눈 감기, 3.2초 주기로 상체 1도트 숨쉬기 */
  private nextBlink = 1.5;
  private blinkUntil = -1;
  private idle(): { blink: boolean; breath: number } {
    if (this.t >= this.nextBlink) {
      this.blinkUntil = this.t + 0.12;
      this.nextBlink = this.t + 2.5 + Math.random() * 3;
    }
    const breath = this.reduced ? 0 : Math.sin((this.t / 3.2) * Math.PI * 2) > 0.35 ? -1 : 0;
    return { blink: this.t < this.blinkUntil, breath };
  }
  private drawImageSprite(b: CanvasRenderingContext2D, sp: CustomerSprite, id: string): void {
    const { blink, breath } = this.idle();
    const body = spriteFor(id, sp, this.mood, false);
    // 카운터 위 손(아래쪽)은 고정, 그 위 상체만 숨쉰다
    b.drawImage(body, 0, sp.breathSplit, sp.w, sp.h - sp.breathSplit, sp.x, sp.y + sp.breathSplit, sp.w, sp.h - sp.breathSplit);
    b.drawImage(body, 0, 0, sp.w, sp.breathSplit, sp.x, sp.y + breath, sp.w, sp.breathSplit);
    if (blink && sp.blinkImg) {
      b.drawImage(spriteFor(id, sp, this.mood, true), 0, 0, sp.w, sp.breathSplit, sp.x, sp.y + breath, sp.w, sp.breathSplit);
    }
  }
  private imageSprite(): CustomerSprite | undefined {
    return this.customer ? this.sprites.get(this.customer.id) : undefined;
  }

  /** 바깥에서 온 색이 머무는 동안, 1초마다 팔레트 키 계열 하나가 회색이 된다. */
  private drained(): ReadonlySet<PaletteKey> {
    if (this.customer?.id !== 'colour') return new Set();
    return new Set(DRAIN_ORDER.slice(0, Math.floor(this.t)));
  }

  private lut(drained: ReadonlySet<PaletteKey>): { lut: Uint8Array; sig: string } {
    const sig = `${this.mood}|${[...drained].join(',')}`;
    let lut = this.luts.get(sig);
    if (!lut) { lut = buildLut(this.mood, drained); this.luts.set(sig, lut); }
    return { lut, sig };
  }

  /** 정적 레이어를 (교대, mood, 빠진 색)별로 한 번만 래스터화한다 */
  private bakedCanvas(which: 'back' | 'front', lut: Uint8Array, sig: string): HTMLCanvasElement {
    const key = `${this.shift}|${which}|${sig}`;
    let cv = this.baked.get(key);
    if (cv) return cv;
    let bake = this.bakes.get(this.shift);
    if (!bake) { bake = bakeScene(this.shift); this.bakes.set(this.shift, bake); }
    cv = this.canvas();
    const cx = this.ctx2d(cv);
    const img = cx.createImageData(W, H);
    toImageData(bake[which], lut, img);
    cx.putImageData(img, 0, 0);
    this.baked.set(key, cv);
    return cv;
  }

  update(dt: number): void {
    this.t += dt;
    this.flicker.update(dt);
    this.acc += dt;
  }

  /** 정적이 아닌 레이어(샹들리에, 손님)는 20Hz로 다시 그린다 */
  private refreshDynamic(lut: Uint8Array): void {
    this.mid.clear();
    this.top.clear();
    drawChandelier(this.mid, this.shift, this.flicker.level);
    if (this.customer && this.customer.sprite.draw !== 'drawOutsideColour' && !this.imageSprite()) {
      drawCustomer(this.customer, { mid: this.mid, top: this.top }, { t: this.t, reduced: this.reduced, shift: this.shift });
    }
    toImageData(this.mid, lut, this.midImg);
    toImageData(this.top, lut, this.topImg);
    this.midCv.getContext('2d')!.putImageData(this.midImg, 0, 0);
    this.topCv.getContext('2d')!.putImageData(this.topImg, 0, 0);
  }

  private lastSig = '';

  render(target: CanvasRenderingContext2D): void {
    const drained = this.drained();
    const { lut, sig } = this.lut(drained);
    if (this.acc >= 1 / 20 || sig !== this.lastSig) {
      this.refreshDynamic(lut);
      this.acc = 0;
      this.lastSig = sig;
    }
    const b = this.bctx;
    b.drawImage(this.bakedCanvas('back', lut, sig), 0, 0);
    b.drawImage(this.midCv, 0, 0);
    if (this.customer?.sprite.draw === 'drawOutsideColour') drawOutsideColour(b, this.t, this.reduced);
    if (this.scan) scanlines(b, W, H);
    // 화면 캔버스는 장면의 2배(640×360). 장면은 2배로 키워 깔고,
    // 사람 모습 손님은 2배 촘촘한 도트로 그 위에 그린 뒤 카운터(앞 레이어)를 덮는다.
    const k = target.canvas.width / W;
    target.imageSmoothingEnabled = false;
    target.drawImage(this.buffer, 0, 0, W * k, H * k);
    const sp = this.imageSprite();
    if (sp && this.customer) this.drawImageSprite(target, sp, this.customer.id);
    target.drawImage(this.bakedCanvas('front', lut, sig), 0, 0, W * k, H * k);
    target.drawImage(this.topCv, 0, 0, W * k, H * k);
  }

  start(target: CanvasRenderingContext2D): void {
    this.loop?.stop();
    this.loop = createLoop((dt) => this.update(dt), () => this.render(target));
    this.loop.start();
  }
  stop(): void { this.loop?.stop(); }
}
