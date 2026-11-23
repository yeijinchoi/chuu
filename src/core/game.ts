import {
  ackShiftBreak, advanceFromEncounter, beginBriefing, beginTexting, doClosingText, finishAftercare,
  finishTexting, initTexting, rollToNextDay,
} from './dayFlow';
import { makeLookups, str, type Ctx } from './ctx';
import {
  doClose, doGreet, doProbe, doPropose, doRegularOffer, stageChoices,
} from './encounter';
import {
  canPlaceRedBox, careBlock, checkSendCare, checkSendText, doChooseReply, doPlaceRedBox, doSendCare, doSendText, textBlock,
  type BlockReason,
} from './texting';
import type {
  Action, CareTemplateId, GameData, GameEvent, GameState, SaveV1, StorageAdapter,
} from './types';

const DEFAULT_SEED = 20240101;

function initialState(data: GameData): GameState {
  const d = data.days[1];
  return {
    version: 1, day: 1, seed: DEFAULT_SEED, playerName: '',
    shift: 'afternoon', clock: d?.clocks.afternoonBriefing ?? '12:30',
    revenue: 0, totalRevenue: 0, dawnLedger: [], salesCount: 0,
    composure: d?.startComposure ?? 100, mannerSlips: 0, violations: 0, thanksSent: 0,
    newRegulars: [], cards: {},
    texting: {
      afternoon: { sent: {}, remaining: d?.texting.afternoon.total ?? 0, salesSent: 0 },
      dawn: { sent: {}, remaining: d?.texting.dawn.total ?? 0, salesSent: 0 },
    },
    aftercareRemaining: 0, visitors: {}, slots: [], pendingUninvited: [], earlierSlots: {},
    pendingReplies: {}, redBoxDay: null, closingReplied: null, results: null,
    phase: { kind: 'title' }, log: [],
  };
}

/** UI와 코어 사이의 유일한 통로. 코어는 시간 흐름을 모른다. */
export class Game {
  private state: GameState;
  private readonly lookups: ReturnType<typeof makeLookups>;

