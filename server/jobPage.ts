// 받아온 공고 페이지(HTML)에서 사람이 읽을 글과 공고 항목을 뽑아냅니다.
import { parse, type HTMLElement } from 'node-html-parser';
import {
  extractDeadline,
  extractJobFields,
  fieldKeyOfLabel,
  type JobFields,
} from '../shared/jobPosting.ts';
import { obj, type Json } from './json.ts';
import { fetchPage } from './safeFetch.ts';

type JobPageResult = {
  url: string;
  title: string;
  text: string;
  fields: Partial<JobFields>;
  deadline: string;
  warning: string;
};

const MAX_TEXT = 20000;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function htmlToText(html: string) {
  // 태그가 없는 글은 그대로 정리합니다(줄바꿈 유지).
  if (!/<[a-z!/]/i.test(html)) return cleanText(html);
  return cleanText(parse(`<div>${html}</div>`).structuredText);
}

// 화면에 보이지 않게 숨긴 글(검색엔진용 직무 목록 등)을 찾는 규칙입니다.
// "border-width:0px" 같은 테두리 설정은 숨김이 아니므로, 속성 이름 전체가 일치할 때만 봅니다.
const HIDDEN_STYLE =
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:height|width|font-size|max-height)\s*:\s*0(?:px|em|rem|%)?\s*(?:!important)?)\s*(?=;|$)/i;
const NOISE =
  'script, style, noscript, svg, iframe, nav, header, footer, form, button, map, [aria-hidden="true"], [hidden]';

/** 보이지 않는 부분과 메뉴·스크립트를 지웁니다. */
function stripNoise(root: HTMLElement) {
  for (const el of root.querySelectorAll(NOISE)) el.remove();
  for (const el of root.querySelectorAll('[style]'))
    if (HIDDEN_STYLE.test(el.getAttribute('style') ?? '')) el.remove();
}

/**
 * 사이트별 맞춤 처리: 공고 본문이 페이지 안의 다른 창(iframe)에 따로 있는 사이트.
 * - 사람인: 공고 페이지 → /zf_user/jobs/relay/view-detail?rec_idx=…
 * - 잡코리아: /Recruit/GI_Read/번호 → /Recruit/GI_Read_Comt_Ifrm?Gno=번호
 * 본문 창 주소를 돌려주고, 해당 없으면 빈 글자를 돌려줍니다.
 */
export function detailPageUrl(html: string, pageUrl: string): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase();
  const isSite = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (isSite('saramin.co.kr')) {
    if (/\/relay\/view-detail/i.test(url.pathname)) return '';
    const src = html.match(/src=["']([^"']*\/zf_user\/jobs\/relay\/view-detail\?[^"']*)["']/i)?.[1];
    if (src) return new URL(src.replace(/&amp;/g, '&'), url).href;
    const rec = url.searchParams.get('rec_idx');
    if (rec && /^\d+$/.test(rec))
      return `https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=${rec}&rec_seq=0`;
  }
  if (isSite('jobkorea.co.kr')) {
    const gno = url.pathname.match(/\/Recruit\/GI_Read\/(\d+)/i)?.[1];
    if (gno) return `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${gno}`;
  }
  return '';
}

/**
 * 표로 정리된 공고 읽기(사람인 등). 글로 펼치면 칸 이름과 값이 따로 떨어져 항목을 못 찾기 때문에 표 구조를 직접 봅니다.
 * - 가로 표: 첫 줄이 "모집부문 | 담당업무 | … | 응시자격" → 아래 줄들의 같은 칸을 모읍니다(모집부문은 앞에 [ ]로 붙임).
 * - 세로 표: 각 줄이 "담당업무 | 내용" → 그대로 읽습니다.
 */
