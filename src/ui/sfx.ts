/**
 * 효과음 자리. 지금은 이벤트 이름만 흘려보내고 소리는 내지 않는다.
 * 나중에 사운드(M-sound)를 붙일 때는 subscribe로 핸들러를 하나 꽂으면 된다.
 * 코어가 보내는 sfx 이벤트와 UI가 직접 내는 소리(문자 전송, 수신, 정산서 도장 …)가 모두 여기를 지난다.
 */
export type SfxId =
  | 'door_chime' | 'sign_flip' | 'lights_off' | 'cloth_pull' | 'phone_buzz' | 'glass_tap'
  | 'blackout' | 'violation' | 'register' | 'stamp'
  | 'msg_send' | 'msg_recv' | 'icon_shake' | 'sheet_open' | 'sheet_close';

type Handler = (id: string) => void;
const handlers = new Set<Handler>();
const history: string[] = [];

export const sfx = {
  /** 효과음 이벤트 하나. 알 수 없는 id도 그대로 전달한다(코어가 새 id를 추가해도 깨지지 않는다). */
  play(id: SfxId | string): void {
    history.push(id);
    if (history.length > 64) history.shift();
    for (const h of handlers) h(id);
  },
  subscribe(h: Handler): () => void {
    handlers.add(h);
    return () => { handlers.delete(h); };
  },
  /** 확인·테스트용: 최근에 흘려보낸 id */
  recent(): readonly string[] { return history; },
};
