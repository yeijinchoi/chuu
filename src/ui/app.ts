import customersData from '../data/customers.json';
import { SCORE } from '../core/encounter';
import { Game } from '../core/game';
import { loadGameData } from '../core/gameData';
import { JsonStorageAdapter } from '../core/save';
import type { Action, GameEvent, GreetStyle, ProbeId, CloseId, Mood as CoreMood, EncounterState, CustomerDef } from '../core/types';
import type { Mood } from '../render/palette';
import type { Renderer } from '../render/renderer';
import type { SceneCueView } from '../render/scene';
import { Bgm } from './bgm';
import { Bridge, type EventSink, type Flow } from './bridge';
import { ChoicePanel, Dialogue, type ChoiceItem } from './dialogue';
import { DisplayPanel } from './display';
import { el, t } from './dom';
import { applyFrames } from './frames';
import { Notifier } from './notify';
import { Phone } from './phone';
import { sfx } from './sfx';
import { Shutter } from './shutter';
import { isOpeningSteps, openingScreen } from './opening';
import type { SheetId } from './sheets';
import { endingScreen, finalEndingScreen, nameScreen, noteScreen, resultsScreen, titleScreen, type Overlay } from './screens';
import type { Stage } from './stage';

const PROBES: ProbeId[] = ['askCategory', 'askOccasion', 'askBudget', 'observe'];
const GREETS: GreetStyle[] = ['warm', 'quiet', 'direct'];
const DRINKS: ('water' | 'chocolate' | 'none')[] = ['water', 'chocolate', 'none'];
const CLOSES: CloseId[] = ['tryOn', 'boxRed', 'boxGold', 'checkout'];
const STEPS: EncounterState['step'][] = ['greet', 'probe', 'propose', 'close'];
const STEP_KEYS = ['greet', 'probe', 'propose', 'close'] as const;
const BREACH_MS = 1200;
const TOAST_MS = 2000;
const TIP_MS = 8000;
/** 업무폰 안에서 일어나는 액션: 이 액션이 낳은 속마음·지문은 대화창 대신 폰 대화방에 놓인다 */
const PHONE_ACTIONS: ReadonlySet<Action['type']> = new Set(['sendText', 'sendCare', 'chooseReply', 'placeRedBox', 'closingText']);

