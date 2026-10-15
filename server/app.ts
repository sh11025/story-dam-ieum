// 사용자 사이트의 서버 기능(/api/...)을 모아 둔 곳입니다.
//  - /api/health       서버가 살아 있는지 확인 (Render가 사용)
//  - /api/notices      관리자 저장소(깃허브)의 notices.json을 읽어 공지 목록 전달
//  - /api/job-posting  공고 주소를 받아 페이지 내용을 가져옴
//  - /api/ai           개인 AI 키로 AI 요청을 대신 전달
import { Hono, type Context } from 'hono';
import { callAi, callAiJobPosting, type AiModels } from './ai.ts';
import { importJobPage } from './jobPage.ts';
import { FetchError, checkUrl } from './safeFetch.ts';
import { parseNoticeFile } from '../shared/notices.ts';

type AppOptions = {
  noticesUrl?: string;
  aiModels?: AiModels;
  /** 테스트에서만 true: 127.0.0.1 같은 내부 주소의 공고도 가져올 수 있게 함 */
  allowPrivateJobUrls?: boolean;
  noticesCacheMs?: number;
};

export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): AppOptions {
  return {
    noticesUrl: env.NOTICES_URL?.trim() || undefined,
    aiModels: {
      openai: env.AI_OPENAI_MODEL,
      gemini: env.AI_GEMINI_MODEL,
      claude: env.AI_CLAUDE_MODEL,
    },
    allowPrivateJobUrls: env.ALLOW_PRIVATE_JOB_URLS === '1' && env.NODE_ENV !== 'production',
  };
}

/** 같은 사람이 너무 자주 요청하지 못하게 막는 간단한 제한(서버 메모리 사용). */
function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; start: number }>();
  return (key: string) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { count: 1, start: now });
      return true;
    }
    return ++entry.count <= max;
  };
}

// 접속한 사람의 주소. 앞단(Cloudflare/Render)이 넣어 주는 값을 쓰고,
// 사용자가 꾸며 넣을 수 있는 X-Forwarded-For의 앞부분 대신 마지막(프록시가 붙인) 값을 씁니다.
const clientIp = (c: Context) =>
  c.req.header('true-client-ip') ||
  c.req.header('x-forwarded-for')?.split(',').pop()?.trim() ||
  c.req.header('x-real-ip') ||
  'local';

