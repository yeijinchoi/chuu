import { describe, expect, it } from 'vitest';
import { classifyProposal } from '../../src/core/reactions';
import { applicableRules, checkChoice } from '../../src/core/rules';
import type { Game } from '../../src/core/game';
import type { CloseId, CustomerDef, GreetStyle, ProbeId } from '../../src/core/types';
import { dawnBond, leaveEnding, TOP_SELLER_REVENUE, yesEnding } from '../../src/core/plot';
import { act, ctxOf, customer, data, encOf, newGame, registered, rightDrink, st, txt } from './helpers';

const PROBES: ProbeId[] = ['askCategory', 'askOccasion', 'observe', 'askBudget'];
const CLOSES: CloseId[] = ['boxGold', 'checkout', 'boxRed', 'tryOn'];

/** 규칙을 지키는 정답 루트로 한 손님을 끝까지 응대한다 */
function serveSafely(g: Game, talkOption: 0 | 1 = 1): string {
  const e0 = encOf(g);
  const c: CustomerDef = customer(e0.customerId);
  const shift = e0.shift;
  const rules = data.rules;
  const greet = ([c.greetPref, 'quiet', 'direct', 'warm'] as GreetStyle[]).find((s) => checkChoice(c, 'greet', s, rules, shift) === null) as GreetStyle;
  act(g, { type: 'greet', style: greet });
  if (encOf(g).step === 'serve') act(g, { type: 'serve', drink: rightDrink(c) });
  const must = applicableRules(c, rules).filter((r) => shift === 'dawn' && r.stage === 'probe' && r.require).map((r) => r.require as ProbeId);
  const probes = [...must];
  for (const p of PROBES) {
    if (probes.length >= 2) break;
    if (!probes.includes(p) && checkChoice(c, 'probe', p, rules, shift) === null && !(p === 'askBudget' && shift === 'afternoon' && !c.mentionsPrice)) probes.push(p);
  }
  for (const p of probes) act(g, { type: 'probe', probe: p });
  const offered = encOf(g).offered;
  const exact = c.onlyProduct ?? offered.find((id) => classifyProposal(ctxOf(g), c, data.products.find((x) => x.id === id)!) === 'perfect') ?? offered[0]!;
  act(g, { type: 'propose', productId: exact });
  const needClose = applicableRules(c, rules).find((r) => shift === 'dawn' && r.stage === 'close' && r.require)?.require as CloseId | undefined;
  const close = needClose ?? CLOSES.find((x) => checkChoice(c, 'close', x, rules, shift) === null) as CloseId;
  act(g, { type: 'close', choice: close });
  if (encOf(g).step === 'talk') act(g, { type: 'talk', option: talkOption });
  if (encOf(g).step === 'regularOffer') act(g, { type: 'regularOffer', accept: true });
  const outcome = encOf(g).outcome;
  act(g, { type: 'advance' });
  return `${c.id}:${outcome}`;
}

/** 한 교대의 응대를 모두 끝낸다 */
function serveAll(g: Game): string[] {
  const out: string[] = [];
  while (st(g).phase.kind === 'encounter') out.push(serveSafely(g));
  return out;
}

function playDay(g: Game): { afternoon: string[]; dawn: string[] } {
  act(g, { type: 'ackBriefing' });
  act(g, { type: 'finishTexting' });
  const afternoon = serveAll(g);
  act(g, { type: 'finishAftercare' });
  act(g, { type: 'ackShiftBreak' });
  act(g, { type: 'ackBriefing' });
  act(g, { type: 'finishTexting' });
  const dawn = serveAll(g);
  return { afternoon, dawn };
}

/** 하루를 진행하고 (새벽 04:44 문자는 답장하지 않고 넘긴다) 다음 날 아침으로 */
function nextMorning(g: Game): void {
  act(g, { type: 'closingText', reply: false });
  act(g, { type: 'finishAftercare' });
  act(g, { type: 'nextDay' });
}
const ids = (xs: string[]): string[] => xs.map((x) => x.split(':')[0] as string);

/** 본편 손님만 (확장 손님은 walkIn 슬롯으로 시드마다 바뀌어 끼어든다) */
const EXPANSION = new Set(['ma', 'do', 'hwangbo', 'jamie', 'song', 'lee', 'jung', 'mirror', 'sleeper', 'cats', 'borrowed', 'rain', 'nametag']);
const main = (id: string): boolean => !EXPANSION.has(id);

