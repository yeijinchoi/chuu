import {
  applyScoreDelta, baseKind, findDawnTaboo, isRegistered, scoreCare,
} from './care';
import { changeComposure, dayDef, str, type Ctx } from './ctx';
import { SCORE } from './encounter';
import type { CareTemplateId, ContactDef, CustomerDef, SalesTemplateId, Shift } from './types';

/** {name} {contact} {customer} {product} {event} 치환 */
export function renderTemplate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

function textingShift(ctx: Ctx): Shift | null {
  const p = ctx.state.phase;
  return p.kind === 'texting' ? p.shift : null;
}

/** 영업 문자 발송 가능 여부 (검증만) */
export function checkSendText(ctx: Ctx, contactId: string, template: SalesTemplateId): ContactDef | null {
  const shift = textingShift(ctx);
  if (!shift) return null;
  const contact = ctx.data.contacts.find((c) => c.id === contactId);
  if (!contact || contact.book !== shift) return null;
  if (!ctx.data.templates.sales.some((t) => t.id === template && t.shift === shift)) return null;
  const t = ctx.state.texting[shift];
  const cap = dayDef(ctx).texting[shift].sales;
  if (contactId in t.sent || t.remaining <= 0 || t.salesSent >= cap) return null;
  return contact;
}

export function doSendText(ctx: Ctx, contactId: string, template: SalesTemplateId): boolean {
  const contact = checkSendText(ctx, contactId, template);
  const shift = textingShift(ctx);
  if (!contact || !shift) return false;
  const s = ctx.state;
  const t = s.texting[shift];
  t.sent[contactId] = template;
  t.remaining--;
  t.salesSent++;

  const customer = contact.customerId ? ctx.customers[contact.customerId] : undefined;
  const card = customer ? s.cards[customer.id] : undefined;
  if (card) card.lastContactDay = s.day;

  let reply: string | undefined;
  if (!customer) {
    reply = contact.replies.any ?? contact.replies.neutral;
  } else if (card?.tier === 'lost') {
    reply = undefined; // 이탈한 손님은 문자에 반응하지 않는다
  } else if (template === contact.prefers) {
    reply = contact.replies.prefer ?? contact.replies.any;
    s.visitors[customer.id] = { time: scheduledTime(ctx, customer, shift), bonus: SCORE.textBonus };
  } else if (template === contact.dislikes) {
    reply = contact.replies.dislike ?? contact.replies.any;
  } else {
    reply = contact.replies.neutral ?? contact.replies.any;
    s.visitors[customer.id] = { time: scheduledTime(ctx, customer, shift), bonus: 0 };
  }
  if (reply) ctx.emit({ type: 'phone', from: contact.name, text: reply });
  else ctx.emit({ type: 'line', speaker: null, text: str(ctx.data, 'text.noReply') });
  if (contact.composureOnSend) changeComposure(ctx, contact.composureOnSend);
  return true;
}

function scheduledTime(ctx: Ctx, customer: CustomerDef, shift: Shift): string {
  const slot = dayDef(ctx).schedule.find((x) => x.shift === shift && x.customerId === customer.id);
  return slot?.time ?? '00:00';
}

// ------------------------------------------------------------------ 관리 문자

export interface CareCheck {
  customer: CustomerDef;
  shift: Shift;
  phase: 'texting' | 'aftercare';
  isThanks: boolean;
}

/** 관리 문자 발송 가능 여부 (검증만) */
export function checkSendCare(
  ctx: Ctx, customerId: string, template: CareTemplateId, productId?: string,
): CareCheck | null {
  const p = ctx.state.phase;
  if (p.kind !== 'texting' && p.kind !== 'aftercare') return null;
  const shift = p.shift;
  const tpl = ctx.data.templates.care.find((t) => t.id === template);
  if (!tpl || tpl.shift !== shift) return null;
  const customer = ctx.customers[customerId];
  const card = ctx.state.cards[customerId];
  if (!customer || !card || customer.shift !== shift) return null;
  if (customer.care.unreachable || card.tier === 'lost') return null;
  const isThanks = baseKind(template) === 'thanks';
  if (isThanks) {
    if (card.purchases.length === 0) return null;
  } else if (!isRegistered(card) && !customer.care.noContact) {
    return null;
  }
  if (baseKind(template) === 'recommend') {
    const prod = productId ? ctx.products[productId] : undefined;
    if (!prod || prod.shift !== shift) return null;
  }
  const useAftercare = p.kind === 'aftercare' && isThanks;
  if (useAftercare ? ctx.state.aftercareRemaining <= 0 : ctx.state.texting[shift].remaining <= 0) return null;
  return { customer, shift, phase: p.kind, isThanks };
}

