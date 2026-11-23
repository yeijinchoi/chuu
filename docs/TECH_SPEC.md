# 기술 명세 — 구현자용

> 이 문서와 `GDD.md`, `DESIGN_SYSTEM.md`만 보고 구현할 수 있게 쓴다. 문서끼리 충돌하면 **GDD(규칙·수치) > DESIGN_SYSTEM(시각) > TECH_SPEC(구조)** 순서로 따른다.

## 1. 스택과 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 언어 | TypeScript `strict` | C# 번역이 쉽다 |
| 빌드 | Vite 6 | 설치돼 있다 |
| 테스트 | Vitest 3 | 코어 로직 전부 테스트 |
| 장면 | **Canvas 2D 직접 구현** (게임 엔진 안 씀) | 배경이 하나고 UI 비중이 높다. Phaser를 쓰면 이식할 때 걷어낼 코드만 늘어난다 |
| UI | 순수 DOM + CSS (프레임워크 없음) | 텍스트 선명도, 접근성, 키보드 포커스 |
| 글꼴 | `galmuri` npm 패키지의 woff2를 로컬 번들 | CDN 의존 없음 |
| 대사·데이터 | JSON | 유니티 `JsonUtility`나 ScriptableObject로 바로 옮길 수 있다. 응대가 시스템형이라 Ink보다 단순한 구조가 맞다. 스토리 컷신이 늘어나면 그때 Ink를 도입한다 |
| 저장 | `localStorage`, 어댑터로 분리 | |
| 아트 | 도트를 **코드로 그린다** (이미지 파일 없음) | 외부 에셋 없이 시작. 나중에 Aseprite PNG로 바꿀 수 있게 `SpriteSource` 인터페이스로 감싼다 |

## 2. 폴더 구조

```
index.html
src/
  main.ts                  # 부트스트랩: 로딩 → 타이틀 → 게임
  core/                    # ⚠ DOM, Canvas, window 접근 금지. 순수 로직만
    types.ts               # 모든 도메인 타입
    rng.ts                 # mulberry32 시드 RNG
    game.ts                # Game 클래스: dispatch(action) → events[]
    dayFlow.ts             # 하루 단계 상태 머신
    texting.ts             # 문자 영업 판정
    encounter.ts           # 응대 4단계 상태 머신 + 점수 계산
    rules.ts               # 수칙 위반 판정 (순수 함수)
    results.ts             # 정산, 등급
    save.ts                # 직렬화/역직렬화 + StorageAdapter 인터페이스
    mood.ts                # 평정심 → mood 단계
  data/
    products.json  customers.json  contacts.json  templates.json
    rules.json  day1.json  strings.ko.json
  render/
    palette.ts             # Dusk Mono 16 + mood별 팔레트 맵
    pixel.ts               # rect, hline, circle, dither, flipX 등 기본 도형
    scene.ts               # 배경 레이어
    customerSprite.ts      # 파라미터로 손님 도트 그리기
    productIcon.ts         # 상품 32×32 아이콘
    effects.ts             # 깜빡임, 스캔라인, 팔레트 반전, 흔들림
    loop.ts                # 고정 타임스텝 60Hz 루프
  ui/
    styles/tokens.css  base.css  components.css  fonts.css
    stage.ts               # 640×360 정수배 스케일링
    input.ts               # 키 매핑 → UI 명령
    hud.ts  dialogue.ts  choices.ts  phone.ts  rulesNote.ts
    productPicker.ts  ledger.ts  title.ts  toast.ts  bridge.ts
tests/
  core/*.test.ts
```

**의존성 방향**: `ui`·`render` → `core` (단방향). `core`는 아무것도 import하지 않는다(`data` JSON만 예외). 이 규칙이 유니티 이식의 경계다.

## 3. 코어 타입 (`src/core/types.ts`)

