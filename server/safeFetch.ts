// 사용자가 넣은 주소의 페이지를 서버가 대신 받아오는 부분입니다.
// 서버 내부망이나 이 컴퓨터 자신(127.0.0.1 등)으로 가는 주소는 막아서,
// 공고 가져오기 기능이 내부 시스템을 엿보는 통로로 쓰이지 않게 합니다.
import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code:
      'invalid_url' | 'blocked' | 'timeout' | 'too_large' | 'not_html' | 'http_error' | 'network',
  ) {
    super(message);
  }
}

/** 내부망·특수 주소인지 확인합니다. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(address) === 6) {
    const v = address.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      v === '::' ||
      v === '::1' ||
      v.startsWith('fc') ||
      v.startsWith('fd') ||
      v.startsWith('fe8') ||
      v.startsWith('fe9') ||
      v.startsWith('fea') ||
      v.startsWith('feb') ||
      v.startsWith('ff')
    );
  }
  return true;
}

// 실제로 접속하는 순간의 주소를 검사합니다(주소를 바꿔치기하는 공격까지 막기 위해).
const openAgent = new Agent(); // 테스트 전용: 내부 주소 허용
const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error, '', 0);
        const list = (Array.isArray(addresses) ? addresses : [addresses]) as {
          address: string;
          family: number;
        }[];
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (!list.length || bad)
          return callback(new FetchError('접근할 수 없는 주소입니다.', 'blocked'), '', 0);
        // undici는 all 옵션에 따라 배열 또는 단일 주소를 기대합니다.
        if ((options as { all?: boolean }).all)
          return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        callback(null, list[0].address, list[0].family);
      });
    },
  },
});

export function checkUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchError(
      '주소 형식을 확인해 주세요. https:// 로 시작하는 공고 주소를 넣어 주세요.',
      'invalid_url',
    );
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new FetchError('http 또는 https 주소만 가져올 수 있어요.', 'invalid_url');
  if (url.username || url.password)
    throw new FetchError('주소 형식을 확인해 주세요.', 'invalid_url');
  if (allowPrivate) return url;
  if (url.port && !['80', '443'].includes(url.port))
    throw new FetchError('일반 웹 주소만 가져올 수 있어요.', 'blocked');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (isIP(host) && isPrivateAddress(host))
  )
    throw new FetchError('접근할 수 없는 주소입니다.', 'blocked');
  return url;
}

type FetchedPage = { url: string; html: string };

/** 안전하게 웹 페이지를 받아옵니다. 최대 크기·시간·이동 횟수를 제한합니다. */
export async function fetchPage(
  raw: string,
  opts: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    allowPrivate?: boolean;
  } = {},
): Promise<FetchedPage> {
  const {
    timeoutMs = 10000,
    maxBytes = 3 * 1024 * 1024,
    maxRedirects = 4,
    allowPrivate = false,
  } = opts;
  let url = checkUrl(raw, allowPrivate);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url, {
        dispatcher: allowPrivate ? openAgent : guardedAgent,
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; StoryDamIeum/1.0; +job-posting-import)',
          accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8',
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5',
        },
      });
    } catch (error) {
      if (signal.aborted)
        throw new FetchError(
          '공고 페이지 응답이 늦어 중단했어요. 잠시 후 다시 시도해 주세요.',
          'timeout',
        );
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof FetchError) throw cause;
      throw new FetchError('공고 페이지에 연결하지 못했어요. 주소를 확인해 주세요.', 'network');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      url = checkUrl(new URL(res.headers.get('location')!, url).href, allowPrivate);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError(
        res.status === 401 || res.status === 403
          ? '이 사이트는 자동으로 공고를 가져가는 것을 막고 있어요. 공고 내용을 복사해 붙여넣어 주세요.'
          : res.status === 404
            ? '공고 페이지를 찾을 수 없어요. 마감되었거나 주소가 바뀌었을 수 있어요.'
            : '공고 페이지를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
        'http_error',
      );
    }
    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      await res.body?.cancel();
      throw new FetchError(
        '웹 페이지가 아닌 파일이에요. PDF·워드 공고는 "파일 업로드"를 이용해 주세요.',
        'not_html',
      );
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new FetchError('공고 페이지가 너무 커서 가져올 수 없어요.', 'too_large');
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (res.body) {
      for await (const chunk of res.body) {
        size += chunk.byteLength;
        if (size > maxBytes)
          throw new FetchError('공고 페이지가 너무 커서 가져올 수 없어요.', 'too_large');
        chunks.push(chunk);
      }
    }
    const buffer = Buffer.concat(chunks);
    return { url: url.href, html: decode(buffer, type) };
  }
  throw new FetchError('페이지 이동이 너무 많아 중단했어요.', 'network');
}

function decode(buffer: Buffer, contentType: string) {
  let charset = contentType.match(/charset=([\w-]+)/i)?.[1];
  if (!charset)
    charset = buffer
      .subarray(0, 4096)
      .toString('latin1')
      .match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(
      charset?.toLowerCase() === 'ks_c_5601-1987' ? 'euc-kr' : (charset ?? 'utf-8'),
    ).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}
