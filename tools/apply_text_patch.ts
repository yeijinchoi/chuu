/**
 * 문구 편집기에서 내려받은 패치를 src/data/*.json에 적용한다.
 *   npx vite-node tools/apply_text_patch.ts <패치.json> [--dry]
 * - before(원문)가 지금 파일과 다르면 경고하고 건너뛴다(그 사이 파일이 바뀐 경우).
 * - 바뀐 파일만 JSON.stringify(…, 2)로 다시 쓴다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyPatch, FILE_IDS, FILE_NAMES, getAt, splitId, type DataSet } from '../src/editor/textmap';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const patchPath = args.find((a) => !a.startsWith('--'));
if (!patchPath) {
  console.error('사용: npx vite-node tools/apply_text_patch.ts <패치.json> [--dry]');
  process.exit(1);
}
const dir = resolve(import.meta.dirname, '../src/data');
const data = Object.fromEntries(FILE_IDS.map((f) => [f, JSON.parse(readFileSync(resolve(dir, FILE_NAMES[f]), 'utf8')) as unknown])) as DataSet;

const raw = JSON.parse(readFileSync(resolve(patchPath), 'utf8')) as { changes?: { id: string; before?: string; after: string }[] } | Record<string, string>;
const changes = Array.isArray((raw as { changes?: unknown }).changes)
  ? (raw as { changes: { id: string; before?: string; after: string }[] }).changes
  : Object.entries(raw as Record<string, string>).map(([id, after]) => ({ id, after }));

const patch: Record<string, string> = {};
const skipped: string[] = [];
for (const c of changes) {
  const p = splitId(c.id);
  const now = p ? getAt(data[p.file], p.path) : undefined;
  if (typeof now !== 'string') { skipped.push(`${c.id}  (없는 경로)`); continue; }
  if (c.before !== undefined && c.before !== now) { skipped.push(`${c.id}  (원문이 달라졌어요: 지금 "${now.slice(0, 30)}…")`); continue; }
  if (now !== c.after) patch[c.id] = c.after;
}
const touched = new Set(Object.keys(patch).map((id) => splitId(id)?.file));
const r = applyPatch(data, patch);
if (!dry) for (const f of FILE_IDS) if (touched.has(f)) writeFileSync(resolve(dir, FILE_NAMES[f]), `${JSON.stringify(data[f], null, 2)}\n`);
console.log(`${dry ? '[시험] ' : ''}적용 ${r.applied}개, 건너뜀 ${skipped.length}개, 바뀐 파일 ${[...touched].map((f) => FILE_NAMES[f as keyof typeof FILE_NAMES]).join(', ') || '없음'}`);
for (const s of skipped) console.log('  건너뜀:', s);
