import type { Game } from '../core/game';
import type { Action, GameEvent, SaveV1 } from '../core/types';

/** 이벤트를 받은 UI의 응답: continue = 다음 이벤트로, wait = 사용자가 넘길 때까지 멈춤, retry = 멈췄다가 같은 이벤트를 다시 처리 */
export type Flow = 'continue' | 'wait' | 'retry';

export interface EventSink {
  onEvent(e: GameEvent): Flow;
  /** 큐가 비었다: 지금 phase에 맞는 입력 UI를 보여 준다 */
  onIdle(): void;
}

/** Game을 감싼다. dispatch 결과를 큐에 넣고 UI에 순서대로 전달한다. 대사 이벤트는 사용자가 넘길 때까지 큐를 멈춘다. */
export class Bridge {
  private queue: GameEvent[] = [];
  private paused = false;
  private pumping = false;

  constructor(readonly game: Game, private readonly sink: EventSink) {}

  get busy(): boolean { return this.paused || this.queue.length > 0; }

  dispatch(a: Action): void {
    if (this.busy) return; // 대사가 진행되는 동안의 입력은 무시한다
    this.push(this.game.dispatch(a));
  }

  resume(save: SaveV1): void {
    this.push(this.game.resume(save));
  }

  private push(events: GameEvent[]): void {
    this.queue.push(...events);
    this.pump();
  }

  /** 멈춘 이벤트(대사)를 사용자가 넘겼다 */
  release(): void {
    this.paused = false;
    this.pump();
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        while (!this.paused && this.queue.length > 0) {
          const e = this.queue.shift() as GameEvent;
          const flow = this.sink.onEvent(e);
          if (flow === 'retry') { this.queue.unshift(e); this.paused = true; }
          else if (flow === 'wait') this.paused = true;
        }
        if (this.paused) break;
        this.sink.onIdle(); // onIdle이 다시 dispatch할 수 있다(자동 advance)
        if (this.queue.length === 0 || this.paused) break;
      }
    } finally {
      this.pumping = false;
    }
  }
}
