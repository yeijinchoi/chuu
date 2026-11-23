/**
 * 배경음악. 오후·새벽·04:44·타이틀 네 곡을 반복 재생하고 장면이 바뀌면 교차 페이드한다.
 * 브라우저는 사용자 입력 전에는 소리를 막으므로, 첫 입력 때 원하는 곡을 시작한다.
 * 음소거는 저장소에 기억한다(M 키, 구석의 ♪ 버튼).
 */
export type BgmTrack = 'title' | 'afternoon' | 'dawn' | 'finale';

const SRC: Record<BgmTrack, string> = {
  title: 'audio/loop-title.mp3',
  afternoon: 'audio/loop-afternoon.mp3',
  dawn: 'audio/loop-dawn.mp3',
  finale: 'audio/loop-finale.mp3',
};
/** 곡마다 원본 음량이 달라 맞춘 값 (0~1) */
const GAIN: Record<BgmTrack, number> = { title: 0.85, afternoon: 0.6, dawn: 0.6, finale: 0.65 };
const MASTER = 0.55;
const FADE_MS = 1600;
const KEY = 'closing-time.bgm.muted';

export class Bgm {
  private readonly audios = new Map<BgmTrack, HTMLAudioElement>();
  private want: BgmTrack | null = null;
  private current: BgmTrack | null = null;
  private unlocked = false;
  private muted = false;
  private timer = 0;
  readonly button: HTMLButtonElement;

  constructor() {
    try { this.muted = localStorage.getItem(KEY) === '1'; } catch { /* 저장소가 막혀 있어도 계속 */ }
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bgm-toggle';
    this.button.addEventListener('click', () => this.toggle());
    this.paintButton();
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.apply();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private audio(t: BgmTrack): HTMLAudioElement {
    let a = this.audios.get(t);
    if (!a) {
      a = new Audio(SRC[t]);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      this.audios.set(t, a);
    }
    return a;
  }

  /** 지금 장면에 어울리는 곡 */
  set(track: BgmTrack): void {
    if (this.want === track) return;
    this.want = track;
    this.apply();
  }

  toggle(): void {
    this.muted = !this.muted;
    try { localStorage.setItem(KEY, this.muted ? '1' : '0'); } catch { /* 무시 */ }
    this.paintButton();
    this.apply();
  }

  private paintButton(): void {
    this.button.textContent = this.muted ? '♪̸' : '♪';
    this.button.setAttribute('aria-pressed', String(this.muted));
    this.button.setAttribute('aria-label', this.muted ? '배경음악 켜기' : '배경음악 끄기');
    this.button.title = this.muted ? '배경음악 켜기 (M)' : '배경음악 끄기 (M)';
    this.button.classList.toggle('is-muted', this.muted);
  }

  /** 곡을 바꾸고 음량을 서서히 맞춘다 */
  private apply(): void {
    if (!this.unlocked) return;
    const target = this.muted ? null : this.want;
    if (target && target !== this.current) {
      const a = this.audio(target);
      a.currentTime = a.currentTime || 0;
      void a.play().catch(() => { this.unlocked = false; /* 다음 입력 때 다시 시도 */ this.rearm(); });
    }
    this.current = target;
    this.fade();
  }

  private rearm(): void {
    const again = (): void => {
      window.removeEventListener('pointerdown', again);
      window.removeEventListener('keydown', again);
      this.unlocked = true;
      this.apply();
    };
    window.addEventListener('pointerdown', again);
    window.addEventListener('keydown', again);
  }

  private fade(): void {
    window.clearInterval(this.timer);
    const step = 50 / FADE_MS;
    this.timer = window.setInterval(() => {
      let busy = false;
      for (const [t, a] of this.audios) {
        const goal = t === this.current ? GAIN[t] * MASTER : 0;
        const d = goal - a.volume;
        if (Math.abs(d) <= step * MASTER) a.volume = goal;
        else { a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(d) * step * MASTER)); busy = true; }
        if (a.volume === 0 && !a.paused && t !== this.current) a.pause();
      }
      if (!busy) window.clearInterval(this.timer);
    }, 50);
  }
}
