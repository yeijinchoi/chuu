// 도메인 타입. core는 브라우저 API를 쓰지 않는다 (유니티 이식 경계).

export type Shift = 'afternoon' | 'dawn';
export type Category = 'bag' | 'apparel' | 'jewelry'; // 부서: 가방 · 의류 · 파인주얼리
export type Color = 'beige' | 'pink' | 'black' | 'white';
export type GreetStyle = 'warm' | 'quiet' | 'direct';
export type ProbeId = 'askCategory' | 'askOccasion' | 'askBudget' | 'observe';
export type CloseId = 'tryOn' | 'boxRed' | 'boxGold' | 'checkout';
export type SalesTemplateId = 'new_arrival' | 'private' | 'greeting' | 'dawn_open' | 'dawn_offer' | 'dawn_name';
export type TemplateId = SalesTemplateId;
export type CareTemplateId =
  | 'thanks' | 'occasion' | 'recommend' | 'checkin'
  | 'dawn_thanks' | 'dawn_occasion' | 'dawn_recommend' | 'dawn_checkin';
export type Tier = 'new' | 'regular' | 'vip' | 'lifetime' | 'lost';

/** 고객 카드: 응대 중 알아낸 정보만 채운다. 모르는 칸은 undefined → UI는 "아직 몰라요" */
export interface ClientCard {
  customerId: string;
  book: Shift;
  category?: Category;
  wants?: string;
  color?: Color;
  budget?: number;
  occasion?: { label: string; day: number }; // 용도 답변으로 기록
  notes: string[]; // 관찰로 얻은 메모
  purchases: { productId: string; day: number }[];
  score: number;
  tier: Tier;
  lastContactDay: number | null;
  sentToday: number; // 과잉 연락 판정 (관리 문자만 센다)
  lastVisitDay?: number; // 마지막으로 응대한 날
  visits?: number; // 응대한 횟수 (재방문 대사 선택용)
  drink?: Hospitality['pref']; // 대접 취향 (undefined = 아직 모름)
  lastThanksDay?: number; // 마지막으로 감사 문자를 보낸 날
}

export interface ChatDef {
  reply: string;
  options: [string, string];
  best: 0 | 1;
}

export interface CareForbid {
  template: CareTemplateId | 'any';
  composure?: number; // 음수 = 평정심 감소
  scoreDelta?: number;
  earlierSlots?: number; // 문 밖의 손님: 다음 등장이 N슬롯 빨라진다
  note: string;
}

/** 손님별 관리 성향 (customers.json의 care 필드) */
export interface CareProfile {
  likes: CareTemplateId[];
  dislikes: CareTemplateId[];
  occasionDay?: number;
  occasionLabel?: string;
  memo?: string; // 서윤의 관리 메모 (검은 수첩)
  forbid?: CareForbid[]; // 새벽 관리 금기
  neglectEvent?: string; // 새벽: 방치 시 이벤트 id
  noContact?: boolean; // 문 밖의 손님: 방치가 정답, 연락이 곧 금기
  unreachable?: boolean; // 바깥에서 온 색: 연락 수단 없음
  redBoxCare?: boolean; // 얼굴 없는 여자
  overcontactSafe?: boolean; // 오미란: 과잉 연락 페널티 없음
  mustThank?: boolean; // 백설: 방문 다음 애프터케어에 감사 문자를 안 보내면 다음 새벽에 찾아온다
  vipReveal?: string; // VIP 보상 대사
  chat?: ChatDef; // 오후 관리 문자 답장과 짧은 대화
}

export type RuleId = number; // 1~11. 6번(찢김)은 데이터에만 있고 판정 없음
export type Stage = 'greet' | 'probe' | 'propose' | 'close';

