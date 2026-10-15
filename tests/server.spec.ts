// 서버 기능(/api)을 화면 없이 직접 확인하는 테스트입니다.
import { expect, test } from '@playwright/test';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { detailPageUrl, extractJobPage } from '../server/jobPage.ts';
import { checkUrl, isPrivateAddress } from '../server/safeFetch.ts';
import { extractJobFields } from '../shared/jobPosting.ts';
import { parseNoticeFile } from '../shared/notices.ts';

const pages: Record<string, { type: string; body: string; status?: number; location?: string }> = {
  '/jsonld': {
    type: 'text/html; charset=utf-8',
    body: `<html><head><title>[담이랩] 기획자</title><script type="application/ld+json">${JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage' },
          {
            '@type': 'JobPosting',
            title: '서비스 기획자',
            hiringOrganization: { '@type': 'Organization', name: '담이랩' },
            description:
              '<p>함께할 기획자를 찾습니다.</p><h3>주요업무</h3><ul><li>신규 서비스 기획</li></ul><h3>자격요건</h3><ul><li>경력 2년 이상</li></ul>',
          },
        ],
      },
    )}</script></head><body><main>짧은 본문</main></body></html>`,
  },
  '/plain': {
    type: 'text/html',
    body: '<html><body><header>메뉴</header><main><h2>■ 모집부문</h2><p>백엔드 개발자</p><h2>■ 담당업무</h2><ul><li>API 개발</li></ul><h2>■ 지원자격</h2><ul><li>Node.js 경험</li></ul></main><script>secret()</script></body></html>',
  },
  '/redirect': { type: 'text/html', body: '', status: 302, location: '/plain' },
  '/pdf': { type: 'application/pdf', body: '%PDF-1.4' },
  '/forbidden': { type: 'text/html', body: 'no', status: 403 },
};

let base = '';
let server: http.Server;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = pages[req.url ?? ''];
    if (!p) return res.writeHead(404).end();
    res.writeHead(p.status ?? 200, {
      'content-type': p.type,
      ...(p.location ? { location: p.location } : {}),
    });
    res.end(p.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => server.close());

const post = (
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  origin = 'http://app.test',
) =>
  app.request(`http://app.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, host: 'app.test' },
    body: JSON.stringify(body),
  });

test('job posting import reads JobPosting data and plain heading sections', async () => {
  const app = createApp({ allowPrivateJobUrls: true });
  const a = await (await post(app, '/api/job-posting', { url: `${base}/jsonld` })).json();
  expect(a.fields).toMatchObject({
    company: '담이랩',
    role: '서비스 기획자',
    duties: '신규 서비스 기획',
    requirements: '경력 2년 이상',
  });
  const b = await (await post(app, '/api/job-posting', { url: `${base}/redirect` })).json();
  expect(b.url).toBe(`${base}/plain`);
  expect(b.fields).toMatchObject({
    role: '백엔드 개발자',
    duties: 'API 개발',
    requirements: 'Node.js 경험',
  });
  expect(b.text).not.toContain('secret()');
  expect(b.text).not.toContain('메뉴');
});

test('job posting import explains blocked, missing and non-page addresses', async () => {
  const app = createApp({ allowPrivateJobUrls: true });
  expect(
    (await (await post(app, '/api/job-posting', { url: `${base}/forbidden` })).json()).error,
  ).toContain('막고 있어요');
  expect(
    (await (await post(app, '/api/job-posting', { url: `${base}/missing` })).json()).error,
  ).toContain('찾을 수 없어요');
  expect(
    (await (await post(app, '/api/job-posting', { url: `${base}/pdf` })).json()).error,
  ).toContain('파일 업로드');
});

test('job posting import refuses internal addresses and other sites calling the API', async () => {
  const app = createApp(); // 실제 운영과 같은 설정
  for (const url of [
    `${base}/plain`,
    'http://localhost/',
    'http://169.254.169.254/latest',
    'file:///etc/passwd',
    'http://[::1]/',
    'ftp://example.com',
  ]) {
    const res = await post(app, '/api/job-posting', { url });
    expect(res.status, url).toBe(400);
  }
  expect(
    (await post(app, '/api/job-posting', { url: 'https://example.com' }, 'https://evil.test'))
      .status,
  ).toBe(403);
  expect(isPrivateAddress('10.1.2.3')).toBe(true);
  expect(isPrivateAddress('::ffff:192.168.0.1')).toBe(true);
  expect(isPrivateAddress('93.184.216.34')).toBe(false);
  expect(() => checkUrl('https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=1')).not.toThrow();
});

test('notices are read from the configured JSON file, sorted, validated and cached', async () => {
  let calls = 0;
  const noticeServer = http.createServer((_req, res) => {
    calls++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        version: 1,
        updatedAt: '2026-10-14T00:00:00Z',
        notices: [
          {
            id: 'a',
            title: '일반',
            body: '본문',
            urgent: false,
            publishedAt: '2026-10-01T00:00:00Z',
          },
          {
            id: 'b',
            title: '중요',
            body: '본문',
            urgent: true,
            publishedAt: '2026-09-01T00:00:00Z',
          },
          { id: '', title: '잘못된 항목' },
        ],
      }),
    );
  });
  await new Promise<void>((r) => noticeServer.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(noticeServer.address() as AddressInfo).port}/notices.json`;
  const app = createApp({ noticesUrl: url });
  const first = await (await app.request('http://app.test/api/notices')).json();
  expect(first.items.map((n: { id: string }) => n.id)).toEqual(['b', 'a']);
  await app.request('http://app.test/api/notices');
  expect(calls).toBe(1);
  noticeServer.close();
  expect(await (await createApp().request('http://app.test/api/notices')).json()).toEqual({
    items: [],
    faqs: null,
    configured: false,
  });
  expect(() => parseNoticeFile({ version: 2, notices: [] })).toThrow();
});

