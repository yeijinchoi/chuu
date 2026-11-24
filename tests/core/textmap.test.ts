import { describe, expect, it } from 'vitest';
import {
  applyPatch, collectAll, collectLeaves, getAt, labelOf, leafId, missingPlaceholders, setAt, splitId, type DataSet,
} from '../../src/editor/textmap';
import { LIVE } from '../../src/editor/store';

const clone = (): DataSet => JSON.parse(JSON.stringify(LIVE)) as DataSet;

describe('문구 편집기 로직', () => {
  const data = clone();
  const leaves = collectAll(data);
  const ids = new Set(leaves.map((l) => leafId(l.file, l.path)));

  it('손님 대사·재방문·반응·속마음·선택 대화가 모두 낱개로 잡힌다', () => {
    for (const id of [
      'customers/hanyeoreum/lines/opening',
      'customers/hanyeoreum/returns/2/opening',
      'customers/hanyeoreum/returns/2/thought/opening',
      'customers/hanyeoreum/reactions/propose/deptOnly',
      'customers/seojin/talk/prompt/#0',
      'customers/seojin/talk/options/#1/label',
      'customers/seojin/talk/options/#1/reply/#0',
      'customers/oh/afterSale/#0/lines/#0',
      'customers/marsh/care/forbid/#0/note',
      'strings/ending/display/scene/#0',
      'strings/cardFieldNames/category',
      'rules/6/reveal/text',
      'contacts/jin/name',
      'products/inner_bag/description',
    ]) expect(ids.has(id), id).toBe(true);
  });

  it('식별자·분류·수치 같은 글이 아닌 값은 편집 대상이 아니다', () => {
    for (const bad of [
      'customers/hanyeoreum/id', 'customers/hanyeoreum/shift', 'customers/hanyeoreum/category', 'customers/hanyeoreum/greetPref',
      'customers/hanyeoreum/sprite/hair', 'customers/hanyeoreum/hospitality/pref', 'customers/jin/onVisit/#0/clue', 'customers/jin/onVisit/#0/flag',
      'rules/1/stage', 'contacts/kang/customerId', 'templates/sales/#0/id', 'products/luna_tote_beige/category',
    ]) expect(ids.has(bad), bad).toBe(false);
  });

  it('경로 id로 찾고 고치고 되돌린다 (id 있는 배열 항목은 id로, 나머지는 #번호로)', () => {
    const d = clone();
    const id = 'customers/hanyeoreum/lines/opening';
    const p = splitId(id)!;
    const before = getAt(d[p.file], p.path) as string;
    expect(before.length).toBeGreaterThan(3);
    expect(setAt(d[p.file], p.path, '바뀐 첫 대사')).toBe(true);
    expect((d.customers as { id: string; lines: { opening: string } }[]).find((c) => c.id === 'hanyeoreum')!.lines.opening).toBe('바뀐 첫 대사');
    // 문자열이 아닌 곳은 고치지 않는다
    expect(setAt(d.customers, ['hanyeoreum', 'budget'], 'x')).toBe(false);
  });

  it('applyPatch: 적용한 개수와 못 찾은 id를 알려 준다', () => {
    const d = clone();
    const r = applyPatch(d, {
      'strings/title/start': '출근 시작',
      'customers/nobody/lines/opening': 'x',
      'strings/없는/경로': 'x',
    });
    expect(r.applied).toBe(1);
    expect(r.missing).toEqual(['customers/nobody/lines/opening', 'strings/없는/경로']);
    expect(((d.strings as { title: { start: string } }).title.start)).toBe('출근 시작');
  });

  it('이름표: 손님 이름과 한국어 설명이 붙는다', () => {
    const leaf = leaves.find((l) => leafId(l.file, l.path) === 'customers/hanyeoreum/returns/2/askBudget')!;
    const lab = labelOf(leaf, data);
    expect(lab.group).toBe('손님 · 한여름');
    expect(lab.section).toBe('재방문 2회째');
    expect(lab.name).toContain('예산');
  });

  it('자리표시자가 빠지면 알려 준다', () => {
    expect(missingPlaceholders('{name} 씨에게', '신입 씨에게')).toEqual(['{name}']);
    expect(missingPlaceholders('{name} 씨에게', '{name}님께')).toEqual([]);
  });

  it('모든 낱개 id는 서로 다르고, 모든 id가 다시 찾아진다', () => {
    expect(ids.size).toBe(leaves.length);
    for (const l of leaves) {
      const v = getAt(data[l.file], l.path);
      expect(v, leafId(l.file, l.path)).toBe(l.text);
    }
  });

  it('빈 파일 하나만 넘겨도 동작한다', () => {
    expect(collectLeaves('rules', [])).toEqual([]);
  });
});
