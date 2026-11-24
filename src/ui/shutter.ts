import { el, t } from './dom';

/**
 * 교대 셔터: 오후 영업이 끝나면 매장 셔터가 내려오고(장면·진열이 가려진다),
 * 셔터 뒤에서 매장이 새벽으로 바뀐다. 새벽 근무를 시작하며 덮개를 벗길 때 셔터가 올라간다.
 * 그래서 플레이어는 "덮개 아래 물건들이 바뀌어 있다"는 지문과 함께 새벽 매장을 처음 본다.
 * 대화창은 셔터보다 위에 있어서, 셔터가 내려온 동안에도 쪽지를 찾는 지문은 읽힌다.
 */
export class Shutter {
  private readonly els: HTMLElement[];
  private down = false;
  private timer = 0;

  constructor(hosts: readonly HTMLElement[]) {
    this.els = hosts.map((h, i) => {
      const s = el('div', 'shutter');
      s.setAttribute('aria-hidden', 'true');
      h.classList.add('shutter-host');
      // 장면 셔터에만 매장 이름 명판을 단다 (진열 칸은 셔터 살만)
      if (i === 0) s.append(el('div', 'shutter__plate', t('frame.signboard')));
      s.append(el('div', 'shutter__bar'));
      // 걷어 올린 셔터는 틀 위로 삐져나가면 안 된다: 틀 안쪽만 보이는 감싸개에 넣는다
      // (진열 틀은 제목 명판이 위로 튀어나와 있어서 틀 자체를 overflow: hidden으로 자를 수 없다)
      const clip = el('div', 'shutter-clip');
      clip.append(s);
      h.appendChild(clip);
      return s;
    });
  }

  get isDown(): boolean { return this.down; }

  /** 내리거나 올린다. 움직임이 끝나면 done (움직임을 줄이면 바로) */
  move(down: boolean, done?: () => void): void {
    window.clearTimeout(this.timer);
    if (down === this.down) { done?.(); return; }
    this.down = down;
    for (const s of this.els) s.classList.toggle('is-down', down);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.timer = window.setTimeout(() => done?.(), reduced ? 0 : Shutter.MS);
  }

  /** 움직임 없이 바로 (이어하기·새 날 아침) */
  set(down: boolean): void {
    window.clearTimeout(this.timer);
    this.down = down;
    for (const s of this.els) {
      s.classList.add('is-instant');
      s.classList.toggle('is-down', down);
      void s.offsetWidth;
      s.classList.remove('is-instant');
    }
  }

  /** CSS의 transition 시간과 같다 */
  static readonly MS = 1100;
}
