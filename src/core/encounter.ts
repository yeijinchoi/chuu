import { applyScoreDelta, fillCardFromProbe, newCard, registerRegular, isRegistered } from './care';
import { changeComposure, clamp, setClock, setPhase, str, type Ctx } from './ctx';
import {
  classifyProposal, emitReaction, react, reactClose, reactGreet, reactPropose, reactThought,
} from './reactions';
import { checkChoice, checkRequire, type CheckResult } from './rules';
import { effectiveVisit, grantClue, returnsFor, runBeats, sayLine, setFlag } from './plot';
import { deriveRng, shuffle, pickOne, type Rng } from './rng';
import type {
  CloseId, ClientCard, CustomerDef, CustomerLines, CustomerReturnLines, EncounterState, GreetStyle, ProbeId, Product, RuleId,
} from './types';

/** 점수 상수 (GDD §5). 호감은 0~100으로 자른다. */
export const SCORE = {
  baseAffinity: 40,
  textBonus: 15, // 선호 템플릿으로 문자를 받고 왔을 때
  vipBonus: 25, // VIP 이상 단골의 시작 호감 보너스
  vipBudgetMultiplier: 1.2,
  uninvitedAffinity: 30, // 잊힌 단골의 시작 호감
  uninvitedComposure: -10,
  greetMatch: 15,
  greetMismatch: -10,
  serveMatch: 10,
  serveMismatch: -5,
  serveNone: -5,
  serveMismatchComposure: -5, // 새벽: 대접이 틀리면 호감 대신 평정심
  serveTabooComposure: -10, // 문 밖의 손님: 무엇이든 내밀면
  serveRelationship: 1,
  probe: 3,
  mannerSlip: -10,
  deptMatch: 20,
  colorMatch: 10,
  withinBudget: 10,
  overBudget: -15,
  anything: 10,
  tryOn: 10,
  giftBox: 5,
  sold: 60,
  regularOffer: 85,
  violationComposure: -25,
  closingReplyComposure: -30,
  wrongProduct: -15, // 다른 카테고리 상품을 권했다 → 거절
  wrongColor: -10, // 카테고리는 맞지만 원하는 색이 아니다 → 거절
  maxProbes: 2,
  maxRerolls: 3, // 제안 카드를 다시 뽑을 수 있는 횟수
} as const;

export const EMPTY_BOX = 'empty_box';
const PROBE_FIELDS: ProbeId[] = ['askCategory', 'askOccasion', 'askBudget', 'observe'];

/**
 * 제안 카드: ① 카테고리·색 일치 ② 카테고리만 일치 ③ 다른 카테고리. 후보가 여럿이면 시드 RNG로 고르고 순서도 섞는다.
 * 손님과 같은 교대의 상품만 쓴다. "아무거나" 손님은 무작위 3장. onlyProduct 손님은 +1장(총 4장).
 */
export function pickOffers(customer: CustomerDef, products: readonly Product[], rng: Rng): string[] {
  const pool = products.filter((p) => p.shift === customer.shift && p.id !== EMPTY_BOX);
  const chosen: Product[] = [];
  const add = (p: Product | undefined): void => {
    if (p && !chosen.includes(p)) chosen.push(p);
  };
  if (customer.traits.wantsAnything || customer.category === 'any') {
    for (const p of shuffle(rng, pool).slice(0, 3)) add(p);
  } else {
    const sameCat = pool.filter((p) => p.category === customer.category);
    // 원하는 상품: 색이 맞고(색 제한이 없으면 카테고리만) 예산 안에 드는 것. 그런 상품이 없으면 예산을 무시한다.
    const colorOk = sameCat.filter((p) => customer.color === null || p.color === customer.color);
    const affordable = colorOk.filter((p) => customer.budget === null || p.price <= customer.budget);
    const exact = affordable.length > 0 ? affordable : colorOk.filter(() => customer.color !== null);
    const partial = sameCat.filter((p) => !exact.includes(p));
    const other = pool.filter((p) => p.category !== customer.category);
    add(pickOne(rng, exact.length > 0 ? exact : partial));
    add(pickOne(rng, partial.filter((p) => !chosen.includes(p))));
    add(pickOne(rng, other));
    for (const p of shuffle(rng, pool)) {
      if (chosen.length >= 3) break;
      add(p);
    }
  }
  if (customer.onlyProduct) {
    const only = products.find((p) => p.id === customer.onlyProduct);
    if (only) chosen.push(only);
  }
  return shuffle(rng, chosen).map((p) => p.id);
}

