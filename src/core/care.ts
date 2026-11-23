import type {
  CareForbid, CareProfile, CareTemplateId, Category, ClientCard, Color, CustomerDef, ProbeId, Product, Tier,
} from './types';

export const CARE_TIER = { regular: 2, vip: 5, lifetime: 10 } as const;
export const STARTING_SCORE = 2;

/** 등급: score ≤0 lost, 2~4 regular, 5~9 vip, 10+ lifetime. 단골이 아니면(미등록) new. */
export function tierFor(score: number): Tier {
  if (score <= 0) return 'lost';
  if (score >= CARE_TIER.lifetime) return 'lifetime';
  if (score >= CARE_TIER.vip) return 'vip';
  return 'regular'; // 1점은 등록 직후 감점 상태. regular로 취급한다.
}

export function isRegistered(card: ClientCard | undefined): boolean {
  return !!card && (card.tier === 'regular' || card.tier === 'vip' || card.tier === 'lifetime');
}

/** 새 고객 카드. 모르는 칸은 undefined로 둔다 (0이나 빈 문자열이 아니다). */
export function newCard(customerId: string, book: ClientCard['book']): ClientCard {
  return {
    customerId, book, notes: [], purchases: [], score: 0, tier: 'new', lastContactDay: null, sentToday: 0,
  };
}

/** 응대 중 알아낸 정보를 카드에 기록한다. 바뀐 칸 이름을 돌려준다. */
export function fillCardFromProbe(
  card: ClientCard,
  customer: CustomerDef,
  probe: ProbeId,
  opts: { budgetKnown: boolean },
): (keyof ClientCard)[] {
  const changed: (keyof ClientCard)[] = [];
  switch (probe) {
    case 'askCategory':
      if (customer.category !== 'any') {
        card.category = customer.category as Category;
        changed.push('category');
      }
      if (customer.wants !== undefined && customer.category !== 'any') {
        card.wants = customer.wants;
        changed.push('wants');
      }
      break;
    case 'askOccasion':
      if (customer.color !== null) {
        card.color = customer.color as Color;
        changed.push('color');
      }
      if (customer.care.occasionLabel !== undefined && customer.care.occasionDay !== undefined) {
        card.occasion = { label: customer.care.occasionLabel, day: customer.care.occasionDay };
        changed.push('occasion');
      }
      break;
    case 'askBudget':
      if (opts.budgetKnown && customer.budget !== null) {
        card.budget = customer.budget;
        changed.push('budget');
      }
      break;
    case 'observe':
      if (customer.cardNote !== undefined && !card.notes.includes(customer.cardNote)) {
        card.notes.push(customer.cardNote);
        changed.push('notes');
      }
      break;
  }
  return changed;
}

/** 'dawn_thanks' → 'thanks' */
export function baseKind(t: CareTemplateId): 'thanks' | 'occasion' | 'recommend' | 'checkin' {
  return (t.startsWith('dawn_') ? t.slice(5) : t) as 'thanks' | 'occasion' | 'recommend' | 'checkin';
}

/**
 * 관리 문자 점수 변화 (GDD §6-2).
 * thanks 구매 당일 +1(다음 날부터 +0) / occasion 기록된 기념일 당일 +2, 아니면 −1 /
 * recommend 카테고리·색이 카드와 맞으면 +1, 아니면 −1 / checkin 싫어하면 −1, 아니면 +1 /
 * 싫어하는 연락은 −1 / 같은 날 2통째는 −1 추가 (오미란 제외).
 */
export function scoreCare(
  card: ClientCard,
  profile: CareProfile,
  template: CareTemplateId,
  day: number,
  product?: Product,
): number {
  const kind = baseKind(template);
  let delta: number;
  switch (kind) {
    case 'thanks':
      delta = card.purchases.some((p) => p.day === day) ? 1 : 0;
      break;
    case 'occasion':
      delta = card.occasion !== undefined && card.occasion.day === day ? 2 : -1;
      break;
    case 'recommend': {
      const match =
        product !== undefined &&
        card.category !== undefined && card.color !== undefined &&
        product.category === card.category && product.color === card.color;
      delta = match ? 1 : -1;
      break;
    }
    case 'checkin':
      delta = 1;
      break;
  }
  if (profile.dislikes.includes(template)) delta = -1;
  if (card.sentToday >= 1 && !profile.overcontactSafe) delta -= 1;
  return delta;
}

/** 새벽 관리 금기: 해당 템플릿(또는 'any')에 걸린 금기를 찾는다 */
export function findDawnTaboo(profile: CareProfile, template: CareTemplateId): CareForbid | null {
  return profile.forbid?.find((f) => f.template === 'any' || f.template === template) ?? null;
}

/** 점수를 바꾸고 등급을 다시 계산한다. 이탈(lost)은 되돌아오지 않는다. */
export function applyScoreDelta(card: ClientCard, delta: number): { delta: number; score: number; tier: Tier } {
  if (card.tier === 'lost' || card.tier === 'new') return { delta: 0, score: card.score, tier: card.tier };
  card.score += delta;
  card.tier = tierFor(card.score);
  return { delta, score: card.score, tier: card.tier };
}

/** 단골 등록: 관계 점수 2에서 시작 */
export function registerRegular(card: ClientCard, day: number): void {
  card.score = STARTING_SCORE;
  card.tier = tierFor(card.score);
  card.lastContactDay = day;
}

export interface RolloverResult {
  decayed: { customerId: string; delta: number; score: number; tier: Tier }[];
  uninvited: string[];
}

/**
 * 하루가 바뀔 때: 마지막 연락 후 2일 이상 지난 오후 단골은 −1.
 * 새벽 단골은 점수 대신 "잊힌 단골"로 예약된다 (문 밖의 손님은 방치가 정답이라 제외).
 * sentToday는 0으로 되돌린다.
 */
export function rolloverCards(
  cards: Record<string, ClientCard>,
  endingDay: number,
  customers: Record<string, CustomerDef>,
): RolloverResult {
  const out: RolloverResult = { decayed: [], uninvited: [] };
  for (const card of Object.values(cards)) {
    card.sentToday = 0;
    if (!isRegistered(card)) continue;
    const gap = endingDay - (card.lastContactDay ?? endingDay);
    if (gap < 2) continue;
    if (card.book === 'afternoon') {
      const r = applyScoreDelta(card, -1);
      out.decayed.push({ customerId: card.customerId, ...r });
    } else if (!customers[card.customerId]?.care.noContact) {
      out.uninvited.push(card.customerId);
    }
  }
  return out;
}