export function doSendCare(ctx: Ctx, customerId: string, template: CareTemplateId, productId?: string): boolean {
  const chk = checkSendCare(ctx, customerId, template, productId);
  if (!chk) return false;
  const s = ctx.state;
  const { customer, shift, isThanks } = chk;
  const card = s.cards[customerId];
  if (!card) return false;
  if (chk.phase === 'aftercare' && isThanks) s.aftercareRemaining--;
  else s.texting[shift].remaining--;

  const product = productId ? ctx.products[productId] : undefined;
  const profile = customer.care;
  const taboo = shift === 'dawn' ? findDawnTaboo(profile, template) : null;
  const registered = isRegistered(card);

  if (taboo) {
    // 새벽 관리 금기: 공포 이벤트 대신 평정심만 깎는다
    ctx.emit({ type: 'line', speaker: null, text: taboo.note });
    if (taboo.earlierSlots) s.earlierSlots[customerId] = (s.earlierSlots[customerId] ?? 0) + taboo.earlierSlots;
    if (taboo.scoreDelta && registered) {
      const r = applyScoreDelta(card, taboo.scoreDelta);
      ctx.emit({ type: 'relationship', customerId, ...r });
    }
  } else if (registered) {
    const delta = scoreCare(card, profile, template, s.day, product);
    const r = applyScoreDelta(card, delta);
    ctx.emit({ type: 'relationship', customerId, ...r });
  }
  card.sentToday++;
  card.lastContactDay = s.day;
  if (isThanks) {
    card.lastThanksDay = s.day;
    s.thanksSent++;
  }
  if (taboo?.composure) changeComposure(ctx, taboo.composure);
  if (s.phase.kind === 'badEnding') return true;

  if (!taboo && shift === 'afternoon' && profile.chat) {
    s.pendingReplies[customerId] = true;
    ctx.emit({ type: 'phone', from: customer.name, text: profile.chat.reply });
    ctx.emit({ type: 'replyChoices', customerId, options: profile.chat.options });
  }
  return true;
}

export function doChooseReply(ctx: Ctx, customerId: string, option: 0 | 1): boolean {
  const customer = ctx.customers[customerId];
  const card = ctx.state.cards[customerId];
  const chat = customer?.care.chat;
  if (!customer || !card || !chat || !ctx.state.pendingReplies[customerId]) return false;
  if (option !== 0 && option !== 1) return false;
  delete ctx.state.pendingReplies[customerId];
  const delta = option === chat.best ? 1 : 0;
  const r = isRegistered(card) ? applyScoreDelta(card, delta) : { delta: 0, score: card.score, tier: card.tier };
  ctx.emit({ type: 'relationship', customerId, ...r });
  return true;
}

/** 얼굴 없는 여자: 애프터케어 때 문 앞에 빨간 상자를 둔다 (문자 1통 소모, +1) */
export function findRedBoxCustomer(ctx: Ctx): CustomerDef | undefined {
  return ctx.data.customers.find((c) => c.care.redBoxCare);
}

export function canPlaceRedBox(ctx: Ctx): boolean {
  const p = ctx.state.phase;
  if (p.kind !== 'aftercare' || p.shift !== 'dawn') return false;
  const c = findRedBoxCustomer(ctx);
  const card = c ? ctx.state.cards[c.id] : undefined;
  return !!card && isRegistered(card) && ctx.state.redBoxDay !== ctx.state.day && ctx.state.texting.dawn.remaining > 0;
}

export function doPlaceRedBox(ctx: Ctx): boolean {
  if (!canPlaceRedBox(ctx)) return false;
  const c = findRedBoxCustomer(ctx) as CustomerDef;
  const card = ctx.state.cards[c.id];
  if (!card) return false;
  ctx.state.texting.dawn.remaining--;
  ctx.state.redBoxDay = ctx.state.day;
  card.lastContactDay = ctx.state.day;
  ctx.emit({ type: 'line', speaker: null, text: str(ctx.data, 'text.redBoxPlaced') });
  const r = applyScoreDelta(card, 1);
  ctx.emit({ type: 'relationship', customerId: c.id, ...r });
  return true;
}