const PREFERRED_LINE = /우대\s*(?:합니다|함|해요)?\.?\s*$/;
function fieldsFromTables(root: HTMLElement): Partial<JobFields> {
  const found: Record<string, string[]> = {};
  const add = (key: keyof JobFields, value: string) => {
    if (value) (found[key] ??= []).push(value);
  };
  const cellsOf = (tr: HTMLElement) =>
    tr.childNodes.filter(
      (n): n is HTMLElement =>
        n instanceof Object && 'tagName' in n && /^(TD|TH)$/.test((n as HTMLElement).tagName),
    );
  const textOf = (el: HTMLElement) => cleanText(el.structuredText);
  const done = new Set<HTMLElement>();
  for (const tr of root.querySelectorAll('tr')) {
    if (done.has(tr)) continue;
    const cells = cellsOf(tr);
    if (cells.length < 2) continue;
    const keys = cells.map((c) => {
      const t = textOf(c);
      return t.length <= 20 ? fieldKeyOfLabel(t) : null;
    });
    const content = keys.filter((k) => k === 'duties' || k === 'requirements' || k === 'preferred');
    // 세로 표: "담당업무 | 내용"
    if (cells.length === 2 && keys[0] && !keys[1]) {
      add(keys[0], textOf(cells[1]));
      continue;
    }
    if (!content.length || keys.filter(Boolean).length < 2) continue;
    // 가로 표: 같은 표의 다음 줄들 중 칸 수가 같은 줄만 읽습니다.
    const roleCol = keys.indexOf('role');
    const rows = (tr.parentNode?.childNodes ?? []).filter(
      (n): n is HTMLElement =>
        n instanceof Object && 'tagName' in n && (n as HTMLElement).tagName === 'TR',
    );
    for (const row of rows.slice(rows.indexOf(tr) + 1)) {
      done.add(row);
      const rc = cellsOf(row);
      if (rc.length !== cells.length) continue;
      const role = roleCol >= 0 ? textOf(rc[roleCol]).replace(/\s*\n\s*/g, ' ') : '';
      keys.forEach((k, i) => {
        if (k !== 'duties' && k !== 'requirements' && k !== 'preferred') return;
        let lines = textOf(rc[i]).split('\n').filter(Boolean);
        const tag = role ? `[${role}] ` : '';
        if (k === 'duties') lines = lines.length ? [lines.join(' ')] : [];
        // 자격 칸 안의 "… 우대" 줄은 우대사항으로 옮깁니다.
        if (k === 'requirements') {
          const pref = lines.filter((l) => PREFERRED_LINE.test(l));
          if (pref.length < lines.length) {
            if (pref.length) add('preferred', tag + pref.join('\n'));
            lines = lines.filter((l) => !PREFERRED_LINE.test(l));
          }
        }
        if (lines.length) add(k, tag + lines.join('\n'));
      });
    }
  }
  const out: Partial<JobFields> = {};
  for (const [k, v] of Object.entries(found)) out[k as keyof JobFields] = v.join('\n');
  return out;
}

/** 페이지 제목에서 회사명·공고 제목을 읽습니다. 예) "[회사] 공고 제목(D-10) - 사람인" */
function fieldsFromTitle(title: string, pageUrl: string): Partial<JobFields> {
  if (/(^|\.)saramin\.co\.kr$/i.test(URL.parse(pageUrl)?.hostname ?? '')) {
    const m = title.match(
      /^\s*\[(.+?)\]\s*(.+?)\s*(?:\((?:D-\d+|D-day|마감|오늘마감|내일마감|상시채용)\))?\s*-\s*사람인\s*$/i,
    );
    if (m) return { company: m[1].trim(), role: m[2].trim() };
  }
  return {};
}
function cleanText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 많은 채용 사이트가 검색엔진용으로 넣어 두는 구조화 정보(JobPosting)를 찾습니다. */
function findJobPosting(root: HTMLElement): Json | null {
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const item = queue.shift();
      if (Array.isArray(item)) queue.push(...item);
      const o = obj(item);
      if (!o) continue;
      const type = o['@type'];
      if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return o;
      if (Array.isArray(o['@graph'])) queue.push(...o['@graph']);
    }
  }
  return null;
}

function fieldsFromJobPosting(job: Json): Partial<JobFields> {
  const fields: Partial<JobFields> = {};
  const company = str(obj(job.hiringOrganization)?.name) || str(job.hiringOrganization);
  if (company) fields.company = company;
  if (str(job.title)) fields.role = str(job.title);
  const pick = (v: unknown) =>
    Array.isArray(v) ? v.map(str).filter(Boolean).join('\n') : htmlToText(str(v));
  if (job.responsibilities) fields.duties = pick(job.responsibilities);
  // "경력", "초대졸 이상"처럼 짧은 분류 이름은 자격요건 내용이 아니므로 뺍니다.
  const descriptive = (v: string) => (v.length >= 20 ? v : '');
  const req = [
    pick(job.qualifications),
    descriptive(pick(job.experienceRequirements)),
    descriptive(pick(job.educationRequirements)),
  ].filter(Boolean);
  if (req.length) fields.requirements = req.join('\n');
  return fields;
}

