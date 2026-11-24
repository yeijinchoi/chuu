import { rolloverCards } from './care';
import { changeComposure, dayDef, narrate, setClock, setPhase, str, strAt, strList, thought, type Ctx } from './ctx';
import { startEncounter, SCORE } from './encounter';
import { moodFor } from './mood';
import { deriveRng, pickOne } from './rng';
import { checkClosingReply, ruleText } from './rules';
import { beginFinale, FINAL_DAY } from './plot';
import { computeResults } from './results';
import { buildSave } from './save';
import type { ResolvedSlot, ScheduleSlot, Shift, StorageAdapter } from './types';

/** 하루 단계 상태 머신: title → briefing → texting → encounters → aftercare → shiftBreak → … → results */

function timeOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 문자 결과를 반영해 그 교대의 슬롯을 편성한다 */
export function buildSlots(ctx: Ctx, shift: Shift): ResolvedSlot[] {
  const s = ctx.state;
  const day = dayDef(ctx);
  const pending = new Set(s.pendingUninvited);
  const slots: ResolvedSlot[] = [];
  const present = new Set<string>();
  for (const sl0 of day.schedule.filter((x: ScheduleSlot) => x.shift === shift)) {
    let sl = sl0;
    if (sl.condition === 'returning') {
      const pick = pickReturning(ctx, sl, present);
      if (pick === null) continue;
      sl = { ...sl, customerId: pick, condition: 'always' };
    }
    if (sl.condition === 'walkIn') {
      // 지나가는 손님: 이 교대에 없고, 아직 한 번도 안 온 후보 중 하나 (같은 시드면 늘 같은 손님)
      const pool = (sl.candidates ?? [sl.customerId]).filter((id) => !present.has(id) && !(s.cards[id]?.visits));
      const pick = pickOne(deriveRng(s.seed, s.day, shift, 'walkIn', sl.time), pool);
      if (pick === undefined) continue;
      sl = { ...sl, customerId: pick, condition: 'always' };
    }
    if (present.has(sl.customerId)) continue; // 같은 손님이 한 교대에 두 번 오지 않는다
    if (sl.condition !== 'always' && restingUntilFinal(ctx, sl.customerId)) continue;
    const v = s.visitors[sl.customerId];
    const forgotten = !v && pending.has(sl.customerId);
    if (sl.condition === 'always') {
      slots.push({ shift, time: sl.time, customerId: sl.customerId, uninvited: forgotten, forgotten });
    } else if (sl.condition === 'invited') {
      if (v) slots.push({ shift, time: sl.time, customerId: sl.customerId, uninvited: false, forgotten: false });
      else if (forgotten) slots.push({ shift, time: day.clocks.uninvited, customerId: sl.customerId, uninvited: true, forgotten: true });
    } else {
      // invitedElse: 초대받았으면 time, 아니면 altTime (초대 없이 온다)
      if (v) slots.push({ shift, time: sl.time, customerId: sl.customerId, uninvited: false, forgotten: false });
      else slots.push({ shift, time: sl.altTime ?? sl.time, customerId: sl.customerId, uninvited: true, forgotten });
    }
    present.add(sl.customerId);
  }
  // 오늘 일정에 없는 잊힌 단골
  if (shift === 'dawn') {
    for (const id of pending) {
      if (!present.has(id) && ctx.customers[id]?.shift === 'dawn' && !restingUntilFinal(ctx, id)) {
        slots.push({ shift, time: day.clocks.uninvited, customerId: id, uninvited: true, forgotten: true });
      }
    }
    s.pendingUninvited = [];
  }
  slots.sort((a, b) => timeOrder(a.time, b.time));
  // 문 밖의 손님 등: 다음 등장이 N슬롯 빨라진다 (시각은 자리에 남고 손님만 앞으로 간다)
  if (shift === 'dawn') {
    const times = slots.map((x) => x.time);
    for (const [id, n] of Object.entries(s.earlierSlots)) {
      const i = slots.findIndex((x) => x.customerId === id);
      if (i < 0 || n <= 0) continue;
      const [moved] = slots.splice(i, 1);
      if (moved) slots.splice(Math.max(0, i - n), 0, moved);
    }
    slots.forEach((x, i) => { x.time = times[i] ?? x.time; });
    s.earlierSlots = {};
  }
  return slots;
}