/** 수칙은 코드가 아니라 데이터(rules.json)로 정의한다 */
export interface RuleDef {
  id: RuleId;
  day: number;
  text: string;
  stage: Stage | 'event';
  forbid?: string[];
  require?: string;
  universal?: boolean; // 2번: 모든 새벽 손님에게 적용
  unlessMentionsPrice?: boolean; // 2번: 손님이 먼저 가격을 언급했으면 적용하지 않는다
  exempts?: RuleId[]; // 9번: 이 수칙이 걸린 손님에게는 해당 수칙을 적용하지 않는다
}
export type Mood = 'calm' | 'uneasy' | 'dread' | 'collapse';

export interface Product {
  id: string;
  name: string;
  shift: Shift;
  category: Category;
  kind: string;
  color: Color | null;
  price: number; // 새벽 상품의 price는 원화 환산가. empty_box는 color null
  description?: string;
}

/** 스프라이트 파라미터. 렌더러(M2)가 해석한다. */
export type SpriteParams = Record<string, string>;

export interface CustomerLines {
  opening: string;
  openingUninvited?: string;
  askCategory: string;
  askOccasion: string;
  askBudget: string;
  observe: string;
  success: string;
  successNote?: string; // 새벽: "~를 받았다." 지문
  fail: string;
  failNote?: string;
  farewell?: string; // 진영숙의 새벽 복선
  violation: Partial<Record<string, string>>; // 키: 수칙 번호 문자열 또는 'manner'
}

/** 재방문 대사 (SCRIPT_DAY2_3 §0). 키는 방문 횟수("2", "3"). 적히지 않은 키는 첫 방문 대사를 쓴다. */
export type CustomerReturnLines = Partial<Omit<CustomerLines, 'violation'>> & { openingRegular?: string };

/** ★ 손님별 반응 대사 (SCRIPT_DAY1 §0). 문자열이 "> "로 시작하면 지문, 아니면 손님의 대사다. 없으면 strings의 공통 반응을 쓴다. */
export interface CustomerReactions {
  enter?: string; // 입장 지문
  greet?: { match?: string; mismatch?: string | Partial<Record<GreetStyle, string>> };
  propose?: { perfect?: string; deptOnly?: string; wrong?: string; overBudget?: string };
  close?: { tryOn?: string; box?: string | { red?: string; gold?: string }; checkout?: string };
  regular?: { accept?: string; decline?: string };
  manner?: string; // 매너 실수 뒤 덧붙이는 지문
  leave?: string; // 퇴장 지문
  /** (속마음): opening = 첫 대사 뒤, observe = 관찰 뒤, farewell = 작별 대사 뒤, sold = 판매 후 퇴장 뒤 */
  thought?: { opening?: string; observe?: string; farewell?: string; sold?: string };
}

/** VIP 웰컴 드링크 (GDD §5 단계 1-1). pref: 맞는 대접. any는 둘 다 맞고, taboo는 아무것도 내지 않는 것이 맞다. */
export interface Hospitality {
  pref: 'water' | 'chocolate' | 'any' | 'taboo' | 'none';
  match: string;
  mismatch: string;
  none?: string;
}

export interface CustomerDef {
  id: string;
  name: string;
  shift: Shift;
  motif?: string;
  entranceNote?: string;
  greetPref: GreetStyle;
  category: Category | 'any';
  color: Color | null;
  budget: number | null;
  mentionsPrice: boolean;
  occasionIsGift: boolean;
  form: 'humanoid' | 'creature';
  speaksVia?: 'voice' | 'tapping' | 'phone' | 'speaker' | 'none';
  wants?: string; // 고객 카드 "찾는 것" (토트백, 수트 …)
  cardNote?: string; // 관찰로 고객 카드에 남는 짧은 메모
  rules: RuleId[];
  onlyProduct?: string;
  care: CareProfile;
  traits: { frostHands?: boolean; wantsAnything?: boolean; extraFingers?: boolean };
  specialPayment?: { label: string; amount: number };
  sprite: SpriteParams;
  draftLines?: boolean; // 기획 문서에 없는 대사를 구현자가 채웠다
  reactions?: CustomerReactions;
  lines: CustomerLines;
  returns?: Partial<Record<'2' | '3', CustomerReturnLines>>;
  vvip?: boolean; // 처음부터 VIP 대접을 받는 손님
  hospitality?: Hospitality;
}

