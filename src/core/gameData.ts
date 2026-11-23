import products from '../data/products.json';
import customers from '../data/customers.json';
import contacts from '../data/contacts.json';
import templates from '../data/templates.json';
import rules from '../data/rules.json';
import day1 from '../data/day1.json';
import day2 from '../data/day2.json';
import day3 from '../data/day3.json';
import day4 from '../data/day4.json';
import day5 from '../data/day5.json';
import strings from '../data/strings.ko.json';
import type { GameData } from './types';

/** data/*.json을 GameData로 묶는다 (core가 import해도 되는 유일한 외부 파일은 data JSON) */
export function loadGameData(): GameData {
  return {
    products,
    customers,
    contacts,
    templates,
    rules,
    days: { 1: day1, 2: day2, 3: day3, 4: day4, 5: day5 },
    strings,
  } as unknown as GameData;
}