/** 다른 사이트에서 우리 서버 기능을 몰래 쓰지 못하도록, 우리 화면에서 온 요청인지 확인합니다. */
function sameOrigin(c: Context) {
  const origin = c.req.header('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === (c.req.header('x-forwarded-host') ?? c.req.header('host'));
  } catch {
    return false;
  }
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono();
  const aiLimit = createLimiter(30, 60 * 60 * 1000);
  const jobLimit = createLimiter(20, 10 * 60 * 1000);
  const cacheMs = options.noticesCacheMs ?? 60_000;
  // 깃허브에서 받은 공지 파일 원본을 잠시 보관합니다(게시 기간은 응답할 때마다 다시 확인).
  let noticeCache: { at: number; raw: unknown } | null = null;
  const respondNotices = (c: Context, raw: unknown, extra: Record<string, unknown> = {}) => {
    const { notices, faqs } = parseNoticeFile(raw);
    return c.json({ items: notices, faqs, configured: true, ...extra });
  };

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
  });

  // 공개해도 되는 읽기 전용 정보는 관리자 화면(다른 주소)에서도 확인할 수 있게 엽니다.
  const publicRead = async (c: Context, next: () => Promise<void>) => {
    await next();
    c.header('access-control-allow-origin', '*');
  };
  app.use('/api/health', publicRead);
  app.use('/api/notices', publicRead);

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      noticesConfigured: !!options.noticesUrl,
      // 사용자가 AI 설정 창에서 모델을 고르고, 안 고르면 기본 모델을 쓰므로 세 AI 모두 항상 쓸 수 있어요.
      // models: 서버 설정(AI_*_MODEL)으로 기본 모델을 바꿨으면 그 이름, 아니면 '기본'
      ai: { ChatGPT: true, Gemini: true, Claude: true },
      models: {
        ChatGPT: options.aiModels?.openai || '기본',
        Gemini: options.aiModels?.gemini || '기본',
        Claude: options.aiModels?.claude || '기본',
      },
    }),
  );

  app.get('/api/notices', async (c) => {
    if (!options.noticesUrl) return c.json({ items: [], faqs: null, configured: false });
    if (noticeCache && Date.now() - noticeCache.at < cacheMs)
      return respondNotices(c, noticeCache.raw);
    try {
      const res = await fetch(
        `${options.noticesUrl}${options.noticesUrl.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / cacheMs)}`,
        {
          signal: AbortSignal.timeout(8000),
          headers: { accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const raw: unknown = await res.json();
      parseNoticeFile(raw); // 형식이 맞는지 먼저 확인
      noticeCache = { at: Date.now(), raw };
      return respondNotices(c, raw);
    } catch {
      // 깃허브에 잠시 연결되지 않아도 마지막으로 받은 공지를 보여 줍니다.
      if (noticeCache) return respondNotices(c, noticeCache.raw, { stale: true });
      return c.json({ error: '공지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
    }
  });

  app.post('/api/job-posting', async (c) => {
    if (!sameOrigin(c)) return c.json({ error: '요청을 확인할 수 없습니다.' }, 403);
    if (!jobLimit(clientIp(c)))
      return c.json({ error: '요청이 많아요. 잠시 후 다시 시도해 주세요.' }, 429);
    const body = (await c.req.json().catch(() => null)) as {
      url?: unknown;
    } | null;
    const url = typeof body?.url === 'string' ? body.url : '';
    if (!url.trim() || url.length > 2048)
      return c.json({ error: '공고 주소를 입력해 주세요.' }, 400);
    try {
      return c.json(await importJobPage(url, { allowPrivate: options.allowPrivateJobUrls }));
    } catch (error) {
      if (error instanceof FetchError)
        return c.json(
          { error: error.message, code: error.code },
          error.code === 'invalid_url' || error.code === 'blocked' ? 400 : 502,
        );
      return c.json({ error: '공고를 가져오지 못했어요. 공고 내용을 붙여넣어 주세요.' }, 502);
    }
  });

  // 우리 서버가 공고를 못 가져왔을 때: 사용자의 AI 키로 AI가 직접 페이지를 읽어 정리
  app.post('/api/job-posting/ai', async (c) => {
    if (!sameOrigin(c)) return c.json({ error: '요청을 확인할 수 없습니다.' }, 403);
    if (!aiLimit(clientIp(c))) return c.json({ success: false, error: { type: 'rate_limit' } });
    const data = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object')
      return c.json({ success: false, error: { type: 'bad_request' } });
    try {
      checkUrl(String(data.url ?? ''));
    } catch (error) {
      return c.json({
        success: false,
        error: { type: 'bad_request', message: (error as Error).message },
      });
    }
    const result = await callAiJobPosting(data, options.aiModels ?? {}, AbortSignal.timeout(60000));
    return c.json(
      result.ok
        ? {
            success: true,
            fields: result.fields,
            deadline: result.deadline,
            text: result.text,
          }
        : { success: false, error: { type: result.type } },
    );
  });

  app.post('/api/ai', async (c) => {
    if (!sameOrigin(c)) return c.json({ error: '요청을 확인할 수 없습니다.' }, 403);
    if (!aiLimit(clientIp(c))) return c.json({ success: false, error: { type: 'rate_limit' } });
    const data = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object')
      return c.json({ error: '전송할 내용을 확인해 주세요.' }, 400);
    const result = await callAi(data, options.aiModels ?? {}, AbortSignal.timeout(30000));
    return c.json(
      result.ok
        ? { success: true, content: result.content }
        : { success: false, error: { type: result.type } },
    );
  });

  app.all('/api/*', (c) => c.json({ error: '요청한 기능을 찾지 못했습니다.' }, 404));
  app.onError((_e, c) =>
    c.json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500),
  );
  return app;
}