export interface ContactDef {
  id: string;
  name: string;
  book: Shift; // afternoon = 오후 명부, dawn = 검은 수첩
  address?: string;
  memo: string;
  memoStruck?: string;
  customerId: string | null; // 방문하는 손님 id (zero, oh는 null)
  prefers: TemplateId | null;
  dislikes: TemplateId | null;
  comesUninvited?: boolean; // baek
  composureOnSend?: number; // zero: -5
  replies: { prefer?: string; neutral?: string; dislike?: string; any?: string };
}

export interface ScheduleSlot {
  shift: Shift;
  time: string;
  customerId: string;
  condition: 'always' | 'invited' | 'invitedElse';
  altTime?: string;
}

/** 문자 한도·시각 등 하루 설정 (day1.json) */
export interface DayDef {
  day: number;
  startComposure: number;
  clocks: {
    afternoonBriefing: string; afternoonTexting: string; afternoonAftercare: string;
    dawnBriefing: string; dawnTexting: string; closingText: string; dawnAftercare: string;
    uninvited: string;
  };
  texting: Record<Shift, { total: number; sales: number }>;
  aftercare: { perShift: number };
  schedule: ScheduleSlot[];
}

export interface TemplateDef {
  id: string;
  name: string;
  shift: Shift;
  text: string;
}
export interface TemplatesData {
  sales: (TemplateDef & { id: SalesTemplateId })[];
  care: (TemplateDef & { id: CareTemplateId })[];
}

export interface GameData {
  products: Product[];
  customers: CustomerDef[];
  contacts: ContactDef[];
  templates: TemplatesData;
  rules: RuleDef[];
  days: Record<number, DayDef>;
  strings: Record<string, unknown>;
}

/** 실제로 편성된 슬롯 (문자 결과를 반영) */
export interface ResolvedSlot {
  shift: Shift;
  time: string;
  customerId: string;
  uninvited: boolean; // 초대 없이 온 손님 (openingUninvited 대사)
  forgotten: boolean; // 잊힌 단골: 시작 호감 30, 평정심 −10
}

export type Phase =
  | { kind: 'title' }
  | { kind: 'briefing'; shift: Shift }
  | { kind: 'texting'; shift: Shift }
  | { kind: 'encounter'; slotIndex: number; enc: EncounterState }
  | { kind: 'between'; nextSlotIndex: number }
  | { kind: 'aftercare'; shift: Shift }
  | { kind: 'shiftBreak' }
  | { kind: 'closingText' }
  | { kind: 'results' }
  | { kind: 'badEnding' };

export interface EncounterState {
  customerId: string;
  shift: Shift;
  step: 'greet' | 'serve' | 'probe' | 'propose' | 'close' | 'regularOffer' | 'done';
  affinity: number;
  probesUsed: ProbeId[];
  offered: string[];
  chosenProductId: string | null;
  violated: RuleId[];
  mannerSlips: number;
  outcome: 'pending' | 'sold' | 'walked' | 'horror';
  uninvited: boolean; // 초대 없이 온 손님 (openingUninvited 대사)
  forgotten: boolean; // 잊힌 단골: 시작 호감 30, 평정심 −10
}

export interface Grade {
  grade: 'S' | 'A' | 'B' | 'C';
  comment: string;
}

export interface DayResult extends Grade {
  revenue: number;
  dawnLedger: { customerId: string; label: string; amount: number }[];
  dawnLedgerTotal: number;
  salesCount: number;
  mannerSlips: number;
  violations: number;
  thanksSent: number;
  composure: number;
  newRegulars: string[];
}