```ts
export type Shift = 'afternoon' | 'dawn';
export type Category = 'bag' | 'apparel' | 'jewelry';   // 부서: 가방 · 의류 · 파인주얼리
export type Color = 'beige' | 'pink' | 'black' | 'white';
export type GreetStyle = 'warm' | 'quiet' | 'direct';
export type ProbeId = 'askCategory' | 'askOccasion' | 'askBudget' | 'observe';
export type CloseId = 'tryOn' | 'boxRed' | 'boxGold' | 'checkout';
export type TemplateId = 'new_arrival' | 'private' | 'greeting' | 'dawn_open' | 'dawn_offer' | 'dawn_name';
export type CareTemplateId = 'thanks' | 'occasion' | 'recommend' | 'checkin'
  | 'dawn_thanks' | 'dawn_occasion' | 'dawn_recommend' | 'dawn_checkin';
export type Tier = 'new' | 'regular' | 'vip' | 'lifetime' | 'lost';

/** 고객 카드: 응대 중 알아낸 정보만 채운다. 모르는 칸은 undefined → UI는 "아직 몰라요" */
export interface ClientCard {
  customerId: string; book: Shift;
  category?: Category; wants?: string; color?: Color; budget?: number;
  occasion?: { label: string; day: number };      // 용도 답변으로 기록
  notes: string[];                                 // 관찰로 얻은 메모
  purchases: { productId: string; day: number }[];
  score: number; tier: Tier;
  lastContactDay: number | null;
  sentToday: number;                               // 과잉 연락 판정
}

/** 손님별 관리 성향 (customers.json의 care 필드) */
export interface CareProfile {
  likes: CareTemplateId[]; dislikes: CareTemplateId[];
  occasionDay?: number; occasionLabel?: string;
  forbid?: { template: CareTemplateId | 'any'; composure?: number; scoreDelta?: number; note: string }[]; // 새벽 관리 금기
  neglectEvent?: string;                           // 새벽: 방치 시 이벤트 id
  noContact?: boolean;                             // 문 밖의 손님: 연락이 곧 위반
  redBoxCare?: boolean;                            // 얼굴 없는 여자
  vipReveal?: string;                              // VIP 보상 대사
}
export type RuleId = number;               // 1~11. 6번(찢김)은 데이터에만 있고 판정 없음
export type Stage = 'greet' | 'probe' | 'propose' | 'close';

/** 수칙은 코드가 아니라 데이터(rules.json)로 정의한다 */
export interface RuleDef {
  id: RuleId; day: number; text: string;     // 받는 날, 쪽지에 보일 문장
  stage: Stage | 'event';
  forbid?: string[];     // 이 단계에서 고르면 위반: 'warm' | 'askBudget' | 'observe' | 'askOccasion' | 'tryOn' | 'boxRed' | 'boxGold' | 'checkout'
  require?: string;      // 이 단계에서 반드시 골라야 함: 9번 = 'askBudget', 10번 = 'empty_box', 4번 = 'boxRed'
  universal?: boolean;   // 2번: 모든 새벽 손님에게 적용(단, 9번이 걸린 손님은 예외)
}
export type Mood = 'calm' | 'uneasy' | 'dread' | 'collapse';

export interface Product {
  id: string; name: string; shift: Shift;
  category: Category; kind: string;                  // kind: 표시용 종류 (토트백, 수트, 반지 …)
  color: Color | null; price: number;                // 새벽 상품의 price는 원화 환산가. empty_box는 color null
  description?: string;                              // 새벽 상품 설명
}

export interface CustomerDef {
  id: string; name: string; shift: Shift;            // 새벽 손님 = 미지의 존재
  motif?: string;                                    // 기획 메모용, 화면에 쓰지 않음
  entranceNote?: string;                             // 입장 지문 (새벽)
  greetPref: GreetStyle;
  category: Category | 'any'; color: Color | null; budget: number | null;
  mentionsPrice: boolean; occasionIsGift: boolean;
  form: 'humanoid' | 'creature';
  speaksVia?: 'voice' | 'tapping' | 'phone' | 'speaker' | 'none'; // 크리처의 전달 방식 (대화창 이름표에 표시)
  rules: RuleId[];                                   // 이 손님에게 걸린 수칙 (2번은 universal이라 생략)
  onlyProduct?: string;                              // D8: 'empty_box'만 정답
  care: CareProfile;
  traits: { frostHands?: boolean; wantsAnything?: boolean; extraFingers?: boolean };
  specialPayment?: { label: string; amount: number }; // 새벽 장부
  sprite: SpriteParams;
  lines: {
    opening: string; openingUninvited?: string;
    askCategory: string; askOccasion: string; askBudget: string;
    observe: string; success: string; fail: string;
    farewell?: string;                               // 진영숙의 새벽 복선
    violation: Partial<Record<RuleId | 'manner', string>>;
  };
}

export interface ContactDef {
  id: string; name: string; book: Shift;             // afternoon = 오후 명부, dawn = 검은 수첩
  address?: string; memo: string; memoStruck?: string;
  customerId: string | null;                         // 방문하는 손님 id (zero, oh는 null)
  prefers: TemplateId | null; dislikes: TemplateId | null;
  comesUninvited?: boolean;                          // baek
  composureOnSend?: number;                          // zero: -5
  replies: { prefer?: string; neutral?: string; dislike?: string; any?: string };
}

export interface ScheduleSlot {
  shift: Shift; time: string; customerId: string;
  condition: 'always' | 'invited' | 'invitedElse'; altTime?: string;
}

export type Phase =
  | { kind: 'title' }
  | { kind: 'briefing'; shift: Shift }               // 오후: 접객 매너 / 새벽: 휴게 쪽지 + 수칙
  | { kind: 'texting'; shift: Shift }
  | { kind: 'encounter'; slotIndex: number; enc: EncounterState }
  | { kind: 'between'; nextSlotIndex: number }
  | { kind: 'aftercare'; shift: Shift }             // 20:00 / 05:00 감사 문자, 고객 카드 확인
  | { kind: 'shiftBreak' }                           // 오후 애프터케어 뒤 → 새벽 진열 전환
  | { kind: 'closingText' }                          // 04:44
  | { kind: 'results' } | { kind: 'badEnding' };

export interface EncounterState {
  customerId: string; shift: Shift;
  step: 'greet' | 'probe' | 'propose' | 'close' | 'regularOffer' | 'done';
  affinity: number;
  probesUsed: ProbeId[];              // 최대 2개
  offered: string[];                  // 상품 3개 id (해당 교대 카탈로그에서)
  chosenProductId: string | null;
  violated: RuleId[]; mannerSlips: number;
  outcome: 'pending' | 'sold' | 'walked' | 'horror';
}

export interface GameState {
  version: 1; day: number; seed: number; playerName: string;
  shift: Shift; clock: string;        // "HH:MM"
  revenue: number;                    // 오후 원화 매출
  dawnLedger: { customerId: string; label: string; amount: number }[];
  salesCount: number; composure: number;
  mannerSlips: number; violations: number;
  cards: Record<string, ClientCard>;               // 고객 카드 (단골이 아니어도 응대한 손님은 생성)
  texting: Record<Shift, { sent: Record<string, TemplateId | CareTemplateId>; remaining: number }>; // 하루 문자: 오후 4, 새벽 3 (영업+관리 공유)
  aftercareRemaining: number;                        // 애프터케어 감사 문자 2통
  visitors: Record<string, { time: string; bonus: number }>;
  closingReplied: boolean | null;
  phase: Phase;
  log: GameEvent[];                   // 디버그·리플레이용 (저장에는 제외)
}
```

