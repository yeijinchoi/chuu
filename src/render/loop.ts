/** 고정 타임스텝(60Hz) 루프. update는 항상 1/60초씩, render는 프레임마다 한 번. */
export const STEP = 1 / 60;

export interface Loop {
  start(): void;
  stop(): void;
}

export function createLoop(update: (dt: number) => void, render: () => void): Loop {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    const elapsed = Math.min(0.25, (now - last) / 1000); // 탭이 멈췄다 돌아와도 몰아서 돌리지 않는다
    last = now;
    acc += elapsed;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render();
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