export function effectiveBudget(customer: CustomerDef, card: ClientCard | undefined): number | null {
  if (customer.budget === null) return null;
  const vip = card !== undefined && (card.tier === 'vip' || card.tier === 'lifetime');
  return vip ? Math.round(customer.budget * SCORE.vipBudgetMultiplier) : customer.budget;
}

/** 제안 단계 호감 변화 */
export function proposeDelta(customer: CustomerDef, product: Product, card: ClientCard | undefined): number {
  if (customer.traits.wantsAnything || customer.category === 'any') return SCORE.anything;
  let d = 0;
  if (product.category === customer.category) d += SCORE.deptMatch;
  if (customer.color !== null && product.color === customer.color) d += SCORE.colorMatch;
  const budget = effectiveBudget(customer, card);
  d += budget === null || product.price <= budget ? SCORE.withinBudget : SCORE.overBudget;
  return d;
}

export function closeDelta(customer: CustomerDef, choice: CloseId): number {
  if (choice === 'tryOn') return SCORE.tryOn;
  if (choice === 'boxGold' && customer.occasionIsGift) return SCORE.giftBox;
  return 0;
}

// ---------------------------------------------------------------- 상태 머신

function enc(ctx: Ctx): EncounterState | null {
  const p = ctx.state.phase;
  return p.kind === 'encounter' ? p.enc : null;
}

function addAffinity(ctx: Ctx, e: EncounterState, delta: number): void {
  const before = e.affinity;
  e.affinity = clamp(before + delta, 0, 100);
  ctx.emit({ type: 'affinity', delta: e.affinity - before, value: e.affinity });
}

function say(ctx: Ctx, c: CustomerDef, text: string | undefined): void {
  if (text) ctx.emit({ type: 'line', speaker: c.name, text });
}
function narrate(ctx: Ctx, text: string | undefined): void {
  if (text) ctx.emit({ type: 'line', speaker: null, text });
}

type LineKey = keyof Omit<CustomerLines, 'violation'>;

/** 재방문이면 returns의 대사를, 없으면 첫 방문 대사를 돌려준다 (3회째 → 2회째 → 첫 방문 순). */
export function pickLine(ctx: Ctx, c: CustomerDef, key: LineKey | 'openingRegular'): string | undefined {
  const visits = effectiveVisit(ctx, c.id);
  const chain: (CustomerReturnLines | undefined)[] = [];
  if (visits >= 3) chain.push(c.returns?.['3']);
  if (visits >= 2) chain.push(c.returns?.['2']);
  for (const r of chain) {
    const v = r?.[key];
    if (v) return v;
  }
  if (key === 'openingRegular') return undefined;
  if (key === 'farewell' && visits >= 2) return undefined; // 첫 방문의 작별 복선은 되풀이하지 않는다
  return c.lines[key];
}

export function ensureCard(ctx: Ctx, c: CustomerDef): ClientCard {
  let card = ctx.state.cards[c.id];
  if (!card) {
    card = newCard(c.id, c.shift);
    ctx.state.cards[c.id] = card;
  }
  return card;
}

