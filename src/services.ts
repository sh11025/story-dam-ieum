import { useEffect, useState } from 'react';
import type { JobFields } from '../shared/jobPosting';
import type { FaqItem, NoticeItem } from '../shared/notices';
// The personal provider key exists only in this module's memory. No work or secret is persisted.
type AiProvider = 'Gemini' | 'ChatGPT' | 'Claude';
let aiSession: { provider: AiProvider; key: string } = { provider: 'ChatGPT', key: '' };
let revisionPending = false;
let connectionTestPending = false;
const unavailableMessage =
  '외부 AI가 연결되지 않았습니다. 안전한 서버 프록시를 설정한 후 다시 시도해 주세요. 원문은 그대로 유지됩니다.';
const aiListeners = new Set<() => void>();
export function configureAiSession(provider: AiProvider, key: string) {
  aiSession = { provider, key };
  aiListeners.forEach((l) => l());
}
/** 화면에서 "AI 키가 있는지"를 쓰면, 키를 넣거나 지울 때 화면이 다시 그려집니다. */
export function useHasAiKey() {
  const [has, setHas] = useState(hasAiKey);
  useEffect(() => {
    const l = () => setHas(hasAiKey());
    aiListeners.add(l);
    return () => {
      aiListeners.delete(l);
    };
  }, []);
  return has;
}
/** 사용자가 AI 키를 입력했는지 (입력했을 때만 AI 요청을 보냅니다) */
export const hasAiKey = () => !!aiSession.key.trim();
type AiErrorType =
  | 'invalid_key'
  | 'rate_limit'
  | 'unavailable'
  | 'timeout'
  | 'cancelled'
  | 'malformed_response'
  | 'bad_request'
  | 'unauthorized'
  | 'config_required';
const aiErrorMessages: Record<AiErrorType, string> = {
  invalid_key: 'API 키를 확인해 주세요.',
  rate_limit: 'AI 요청이 잠시 많습니다. 잠시 후 다시 시도해 주세요.',
  unavailable: '선택한 AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  timeout: 'AI 응답이 늦어 요청을 종료했습니다. 다시 시도해 주세요.',
  cancelled: '요청이 취소되었습니다. 원문은 그대로 유지됩니다.',
  malformed_response: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.',
  bad_request: '전송할 내용을 확인해 주세요.',
  unauthorized: 'AI 연결을 확인하지 못했습니다. API 키를 다시 확인해 주세요.',
  config_required: unavailableMessage,
};
async function aiProxy(
  task: 'test' | 'revision' | 'experience' | 'resume' | 'interview-answer' | 'interview-questions',
  payload: Record<string, string>,
  signal?: AbortSignal,
) {
  if (!aiSession.key.trim()) throw new Error(unavailableMessage);
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname))
    throw new Error('AI 연결은 HTTPS에서만 사용할 수 있어요.');
  let response: Response;
  try {
    response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: aiSession.provider, key: aiSession.key, task, ...payload }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    throw new Error('AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', { cause: error });
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok && !(result && typeof result === 'object' && 'success' in result))
    throw new Error(unavailableMessage);
  if (!result || typeof result !== 'object')
    throw new Error('AI 응답을 읽지 못했습니다. 다시 시도해 주세요.');
  const data = result as Record<string, unknown>;
  if (data.success !== true) {
    const type =
      data.error && typeof data.error === 'object'
        ? (data.error as Record<string, unknown>).type
        : null;
    throw new Error(
      typeof type === 'string' && type in aiErrorMessages
        ? aiErrorMessages[type as AiErrorType]
        : aiErrorMessages.unavailable,
    );
  }
  return data;
}
export async function testAiConnection(): Promise<void> {
  if (connectionTestPending) throw new Error('연결 확인이 진행 중입니다.');
  connectionTestPending = true;
  try {
    const result = await aiProxy('test', {});
    if (typeof result.content !== 'string' || !result.content.trim())
      throw new Error('AI 연결을 확인하지 못했습니다. 설정을 다시 확인해 주세요.');
  } finally {
    connectionTestPending = false;
  }
}
export async function requestRevision(
  input: {
    text: string;
    instruction: string;
    task?: 'revision' | 'experience' | 'resume' | 'interview-answer' | 'interview-questions';
  },
  signal: AbortSignal,
): Promise<string> {
  if (revisionPending) throw new Error('이전 AI 요청이 끝난 뒤 다시 시도해 주세요.');
  revisionPending = true;
  try {
    const result = await aiProxy(
      input.task ?? 'revision',
      { text: input.text, instruction: input.instruction },
      signal,
    );
    if (typeof result.content !== 'string' || !result.content.trim())
      throw new Error('AI 제안이 비어 있어요. 원문은 유지했습니다. 다시 시도해 주세요.');
    return result.content;
  } finally {
    revisionPending = false;
  }
}
type DocumentReadResult = {
  text: string;
  totalPages?: number;
  processedPages?: number;
  truncated: boolean;
};