### 액션과 이벤트 — UI와 코어 사이의 유일한 통로
```ts
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
  | { type: 'probe'; probe: ProbeId }
  | { type: 'propose'; productId: string }
  | { type: 'close'; choice: CloseId }
  | { type: 'regularOffer'; accept: boolean }
  | { type: 'advance' }                         // 다음 손님/단계로
  | { type: 'closingText'; reply: boolean };

export type GameEvent =
  | { type: 'line'; speaker: string | null; text: string }      // null = 지문
  | { type: 'phone'; from: string; text: string }
  | { type: 'customerEnter'; customerId: string }
  | { type: 'customerLeave'; customerId: string; outcome: EncounterState['outcome'] }
  | { type: 'affinity'; delta: number; value: number }
  | { type: 'composure'; delta: number; value: number }
  | { type: 'violation'; rule: RuleId; severe: boolean }
  | { type: 'mannerSlip'; text: string }
  | { type: 'shift'; shift: Shift }                              // 진열·조명 전환
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
  | { type: 'sfx'; id: string };                                // 사운드 자리

// game.ts
export class Game {
  constructor(data: GameData, storage?: StorageAdapter);
  getState(): Readonly<GameState>;
  dispatch(action: Action): GameEvent[];   // 잘못된 액션은 throw하지 않고 [] 반환 + console.warn
  availableActions(): Action[];            // UI 선택지 생성용, 테스트용
}
```
UI는 `dispatch` 결과 이벤트를 **큐로 순서대로 재생**한다(대사 타자기 → 다음 이벤트). 코어는 시간 흐름을 모른다. 연출 타이밍은 전부 UI 몫이다.

## 4. 핵심 규칙 구현 메모