export interface GameState {
  version: 1;
  day: number;
  seed: number;
  playerName: string;
  shift: Shift;
  clock: string; // "HH:MM"
  revenue: number; // 오늘 오후 원화 매출
  totalRevenue: number; // 누적 (저장용)
  dawnLedger: { customerId: string; label: string; amount: number }[];
  salesCount: number;
  composure: number;
  mannerSlips: number;
  violations: number;
  thanksSent: number; // 감사 문자 수 (등급 판정)
  newRegulars: string[];
  cards: Record<string, ClientCard>;
  texting: Record<Shift, { sent: Record<string, TemplateId | CareTemplateId>; remaining: number; salesSent: number }>;
  aftercareRemaining: number;
  visitors: Record<string, { time: string; bonus: number; uninvited?: boolean }>;
  slots: ResolvedSlot[];
  pendingUninvited: string[]; // 다음 새벽에 초대 없이 찾아올 단골
  earlierSlots: Record<string, number>; // 다음 등장이 빨라질 횟수
  pendingReplies: Record<string, true>; // 답장 선택을 기다리는 손님
  redBoxDay: number | null;
  closingReplied: boolean | null;
  results: DayResult | null;
  phase: Phase;
  log: GameEvent[]; // 디버그·리플레이용 (저장에는 제외)
}

export type Action =
  | { type: 'start'; playerName: string; seed?: number }
  | { type: 'ackBriefing' }
  | { type: 'ackShiftBreak' }
  | { type: 'sendText'; contactId: string; template: TemplateId }
  | { type: 'finishTexting' }
  | { type: 'sendCare'; customerId: string; template: CareTemplateId; productId?: string }
  | { type: 'chooseReply'; customerId: string; option: 0 | 1 }
  | { type: 'placeRedBox' }
  | { type: 'finishAftercare' }
  | { type: 'greet'; style: GreetStyle }
  | { type: 'serve'; drink: 'water' | 'chocolate' | 'none' }
  | { type: 'probe'; probe: ProbeId }
  | { type: 'propose'; productId: string }
  | { type: 'close'; choice: CloseId }
  | { type: 'regularOffer'; accept: boolean }
  | { type: 'advance' }
  | { type: 'closingText'; reply: boolean }
  | { type: 'nextDay' };

export type GameEvent =
  | { type: 'line'; speaker: string | null; text: string; kind?: 'note' } // note: 쪽지(RulesNote) 본문
  | { type: 'thought'; text: string } // (속마음) 이름표 없음
  | { type: 'phone'; from: string; text: string }
  | { type: 'customerEnter'; customerId: string }
  | { type: 'customerLeave'; customerId: string; outcome: EncounterState['outcome'] }
  | { type: 'affinity'; delta: number; value: number }
  | { type: 'composure'; delta: number; value: number }
  | { type: 'violation'; rule: RuleId; severe: boolean }
  | { type: 'mannerSlip'; text: string }
  | { type: 'shift'; shift: Shift }
  | { type: 'ledger'; label: string; amount: number }
  | { type: 'horror'; customerId: string | null; kind: 'breach' | 'blackout' }
  | { type: 'sale'; productId: string; amount: number; shift: Shift }
  | { type: 'regular'; customerId: string; book: Shift }
  | { type: 'cardUpdate'; customerId: string; field: keyof ClientCard }
  | { type: 'relationship'; customerId: string; delta: number; score: number; tier: Tier }
  | { type: 'replyChoices'; customerId: string; options: [string, string] }
  | { type: 'mood'; mood: Mood }
  | { type: 'clock'; time: string }
  | { type: 'phase'; phase: Phase['kind'] }
  | { type: 'save'; ok: boolean }
  | { type: 'sfx'; id: string };

export interface SaveV1 {
  version: 1;
  day: number;
  playerName: string;
  totalRevenue: number;
  dawnLedger: GameState['dawnLedger'];
  regulars: Record<string, ClientCard>;
  savedAtClock: string;
  pendingUninvited?: string[];
  earlierSlots?: Record<string, number>;
}

export interface StorageAdapter {
  load(): SaveV1 | null | 'corrupt';
  save(s: SaveV1): boolean;
}