test('AI proxy refuses a missing personal key and requests from other sites', async () => {
  const app = createApp();
  const res = await post(app, '/api/ai', {
    provider: 'ChatGPT',
    task: 'revision',
    key: '',
    text: 'test',
    instruction: 'revise',
  });
  expect(await res.json()).toEqual({
    success: false,
    error: { type: 'bad_request' },
  });
  expect(
    (
      await post(
        app,
        '/api/ai',
        { provider: 'ChatGPT', task: 'test', key: 'k' },
        'https://evil.test',
      )
    ).status,
  ).toBe(403);
});

test('pasted text extraction keeps the old "label: value" rule and reads heading sections', () => {
  expect(extractJobFields('회사명: 담이랩\n직무: 서비스 기획\n주요 업무: 사용자 조사')).toEqual({
    company: '담이랩',
    role: '서비스 기획',
    duties: '사용자 조사',
  });
  expect(
    extractJobFields('[자격요건]\n- 경력 2년\n- 문서 작성\n\n[우대사항]\n- 데이터 분석'),
  ).toEqual({
    requirements: '- 경력 2년\n- 문서 작성',
    preferred: '- 데이터 분석',
  });
});

// 2026-10-15 실제 공고(사람인·원티드·잡코리아)를 줄여 만든 페이지로 사이트별 맞춤 처리를 확인합니다.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/job-pages/${name}`, import.meta.url), 'utf8');

