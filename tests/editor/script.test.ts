import { describe, expect, it } from 'vitest';
import strings from '../../src/data/strings.ko.json';
import customers from '../../src/data/customers.json';
import contacts from '../../src/data/contacts.json';
import rules from '../../src/data/rules.json';
import templates from '../../src/data/templates.json';
import products from '../../src/data/products.json';
import day1 from '../../src/data/day1.json';
import day2 from '../../src/data/day2.json';
import day3 from '../../src/data/day3.json';
import day4 from '../../src/data/day4.json';
import day5 from '../../src/data/day5.json';
import { collectAll, type DataSet } from '../../src/editor/textmap';
import { buildScript, type DayInfo } from '../../src/editor/script';

const data = { strings, customers, contacts, rules, templates, products } as unknown as DataSet;
const leaves = collectAll(data);
const script = buildScript(data, [day1, day2, day3, day4, day5] as unknown as DayInfo[], leaves);
const ids = script.chapters.flatMap((c) => c.scenes.flatMap((s) => s.lines.map((l) => l.id)));

describe('문구 편집기 대본 보기', () => {
  it('오프닝 → 1~5일차 → 엔딩 순서로 장이 놓인다', () => {
    expect(script.chapters.map((c) => c.title)).toEqual(['오프닝', '1일차', '2일차', '3일차', '4일차', '5일차', '엔딩']);
  });
  it('한 글은 대본과 "그 밖의 글" 중 딱 한 곳에만 나온다', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length + script.rest.length).toBe(leaves.length);
    for (const id of script.rest) expect(ids).not.toContain(id);
  });
  it('1일차는 출근 쪽지로 시작하고, 한여름의 첫 대사가 13:30 장면에 첫 방문 순서대로 있다', () => {
    const d1 = script.chapters[1]!;
    expect(d1.scenes[0]!.lines[0]!.id).toBe('strings/briefing/afternoon/intro/#0');
    const han = d1.scenes.find((s) => s.title === '13:30 한여름')!;
    const at = (id: string) => han.lines.findIndex((l) => l.id === id);
    expect(at('customers/hanyeoreum/reactions/enter')).toBeLessThan(at('customers/hanyeoreum/lines/opening'));
    expect(at('customers/hanyeoreum/lines/opening')).toBeLessThan(at('customers/hanyeoreum/lines/askCategory'));
    expect(at('customers/hanyeoreum/lines/askCategory')).toBeLessThan(at('customers/hanyeoreum/reactions/close/box/gold'));
    expect(at('customers/hanyeoreum/reactions/close/box/gold')).toBeLessThan(at('customers/hanyeoreum/reactions/leave'));
  });
  it('재방문 대사는 다시 오는 날에 놓인다 (한여름 2회째 → 2일차)', () => {
    const d2 = script.chapters[2]!;
    expect(d2.scenes.some((s) => s.lines.some((l) => l.id === 'customers/hanyeoreum/returns/2/opening'))).toBe(true);
  });
  it('방문 번호가 정해진 사건은 그 방문에 놓인다 (한여름 3번째 방문의 서윤 이야기 → 마지막 날)', () => {
    const d5 = script.chapters[5]!;
    expect(d5.scenes.some((s) => s.lines.some((l) => l.id.startsWith('customers/hanyeoreum/onVisit/')))).toBe(true);
    const d1 = script.chapters[1]!;
    expect(d1.scenes.some((s) => s.lines.some((l) => l.id.startsWith('customers/hanyeoreum/onVisit/')))).toBe(false);
  });
  it('대본에 들어가는 글이 대부분이다 (그 밖의 글은 공통·UI 문구)', () => {
    const story = leaves.filter((l) => l.file === 'customers').length;
    const placed = ids.filter((id) => id.startsWith('customers/')).length;
    expect(placed / story).toBeGreaterThan(0.95);
  });
});
