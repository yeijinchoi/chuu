import type { GameState } from '../core/types';
import { el, t } from './dom';

/** 평정심 배터리 10칸. 30% 이하면 wine(low). hit != 0이면 방금 깎인 것: 칸이 깜빡이고 변화량이 뜬다. */
export function batteryEl(composure: number, hit = 0): HTMLElement {
  const bat = el('span', hit !== 0 ? 'battery battery--hit' : 'battery');
  bat.setAttribute('role', 'img');
  bat.setAttribute('aria-label', `${t('phone.battery')} ${composure}`);
  const filled = Math.ceil(composure / 10);
  bat.dataset.level = composure >= 70 ? 'hi' : composure > 30 ? 'mid' : 'low';
  for (let i = 0; i < 10; i++) bat.append(el('i', i < filled ? 'cell cell--on' : 'cell'));
  if (hit !== 0) bat.append(el('b', 'battery__delta num', `${hit > 0 ? '+' : '−'}${Math.abs(hit)}`));
  return bat;
}

export const regularsOf = (s: Readonly<GameState>): number =>
  Object.values(s.cards).filter((c) => c.tier !== 'new' && c.tier !== 'lost').length;

/** 모바일 상단 정보 명판: DAY · 시각 · ₩ · 단골 · 배터리 (읽기 전용) */
export function fillMobileStatus(root: HTMLElement, s: Readonly<GameState>, hit = 0): void {
  root.replaceChildren(
    el('span', 'm-status__day num', `${t('hud.day')} ${s.day}`),
    el('span', 'm-status__clock num', s.clock),
    el('span', 'm-status__money num', `₩ ${s.revenue.toLocaleString('en-US')}`),
    el('span', 'm-status__regs', `${t('phone.regularsCount')} ${regularsOf(s)}`),
    batteryEl(s.composure, hit),
  );
}