- 점수 상수는 `encounter.ts` 상단 `export const SCORE = {...}`에 모은다. 값은 GDD §5를 따른다.
- 호감은 매번 `clamp(0, 100)`로 자른다. 평정심은 `0..100`.
- **교대 구분이 판정을 바꾼다.** 같은 행동이라도 `shift === 'afternoon'`이면 매너 실수, `'dawn'`이면 수칙 위반이다.
- 수칙 판정(`rules.ts`)은 `RuleDef` 데이터를 읽는 **범용 함수 하나**로 둔다: `checkChoice(customer, stage, choice, ruleDefs, shift)` → `{ kind: 'manner' } | { kind: 'rule'; rule } | null`.
  - 오후: `askBudget` && `!c.mentionsPrice` → `manner`. 오후에는 그 밖의 판정이 없다.
  - 새벽: 손님의 `rules` + universal 수칙(2번)을 모은다. 9번이 걸린 손님에게는 2번을 적용하지 않는다. `forbid`에 든 선택이면 위반이다.
  - `require`는 그 단계가 **끝날 때** 검사한다. 9번은 니즈 파악 두 칸을 다 썼는데 `askBudget`이 없으면 위반, 10번은 `empty_box`가 아닌 상품을 고르면 위반, 4번은 `boxRed`가 아닌 클로징이면 위반이다.
  - 3번(04:44 답장)은 `stage: 'event'`라 `closingText` 처리에서 직접 검사한다.
- `pickOffers`: `onlyProduct`가 있는 손님(D8)이면 일반 카드 3장 + `empty_box` 1장, 총 4장을 낸다.
- **고객 관리(`care.ts`)**: 순수 함수로 둔다.
  - 니즈 파악·관찰 결과가 나올 때마다 `ClientCard` 칸을 채우고 `cardUpdate` 이벤트를 보낸다.
  - `scoreCare(card, profile, template, day, productId?)` → 점수 변화. GDD §6-2 표를 따른다(`thanks` 당일 +1, `occasion` 정확한 날 +2·틀리면 −1, `recommend` 부서·색 일치 +1·불일치 −1, `checkin`은 likes/dislikes, 같은 날 2통째 −1).
  - 새벽 금기(`forbid`)는 수칙 위반처럼 처리하되 공포 이벤트 대신 평정심만 깎는다. `noContact` 손님에게는 어떤 문자든 금기다.
  - 하루가 바뀔 때 `lastContactDay`가 2일 이상 지난 단골은 −1. 새벽 단골은 대신 `neglectEvent`가 예약된다(초대 없이 방문, 시작 호감 30, 평정심 −10).
  - 등급: score ≤0 `lost`, 2~4 `regular`, 5~9 `vip`, 10+ `lifetime`.
- 새 손님이나 수칙을 추가할 때는 코드를 고치지 않고 `customers.json`과 `rules.json`만 고친다. 이게 이 구조의 목적이다.
- 처리: `manner`면 호감 −10, `mannerSlips++`, 응대를 계속한다. 새벽 `rule`이면 `violation` + `horror` 이벤트, 평정심 −25, `outcome='horror'`로 즉시 응대를 끝낸다.
- 평정심은 새벽에만 바뀐다. 오후 판매 성공으로 평정심이 오르지 않는다.
- 손님별 위반 대사는 `lines.violation[rule]`에서 가져온다. 없으면 `strings.ko.json`의 기본값을 쓴다.
- 상품 3장 구성(`pickOffers`): GDD §5-3 규칙. 후보가 여럿이면 시드 RNG로 고르고 순서도 섞는다. 해당 후보가 없으면(예: 색 다른 같은 품목이 없음) 다른 품목으로 채운다. `wantsAnything`이면 무작위 3장.
- `pickOffers`는 손님의 교대와 같은 `shift`의 상품만 후보로 쓴다.
- 새벽 손님 성공: `revenue`가 아니라 `dawnLedger`에 특수 지불을 추가하고 `ledger` 이벤트를 보낸다. 그다음 호감과 상관없이 `regularOffer` 단계로 간다.
- 교대 전환: 오후 마지막 슬롯이 끝나면 `shiftBreak` → `briefing(dawn)` → `texting(dawn)` → 새벽 슬롯 순서로 진행한다. 전환 시 `shift` 이벤트를 보내 렌더러가 진열과 조명을 바꾼다.
- 평정심이 0이 되면 어느 단계에서든 `badEnding`으로 넘어간다.
- 시각: 각 손님 슬롯 시각으로 `clock` 이벤트를 보낸다. 백설 `invitedElse`: 초대받았으면 `time`(03:33), 아니면 `altTime`(04:20). 새벽 슬롯 뒤 04:44에 `closingText`.

## 5. 데이터 파일

