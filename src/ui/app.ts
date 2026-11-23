import customersData from '../data/customers.json';
import { Game } from '../core/game';
import { loadGameData } from '../core/gameData';
import { JsonStorageAdapter } from '../core/save';
import type { GameEvent, GreetStyle, ProbeId, CloseId, Mood as CoreMood, EncounterState, CustomerDef } from '../core/types';
import type { Mood } from '../render/palette';
import type { Renderer } from '../render/renderer';
import { Bridge, type EventSink, type Flow } from './bridge';
import { ChoicePanel, Dialogue, type ChoiceItem } from './dialogue';
import { DisplayPanel } from './display';
import { el, t } from './dom';
import { applyFrames } from './frames';
import { Phone } from './phone';
import { endingScreen, nameScreen, noteScreen, resultsScreen, titleScreen, type Overlay } from './screens';
import type { Stage } from './stage';

const PROBES: ProbeId[] = ['askCategory', 'askOccasion', 'askBudget', 'observe'];
const GREETS: GreetStyle[] = ['warm', 'quiet', 'direct'];
const CLOSES: CloseId[] = ['tryOn', 'boxRed', 'boxGold', 'checkout'];
const STEPS: EncounterState['step'][] = ['greet', 'probe', 'propose', 'close'];
const STEP_KEYS = ['greet', 'probe', 'propose', 'close'] as const;
const BREACH_MS = 1200;
const TOAST_MS = 3000;

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
  stage.viewport.append(hud, veil, choices.root, dialogue.root);
  stage.stage.append(toasts);

  const display = new DisplayPanel(stage.display);
  let overlay: Overlay | null = null;
  const notes: string[] = [];
  let baseMood: Mood = 'calm';
  let lastSave: boolean | null = null;
  let phaseKey = '';
  const seen = new Set<string>();
  let breachTimer = 0;

  // ------------------------------------------------------------ 분위기·교대
  const setMood = (m: Mood): void => {
    renderer.setMood(m);
    html.dataset.mood = m;
    applyFrames(stage.stage, m);
    display.setMood(m);
  };
  const setShift = (s: 'afternoon' | 'dawn'): void => {
    renderer.setShift(s);
    html.dataset.shift = s;
    display.setShift(s);
  };
  const toast = (text: string, ms = TOAST_MS): void => {
    const n = el('div', 'toast', text);
    toasts.append(n);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    window.setTimeout(() => n.remove(), ms);
  };
  const once = (key: string, text: string): void => {
    if (game.getState().day !== 1 || seen.has(key)) return;
    seen.add(key);
    toast(text, 4000);
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
  const blackout = (): void => {
    veil.hidden = false;
    window.setTimeout(() => { if (game.getState().phase.kind !== 'badEnding') veil.hidden = true; }, 1500);
  };

  const phone = new Phone(stage.phone, { game, data, dispatch: (a) => bridge.dispatch(a) });

  // ------------------------------------------------------------ 이벤트
  const sink: EventSink = {
    onEvent(e: GameEvent): Flow {
      switch (e.type) {
        case 'line':
          if (e.kind === 'note') { notes.push(e.text); return 'continue'; }
          if (notes.length) { showNote(); return 'retry'; }
          dialogue.show(e.speaker, e.text, e.speaker ? 'speech' : 'narration', () => bridge.release());
          return 'wait';
        case 'thought':
          if (notes.length) { showNote(); return 'retry'; }
          dialogue.show(null, e.text, 'thought', () => bridge.release());
          return 'wait';
        case 'customerEnter': {
          const c = customers.find((x) => x.id === e.customerId);
          if (c) renderer.setCustomer({ id: c.id, form: c.form, sprite: c.sprite } as never);
          hud.hidden = false;
          return 'continue';
        }
        case 'customerLeave':
          renderer.setCustomer(null);
          hud.hidden = true;
          if (e.outcome === 'sold') once('end', t('tutorial.end'));
          return 'continue';
        case 'affinity': setHearts(e.value, e.delta); return 'continue';
        case 'composure': phone.refresh(); return 'continue';
        case 'horror': if (e.kind === 'breach') breach(); else blackout(); return 'continue';
        case 'violation': return 'continue';
        case 'mannerSlip': toast(t('toast.manner')); phone.pulse('rules'); return 'continue';
        case 'shift': setShift(e.shift); if (e.shift === 'dawn') phone.unlockDawnRules(); return 'continue';
        case 'mood': baseMood = e.mood as CoreMood; if (!breachTimer || html.dataset.mood !== 'breach') setMood(baseMood); return 'continue';
        case 'sale': toast(t('toast.sale', { amount: e.amount.toLocaleString('en-US') }), 2000); phone.refresh(); return 'continue';
        case 'ledger': phone.refresh(); return 'continue';
        case 'regular': {
          const c = customers.find((x) => x.id === e.customerId);
          toast(t('toast.regular', { name: c?.name ?? '' }));
          return 'continue';
        }
        case 'cardUpdate':
          if (e.field !== 'purchases') {
            const key = String(e.field);
            toast(t('toast.cardRecorded', { field: t(`cardFieldNames.${key}`) }), 2000);
            phone.pulse('cards');
          }
          phone.refresh();
          return 'continue';
        case 'relationship': case 'replyChoices': phone.refresh(); return 'continue';
        case 'phone': phone.addMessage('in', e.from, e.text); return 'continue';
        case 'clock': phone.refresh(); return 'continue';
        case 'save': lastSave = e.ok; if (!e.ok) toast(t('toast.saveFail'), 5000); return 'continue';
        case 'sfx': if (e.id === 'lights_off') setShift('dawn'); return 'continue';
        default: return 'continue';
      }
    },
    onIdle,
  };
  const bridge = new Bridge(game, sink);

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
    const cur = step === 'regularOffer' ? 3 : STEPS.indexOf(step);
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
    showOverlay(noteScreen(stage.viewport, {
      lines, dawn, action: t(dawn ? 'choices.briefing.dawn' : 'choices.briefing.afternoon'),
      onDone: () => { if (done) return; done = true; closeOverlay(); bridge.release(); },
    }));
  }

  function titleFlow(): void {
    const saved = storage.load();
    const canResume = saved !== null && saved !== 'corrupt';
    const begin = (): void => {
      let go = false;
      showOverlay(nameScreen(stage.stage, (name) => {
        if (go) return; go = true;
        closeOverlay();
        bridge.dispatch({ type: 'start', playerName: name });
      }));
    };
    const resume = (): void => {
      if (saved === null || saved === 'corrupt') return;
      closeOverlay();
      bridge.resume(saved);
    };
    showOverlay(titleScreen(stage.stage, { canResume, corrupt: saved === 'corrupt', onStart: begin, onResume: resume }));
    if (canResume && new URLSearchParams(location.search).get('continue') === '1') resume();
  }

  // ------------------------------------------------------------ 입력 UI
  function pickChoices(items: ChoiceItem[]): void {
    choices.set(items.map((it) => ({ ...it, pick: () => { choices.clear(); it.pick(); } })));
  }

  function onIdle(): void {
    if (overlay) return;
    if (notes.length) { showNote(); return; }
    const s = game.getState();
    const p = s.phase;
    choices.clear();
    phone.refresh();
    const key = `${p.kind}|${'shift' in p ? p.shift : ''}|${s.day}`;
    const entering = key !== phaseKey;
    phaseKey = key;
    if (p.kind !== 'encounter' && display.proposing) display.showCatalog();
    switch (p.kind) {
      case 'briefing':
        pickChoices([{ label: t(p.shift === 'dawn' ? 'choices.briefing.dawn' : 'choices.briefing.afternoon'), pick: () => bridge.dispatch({ type: 'ackBriefing' }) }]);
        break;
      case 'shiftBreak':
        pickChoices([{ label: t('choices.shiftBreak'), pick: () => bridge.dispatch({ type: 'ackShiftBreak' }) }]);
        break;
      case 'texting':
        dialogue.hide();
        if (entering) { phone.openTab('book'); once('texting', t('tutorial.texting')); }
        break;
      case 'aftercare':
        dialogue.hide();
        if (entering) { phone.openTab('book'); once('aftercare', t('tutorial.aftercare')); }
        break;
      case 'closingText':
        if (entering) phone.openTab('chat');
        pickChoices([
          { label: t('choices.closingReply.reply'), pick: () => bridge.dispatch({ type: 'closingText', reply: true }) },
          { label: t('choices.closingReply.ignore'), pick: () => bridge.dispatch({ type: 'closingText', reply: false }) },
        ]);
        break;
      case 'encounter':
        encounterUi(p.enc);
        break;
      case 'results':
        dialogue.hide();
        toasts.replaceChildren();
        showOverlay(resultsScreen(stage.stage, {
          result: s.results as NonNullable<typeof s.results>, data, saved: lastSave, clock: s.clock,
          onRestart: () => location.reload(),
        }));
        break;
      case 'badEnding': {
        dialogue.hide();
        veil.hidden = false;
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
        once('greet', t('tutorial.greet'));
        pickChoices(GREETS.map((style) => ({ label: t(`choices.greet.${style}`), pick: () => bridge.dispatch({ type: 'greet', style }) })));
        break;
      case 'probe':
        once('probe', t('tutorial.probe'));
        pickChoices(PROBES.map((probe) => {
          const used = e.probesUsed.includes(probe);
          return { label: t(`choices.probe.${probe}`), disabled: used, reason: used ? t('choices.probeUsed') : undefined, pick: () => bridge.dispatch({ type: 'probe', probe }) };
        }));
        break;
      case 'propose':
        once('propose', t('tutorial.propose'));
        if (!display.proposing) display.showOffers(e.offered, (productId) => { display.showCatalog(); bridge.dispatch({ type: 'propose', productId }); });
        break;
      case 'close':
        pickChoices(CLOSES.map((choice) => ({ label: t(`choices.close.${choice}`), pick: () => bridge.dispatch({ type: 'close', choice }) })));
        break;
      case 'regularOffer':
        pickChoices([
          { label: t('choices.regularOffer.accept'), pick: () => bridge.dispatch({ type: 'regularOffer', accept: true }) },
          { label: t('choices.regularOffer.decline'), pick: () => bridge.dispatch({ type: 'regularOffer', accept: false }) },
        ]);
        break;
    }
  }

  // ------------------------------------------------------------ 입력 처리
  stage.viewport.addEventListener('click', () => { if (dialogue.waiting) dialogue.advance(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (overlay) { if (overlay.key(ev)) return; return; }
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && dialogue.waiting) { ev.preventDefault(); dialogue.advance(); return; }
    if (/^[1-4]$/.test(ev.key)) {
      const n = Number(ev.key);
      if (display.proposing ? display.pick(n) : choices.pick(n)) ev.preventDefault();
      return;
    }
    if (ev.key === 'p' || ev.key === 'P') phone.openTab(phone.tab, true);
    else if (ev.key === 'r' || ev.key === 'R') phone.openTab('rules', true);
  });

  setMood('calm');
  setShift('afternoon');
  renderer.setCustomer(null);
  if (opts.debug) {
    const w = window as unknown as { __game: Game; __data: (id: string) => string };
    w.__game = game;
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
