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
    palette.ts             # Candy Noir 24 + mood별 팔레트 맵
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
export type Category = 'bag' | 'watch' | 'jewelry' | 'scarf' | 'glove' | 'wallet';
export type Color = 'beige' | 'pink' | 'black' | 'white';
export type GreetStyle = 'warm' | 'quiet' | 'direct';
export type ProbeId = 'askCategory' | 'askOccasion' | 'askBudget' | 'observe';
export type CloseId = 'tryOn' | 'boxRed' | 'boxGold' | 'checkout';
export type TemplateId = 'new_arrival' | 'private' | 'greeting';
export type RuleId = 1 | 2 | 3 | 4;
export type Mood = 'calm' | 'uneasy' | 'dread';

export interface Product { id: string; name: string; category: Category; color: Color; price: number; }

export interface CustomerDef {
  id: string; name: string; isAnomaly: boolean;
  greetPref: GreetStyle;
  category: Category | 'any'; color: Color | null; budget: number | null;
  mentionsPrice: boolean; occasionIsGift: boolean;
  traits: { noReflection?: boolean; wantsAnything?: boolean; extraFingers?: boolean };
  specialPayment?: { label: string; amount: number };
  sprite: SpriteParams;
  lines: {
    opening: string; openingUninvited?: string;
    askCategory: string; askOccasion: string; askBudget: string;
    observe: string; success: string; fail: string;
    violation: Partial<Record<RuleId, string>>;   // 위반 시 대사
  };
}

export interface ContactDef {
  id: string; name: string; memo: string; memoStruck?: string;
  customerId: string | null;          // 방문하는 손님 id (zero, oh는 null)
  prefers: TemplateId | null; dislikes: TemplateId | null;
  comesUninvited?: boolean;           // baek
  composureOnSend?: number;           // zero: -5
  replies: { prefer?: string; neutral?: string; dislike?: string; any?: string };
}

export interface ScheduleSlot { time: string; customerId: string; condition: 'always' | 'invited' | 'invitedElse'; altTime?: string; }

export type Phase =
  | { kind: 'title' } | { kind: 'briefing' } | { kind: 'texting' }
  | { kind: 'encounter'; slotIndex: number; enc: EncounterState }
  | { kind: 'between'; nextSlotIndex: number }
  | { kind: 'closingText' } | { kind: 'results' } | { kind: 'badEnding' };

export interface EncounterState {
  customerId: string;
  step: 'greet' | 'probe' | 'propose' | 'close' | 'regularOffer' | 'done';
  affinity: number;
  probesUsed: ProbeId[];              // 최대 2개
  offered: string[];                  // 상품 3개 id
  chosenProductId: string | null;
  violated: RuleId[];
  outcome: 'pending' | 'sold' | 'walked' | 'horror';
}