/**
 * 화면을 나중에 그리는 사이트(Next.js 등)는 페이지 안에 데이터(JSON)를 숨겨 둡니다.
 * 그 안에서 공고 항목처럼 보이는 값을 찾습니다. (예: main_tasks, requirements, preferred_points)
 */
function fieldsFromEmbeddedData(root: HTMLElement): {
  fields: Partial<JobFields>;
  text: string;
} {
  const script =
    root.querySelector('script#__NEXT_DATA__') ?? root.querySelector('script#__NUXT_DATA__');
  if (!script) return { fields: {}, text: '' };
  let data: unknown;
  try {
    data = JSON.parse(script.textContent);
  } catch {
    return { fields: {}, text: '' };
  }
  const MAP: Record<string, keyof JobFields> = {
    main_tasks: 'duties',
    maintasks: 'duties',
    responsibilities: 'duties',
    requirements: 'requirements',
    qualifications: 'requirements',
    preferred_points: 'preferred',
    preferredpoints: 'preferred',
    preferred: 'preferred',
  };
  const fields: Partial<JobFields> = {};
  // 부모 객체도 함께 기억해, 상세 내용 바로 위에 있는 직무명·회사명을 찾습니다.
  const queue: { value: unknown; parent: Json | null }[] = [{ value: data, parent: null }];
  let guard = 0;
  const pickNames = (o: Json | null) => {
    if (!o) return;
    const role = str(o.position) || str(o.title) || str(o.name_of_position);
    if (role && role.length < 120 && !fields.role) fields.role = role;
    const company = str(obj(o.company)?.name) || str(o.company_name) || str(o.companyName);
    if (company && !fields.company) fields.company = company;
  };
  while (queue.length && guard++ < 20000) {
    const { value, parent } = queue.shift()!;
    if (Array.isArray(value)) {
      queue.push(...value.map((v) => ({ value: v, parent })));
      continue;
    }
    const o = obj(value);
    if (!o) continue;
    let foundHere = false;
    for (const [k, v] of Object.entries(o)) {
      const key = MAP[k.toLowerCase()];
      if (key && typeof v === 'string' && v.trim().length > 5 && !fields[key]) {
        fields[key] = cleanText(v.includes('<') ? htmlToText(v) : v);
        foundHere = true;
      } else if (v && typeof v === 'object') queue.push({ value: v, parent: o });
    }
    if (foundHere) {
      pickNames(o);
      pickNames(parent);
    }
  }
  const labels: Record<keyof JobFields, string> = {
    company: '회사명',
    role: '직무',
    duties: '주요업무',
    requirements: '자격요건',
    preferred: '우대사항',
  };
  const text = (Object.keys(labels) as (keyof JobFields)[])
    .filter((k) => fields[k])
    .map((k) =>
      k === 'company' || k === 'role' ? `${labels[k]}: ${fields[k]}` : `${labels[k]}\n${fields[k]}`,
    )
    .join('\n\n');
  return { fields, text };
}

