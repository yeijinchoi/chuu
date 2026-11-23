import { sfx } from './sfx';

export type SheetId = 'display' | 'phone';

/**
 * 모바일 바텀시트 두 개(진열 · 업무폰). 아래에서 올라오고, 그랩 핸들을 아래로 끌어 닫는다.
 * 데스크톱에서는 시트가 아니라 고정 프레임이라 이 컨트롤러가 아무것도 하지 않는다(CSS가 data-sheet를 무시한다).
 */
export class Sheets {
  private current: SheetId | null = null;
  private readonly listeners = new Set<(open: SheetId | null) => void>();

  constructor(
    private readonly frames: Record<SheetId, HTMLElement>,
    private readonly backdrop: HTMLElement,
    private readonly stage: HTMLElement,
  ) {
    backdrop.addEventListener('click', () => this.close());
    (Object.keys(frames) as SheetId[]).forEach((id) => this.bindDrag(id));
    this.sync();
  }

  get open(): SheetId | null { return this.current; }
  onChange(fn: (open: SheetId | null) => void): void { this.listeners.add(fn); }

  show(id: SheetId): void {
    if (this.current === id) return;
    this.current = id;
    sfx.play('sheet_open');
    this.sync();
  }

  close(): void {
    if (this.current === null) return;
    this.current = null;
    sfx.play('sheet_close');
    this.sync();
  }

  toggle(id: SheetId): void {
    if (this.current === id) this.close();
    else this.show(id);
  }

  private sync(): void {
    this.stage.dataset.sheet = this.current ?? '';
    for (const [id, f] of Object.entries(this.frames)) {
      const open = id === this.current;
      f.classList.toggle('is-open', open);
      f.style.transform = '';
      f.style.transition = '';
      // 닫힌 시트는 포커스·읽기 대상에서 뺀다 (모바일에서만 의미가 있고 데스크톱에서는 CSS가 항상 보여 준다)
      f.toggleAttribute('data-closed', !open);
    }
    this.backdrop.classList.toggle('is-on', this.current !== null);
    for (const fn of this.listeners) fn(this.current);
  }

  /** 핸들(.sheet-grab)을 잡고 아래로 끌면 시트가 따라 내려가고, 충분히 내려가면 닫힌다 */
  private bindDrag(id: SheetId): void {
    const frame = this.frames[id];
    const grab = frame.querySelector<HTMLElement>('.sheet-grab');
    if (!grab) return;
    let startY = 0;
    let dy = 0;
    let dragging = false;
    let t0 = 0;
    grab.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      dy = 0;
      t0 = e.timeStamp;
      grab.setPointerCapture(e.pointerId);
      frame.style.transition = 'none';
    });
    grab.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      frame.style.transform = `translateY(${dy}px)`;
    });
    const end = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      const v = dy / Math.max(1, e.timeStamp - t0); // px/ms
      frame.style.transition = '';
      if (dy > 80 || v > 0.6) this.close();
      else frame.style.transform = '';
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
    // 키보드: 핸들에서 Enter/Space/Esc로 닫는다
    grab.addEventListener('click', () => { if (dy < 4) this.close(); });
  }
}