GDD §6, §7, §11, §12의 표를 **그대로** JSON으로 옮긴다. 대사 원문은 GDD에서 복사한다(다듬지 말 것). 예시:

```json
// customers.json (일부)
[{
  "id": "baek", "name": "백설", "shift": "dawn", "motif": "바람 위를 걷는 존재",
  "entranceNote": "매장 안 온도가 내려간다. 카운터에 올린 손끝마다 하얗게 서리가 맺혀 있다.", "greetPref": "quiet",
  "category": "apparel", "color": "white", "budget": 5000000,
  "mentionsPrice": false, "occasionIsGift": false,
  "traits": { "frostHands": true },
  "specialPayment": { "label": "녹지 않는 서리 한 병", "amount": 4400000 },
  "sprite": { "hair": "long", "hairColor": "paper", "skin": "skin-a", "outfit": "paper", "accent": "steel" },
  "lines": { "opening": "문자 고마워요. 늘 고마워요.", "openingUninvited": "문자를… 안 주셨더라고요. 그래서 제가 왔어요.", "...": "..." }
}]
```

손님 도트 파라미터 제안:
| 손님 | 머리 | 머리색 | 옷 | 액센트 |
|---|---|---|---|---|
| 한여름 | bob | hair | shadow 원피스 | rose 머리핀 |
| 강도윤 | slick | ink | shadow 수트 | brass 손목시계 (늘 보는 습관) |
| 진영숙 | bun | bone(은발) | shadow 상복 | paper 진주 목걸이(알 하나 빠짐) |
| 마시 씨 | 젖어 붙은 짧은 머리 | stone | dusk 정장, 소매에서 물방울 | steel 큰 눈(깜빡이지 않음), 목 옆 아가미 선 1줄 |
| 얼굴 없는 여자 | long, 얼굴을 가림 | ink | **rose 코트** (새벽 매장에서 유일하게 넓은 색 면적) | ash 손가락 |
| 백설 | long | paper | paper | steel 눈, 카운터 위 손끝에 steel 서리 도트, 손 주변 카운터 유리에 성에 |

> 팔레트는 24색 고정이다(DESIGN_SYSTEM §3-1). 색을 추가하지 않는다. 포인트 색(rose/brass/steel/wine)은 손님 한 명당 1~2곳에만 쓴다.

## 6. 렌더러

