// Dusk Mono 16 — src/ui/styles/tokens.css 와 같은 값을 유지한다.
export const PALETTE = {
  ink: '#0d0b0f',
  shadow: '#1c1820',
  dusk: '#2e2833',
  stone: '#4a4350',
  mist: '#6f6775',
  ash: '#9a929e',
  bone: '#cfc6c4',
  paper: '#ece4da',
  rose: '#b85c78',
  brass: '#a88c52',
  steel: '#7a9cb0',
  wine: '#9e2236',
  'skin-a': '#d8c2b4',
  'skin-b': '#a8887a',
  taupe: '#a89a88',
  hair: '#3a2e2a',
} as const;

export type PaletteKey = keyof typeof PALETTE;
export type Mood = 'calm' | 'uneasy' | 'dread' | 'collapse' | 'breach';

/** mood별 팔레트 변환은 M2 이후. 지금은 기본 색을 돌려준다. */
export function resolve(key: PaletteKey, _mood: Mood = 'calm'): string {
  return PALETTE[key];
}