  constructor(private readonly data: GameData, private readonly storage?: StorageAdapter) {
    this.state = initialState(data);
    this.lookups = makeLookups(data);
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  private makeCtx(out: GameEvent[]): Ctx {
    return {
      state: this.state, data: this.data, customers: this.lookups.customers, products: this.lookups.products,
      emit: (e) => {
        out.push(e);
        this.state.log.push(e);
      },
    };
  }

  /** 저장된 단골·누적 매출을 이어받아 다음 날 아침(오후 브리핑)으로 간다 */
  resume(save: SaveV1): GameEvent[] {
    const out: GameEvent[] = [];
    const s = this.state;
    s.playerName = save.playerName;
    s.day = save.day;
    s.totalRevenue = save.totalRevenue;
    s.cards = JSON.parse(JSON.stringify(save.regulars)) as GameState['cards'];
    s.pendingUninvited = [...(save.pendingUninvited ?? [])];
    s.earlierSlots = { ...(save.earlierSlots ?? {}) };
    rollToNextDay(this.makeCtx(out));
    return out;
  }

  dispatch(action: Action): GameEvent[] {
    const out: GameEvent[] = [];
    let ok = false;
    try {
      ok = this.apply(action, this.makeCtx(out));
    } catch (err) {
      console.warn('[core] action failed', action, err);
      ok = false;
    }
    if (!ok) {
      console.warn('[core] invalid action in phase', this.state.phase.kind, action);
      return [];
    }
    return out;
  }

  private apply(a: Action, ctx: Ctx): boolean {
    const s = this.state;
    const p = s.phase;
    switch (a.type) {
      case 'start': {
        if (p.kind !== 'title') return false;
        s.playerName = a.playerName.trim() || str(this.data, 'defaultPlayerName');
        s.seed = a.seed ?? (Date.now() >>> 0);
        s.texting = initTexting(ctx);
        beginBriefing(ctx, 'afternoon');
        return true;
      }
      case 'ackBriefing':
        if (p.kind !== 'briefing') return false;
        beginTexting(ctx, p.shift);
        return true;
      case 'ackShiftBreak':
        return ackShiftBreak(ctx);
      case 'sendText':
        return doSendText(ctx, a.contactId, a.template);
      case 'finishTexting':
        if (p.kind !== 'texting') return false;
        finishTexting(ctx, p.shift);
        return true;
      case 'sendCare':
        return doSendCare(ctx, a.customerId, a.template, a.productId);
      case 'chooseReply':
        return doChooseReply(ctx, a.customerId, a.option);
      case 'placeRedBox':
        return doPlaceRedBox(ctx);
      case 'finishAftercare':
        return finishAftercare(ctx, this.storage);
      case 'greet':
        return doGreet(ctx, a.style);
      case 'probe':
        return doProbe(ctx, a.probe);
      case 'propose':
        return doPropose(ctx, a.productId);
      case 'close':
        return doClose(ctx, a.choice);
      case 'regularOffer':
        return doRegularOffer(ctx, a.accept);
      case 'advance':
        return advanceFromEncounter(ctx);
      case 'closingText':
        return doClosingText(ctx, a.reply);
      case 'nextDay':
        if (p.kind !== 'results') return false;
        rollToNextDay(ctx);
        return true;
      default:
        return false;
    }
  }

  /** 문자 액션이 막힌 이유(보낼 수 있으면 null). UI가 비활성 사유를 보여 줄 때 쓴다. */
  blockReason(a: Action): BlockReason | null {
    const ctx = this.makeCtx([]);
    ctx.emit = () => undefined;
    if (a.type === 'sendText') return textBlock(ctx, a.contactId, a.template);
    if (a.type === 'sendCare') return careBlock(ctx, a.customerId, a.template, a.productId);
    return null;
  }

  /** UI 선택지 생성용, 테스트용 */
  availableActions(): Action[] {
    const s = this.state;
    const p = s.phase;
    const out: Action[] = [];
    const ctx = this.makeCtx([]); // 검증 전용: 이벤트는 버린다
    ctx.emit = () => undefined;
    switch (p.kind) {
      case 'title':
        out.push({ type: 'start', playerName: '' });
        break;
      case 'briefing':
        out.push({ type: 'ackBriefing' });
        break;
      case 'shiftBreak':
        out.push({ type: 'ackShiftBreak' });
        break;
      case 'texting':
      case 'aftercare': {
        if (p.kind === 'texting') {
          for (const c of this.data.contacts) {
            for (const t of this.data.templates.sales) {
              if (checkSendText(ctx, c.id, t.id)) out.push({ type: 'sendText', contactId: c.id, template: t.id });
            }
          }
        }
        for (const cust of this.data.customers) {
          for (const t of this.data.templates.care) {
            const tpl: CareTemplateId = t.id;
            if (tpl.endsWith('recommend')) {
              for (const prod of this.data.products) {
                if (checkSendCare(ctx, cust.id, tpl, prod.id)) {
                  out.push({ type: 'sendCare', customerId: cust.id, template: tpl, productId: prod.id });
                }
              }
            } else if (checkSendCare(ctx, cust.id, tpl)) {
              out.push({ type: 'sendCare', customerId: cust.id, template: tpl });
            }
          }
        }
        for (const id of Object.keys(s.pendingReplies)) {
          out.push({ type: 'chooseReply', customerId: id, option: 0 }, { type: 'chooseReply', customerId: id, option: 1 });
        }
        if (canPlaceRedBox(ctx)) out.push({ type: 'placeRedBox' });
        out.push(p.kind === 'texting' ? { type: 'finishTexting' } : { type: 'finishAftercare' });
        break;
      }
      case 'encounter': {
        const e = p.enc;
        const ch = stageChoices(e);
        if (e.step === 'greet') for (const style of ch.greet) out.push({ type: 'greet', style });
        else if (e.step === 'probe') for (const probe of ch.probes) out.push({ type: 'probe', probe });
        else if (e.step === 'propose') for (const productId of e.offered) out.push({ type: 'propose', productId });
        else if (e.step === 'close') for (const choice of ch.closes) out.push({ type: 'close', choice });
        else if (e.step === 'regularOffer') out.push({ type: 'regularOffer', accept: true }, { type: 'regularOffer', accept: false });
        else out.push({ type: 'advance' });
        break;
      }
      case 'closingText':
        out.push({ type: 'closingText', reply: true }, { type: 'closingText', reply: false });
        break;
      case 'results':
        out.push({ type: 'nextDay' });
        break;
      case 'between':
      case 'badEnding':
        break;
    }
    return out;
  }
}
