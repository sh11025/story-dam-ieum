// 2026-10-15 추가 기능 테스트: 지원서 여러 개, 글자 수 방식, 마감일, 새 공지 표시, 백업 알림, AI 재시도
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { countText, daysUntil, parseSdi } from '../src/model.ts';
import { extractDeadline, extractJobFields } from '../shared/jobPosting.ts';
import { parseNoticeFile } from '../shared/notices.ts';
import { parseAiJobAnswer } from '../server/ai.ts';
import { extractJobPage } from '../server/jobPage.ts';

const noNotices = (page: Page) =>
  page.route('**/api/notices', (route) => route.fulfill({ json: { items: [], faqs: null } }));

test('counting modes: with spaces, without spaces and Korean 2-byte', () => {
  expect(countText('담이 ab', 'chars')).toBe(5);
  expect(countText('담이 ab', 'noSpace')).toBe(4);
  expect(countText('담이 ab', 'bytes')).toBe(7);
  expect(countText('가\n나', 'bytes')).toBe(6);
});

test('deadline detection and D-day', () => {
  const today = new Date(2026, 9, 15);
  expect(extractDeadline('접수기간: 2026.10.01 ~ 2026.10.31(금) 18:00', today)).toBe('2026-10-31');
  expect(extractDeadline('마감일\n~ 11/3', today)).toBe('2026-11-03');
  expect(extractDeadline('마감일: 1월 10일', today)).toBe('2027-01-10');
  expect(extractDeadline('마감: 상시채용', today)).toBe('');
  expect(extractDeadline('회사 소개 2026.12.01', today)).toBe('');
  expect(daysUntil('2026-10-20', today)).toBe(5);
  expect(daysUntil('2026-10-15', today)).toBe(0);
  expect(daysUntil('', today)).toBeNull();
});

test('job headings used by Wanted-style postings and (우대) lines', () => {
  const fields = extractJobFields(
    [
      'Our Job (앞으로 저희와 함께하실 일들이에요)',
      '- 클라우드 웹 서비스 백엔드 개발',
      '',
      'Our Expectation (이런 분들을 찾고 있어요)',
      '- Java/Spring 경험 3년 이상',
      '- (우대) Agile scrum 경험하신 분',
      '',
      'Our team (오시게 될 팀을 소개해드려요)',
    ].join('\n'),
  );
  expect(fields.duties).toBe('- 클라우드 웹 서비스 백엔드 개발');
  expect(fields.requirements).toBe('- Java/Spring 경험 3년 이상');
  expect(fields.preferred).toBe('Agile scrum 경험하신 분');
});