export interface GameState {
  version: 1; day: number; seed: number; playerName: string;
  clock: string;                      // "HH:MM"
  revenue: number; salesCount: number; composure: number;
  violations: number;
  regulars: { customerId: string; kind: 'human' | 'other' }[];
  texting: { sent: Record<string, TemplateId>; remaining: number };
  visitors: Record<string, { time: string; bonus: number }>; // 오늘 올 손님
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
  | { type: 'sendText'; contactId: string; template: TemplateId }
  | { type: 'finishTexting' }
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
  | { type: 'horror'; customerId: string | null; kind: 'breach' | 'blackout' }
  | { type: 'sale'; productId: string; amount: number; label?: string }
  | { type: 'regular'; customerId: string; kind: 'human' | 'other' }
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
- 수칙 판정(`rules.ts`)은 순수 함수로 둔다:
  - `checkProbe(c, probe)`: probe가 `askBudget`이고 `!c.mentionsPrice`이면 규칙 2 위반
  - `checkClose(c, choice)`: `tryOn`이고 `traits.noReflection`이면 규칙 1, `traits.wantsAnything`이고 choice가 `boxRed`가 아니면 규칙 4
  - 마감 답장 → 규칙 3
- 위반 처리: 사람 손님이면 GDD 표대로 처리하고 응대를 계속한다. 이상 손님이면 `horror` 이벤트를 보내고 `outcome='horror'`로 즉시 응대를 끝낸다.
- 손님별 위반 대사는 `lines.violation[rule]`에서 가져온다. 없으면 `strings.ko.json`의 기본값을 쓴다.
- 상품 3장 구성(`pickOffers`): GDD §5-3 규칙. 후보가 여럿이면 시드 RNG로 고르고 순서도 섞는다. 해당 후보가 없으면(예: 색 다른 같은 품목이 없음) 다른 품목으로 채운다. `wantsAnything`이면 무작위 3장.
- 이상 손님 성공: 특수 지불 금액을 매출에 더하고 `sale` 이벤트의 `label`에 지불 수단 이름을 넣는다. 그다음 `regularOffer` 단계로 간다.
- 평정심이 0이 되면 어느 단계에서든 `badEnding`으로 넘어간다.
- 시각: 각 손님 슬롯 시각으로 `clock` 이벤트를 보낸다. 백설 `invitedElse`: 초대받았으면 `time`, 아니면 `altTime`.

## 5. 데이터 파일

GDD §6, §7, §11, §12의 표를 **그대로** JSON으로 옮긴다. 대사 원문은 GDD에서 복사한다(다듬지 말 것). 예시:

```json
// customers.json (일부)
[{
  "id": "baek", "name": "백설", "isAnomaly": true, "greetPref": "quiet",
  "category": "glove", "color": "white", "budget": 1500000,
  "mentionsPrice": false, "occasionIsGift": false,
  "traits": { "noReflection": true },
  "specialPayment": { "label": "눈송이 모양 수표", "amount": 6000000 },
  "sprite": { "hair": "long", "hairColor": "silk-50", "skin": "skin-a", "outfit": "silk-50", "accent": "cyan-400" },
  "lines": { "opening": "문자 고마워요. 늘 고마워요.", "openingUninvited": "문자를… 안 주셨더라고요. 그래서 제가 왔어요.", "...": "..." }
}]
```

손님 도트 파라미터 제안:
| 손님 | 머리 | 머리색 | 옷 | 액센트 |
|---|---|---|---|---|
| 한여름 | bob | 갈색(`skin-b`를 어둡게 쓰지 말고 팔레트에 `hair-brown #5a3426` 추가) | mint-400 카디건 | pink-300 머리핀 |
| 강도윤 | slick | ink-950 | onyx-800 수트 | gold-400 시계 |
| 분홍 코트 | long, 얼굴을 가림 | pink-500 | pink-500 코트 | blood-500 립 |
| 진영숙 | bun | silk-50(은발) | plum-700 | 진주 목걸이(알 하나 빠짐) |
| 백설 | long | silk-50 | silk-50 | cyan-400 눈 |

> 팔레트에 색을 추가하면 `palette.ts`와 `tokens.css` 두 곳 모두에 넣는다.

## 6. 렌더러

- `loop.ts`: 고정 타임스텝 1/60초. `update(dt)`에서 애니메이션 타이머를 돌리고, `render()`는 오프스크린 320×180 버퍼에 그린 뒤 화면 캔버스로 복사한다.
- 정적인 배경은 처음 한 번만 오프스크린에 굽는다. 매 프레임 다시 그리는 건 샹들리에, 진열 글로우, 손님, 거울 반사, 효과뿐이다.
- **mood 팔레트**: 그리기 함수는 hex가 아니라 **팔레트 키**(`'pink-500'`)를 받는다. `palette.resolve(key, mood)`가 실제 색을 돌려준다. `breach`일 때는 밝기에 따라 키를 `blood-500` 또는 `cyan-400`으로 바꾼다. 이렇게 하면 팔레트 스왑이 셰이더 없이 된다. 유니티에서는 팔레트 LUT 셰이더 하나로 옮기면 된다.
- 거울 반사: 거울 영역에 손님을 50% 크기로 좌우 반전하고 `mint-200`을 25% 섞어 그린다. `noReflection`이면 반사를 그리지 않는다. 플레이어가 관찰하지 않아도 거울을 보면 알 수 있다 — **의도된 단서**다.
- 마네킹: `uneasy` 이상이면 왼쪽 마네킹 머리가 돌아가고, `dread`면 머리가 단발(서윤)로 바뀐다.
- 출입문 실루엣: `closingText` 단계에서만 그린다.
- 효과(`effects.ts`): `flicker`(샹들리에 밝기, 최소 간격 350ms), `scanlines`(짝수 줄 `ink-950` 20%), `shake`(±2px, 300ms), `breach`(1.2초). `prefers-reduced-motion`이면 shake와 flicker를 끈다.

## 7. UI

- `bridge.ts`: `Game`을 감싼다. `dispatch` → 이벤트 큐 → 각 UI 모듈과 렌더러에 순서대로 전달한다. 대사 이벤트는 사용자가 넘길 때까지 큐를 멈춘다.
- 선택지는 `game.availableActions()`로 만든다. 니즈 파악 단계에서 이미 쓴 질문은 disabled로 둔다(툴팁 "이미 물어봤어요").
- 선택지 문구, 시스템 메시지, 빈 상태 문구는 모두 `strings.ko.json`에 둔다. 코드에 한국어를 하드코딩하지 않는다.
- 레이아웃, 상태, 키 매핑은 `DESIGN_SYSTEM.md` §7~9를 그대로 따른다.
- 정산 직후 자동 저장한다. 성공과 실패를 정직하게 표시한다(§8 표).

## 8. 저장 형식

```ts
interface SaveV1 { version: 1; day: number; playerName: string; totalRevenue: number;
  regulars: GameState['regulars']; savedAtClock: string; }
interface StorageAdapter { load(): SaveV1 | null | 'corrupt'; save(s: SaveV1): boolean; }
```
키는 `closing-time.save.v1`. `save()`는 예외를 잡아 `false`를 돌려준다. 버전 필드로 나중에 마이그레이션한다.

## 9. 테스트 (Vitest) — 통과 기준

1. **전체 플레이 시나리오**: 코드로 1일차 정답 루트를 끝까지 진행한다. 판매 5건, 위반 0, 등급 S가 나와야 한다.
2. 수칙 판정 단위 테스트: 4개 수칙 × (위반 / 비위반).
3. 문자 판정: 선호·중립·비선호·미발송·`baek` 예외·`zero` 평정심.
4. `pickOffers`: 같은 시드면 같은 결과가 나오고, 매칭 상품이 항상 포함된다.
5. 평정심 0이면 배드엔딩으로 넘어간다.
6. 저장: 왕복(save → load)이 일치하고, 손상된 JSON은 `'corrupt'`를 돌려준다.
7. 경계 검사: `src/core/**`에 `document`, `window`, `HTMLElement`, `CanvasRenderingContext2D` 문자열이 없어야 한다(grep 테스트).

## 10. 마일스톤 (순서대로, 각각 커밋)

| # | 내용 | 완료 기준 |
|---|---|---|
| M0 | 스캐폴드: `index.html`, 글꼴, 토큰 CSS, stage 스케일링, 로딩 화면 | `npm run dev`로 640×360 무대가 정수배로 뜨고 Galmuri가 적용된다 |
| M1 | `core/` 전부 + `data/` + 테스트 | `npm test` 전부 통과 (§9) |
| M2 | 렌더러: 배경, 손님 5명 도트, 거울 반사, 상품 아이콘 | 디버그 키 `F1`로 손님을 순환하며 스크린샷을 확인한다 |
| M3 | UI: 타이틀·이름 입력, HUD, 대화창, 선택지, 단계 표시, 하트, 수칙 쪽지, 상품 카드 | 문자 단계를 건너뛰고 손님 응대를 마우스와 키보드로 끝까지 할 수 있다 |
| M4 | 업무폰: 명부, 발송, 답장, 마감 문자 이벤트 | GDD §6, §9가 화면에서 그대로 동작한다 |
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
