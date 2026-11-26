import contacts from '../data/contacts.json';
import customers from '../data/customers.json';
import products from '../data/products.json';
import rules from '../data/rules.json';
import strings from '../data/strings.ko.json';
import templates from '../data/templates.json';
import { applyPatch, getAt, splitId, type DataSet, type Patch } from './textmap';

/** 게임이 실제로 쓰는 데이터 객체들(같은 모듈 인스턴스). 미리보기는 이 객체를 제자리에서 고친다. */
export const LIVE: DataSet = { strings, customers, contacts, rules, templates, products };

export const PATCH_KEY = 'closing-time.textpatch.v1';
/** 수정마다 "어떤 글을 고친 것인지"(고칠 때의 원문). 다른 곳에서 먼저 바뀐 글을 옛 수정이 덮어쓰지 않게 한다 */
export const BASE_KEY = 'closing-time.textpatch.base.v1';

export function loadBases(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(BASE_KEY) ?? '{}') as unknown;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === 'string') out[k] = t;
    return out;
  } catch { return {}; }
}
export function saveBases(b: Record<string, string>): boolean {
  try {
    if (Object.keys(b).length === 0) localStorage.removeItem(BASE_KEY);
    else localStorage.setItem(BASE_KEY, JSON.stringify(b));
    return true;
  } catch { return false; }
}

export type StoredKind = 'drop' | 'keep' | 'conflict';
/**
 * 저장해 둔 수정 하나를 지금 원문과 견준다.
 * - 원문이 이미 그 글이면(게시·배포됨) 버린다
 * - 고칠 때의 원문이 지금 원문과 같으면(그 사이 아무도 안 바꿈) 그대로 쓴다
 * - 게시는 했고 배포만 아직이면(고칠 때의 원문 = 수정한 글) 그대로 쓴다
 * - 그 밖(다른 곳에서 먼저 바뀌었거나, 언제 고친 것인지 모르는 옛 수정)은 충돌: 사람이 고른다
 */
export function classifyStored(text: string, base: string | undefined, original: string | undefined): StoredKind {
  if (original === undefined || text === original) return 'drop';
  if (base === original || base === text) return 'keep';
  return 'conflict';
}

export type StoredPatch = { ok: true; patch: Patch } | { ok: false; reason: 'corrupt' | 'blocked' };

/** 저장된 수정 내용을 읽는다. 읽지 못한 것(손상·저장소 막힘)과 "수정 없음"을 구분한다. */
export function loadPatch(): StoredPatch {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PATCH_KEY);
  } catch {
    return { ok: false, reason: 'blocked' };
  }
  if (raw === null) return { ok: true, patch: {} };
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, reason: 'corrupt' };
    const patch: Patch = {};
    for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === 'string') patch[k] = t;
    return { ok: true, patch };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

export function savePatch(patch: Patch): boolean {
  try {
    if (Object.keys(patch).length === 0) localStorage.removeItem(PATCH_KEY);
    else localStorage.setItem(PATCH_KEY, JSON.stringify(patch));
    return true;
  } catch {
    return false;
  }
}

/** 게임 시작 전에 저장된 수정 내용을 데이터에 덮어쓴다. 적용한 개수를 돌려준다. */
export function applyStoredEdits(): number {
  const stored = loadPatch();
  if (!stored.ok) return 0;
  // 충돌(다른 곳에서 먼저 바뀐 글)은 미리보기에도 쓰지 않는다
  const bases = loadBases();
  const patch: Patch = {};
  for (const [id, text] of Object.entries(stored.patch)) {
    const p = splitId(id);
    const orig = p ? getAt(LIVE[p.file], p.path) : undefined;
    if (classifyStored(text, bases[id], typeof orig === 'string' ? orig : undefined) === 'keep') patch[id] = text;
  }
  return applyPatch(LIVE, patch).applied;
}