/** 슬롯의 손님을 응대 시작 */
export function startEncounter(ctx: Ctx, slotIndex: number): void {
  const s = ctx.state;
  const slot = s.slots[slotIndex];
  const c = slot ? ctx.customers[slot.customerId] : undefined;
  if (!slot || !c) return;
  const card = ensureCard(ctx, c);
  const vip = card.tier === 'vip' || card.tier === 'lifetime';
  const textBonus = s.visitors[c.id]?.bonus ?? 0;
  const start = slot.forgotten
    ? SCORE.uninvitedAffinity
    : SCORE.baseAffinity + Math.max(textBonus, vip ? SCORE.vipBonus : 0);
  const e: EncounterState = {
    customerId: c.id, shift: slot.shift, step: 'greet', affinity: clamp(start, 0, 100),
    probesUsed: [], offered: [], rejected: [], rerolls: 0, chosenProductId: null, violated: [], mannerSlips: 0,
    outcome: 'pending', uninvited: slot.uninvited, forgotten: slot.forgotten,
  };
  card.lastVisitDay = s.day;
  card.visits = (card.visits ?? 0) + 1;
  card.lastContactDay = s.day;
  setClock(ctx, slot.time);
  setPhase(ctx, { kind: 'encounter', slotIndex, enc: e });
  ctx.emit({ type: 'customerEnter', customerId: c.id });
  ctx.emit({ type: 'affinity', delta: 0, value: e.affinity });
  const ret = returnsFor(ctx, c);
  if (ret) {
    // 재방문: 처음 보는 사람처럼 묘사하지 않는다
    if (slot.shift === 'dawn') narrate(ctx, ret.entrance ?? str(ctx.data, 'text.returnEnterDawn'));
    else emitReaction(ctx, c, ret.enter ?? str(ctx.data, 'text.returnEnter'));
  } else {
    if (slot.shift === 'dawn') narrate(ctx, c.entranceNote);
    emitReaction(ctx, c, c.reactions?.enter);
  }
  const registered = isRegistered(card);
  say(ctx, c, slot.uninvited
    ? (pickLine(ctx, c, 'openingUninvited') ?? pickLine(ctx, c, 'opening'))
    : (registered ? pickLine(ctx, c, 'openingRegular') : undefined) ?? pickLine(ctx, c, 'opening'));
  if (vip && !card.vipSaid) {
    say(ctx, c, c.care.vipReveal); // VIP 보상 대사는 한 번만
    card.vipSaid = true;
  }
  reactThought(ctx, c, 'opening');
  runBeats(ctx, c, c.onVisit);
  if (slot.forgotten) {
    narrate(ctx, str(ctx.data, 'text.uninvitedNote'));
    changeComposure(ctx, SCORE.uninvitedComposure);
  }
}

/** VIP 이상(또는 VVIP)이고 대접 취향이 있는 손님에게만 대접 단계가 있다 */
export function hasServeStep(c: CustomerDef, card: ClientCard | undefined): boolean {
  const vip = card !== undefined && (card.tier === 'vip' || card.tier === 'lifetime');
  return (vip || c.vvip === true) && c.hospitality !== undefined && c.hospitality.pref !== 'none';
}

export function doGreet(ctx: Ctx, style: GreetStyle): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'greet') return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const chk = checkChoice(c, 'greet', style, ctx.data.rules, e.shift);
  if (chk?.kind === 'rule') return violate(ctx, e, chk.rule);
  addAffinity(ctx, e, style === c.greetPref ? SCORE.greetMatch : SCORE.greetMismatch);
  reactGreet(ctx, c, style);
  e.step = hasServeStep(c, ctx.state.cards[c.id]) ? 'serve' : 'probe';
  return true;
}

/** 대접 취향과 맞는지. any는 둘 다, taboo는 아무것도 내지 않는 것만 맞다. */
export function serveMatches(pref: NonNullable<CustomerDef['hospitality']>['pref'], drink: 'water' | 'chocolate' | 'none'): boolean {
  if (pref === 'any') return drink !== 'none';
  if (pref === 'taboo') return drink === 'none';
  return drink === pref;
}

export function doServe(ctx: Ctx, drink: 'water' | 'chocolate' | 'none'): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'serve') return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const h = c.hospitality;
  if (!h) return false;
  const card = ensureCard(ctx, c);
  const match = serveMatches(h.pref, drink);
  if (drink !== 'none') {
    card.drink = h.pref;
    ctx.emit({ type: 'cardUpdate', customerId: c.id, field: 'drink' });
  }
  if (match) {
    addAffinity(ctx, e, SCORE.serveMatch);
    emitReaction(ctx, c, h.match);
    if (e.shift === 'afternoon' && drink !== 'none') {
      const r = applyScoreDelta(card, SCORE.serveRelationship);
      ctx.emit({ type: 'relationship', customerId: c.id, ...r });
    }
  } else if (drink === 'none') {
    addAffinity(ctx, e, SCORE.serveNone);
    emitReaction(ctx, c, h.none);
  } else if (h.pref === 'taboo') {
    changeComposure(ctx, SCORE.serveTabooComposure);
    emitReaction(ctx, c, h.mismatch);
  } else if (e.shift === 'dawn') {
    changeComposure(ctx, SCORE.serveMismatchComposure);
    emitReaction(ctx, c, h.mismatch);
  } else {
    addAffinity(ctx, e, SCORE.serveMismatch);
    emitReaction(ctx, c, h.mismatch);
  }
  e.step = 'probe';
  return true;
}