/** 재방문 슬롯: 한 번이라도 판매한 후보 중 오늘 초대한 손님 → 관계 점수가 가장 높은 손님 (동점이면 앞 순서). 없으면 슬롯을 비운다. */
/**
 * 한 손님은 첫 방문 · 중간에 한 번 · 마지막 날에만 온다. 중간에 이미 다시 온 손님(2회 방문)은 마지막 날 전에는 오지 않는다.
 * 그래야 "마지막 방문" 대사가 마지막 날에만 나오고, 같은 재방문 대사가 날마다 되풀이되지 않는다.
 */
export function restingUntilFinal(ctx: Ctx, customerId: string): boolean {
  return ctx.state.day < FINAL_DAY && (ctx.state.cards[customerId]?.visits ?? 0) >= 2;
}

function pickReturning(ctx: Ctx, sl: ScheduleSlot, taken: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const id of sl.candidates ?? [sl.customerId]) {
    const card = ctx.state.cards[id];
    if (taken.has(id) || !card || card.purchases.length === 0 || card.tier === 'lost' || restingUntilFinal(ctx, id)) continue;
    // 문자로 초대해 "갈게요"라고 답한 손님이 먼저 온다 (초대에 응하고 안 오는 일이 없게)
    const score = card.score + (ctx.state.visitors[id] ? 1000 : 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

function enterShift(ctx: Ctx, shift: Shift): void {
  ctx.state.shift = shift;
  ctx.emit({ type: 'shift', shift });
  ctx.emit({ type: 'mood', mood: moodFor(ctx.state.composure, shift) });
}

export function beginBriefing(ctx: Ctx, shift: Shift): void {
  const d = dayDef(ctx);
  enterShift(ctx, shift);
  setPhase(ctx, { kind: 'briefing', shift });
  setClock(ctx, shift === 'afternoon' ? d.clocks.afternoonBriefing : d.clocks.dawnBriefing);
  const who = str(ctx.data, 'briefing.speaker');
  // 쪽지 본문은 kind 'note'로 보낸다. UI는 이 줄들을 모아 RulesNote로 펼친다.
  const say = (text: string): void => ctx.emit({ type: 'line', speaker: who, text, kind: 'note' });
  const first = ctx.state.day === 1;
  if (shift === 'afternoon' && !first) {
    // 2일차 이후: 쪽지 대신 점장의 알림 한 통과 새로 추가된 수칙
    const day = ctx.state.day;
    for (const l of strList(ctx.data, `briefing.day${day}.head`)) say(l.replace('{name}', ctx.state.playerName));
    say(str(ctx.data, `briefing.day${day}.title`));
    for (const r of ctx.data.rules.filter((x) => x.day === day || x.reveal?.day === day)) say(`${r.id}. ${ruleText(r, day)}`);
    say(str(ctx.data, 'briefing.dawn.outro'));
    for (const l of strList(ctx.data, `briefing.day${day}.thoughts`)) thought(ctx, l);
  } else if (shift === 'afternoon') {
    if (first) {
      for (const l of strList(ctx.data, 'briefing.afternoon.intro')) narrate(ctx, l);
      thought(ctx, str(ctx.data, 'thoughts.afternoonOpen'));
      const name = ctx.state.playerName;
      for (const l of strList(ctx.data, 'briefing.afternoon.head')) say(l.replace('{name}', name));
    }
    say(str(ctx.data, 'briefing.afternoon.title'));
    for (const l of strList(ctx.data, 'briefing.afternoon.lines')) say(l);
    if (first) thought(ctx, str(ctx.data, 'thoughts.afterNote'));
  } else {
    // 첫 새벽에만 새벽 교대를 처음 알리는 말을 한다
    say(ctx.state.day === 1 ? str(ctx.data, 'briefing.dawn.intro') : strAt(ctx.data, 'briefing.dawn.introAgain', ctx.state.day - 2));
    say(str(ctx.data, 'briefing.dawn.title'));
    for (const r of ctx.data.rules.filter((x) => x.day <= ctx.state.day)) say(`${r.id}. ${ruleText(r, ctx.state.day)}`);
    say(str(ctx.data, 'briefing.dawn.outro'));
    if (ctx.state.day === 1) thought(ctx, str(ctx.data, 'thoughts.dawnNote'));
  }
}

export function beginTexting(ctx: Ctx, shift: Shift): void {
  const d = dayDef(ctx);
  setPhase(ctx, { kind: 'texting', shift });
  setClock(ctx, shift === 'afternoon' ? d.clocks.afternoonTexting : d.clocks.dawnTexting);
  if (shift === 'afternoon') {
    if (ctx.state.day === 1) {
      narrate(ctx, str(ctx.data, 'briefing.afternoon.phoneHome'));
      thought(ctx, str(ctx.data, 'thoughts.blackIcon'));
    }
  } else {
    // 진열장 덮개를 벗기는 컷(선반 → 마네킹 → 유리 카운터) 뒤에 검은 수첩이 열린다
    for (let i = 0; i < 3; i++) ctx.emit({ type: 'sfx', id: 'cloth_pull' });
    if (ctx.state.day === 1) {
      narrate(ctx, str(ctx.data, 'briefing.dawn.cover'));
      narrate(ctx, str(ctx.data, 'briefing.dawn.notebook'));
    } else {
      narrate(ctx, strAt(ctx.data, 'briefing.dawn.coverAgain', ctx.state.day - 2));
    }
  }
}

/** 문자 단계를 마치고 첫 손님 응대로 */
export function finishTexting(ctx: Ctx, shift: Shift): void {
  ctx.state.slots = buildSlots(ctx, shift);
  if (shift === 'afternoon') {
    ctx.emit({ type: 'sfx', id: 'sign_flip' }); // 문 위 팻말이 OPEN으로
    const coming = Object.keys(ctx.state.visitors).length;
    if (ctx.state.day === 1) {
      if (coming >= 2) thought(ctx, str(ctx.data, 'thoughts.visitorsMany'));
      else if (coming === 0) thought(ctx, str(ctx.data, 'thoughts.visitorsNone'));
    }
  }
  advanceToSlot(ctx, 0, shift);
}

function advanceToSlot(ctx: Ctx, index: number, shift: Shift): void {
  if (index < ctx.state.slots.length) {
    startEncounter(ctx, index);
    return;
  }
  if (shift === 'afternoon') beginAftercare(ctx, 'afternoon');
  else if (dayDef(ctx).closing === 'finale') beginFinale(ctx);
  else beginClosingText(ctx);
}

/** 응대가 끝난 뒤 다음 손님 / 다음 단계로 */
export function advanceFromEncounter(ctx: Ctx): boolean {
  const p = ctx.state.phase;
  if (p.kind !== 'encounter' || p.enc.step !== 'done') return false;
  advanceToSlot(ctx, p.slotIndex + 1, p.enc.shift);
  return true;
}

export function beginAftercare(ctx: Ctx, shift: Shift): void {
  const d = dayDef(ctx);
  ctx.state.aftercareRemaining = d.aftercare.perShift;
  setPhase(ctx, { kind: 'aftercare', shift });
  setClock(ctx, shift === 'afternoon' ? d.clocks.afternoonAftercare : d.clocks.dawnAftercare);
  if (shift === 'afternoon') ctx.emit({ type: 'sfx', id: 'sign_flip' }); // CLOSED
}

export function finishAftercare(ctx: Ctx, storage?: StorageAdapter): boolean {
  const p = ctx.state.phase;
  if (p.kind !== 'aftercare') return false;
  const s = ctx.state;
  if (p.shift === 'afternoon') {
    setPhase(ctx, { kind: 'shiftBreak' });
    ctx.emit({ type: 'sfx', id: 'lights_off' });
    narrate(ctx, strAt(ctx.data, 'shiftBreak.narration', s.day - 1));
    thought(ctx, strAt(ctx.data, 'thoughts.shiftBreak', s.day - 1));
    return true;
  }
  // 고맙다는 말에는 꼭 답할 것: 방문한 날 감사 문자를 안 보내면 다음 새벽에 초대 없이 찾아온다
  for (const c of ctx.data.customers) {
    const card = s.cards[c.id];
    if (c.care.mustThank && card && card.lastVisitDay === s.day && card.lastThanksDay !== s.day && card.tier !== 'lost') {
      if (!s.pendingUninvited.includes(c.id)) s.pendingUninvited.push(c.id);
    }
  }
  s.results = computeResults(ctx);
  setPhase(ctx, { kind: 'results' });
  if (storage) ctx.emit({ type: 'save', ok: storage.save(buildSave(s)) });
  return true;
}

export function ackShiftBreak(ctx: Ctx): boolean {
  if (ctx.state.phase.kind !== 'shiftBreak') return false;
  beginBriefing(ctx, 'dawn');
  return true;
}

// ------------------------------------------------------------------ 04:44

/** 04:44 문자는 날마다 조금씩 달라진다: closingText.d<day>가 있으면 그것을, 없으면 1일차 문구를 쓴다 */
function closingList(ctx: Ctx, key: 'incoming' | 'replied' | 'ignored'): string[] {
  const day = strList(ctx.data, `closingText.d${ctx.state.day}.${key}`);
  return day.length > 0 ? day : strList(ctx.data, `closingText.${key}`);
}

export function beginClosingText(ctx: Ctx): void {
  setPhase(ctx, { kind: 'closingText' });
  setClock(ctx, dayDef(ctx).clocks.closingText);
  const from = str(ctx.data, 'closingText.from');
  for (const text of closingList(ctx, 'incoming')) ctx.emit({ type: 'phone', from, text });
  ctx.emit({ type: 'sfx', id: 'phone_buzz' });
  ctx.emit({ type: 'sfx', id: 'phone_buzz' });
  if (ctx.state.day >= 2) thought(ctx, str(ctx.data, `closingText.d${ctx.state.day}.thought`));
  else {
    thought(ctx, str(ctx.data, 'thoughts.closingWho'));
    thought(ctx, str(ctx.data, 'thoughts.closingRule3'));
  }
}

export function doClosingText(ctx: Ctx, reply: boolean): boolean {
  if (ctx.state.phase.kind !== 'closingText') return false;
  const s = ctx.state;
  const from = str(ctx.data, 'closingText.from');
  s.closingReplied = reply;
  const rule = checkClosingReply(reply, ctx.data.rules);
  if (rule !== null) {
    // 블랙아웃이 먼저, 그 뒤에 실루엣의 답장이 온다 (SCRIPT S12)
    s.violations++;
    ctx.emit({ type: 'violation', rule, severe: true });
    ctx.emit({ type: 'horror', customerId: null, kind: 'blackout' });
    ctx.emit({ type: 'sfx', id: 'blackout' });
    ctx.emit({ type: 'sfx', id: 'glass_tap' });
    for (const text of closingList(ctx, 'replied')) ctx.emit({ type: 'phone', from, text });
    changeComposure(ctx, SCORE.closingReplyComposure);
    if (s.phase.kind === 'badEnding') return true;
  } else {
    for (const text of closingList(ctx, 'ignored')) ctx.emit({ type: 'phone', from, text });
    if (ctx.state.day === 1) thought(ctx, str(ctx.data, 'thoughts.closingIgnored'));
  }
  beginAftercare(ctx, 'dawn');
  return true;
}

// ------------------------------------------------------------------ 다음 날

/** 하루가 바뀐다: 방치 감점·잊힌 단골 예약, 하루 단위 값 초기화 */
export function rollToNextDay(ctx: Ctx): void {
  const s = ctx.state;
  const roll = rolloverCards(s.cards, s.day, ctx.customers);
  for (const d of roll.decayed) {
    ctx.emit({ type: 'relationship', customerId: d.customerId, delta: d.delta, score: d.score, tier: d.tier });
  }
  for (const id of roll.uninvited) if (!s.pendingUninvited.includes(id)) s.pendingUninvited.push(id);
  s.day++;
  s.totalViolations += s.violations;
  const d = dayDef(ctx);
  s.revenue = 0;
  s.dawnLedger = [];
  s.salesCount = 0;
  s.mannerSlips = 0;
  s.violations = 0;
  s.thanksSent = 0;
  s.newRegulars = [];
  s.visitors = {};
  s.slots = [];
  s.pendingReplies = {};
  s.closingReplied = null;
  s.results = null;
  s.composure = d.startComposure;
  s.aftercareRemaining = 0;
  s.texting = initTexting(ctx);
  beginBriefing(ctx, 'afternoon');
}

export function initTexting(ctx: Ctx): Ctx['state']['texting'] {
  const d = dayDef(ctx);
  return {
    afternoon: { sent: {}, remaining: d.texting.afternoon.total, salesSent: 0 },
    dawn: { sent: {}, remaining: d.texting.dawn.total, salesSent: 0 },
  };
}

