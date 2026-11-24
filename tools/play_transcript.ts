/**
 * 게임을 처음부터 끝까지 자동으로 플레이하고, 화면에 나오는 모든 글을 순서대로 적은 대본을 만든다.
 * 반복되는 대사·어색한 문장·이상한 전개를 사람이 읽고 찾기 위한 도구.
 *   npx vite-node tools/play_transcript.ts [good|sloppy] [시드] > 대본.txt
 * good  : 문자 초대·정답 응대·감사 문자·협력자 선택 (진엔딩을 노린다)
 * sloppy: 인사·상품을 일부러 틀리고, 다시 뽑기를 쓰고, 04:44에 답장한다
 */
import { Game } from '../src/core/game';
import { loadGameData } from '../src/core/gameData';
import { classifyProposal } from '../src/core/reactions';
import { applicableRules, checkChoice } from '../src/core/rules';
import { makeLookups } from '../src/core/ctx';
import type { Action, CloseId, CustomerDef, GameEvent, GreetStyle, ProbeId } from '../src/core/types';

const mode = (process.argv[2] ?? 'good') as 'good' | 'sloppy';
const seed = Number(process.argv[3] ?? 7);
const data = loadGameData();
const { customers, products } = makeLookups(data);
const g = new Game(data);
const out: string[] = [];
const w = (s: string): void => { out.push(s); };

function show(evs: GameEvent[]): void {
  for (const e of evs) {
    if (e.type === 'line') w(e.kind === 'note' ? `  [쪽지] ${e.text}` : e.speaker ? `  ${e.speaker}: ${e.text}` : `  > ${e.text}`);
    else if (e.type === 'thought') w(`  (속마음) ${e.text}`);
    else if (e.type === 'phone') w(`  [폰·${e.from}] ${e.text}`);
    else if (e.type === 'phase') w(`--- ${e.phase}`);
    else if (e.type === 'clock') w(`  [${e.time}]`);
    else if (e.type === 'customerEnter') w(`\n## 손님: ${customers[e.customerId]?.name}`);
    else if (e.type === 'violation') w(`  !! 수칙 ${e.rule} 위반`);
    else if (e.type === 'mannerSlip') w(`  !! 매너 실수`);
    else if (e.type === 'clue') w(`  [단서] ${e.id}`);
    else if (e.type === 'ending') w(`\n### 엔딩: ${e.ending}`);
    else if (e.type === 'relationship') w(`  [관계] ${customers[e.customerId]?.name} → ${e.tier}`);
  }
}
const act = (a: Action, label?: string): GameEvent[] => {
  if (label) w(`  ▶ ${label}`);
  const ev = g.dispatch(a);
  show(ev);
  return ev;
};
const st = () => g.getState();

const T = (path: string): string => {
  let cur: unknown = data.strings;
  for (const k of path.split('.')) cur = (cur as Record<string, unknown>)?.[k];
  return typeof cur === 'string' ? cur : path;
};