- `loop.ts`: 고정 타임스텝 1/60초. `update(dt)`에서 애니메이션 타이머를 돌리고, `render()`는 오프스크린 320×180 버퍼에 그린 뒤 화면 캔버스로 복사한다.
- 정적인 배경은 처음 한 번만 오프스크린에 굽는다. 매 프레임 다시 그리는 건 샹들리에, 진열 글로우, 손님, 효과뿐이다.
- **mood 팔레트**: 그리기 함수는 hex가 아니라 **팔레트 키**(`'rose'`)를 받는다. `palette.resolve(key, mood)`가 실제 색을 돌려준다. `breach`일 때는 밝기에 따라 키를 `ink` 또는 `wine`으로 바꾸고, 가장 밝은 키만 `paper`로 남긴다. 이렇게 하면 팔레트 스왑이 셰이더 없이 된다. 유니티에서는 팔레트 LUT 셰이더 하나로 옮기면 된다.
- 거울: 배경 장식일 뿐 **아무것도 비추지 않는다**(반사 렌더링 없음). 유리 하이라이트 사선 2줄만 그린다.
- 크리처(D5~D8)는 손님별 전용 그리기 함수와 위치를 쓴다(`CUSTOMERS.md` §7).
- **상품 아이콘 (`productIcon.ts`) — 컨셉 아트를 32×32로 옮기는 규칙**
  - 참고 이미지: `docs/concept/v2-items-afternoon-*.png`, `docs/concept/v2-items-dawn-*.png`. 컨셉 아트는 고해상도라 그대로 축소하면 뭉개진다. **베끼지 말고 번역한다.**
  - 아이콘마다 **실루엣 1개 + 핵심 특징 1~2개**만 그린다. 32×32에서 핵심 특징은 최소 4×4 도트 크기로 키운다. 작은 디테일 여러 개보다 큰 특징 하나가 낫다.
  - 실루엣이 먼저다. 색을 빼고 `ink` 한 색으로 칠해도 무슨 물건인지 알아볼 수 있어야 한다(오후 아이콘의 통과 기준).
  - 새벽 아이콘은 같은 부서의 오후 아이콘과 **실루엣을 비슷하게** 시작해서 핵심 특징으로 뒤튼다. 교대가 바뀔 때 "같은 진열인데 물건이 변했다"는 느낌을 주기 위해서다.
  - 색은 Dusk Mono 16 안에서만 쓴다. 포인트 색은 아이콘 하나에 1색까지.
  - 상품 카드(64×64 표시)와 진열장(장면 안 16×16 축소판)이 같은 원본을 쓴다. 16×16 축소판은 핵심 특징 1개만 남긴다.

  **새벽 아이콘 핵심 특징 표**
  | ID | 실루엣 | 핵심 특징 (꼭 남길 것) | 버려도 되는 디테일 |
  |---|---|---|---|
  | `inner_bag` | 손잡이 달린 핸드백 | 입구 전체를 채운 **눈알 하나** + 위아래 **이빨 줄** | 가죽 주름 |
  | `weeping_clutch` | 납작한 클러치 (rose) | 덮개의 **감긴 눈꺼풀 + 속눈썹 줄**, 눈물 2방울 | 개구리 입 잠금쇠 디테일 |
  | `bone_purse` | 동전 지갑 (paper) | 벌린 **이빨 줄**과 늘어진 **혀** (혀는 `rose` 아닌 `ash`) | 잇몸 |
  | `empty_box` | 뚜껑 열린 상자 | 안쪽 **동심 사각형 3겹**(계단처럼 깊어짐), 가장 안쪽은 `ink` | 상자 질감 |
  | `warm_memory_glove` | 장갑 한 켤레 (paper) | 손등에 비치는 **뼈 선**, 손끝 `steel` 서리 도트 | 니트 결 |
  | `nameless_glove` | 손목 커프 + 손 (shadow) | **너무 긴 손가락**(몸통의 2배), 마디마다 1도트 끊김 | 커프 단추 |
  | `stage_cloak` | 세운 깃의 망토 (brass) | 안감의 **하얀 가면 얼굴 3~4개**(눈 2도트씩) | 술 장식, 해진 구멍 |
  | `shadow_scarf` | 흉상 + 스카프 (shadow) | 흉상 뒤 **팔을 치켜든 그림자**(`dusk`) | 흉상 얼굴 |
  | `breathing_pearl` | 목걸이 + 원형 펜던트 | 펜던트가 **눈알**(`steel` 홍채), 양옆 **아가미 3줄** | 진주 체인 알 |
  | `drowned_choker` | 띠형 초커 (shadow) | **따개비 원 3~4개**와 그 사이 **촉수 2가닥** | 물방울 |
  | `backward_watch` | 회중시계 (paper 판) | 바늘이 **뼈 손가락 하나**, 숫자 자리 **이빨 4개**(12·3·6·9시만) | 체인, 뚜껑 |
  | `voice_locket` | 열린 하트 로켓 (rose) | 안쪽의 **입술** | 체인 |

  오후 아이콘은 같은 방식으로 실루엣 + 금속 장식 1~2도트만 그린다(토트의 잠금쇠, 숄더백의 체인, 시계의 다이얼 등).
- 새벽 손님의 이상한 특징(깜빡이지 않는 눈, 얼굴 없음, 서리 맺힌 손, 많은 손가락)은 **숨기지 않고 처음부터 그린다.** 정체를 가려내는 숨은 단서는 없다.
- **부서 배치**: 한 화면에 세 부서를 둔다. 뒷벽 선반 = 가방, 양쪽 마네킹과 행거 = 의류, 앞쪽 유리 카운터 = 파인주얼리. 손님이 입장하면 자기 부서 쪽으로 2초간 고개를 돌린다(첫 힌트).
- **교대 전환**: 오후 진열은 GDD §12-1 상품, 새벽 진열은 GDD §12-2 아이템이다. 새벽에는 샹들리에를 끄고 카운터 스탠드 하나만 켠다(빛 반경 밖은 무채색 한 단계 어둡게). 새벽 기본 mood는 `uneasy`다.
- **보이는 범위**: 사람형 손님은 카운터 뒤 상체와 카운터 위에 올린 손만 보인다. 특징은 반드시 이 범위(얼굴·머리·상체·손·카운터 상판)에 그린다.
- 마시 씨가 있는 동안 카운터 상판에 물이 고인다(steel 하이라이트 1도트씩 번짐).
- 마네킹: `dread` 이상이면 왼쪽 마네킹 머리가 돌아가고, `collapse`면 머리가 단발(서윤)로 바뀐다.
- 출입문 실루엣: `closingText`(04:44) 단계에서만 그린다.
- 효과(`effects.ts`): `flicker`(샹들리에 밝기, 최소 간격 350ms), `scanlines`(짝수 줄 `ink` 20%), `shake`(±2px, 300ms), `breach`(1.2초). `prefers-reduced-motion`이면 shake와 flicker를 끈다.

