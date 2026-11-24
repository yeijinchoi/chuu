import { describe, expect, it } from 'vitest';
import { publishChanges, type Change } from '../../src/editor/github';

/** 아주 작은 가짜 GitHub: 파일 내용을 메모리에 두고 git 데이터 API 몇 개만 흉내 낸다 */
function fakeGithub(files: Record<string, unknown>, opts: { failAt?: { path: RegExp; status: number } } = {}) {
  const log: { method: string; url: string; body?: unknown }[] = [];
  const written: Record<string, string> = {};
  let blobN = 0;
  const blobs: Record<string, string> = {};
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    log.push({ method, url, body });
    const json = (o: unknown, status = 200): Response => new Response(JSON.stringify(o), { status });
    if (opts.failAt && opts.failAt.path.test(url) && method !== 'GET') return json({ message: 'boom' }, opts.failAt.status);
    if (/\/git\/ref\/heads\//.test(url)) return json({ object: { sha: 'c1' } });
    if (/\/git\/commits\/c1$/.test(url)) return json({ tree: { sha: 't1' } });
    const m = /\/contents\/(.+?)\?ref=c1$/.exec(url);
    if (m) {
      const name = m[1] as string;
      if (!(name in files)) return json({ message: 'Not Found' }, 404);
      return json({ content: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(files[name], null, 2)))) });
    }
    if (/\/git\/blobs$/.test(url)) { const sha = `b${++blobN}`; blobs[sha] = String(body?.content); return json({ sha }); }
    if (/\/git\/trees$/.test(url)) {
      for (const t of (body?.tree as { path: string; sha: string }[])) written[t.path] = blobs[t.sha] as string;
      return json({ sha: 't2' });
    }
    if (/\/git\/commits$/.test(url)) return json({ sha: 'c2' });
    if (/\/git\/refs\/heads\//.test(url) && method === 'PATCH') return json({ ok: true });
    return json({ message: 'unexpected' }, 500);
  }) as typeof fetch;
  return { fetchImpl, log, written };
}

const cfg = { repo: 'o/r', branch: 'claude/dev', token: 't' };
const change = (id: string, before: string, after: string): Change => ({ id, before, after });

describe('GitHub 게시', () => {
  const files = {
    'src/data/strings.ko.json': { title: { start: '출근하기', resume: '이어하기' } },
    'src/data/customers.json': [{ id: 'hanyeoreum', lines: { opening: '저…' } }],
  };

  it('바뀐 글만 최신 파일에 적용해 한 커밋으로 올린다', async () => {
    const g = fakeGithub(files);
    const r = await publishChanges(cfg, [
      change('strings/title/start', '출근하기', '출근!'),
      change('customers/hanyeoreum/lines/opening', '저…', '안녕하세요'),
    ], g.fetchImpl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).toBe(2);
    expect(r.commitUrl).toBe('https://github.com/o/r/commit/c2');
    expect(JSON.parse(g.written['src/data/strings.ko.json'] as string)).toEqual({ title: { start: '출근!', resume: '이어하기' } });
    expect(JSON.parse(g.written['src/data/customers.json'] as string)[0].lines.opening).toBe('안녕하세요');
    // 커밋은 하나, 브랜치는 강제 갱신이 아니다
    const ref = g.log.find((x) => x.method === 'PATCH')!;
    expect(ref.body).toEqual({ sha: 'c2', force: false });
    expect(g.log.filter((x) => x.url.endsWith('/git/commits') && x.method === 'POST')).toHaveLength(1);
  });

  it('저장소의 글이 편집기가 아는 원문과 다르면 덮어쓰지 않고 건너뛴다', async () => {
    const g = fakeGithub(files);
    const r = await publishChanges(cfg, [change('strings/title/start', '옛날 원문', '출근!')], g.fetchImpl);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('nothing');
    expect(r.skipped).toEqual([{ id: 'strings/title/start', reason: 'changed' }]);
    expect(Object.keys(g.written)).toHaveLength(0);
  });

  it('없는 경로는 건너뛰고 나머지는 올린다', async () => {
    const g = fakeGithub(files);
    const r = await publishChanges(cfg, [change('strings/title/nope', 'x', 'y'), change('strings/title/resume', '이어하기', '계속하기')], g.fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skipped).toEqual([{ id: 'strings/title/nope', reason: 'missing' }]);
  });

  it('401·404·충돌·네트워크 실패를 구분해서 말한다', async () => {
    const mk = (status: number, path = /git\/ref\//) => fakeGithub(files, { failAt: { path, status } });
    // 읽기 단계의 실패는 GET이라 failAt이 안 걸리므로 별도 가짜로
    const unauthorized = (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as unknown as typeof fetch;
    const missing = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const c = [change('strings/title/start', '출근하기', '출근!')];
    const a = await publishChanges(cfg, c, unauthorized);
    expect(a.ok === false && a.kind).toBe('auth');
    const b = await publishChanges(cfg, c, missing);
    expect(b.ok === false && b.kind).toBe('notfound');
    const n = await publishChanges(cfg, c, offline);
    expect(n.ok === false && n.kind).toBe('network');
    if (!n.ok) expect(n.message).toContain('아무것도 올라가지 않았어요');
    // 마지막 단계(브랜치 갱신) 충돌 = 다시 시도
    const g = mk(422, /git\/refs\//);
    const conflict = await publishChanges(cfg, c, g.fetchImpl);
    expect(conflict.ok === false && conflict.kind).toBe('conflict');
  });

  it('수정이 없으면 아무것도 요청하지 않는다', async () => {
    const g = fakeGithub(files);
    const r = await publishChanges(cfg, [], g.fetchImpl);
    expect(r.ok === false && r.kind).toBe('nothing');
    expect(g.log).toHaveLength(0);
  });
});