export function documentReadNotice(result: DocumentReadResult) {
  if (!result.truncated || !result.totalPages || !result.processedPages) return '';
  return `이 PDF는 ${result.totalPages}페이지예요. 현재 최대 ${result.processedPages}페이지까지만 가져왔어요. ${result.processedPages + 1}~${result.totalPages}페이지는 읽지 않았어요.`;
}

export async function readDocument(file: File): Promise<DocumentReadResult> {
  if (file.size > 8 * 1024 * 1024) throw new Error('8MB 이하의 파일을 선택해 주세요.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'txt' || ext === 'md') return { text: await file.text(), truncated: false };
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value, truncated: false };
  }
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await loading.promise;
    try {
      let text = '';
      const totalPages = doc.numPages;
      const processedPages = Math.min(totalPages, 100);
      for (let i = 1; i <= processedPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
      }
      const result = {
        text,
        totalPages,
        processedPages,
        truncated: processedPages < totalPages,
      };
      if (!text.trim())
        throw new Error(
          `이 PDF에서 텍스트를 찾지 못했어요. 스캔 문서는 직접 붙여넣어 주세요. ${documentReadNotice(result)}`.trim(),
        );
      return result;
    } finally {
      await loading.destroy();
    }
  }
  throw new Error('TXT, DOCX, PDF 파일을 선택해 주세요.');
}

// ── 공고 주소로 가져오기 ──────────────────────────────────────────────
type JobPostingResult = {
  url: string;
  title: string;
  text: string;
  fields: Partial<JobFields>;
  deadline: string;
  warning: string;
};

export async function fetchJobPosting(
  url: string,
  signal?: AbortSignal,
): Promise<JobPostingResult> {
  let response: Response;
  try {
    response = await fetch('/api/job-posting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', { cause: error });
  }
  const data = (await response.json().catch(() => null)) as
    (JobPostingResult & { error?: string }) | null;
  if (!response.ok || !data || typeof data.text !== 'string')
    throw new Error(data?.error || '공고를 가져오지 못했어요. 공고 내용을 붙여넣어 주세요.');
  return data;
}

/** AI가 공고 주소를 직접 읽어 정리 (사용자가 AI 키를 넣었을 때만) */
export async function fetchJobPostingWithAi(
  url: string,
): Promise<{ text: string; fields: Partial<JobFields>; deadline: string }> {
  if (!aiSession.key.trim()) throw new Error('오른쪽 위 설정에서 AI 키를 먼저 넣어 주세요.');
  let response: Response;
  try {
    response = await fetch('/api/job-posting/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, provider: aiSession.provider, key: aiSession.key }),
      cache: 'no-store',
    });
  } catch (error) {
    throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', { cause: error });
  }
  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    fields?: Partial<JobFields>;
    deadline?: string;
    text?: string;
    error?: { type?: string; message?: string };
  } | null;
  if (data?.success && data.text)
    return { text: data.text, fields: data.fields ?? {}, deadline: data.deadline ?? '' };
  const type = data?.error?.type ?? '';
  if (type === 'unreadable')
    throw new Error(
      'AI도 이 공고를 읽지 못했어요. 공고가 그림이거나 사이트가 막고 있을 수 있어요. 공고 내용을 복사해 붙여넣어 주세요.',
    );
  if (data?.error?.message) throw new Error(data.error.message);
  throw new Error(
    type in aiErrorMessages ? aiErrorMessages[type as AiErrorType] : aiErrorMessages.unavailable,
  );
}

// ── 공지 ────────────────────────────────────────────────────────────
export async function fetchNotices(
  signal?: AbortSignal,
): Promise<{ items: NoticeItem[]; faqs: FaqItem[] | null }> {
  const response = await fetch('/api/notices', { signal, cache: 'no-store' });
  const data = (await response.json().catch(() => null)) as {
    items?: NoticeItem[];
    faqs?: FaqItem[] | null;
    error?: string;
  } | null;
  if (!response.ok || !data || !Array.isArray(data.items))
    throw new Error(data?.error || '공지를 불러오지 못했어요.');
  return { items: data.items, faqs: Array.isArray(data.faqs) ? data.faqs : null };
}