### 6-1. 손님 스프라이트 (컨셉 아트 기반)
- 사람 모습 손님 12명은 코드로 그리지 않고 **캐릭터 시트 이미지**에서 만든다. 그림체를 컨셉 아트와 같게 맞추기 위해서다. 배경, 크리처 4종, 상품 아이콘은 계속 코드로 그린다.
- 원본: `docs/concept/sheets/sheet-{a,b,c}-open.png`(4명씩 같은 크기·구도·얼굴 구조로 한 장에 그린 시트), `-closed.png`(눈만 감은 같은 시트), `-alpha.png`(배경 제거 알파).
- 변환: `python3 tools/import_customer_sprites.py` → `public/art/customers/<id>.png`, `<id>.blink.png`(눈 감은 프레임에서 달라진 픽셀만), `manifest.json`(장면 좌표, 숨쉬기 분할선). 모든 시트를 같은 배율로 줄여 도트 밀도를 통일한다. 색은 매장 팔레트(Dusk Mono 24)에 Lab 거리로 맞추고(포인트 색은 원본 채도가 충분할 때만), 고립 잡티를 지우고, 바깥 테두리를 한 단계 어둡게(sel-out) 둘러 배경과 같은 도트 질감으로 만든다.
- 새 손님을 추가할 때는 기존 시트를 참고 이미지로 넣어 같은 형식의 시트를 만들고, 스크립트의 `SHEET_IDS`에 등록한다.
- **대기 동작(라이브2D 느낌)**: 2.5~5.5초마다 0.12초 눈 깜빡임, 3.2초 주기로 상체 1도트 숨쉬기(카운터 위 손은 고정). 마시 씨(눈꺼풀 없음), 얼굴 없는 여자, 가면 배우는 깜빡이지 않는다. `prefers-reduced-motion`이면 숨쉬기를 끈다.
- mood가 calm이 아니면 스프라이트 픽셀을 가장 가까운 팔레트 키로 보고 장면과 같은 mood 규칙으로 바꾼다(`src/render/sprites.ts`).
- 스프라이트를 못 불러오면 그 손님은 코드로 그린 도트로 대체된다.

## 7. UI

- `bridge.ts`: `Game`을 감싼다. `dispatch` → 이벤트 큐 → 각 UI 모듈과 렌더러에 순서대로 전달한다. 대사 이벤트는 사용자가 넘길 때까지 큐를 멈춘다.
- 선택지는 `game.availableActions()`로 만든다. 니즈 파악 단계에서 이미 쓴 질문은 disabled로 둔다(툴팁 "이미 물어봤어요").
- 선택지 문구, 시스템 메시지, 빈 상태 문구는 모두 `strings.ko.json`에 둔다. 코드에 한국어를 하드코딩하지 않는다.
- 레이아웃, 상태, 키 매핑은 `DESIGN_SYSTEM.md` §7~9를 그대로 따른다.
- 정산 직후 자동 저장한다. 성공과 실패를 정직하게 표시한다(§8 표).

## 8. 저장 형식

```ts
interface SaveV1 { version: 1; day: number; playerName: string; totalRevenue: number;
  dawnLedger: GameState['dawnLedger']; regulars: GameState['regulars']; savedAtClock: string; }
interface StorageAdapter { load(): SaveV1 | null | 'corrupt'; save(s: SaveV1): boolean; }
```
키는 `closing-time.save.v1`. `save()`는 예외를 잡아 `false`를 돌려준다. 버전 필드로 나중에 마이그레이션한다.

## 9. 테스트 (Vitest) — 통과 기준