export function doProbe(ctx: Ctx, probe: ProbeId): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'probe' || !PROBE_FIELDS.includes(probe)) return false;
  if (e.probesUsed.includes(probe) || e.probesUsed.length >= SCORE.maxProbes) return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const card = ensureCard(ctx, c);
  const chk: CheckResult = checkChoice(c, 'probe', probe, ctx.data.rules, e.shift);
  e.probesUsed.push(probe);
  const answer = pickLine(ctx, c, probe);

  if (chk?.kind === 'rule') {
    // 답변을 먼저 보여 주고 이어서 위반 이벤트
    say(ctx, c, answer);
    return violate(ctx, e, chk.rule);
  }
  if (chk?.kind === 'manner') {
    const refusal = c.lines.violation['manner'];
    say(ctx, c, refusal ?? answer);
    if (!refusal) fillCard(ctx, card, c, probe, true);
    e.mannerSlips++;
    ctx.state.mannerSlips++;
    ctx.emit({ type: 'mannerSlip', text: str(ctx.data, 'manner.note') });
    emitReaction(ctx, c, c.reactions?.manner);
    addAffinity(ctx, e, SCORE.mannerSlip);
  } else {
    say(ctx, c, answer);
    fillCard(ctx, card, c, probe, true);
    if (probe === 'observe') reactThought(ctx, c, 'observe');
    else addAffinity(ctx, e, SCORE.probe);
  }
  if (e.probesUsed.length >= SCORE.maxProbes) {
    const miss = checkRequire(c, 'probe', e.probesUsed, ctx.data.rules, e.shift);
    if (miss !== null) return violate(ctx, e, miss);
    e.step = 'propose';
    const rng = deriveRng(ctx.state.seed, ctx.state.day, c.id, 'offers');
    e.offered = pickOffers(c, ctx.data.products, rng);
  }
  return true;
}

function fillCard(ctx: Ctx, card: ClientCard, c: CustomerDef, probe: ProbeId, budgetKnown: boolean): void {
  for (const field of fillCardFromProbe(card, c, probe, { budgetKnown })) {
    ctx.emit({ type: 'cardUpdate', customerId: c.id, field });
  }
}

export function doPropose(ctx: Ctx, productId: string): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'propose' || !e.offered.includes(productId)) return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const product = ctx.products[productId] as Product;
  const miss = checkRequire(c, 'propose', [productId], ctx.data.rules, e.shift);
  if (miss !== null) { e.chosenProductId = productId; return violate(ctx, e, miss); }
  // 손님이 원하는 상품(카테고리·색·예산이 모두 맞음)이 아니면 호감이 깎이고 그 상품은 거절된다. 다른 상품을 권할 수 있다.
  const kind = classifyProposal(ctx, c, product);
  if (kind !== 'perfect') return rejectProduct(ctx, e, c, product, kind);
  e.chosenProductId = productId;
  addAffinity(ctx, e, proposeDelta(c, product, ctx.state.cards[c.id]));
  reactPropose(ctx, c, product);
  e.step = 'close';
  return true;
}

function rejectProduct(ctx: Ctx, e: EncounterState, c: CustomerDef, product: Product, kind: 'deptOnly' | 'wrong' | 'overBudget'): boolean {
  const delta = kind === 'deptOnly' ? SCORE.wrongColor : kind === 'overBudget' ? SCORE.overBudget : SCORE.wrongProduct;
  addAffinity(ctx, e, delta);
  reactPropose(ctx, c, product);
  e.rejected.push(product.id);
  e.offered = e.offered.filter((id) => id !== product.id);
  const noneLeft = e.offered.length === 0 && e.rerolls >= SCORE.maxRerolls;
  if (e.affinity <= 0 || noneLeft) {
    // 호감이 바닥났거나 더 보여 줄 상품이 없다: 손님이 돌아선다
    e.outcome = 'walked';
    say(ctx, c, pickLine(ctx, c, 'fail'));
    narrate(ctx, c.lines.failNote);
    finish(ctx, e);
  }
  return true;
}

