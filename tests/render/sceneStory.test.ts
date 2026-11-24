import { describe, expect, it } from 'vitest';
import { APPARITION_SPOTS, W, H, apparitionSpots, bakeScene, drawApparition, drawSceneCue, mannequinSlots } from '../../src/render/scene';
import { KEY_INDEX } from '../../src/render/palette';
import { Layer, T } from '../../src/render/pixel';

const count = (l: Layer, keys: string[]): number => l.data.filter((v) => keys.some((k) => KEY_INDEX[k as keyof typeof KEY_INDEX] === v)).length;
const same = (a: Layer, b: Layer): boolean => a.data.every((v, i) => v === b.data[i]);

describe('이야기에 따라 바뀌는 배경', () => {
  it('1일차 마네킹 둘 → 2일차 "한 칸 옮겨져 있다" → 4일차 "세 개로 늘어 있다" (맨 왼쪽은 단발)', () => {
    expect(mannequinSlots(1).map((m) => m.kind)).toEqual(['dress', 'coat']);
    expect(mannequinSlots(2).find((m) => m.kind === 'dress')?.cx).not.toBe(mannequinSlots(1).find((m) => m.kind === 'dress')?.cx);
    expect(mannequinSlots(4)).toHaveLength(3);
    expect(mannequinSlots(4)[0]?.kind).toBe('bob'); // 마지막 밤 "가장 왼쪽의 단발"
    expect(mannequinSlots(5)).toEqual(mannequinSlots(4));
  });

  it('배치가 바뀌면 굽힌 배경도 실제로 달라진다', () => {
    const d1 = bakeScene('afternoon', { day: 1, roseGray: false }).back;
    const d2 = bakeScene('afternoon', { day: 2, roseGray: false }).back;
    const d4 = bakeScene('afternoon', { day: 4, roseGray: false }).back;
    expect(same(d1, d2)).toBe(false);
    expect(same(d2, d4)).toBe(false);
  });

  it('바깥에서 온 색 뒤: 선반의 장밋빛 하나가 회색이 된다', () => {
    const rose = ['rose', 'rose-light', 'rose-dark'];
    const before = count(bakeScene('dawn', { day: 4, roseGray: false }).back, rose);
    const after = count(bakeScene('dawn', { day: 4, roseGray: true }).back, rose);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0); // 하나만: 다른 분홍은 그대로
  });

  it('잠깐 연출은 무언가를 그린다 (늘어난 마네킹·문 쪽을 보는 고개)', () => {
    for (const cue of ['extra_one', 'extra_two', 'uniform_added', 'all_turn_door'] as const) {
      const l = new Layer(W, H);
      drawSceneCue(l, cue, { day: 3, roseGray: false }, 'dawn');
      expect(l.data.some((v) => v !== T), cue).toBe(true);
    }
  });

  it('새벽 괴현상: 핏자국은 와인색, 거울이 가려진 날(4일차~)에는 거울 속에 나오지 않는다', () => {
    const l = new Layer(W, H);
    drawApparition(l, APPARITION_SPOTS.find((a) => a.kind === 'blood')!, 0.5, false);
    expect(count(l, ['wine', 'wine-dark'])).toBeGreaterThan(0);
    expect(apparitionSpots(1).some((a) => a.kind === 'mirrorFace')).toBe(true);
    expect(apparitionSpots(4).some((a) => a.kind === 'mirrorFace')).toBe(false);
  });
});

describe('괴현상의 단계 (레퍼런스: 평온할 땐 작고 짧게, 무너질수록 크게)', () => {
  it('평온에서는 작은 것만, 거대한 눈은 붕괴 단계에서만', () => {
    const calm = apparitionSpots(1, 0).map((a) => a.kind);
    expect(calm).toEqual(expect.arrayContaining(['doorGapEyes', 'hallHand', 'shelfFingers']));
    expect(calm).not.toContain('giantEyes');
    expect(calm).not.toContain('blood');
    expect(apparitionSpots(1, 3).map((a) => a.kind)).toContain('giantEyes');
  });
  it('새 괴현상은 모두 무언가를 그린다', () => {
    for (const a of APPARITION_SPOTS) {
      if (a.kind === 'mannequinTwitch') continue; // 마네킹 고개는 렌더러가 머리 연출로 돌린다
      const l = new Layer(W, H);
      drawApparition(l, a, 0.4, true);
      expect(l.data.some((v) => v !== T), a.kind).toBe(true);
    }
  });
});

describe('괴현상 그림 (public/art/apparitions)', () => {
  it('그림으로 그리는 종류마다 그림 파일과 크기가 있다', async () => {
    const fs = await import('node:fs');
    const { APPARITION_ART } = await import('../../src/render/scene');
    const manifest = JSON.parse(fs.readFileSync('public/art/apparitions/manifest.json', 'utf8')) as Record<string, { w: number; h: number }>;
    for (const [kind, ref] of Object.entries(APPARITION_ART)) {
      expect(manifest[ref!.art], kind).toBeTruthy();
      expect(fs.existsSync(`public/art/apparitions/${ref!.art}.png`), kind).toBe(true);
    }
  });
});

describe('괴현상 움직임 (apparitionAnim)', () => {
  it('문틈 얼굴: 유리가 먼저 꺼지고 얼굴이 스며 나왔다 사라진다', async () => {
    const { apparitionAnim } = await import('../../src/render/scene');
    expect(apparitionAnim('doorGapEyes', 0, 1.1, false).dither).toBe(0);
    expect(apparitionAnim('doorGapEyes', 0.55, 1.1, false).dither).toBe(4);
    expect(apparitionAnim('doorGapEyes', 0.55, 1.1, false).glass).toBe(1);
  });
  it('바닥의 손은 아래에서부터 올라오고, 핏자국은 위에서부터 흘러내린다', async () => {
    const { apparitionAnim } = await import('../../src/render/scene');
    const hand = (t: number) => apparitionAnim('hallHand', t, 1.5, false).clip[1];
    expect(hand(0.1)).toBeGreaterThan(hand(0.45)); // 위쪽 잘림이 줄어든다 = 올라온다
    const blood = (t: number) => apparitionAnim('blood', t, 2.6, false).clip[3];
    expect(blood(1.4)).toBeGreaterThan(blood(0.2));
  });
  it('거울 속 여자는 끊기듯 다가오고(배율이 단계로 커진다), 거대한 눈은 한 번 깜빡인다', async () => {
    const { apparitionAnim } = await import('../../src/render/scene');
    const s = (t: number) => apparitionAnim('mirrorFigure', t, 1.8, false).sx;
    expect(s(0.3)).toBeLessThan(s(0.9));
    expect(s(0.9)).toBeLessThan(s(1.5));
    expect(apparitionAnim('giantEyes', 1.2, 2.0, false).sy).toBeLessThan(0.2);
  });
  it('움직임 줄이기면 움직이지 않고 그대로 보인다', async () => {
    const { apparitionAnim } = await import('../../src/render/scene');
    expect(apparitionAnim('mirrorFigure', 0.1, 1.8, true)).toMatchObject({ show: true, sx: 1, dither: 4 });
  });
});
