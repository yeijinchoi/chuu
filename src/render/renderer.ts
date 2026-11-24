import { DRAIN_ORDER, PALETTE, buildLut, type Mood, type PaletteKey } from './palette';
import { Layer, toImageData } from './pixel';
import {
  W, H, APPARITION_ART, APPARITION_SPOTS, DEFAULT_LAYOUT, DOOR_GLASS, apparitionAnim, apparitionDuration, apparitionSpots, bakeScene, drawApparition, drawChandelier, drawMannequinHeadOverlay, drawSceneCue, drawSilhouette, mannequinSlots,
  type Apparition, type SceneBake, type SceneCueView, type SceneLayout, type Shift,
} from './scene';
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

  /** 04:44 문 유리의 실루엣: 현재 짙기, 목표 짙기, 변화 속도(초당) */
  private sil = { level: 0, target: 0, rate: 0, palm: false };
  /** 목표 짙기(0~1)로 seconds초에 걸쳐 바꾼다. reduced-motion이면 즉시. */
  setSilhouette(target: number, seconds = 4, palm = false): void {
    const s = this.sil;
    s.target = target;
    s.palm = palm;
    if (this.reduced || seconds <= 0) { s.level = target; s.rate = 0; }
    else s.rate = Math.abs(target - s.level) / seconds;
    this.acc = 1;
  }
  get silhouetteLevel(): number { return this.sil.level; }

  setShift(s: Shift): void { this.shift = s; }

  // ───── 이야기에 따라 바뀌는 배경
  private layout: SceneLayout = DEFAULT_LAYOUT;
  private finaleTurn = false;
  private cue: SceneCueView | null = null;
  /** 날짜·사건으로 바뀐 배경(마네킹 배치, 회색이 된 장밋빛). 바뀌면 배경을 다시 굽는다 */
  setLayout(l: SceneLayout): void {
    if (l.day === this.layout.day && l.roseGray === this.layout.roseGray) return;
    this.layout = { ...l };
    this.bakes.clear();
    this.baked.clear();
    this.acc = 1;
  }
  /** 마지막 밤: 가장 왼쪽 단발 마네킹이 고개를 돌려 이쪽을 본다 */
  setFinaleTurn(on: boolean): void { this.finaleTurn = on; this.acc = 1; }
  /** 대사에 맞춘 잠깐의 연출 (null이면 없음) */
  setCue(c: SceneCueView | null): void { this.cue = c; this.acc = 1; }

  // ───── 새벽의 괴현상: 손님 시계(t)와 따로 흐르는 시계로, 분위기가 나쁠수록 자주
  private clock = 0;
  private app: { a: Apparition; start: number; dur: number } | null = null;
  private nextApp = 10;
  private lastApp = -1;
  private appGap(): number {
    const [lo, hi] = this.mood === 'calm' ? [16, 28] : this.mood === 'uneasy' ? [10, 18] : this.mood === 'dread' ? [6, 12] : [4, 8];
    return lo + Math.random() * (hi - lo);
  }
  /** 확인용(?test=1): 괴현상 하나를 바로 띄운다. 길이를 주지 않으면 계속 떠 있다 */
  debugApparition(kind: string, seconds = 999): void {
    const a = APPARITION_SPOTS.find((x) => x.kind === kind);
    if (!a) return;
    this.app = { a, start: this.clock, dur: seconds };
    this.acc = 1;
  }

  private tickApparition(): void {
    if (this.shift !== 'dawn') { this.app = null; this.nextApp = this.clock + this.appGap(); return; }
    if (this.app && this.clock > this.app.start + this.app.dur) {
      this.app = null;
      this.nextApp = this.clock + this.appGap();
      this.acc = 1;
    }
    if (!this.app && this.clock >= this.nextApp) {
      const tier = this.mood === 'calm' ? 0 : this.mood === 'uneasy' ? 1 : this.mood === 'dread' ? 2 : 3;
      const spots = apparitionSpots(this.layout.day, tier);
      let i = Math.floor(Math.random() * spots.length);
      if (i === this.lastApp) i = (i + 1) % spots.length; // 같은 것이 연달아 나오지 않게
      this.lastApp = i;
      const a = spots[i] as Apparition;
      this.app = { a, start: this.clock, dur: apparitionDuration(a) };
      this.acc = 1;
    }
  }
  setMood(m: Mood): void { this.mood = m; }
  setCustomer(c: SpriteDef | null): void { this.customer = c; this.t = 0; this.acc = 1; this.nextBlink = 1.5; }
  setSprites(s: Map<string, CustomerSprite>): void { this.sprites = s; this.acc = 1; }
  private art = new Map<string, CustomerSprite>();
  /** 새벽 괴현상 그림 */
  setApparitionArt(a: Map<string, CustomerSprite>): void { this.art = a; }
  private artFor(kind: string): CustomerSprite | undefined {
    const ref = APPARITION_ART[kind as keyof typeof APPARITION_ART];
    return ref ? this.art.get(ref.art) : undefined;
  }
  /** 체커 무늬로 스미기: level 0~4 (2×2 순서 디더). 반투명을 쓰지 않아 팔레트 밖 중간색이 생기지 않는다 */
  private ditherCache = new Map<string, HTMLCanvasElement>();
  private dithered(key: string, src: CanvasImageSource, w: number, h: number, level: number): CanvasImageSource {
    if (level >= 4) return src;
    const ck = `${key}|${level}`;
    const hit = this.ditherCache.get(ck);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    if (!cx) return src;
    cx.drawImage(src, 0, 0);
    const d = cx.getImageData(0, 0, w, h);
    const bayer = [0, 2, 3, 1];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((bayer[(y % 2) * 2 + (x % 2)] as number) >= level) d.data[(y * w + x) * 4 + 3] = 0;
    }
    cx.putImageData(d, 0, 0);
    this.ditherCache.set(ck, cv);
    return cv;
  }

  /** 그림 괴현상: 장면 버퍼를 깐 뒤, 손님보다 먼저(뒤에) 그린다. 움직임은 scene.apparitionAnim이 정한다 */
  private drawApparitionArt(target: CanvasRenderingContext2D, k: number): void {
    const app = this.app;
    if (!app) return;
    const sp = this.artFor(app.a.kind);
    const ref = APPARITION_ART[app.a.kind];
    if (!sp || !ref) return;
    const tt = this.clock - app.start;
    const an = apparitionAnim(app.a.kind, tt, app.dur, this.reduced);
    // 눈 종류는 끝나기 직전에 먼저 사라진다: 깜빡이고 없어진 것처럼
    if (!this.reduced && tt / app.dur > 0.9 && (app.a.kind === 'eyesMany' || app.a.kind === 'doorGapEyes')) an.dither = 0;
    const key = `app:${ref.art}|${this.mood}`;
    const img = this.dithered(key, spriteFor(`app:${ref.art}`, sp, this.mood), sp.w, sp.h, an.dither);
    const doorGlass = app.a.kind === 'doorGapEyes';
    if (doorGlass && an.glass) {
      // 오른쪽 문짝 유리가 어둡게 꺼진다 (반쯤일 땐 체커)
      const g = DOOR_GLASS;
      target.fillStyle = PALETTE.ink;
      if (an.glass >= 1) target.fillRect(g.x * k, g.y * k, g.w * k, g.h * k);
      else for (let y = 0; y < g.h * k; y++) for (let x = 0; x < g.w * k; x++) if ((x + y) % 2 === 0) target.fillRect(g.x * k + x, g.y * k + y, 1, 1);
    }
    if (!an.show || an.dither <= 0) return;
    const place = (sx: number, flip = false): void => {
      const W2 = sp.w * an.sx, H2 = sp.h * an.sy;
      const ax = sx * k + an.dx, ay = app.a.y * k + an.dy;
      const X = ax - W2 / 2;
      const Y = ref.anchor === 'center' ? ay - H2 / 2 : ref.anchor === 'bottom' ? ay - H2 : ay;
      const [c0, c1, c2, c3] = an.clip;
      const srcX = Math.round(c0 * sp.w), srcY = Math.round(c1 * sp.h);
      const srcW = Math.max(1, Math.round((c2 - c0) * sp.w)), srcH = Math.max(1, Math.round((c3 - c1) * sp.h));
      const dx = Math.round(X + c0 * W2), dy = Math.round(Y + c1 * H2);
      const dw = Math.round(srcW * an.sx), dh = Math.round(srcH * an.sy);
      target.save();
      if (doorGlass) {
        const g = DOOR_GLASS;
        target.beginPath(); target.rect(g.x * k, g.y * k, g.w * k, g.h * k); target.clip();
      }
      if (flip) { target.translate(dx * 2 + dw, 0); target.scale(-1, 1); }
      target.drawImage(img, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
      target.restore();
    };
    if (app.a.kind === 'giantEyes') { place(app.a.x - 52); place(app.a.x + 52, true); }
    else place(app.a.x);
  }

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
    // 상체가 올라가면 손과의 사이에 생기는 빈 줄을, 상체 맨 아래 줄을 늘여 메운다
    for (let gap = breath; gap < 0; gap++) {
      b.drawImage(body, 0, sp.breathSplit - 1, sp.w, 1, sp.x, sp.y + sp.breathSplit + gap, sp.w, 1);
    }
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
    if (!bake) { bake = bakeScene(this.shift, this.layout); this.bakes.set(this.shift, bake); }
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
    this.clock += dt;
    this.tickApparition();
    const sil = this.sil;
    if (sil.level !== sil.target) {
      const step = sil.rate * dt;
      sil.level = Math.abs(sil.target - sil.level) <= step ? sil.target : sil.level + Math.sign(sil.target - sil.level) * step;
      this.acc = 1;
    }
    this.flicker.update(dt);
    this.acc += dt;
  }

  /** 정적이 아닌 레이어(샹들리에, 손님)는 20Hz로 다시 그린다 */
  private refreshDynamic(lut: Uint8Array): void {
    this.mid.clear();
    this.top.clear();
    drawChandelier(this.mid, this.shift, this.flicker.level);
    const left = mannequinSlots(this.layout.day)[0];
    if (this.app && !this.artFor(this.app.a.kind)) drawApparition(this.mid, this.app.a, (this.clock - this.app.start) / this.app.dur, this.reduced);
    const twitch = this.app?.a.kind === 'mannequinTwitch' && (this.reduced || Math.floor((this.clock - this.app.start) * 12) % 3 !== 2);
    if (this.cue) drawSceneCue(this.mid, this.cue, this.layout, this.shift);
    else drawMannequinHeadOverlay(this.mid, this.mood, left?.cx ?? 66, this.finaleTurn || twitch);
    drawSilhouette(this.mid, this.sil.level, this.sil.palm);
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
    if (this.scan || this.mood === 'collapse') scanlines(b, W, H);
    // 화면 캔버스는 장면의 2배(640×360). 장면은 2배로 키워 깔고,
    // 사람 모습 손님은 2배 촘촘한 도트로 그 위에 그린 뒤 카운터(앞 레이어)를 덮는다.
    const k = target.canvas.width / W;
    target.imageSmoothingEnabled = false;
    target.drawImage(this.buffer, 0, 0, W * k, H * k);
    this.drawApparitionArt(target, k);
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