/** 제안 카드 다시 뽑기: 거절된 상품을 뺀 진열 상품에서 무작위 3장 (이번에 보여 준 것은 되도록 피한다) */
export function canReroll(e: EncounterState): boolean {
  return e.step === 'propose' && e.rerolls < SCORE.maxRerolls;
}

export function doReroll(ctx: Ctx): boolean {
  const e = enc(ctx);
  if (!e || !canReroll(e)) return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const pool = ctx.data.products.filter((p) => p.shift === c.shift && p.id !== EMPTY_BOX && !e.rejected.includes(p.id));
  const rng = deriveRng(ctx.state.seed, ctx.state.day, c.id, 'reroll', e.rerolls);
  const fresh = shuffle(rng, pool.filter((p) => !e.offered.includes(p.id)));
  const rest = shuffle(rng, pool.filter((p) => e.offered.includes(p.id)));
  const next = [...fresh, ...rest].slice(0, 3).map((p) => p.id);
  if (c.onlyProduct && !e.rejected.includes(c.onlyProduct) && !next.includes(c.onlyProduct)) next.push(c.onlyProduct);
  e.rerolls++;
  e.offered = shuffle(rng, next);
  narrate(ctx, str(ctx.data, 'text.rerolled'));
  ctx.emit({ type: 'sfx', id: 'cloth_pull' });
  return true;
}

export function doClose(ctx: Ctx, choice: CloseId): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'close') return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const chk = checkChoice(c, 'close', choice, ctx.data.rules, e.shift);
  if (chk?.kind === 'rule') return violate(ctx, e, chk.rule);
  const miss = checkRequire(c, 'close', [choice], ctx.data.rules, e.shift);
  if (miss !== null) return violate(ctx, e, miss);
  addAffinity(ctx, e, closeDelta(c, choice));
  reactClose(ctx, c, choice);

  if (e.affinity < SCORE.sold) {
    e.outcome = 'walked';
    say(ctx, c, pickLine(ctx, c, 'fail'));
    narrate(ctx, c.lines.failNote);
    finish(ctx, e);
    return true;
  }
  recordSale(ctx, e, c);
  runBeats(ctx, c, c.afterSale);
  if (hasTalk(ctx, c)) {
    e.step = 'talk';
    for (const l of (c.talk as NonNullable<CustomerDef['talk']>).prompt) sayLine(ctx, c, l);
    return true;
  }
  afterSold(ctx, e, c);
  return true;
}

/** 판매 뒤 마무리: 단골 제안 또는 퇴장 */
function afterSold(ctx: Ctx, e: EncounterState, c: CustomerDef): void {
  const card = ensureCard(ctx, c);
  const offerOk = e.shift === 'dawn' ? true : e.affinity >= SCORE.regularOffer;
  if (offerOk && !isRegistered(card) && card.tier !== 'lost') e.step = 'regularOffer';
  else finish(ctx, e);
}

function hasTalk(ctx: Ctx, c: CustomerDef): boolean {
  const t = c.talk;
  if (!t) return false;
  const visit = effectiveVisit(ctx, c.id);
  return (t.day === undefined || t.day === ctx.state.day) && (t.visit === undefined || visit >= t.visit);
}

/** 판매 뒤 선택 대화 */
export function talkOptions(c: CustomerDef): string[] {
  return c.talk ? c.talk.options.map((o) => o.label) : [];
}

export function doTalk(ctx: Ctx, option: 0 | 1): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'talk') return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  const opt = c.talk?.options[option];
  if (!opt) return false;
  for (const l of opt.reply) sayLine(ctx, c, l);
  if (opt.clue) grantClue(ctx, opt.clue);
  if (opt.flag) setFlag(ctx, opt.flag);
  afterSold(ctx, e, c);
  return true;
}

