/**
 * 편집한 글을 GitHub 저장소의 src/data/*.json에 직접 커밋한다 (게시).
 * 저장소에 올라가면 Pages 워크플로가 다시 빌드·배포해서, 게임을 여는 모든 사람에게 바뀐 글이 보인다.
 * 브라우저(CORS)에서 api.github.com을 부르며, 파일 여러 개를 커밋 하나로 올린다(git 데이터 API).
 */
import { FILE_NAMES, getAt, setAt, splitId, type FileId } from './textmap';

export interface PublishConfig {
  /** "소유자/저장소" */
  repo: string;
  branch: string;
  /** 이 저장소의 Contents: 읽기·쓰기 권한이 있는 개인 액세스 토큰 */
  token: string;
}

export interface Change { id: string; before: string; after: string }

export interface Skipped { id: string; reason: 'missing' | 'changed' }

export type PublishResult =
  | { ok: true; commitUrl: string; sha: string; files: string[]; applied: number; skipped: Skipped[] }
  | { ok: false; kind: 'nothing' | 'auth' | 'notfound' | 'conflict' | 'rejected' | 'network' | 'unknown'; step: string; message: string; skipped?: Skipped[] };

type Fetch = typeof fetch;

class ApiError extends Error {
  constructor(readonly step: string, readonly status: number, message: string) { super(message); }
}

const decodeB64 = (b64: string): string => {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export const DATA_DIR = 'src/data';

/** 변경 목록을 저장소의 최신 JSON에 적용해 한 커밋으로 올린다. 못 올린 이유는 종류별로 정직하게 돌려준다. */
export async function publishChanges(cfg: PublishConfig, changes: readonly Change[], fetchImpl: Fetch = fetch): Promise<PublishResult> {
  if (changes.length === 0) return { ok: false, kind: 'nothing', step: '확인', message: '올릴 수정이 없어요.' };
  const base = `https://api.github.com/repos/${cfg.repo}`;
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const call = async <T>(step: string, path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch (e) {
      throw new ApiError(step, 0, e instanceof Error ? e.message : '네트워크 오류');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = ((await res.json()) as { message?: string }).message ?? ''; } catch { /* 본문 없음 */ }
      throw new ApiError(step, res.status, detail);
    }
    return (await res.json()) as T;
  };

  try {
    const ref = await call<{ object: { sha: string } }>('브랜치 확인', `/git/ref/heads/${encodeURIComponent(cfg.branch).replace(/%2F/g, '/')}`);
    const headSha = ref.object.sha;
    const head = await call<{ tree: { sha: string } }>('최신 커밋 읽기', `/git/commits/${headSha}`);

    // 건드릴 파일만 최신 내용으로 읽는다
    const byFile = new Map<FileId, Change[]>();
    for (const c of changes) {
      const p = splitId(c.id);
      if (!p) continue;
      byFile.set(p.file, [...(byFile.get(p.file) ?? []), c]);
    }
    const skipped: Skipped[] = [];
    const writes: { path: string; content: string }[] = [];
    let applied = 0;
    for (const [file, list] of byFile) {
      const path = `${DATA_DIR}/${FILE_NAMES[file]}`;
      const f = await call<{ content: string }>(`${FILE_NAMES[file]} 읽기`, `/contents/${path}?ref=${headSha}`);
      const json = JSON.parse(decodeB64(f.content)) as unknown;
      let touched = 0;
      for (const c of list) {
        const p = splitId(c.id);
        const now = p ? getAt(json, p.path) : undefined;
        if (!p || typeof now !== 'string') { skipped.push({ id: c.id, reason: 'missing' }); continue; }
        if (now !== c.before) {
          // 저장소의 글이 편집기가 아는 원문과 다르다: 이미 같은 글이면 건너뛰고, 다르면 덮어쓰지 않는다
          if (now !== c.after) skipped.push({ id: c.id, reason: 'changed' });
          continue;
        }
        if (c.before !== c.after && setAt(json, p.path, c.after)) { touched++; applied++; }
      }
      if (touched > 0) writes.push({ path, content: `${JSON.stringify(json, null, 2)}\n` });
    }
    if (writes.length === 0) {
      return { ok: false, kind: 'nothing', step: '확인', message: skipped.length ? '올릴 수 있는 수정이 없어요(저장소의 글이 편집기 원문과 달라요).' : '저장소에 이미 같은 글이 있어요.', skipped };
    }

    const tree = await call<{ sha: string }>('파일 묶기', '/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: head.tree.sha,
        tree: await Promise.all(writes.map(async (w) => {
          const blob = await call<{ sha: string }>('파일 올리기', '/git/blobs', { method: 'POST', body: JSON.stringify({ content: w.content, encoding: 'utf-8' }) });
          return { path: w.path, mode: '100644', type: 'blob', sha: blob.sha };
        })),
      }),
    });
    const commit = await call<{ sha: string }>('커밋 만들기', '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: `게임 글 수정 ${applied}개 (문구 편집기)`, tree: tree.sha, parents: [headSha] }),
    });
    await call('브랜치 갱신', `/git/refs/heads/${encodeURIComponent(cfg.branch).replace(/%2F/g, '/')}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    return { ok: true, commitUrl: `https://github.com/${cfg.repo}/commit/${commit.sha}`, sha: commit.sha, files: writes.map((w) => w.path), applied, skipped };
  } catch (e) {
    if (e instanceof ApiError) return explain(e);
    return { ok: false, kind: 'unknown', step: '알 수 없음', message: e instanceof Error ? e.message : '알 수 없는 오류' };
  }
}

function explain(e: ApiError): PublishResult {
  const { step, status } = e;
  if (status === 0) return { ok: false, kind: 'network', step, message: `GitHub에 연결하지 못했어요(${e.message}). 인터넷을 확인하세요. "${step}" 단계라서 ${step === '브랜치 갱신' ? '올라갔는지 확인하지 못했어요 — 저장소의 커밋 목록을 확인해 주세요.' : '아무것도 올라가지 않았어요.'}` };
  if (status === 401) return { ok: false, kind: 'auth', step, message: '토큰이 올바르지 않거나 만료됐어요(401). 새 토큰을 입력해 주세요.' };
  if (status === 403) return { ok: false, kind: 'auth', step, message: `이 토큰에 쓰기 권한이 없어요(403). Contents: 읽기·쓰기 권한이 필요해요.${e.message ? ` (${e.message})` : ''}` };
  if (status === 404) return { ok: false, kind: 'notfound', step, message: `저장소·브랜치·파일을 찾지 못했어요(404). "${step}" 단계. 저장소 이름과 브랜치를 확인하세요. 토큰이 그 저장소에 접근할 수 있어야 해요.` };
  if (status === 409 || status === 422) return { ok: false, kind: 'conflict', step, message: '그 사이 저장소가 바뀌었어요. 다시 한 번 게시해 주세요(최신 내용에 맞춰 다시 계산해요).' };
  return { ok: false, kind: 'rejected', step, message: `GitHub가 요청을 받아들이지 않았어요(${status}). "${step}" 단계.${e.message ? ` ${e.message}` : ''}` };
}
