import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
const errors: string[] = [];
const consoleIssues: string[] = [];
const failedRequests: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  consoleIssues.length = 0;
  failedRequests.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || '';
    // Replaced animation frames may be cancelled before the browser finishes
    // fetching them. That is not a missing asset or a runtime network failure.
    if (reason !== 'net::ERR_ABORTED')
      failedRequests.push(`${request.method()} ${request.url()}: ${reason}`);
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
  expect(consoleIssues).toEqual([]);
  expect(failedRequests).toEqual([]);
});
test('older formatVersion 1 work files restore into the new resume and interview slots', async ({
  page,
}) => {
  await page.goto('/home');
  const restored = await page.evaluate(async () => {
    const model = await import(/* @vite-ignore */ '/src/model.ts');
    const original = model.initialWork();
    original.resume.name = '이전 이력서';
    original.interview[0].answer = '이전 면접 답변';
    const legacy = JSON.parse(JSON.stringify(original));
    delete legacy.resumeMode;
    delete legacy.resumeSlots;
    delete legacy.interviewIndex;
    delete legacy.interviewStage;
    legacy.interview.forEach((item: Record<string, unknown>) => delete item.kind);
    const work = model.parseWork(JSON.stringify(legacy));
    return {
      version: work.formatVersion,
      name: work.resumeSlots.new.data.name,
      answer: work.interview[0].answer,
      stage: work.interviewStage,
    };
  });
  expect(restored).toEqual({
    version: 1,
    name: '이전 이력서',
    answer: '이전 면접 답변',
    stage: 'questions',
  });
});
test('schema rejects corrupt versions and strips credentials; progress uses only enabled tasks', async ({
  page,
}) => {
  await page.goto('/home');
  const result = await page.evaluate(async () => {
    const path = '/src/model.ts';
    const m = await import(/* @vite-ignore */ path);
    const w = m.initialWork();
    const invalid = [
      {},
      { ...w, formatVersion: 2 },
      { ...w, review: [] },
      { ...w, savedAt: 'not-a-date' },
      { ...w, resume: { ...w.resume, photo: 'javascript:alert(1)' } },
      { ...w, resume: { ...w.resume, sections: Array(6).fill(w.resume.sections[0]) } },
    ].map((x) => {
      try {
        m.parseWork(JSON.stringify(x));
        return false;
      } catch {
        return true;
      }
    });
    const clean = m.parseWork(
      JSON.stringify({
        ...w,
        apiKey: 'secret',
        application: { ...w.application, apiKey: 'nested-secret' },
      }),
    );
    const before = m.progressOf(w);
    w.kind = 'resume';
    w.resume.name = '테스트';
    w.resume.email = 'test@example.com';
    w.resume.phone = '010-0000-0000';
    const complete = m.progressOf(w);
    w.resume.sections[0].enabled = true;
    const missing = m.progressOf(w);
    return {
      invalid,
      hasSecret: JSON.stringify(clean).includes('secret'),
      before,
      complete,
      missing,
    };
  });
  expect(result.invalid.every(Boolean)).toBeTruthy();
  expect(result.hasSecret).toBeFalsy();
  expect(result.before).toBe(0);
  expect(result.complete).toBe(100);
  expect(result.missing).toBeLessThan(100);
});
test('immediate reload restores edits; storage failure stays usable', async ({ page }) => {
  await page.goto('/cover-letter');
  await page.getByLabel('자기소개서 본문').fill('새로고침 직전의 문장');
  await page.reload();
  await expect(page.getByLabel('자기소개서 본문')).toHaveValue('새로고침 직전의 문장');
  await page.evaluate(() => {
    const proto = Storage.prototype;
    (window as Window & { originalSetItem?: typeof Storage.prototype.setItem }).originalSetItem =
      proto.setItem;
    proto.setItem = function (key, value) {
      if (key === 'story-dam-ieum-library-v1')
        throw new DOMException('quota', 'QuotaExceededError');
      return (
        window as Window & { originalSetItem: typeof Storage.prototype.setItem }
      ).originalSetItem.call(this, key, value);
    };
  });
  await page.getByLabel('자기소개서 본문').fill('저장 공간이 부족해도 원문을 유지합니다.');
  await expect(page.locator('.work-save-status')).toHaveText('저장 실패');
  await expect(page.getByRole('alert')).toContainText('저장 공간');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '작업 파일 저장', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.sdi$/);
  await page.evaluate(() => {
    const original = (window as Window & { originalSetItem: typeof Storage.prototype.setItem })
      .originalSetItem;
    Storage.prototype.setItem = original;
    delete (window as Window & { originalSetItem?: typeof Storage.prototype.setItem })
      .originalSetItem;
  });
  await page.getByLabel('자기소개서 본문').fill('저장 공간 복구 후 정상 저장됩니다.');
  await expect(page.locator('.work-save-status')).toHaveText('임시저장 완료');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('PDF import reports the exact omitted range when it exceeds 100 pages', async ({ page }) => {
  const makePdf = async (pageCount: number, includeText = true) => {
    const pdf = await PDFDocument.create();
    const font = includeText ? await pdf.embedFont(StandardFonts.Helvetica) : undefined;
    for (let i = 1; i <= pageCount; i++) {
      const page = pdf.addPage();
      if (font) page.drawText(`Fixture page ${i}`, { font, size: 12 });
    }
    return Buffer.from(await pdf.save());
  };

  await page.goto('/application');
  await page.getByRole('button', { name: '파일 업로드' }).click();
  const input = page.locator('input[type=file][accept=".txt,.docx,.pdf"]');
  await input.setInputFiles({
    name: '100-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf(100),
  });
  await expect(page.getByLabel('채용공고 원문')).toContainText('Fixture page 100');
  await expect(page.getByText(/파일에서 텍스트를 읽었어요/)).toBeVisible();
  await expect(page.getByText(/읽지 않았어요/)).toHaveCount(0);

  await page.getByRole('button', { name: '파일 업로드' }).click();
  await input.setInputFiles({
    name: '101-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf(101),
  });
  await expect(page.getByLabel('채용공고 원문')).toContainText('Fixture page 100');
  await expect(page.getByLabel('채용공고 원문')).not.toContainText('Fixture page 101');
  await expect(page.getByText(/이 PDF는 101페이지/)).toBeVisible();
  await expect(page.getByText(/101페이지는 읽지 않았어요/)).toBeVisible();

  await page.getByRole('button', { name: '파일 업로드' }).click();
  await input.setInputFiles({
    name: '101-scanned-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf(101, false),
  });
  await expect(page.getByText(/이 PDF에서 텍스트를 찾지 못했어요/)).toBeVisible();
  await expect(page.getByText(/101페이지는 읽지 않았어요/)).toBeVisible();
});
test('exports can be reimported as Korean text, long PDF paginates', async ({ page }) => {
  await page.goto('/cover-letter');
  const content = '사용자 인터뷰를 정리하고 실제 경험을 팀과 함께 검토했습니다.\n'.repeat(120);
  await page.getByLabel('자기소개서 본문').fill(content);
  await page.getByRole('button', { name: '최종 점검하기' }).click();
  await fs.mkdir('test-results/output', { recursive: true });
  for (const format of ['DOCX', 'PDF']) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `${format} 저장`, exact: true }).click();
    const file = await waiting;
    const dest = `test-results/output/long-export.${format.toLowerCase()}`;
    await file.saveAs(dest);
    await page.getByRole('link', { name: '지원 정보', exact: false }).click();
    await page.getByRole('button', { name: '파일 업로드', exact: true }).click();
    await page.locator('input[type=file][accept=".txt,.docx,.pdf"]').setInputFiles(dest);
    await expect(page.getByLabel('채용공고 원문')).toHaveValue(
      /사용자 인터뷰를 정리하고 실제 경험을 팀과 함께 검토했습니다/,
    );
    await page.getByRole('link', { name: '최종 점검', exact: false }).click();
  }
});
test('public app skips account login and job posting URL import fills the application form', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: '체험 시작하기' })).toBeVisible();
  await expect(page.getByLabel(/^이메일/)).toHaveCount(0);
  await page.route('**/api/job-posting', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ url: 'https://jobs.example.com/123' });
    await route.fulfill({
      json: {
        url: 'https://jobs.example.com/123',
        title: '서비스 기획자 채용',
        text: '서비스 기획자 채용\n\n주요업무\n신규 서비스 기획\n사용자 조사\n\n자격요건\n기획 경력 2년 이상\n\n우대사항\n데이터 분석 경험',
        fields: { company: '담이랩', role: '서비스 기획자' },
        warning: '',
      },
    });
  });
  await page.goto('/application');
  await page.getByRole('button', { name: '채용공고 URL', exact: true }).click();
  await page.getByLabel('채용공고 URL').fill('https://jobs.example.com/123');
  await page.getByRole('button', { name: '공고 가져오기' }).click();
  await expect(page.getByText(/5개 항목을 찾았어요/)).toBeVisible();
  await expect(page.getByLabel('채용공고 원문')).toContainText('신규 서비스 기획');
  await expect(page.getByLabel('회사명')).toHaveValue('담이랩');
  await expect(page.getByLabel('지원 직무')).toHaveValue('서비스 기획자');
  await expect(page.getByLabel('주요 업무')).toHaveValue('신규 서비스 기획\n사용자 조사');
  await expect(page.getByLabel('자격요건')).toHaveValue('기획 경력 2년 이상');

  await page.unroute('**/api/job-posting');
  await page.route('**/api/job-posting', (route) =>
    route.fulfill({
      status: 502,
      json: {
        error:
          '이 사이트는 자동으로 공고를 가져가는 것을 막고 있어요. 공고 내용을 복사해 붙여넣어 주세요.',
      },
    }),
  );
  await page.getByRole('button', { name: '채용공고 URL', exact: true }).click();
  await page.getByRole('button', { name: '공고 가져오기' }).click();
  await expect(page.getByText(/가져가는 것을 막고 있어요/)).toBeVisible();
  await expect(page.getByLabel('채용공고 URL')).toHaveValue('https://jobs.example.com/123');
  // 실패 응답(502)은 브라우저가 콘솔에 자동으로 남기는 기록이라 의도된 것입니다.
  const expected = consoleIssues.filter((m) => m.includes('502'));
  expect(expected).toHaveLength(1);
  consoleIssues.splice(0, consoleIssues.length, ...consoleIssues.filter((m) => !m.includes('502')));

  await page.goto('/auth/verify?token=must-not-be-used');
  await expect(page).toHaveURL(/login/);
});
test('all main screens meet automated WCAG A and AA checks', async ({ page }) => {
  await page.route('**/api/notices', (route) => route.fulfill({ json: { items: [] } }));
  const failures = [];
  for (const route of [
    '/login',
    '/application',
    '/experience',
    '/cover-letter',
    '/resume',
    '/interview',
    '/review',
    '/notices',
  ]) {
    await page.goto(route);
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    for (const v of report.violations)
      failures.push({
        route,
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      });
  }
  await fs.mkdir('test-results/output', { recursive: true });
  await fs.writeFile(
    'test-results/output/accessibility-all.json',
    JSON.stringify(failures, null, 2),
  );
  expect(failures).toEqual([]);
});
