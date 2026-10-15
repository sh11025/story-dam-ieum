// 사용자가 입력한 개인 AI 키로 AI 회사에 요청을 대신 보내는 부분입니다.
// 키는 요청 한 번에만 쓰고 저장하거나 기록하지 않습니다.
import { obj, type Json } from './json.ts';
import {
  AI_PROVIDERS,
  defaultAiModel,
  isValidModelName,
  type AiProvider,
} from '../shared/aiModels.ts';

export type AiModels = { openai?: string; gemini?: string; claude?: string };
type AiResult = { ok: true; content: string } | { ok: false; type: string };

const PROVIDERS: string[] = AI_PROVIDERS;

/**
 * 쓸 모델 고르기: 사용자가 AI 설정 창에서 고른 모델 → 서버 설정(AI_*_MODEL) → 기본 모델(균형형).
 * 사용자가 보낸 이름이 형식에 맞지 않으면 null(요청 거절).
 */
function pickModel(provider: string, requested: unknown, models: AiModels): string | null {
  const name = typeof requested === 'string' ? requested.trim() : '';
  if (name) return isValidModelName(name) ? name : null;
  const configured =
    provider === 'ChatGPT' ? models.openai : provider === 'Gemini' ? models.gemini : models.claude;
  return configured || defaultAiModel(provider as AiProvider);
}
const TASKS = [
  'test',
  'revision',
  'experience',
  'resume',
  'interview-answer',
  'interview-questions',
];
const FACT_RULE =
  '사용자가 제공하지 않은 경력, 역할, 성과, 숫자, 회사, 학력, 자격증을 만들지 마세요. 정보가 부족하면 확인 질문을 하세요. 한국어로 간결하게 답하세요.';

export async function callAi(body: Json, models: AiModels, signal: AbortSignal): Promise<AiResult> {
  const provider = String(body.provider);
  const task = String(body.task);
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const text = typeof body.text === 'string' ? body.text : '';
  const instruction = typeof body.instruction === 'string' ? body.instruction : '';
  if (
    !PROVIDERS.includes(provider) ||
    !TASKS.includes(task) ||
    !key ||
    key.length > 512 ||
    text.length > 24000 ||
    instruction.length > 4000
  )
    return { ok: false, type: 'bad_request' };
  const model = pickModel(provider, body.model, models);
  if (!model) return { ok: false, type: 'bad_request' };

  const prompt =
    task === 'test'
      ? '연결 확인용으로 OK 한 단어만 답하세요.'
      : task === 'interview-questions'
        ? `다음 입력만 참고해 면접 연습 질문을 최대 3개 제안하세요. 사실을 가정하지 마세요.\n입력:\n${text}`
        : `작업 유형: ${task}\n사용자 요청: ${instruction}\n선택한 원문:\n${text}\n원문의 사실을 유지하며 요청한 부분만 개선하세요.`;

  return sendToProvider(
    { provider, key, model, system: FACT_RULE, prompt, maxTokens: 600 },
    signal,
  );
}

type ProviderRequest = {
  provider: string;
  key: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  /** AI가 직접 웹 페이지를 읽게 할지 (공고 주소 읽기) */
  webAccess?: boolean;
};

/** AI 회사별 요청 형식을 맞춰 보내고, 답한 글만 꺼냅니다. */
async function sendToProvider(r: ProviderRequest, signal: AbortSignal): Promise<AiResult> {
  const { provider, key, model, system, prompt, maxTokens, webAccess } = r;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let endpoint: string;
  let payload: unknown;
  if (provider === 'ChatGPT') {
    endpoint = 'https://api.openai.com/v1/responses';
    headers.authorization = `Bearer ${key}`;
    payload = {
      model,
      store: false,
      max_output_tokens: maxTokens,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      ...(webAccess ? { tools: [{ type: 'web_search' }] } : {}),
    };
  } else if (provider === 'Gemini') {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers['x-goog-api-key'] = key;
    payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
      ...(webAccess ? { tools: [{ url_context: {} }] } : {}),
    };
  } else {
    endpoint = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    payload = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      ...(webAccess
        ? { tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2 }] }
        : {}),
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok)
      return {
        ok: false,
        type:
          res.status === 401 || res.status === 403
            ? 'invalid_key'
            : res.status === 429
              ? 'rate_limit'
              : res.status === 404 || res.status === 400
                ? 'model_unavailable'
                : 'unavailable',
      };
    const data = obj(await res.json().catch(() => null));
    const texts = (list: unknown) =>
      Array.isArray(list)
        ? list.map((x) => obj(x)?.text).filter((x): x is string => typeof x === 'string')
        : [];
    let content = '';
    if (provider === 'ChatGPT')
      content = (
        Array.isArray(data?.output) ? data.output.flatMap((x) => texts(obj(x)?.content)) : []
      )
        .join('\n')
        .trim();
    if (provider === 'Gemini')
      content = texts(
        obj(obj(Array.isArray(data?.candidates) ? data.candidates[0] : null)?.content)?.parts,
      )
        .join('\n')
        .trim();
    if (provider === 'Claude') content = texts(data?.content).join('\n').trim();
    return content ? { ok: true, content } : { ok: false, type: 'malformed_response' };
  } catch {
    return { ok: false, type: signal.aborted ? 'timeout' : 'unavailable' };
  }
}