test('saramin: reads the posting body from its inner frame and skips hidden keyword lists', () => {
  const pop = fixture('saramin-pop-view.html');
  const url = 'https://www.saramin.co.kr/zf_user/jobs/relay/pop-view?rec_idx=55258367&t_ref=main';
  expect(detailPageUrl(pop, url)).toBe(
    'https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=55258367&rec_seq=0&t_category=pop_view&t_content=view_detail&t_ref=main&t_ref_content=platinum_plus_only_expand',
  );
  expect(
    detailPageUrl('', 'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=123&view_type=list'),
  ).toBe('https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=123&rec_seq=0');

  const a = extractJobPage(pop, url, fixture('saramin-55258367-detail.html'));
  expect(a.fields).toMatchObject({
    company: '한국유나이티드제약(주)',
    role: '각 부문 신입/경력사원 모집',
  });
  // 표(모집부문 | 담당업무 | … | 응시자격)는 칸별로 읽고, 부문 이름을 앞에 붙임. "… 우대" 줄은 우대사항으로
  expect(a.fields.duties).toBe('[개량신약 영업팀] 국내영업\n[생산팀] 의약품 생산/공정IPC');
  expect(a.fields.requirements).toContain(
    '[생산팀] - 고졸 이상의 학위 소지자 및 졸업예정자\n- 전공무관',
  );
  expect(a.fields.requirements).not.toContain('ROTC');
  expect(a.fields.preferred).toBe(
    '[개량신약 영업팀] - ROTC 출신자 우대\n[생산팀] - 기계 관련 업무 경험자 우대',
  );
  expect(a.text).toContain('제약 MR 업무 경력자');
  expect(a.text).not.toContain('AI 서류 합격률');
  expect(a.deadline).toBe('2026-10-25');

  // 공고가 그림뿐인 경우: 숨겨진 직무 분류 글을 본문으로 쓰지 않고 붙여넣기 안내
  const b = extractJobPage(pop, url, fixture('saramin-55159646-detail.html'));
  expect(b.text).not.toContain('배송·택배');
  expect(b.warning).toContain('그림');
});

test('wanted: combines JobPosting with page data so requirements and preferred are filled', () => {
  const r = extractJobPage(fixture('wanted-392317.html'), 'https://www.wanted.co.kr/wd/392317');
  expect(r.fields.company).toBe('로앤컴퍼니(lawtalk)');
  expect(r.fields.role).toBe('CX 매니저');
  expect(r.fields.duties).toContain('서비스 운영 및 고도화');
  expect(r.fields.requirements).toContain('최소 3년 이상의 CX/CS');
  expect(r.fields.requirements).not.toBe('경력');
  expect(r.fields.preferred).toContain('스타트업 또는 양방향 플랫폼');
});

test('jobkorea: reads the detail frame, stops at other sections and keeps 상시채용 without a date', () => {
  const page = fixture('jobkorea-50163806.html');
  const url = 'https://www.jobkorea.co.kr/Recruit/GI_Read/50163806?sc=729&sn=103';
  expect(detailPageUrl(page, url)).toBe(
    'https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50163806',
  );
  const r = extractJobPage(page, url, fixture('jobkorea-50163806-detail.html'));
  expect(r.fields.company).toBe('㈜화물맨');
  expect(r.fields.duties?.split('\n')).toHaveLength(8);
  expect(r.fields.requirements).toContain('문서 작성 능력');
  expect(r.fields.preferred).toContain('물류·운송 플랫폼');
  expect(r.fields.preferred).not.toContain('전형절차');
  expect(r.deadline).toBe(''); // JSON-LD에는 1년 뒤 날짜가 있지만 공고 요약은 상시채용

  const b = extractJobPage(page, url, fixture('jobkorea-50148243-detail.html'));
  expect(b.fields.duties).toContain('ㆍ직영·가맹 등 사업별 월 마감 자료 검토 및 정산');
  expect(b.fields.requirements).toContain('더존 iCUBE');
  expect(b.fields.preferred).not.toContain('서류전형');
});

test('table postings: a two-column table (label | content) is read too', () => {
  const html =
    '<html><body><main><table><tr><th>모집분야</th><td>회계</td></tr><tr><th>담당 업무</th><td>- 월 결산<br>- 세무 신고</td></tr><tr><th>지원자격</th><td>- 경력 3년 이상</td></tr></table></main></body></html>';
  const r = extractJobPage(html, 'https://example.com/job');
  expect(r.fields.duties).toBe('- 월 결산\n- 세무 신고');
  expect(r.fields.requirements).toBe('- 경력 3년 이상');
});

test('hidden-text rule does not mistake table borders for hidden text', () => {
  const html =
    '<html><body><main><div style="border-width:0px 1px 1px 0px;">자격요건</div><div style="border-width:0 0 1px 0">- 보이는 내용입니다</div><div style="height: 0; overflow:hidden">숨긴 검색어</div></main></body></html>';
  const r = extractJobPage(html, 'https://example.com/job');
  expect(r.text).toContain('보이는 내용입니다');
  expect(r.text).not.toContain('숨긴 검색어');
});