describe('2~5일차', () => {
  it('2일차: 오미란 → 한여름(재방문) → 윤재희, 새벽은 원통 → 배우 → 04:10 잊힌 단골', () => {
    const g = newGame(11);
    const d1 = playDay(g);
    expect(d1.afternoon.filter((x) => x.endsWith(':sold')).map((x) => x.split(':')[0])).toContain('hanyeoreum');
    nextMorning(g);
    expect(st(g).day).toBe(2);
    // 2일차 아침 쪽지에 새 수칙 7·8이 오른다 (11번은 3일차, 9·10번은 4일차)
    const notes = g.getState().log.slice(-40).filter((e) => e.type === 'line' && e.kind === 'note').map((e) => (e as { text: string }).text);
    expect(notes.some((t) => t.startsWith('7.'))).toBe(true);
    expect(notes.some((t) => t.startsWith('11.'))).toBe(false);
    const d2 = playDay(g);
    expect(ids(d2.afternoon).filter(main)).toEqual(['oh', 'hanyeoreum', 'yoon']);
    expect(ids(d2.afternoon).filter((id) => !main(id))).toHaveLength(1); // 지나가는 손님 한 명 (도민혁·마은재 중)
    expect(ids(d2.dawn)).toEqual(['cylinder', 'actor', 'baek']); // 04:10 잊힌 단골이 끼어든다
    expect(st(g).clues).toEqual(expect.arrayContaining(['friday', 'sketchbook']));
    expect(st(g).cards['hanyeoreum']?.visits).toBe(2);
  });

  it('2일차 04:44는 실루엣이 안쪽에서 보내는 문자', () => {
    const g = newGame(12);
    playDay(g);
    nextMorning(g);
    playDay(g);
    const ev = act(g, { type: 'closingText', reply: false });
    expect(ev.filter((e) => e.type === 'phone').map((e) => (e as { text: string }).text)).toEqual([txt('strings/closingText/d2/ignored/#0'), txt('strings/closingText/d2/ignored/#1'), txt('strings/closingText/d2/ignored/#2'), txt('strings/closingText/d2/ignored/#3')]);
  });

  it('3일차·4일차 일정과 단서', () => {
    const g = newGame(13);
    playDay(g);
    nextMorning(g);
    playDay(g);
    nextMorning(g);
    expect(st(g).day).toBe(3);
    const d3 = playDay(g);
    expect(ids(d3.afternoon).filter(main).slice(0, 2)).toEqual(['park', 'cha']);
    expect(ids(d3.dawn).filter(main)[0]).toBe('hound');
    expect(ids(d3.dawn).filter((id) => !main(id))).toHaveLength(1); // 거울·잠든 아이·고양이 노파 중 한 명
    expect(st(g).clues).toEqual(expect.arrayContaining(['guardLog', 'photo']));
    nextMorning(g);
    expect(st(g).day).toBe(4);
    const d4 = playDay(g);
    expect(ids(d4.afternoon)).toContain('seojin');
    expect(ids(d4.dawn).filter(main).slice(0, 2)).toEqual(['colour', 'door']);
    expect(st(g).flags['ally']).toBe(true); // 선택 대화의 두 번째 답
  });

  it('5일차: 재방문만, 그리고 서윤. 모든 조건이 갖춰지면 단골의 값', () => {
    const g = newGame(14);
    for (let i = 0; i < 4; i++) {
      playDay(g);
      nextMorning(g);
    }
    expect(st(g).day).toBe(5);
    // 새벽 재방문·VIP 조건을 만들어 둔다 (이 시나리오는 마시 씨·백설과 이미 정이 들었다고 가정)
    st(g).cards['marsh'] = registered('marsh', 'dawn', { visits: 2, purchases: [{ productId: 'breathing_pearl', day: 1 }], score: 9, tier: 'vip' });
    st(g).cards['baek'] = { ...(st(g).cards['baek'] as object), tier: 'vip', score: 8 } as never;
    const d5 = playDay(g);
    expect(d5.afternoon.length).toBeGreaterThan(0);
    expect(ids(d5.dawn)[0]).toBe('marsh');
    expect(st(g).flags).toMatchObject({ ally: true, lastWords: true, watch: true });
    expect(st(g).phase).toEqual({ kind: 'finale', allyTried: false });
    const acts = g.availableActions().map((a) => (a.type === 'finale' ? a.choice : a.type)).sort();
    expect(acts).toEqual(['ally', 'leave', 'yes']);
    const ev = act(g, { type: 'finale', choice: 'ally' });
    expect(ev.some((e) => e.type === 'ending' && e.ending === 'regulars')).toBe(true);
    expect(st(g).phase).toEqual({ kind: 'ending', ending: 'regulars' });
  });

  it('조건이 부족하면 서윤이 힌트를 주고 진열·퇴사만 남는다', () => {
    const g = newGame(15);
    st(g).day = 5;
    st(g).phase = { kind: 'finale', allyTried: false };
    st(g).flags = { ally: true };
    const ev = act(g, { type: 'finale', choice: 'ally' });
    expect(ev.some((e) => e.type === 'ending')).toBe(false);
    expect(ev.some((e) => e.type === 'line' && e.speaker === '서윤')).toBe(true);
    const acts = g.availableActions().map((a) => (a.type === 'finale' ? a.choice : a.type)).sort();
    expect(acts).toEqual(['leave', 'yes']);
    const end = act(g, { type: 'finale', choice: 'yes' });
    expect(end.some((e) => e.type === 'ending' && e.ending === 'twinDisplay')).toBe(true);
  });

  it('협력자가 아니면 문자 선택지가 없다', () => {
    const g = newGame(16);
    st(g).phase = { kind: 'finale', allyTried: false };
    const acts = g.availableActions().map((a) => (a.type === 'finale' ? a.choice : a.type)).sort();
    expect(acts).toEqual(['leave', 'yes']);
    st(g).violations = 1;
    st(g).cards['hanyeoreum'] = registered('hanyeoreum', 'afternoon');
    const end = act(g, { type: 'finale', choice: 'leave' });
    expect(end.some((e) => e.type === 'ending' && e.ending === 'resign')).toBe(true);
  });

  it('날짜별 일정이 5일 모두 정의돼 있고, 마지막 날만 finale', () => {
    for (let d = 1; d <= 5; d++) expect(data.days[d], `day ${d}`).toBeTruthy();
    expect(data.days[5]!.closing).toBe('finale');
    for (let d = 1; d <= 4; d++) expect(data.days[d]!.closing).toBeUndefined();
  });
});