// ── AI가 공고 주소를 직접 읽고 항목을 정리 ─────────────────────────────
const JOB_RULE =
  '당신은 채용공고 정리 도우미입니다. 주어진 주소의 페이지를 직접 읽고, 페이지에 실제로 적힌 내용만 옮기세요. ' +
  '없는 내용은 빈 문자열로 두고 절대 지어내지 마세요. 답은 JSON 하나만 출력하세요.';

export type AiJobResult =
  | {
      ok: true;
      fields: {
        company: string;
        role: string;
        duties: string;
        requirements: string;
        preferred: string;
      };
      deadline: string;
      text: string;
    }
  | { ok: false; type: string };

/** AI 답에서 JSON 부분만 꺼내 안전한 값으로 정리합니다. */
export function parseAiJobAnswer(answer: string): AiJobResult {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, type: 'malformed_response' };
  let data: Json | null = null;
  try {
    data = obj(JSON.parse(answer.slice(start, end + 1)));
  } catch {
    return { ok: false, type: 'malformed_response' };
  }
  if (!data) return { ok: false, type: 'malformed_response' };
  const s = (k: string, max = 6000) =>
    typeof data![k] === 'string' ? (data![k] as string).trim().slice(0, max) : '';
  if (data.readable === false) return { ok: false, type: 'unreadable' };
  const fields = {
    company: s('company', 200),
    role: s('role', 200),
    duties: s('duties'),
    requirements: s('requirements'),
    preferred: s('preferred'),
  };
  if (!fields.duties && !fields.requirements && !fields.role)
    return { ok: false, type: 'unreadable' };
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(s('deadline', 10)) ? s('deadline', 10) : '';
  const text = [
    fields.company && `회사명: ${fields.company}`,
    fields.role && `직무: ${fields.role}`,
    fields.duties && `주요업무\n${fields.duties}`,
    fields.requirements && `자격요건\n${fields.requirements}`,
    fields.preferred && `우대사항\n${fields.preferred}`,
    deadline && `마감일: ${deadline}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { ok: true, fields, deadline, text };
}

export async function callAiJobPosting(
  body: Json,
  models: AiModels,
  signal: AbortSignal,
): Promise<AiJobResult> {
  const provider = String(body.provider);
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (
    !PROVIDERS.includes(provider) ||
    !key ||
    key.length > 512 ||
    !/^https?:\/\//.test(url) ||
    url.length > 2048
  )
    return { ok: false, type: 'bad_request' };
  const model = pickModel(provider, body.model, models);
  if (!model) return { ok: false, type: 'bad_request' };
  const prompt =
    `다음 채용공고 페이지를 읽어 주세요: ${url}\n\n` +
    '아래 모양의 JSON 하나만 답하세요. 각 값은 페이지에 적힌 문장을 그대로(목록은 줄바꿈으로) 옮기세요.\n' +
    '{"readable": true, "company": "", "role": "", "duties": "", "requirements": "", "preferred": "", "deadline": "YYYY-MM-DD 또는 빈칸"}\n' +
    '페이지를 열 수 없거나 공고가 그림이라 글을 읽을 수 없으면 {"readable": false} 만 답하세요.';
  const result = await sendToProvider(
    { provider, key, model, system: JOB_RULE, prompt, maxTokens: 2500, webAccess: true },
    signal,
  );
  return result.ok ? parseAiJobAnswer(result.content) : result;
}
