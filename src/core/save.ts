import { isRegistered } from './care';
import type { ClientCard, GameState, SaveV1, StorageAdapter } from './types';

export const SAVE_KEY = 'closing-time.save.v1';

/** 저장할 상태: 단골 명부(이탈 포함), 누적 매출, 새벽 장부 */
export function buildSave(state: Readonly<GameState>): SaveV1 {
  const regulars: Record<string, ClientCard> = {};
  for (const [id, card] of Object.entries(state.cards)) {
    if (isRegistered(card) || card.tier === 'lost') regulars[id] = JSON.parse(JSON.stringify(card)) as ClientCard;
  }
  return {
    version: 1,
    day: state.day,
    playerName: state.playerName,
    totalRevenue: state.totalRevenue,
    dawnLedger: state.dawnLedger.map((x) => ({ ...x })),
    regulars,
    savedAtClock: state.clock,
    pendingUninvited: [...state.pendingUninvited],
    earlierSlots: { ...state.earlierSlots },
    clues: [...state.clues],
    flags: { ...state.flags },
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 손상된 데이터면 null */
export function parseSave(raw: unknown): SaveV1 | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  if (typeof raw.day !== 'number' || typeof raw.playerName !== 'string') return null;
  if (typeof raw.totalRevenue !== 'number' || typeof raw.savedAtClock !== 'string') return null;
  if (!Array.isArray(raw.dawnLedger) || !isObj(raw.regulars)) return null;
  for (const e of raw.dawnLedger) {
    if (!isObj(e) || typeof e.customerId !== 'string' || typeof e.label !== 'string' || typeof e.amount !== 'number') return null;
  }
  for (const c of Object.values(raw.regulars)) {
    if (!isObj(c) || typeof c.customerId !== 'string' || typeof c.score !== 'number' || typeof c.tier !== 'string') return null;
  }
  return raw as unknown as SaveV1;
}

/** 브라우저 저장소 등 실제 키-값 저장소는 UI 쪽에서 이 인터페이스로 주입한다 */
export interface KeyValueBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class JsonStorageAdapter implements StorageAdapter {
  constructor(private readonly backend: KeyValueBackend, private readonly key: string = SAVE_KEY) {}

  load(): SaveV1 | null | 'corrupt' {
    let text: string | null;
    try {
      text = this.backend.getItem(this.key);
    } catch {
      return 'corrupt';
    }
    if (text === null) return null;
    try {
      return parseSave(JSON.parse(text)) ?? 'corrupt';
    } catch {
      return 'corrupt';
    }
  }

  save(s: SaveV1): boolean {
    try {
      this.backend.setItem(this.key, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  }
}

/** 테스트·임시 저장용 메모리 백엔드 */
export class MemoryBackend implements KeyValueBackend {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('write blocked');
    this.data.set(key, value);
  }
}

export function createMemoryStorage(): { adapter: JsonStorageAdapter; backend: MemoryBackend } {
  const backend = new MemoryBackend();
  return { adapter: new JsonStorageAdapter(backend), backend };
}