let sloppyCounter = 0;
function encounter(): void {
  const p = st().phase;
  if (p.kind !== 'encounter') return;
  const c = customers[p.enc.customerId] as CustomerDef;
  const shift = p.enc.shift;
  const rules = data.rules;
  const sloppy = mode === 'sloppy' && (sloppyCounter++ % 2 === 0);
  // 인사
  const greets: GreetStyle[] = sloppy ? ['warm', 'direct', 'quiet'] : [c.greetPref, 'quiet', 'direct', 'warm'];
  const greet = greets.find((s) => shift === 'afternoon' || mode === 'sloppy' || checkChoice(c, 'greet', s, rules, shift) === null) as GreetStyle;
  act({ type: 'greet', style: greet }, `${T(`choices.greet.${greet}`)}`);
  if (st().phase.kind !== 'encounter') return;
  let e = (st().phase as { enc: typeof p.enc }).enc;
  if (e.step === 'done') { act({ type: 'advance' }); return; }
  if (e.step === 'serve') {
    const pref = c.hospitality?.pref;
    const drink = sloppy ? 'chocolate' : pref === 'taboo' || pref === 'none' ? 'none' : pref === 'any' ? 'water' : (pref ?? 'water');
    act({ type: 'serve', drink: drink as 'water' }, T(`choices.serve.${drink}`));
  }
  const must = applicableRules(c, rules).filter((r) => shift === 'dawn' && r.stage === 'probe' && r.require).map((r) => r.require as ProbeId);
  const probes = [...must];
  for (const pr of (sloppy ? ['askBudget', 'askCategory', 'observe', 'askOccasion'] : ['askCategory', 'askOccasion', 'observe', 'askBudget']) as ProbeId[]) {
    if (probes.length >= 2) break;
    if (probes.includes(pr)) continue;
    if (!sloppy && checkChoice(c, 'probe', pr, rules, shift) !== null) continue;
    if (!sloppy && pr === 'askBudget' && shift === 'afternoon' && !c.mentionsPrice) continue;
    probes.push(pr);
  }
  for (const pr of probes) {
    if (st().phase.kind !== 'encounter') return;
    e = (st().phase as { enc: typeof p.enc }).enc;
    if (e.step !== 'probe') break;
    act({ type: 'probe', probe: pr }, T(`choices.probe.${pr}`));
  }
  if (st().phase.kind !== 'encounter') return;
  e = (st().phase as { enc: typeof p.enc }).enc;
  if (e.step === 'done') { act({ type: 'advance' }); return; }
  // 제안: sloppy면 틀린 상품을 하나 권하고, 다시 뽑기도 써 본다
  const ctx = { state: st(), data, customers, products, emit: () => undefined } as never;
  if (sloppy) {
    const wrong = e.offered.find((id) => id !== c.onlyProduct && classifyProposal(ctx, c, products[id]!) !== 'perfect');
    if (wrong) act({ type: 'propose', productId: wrong }, `[제안] ${products[wrong]?.name}`);
    if (st().phase.kind === 'encounter' && (st().phase as { enc: typeof e }).enc.step === 'propose') act({ type: 'reroll' }, '[다른 상품 보기]');
  }
  for (let i = 0; i < 4 && st().phase.kind === 'encounter' && (st().phase as { enc: typeof e }).enc.step === 'propose'; i++) {
    e = (st().phase as { enc: typeof p.enc }).enc;
    const best = c.onlyProduct && e.offered.includes(c.onlyProduct) ? c.onlyProduct : e.offered.find((id) => classifyProposal(ctx, c, products[id]!) === 'perfect');
    if (best) act({ type: 'propose', productId: best }, `[제안] ${products[best]?.name}`);
    else act({ type: 'reroll' }, '[다른 상품 보기]');
  }
  if (st().phase.kind !== 'encounter') return;
  e = (st().phase as { enc: typeof p.enc }).enc;
  if (e.step === 'close') {
    const need = applicableRules(c, rules).find((r) => shift === 'dawn' && r.stage === 'close' && r.require)?.require as CloseId | undefined;
    const pick = need ?? (['boxGold', 'checkout', 'boxRed', 'tryOn'] as CloseId[]).find((x) => checkChoice(c, 'close', x, rules, shift) === null) as CloseId;
    const close = c.occasionIsGift && !need && pick !== 'checkout' ? 'boxGold' : pick;
    act({ type: 'close', choice: close }, T(`choices.close.${close}`));
  }
  if (st().phase.kind !== 'encounter') return;
  e = (st().phase as { enc: typeof p.enc }).enc;
  if (e.step === 'talk') {
    const opt = mode === 'good' ? 1 : 0;
    act({ type: 'talk', option: opt }, `[선택 대화] ${c.talk?.options[opt]?.label}`);
  }
  if (st().phase.kind !== 'encounter') return;
  e = (st().phase as { enc: typeof p.enc }).enc;
  if (e.step === 'regularOffer') act({ type: 'regularOffer', accept: true }, T('choices.regularOffer.accept'));
  if (st().phase.kind === 'encounter') act({ type: 'advance' });
}

function texting(shift: 'afternoon' | 'dawn'): void {
  if (mode === 'good') {
    const plan = shift === 'afternoon' ? [['kang', 'new_arrival'], ['jin', 'private']] : [['marsh', 'dawn_offer'], ['baek', 'dawn_name']];
    for (const [contactId, template] of plan) {
      const a = g.availableActions().find((x) => x.type === 'sendText' && x.contactId === contactId && x.template === template);
      if (a) act(a, `[문자] ${contactId} ← ${template}`);
    }
    for (const r of Object.keys(st().pendingReplies)) act({ type: 'chooseReply', customerId: r, option: 0 }, '[답장 선택 1]');
  }
  act({ type: 'finishTexting' }, '[문자 마치기]');
}

function aftercare(): void {
  if (mode === 'good') {
    for (let i = 0; i < 3; i++) {
      const a = g.availableActions().find((x) => x.type === 'sendCare' && (x.template === 'thanks' || x.template === 'dawn_thanks'));
      if (!a) break;
      act(a, `[감사 문자] ${a.type === 'sendCare' ? customers[a.customerId]?.name : ''}`);
      for (const r of Object.keys(st().pendingReplies)) act({ type: 'chooseReply', customerId: r, option: 0 }, '[답장 선택 1]');
    }
  }
  act({ type: 'finishAftercare' }, '[하루 마무리]');
}

act({ type: 'start', playerName: '신입', seed }, '출근');
for (let guard = 0; guard < 400; guard++) {
  const p = st().phase;
  if (p.kind === 'briefing') { w(`\n================ ${st().day}일차 ${p.shift === 'afternoon' ? '오후' : '새벽'} ================`); act({ type: 'ackBriefing' }); }
  else if (p.kind === 'texting') texting(p.shift);
  else if (p.kind === 'encounter') encounter();
  else if (p.kind === 'aftercare') aftercare();
  else if (p.kind === 'shiftBreak') act({ type: 'ackShiftBreak' });
  else if (p.kind === 'closingText') act({ type: 'closingText', reply: mode === 'sloppy' && st().day === 2 }, mode === 'sloppy' && st().day === 2 ? T('choices.closingReply.reply') : T('choices.closingReply.ignore'));
  else if (p.kind === 'results') { w(`  [정산] ${JSON.stringify({ 등급: st().results?.grade, 판매: st().results?.salesCount, 위반: st().results?.violations })}`); act({ type: 'nextDay' }); }
  else if (p.kind === 'finale') {
    const acts = g.availableActions().flatMap((a) => (a.type === 'finale' ? [a.choice] : []));
    const choice = acts.includes('ally') && mode === 'good' ? 'ally' : mode === 'good' ? 'leave' : 'yes';
    act({ type: 'finale', choice }, T(`choices.finale.${choice}`));
  } else break;
}
w(`\n[끝] phase=${st().phase.kind}`);
console.log(out.join('\n'));