const TROPHY_KEY = 'closing-time.trophies.v1';
function loadTrophies(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TROPHY_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
function saveTrophy(id: string): string[] {
  const all = loadTrophies();
  if (!all.includes(id)) all.push(id);
  try { localStorage.setItem(TROPHY_KEY, JSON.stringify(all)); } catch { /* 저장이 막혀도 게임은 계속된다 */ }
  return all;
}
/** 3일차 04:44의 서윤: 눈을 감은 단발의 업무 유니폼 */
const SEOYUN_SPRITE = { id: 'seoyun', form: 'humanoid', sprite: { hair: 'bob', hairColor: 'hair', skin: 'skin-a', outfit: 'shadow', accent: 'brass' } };

function safeStorage(): JsonStorageAdapter {
  return new JsonStorageAdapter({
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => localStorage.setItem(k, v),
  });
}

/** UI 전체를 조립하고 코어 이벤트로 구동한다. */
export function startApp(stage: Stage, renderer: Renderer, opts: { debug: boolean; reduced: boolean }): void {
  const data = loadGameData();
  const storage = safeStorage();
  const customers = customersData as unknown as (CustomerDef & { sprite: Record<string, string> })[];
  const html = document.documentElement;
  const game = new Game(data, storage);

  const dialogue = new Dialogue(opts.reduced);
  const choices = new ChoicePanel();
  const hud = el('div', 'hud');
  hud.hidden = true;
  const stepper = el('div', 'stepper');
  const hearts = el('div', 'hearts');
  hearts.setAttribute('role', 'img');
  hud.append(stepper, hearts);
  const toasts = el('div', 'toasts');
  toasts.setAttribute('role', 'status');
  const veil = el('div', 'veil');
  veil.hidden = true;
  stage.viewport.append(hud, veil);
  const serveNotif = new Notifier(stage.viewport, opts.reduced, 'notif--serve');
  // 대사창·선택지는 무대 바로 아래에 둔다: 데스크톱은 뷰포트 위에 겹치고, 모바일은 장면 아래로 흐른다(CSS)
  stage.stage.append(choices.root, dialogue.root, toasts);

  const bgm = new Bgm();
  document.body.append(bgm.button);
  const display = new DisplayPanel(stage.display);
  const shutter = new Shutter([stage.viewport, stage.frames.display]); // 교대 셔터: 장면·진열을 함께 가린다
  const mobile = (): boolean => stage.layout.mobile;
  let overlay: Overlay | null = null;
  const notes: string[] = [];
  let baseMood: Mood = 'calm';
  let lastSave: boolean | null = null;
  let phaseKey = '';
  let wantKey = '';
  let autoSheet: SheetId | null = null;
  let closingMode = false;
  const seen = new Set<string>();
  let breachTimer = 0;
  let toastTimer = 0;

  // ------------------------------------------------------------ 분위기·교대
  const setMood = (m: Mood): void => {
    renderer.setMood(m);
    html.dataset.mood = m;
    applyFrames(stage.root, m); // 무대와 "세로로 돌려 주세요" 안내가 함께 쓴다
    display.setMood(m);
    phone.setMood(m);
  };
  const setShift = (s: 'afternoon' | 'dawn'): void => {
    if (s === 'afternoon') shutter.set(false); // 새 날 오후·이어하기는 셔터가 올라간 매장에서 시작한다
    renderer.setShift(s);
    html.dataset.shift = s;
    display.setShift(s);
  };
  /** 날짜·사건으로 바뀐 배경(마네킹 배치·회색 장밋빛)과 마지막 밤의 돌아본 마네킹을 게임 상태에 맞춘다 */
  const syncScene = (): void => {
    const gs = game.getState();
    renderer.setLayout({ day: gs.day, roseGray: gs.flags?.['roseGray'] === true });
    renderer.setFinaleTurn(gs.phase.kind === 'finale');
  };
  /**
   * 대사에 맞춘 잠깐의 배경 연출. 데이터(customers.json scene)의 이름 → [대사가 시작될 때, "다시 보면"부터]
   * 예) "마네킹이 하나 늘어 있다. 다시 보면, 그대로다." → 하나 늘었다가 "다시"가 찍히는 순간 사라진다
   */
  const CUES: Record<string, [SceneCueView, SceneCueView | null]> = {
    extra_one_vanish: ['extra_one', null],
    extra_two_then_one: ['extra_two', 'extra_one'],
    all_turn_door_vanish: ['all_turn_door', null],
    uniform_added: ['uniform_added', 'uniform_added'],
  };
  let cueAfter: SceneCueView | null | undefined; // 다음 대사에서 "다시" 뒤에 바꿀 연출 (undefined = 없음)
  const startCue = (name: string): void => {
    const c = CUES[name];
    if (!c) return;
    renderer.setCue(c[0]);
    cueAfter = c[1];
  };
  /** 대사가 화면에 뜰 때: "다시" 글자까지 찍히면 다음 연출로 */
  const armCueAfter = (text: string): void => {
    if (cueAfter === undefined) return;
    const next = cueAfter;
    cueAfter = undefined;
    const i = text.indexOf('다시');
    dialogue.whenShown(i >= 0 ? i : text.length, () => renderer.setCue(next));
  };
  const clearCue = (): void => { cueAfter = undefined; renderer.setCue(null); };

  /** 토스트는 한 번에 하나: 새것이 옛것을 바꾼다 */
  const toast = (text: string, ms = TOAST_MS): void => {
    const n = el('div', 'toast', text);
    toasts.replaceChildren(n);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => n.remove(), ms);
  };
  /** 1일차 튜토리얼 말풍선: 문자 단계는 폰 위에, 응대 단계는 장면 위에. 한 번만 보이고 탭하면 사라진다. */
  /** 1일차 튜토리얼: 팁 알림으로 보낸다. 폰이 보이면 폰 안에, 아니면 장면 구석에 같은 모양으로 */
  const once = (key: string, text: string, where: 'phone' | 'serve'): void => {
    if (game.getState().day !== 1 || seen.has(key)) return;
    seen.add(key);
    phone.rememberTip(text);
    const phoneVisible = !mobile() || sheets.open === 'phone';
    if (where === 'phone' && phoneVisible) {
      serveNotif.hide();
      phone.showTip(text);
    } else {
      serveNotif.show({ app: 'tips', title: t('notify.tipSender'), body: text, stay: TIP_MS });
    }
  };
  const breach = (): void => {
    window.clearTimeout(breachTimer);
    setMood('breach');
    if (!opts.reduced) stage.stage.classList.add('shake');
    breachTimer = window.setTimeout(() => {
      setMood(baseMood);
      stage.stage.classList.remove('shake');
    }, BREACH_MS);
  };
  /** 블랙아웃 1.5초(스탠드까지 꺼짐). 04:44 답장이면 그 전에 실루엣이 유리에 손바닥을 댄다. */
  const blackout = (palm: boolean, done: () => void): void => {
    const go = (): void => {
      veil.hidden = false;
      window.setTimeout(() => {
        if (palm) renderer.setSilhouette(0, 0);
        if (game.getState().phase.kind !== 'badEnding') veil.hidden = true;
        done();
      }, 1500);
    };
    if (palm) {
      renderer.setSilhouette(1, 0, true);
      sfx.play('glass_tap');
      window.setTimeout(go, opts.reduced ? 100 : 700);
    } else go();
  };

  // ------------------------------------------------------------ 모바일 시트
  let bridge!: Bridge;
  const sheets = stage.sheets;
  const syncTabbar = (): void => {
    const open = sheets.open;
    for (const id of ['serve', 'display', 'phone'] as const) {
      const on = id === 'serve' ? open === null : open === id;
      stage.tabbar[id].setAttribute('aria-pressed', String(on));
    }
  };
  const showSheet = (id: SheetId): void => { if (mobile()) sheets.show(id); };
  sheets.onChange((open) => {
    phone.setVisible(!mobile() || open === 'phone');
    syncTabbar();
  });
  stage.tabbar.serve.addEventListener('click', () => sheets.close());
  stage.tabbar.display.addEventListener('click', () => sheets.toggle('display'));
  stage.tabbar.phone.addEventListener('click', () => sheets.toggle('phone'));
  stage.layout.onChange(() => phone.setVisible(!mobile() || sheets.open === 'phone'));

  const phone = new Phone(stage.phone, {
    game, data,
    dispatch: (a) => bridge.dispatch(a),
    busy: () => (bridge ? bridge.busy : false),
  }, {
    reduced: opts.reduced,
    mirror: stage.mStatus,
    onBadge: (on) => stage.tabbar.phone.classList.toggle('has-dot', on),
    onClosing: (reply) => { if (!reply) renderer.setSilhouette(0, 4); },
  });

  // ------------------------------------------------------------ 이벤트
  /** 이 이벤트의 속마음·지문은 폰 대화방에 놓아야 하는가 */
  const toPhone = (origin: Action | null): boolean =>
    game.getState().phase.kind !== 'badEnding' && (closingMode || (origin !== null && PHONE_ACTIONS.has(origin.type)));

  const sink: EventSink = {
    onEvent(e: GameEvent, origin: Action | null): Flow {
      switch (e.type) {
        case 'line':
          if (e.kind === 'note') { notes.push(e.text); return 'continue'; }
          if (notes.length) { showNote(); return 'retry'; }
          if (toPhone(origin)) { phone.addNote(e.text); return 'continue'; }
          showDialogue(speakerPlate(e.speaker), e.text, e.speaker ? 'speech' : 'narration');
          armCueAfter(e.text);
          return 'wait';
        case 'thought':
          if (notes.length) { showNote(); return 'retry'; }
          if (toPhone(origin)) { phone.addNote(`(${e.text})`); return 'continue'; }
          showDialogue(null, e.text, 'thought');
          return 'wait';
        case 'customerEnter': {
          const c = customers.find((x) => x.id === e.customerId);
          if (c) renderer.setCustomer({ id: c.id, form: c.form, sprite: c.sprite } as never);
          hud.hidden = false;
          if (game.getState().shift === 'afternoon') sfx.play('door_chime');
          return 'continue';
        }
        case 'sceneCue': startCue(e.cue); return 'continue';
        case 'customerLeave':
          clearCue();
          renderer.setCustomer(null);
          hud.hidden = true;
          if (e.outcome === 'sold') once('end', t('tutorial.end'), 'serve');
          return 'continue';
        case 'affinity': setHearts(e.value, e.delta); return 'continue';
        case 'composure': if (e.delta < 0) phone.hitBattery(e.delta); else phone.refresh(); return 'continue';
        case 'horror':
          if (e.kind === 'breach') { breach(); return 'continue'; }
          blackout(origin?.type === 'closingText', () => bridge.release());
          return 'wait';
        case 'violation': return 'continue';
        case 'mannerSlip': toast(t('toast.manner')); phone.pulse('notes'); return 'continue';
        case 'shift': syncScene(); setShift(e.shift); if (e.shift === 'dawn') phone.unlockDawnRules(); return 'continue';
        case 'mood': baseMood = e.mood as CoreMood; if (!breachTimer || html.dataset.mood !== 'breach') setMood(baseMood); return 'continue';
        case 'sale': toast(t('toast.sale', { amount: e.amount.toLocaleString('en-US') })); sfx.play('register'); phone.refresh(); return 'continue';
        case 'ledger': phone.refresh(); return 'continue';
        case 'regular': {
          const c = customers.find((x) => x.id === e.customerId);
          toast(t('toast.regular', { name: c?.name ?? '' }));
          return 'continue';
        }
        case 'cardUpdate':
          if (e.field !== 'purchases') {
            const key = String(e.field);
            toast(t('toast.cardRecorded', { field: t(`cardFieldNames.${key}`) }));
            phone.pulse('card');
          }
          phone.refresh();
          return 'continue';
        case 'relationship':
          if (e.delta !== 0 && origin && PHONE_ACTIONS.has(origin.type)) phone.deferNote(e.customerId, t(e.delta > 0 ? 'phone.rel.up' : 'phone.rel.down'));
          phone.refresh();
          return 'continue';
        case 'replyChoices': phone.refresh(); return 'continue';
        case 'phone':
          // 답장은 보냄 칩 뒤 1.5~3초에 온다. 04:44 문자는 줄마다 0.95초 간격으로 쌓인다.
          phone.deliver(e.from, e.text, closingMode ? 950 : 600 + 1500 + Math.random() * 1500, () => bridge.release());
          return 'wait';
        case 'clock': phone.refresh(); return 'continue';
        case 'clue': {
          const n = phone.noteClue(e.id);
          sfx.play('phone_buzz');
          const phoneVisible = !mobile() || sheets.open === 'phone';
          if (phoneVisible) { serveNotif.hide(); phone.noteBanner(t('notify.newMemo'), `${n.title}: ${n.body}`); }
          else serveNotif.show({ app: 'notes', title: t('notify.newMemo'), body: `${n.title}: ${n.body}`, stay: 5000 });
          return 'continue';
        }
        case 'ending': saveTrophy(e.ending); return 'continue';
        case 'phase': onPhase(e.phase); return 'continue';
        case 'save': lastSave = e.ok; if (!e.ok) toast(t('toast.saveFail'), 5000); return 'continue';
        case 'sfx':
          sfx.play(e.id);
          if (e.id === 'lights_off') {
            // 오후 영업 끝: 셔터가 다 내려온 뒤, 셔터 뒤에서 매장을 새벽으로 바꾼다 (쪽지 지문은 셔터 앞 대화창에 나온다)
            sfx.play('shutter_down');
            shutter.move(true, () => { setShift('dawn'); bridge.release(); });
            return 'wait';
          }
          if (e.id === 'cloth_pull' && shutter.isDown) {
            // 새벽 근무 시작: 셔터가 올라가 새벽 매장이 처음 보인 다음 "덮개 아래…" 지문이 이어진다
            sfx.play('shutter_up');
            shutter.move(false, () => bridge.release());
            return 'wait';
          }
          if (e.id === 'phone_buzz') phone.buzz();
          return 'continue';
        default: return 'continue';
      }
    },
    onIdle,
  };
  bridge = new Bridge(game, sink);

  function showDialogue(speaker: string | null, text: string, kind: 'speech' | 'narration' | 'thought'): void {
    if (mobile()) sheets.close(); // 시트가 대사를 가리지 않게
    dialogue.show(speaker, text, kind, () => bridge.release());
  }

  /** 괴물 손님은 말하는 방식을 이름표에 덧붙인다: "모퉁이의 개 · 업무폰 문자" */
  function speakerPlate(name: string | null): string | null {
    if (!name) return name;
    const via = customers.find((x) => x.name === name)?.speaksVia;
    return via && via !== 'voice' ? `${name} · ${t(`speaksVia.${via}`)}` : name;
  }

  /** 단계가 바뀌었다(이벤트 순서대로 불린다): 04:44는 폰이 강제로 열리고 문 유리의 실루엣이 짙어진다 */
  /** 장면에 맞는 곡: 오후 · 새벽 · 04:44(마지막 밤) · 타이틀·엔딩 */
  function syncBgm(kind: string): void {
    const gs = game.getState();
    if (kind === 'title' || kind === 'ending' || kind === 'badEnding') bgm.set('title');
    else if (kind === 'closingText' || kind === 'finale') bgm.set('finale');
    else bgm.set(gs.shift === 'dawn' ? 'dawn' : 'afternoon');
  }

  function onPhase(kind: string): void {
    syncBgm(kind);
    syncScene();
    const gs = game.getState();
    if (kind === 'briefing' && gs.shift === 'afternoon' && gs.day > 1) phone.newDay();
    if (kind === 'finale') { renderer.setCustomer(SEOYUN_SPRITE as never); hud.hidden = true; dialogue.hide(); }
    // 04:44 동안만 업무폰을 반쯤 올려 문 유리의 실루엣이 보이게 한다
    stage.phone.classList.toggle('is-half', kind === 'closingText');
    if (kind === 'closingText') {
      closingMode = true;
      dialogue.hide();
      choices.clear();
      phone.setClosing(true);
      renderer.setSilhouette(1, 4);
      showSheet('phone');
      autoSheet = 'phone';
    } else if (closingMode) {
      closingMode = false;
      phone.setClosing(false);
    }
    if (kind === 'badEnding') sheets.close();
  }

  function setHearts(value: number, delta: number): void {
    const n = Math.round(value / 20);
    hearts.replaceChildren();
    hearts.setAttribute('aria-label', `${t('a11y.hearts')} ${n}/5`);
    for (let i = 0; i < 5; i++) {
      const h = el('span', i < n ? 'heart heart--on' : 'heart', '♥');
      if (delta !== 0 && i === (delta > 0 ? n - 1 : n)) h.classList.add('heart--flash');
      hearts.append(h);
    }
  }

  function setStepper(step: EncounterState['step']): void {
    // 대접(serve)은 인사 단계 안에서 일어나는 일이라 인사 칸을 켠다
    const cur = step === 'regularOffer' ? 3 : step === 'serve' ? 0 : STEPS.indexOf(step);
    stepper.replaceChildren();
    stepper.setAttribute('aria-label', t('stepper.label'));
    STEP_KEYS.forEach((k, i) => {
      const s = el('span', `step ${i === cur ? 'step--now' : i < cur ? 'step--past' : 'step--next'}`, t(`stage_labels.${k}`));
      if (i === cur) s.setAttribute('aria-current', 'step');
      stepper.append(s);
    });
  }

  // ------------------------------------------------------------ 오버레이
  const showOverlay = (o: Overlay): void => { overlay?.close(); overlay = o; };
  const closeOverlay = (): void => { overlay?.close(); overlay = null; };

  function showNote(): void {
    const lines = notes.splice(0, notes.length);
    const dawn = game.getState().shift === 'dawn';
    let done = false;
    showOverlay(noteScreen(mobile() ? stage.stage : stage.viewport, {
      lines, dawn, action: t(dawn ? 'choices.briefing.dawn' : 'choices.briefing.afternoon'),
      onDone: () => { if (done) return; done = true; closeOverlay(); bridge.release(); },
    }));
  }

  function titleFlow(): void {
    const saved = storage.load();
    const canResume = saved !== null && saved !== 'corrupt';
    const begin = (): void => {
      let go = false;
      const startAs = (name: string): void => {
        if (go) return; go = true;
        closeOverlay();
        bridge.dispatch({ type: 'start', playerName: name });
      };
      // 오프닝(서윤의 문자 → 로즈의 연락 → 이름) 뒤 출근. 오프닝 글이 없으면 이름만 묻는다
      const steps = (data.strings as Record<string, unknown> & { opening?: { steps?: unknown } }).opening?.steps;
      if (isOpeningSteps(steps) && steps.length > 0) showOverlay(openingScreen(stage.stage, { steps, onDone: startAs }));
      else showOverlay(nameScreen(stage.stage, startAs));
    };
    const resume = (): void => {
      if (saved === null || saved === 'corrupt') return;
      closeOverlay();
      bridge.resume(saved);
    };
    showOverlay(titleScreen(stage.stage, { canResume, corrupt: saved === 'corrupt', trophies: loadTrophies(), onStart: begin, onResume: resume }));
    if (canResume && new URLSearchParams(location.search).get('continue') === '1') resume();
  }

  // ------------------------------------------------------------ 입력 UI
  function pickChoices(items: ChoiceItem[]): void {
    choices.set(items.map((it) => ({ ...it, pick: () => { if (!it.keep) choices.clear(); it.pick(); } })));
  }

  /** 지금 단계에서 자동으로 열려야 하는 시트와, 같은 단계에서 다시 열리지 않게 하는 키 */
  function wantedSheet(): { id: SheetId; key: string } | null {
    const p = game.getState().phase;
    if (p.kind === 'texting' || p.kind === 'aftercare') return { id: 'phone', key: `phone:${p.kind}:${p.shift}` };
    if (p.kind === 'closingText') return { id: 'phone', key: 'phone:closing' };
    if (p.kind === 'encounter' && p.enc.step === 'propose') return { id: 'display', key: `display:${p.slotIndex}` };
    return null;
  }

  /** 모바일: 문자·애프터케어·04:44에는 업무폰 시트가, 제안 단계에는 진열 시트가 자동으로 열리고 끝나면 닫힌다 */
  function syncSheets(): void {
    if (!mobile()) return;
    const want = wantedSheet();
    if (want === null) {
      if (autoSheet !== null && sheets.open === autoSheet) sheets.close();
      autoSheet = null;
      wantKey = '';
      return;
    }
    if (want.key !== wantKey) {
      wantKey = want.key;
      autoSheet = want.id;
      sheets.show(want.id);
    }
  }

  function onIdle(): void {
    syncScene();
    if (overlay) return;
    if (notes.length) { showNote(); return; }
    const s = game.getState();
    const p = s.phase;
    choices.clear();
    phone.refresh();
    phone.flushNotes();
    const key = `${p.kind}|${'shift' in p ? p.shift : ''}|${s.day}`;
    const entering = key !== phaseKey;
    phaseKey = key;
    if (p.kind !== 'encounter' && display.proposing) display.showCatalog();
    if (p.kind !== 'texting' && p.kind !== 'aftercare') phone.hideTip();
    syncSheets();
    switch (p.kind) {
      case 'briefing':
        pickChoices([{ label: t(p.shift === 'dawn' ? 'choices.briefing.dawn' : 'choices.briefing.afternoon'), pick: () => bridge.dispatch({ type: 'ackBriefing' }) }]);
        break;
      case 'shiftBreak':
        pickChoices([{ label: t('choices.shiftBreak'), pick: () => bridge.dispatch({ type: 'ackShiftBreak' }) }]);
        break;
      case 'texting':
        dialogue.hide();
        if (entering) {
          if (p.shift === 'dawn') phone.openApp(); else phone.openHome(); // 오후: 홈 화면(S01)에서 연락처 앱을 연다
          once('texting', t('tutorial.texting'), 'phone');
        }
        break;
      case 'aftercare':
        dialogue.hide();
        if (entering) { phone.openTab('contacts'); once('aftercare', t('tutorial.aftercare'), 'phone'); }
        break;
      case 'closingText':
        // 선택지는 폰 안에 있다(답장한다 / 폰을 엎어 둔다)
        dialogue.hide();
        break;
      case 'encounter':
        encounterUi(p.enc);
        break;
      case 'results':
        sheets.close();
        dialogue.hide();
        toasts.replaceChildren();
        showOverlay(resultsScreen(stage.stage, {
          result: s.results as NonNullable<typeof s.results>, data, day: s.day, saved: lastSave, clock: s.clock,
          onNext: () => { closeOverlay(); bridge.dispatch({ type: 'nextDay' }); },
          onRestart: () => location.reload(),
        }));
        break;
      case 'finale': {
        dialogue.hide();
        const acts = game.availableActions().flatMap((a) => (a.type === 'finale' ? [a.choice] : []));
        pickChoices(acts.map((choice) => ({ label: t(`choices.finale.${choice}`), pick: () => bridge.dispatch({ type: 'finale', choice }) })));
        break;
      }
      case 'ending':
        dialogue.hide();
        veil.hidden = false;
        showOverlay(finalEndingScreen(stage.stage, { ending: p.ending, trophies: loadTrophies(), onRestart: () => location.reload() }));
        break;
      case 'badEnding': {
        dialogue.hide();
        veil.hidden = false;
        saveTrophy('bad');
        const can = storage.load();
        showOverlay(endingScreen(stage.stage, {
          onRestart: () => location.reload(),
          onLoad: can !== null && can !== 'corrupt' ? () => { location.search = '?continue=1'; } : null,
        }));
        break;
      }
      default:
        break;
    }
  }

  function encounterUi(e: EncounterState): void {
    setStepper(e.step);
    if (e.step === 'done') { hud.hidden = true; bridge.dispatch({ type: 'advance' }); return; }
    if (display.proposing && e.step !== 'propose') display.showCatalog();
    switch (e.step) {
      case 'greet':
        once('greet', t('tutorial.greet'), 'serve');
        pickChoices(GREETS.map((style) => ({ label: t(`choices.greet.${style}`), pick: () => bridge.dispatch({ type: 'greet', style }) })));
        break;
      case 'serve':
        once('serve', t('tutorial.serve'), 'serve');
        pickChoices(DRINKS.map((drink) => ({ label: t(`choices.serve.${drink}`), pick: () => bridge.dispatch({ type: 'serve', drink }) })));
        break;
      case 'probe':
        once('probe', t('tutorial.probe'), 'serve');
        pickChoices(PROBES.map((probe) => {
          const used = e.probesUsed.includes(probe);
          return { label: t(`choices.probe.${probe}`), disabled: used, reason: used ? t('choices.probeUsed') : undefined, pick: () => bridge.dispatch({ type: 'probe', probe }) };
        }));
        break;
      case 'propose':
        once('propose', t('tutorial.propose'), 'serve');
        if (!display.proposing) {
          display.showOffers(
            e.offered,
            (productId) => { display.showCatalog(); bridge.dispatch({ type: 'propose', productId }); },
            { left: SCORE.maxRerolls - e.rerolls, run: () => { display.showCatalog(); bridge.dispatch({ type: 'reroll' }); } },
          );
        }
        // 모바일: 시트를 닫았을 때 다시 열 수 있는 버튼
        if (mobile()) pickChoices([{ label: t('choices.openDisplay'), keep: true, pick: () => sheets.show('display') }]);
        break;
      case 'close':
        pickChoices(CLOSES.map((choice) => ({ label: t(`choices.close.${choice}`), pick: () => bridge.dispatch({ type: 'close', choice }) })));
        break;
      case 'talk': {
        const c = customers.find((x) => x.id === e.customerId);
        const opts = c?.talk?.options ?? [];
        pickChoices(opts.map((o, i) => ({ label: o.label, pick: () => bridge.dispatch({ type: 'talk', option: i as 0 | 1 }) })));
        break;
      }
      case 'regularOffer':
        pickChoices([
          { label: t('choices.regularOffer.accept'), pick: () => bridge.dispatch({ type: 'regularOffer', accept: true }) },
          { label: t('choices.regularOffer.decline'), pick: () => bridge.dispatch({ type: 'regularOffer', accept: false }) },
        ]);
        break;
    }
  }

  // ------------------------------------------------------------ 입력 처리
  stage.stage.addEventListener('click', (ev) => {
    if (!dialogue.waiting) return;
    const hit = ev.target as HTMLElement;
    if (hit.closest('.frame--serve, .dialogue')) dialogue.advance();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (overlay) { if (overlay.key(ev)) return; return; }
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && dialogue.waiting) { ev.preventDefault(); dialogue.advance(); return; }
    if (/^[1-4]$/.test(ev.key)) {
      const n = Number(ev.key);
      if (phone.closingKey(n) || (display.proposing ? display.pick(n) : choices.pick(n))) ev.preventDefault();
      return;
    }
    if (ev.key === 'm' || ev.key === 'M') { bgm.toggle(); return; }
    if (ev.key === 'Escape' && mobile()) { sheets.close(); return; }
    if (ev.key === 'p' || ev.key === 'P') {
      if (mobile()) sheets.toggle('phone'); else phone.openTab(phone.tab, true);
    } else if (ev.key === 'r' || ev.key === 'R') {
      showSheet('phone');
      phone.openTab('notes', true);
    }
  });

  bgm.set('title');
  setMood('calm');
  setShift('afternoon');
  renderer.setCustomer(null);
  if (opts.debug) {
    const w = window as unknown as { __game: Game; __data: (id: string) => string };
    w.__game = game;
    (w as unknown as { __bgm: Bgm }).__bgm = bgm;
    (w as unknown as { __renderer: Renderer }).__renderer = renderer; // 확인용: 괴현상·배경 연출을 바로 띄운다
    (w as unknown as { __busy: () => boolean }).__busy = () => bridge.busy;
    // 검증용: 브리지(사건 흐름)와 업무폰을 콘솔에서 직접 부른다
    (w as unknown as { __bridge: unknown }).__bridge = bridge;
    (w as unknown as { __phone: unknown }).__phone = phone;
    (w as unknown as { __best: () => number }).__best = () => {
      const p = game.getState().phase;
      if (p.kind !== 'encounter') return 0;
      const c = customers.find((x) => x.id === p.enc.customerId);
      const i = p.enc.offered.findIndex((id) => {
        const pr = data.products.find((x) => x.id === id);
        return c?.traits.wantsAnything || (pr?.category === c?.category && pr?.color === c?.color);
      });
      return i < 0 ? 0 : i;
    };
    w.__data = (id) => customers.find((c) => c.id === id)?.greetPref ?? 'warm';
  }
  titleFlow();
}