function recordSale(ctx: Ctx, e: EncounterState, c: CustomerDef): void {
  const s = ctx.state;
  const product = ctx.products[e.chosenProductId as string] as Product;
  e.outcome = 'sold';
  s.salesCount++;
  say(ctx, c, pickLine(ctx, c, 'success'));
  narrate(ctx, c.lines.successNote);
  if (e.shift === 'afternoon') {
    s.revenue += product.price;
    s.totalRevenue += product.price;
    ctx.emit({ type: 'sale', productId: product.id, amount: product.price, shift: 'afternoon' });
  } else {
    // 새벽 판매는 매출이 아니라 장부에 기록한다
    const pay = c.specialPayment;
    if (pay) {
      s.dawnLedger.push({ customerId: c.id, label: pay.label, amount: pay.amount });
      ctx.emit({ type: 'ledger', label: pay.label, amount: pay.amount });
    }
    ctx.emit({ type: 'sale', productId: product.id, amount: pay?.amount ?? 0, shift: 'dawn' });
  }
  const card = ensureCard(ctx, c);
  card.purchases.push({ productId: product.id, day: s.day });
  ctx.emit({ type: 'cardUpdate', customerId: c.id, field: 'purchases' });
}

export function doRegularOffer(ctx: Ctx, accept: boolean): boolean {
  const e = enc(ctx);
  if (!e || e.step !== 'regularOffer') return false;
  const c = ctx.customers[e.customerId] as CustomerDef;
  if (accept) {
    const card = ensureCard(ctx, c);
    registerRegular(card, ctx.state.day);
    ctx.state.newRegulars.push(c.id);
    ctx.emit({ type: 'regular', customerId: c.id, book: c.shift });
    ctx.emit({ type: 'relationship', customerId: c.id, delta: card.score, score: card.score, tier: card.tier });
    react(ctx, c, 'regular.accept');
  } else {
    react(ctx, c, 'regular.decline');
  }
  finish(ctx, e);
  return true;
}

function finish(ctx: Ctx, e: EncounterState): void {
  const c = ctx.customers[e.customerId] as CustomerDef;
  e.step = 'done';
  if (e.outcome === 'sold' || e.outcome === 'walked') {
    const farewell = pickLine(ctx, c, 'farewell');
    say(ctx, c, farewell);
    if (farewell) reactThought(ctx, c, 'farewell');
  }
  if (e.outcome === 'sold') {
    emitReaction(ctx, c, c.reactions?.leave);
    reactThought(ctx, c, 'sold');
  }
  ctx.emit({ type: 'customerLeave', customerId: e.customerId, outcome: e.outcome });
}

/** 새벽 수칙 위반: 공포 이벤트, 평정심 −25, 판매 실패, 손님은 사라진다 */
function violate(ctx: Ctx, e: EncounterState, rule: RuleId): boolean {
  const c = ctx.customers[e.customerId] as CustomerDef;
  e.violated.push(rule);
  ctx.state.violations++;
  e.outcome = 'horror';
  e.step = 'done';
  const text = c.lines.violation[String(rule)];
  if (text) say(ctx, c, text);
  else narrate(ctx, str(ctx.data, 'violation.default'));
  ctx.emit({ type: 'violation', rule, severe: true });
  ctx.emit({ type: 'horror', customerId: c.id, kind: 'breach' });
  ctx.emit({ type: 'sfx', id: 'violation' });
  ctx.emit({ type: 'customerLeave', customerId: c.id, outcome: 'horror' });
  changeComposure(ctx, SCORE.violationComposure);
  return true;
}

/** 한 번의 가용 선택지 계산용: 응대 단계별 선택 */
export function stageChoices(e: EncounterState): { greet: GreetStyle[]; probes: ProbeId[]; closes: CloseId[] } {
  return {
    greet: ['warm', 'quiet', 'direct'],
    probes: e.probesUsed.length >= SCORE.maxProbes ? [] : PROBE_FIELDS.filter((p) => !e.probesUsed.includes(p)),
    closes: ['tryOn', 'boxRed', 'boxGold', 'checkout'],
  };
}