1. **전체 플레이 시나리오**: 코드로 1일차 정답 루트를 끝까지 진행한다. 오후 문자는 kang=new_arrival, jin=private, 새벽 문자는 marsh=dawn_offer, baek=dawn_name이다. 애프터케어는 오후 `thanks` 2통(한여름, 진영숙), 새벽 `dawn_thanks` 2통(백설, 마시 씨)이다. 판매 6건, 매너 실수 0, 수칙 위반 0, 감사 문자 4통, 등급 S가 나와야 한다.
2. 수칙 판정 단위 테스트: `rules.json`의 판정 가능한 수칙 10개(1~5, 7~11) 각각 × (위반 / 비위반). 같은 `askBudget`이 오후에는 `manner`, 새벽에는 규칙 2, 문 밖의 손님에게는 **필수**인지 확인.
3. 문자 판정: 선호·중립·비선호·미발송·`baek` 예외·`zero` 평정심·교대별 발송 한도(2/2).
4-2. 고객 관리: 감사 문자 당일/다음 날 점수 차이, 기념일 정확/오류, 과잉 연락, 2일 방치 감소, 등급 경계(2·5·10), 새벽 금기(배우 `occasion`, 문 밖의 손님 모든 문자), 백설 미감사 → 다음 새벽 방문 예약. 고객 카드의 모르는 칸이 0이나 빈 문자열이 아니라 `undefined`인지 확인.
4-1. 교대 분리: 오후 손님에게 새벽 상품이 제안되지 않는다. 오후에는 평정심이 바뀌지 않는다.
4. `pickOffers`: 같은 시드면 같은 결과가 나오고, 매칭 상품이 항상 포함된다.
5. 평정심 0이면 배드엔딩으로 넘어간다.
6. 저장: 왕복(save → load)이 일치하고, 손상된 JSON은 `'corrupt'`를 돌려준다.
7. 경계 검사: `src/core/**`에 `document`, `window`, `HTMLElement`, `CanvasRenderingContext2D` 문자열이 없어야 한다(grep 테스트).

## 10. 마일스톤 (순서대로, 각각 커밋)

| # | 내용 | 완료 기준 |
|---|---|---|
| M0 | 스캐폴드: `index.html`, 글꼴, 토큰 CSS, stage 스케일링, 로딩 화면 | `npm run dev`로 640×360 무대가 정수배로 뜨고 Galmuri가 적용된다 |
| M1 | `core/` 전부 + `data/` + 테스트 | `npm test` 전부 통과 (§9) |
| M2 | 렌더러: 오후/새벽 배경, 손님 6명 도트, 상품 아이콘 26종(오후 14, 새벽 12) | 디버그 키 `F1`로 손님 순환, `F2`로 교대 전환하며 스크린샷을 확인한다. 디버그 키 `F3`으로 아이콘 26종을 64×64와 16×16으로 나란히 띄워, 위 표의 핵심 특징이 16×16에서도 보이는지 확인한다 |
| M3 | UI: 타이틀·이름 입력, HUD, 대화창, 선택지, 단계 표시, 하트, 수칙 쪽지, 상품 카드 | 문자 단계를 건너뛰고 손님 응대를 마우스와 키보드로 끝까지 할 수 있다 |
| M4 | 업무폰: 오후 명부와 검은 수첩, 영업·관리 문자, 고객 카드, 답장 선택, 애프터케어, 휴게 전환, 04:44 문자 이벤트 | GDD §3, §6, §6-2, §9가 화면에서 그대로 동작한다 |
| M5 | 공포 연출: mood 단계, 위반 이벤트, 배드엔딩 | 일부러 위반하는 루트로 확인. reduced-motion에서 흔들림이 없다 |
| M6 | 정산서, 저장·이어하기, 2일차 예고 | 저장 실패를 흉내 내면(localStorage 차단) 실패 토스트가 뜬다 |
| M7 | `impeccable`로 다듬기 | 사용자 지침. 깨진·낡은 연출은 의도이므로 "고치지" 않는다 |

## 11. 유니티 이식 대비

| 웹 | 유니티 |
|---|---|
| `core/*.ts` | 같은 이름의 C# 클래스. `Game.Dispatch(Action) → List<GameEvent>` 시그니처를 유지 |
| `data/*.json` | 그대로 `Resources/` 또는 Addressables에 두고 `JsonUtility`로 로드. 필요하면 ScriptableObject로 변환 |
| `render/palette.ts` 팔레트 키 | 팔레트 LUT 텍스처 + 스왑 셰이더 |
| 코드로 그린 도트 | 같은 함수로 PNG를 내보내는 `npm run export-sprites` 스크립트를 나중에 추가 → Sprite 임포트 (PPU 1, Point 필터) |
| 640×360 stage, 320×180 장면 | Pixel Perfect Camera, Reference Resolution 320×180 |
| DOM UI | UI Toolkit (USS가 CSS와 비슷해 토큰을 옮기기 쉽다) |
| Vitest 시나리오 | NUnit으로 같은 시나리오를 옮겨서 동작이 같은지 검증 |