describe('엔딩 분기', () => {
  const finaleGame = (seed: number) => {
    const g = newGame(seed);
    st(g).day = 3;
    st(g).composure = 100;
    st(g).phase = { kind: 'finale', allyTried: false };
    return g;
  };

  it('"…네": 기본은 진열, 매출이 높으면 실적 1위, 한서진에게 문자한 뒤에는 자매 진열', () => {
    const g = finaleGame(21);
    expect(yesEnding(ctxOf(g), false)).toBe('display');
    st(g).totalRevenue = TOP_SELLER_REVENUE;
    expect(yesEnding(ctxOf(g), false)).toBe('topSeller');
    expect(yesEnding(ctxOf(g), true)).toBe('twinDisplay');
  });

  it('"퇴근할게요": 기본 퇴사 → 빈 명부 → 정규직 전환 → 새벽 단골 순으로 우선', () => {
    const g = finaleGame(22);
    st(g).violations = 1; // 무사고가 아니다
    st(g).cards['hanyeoreum'] = registered('hanyeoreum', 'afternoon');
    expect(leaveEnding(ctxOf(g), false)).toBe('resign');
    st(g).cards = {};
    expect(leaveEnding(ctxOf(g), false)).toBe('emptyBook');
    st(g).violations = 0;
    st(g).totalViolations = 0;
    expect(leaveEnding(ctxOf(g), false)).toBe('tenure');
    st(g).composure = 60;
    expect(leaveEnding(ctxOf(g), false)).toBe('emptyBook');
    st(g).cards['baek'] = registered('baek', 'dawn', { tier: 'vip', score: 7 });
    st(g).cards['marsh'] = registered('marsh', 'dawn', { tier: 'vip', score: 9 });
    expect(dawnBond(ctxOf(g))).toBe('marsh');
    expect(leaveEnding(ctxOf(g), false)).toBe('marsh');
    st(g).cards['marsh'] = registered('marsh', 'dawn', { tier: 'vip', score: 5 });
    expect(leaveEnding(ctxOf(g), false)).toBe('baek');
    expect(leaveEnding(ctxOf(g), true)).toBe('sisterDoor');
  });

  it('모든 엔딩에 제목·마무리·장면이 있다', () => {
    const ids = ['display', 'resign', 'regulars', 'sisterDoor', 'twinDisplay', 'topSeller', 'tenure', 'emptyBook', 'marsh', 'baek', 'faceless'];
    const ending = (data.strings as { ending: Record<string, { title: string; final: string; scene: string[] }> }).ending;
    for (const id of ids) {
      expect(ending[id]?.title, id).toBeTruthy();
      expect(ending[id]?.final, id).toBeTruthy();
      expect(ending[id]?.scene.length, id).toBeGreaterThan(3);
    }
  });

  it('게임 안에서 끝까지 가면 선택한 엔딩 이벤트가 나온다', () => {
    const g = finaleGame(23);
    st(g).cards['faceless'] = registered('faceless', 'dawn', { tier: 'vip', score: 6 });
    const ev = act(g, { type: 'finale', choice: 'leave' });
    expect(ev.some((e) => e.type === 'ending' && e.ending === 'faceless')).toBe(true);
    expect(st(g).phase).toEqual({ kind: 'ending', ending: 'faceless' });
  });
});
