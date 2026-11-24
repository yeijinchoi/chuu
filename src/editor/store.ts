import contacts from '../data/contacts.json';
import customers from '../data/customers.json';
import products from '../data/products.json';
import rules from '../data/rules.json';
import strings from '../data/strings.ko.json';
import templates from '../data/templates.json';
import { applyPatch, type DataSet, type Patch } from './textmap';

/** 게임이 실제로 쓰는 데이터 객체들(같은 모듈 인스턴스). 미리보기는 이 객체를 제자리에서 고친다. */
export const LIVE: DataSet = { strings, customers, contacts, rules, templates, products };

export const PATCH_KEY = 'closing-time.textpatch.v1';

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
  return applyPatch(LIVE, stored.patch).applied;
}