test('job page data hidden inside Next.js pages is read', () => {
  const data = {
    props: {
      pageProps: {
        job: {
          position: '백엔드 개발자',
          company: { name: '담이랩' },
          detail: {
            main_tasks: '• API 설계와 개발\n• 서버 운영',
            requirements: '• Node.js 3년 이상',
            preferred_points: '• 클라우드 경험',
          },
          due_time: null,
        },
      },
    },
  };
  const html = `<html><body><div id="__next">짧은 화면</div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
  const result = extractJobPage(html, 'https://jobs.example.com/1');
  expect(result.fields).toMatchObject({
    company: '담이랩',
    role: '백엔드 개발자',
    duties: '• API 설계와 개발\n• 서버 운영',
    requirements: '• Node.js 3년 이상',
    preferred: '• 클라우드 경험',
  });
});

test('AI job answers are parsed safely and unreadable pages are reported', () => {
  const good = parseAiJobAnswer(
    '정리했습니다.\n```json\n{"readable":true,"company":"담이랩","role":"기획자","duties":"서비스 기획","requirements":"경력 2년","preferred":"","deadline":"2026-10-31"}\n```',
  );
  expect(good).toMatchObject({ ok: true, deadline: '2026-10-31', fields: { company: '담이랩' } });
  expect(parseAiJobAnswer('{"readable": false}')).toEqual({ ok: false, type: 'unreadable' });
  expect(parseAiJobAnswer('죄송합니다')).toEqual({ ok: false, type: 'malformed_response' });
  expect(parseAiJobAnswer('{"readable":true,"deadline":"내일"}')).toEqual({
    ok: false,
    type: 'unreadable',
  });
});

test('notice schedule hides expired and future notices; FAQs come from the file', () => {
  const now = Date.parse('2026-10-15T00:00:00Z');
  const content = parseNoticeFile(
    {
      version: 1,
      notices: [
        { id: 'a', title: '진행 중', body: '', publishedAt: '2026-10-10T00:00:00Z' },
        {
          id: 'b',
          title: '끝남',
          body: '',
          publishedAt: '2026-10-01T00:00:00Z',
          endAt: '2026-10-14T00:00:00Z',
        },
        {
          id: 'c',
          title: '예약',
          body: '',
          publishedAt: '2026-10-10T00:00:00Z',
          startAt: '2026-10-20T00:00:00Z',
        },
      ],
      faqs: [
        { id: 'q1', question: '질문', answer: '답' },
        { id: '', question: '잘못' },
      ],
    },
    now,
  );
  expect(content.notices.map((n) => n.id)).toEqual(['a']);
  expect(content.faqs).toEqual([{ id: 'q1', question: '질문', answer: '답' }]);
  expect(parseNoticeFile({ version: 1, notices: [] }, now).faqs).toBeNull();
});

test('several applications: create with shared experience, switch, rename, delete, back up and restore', async ({
  page,
}) => {
  await noNotices(page);
  await page.goto('/application');
  await page.getByLabel('회사명').fill('첫째회사');
  await page.goto('/experience');
  await page
    .getByLabel(/경험 제목/)
    .first()
    .fill('공유할 경험');
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: '내 지원서 1개' })).toBeVisible();

  await page.getByRole('button', { name: '새 지원서' }).click();
  await page.getByLabel('지원서 제목 (선택)').fill('둘째 지원서');
  await page.getByRole('button', { name: '만들기' }).click();
  await expect(page.getByRole('heading', { name: '내 지원서 2개' })).toBeVisible();
  await page.goto('/application');
  await expect(page.getByLabel('회사명')).toHaveValue('');
  await page.goto('/experience');
  await expect(page.getByLabel(/경험 제목/).first()).toHaveValue('공유할 경험');

  // 머리글에서 다른 지원서로 바꾸기
  await page.getByLabel('지원서 선택').selectOption({ label: '첫째회사' });
  await page.goto('/application');
  await expect(page.getByLabel('회사명')).toHaveValue('첫째회사');

  // 새로고침해도 두 지원서가 남아 있음
  await page.reload();
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: '내 지원서 2개' })).toBeVisible();

  // 이름 바꾸기
  await page.getByRole('button', { name: '지원서 제목 바꾸기: 둘째 지원서' }).click();
  await page.getByLabel('지원서 제목', { exact: true }).fill('둘째 (수정)');
  await page.getByRole('button', { name: '제목 저장' }).click();
  await expect(page.getByText('둘째 (수정)')).toBeVisible();

  // 전체 백업 파일
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '모든 지원서 백업' }).click();
  const file = await waiting;
  const dest = 'test-results/output/all-backup.sdi';
  await fs.mkdir('test-results/output', { recursive: true });
  await file.saveAs(dest);
  const parsed = parseSdi(await fs.readFile(dest, 'utf8'));
  expect(parsed.kind).toBe('library');
  if (parsed.kind === 'library') expect(parsed.library.items).toHaveLength(2);

  // 삭제는 두 번 눌러야 함
  await page.getByRole('button', { name: '지원서 삭제: 둘째 (수정)' }).click();
  await expect(page.getByRole('heading', { name: '내 지원서 2개' })).toBeVisible();
  await page.getByRole('button', { name: '지원서 정말 삭제: 둘째 (수정)' }).click();
  await expect(page.getByRole('heading', { name: '내 지원서 1개' })).toBeVisible();

  // 백업 불러오기: 지원서가 추가됨
  await page.getByLabel('작업 파일 불러오기').setInputFiles(dest);
  await page.getByRole('button', { name: '지원서 2개 추가하기' }).click();
  await expect(page.getByRole('heading', { name: '내 지원서 3개' })).toBeVisible();
});

test('older single-work storage moves into the application list', async ({ page }) => {
  await noNotices(page);
  await page.goto('/home');
  await page.evaluate(async () => {
    const model = await import(/* @vite-ignore */ '/src/model.ts');
    const w = model.initialWork();
    w.application.company = '예전회사';
    localStorage.clear();
    localStorage.setItem('story-dam-ieum-draft-v1', JSON.stringify(w));
  });
  await page.reload();
  await expect(page.getByText('예전회사')).toBeVisible();
});

test('counting method selector changes the limit check and deadline shows D-day', async ({
  page,
}) => {
  await noNotices(page);
  await page.clock.install({ time: new Date('2026-10-15T09:00:00+09:00') });
  await page.goto('/cover-letter');
  await page.getByLabel('자기소개서 본문').fill('가나다 라마');
  await expect(page.locator('.editor-foot strong')).toHaveText('6 / 1,000자');
  await page.getByLabel('글자 수 세는 방법').selectOption('noSpace');
  await expect(page.locator('.editor-foot strong')).toHaveText('5 / 1,000자');
  await page.getByLabel('글자 수 세는 방법').selectOption('bytes');
  await expect(page.locator('.editor-foot strong')).toHaveText('11 / 1,000바이트');

  await page.goto('/application');
  await page.getByLabel('채용공고 원문').fill('회사명: 담이랩\n마감일: 2026.10.18');
  await page.getByRole('button', { name: '명시된 항목 가져오기' }).click();
  await expect(page.getByLabel('마감일 (선택)')).toHaveValue('2026-10-18');
  await expect(page.locator('.deadline-row .d-day')).toHaveText('마감 D-3');
  await expect(page.locator('.app-header .d-day')).toHaveText('D-3');
});

test('new notices show a dot on the bell until they are read', async ({ page }) => {
  await page.route('**/api/notices', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'n1',
            title: '새 기능 안내',
            body: '**새 기능** 자세한 내용: https://example.com/help',
            urgent: false,
            publishedAt: '2026-10-15T00:00:00Z',
          },
        ],
        faqs: [{ id: 'f1', question: '관리자가 쓴 질문', answer: '관리자가 쓴 답' }],
      },
    }),
  );
  await page.goto('/home');
  await expect(page.locator('.unread-dot')).toBeVisible();
  await page.getByRole('button', { name: /공지 알림/ }).click();
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.unread-dot')).toHaveCount(0);
  await page.goto('/notices');
  await page.getByText('새 기능 안내').click();
  await expect(page.locator('.notice-item strong').first()).toHaveText('새 기능');
  await expect(page.getByRole('link', { name: 'https://example.com/help' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  await expect(page.getByText('관리자가 쓴 질문')).toBeVisible();
  await expect(page.getByText('작업은 어디에 저장되나요?')).toHaveCount(0);
});

test('backup reminder appears after 30 minutes of unsaved changes', async ({ page }) => {
  await noNotices(page);
  await page.clock.install();
  await page.goto('/application');
  await page.getByLabel('회사명').fill('알림회사');
  await expect(page.locator('.backup-reminder')).toHaveCount(0);
  await page.clock.fastForward('31:00');
  await expect(page.locator('.backup-reminder')).toBeVisible();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '지금 저장' }).click();
  const backup = await waiting;
  await fs.mkdir('test-results/output', { recursive: true });
  await backup.saveAs('test-results/output/reminder-backup.sdi');
  const saved = parseSdi(await fs.readFile('test-results/output/reminder-backup.sdi', 'utf8'));
  expect(saved.kind).toBe('library');
  await expect(page.locator('.backup-reminder')).toHaveCount(0);
});

test('failed URL import offers an AI retry once a key is entered', async ({ page }) => {
  await noNotices(page);
  await page.route('**/api/job-posting', (route) =>
    route.fulfill({
      status: 502,
      json: { error: '이 사이트는 자동으로 공고를 가져가는 것을 막고 있어요.' },
    }),
  );
  await page.route('**/api/job-posting/ai', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      url: 'https://jobs.example.com/9',
      provider: 'Gemini',
    });
    await route.fulfill({
      json: {
        success: true,
        fields: {
          company: 'AI회사',
          role: '데이터 분석',
          duties: '분석',
          requirements: 'SQL',
          preferred: '',
        },
        deadline: '2026-11-01',
        text: '회사명: AI회사\n직무: 데이터 분석',
      },
    });
  });
  page.on('console', () => {}); // 502 응답 기록은 이 테스트에서 의도된 것
  await page.goto('/application');
  await page.getByRole('button', { name: '채용공고 URL', exact: true }).click();
  await page.getByLabel('채용공고 URL').fill('https://jobs.example.com/9');
  await page.getByRole('button', { name: '공고 가져오기' }).click();
  await expect(page.getByRole('button', { name: 'AI로 다시 시도' })).toBeDisabled();
  await page.getByRole('button', { name: 'AI 설정', exact: true }).click();
  await page.getByRole('button', { name: 'Gemini' }).click();
  await page.getByLabel('API Key', { exact: true }).fill('test-key');
  await page.getByRole('button', { name: '완료' }).click();
  await page.getByRole('button', { name: '채용공고 URL', exact: true }).click();
  await page.getByRole('button', { name: 'AI로 다시 시도' }).click();
  await expect(page.getByText(/AI가 공고에서/)).toBeVisible();
  await expect(page.getByLabel('회사명')).toHaveValue('AI회사');
  await expect(page.getByLabel('마감일 (선택)')).toHaveValue('2026-11-01');
});

// 2026-10-15: 자기소개서·면접은 공고부터 시작, '내 경험'은 쓰기 화면에 합치고 이력서와 자동 연결
test('cover letter starts from the posting, experiences sit beside the editor and sync with the resume', async ({
  page,
}) => {
  await noNotices(page);
  await page.goto('/home');
  await page.getByRole('button', { name: '자기소개서 작성' }).click();
  await expect(page).toHaveURL(/application/);
  const steps = page.getByRole('navigation', { name: '자기소개서 준비 단계' });
  await expect(steps.getByRole('link')).toHaveText(['지원 정보', '자기소개서', '최종 점검']);
  await page
    .getByLabel('채용공고 원문')
    .fill('회사명: 이음기획\n직무: 서비스 기획\n주요 업무: 사용자 조사\n자격요건: 협업 경험');
  await page.getByRole('button', { name: '명시된 항목 가져오기' }).click();
  await page.getByLabel('필수 지원 정보를 원문과 비교해 확인했어요.').check();
  await page.getByRole('button', { name: '자기소개서 쓰기' }).click();
  await expect(page).toHaveURL(/cover-letter/);

  const box = page.getByRole('region', { name: '내 경험' });
  await box.getByLabel('경험 제목').fill('지역 안내 개선');
  await box.getByLabel('기간 (선택)').fill('2025.03 – 2025.06');
  await box.getByLabel('내 역할은 무엇이었나요?').fill('사용자 조사를 맡았습니다.');
  await box.getByLabel('어떤 결과가 있었나요?').fill('문의가 줄었습니다.');
  await box.getByRole('button', { name: '본문에 넣기' }).click();
  await expect(page.getByLabel('자기소개서 본문')).toHaveValue(
    '사용자 조사를 맡았습니다. 문의가 줄었습니다.',
  );

  // 이력서에 자동으로 생기고, 이력서에서 고친 제목이 경험에도 반영됨
  await page
    .getByRole('navigation', { name: '다른 작업으로 이동' })
    .getByRole('link', { name: '이력서' })
    .click();
  await page.getByRole('button', { name: '프로젝트·활동' }).click();
  await expect(page.getByText('내 경험과 연결됨')).toBeVisible();
  await expect(page.getByLabel('기간 (선택)')).toHaveValue('2025.03 – 2025.06');
  await expect(page.getByLabel('내용 / 주요 업무 및 역할', { exact: false })).toHaveValue(
    '사용자 조사를 맡았습니다.\n문의가 줄었습니다.',
  );
  await page.getByLabel('프로젝트·활동 명칭', { exact: false }).fill('지역 안내 개선 프로젝트');

  // 예전 '내 경험' 주소는 쓰기 화면으로 이동
  await page.goto('/experience');
  await expect(page).toHaveURL(/cover-letter/);
  await expect(page.getByRole('region', { name: '내 경험' }).getByLabel('경험 제목')).toHaveValue(
    '지역 안내 개선 프로젝트',
  );
});

test('interview also starts from the posting and its step bar leads to practice', async ({
  page,
}) => {
  await noNotices(page);
  await page.goto('/home');
  await page.getByRole('button', { name: '면접 준비' }).click();
  await expect(page).toHaveURL(/application/);
  await expect(page.getByText('현재 작업 · 면접 준비', { exact: true })).toBeVisible();
  await page
    .getByLabel('채용공고 원문')
    .fill('회사명: 이음기획\n직무: 서비스 기획\n주요 업무: 사용자 조사\n자격요건: 협업 경험');
  await page.getByRole('button', { name: '명시된 항목 가져오기' }).click();
  await page.getByLabel('필수 지원 정보를 원문과 비교해 확인했어요.').check();
  await page.getByRole('button', { name: '면접 연습 시작하기' }).click();
  await expect(page).toHaveURL(/interview/);
  await expect(page.locator('.side-panel')).toContainText('이음기획 · 서비스 기획');
  await page
    .getByRole('navigation', { name: '면접 준비 단계' })
    .getByRole('link', { name: '지원 정보' })
    .click();
  await expect(page.getByText('현재 작업 · 면접 준비', { exact: true })).toBeVisible();
});
