/**
 * 배경음악. 오후·새벽·04:44·타이틀 네 곡을 반복 재생하고 장면이 바뀌면 앞 곡이 사라진 뒤에 다음 곡이 서서히 들어온다(두 곡이 동시에 울리지 않는다).
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
const FADE_OUT_MS = 900;
const FADE_IN_MS = 1400;
const KEY = 'closing-time.bgm.muted';

export class Bgm {
  private readonly audios = new Map<BgmTrack, HTMLAudioElement>();
  private readonly fades = new Map<HTMLAudioElement, number>();
  private want: BgmTrack | null = null;
  /** 지금 울리고 있는(또는 울리려는) 곡. 항상 한 곡뿐이다. */
  private playing: BgmTrack | null = null;
  private unlocked = false;
  private muted = false;
  private token = 0;
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

  /** 검증용: 곡별 재생 상태 */
  snapshot(): { track: string; paused: boolean; volume: number }[] {
    return [...this.audios].map(([track, a]) => ({ track, paused: a.paused, volume: Math.round(a.volume * 1000) / 1000 }));
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

  /** 볼륨을 ms 동안 목표까지 옮긴다. 같은 오디오의 이전 페이드는 취소한다. */
  private fadeTo(a: HTMLAudioElement, goal: number, ms: number): Promise<void> {
    window.clearInterval(this.fades.get(a));
    return new Promise((resolve) => {
      const start = a.volume;
      const t0 = performance.now();
      const id = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        a.volume = Math.max(0, Math.min(1, start + (goal - start) * k));
        if (k >= 1) { window.clearInterval(id); this.fades.delete(a); resolve(); }
      }, 40);
      this.fades.set(a, id);
    });
  }

  /** 곡을 바꾼다: 앞 곡을 먼저 줄여 멈춘 뒤 다음 곡을 서서히 올린다. 서로 겹쳐 울리지 않는다. */
  private apply(): void {
    if (!this.unlocked) return;
    const target = this.muted ? null : this.want;
    const token = ++this.token;
    const out = this.playing;
    if (target === out) {
      // 같은 곡: 목표 음량만 맞춘다 (페이드 중이었다면 이어서)
      if (target) void this.fadeTo(this.audio(target), GAIN[target] * MASTER, FADE_IN_MS);
      return;
    }
    this.playing = target;
    const stopOthers = (keep: BgmTrack | null): void => {
      for (const [t, a] of this.audios) {
        if (t === keep) continue;
        window.clearInterval(this.fades.get(a));
        this.fades.delete(a);
        a.pause();
        a.volume = 0;
      }
    };
    const startTarget = (): void => {
      if (token !== this.token) return; // 그 사이에 더 새로운 요청이 왔다
      stopOthers(target);
      if (!target) return;
      const a = this.audio(target);
      a.volume = 0;
      void a.play().then(() => { if (token === this.token) void this.fadeTo(a, GAIN[target] * MASTER, FADE_IN_MS); })
        .catch(() => { this.unlocked = false; this.rearm(); });
    };
    if (out) {
      void this.fadeTo(this.audio(out), 0, FADE_OUT_MS).then(startTarget);
    } else {
      startTarget();
    }
  }

  private rearm(): void {
    const again = (): void => {
      window.removeEventListener('pointerdown', again);
      window.removeEventListener('keydown', again);
      this.unlocked = true;
      this.playing = null;
      this.apply();
    };
    window.addEventListener('pointerdown', again);
    window.addEventListener('keydown', again);
  }
}
