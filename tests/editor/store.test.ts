import { describe, expect, it } from 'vitest';
import { classifyStored } from '../../src/editor/store';

describe('저장해 둔 수정과 지금 원문 견주기 (옛 수정이 새 글을 되돌리지 않게)', () => {
  it('원문이 이미 그 글이면 버린다 (게시·배포 끝)', () => {
    expect(classifyStored('새 글', '옛 글', '새 글')).toBe('drop');
  });
  it('고칠 때의 원문이 지금 원문과 같으면 그대로 쓴다', () => {
    expect(classifyStored('내 수정', '원문', '원문')).toBe('keep');
  });
  it('게시는 했고 배포만 아직이면 그대로 쓴다', () => {
    expect(classifyStored('내 수정', '내 수정', '원문')).toBe('keep');
  });
  it('그 사이 다른 곳에서 먼저 바뀌었으면 충돌 (11-26: 11-24의 옛 수정이 더 새 글을 되돌렸던 경우)', () => {
    expect(classifyStored('다음 주가 엄마 생신이에요.', '다음 주가 엄마 생신이에요. 무난한 색', '내일이 엄마 생신이에요.')).toBe('conflict');
  });
  it('언제 고친 것인지 모르는 옛 수정(고칠 때의 원문 기록이 없음)도 충돌로 묻는다', () => {
    expect(classifyStored('옛 수정', undefined, '지금 원문')).toBe('conflict');
  });
});