export function extractJobPage(html: string, url: string, detailHtml = ''): JobPageResult {
  const root = parse(html, {
    comment: false,
    blockTextElements: {
      script: true,
      style: true,
      noscript: false,
      pre: true,
    },
  });
  const meta = (name: string) =>
    str(root.querySelector(`meta[property="${name}"]`)?.getAttribute('content')) ||
    str(root.querySelector(`meta[name="${name}"]`)?.getAttribute('content'));
  const title = meta('og:title') || cleanText(root.querySelector('title')?.textContent ?? '');
  const summary = meta('og:description') || meta('description');

  const job = findJobPosting(root);
  const description = job ? htmlToText(str(job.description)) : '';
  // 원티드처럼 JSON-LD 설명에는 주요 업무만 있고, 자격요건·우대사항은 페이지 데이터에만 있는 경우가 있어 항상 함께 봅니다.
  const embedded = fieldsFromEmbeddedData(root);

  stripNoise(root);
  const container =
    root.querySelector('main') ??
    root.querySelector('article') ??
    root.querySelector('body') ??
    root;
  const pageText = cleanText(container.structuredText);

  // 사람인·잡코리아처럼 본문이 다른 창에 있으면, 그 창의 글을 본문으로 씁니다.
  let detailText = '';
  let tableFields: Partial<JobFields>;
  let detailImages = 0;
  if (detailHtml) {
    const detail = parse(detailHtml, {
      comment: false,
      blockTextElements: {
        script: true,
        style: true,
        noscript: false,
        pre: true,
      },
    });
    stripNoise(detail);
    detailImages = detail.querySelectorAll('img').length;
    detailText = cleanText((detail.querySelector('body') ?? detail).structuredText);
    tableFields = fieldsFromTables(detail);
  } else tableFields = fieldsFromTables(container);

  // 본문 고르기: 본문 창 → 페이지 데이터 → 구조화 정보 설명 → 화면 글 순서.
  // 구조화 정보 설명이 "자세한 조건은 공고를 확인"처럼 짧은 안내뿐이면 화면 글을 씁니다.
  const descriptionUseful =
    description.length > pageText.length ||
    (description.length >= 40 &&
      (Object.keys(extractJobFields(description)).length > 0 ||
        description.length >= pageText.length / 3));
  const body = detailHtml
    ? detailText
    : embedded.text.length >= 60 && embedded.text.length >= description.length
      ? embedded.text
      : descriptionUseful
        ? description
        : embedded.text.length > pageText.length / 2
          ? embedded.text
          : pageText;
  const text = [title, body].filter(Boolean).join('\n\n').slice(0, MAX_TEXT);

  // 항목: 본문에서 찾은 값 → 페이지 데이터 → 구조화 정보 순으로 덮어씁니다.
  // 단, 구조화 정보의 업무·자격요건은 앞에서 못 찾았을 때만 씁니다.
  const fromLd = job ? fieldsFromJobPosting(job) : {};
  const fields: Partial<JobFields> = {
    ...fieldsFromTitle(title, url),
    ...extractJobFields(body),
    ...embedded.fields,
  };
  // 표에서 읽은 값은 글에서 못 찾은 항목에만 씁니다.
  for (const k of ['duties', 'requirements', 'preferred'] as const)
    if (!fields[k] && tableFields[k]) fields[k] = tableFields[k];
  if (fromLd.company) fields.company = fromLd.company;
  if (fromLd.role) fields.role = fromLd.role;
  if (fromLd.duties && !fields.duties) fields.duties = fromLd.duties;
  if (fromLd.requirements && !fields.requirements) fields.requirements = fromLd.requirements;

  // 마감일: 공고 요약의 "마감일 : 상시채용/2026.11.11" → 구조화 정보 → 본문 순서.
  const summaryDeadline = summary.match(/마감일?\s*[:：]\s*([^,]+)/)?.[1]?.trim() ?? '';
  const validThrough = job ? str(job.validThrough).slice(0, 10) : '';
  const deadline = /상시|채용\s*시/.test(summaryDeadline)
    ? ''
    : extractDeadline(`마감일 ${summaryDeadline}`) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(validThrough)
        ? validThrough
        : extractDeadline(`${body}\n${pageText}`));
  if (!fields.company) {
    const site = meta('og:site_name');
    if (site && job) fields.company = site;
  }

  let warning = '';
  if (body.length < 60 && detailImages)
    warning =
      '공고 내용이 그림(이미지)으로 올라와 있어 글자를 읽을 수 없어요. 읽을 수 있는 정보(회사명·직무 등)만 채웠어요. 그림 속 내용은 직접 옮겨 적어 주세요.';
  else if (body.length < 60)
    warning =
      '페이지에서 읽을 수 있는 글이 거의 없어요. 공고가 그림으로 되어 있거나, 화면이 열린 뒤에 내용을 불러오는 사이트일 수 있어요. 공고 내용을 직접 복사해 붙여넣어 주세요.';
  else if (body.length >= MAX_TEXT) warning = '공고가 길어 앞부분만 가져왔어요.';
  return { url, title, text, fields, deadline, warning };
}

type FetchOptions = Parameters<typeof fetchPage>[1];

/** 공고 주소를 받아와 정리합니다. 본문이 다른 창에 있는 사이트는 그 창도 함께 받아옵니다. */
export async function importJobPage(url: string, opts: FetchOptions = {}): Promise<JobPageResult> {
  const page = await fetchPage(url, opts);
  const detailUrl = detailPageUrl(page.html, page.url);
  let detailHtml = '';
  if (detailUrl) {
    try {
      detailHtml = (await fetchPage(detailUrl, { ...opts, timeoutMs: 8000 })).html;
    } catch {
      // 본문 창을 못 받아도 원래 페이지에서 읽을 수 있는 만큼은 보여 줍니다.
    }
  }
  return extractJobPage(page.html, page.url, detailHtml);
}
