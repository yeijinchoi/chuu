import { button, el, t } from './dom';
import type { Overlay } from './screens';
import { sfx } from './sfx';

/**
 * 오프닝: 다른 명품 브랜드에서 일하던 주인공에게 5년 전 동료 서윤의 문자가 오고,
 * 서윤의 추천으로 메종 뤼미에르 점장 로즈에게서 연락이 온다. 로즈가 이름을 물으면 답장 칸에 이름을 적는다.
 * 대사는 strings.ko.json의 opening.steps(문구 편집기로 고칠 수 있다). {name}은 적은 이름으로 바뀐다.
 *
 * 진행: 지문·속마음·장면 자막은 Space/Enter/클릭을 기다리고, 문자는 "입력 중" 뒤에 저절로 온다.
 * 누르면 기다림을 건너뛴다. Esc는 이름을 묻는 곳까지 한 번에 건너뛴다.
 */
export interface OpeningStep {
  kind: 'scene' | 'narration' | 'thought' | 'chat' | 'in' | 'out' | 'typing' | 'ask';
  text?: string;
  from?: string;
  ms?: number;
}

export function isOpeningSteps(v: unknown): v is OpeningStep[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'object' && s !== null && typeof (s as OpeningStep).kind === 'string');
}

export function openingScreen(host: HTMLElement, o: { steps: OpeningStep[]; onDone: (name: string) => void }): Overlay {
  const root = el('div', 'screen screen--opening');
  const col = el('div', 'opening');
  const scene = el('div', 'opening__scene');
  const phone = el('div', 'opening__phone');
  const from = el('div', 'opening__from');
  const chat = el('div', 'opening__chat chat');
  chat.setAttribute('role', 'log');
  const compose = el('form', 'opening__compose');
  const input = el('input', 'opening__input');
  input.type = 'text';
  input.maxLength = 6;
  input.value = t('defaultPlayerName');
  input.setAttribute('aria-label', t('opening.nameLabel'));
  const send = button('btn opening__send', t('opening.send'), () => submit());
  send.type = 'submit';
  compose.append(input, send);
  compose.hidden = true;
  phone.append(from, chat, compose);
  phone.hidden = true;
  const text = el('div', 'opening__text');
  text.setAttribute('aria-live', 'polite');
  const hint = el('div', 'opening__hint', `[Space] ${t('opening.next')} · [Esc] ${t('opening.skip')}`);
  col.append(scene, phone, text, hint);
  root.append(col);
  host.appendChild(root);

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let fast = false; // Esc: 이름 묻는 곳까지 건너뛴다
  let closed = false;
  let name = '';
  let poke: (() => void) | null = null; // 지금 기다리는 것을 끝낸다
  let named: ((n: string) => void) | null = null;

  /** ms만큼 기다린다. 누르거나 건너뛰면 바로 끝난다 */
  const sleep = (ms: number): Promise<void> => new Promise((res) => {
    if (fast || closed) { res(); return; }
    const id = window.setTimeout(() => { poke = null; res(); }, reduced ? Math.min(ms, 200) : ms);
    poke = () => { window.clearTimeout(id); poke = null; res(); };
  });
  /** 누를 때까지 기다린다 */
  const waitInput = (): Promise<void> => new Promise((res) => {
    if (fast || closed) { res(); return; }
    root.classList.add('is-waiting');
    poke = () => { poke = null; root.classList.remove('is-waiting'); res(); };
  });
  const fill = (s: string | undefined): string => (s ?? '').replace(/\{name\}/g, name || t('defaultPlayerName'));

  const bubble = (dir: 'in' | 'out', s: string): void => {
    const row = el('div', `bubble-row bubble-row--${dir}`);
    row.append(el('div', `bubble bubble--${dir}`, s));
    chat.append(row);
    chat.scrollTop = chat.scrollHeight;
  };
  const typingRow = (): HTMLElement => {
    const row = el('div', 'bubble-row bubble-row--in');
    const dots = el('div', 'bubble bubble--in bubble--typing');
    dots.setAttribute('aria-label', t('phone.typing'));
    for (let i = 0; i < 3; i++) dots.append(el('i'));
    row.append(dots);
    chat.append(row);
    chat.scrollTop = chat.scrollHeight;
    return row;
  };
  const say = (kind: 'narration' | 'thought', s: string): void => {
    text.className = `opening__text opening__text--${kind}`;
    text.textContent = kind === 'thought' ? `(${s})` : s;
  };

  const submit = (): void => {
    if (!named) return;
    const n = input.value.trim().slice(0, 6) || t('defaultPlayerName');
    const done = named;
    named = null;
    compose.hidden = true;
    bubble('out', n);
    sfx.play('msg_send');
    done(n);
  };
  compose.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  const run = async (): Promise<void> => {
    for (const st of o.steps) {
      if (closed) return;
      switch (st.kind) {
        case 'scene':
          scene.textContent = fill(st.text);
          text.textContent = '';
          await waitInput();
          break;
        case 'narration':
        case 'thought':
          say(st.kind, fill(st.text));
          await waitInput();
          break;
        case 'chat':
          // 새 대화: 화면을 비우고 보낸 사람을 바꾼다
          phone.hidden = false;
          from.textContent = fill(st.from);
          chat.replaceChildren();
          text.textContent = '';
          break;
        case 'in': {
          const row = typingRow();
          await sleep(st.ms ?? 900);
          row.remove();
          bubble('in', fill(st.text));
          sfx.play('msg_recv');
          await sleep(700);
          break;
        }
        case 'out':
          await sleep(500);
          bubble('out', fill(st.text));
          sfx.play('msg_send');
          await sleep(600);
          break;
        case 'typing': {
          // 쓰다가 멈춘 "입력 중": 아무 말도 오지 않는다
          const row = typingRow();
          await sleep(st.ms ?? 2000);
          row.remove();
          break;
        }
        case 'ask':
          fast = false;
          text.textContent = '';
          compose.hidden = false;
          input.focus();
          input.select();
          name = await new Promise<string>((res) => { named = res; });
          break;
      }
    }
    if (!closed) o.onDone(name || t('defaultPlayerName'));
  };
  void run();

  const advance = (): void => { poke?.(); };
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.opening__compose')) return;
    advance();
  });
  return {
    root,
    key: (e) => {
      if (document.activeElement === input) return false; // 이름 칸은 입력이 먼저
      if (e.key === 'Escape') { fast = !named; advance(); return true; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); return true; }
      return true;
    },
    close: () => { closed = true; poke?.(); root.remove(); },
  };
}
