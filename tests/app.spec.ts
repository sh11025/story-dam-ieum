import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
const out = path.resolve('test-results/output');
const errors: string[] = [];
const consoleIssues: string[] = [];
const failedRequests: string[] = [];
test.beforeEach(async ({ page }) => {
  await fs.mkdir(out, { recursive: true });
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
    if (reason !== 'net::ERR_ABORTED')
      failedRequests.push(`${request.method()} ${request.url()}: ${reason}`);
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
  expect(consoleIssues).toEqual([]);
  expect(failedRequests).toEqual([]);
});
test('side-panel Dami uses decoded full frames with comparable painted body height', async ({
  page,
}) => {
  await start(page);
  const heights: number[] = [];
  for (const route of ['/cover-letter', '/interview', '/review']) {
    await page.goto(route);
    const painted = await page.locator('.helper-title img.dami').evaluate(async (element) => {
      const image = element as HTMLImageElement;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let top = canvas.height;
      let bottom = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (data[(y * canvas.width + x) * 4 + 3] > 10) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      const fit = Math.min(
        image.clientWidth / image.naturalWidth,
        image.clientHeight / image.naturalHeight,
      );
      const scale = Number.parseFloat(getComputedStyle(image).scale) || 1;
      const text = image.nextElementSibling?.getBoundingClientRect();
      const box = image.getBoundingClientRect();
      return {
        height: (bottom - top + 1) * fit * scale,
        overlap: !!text && box.right > text.left,
        loaded: image.naturalWidth > 0,
      };
    });
    expect(painted.loaded).toBe(true);
    expect(painted.overlap).toBe(false);
    heights.push(painted.height);
  }
  expect(Math.max(...heights) / Math.min(...heights)).toBeLessThan(1.12);
});
test('three resume modes keep separate data and bridge progress through refresh and SDI import', async ({
  page,
  browser,
}) => {
  await start(page);
  await page.getByRole('button', { name: '이력서 작성' }).click();
  const bridge = page.locator('.bridge');
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('새 이력서 테스트');
  const newProgress = Number(await bridge.getAttribute('data-progress'));
  await page.getByRole('button', { name: '기존 이력서 수정', exact: true }).click();
  await page.getByRole('textbox', { name: '기존 이력서 원문' }).fill('기존 기록 원문');
  await page.getByRole('checkbox', { name: /원문을 확인했고/ }).check();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('기존 이력서 테스트');
  const existingProgress = Number(await bridge.getAttribute('data-progress'));
  await page.getByRole('button', { name: '회사·기관 양식', exact: true }).click();
  await page.getByRole('textbox', { name: '회사·기관 양식 원문' }).fill('기관 양식 원문');
  const organizationProgress = Number(await bridge.getAttribute('data-progress'));
  expect([newProgress, existingProgress, organizationProgress]).toEqual([33, 50, 17]);
  await expect(bridge).toHaveAttribute('aria-label', /이력서 · 회사·기관 양식 진행률/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '회사·기관 양식 원문' })).toHaveValue(
    '기관 양식 원문',
  );
  await page.getByRole('button', { name: '새 이력서 만들기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
    '새 이력서 테스트',
  );
  await expect(bridge).toHaveAttribute('data-progress', '33');
  await page.getByRole('button', { name: '기존 이력서 수정', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
    '기존 이력서 테스트',
  );
  await expect(bridge).toHaveAttribute('data-progress', '50');
  await page.getByRole('button', { name: '이력서 미리보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('기존 이력서 테스트');
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: '이 방식의 이력서 내용을 검토했어요.' })
    .check();
  await page.keyboard.press('Escape');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '작업 파일 저장', exact: true }).click();
  const downloaded = await downloadEvent;
  const bytes = await fs.readFile(await downloaded.path());
  const saved = JSON.parse(bytes.toString());
  expect(saved.formatVersion).toBe(1);
  expect(saved.resumeSlots.new.data.name).toBe('새 이력서 테스트');
  expect(saved.resumeSlots.existing.data.name).toBe('기존 이력서 테스트');
  expect(saved.resumeSlots.existing.reviewed).toBe(true);
  expect(saved.resumeSlots.organization.reference).toBe('기관 양식 원문');
  const clean = await browser.newContext();
  try {
    const restored = await clean.newPage();
    await start(restored);
    await restored
      .getByLabel('작업 파일 불러오기')
      .setInputFiles({ name: 'resume-modes.sdi', mimeType: 'application/json', buffer: bytes });
    await restored.getByRole('button', { name: '작업 불러오기', exact: true }).click();
    await expect(restored.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
      '기존 이력서 테스트',
    );
    await restored.getByRole('button', { name: '회사·기관 양식', exact: true }).click();
    await expect(restored.getByRole('textbox', { name: '회사·기관 양식 원문' })).toHaveValue(
      '기관 양식 원문',
    );
    await restored.getByRole('button', { name: '새 이력서 만들기', exact: true }).click();
    await expect(restored.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
      '새 이력서 테스트',
    );
  } finally {
    await clean.close();
  }
});
test('existing and organization resume previews and exports use only the selected mode', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: '이력서 작성' }).click();
  for (const [mode, name] of [
    ['기존 이력서 수정', '기존 모드 이름'],
    ['회사·기관 양식', '기관 모드 이름'],
  ]) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('textbox', { name: '이름', exact: true }).fill(name);
    await page.getByRole('button', { name: '이력서 미리보기', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(mode);
    await expect(page.getByRole('dialog')).toContainText(name);
    await page
      .getByRole('dialog')
      .getByRole('checkbox', { name: '이 방식의 이력서 내용을 검토했어요.' })
      .check();
    await page.keyboard.press('Escape');
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'DOCX 저장', exact: true }).click();
    const file = await waiting;
    const nameForFile =
      mode === '기존 이력서 수정' ? 'resume-existing.docx' : 'resume-organization.docx';
    const savedPath = path.join(out, nameForFile);
    await file.saveAs(savedPath);
    const result = await mammoth.extractRawText({ path: savedPath });
    expect(result.value).toContain(name);
    expect(result.value).not.toContain(
      mode === '기존 이력서 수정' ? '기관 모드 이름' : '기존 모드 이름',
    );
  }
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF 저장', exact: true }).click();
  const file = await waiting;
  const bytes = await fs.readFile(await file.path());
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
});
test('interview summary supports optional questions and applies edits only on request', async ({
  page,
  browser,
}) => {
  await start(page);
  await page.getByRole('button', { name: '면접 준비' }).click();
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('textbox', { name: '내 답변' }).fill(`원래 답변 ${i + 1}`);
    await page.getByRole('button', { name: /^답변 완료/ }).click();
  }
  await expect(page.getByText('질문·답변 전체 보기')).toBeVisible();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '90');
  const first = page.locator('.interview-summary-record').first();
  await first.getByRole('button', { name: '직접 수정안 비교' }).click();
  await first.getByRole('textbox', { name: '수정 제안' }).fill('수정 답변');
  await expect(first).toContainText('원래 답변 1');
  await first.getByRole('button', { name: '취소' }).click();
  await expect(first).toContainText('원래 답변 1');
  await first.getByRole('button', { name: '직접 수정안 비교' }).click();
  await first.getByRole('textbox', { name: '수정 제안' }).fill('수정 답변');
  await first.getByRole('button', { name: '적용' }).click();
  await expect(first).toContainText('수정 답변');
  await page.getByRole('button', { name: '추가 질문 받기' }).click();
  await expect(page.getByText('질문 6 / 8')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('textbox', { name: '내 답변' }).fill(`추가 답변 ${i + 1}`);
    await page.getByRole('button', { name: /^답변 완료/ }).click();
  }
  await expect(page.locator('.interview-summary-record')).toHaveCount(8);
  await page.getByRole('button', { name: '면접 연습 완료' }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  const docxEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOCX 저장', exact: true }).click();
  const interviewDocx = await docxEvent;
  const docxPath = path.join(out, 'interview-complete.docx');
  await interviewDocx.saveAs(docxPath);
  const docxBytes = await fs.readFile(docxPath);
  expect(docxBytes.subarray(0, 2).toString()).toBe('PK');
  const docxText = await mammoth.extractRawText({ path: docxPath });
  expect(docxText.value).toContain('수정 답변');
  expect(docxText.value).toContain('추가 답변 3');
  const pdfEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF 저장', exact: true }).click();
  const interviewPdf = await pdfEvent;
  const pdfBytes = await fs.readFile(await interviewPdf.path());
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
  expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBeGreaterThan(0);
  const sdiEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '.sdi 작업 저장', exact: true }).click();
  const interviewSdi = await sdiEvent;
  const sdiBytes = await fs.readFile(await interviewSdi.path());
  const saved = JSON.parse(sdiBytes.toString());
  expect(saved.formatVersion).toBe(1);
  expect(
    saved.interview.filter((item: { kind: string }) => item.kind === 'additional'),
  ).toHaveLength(3);
  const clean = await browser.newContext();
  try {
    const restored = await clean.newPage();
    await start(restored);
    await restored
      .getByLabel('작업 파일 불러오기')
      .setInputFiles({ name: 'interview.sdi', mimeType: 'application/json', buffer: sdiBytes });
    await restored.getByRole('button', { name: '작업 불러오기', exact: true }).click();
    await expect(restored.locator('.interview-summary-record')).toHaveCount(8);
    await expect(restored.locator('.bridge')).toHaveAttribute('data-progress', '100');
  } finally {
    await clean.close();
  }
  await page.reload();
  await expect(page.locator('.interview-summary-record')).toHaveCount(8);
  await expect(page.locator('.interview-summary-record').first()).toContainText('수정 답변');
});
test('interview can finish after only the basic questions', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '면접 준비' }).click();
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('textbox', { name: '내 답변' }).fill(`기본 답변 ${i + 1}`);
    await page.getByRole('button', { name: /^답변 완료/ }).click();
  }
  await expect(page.locator('.interview-summary-record')).toHaveCount(5);
  await page.getByRole('button', { name: '면접 연습 완료' }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await expect(page.locator('.interview-summary-record')).toHaveCount(5);
});
async function start(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: '체험 시작하기' }).click();
  await expect(page).toHaveURL(/home/);
}
async function expectBridgeLabelClearOfDami(bridge: Locator) {
  const layout = await bridge.evaluate((section) => {
    const label = section.querySelector('.bridge-title > span')?.getBoundingClientRect();
    const percent = section.querySelector('.bridge-title > strong')?.getBoundingClientRect();
    const dami = section.querySelector('.bridge-dami img')?.getBoundingClientRect();
    const safeArea = section.querySelector('.bridge-dami-safe-area')?.getBoundingClientRect();
    const sectionBounds = section.getBoundingClientRect();
    if (!label || !percent || !dami || !safeArea)
      throw new Error('Bridge label, progress, safe area, or Dami image is missing');
    return {
      overlap:
        label.left < dami.right &&
        label.right > dami.left &&
        label.top < dami.bottom &&
        label.bottom > dami.top,
      progressOverlap:
        percent.left < dami.right &&
        percent.right > dami.left &&
        percent.top < dami.bottom &&
        percent.bottom > dami.top,
      clippedByBridge: dami.top < sectionBounds.top || dami.bottom > sectionBounds.bottom,
      safeAreaContained:
        safeArea.left === sectionBounds.left &&
        safeArea.right === sectionBounds.right &&
        safeArea.top === sectionBounds.top &&
        safeArea.bottom <= sectionBounds.bottom,
      width: dami.width,
      height: dami.height,
    };
  });
  expect(layout.overlap).toBe(false);
  expect(layout.progressOverlap).toBe(false);
  expect(layout.clippedByBridge).toBe(false);
  expect(layout.safeAreaContained).toBe(true);
  expect(layout.width).toBeGreaterThan(80);
  expect(layout.height).toBeGreaterThan(60);
}
test('Bridge Dami safe area contains the painted bounds of every construction motion frame', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: '면접 준비' }).click();
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  const bridge = page.locator('.bridge');
  await expect(bridge).toHaveAttribute('data-progress', '0');
  await expectBridgeLabelClearOfDami(bridge);
  const frames = [
    ...['00', '01', '02', '03'].map((name) => `basic/${name}.webp`),
    ...['00', '01', '02', '03'].map((name) => `stack/${name}.webp`),
    ...['00', '01', '02', '03', '04'].map((name) => `carry/${name}.webp`),
    ...['ready', 'lift', 'strike', 'impact', 'recover'].map((name) => `build/${name}.webp`),
    ...['00', '01', '02', '03', '04'].map((name) => `complete/${name}.webp`),
  ];
  const bounds = await bridge.evaluate(async (section, framePaths) => {
    const safeArea = section.querySelector<HTMLElement>('.bridge-dami-safe-area')!;
    const scene = section.querySelector<HTMLElement>('.bridge-scene')!;
    const imageBox = section.querySelector<HTMLElement>('.bridge-dami')!;
    const svg = scene.querySelector<SVGSVGElement>('.story-bridge')!;
    const safe = safeArea.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const scale = Math.min(svgRect.width / 1500, svgRect.height / 132);
    const deckTop = svgRect.bottom - 58.25 * scale;
    const box = imageBox.getBoundingClientRect();
    const results: Array<{
      frame: string;
      top: number;
      bottom: number;
      left: number;
      right: number;
    }> = [];
    for (const framePath of framePaths) {
      const [state, name] = framePath.split('/');
      const frame = new Image();
      frame.src = `/src/assets/dami/motion/${framePath}`;
      await frame.decode();
      const canvas = document.createElement('canvas');
      canvas.width = frame.naturalWidth;
      canvas.height = frame.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(frame, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      const build = state === 'build';
      const elementHeight = build ? box.width * (704 / 640) : box.width * (260 / 320);
      const footRatio = build
        ? (
            {
              ready: 634 / 704,
              lift: 639 / 704,
              strike: 634 / 704,
              impact: 634 / 704,
              recover: 639 / 704,
            } as Record<string, number>
          )[name.replace('.webp', '')]
        : state === 'carry'
          ? 247 / 260
          : state === 'complete'
            ? 252 / 260
            : 249 / 260;
      const elementBottom = deckTop + (1 - footRatio) * elementHeight + 1.5;
      const elementTop = elementBottom - elementHeight;
      const imageScale = Math.min(
        box.width / frame.naturalWidth,
        elementHeight / frame.naturalHeight,
      );
      const paintWidth = frame.naturalWidth * imageScale;
      const paintHeight = frame.naturalHeight * imageScale;
      const paintLeft = box.left + (box.width - paintWidth) / 2;
      const paintTop = elementTop + elementHeight - paintHeight;
      results.push({
        frame: framePath,
        left: paintLeft + minX * imageScale,
        right: paintLeft + (maxX + 1) * imageScale,
        top: paintTop + minY * imageScale,
        bottom: paintTop + (maxY + 1) * imageScale,
      });
    }
    return {
      safe: { top: safe.top, bottom: safe.bottom, left: safe.left, right: safe.right },
      section: { top: sectionRect.top, bottom: sectionRect.bottom },
      results,
    };
  }, frames);
  expect(bounds.safe.top).toBe(bounds.section.top);
  expect(bounds.safe.bottom).toBeLessThanOrEqual(bounds.section.bottom);
  for (const frame of bounds.results) {
    expect(frame.top, `${frame.frame} top is clipped`).toBeGreaterThanOrEqual(bounds.safe.top);
    expect(frame.bottom, `${frame.frame} bottom is clipped`).toBeLessThanOrEqual(
      bounds.safe.bottom,
    );
    expect(frame.left, `${frame.frame} left is clipped`).toBeGreaterThanOrEqual(bounds.safe.left);
    expect(frame.right, `${frame.frame} right is clipped`).toBeLessThanOrEqual(bounds.safe.right);
  }
});
test('real cover letter workflow, selection, state persistence, bridge and SDI roundtrip', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: '자기소개서 작성' }).click();
  // 자기소개서는 지원 정보(공고)부터 시작합니다.
  await expect(page).toHaveURL(/application/);
  await page
    .getByLabel('채용공고 원문')
    .fill(
      '회사명: 테스트 회사\n직무: 서비스 기획\n주요 업무: 사용자 경험 개선\n자격요건: 협업 경험',
    );
  await page.getByRole('button', { name: '명시된 항목 가져오기' }).click();
  await expect(page.getByLabel('회사명')).toHaveValue('테스트 회사');
  await expect(page).toHaveURL(/application/);
  await page.getByLabel('필수 지원 정보를 원문과 비교해 확인했어요.').check();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', /^(?:[1-9]|[1-9]\d|100)$/);
  const partialLogs = Number(await page.locator('.bridge').getAttribute('data-installed-logs'));
  await expect(page.locator('.bridge .log.installed')).toHaveCount(partialLogs);
  await page.getByRole('button', { name: '자기소개서 쓰기' }).click();
  await expect(page).toHaveURL(/cover-letter/);
  // '내 경험'은 쓰기 화면 옆 칸에서 바로 정리합니다.
  for (const [label, value] of [
    ['경험 제목', '팀 프로젝트'],
    ['어떤 상황이었나요?', '교내 프로젝트에서 협업했습니다.'],
    ['내 역할은 무엇이었나요?', '서비스 기획을 맡았습니다.'],
    ['직접 어떤 행동을 했나요?', '사용자 인터뷰를 정리했습니다.'],
    ['어떤 결과가 있었나요?', '팀의 우선순위 합의에 도움이 되었습니다.'],
  ])
    await page.getByLabel(label, { exact: false }).fill(value);
  const body = page.getByLabel('자기소개서 본문');
  await body.fill('저는 실제 경험을 바탕으로 지원했습니다. 사용자 인터뷰를 정리했습니다.');
  await body.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: '직접 수정안 비교하기' }).click();
  await page.getByLabel('직접 작성한 수정안').fill('제가');
  await page.getByRole('button', { name: '원문과 비교' }).click();
  await expect(body).toHaveValue(
    '저는 실제 경험을 바탕으로 지원했습니다. 사용자 인터뷰를 정리했습니다.',
  );
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(body).toHaveValue(
    '제가실제 경험을 바탕으로 지원했습니다. 사용자 인터뷰를 정리했습니다.',
  );
  await page.getByRole('button', { name: '이전 내용으로 되돌리기' }).click();
  await expect(body).toHaveValue(
    '저는 실제 경험을 바탕으로 지원했습니다. 사용자 인터뷰를 정리했습니다.',
  );
  await page.getByRole('button', { name: '수정 제안 받기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('외부 AI가 연결되지 않았습니다');
  await expect(body).toHaveValue(
    '저는 실제 경험을 바탕으로 지원했습니다. 사용자 인터뷰를 정리했습니다.',
  );
  await page.getByLabel('문항 요구사항과 사실, 글자 수를 확인했어요.').check();
  for (const title of ['직무 경험', '협업 경험']) {
    await page.getByRole('button', { name: title, exact: true }).click();
    await body.fill(`${title}에서 제 역할은 사용자 인터뷰 정리였습니다.`);
    await page.getByLabel('문항 요구사항과 사실, 글자 수를 확인했어요.').check();
  }
  await page.getByRole('button', { name: '문항 추가', exact: true }).click();
  await page.getByLabel('문항 제목').fill('배운 점');
  await body.fill('경험을 통해 함께 소통하는 방법을 배웠습니다.');
  await page.getByLabel('문항 요구사항과 사실, 글자 수를 확인했어요.').check();
  await page.getByRole('button', { name: '지원동기', exact: true }).click();
  await expect(body).toContainText('');
  await expect(body).toHaveValue(/실제 경험/);
  await expect(page.locator('.work-save-status')).toHaveText('임시저장 완료');
  const progressBeforeRefresh = await page.locator('.bridge').getAttribute('data-progress');
  await expect(page.locator('.bridge')).toHaveAttribute(
    'data-bridge-progress',
    progressBeforeRefresh!,
  );
  const installedBeforeRefresh = await page.locator('.bridge').getAttribute('data-installed-logs');
  await page.reload();
  await expect(body).toHaveValue(/실제 경험/);
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', progressBeforeRefresh!);
  await expect(page.locator('.bridge')).toHaveAttribute(
    'data-installed-logs',
    installedBeforeRefresh!,
  );
  await expect(page.locator('.bridge .log.installed')).toHaveCount(Number(installedBeforeRefresh));
  await page.getByRole('button', { name: '최종 점검하기' }).click();
  for (const label of [
    '문항의 요구사항에 맞게 답변했어요.',
    '경험과 역할, 성과가 모두 실제 사실이에요.',
    '지원 직무와 경험의 연결을 확인했어요.',
    '모든 문항의 글자 수를 확인했어요.',
  ])
    await page.getByLabel(label, { exact: true }).check();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await expect(page.locator('.bridge .log.installed')).toHaveCount(20);
  await expect(page.locator('.bridge')).toHaveAttribute('data-installed-logs', '20');
  await expect(page.locator('.bridge .sr-only[role="status"]')).toContainText('20개 설치');
  await expect(page.locator('.bridge .dami')).toHaveAttribute('src', /\.webp/);
  await page.screenshot({ path: path.join(out, 'review-1366.png'), fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '.sdi 작업 저장', exact: true }).click();
  const file = await download;
  await file.saveAs(path.join(out, 'workflow.sdi'));
  const raw = await fs.readFile(path.join(out, 'workflow.sdi'), 'utf8');
  expect(raw).not.toMatch(/apiKey|secret|password/);
  expect(JSON.parse(raw).letters).toHaveLength(4);
  await page.locator('.app-header .brand').click();
  await page.getByLabel('작업 파일 불러오기').setInputFiles(path.join(out, 'workflow.sdi'));
  await page.getByRole('button', { name: '작업 불러오기', exact: true }).click();
  await expect(page.getByLabel('회사명')).toHaveValue('테스트 회사');
  await page.getByLabel('작업 파일 불러오기').setInputFiles({
    name: 'broken.sdi',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toContainText('손상된 파일');
  await expect(page.getByLabel('회사명')).toHaveValue('테스트 회사');
});
test('resume multi-row editing, skip, preview, interview records and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.getByRole('button', { name: '이력서 작성' }).click();
  await page.getByLabel('이름', { exact: false }).fill('홍길동');
  await page.getByLabel('연락처', { exact: false }).fill('010-1234-5678');
  await page.getByLabel('이메일', { exact: false }).fill('hong@example.com');
  await page.getByRole('button', { name: '경력', exact: true }).click();
  await page.getByRole('button', { name: '이 항목 작성하기' }).click();
  await page.getByLabel('경력 명칭').fill('기획 인턴');
  await page.getByLabel('내용 / 주요 업무 및 역할').fill('사용자 피드백을 정리했습니다.');
  await page.getByRole('button', { name: '경력 추가' }).click();
  await page.getByLabel('경력 명칭').nth(1).fill('활동');
  await page.getByLabel('내용 / 주요 업무 및 역할').nth(1).fill('행사 운영을 도왔습니다.');
  await page.getByRole('button', { name: '경력 2 삭제' }).click();
  await expect(page.getByLabel('경력 명칭')).toHaveCount(1);
  await page.getByRole('button', { name: '기본정보', exact: true }).click();
  await expect(page.getByLabel('이름', { exact: false })).toHaveValue('홍길동');
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await expect(page.locator('.bridge .dami')).toHaveAttribute('src', /\.webp/);
  await expect(page.locator('.bridge .log.installed')).toHaveCount(20);
  await page.getByLabel('경력 중심형', { exact: true }).check();
  await page.getByRole('button', { name: '이력서 미리보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('기획 인턴');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '이력서 미리보기', exact: true })).toBeFocused();
  await page
    .getByRole('link', { name: /면접 준비/ })
    .first()
    .click();
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  await expect(page.getByText('질문 1 / 5', { exact: true })).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page
      .getByLabel('내 답변', { exact: true })
      .fill(`실제 경험 ${i + 1}을 바탕으로 제 역할과 결과를 설명합니다.`);
    await page.getByRole('button', { name: /^답변 완료/ }).click();
  }
  await page.getByRole('button', { name: '연습 기록 확인', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('5 / 5개 답변 완료');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '90');
  await page.getByRole('button', { name: '면접 연습 완료' }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await page.getByRole('button', { name: '답변 다시 보기·수정' }).first().click();
  await expect(page.getByLabel('내 답변')).toHaveValue(/실제 경험 1/);
});
test('home and header writing menus open their own editors', async ({ page }) => {
  await start(page);
  for (const item of [
    // 자기소개서·면접 준비는 지원 정보(공고)부터, 이력서는 바로 시작합니다.
    { card: '자기소개서 작성', route: /application/, next: '자기소개서 쓰기' },
    { card: '이력서 작성', route: /resume/, next: '' },
    { card: '면접 준비', route: /application/, next: '면접 연습 시작하기' },
  ]) {
    await page.getByRole('button', { name: item.card }).click();
    await expect(page).toHaveURL(item.route);
    if (item.next) {
      await expect(page.getByLabel('회사명')).toBeVisible();
      await expect(page.getByRole('button', { name: item.next })).toBeVisible();
    } else await expect(page.getByLabel('이름', { exact: false })).toBeVisible();
    await page.goto('/home');
  }
  for (const item of [
    { label: '자기소개서', route: /application/, current: '현재 작업 · 자기소개서 작성' },
    { label: '이력서', route: /resume/, current: '현재 작업 · 이력서 작성' },
    { label: '면접 준비', route: /application/, current: '현재 작업 · 면접 준비' },
  ]) {
    await page
      .getByRole('link', { name: new RegExp(item.label) })
      .first()
      .click();
    await expect(page).toHaveURL(item.route);
    await expect(page.getByText(item.current, { exact: true })).toBeVisible();
  }
});
test('local Home Dami runs periodic full-frame motion and returns to idle', async ({ page }) => {
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await start(page);
  const dami = page.locator('.home-dami');
  await expect(dami).toHaveAttribute('data-animation-frame', 'idle');
  await expect(dami).toHaveAttribute('src', /motion\/basic\/00\.webp$/);
  await page.clock.fastForward(1500);
  const firstMotion = (await dami.getAttribute('data-animation-frame'))?.split('-')[0];
  expect(['wave', 'read', 'happy']).toContain(firstMotion);
  const frames =
    firstMotion === 'read'
      ? ['idle', 'page-grab', 'page-turn', 'settle']
      : ['00', '01', '02', '03'];
  await expect(dami).toHaveAttribute('data-animation-frame', `${firstMotion}-${frames[0]}`);
  await expect(dami).toHaveAttribute(
    'src',
    new RegExp(`motion/${firstMotion}/${frames[0]}\\.webp$`),
  );
  await expect
    .poll(() => dami.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  for (const frame of [
    frames[1],
    frames[2],
    frames[3],
    frames[0],
    frames[1],
    frames[2],
    frames[3],
  ]) {
    await page.clock.fastForward(320);
    await expect(dami).toHaveAttribute('data-animation-frame', `${firstMotion}-${frame}`);
    await expect(dami).toHaveAttribute('src', new RegExp(`motion/${firstMotion}/${frame}\\.webp$`));
  }
  await page.clock.fastForward(320);
  await expect(dami).toHaveAttribute('data-animation-frame', 'idle');
  await expect(dami).toHaveAttribute('src', /motion\/basic\/00\.webp$/);
  await page.clock.fastForward(1500);
  const secondMotion = (await dami.getAttribute('data-animation-frame'))?.split('-')[0];
  expect(['wave', 'read', 'happy']).toContain(secondMotion);
  expect(secondMotion).not.toBe(firstMotion);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dami).toHaveAttribute('data-animation-frame', 'idle');
  await expect(dami).toHaveAttribute('src', /dami-basic\.webp$/);
  await page.clock.fastForward(20000);
  await expect(dami).toHaveAttribute('data-animation-frame', 'idle');
});
test('work-specific header and actual interview completion drive the whole bridge immediately and after reload', async ({
  page,
}) => {
  await page.goto('/interview');
  const taskNav = page.getByRole('navigation', { name: '다른 작업으로 이동' });
  await expect(taskNav.getByRole('link')).toHaveCount(3);
  await expect(page.getByText('현재 작업 · 면접 준비', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '자기소개서 준비 단계' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '작성 단계' })).toHaveCount(0);
  const bridge = page.locator('.bridge');
  await page.getByLabel('내 답변', { exact: true }).scrollIntoViewIfNeeded();
  await expect
    .poll(() => bridge.evaluate((el) => Math.round(el.getBoundingClientRect().top)))
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => bridge.evaluate((el) => Math.round(el.getBoundingClientRect().bottom)))
    .toBeLessThanOrEqual(768);
  await expect(bridge).toHaveAttribute('data-progress', '0');
  await expect(bridge.locator('.log.installed')).toHaveCount(0);
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '0');
  await expectBridgeLabelClearOfDami(bridge);

  const impactFrameDisplayed = page.waitForFunction(
    () =>
      document.querySelector('.bridge-dami img')?.getAttribute('data-animation-frame') === 'impact',
  );
  await page.getByLabel('내 답변', { exact: true }).fill('첫 질문의 답변을 실제로 작성합니다.');
  await expect(bridge).toHaveAttribute('data-progress', '0');
  await page.getByRole('button', { name: /^답변 완료/ }).click();
  await expect(bridge).toHaveAttribute('data-progress', '20');
  await expect(bridge).toHaveAttribute('data-phase', 'stacking');
  const bridgeDami = bridge.locator('.bridge-dami img');
  await expect(bridgeDami).toHaveAttribute('src', /motion\/stack\/00\.webp$/);
  await expect(bridgeDami).toHaveAttribute('data-animation-frame', '00.webp');
  await expect.poll(() => bridgeDami.getAttribute('data-animation-frame')).toBe('01.webp');
  await expect.poll(() => bridgeDami.getAttribute('data-animation-frame')).toBe('02.webp');
  await expect(bridge).toHaveAttribute('data-phase', 'approaching');
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute(
    'data-character-state',
    'approaching',
  );
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '0');
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'src',
    /motion\/carry\/00\.webp$/,
  );
  await expect(bridge.locator('.bridge-dami')).toHaveCSS('transition-property', 'left');
  await impactFrameDisplayed;
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'data-animation-frame',
    'impact',
  );
  await expect(bridge).toHaveAttribute('data-phase', 'installing', { timeout: 3000 });
  await expect(bridge).toHaveAttribute('data-bridge-progress', '5');
  await expect(bridge.locator('.log.installed')).toHaveCount(1);
  await expect(bridge.locator('.log.installing')).toHaveCount(1);
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLElement>('.bridge');
    return element?.dataset.phase === 'approaching' && Number(element.dataset.installedLogs) > 0;
  });
  const carryAnchor = await bridge.evaluate((element) => {
    const image = element.querySelector<HTMLImageElement>('.bridge-dami img')!;
    const imageRect = image.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lastOpaqueRow = -1;
    for (let y = canvas.height - 1; y >= 0 && lastOpaqueRow < 0; y -= 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 32) {
          lastOpaqueRow = y;
          break;
        }
      }
    }
    const svg = element.querySelector<SVGSVGElement>('.story-bridge')!;
    const svgRect = svg.getBoundingClientRect();
    const scale = Math.min(svgRect.width / 1500, svgRect.height / 132);
    const offsetY = svgRect.height - 132 * scale;
    return {
      footY: imageRect.top + ((lastOpaqueRow + 0.5) / canvas.height) * imageRect.height,
      deckTop: svgRect.top + offsetY + 75 * scale,
      deckBottom: svgRect.top + offsetY + 97 * scale,
      canvas: [image.naturalWidth, image.naturalHeight],
    };
  });
  expect(carryAnchor.canvas).toEqual([320, 260]);
  expect(carryAnchor.footY).toBeGreaterThanOrEqual(carryAnchor.deckTop - 4);
  expect(carryAnchor.footY).toBeLessThanOrEqual(carryAnchor.deckBottom + 4);
  await expect(bridge).toHaveAttribute('data-bridge-progress', '5');
  await expect(bridge.locator('.log.installed')).toHaveCount(1);
  await expect(bridge).toHaveAttribute('data-phase', 'idle', { timeout: 6000 });
  await expect(bridge).toHaveAttribute('data-bridge-progress', '20');
  await expect(bridge.locator('.log.installed')).toHaveCount(4);
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '0.125');
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-character-state', 'idle');

  await page
    .getByLabel('내 답변', { exact: true })
    .fill('두 번째 질문에도 구체적인 사실을 적습니다.');
  await page.getByRole('button', { name: /^답변 완료/ }).click();
  await expect(bridge).toHaveAttribute('data-progress', '40');
  await expect(bridge).toHaveAttribute('data-bridge-progress', '40', { timeout: 8000 });
  await expect(bridge.locator('.log.installed')).toHaveCount(8);
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '0.325');
  await expect(page.locator('.work-save-status')).toHaveText('임시저장 완료');

  await page.reload();
  await expect(page.getByText('질문 3 / 5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '질문 1 완료', exact: true }).click();
  await expect(page.getByLabel('내 답변')).toHaveValue('첫 질문의 답변을 실제로 작성합니다.');
  await page.getByRole('button', { name: '질문 2 완료', exact: true }).click();
  await expect(page.getByLabel('내 답변')).toHaveValue(
    '두 번째 질문에도 구체적인 사실을 적습니다.',
  );
  await expect(bridge).toHaveAttribute('data-progress', '40');
  await expect(bridge).toHaveAttribute('data-phase', 'idle');
  await expect(bridge).toHaveAttribute('data-bridge-progress', '40');
  await expect(bridge.locator('.log.installed')).toHaveCount(8);
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '0.375');

  await page.goto('/resume');
  await expect(page.getByText('현재 작업 · 이력서 작성', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '자기소개서 준비 단계' })).toHaveCount(0);
  await page.goto('/cover-letter');
  await expect(page.getByText('현재 작업 · 자기소개서 작성', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '자기소개서 준비 단계' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '자기소개서 준비 단계' })).not.toContainText(
    '이력서',
  );
  await expect(page.getByRole('navigation', { name: '자기소개서 준비 단계' })).not.toContainText(
    '면접',
  );
});
test('reading uses complete character frames for page turning and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/interview');
  const dami = page.locator('.side-panel .dami');
  for (const frame of ['idle', 'page-grab', 'page-turn', 'settle']) {
    await expect(dami).toHaveAttribute('data-animation-frame', frame);
    await expect(dami).toHaveAttribute('src', new RegExp('motion/read/' + frame + '[.]webp$'));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dami).not.toHaveAttribute('data-animation-frame', /.+/);
  await expect(dami).toHaveAttribute('src', /dami-read[.]webp$/);
});
test('bridge motion is event-driven, restores statically, and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/interview');
  const bridge = page.locator('.bridge');
  const answer = page.getByLabel('내 답변', { exact: true });
  await expect(bridge).toHaveAttribute('data-phase', 'idle');
  await answer.fill('완료 전에는 다리가 늘지 않습니다.');
  await expect(bridge).toHaveAttribute('data-progress', '0');
  await page.evaluate(() => {
    type BridgeAuditWindow = Window & {
      __bridgeFrameTrace?: Array<{ frame: string; src: string }>;
      __bridgeImpactAnchor?: {
        footAnchor: number;
        logTop: number;
        canvas: number[];
        src: string;
      };
      __bridgeFrameObserver?: MutationObserver;
    };
    const root = document.querySelector<HTMLElement>('.bridge');
    if (!root) throw new Error('BridgeProgress is not mounted');
    const auditWindow = window as BridgeAuditWindow;
    const trace: Array<{ frame: string; src: string }> = [];
    auditWindow.__bridgeFrameTrace = trace;
    const observer = new MutationObserver(() => {
      const image = root.querySelector<HTMLImageElement>('.bridge-dami img');
      const frame = image?.getAttribute('data-animation-frame');
      const src = image?.getAttribute('src');
      if (frame && src && trace.at(-1)?.frame !== frame) trace.push({ frame, src });
      if (frame !== 'impact' || !image || !src) return;
      const svg = root.querySelector<SVGSVGElement>('.story-bridge');
      const installedPlank = root.querySelector<SVGPathElement>('.log.installing path[fill]');
      if (!svg || !installedPlank) return;
      const imageRect = image.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const plankBox = installedPlank.getBBox();
      const scale = Math.min(svgRect.width / 1500, svgRect.height / 132);
      auditWindow.__bridgeImpactAnchor = {
        footAnchor: imageRect.bottom - (70 / 704) * imageRect.height,
        logTop: svgRect.bottom - (132 - plankBox.y + 1.25) * scale,
        canvas: [image.naturalWidth, image.naturalHeight],
        src,
      };
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-animation-frame', 'src'],
    });
    auditWindow.__bridgeFrameObserver = observer;
  });
  await page.getByRole('button', { name: /^답변 완료/ }).click();
  await expect(bridge).toHaveAttribute('data-progress', '20');
  await expect(bridge).toHaveAttribute('data-phase', 'stacking');
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'src',
    /motion\/stack\/00\.webp$/,
  );
  await expect(bridge).toHaveAttribute('data-phase', 'approaching');
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'src',
    /motion\/carry\/00\.webp$/,
  );
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '0');
  await expect
    .poll(() =>
      page.evaluate(() => {
        type BridgeAuditWindow = Window & {
          __bridgeFrameTrace?: Array<{ frame: string; src: string }>;
        };
        return (window as BridgeAuditWindow).__bridgeFrameTrace?.map(({ frame }) => frame) ?? [];
      }),
    )
    .toContain('recover');
  const frameTrace = await page.evaluate(() => {
    type BridgeAuditWindow = Window & {
      __bridgeFrameTrace?: Array<{ frame: string; src: string }>;
    };
    return (window as BridgeAuditWindow).__bridgeFrameTrace ?? [];
  });
  const buildFrames = ['ready', 'lift', 'strike', 'impact', 'recover'];
  const carryFrames = new Set(
    frameTrace.filter(({ src }) => /\/motion\/carry\//.test(src)).map(({ frame }) => frame),
  );
  expect(carryFrames.size).toBeGreaterThanOrEqual(3);
  expect(frameTrace.map(({ frame }) => frame)).toEqual(expect.arrayContaining(buildFrames));
  const frameIndexes = buildFrames.map((frame) =>
    frameTrace.findIndex((entry) => entry.frame === frame),
  );
  expect(frameIndexes).toEqual([...frameIndexes].sort((a, b) => a - b));
  for (const frame of buildFrames) {
    expect(frameTrace.find((entry) => entry.frame === frame)?.src).toMatch(
      new RegExp(`/motion/build/${frame}\\.webp$`),
    );
  }
  const impactAnchor = await page.evaluate(() => {
    type BridgeAuditWindow = Window & {
      __bridgeImpactAnchor?: { footAnchor: number; logTop: number; canvas: number[]; src: string };
    };
    return (window as BridgeAuditWindow).__bridgeImpactAnchor;
  });
  expect(impactAnchor?.src).toMatch(/motion\/build\/impact\.webp$/);
  if (!impactAnchor) throw new Error('Impact-frame deck measurement was not captured');
  expect(impactAnchor.canvas).toEqual([640, 704]);
  expect(
    Math.abs(impactAnchor.footAnchor - impactAnchor.logTop),
    JSON.stringify({
      footAnchor: impactAnchor.footAnchor,
      logTop: impactAnchor.logTop,
      logBottom: impactAnchor.logBottom,
    }),
  ).toBeLessThanOrEqual(3);
  // 설치 중인 통나무는 impact 프레임 때 이미 측정했습니다(impactAnchor가 .log.installing을 찾아야만 기록됨).
  // recover 이후 설치 단계는 40ms 남짓이라, 여기서 다시 기다리면 컴퓨터 속도에 따라 결과가 흔들립니다.
  await page.evaluate(() => {
    type BridgeAuditWindow = Window & { __bridgeFrameObserver?: MutationObserver };
    (window as BridgeAuditWindow).__bridgeFrameObserver?.disconnect();
  });
  await expect(bridge).toHaveAttribute('data-phase', 'idle', { timeout: 6000 });
  await expect(bridge).toHaveAttribute('data-bridge-progress', '20');
  await expect(bridge.locator('.log.installed')).toHaveCount(4);
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'src',
    /motion\/build\/recover\.webp$/,
  );

  await page.reload();
  await expect(bridge).toHaveAttribute('data-progress', '20');
  await expect(bridge).toHaveAttribute('data-bridge-progress', '20');
  await expect(bridge).toHaveAttribute('data-phase', 'idle');
  await expect(bridge.locator('.log.installing')).toHaveCount(0);

  await page.getByRole('button', { name: '질문 1 완료', exact: true }).click();
  await answer.fill('');
  await expect(bridge).toHaveAttribute('data-progress', '0');
  await expect(bridge).toHaveAttribute('data-bridge-progress', '0');
  await expect(bridge).toHaveAttribute('data-phase', 'idle');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await answer.fill('감소 후에도 사용자가 원하면 다시 이어서 준비할 수 있어요.');
  await page.getByRole('button', { name: /^답변 완료/ }).click();
  await expect(bridge).toHaveAttribute('data-progress', '20');
  await expect(bridge).toHaveAttribute('data-bridge-progress', '20');
  await expect(bridge).toHaveAttribute('data-phase', 'idle');
  await expect(bridge.locator('.log.installed')).toHaveCount(4);
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute('src', /dami-build\.webp$/);
});
test('completing all interview answers connects the full bridge and ends in a full-frame destination pose', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/interview');
  const bridge = page.locator('.bridge');
  for (let i = 0; i < 4; i += 1) {
    await page
      .getByLabel('내 답변', { exact: true })
      .fill(`질문 ${i + 1}에 대해 제가 직접 겪은 일을 설명합니다.`);
    await page.getByRole('button', { name: /^답변 완료/ }).click();
    await expectBridgeLabelClearOfDami(page.locator('.bridge'));
  }
  await expect(bridge).toHaveAttribute('data-progress', '80');
  await expect(bridge).toHaveAttribute('data-phase', 'idle', { timeout: 12000 });
  await page.evaluate(() => {
    const bridge = document.querySelector<HTMLElement>('.bridge');
    if (!bridge) throw new Error('BridgeProgress is not mounted');
    const events: string[] = [];
    new MutationObserver(() => events.push(bridge.dataset.phase || '')).observe(bridge, {
      attributes: true,
      attributeFilter: ['data-phase'],
    });
    (window as Window & { releaseBridgePhaseEvents?: string[] }).releaseBridgePhaseEvents = events;
    const frames: Array<{ frame: string; src: string }> = [];
    if (!bridge.querySelector('.bridge-dami img')) throw new Error('Bridge Dami image is missing');
    new MutationObserver(() => {
      const image = bridge.querySelector<HTMLImageElement>('.bridge-dami img');
      if (image)
        frames.push({
          frame: image.getAttribute('data-animation-frame') || '',
          src: image.getAttribute('src') || '',
        });
    }).observe(bridge, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-animation-frame', 'src'],
    });
    (
      window as Window & { releaseCompleteFrameEvents?: Array<{ frame: string; src: string }> }
    ).releaseCompleteFrameEvents = frames;
  });
  await page
    .getByLabel('내 답변', { exact: true })
    .fill('질문 5에 대해 제가 직접 겪은 일을 설명합니다.');
  await page.getByRole('button', { name: /^답변 완료/ }).click();
  await expectBridgeLabelClearOfDami(bridge);
  await expect(page.getByText('질문·답변 전체 보기')).toBeVisible();
  await expect(bridge).toHaveAttribute('data-progress', '90');
  await expect(bridge).toHaveAttribute('data-phase', 'idle', { timeout: 12000 });
  await page.evaluate(() => {
    (window as Window & { releaseBridgePhaseEvents?: string[] }).releaseBridgePhaseEvents?.splice(
      0,
    );
    (
      window as Window & { releaseCompleteFrameEvents?: Array<{ frame: string; src: string }> }
    ).releaseCompleteFrameEvents?.splice(0);
  });
  await page.getByRole('button', { name: '면접 연습 완료' }).click();
  await expect(bridge).toHaveAttribute('data-progress', '100');
  await expect(bridge).toHaveAttribute('data-phase', 'stacking');
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'src',
    /motion\/stack\/00\.webp$/,
  );
  await expect(bridge).toHaveAttribute('data-phase', 'approaching');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(bridge).toHaveAttribute('data-phase', 'celebrating');
  const completeImage = bridge.locator('.bridge-dami img');
  await expect(completeImage).toHaveAttribute('src', /motion\/complete\/00\.webp$/);
  await expect.poll(() => completeImage.getAttribute('data-animation-frame')).toBe('01.webp');
  await expect(bridge).toHaveAttribute('data-phase', 'idle', { timeout: 12000 });
  await expect(bridge).toHaveAttribute('data-bridge-progress', '100');
  await expect(bridge.locator('.log.installed')).toHaveCount(20);
  await expect(bridge.locator('.bridge-dami')).toHaveAttribute('data-bridge-position', '1');
  await expect(bridge.locator('.bridge-dami img')).toHaveAttribute(
    'src',
    /motion\/complete\/04\.webp$/,
  );
  const completeFootOffset = await bridge.evaluate((element) => {
    const image = element.querySelector<HTMLImageElement>('.bridge-dami img')!;
    const imageRect = image.getBoundingClientRect();
    const deckTop = element
      .querySelector<SVGPathElement>('.log.installed path[fill]')!
      .getBoundingClientRect().top;
    return imageRect.bottom - (8 / 260) * imageRect.height - deckTop;
  });
  expect(Math.abs(completeFootOffset)).toBeLessThanOrEqual(3);
  await page.screenshot({
    path: path.join(out, 'release-readiness-interview-final-1920x1080.png'),
    fullPage: false,
  });
  const phaseEvents = await page.evaluate(
    () =>
      (window as Window & { releaseBridgePhaseEvents?: string[] }).releaseBridgePhaseEvents || [],
  );
  const completeFrameEvents = await page.evaluate(
    () =>
      (window as Window & { releaseCompleteFrameEvents?: Array<{ frame: string; src: string }> })
        .releaseCompleteFrameEvents || [],
  );
  const completedFrames = completeFrameEvents
    .filter(({ src }) => /\/motion\/complete\//.test(src))
    .map(({ frame }) => frame.replace('.webp', ''));
  expect(
    ['00', '01', '02', '03', '04'].every((frame) => completedFrames.includes(frame)),
    JSON.stringify(completeFrameEvents),
  ).toBe(true);
  const bridgeEvents = phaseEvents.filter((phase) =>
    ['stacking', 'approaching', 'building', 'installing', 'celebrating', 'idle'].includes(phase),
  );
  expect(bridgeEvents.filter((phase) => phase === 'stacking')).toHaveLength(1);
  expect(bridgeEvents.filter((phase) => phase === 'approaching')).toHaveLength(2);
  expect(bridgeEvents.filter((phase) => phase === 'building')).toHaveLength(2);
  expect(bridgeEvents.filter((phase) => phase === 'installing')).toHaveLength(2);
  expect(bridgeEvents.slice(-2)).toEqual(['celebrating', 'idle']);
});
test('independent work progress preserves shared facts and review state across task switches', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: '자기소개서 작성' }).click();
  await page.getByRole('link', { name: '지원 정보', exact: true }).click();
  await page
    .getByLabel('채용공고 원문')
    .fill('회사명: 한강기획\n직무: 서비스 기획\n주요 업무: 사용자 조사\n자격요건: 프로젝트 경험');
  await page.getByRole('button', { name: '명시된 항목 가져오기' }).click();
  await page.getByLabel('필수 지원 정보를 원문과 비교해 확인했어요.').check();

  await page
    .getByRole('navigation', { name: '자기소개서 준비 단계' })
    .getByRole('link', { name: '자기소개서' })
    .click();
  for (const [label, value] of [
    ['경험 제목', '지역 안내 개선 프로젝트'],
    ['어떤 상황이었나요?', '지역 이용자가 안내를 찾기 어려워했습니다.'],
    ['내 역할은 무엇이었나요?', '사용자 조사를 맡았습니다.'],
    ['직접 어떤 행동을 했나요?', '이용자 의견을 분류하고 안내 문구를 다시 썼습니다.'],
    ['어떤 결과가 있었나요?', '문의 없이 정보를 찾는 이용자가 늘었습니다.'],
  ])
    await page.getByLabel(label, { exact: false }).fill(value);

  await page.getByRole('link', { name: '최종 점검', exact: true }).click();
  await page.getByLabel('문항의 요구사항에 맞게 답변했어요.').check();
  await page.getByLabel('경험과 역할, 성과가 모두 실제 사실이에요.').check();
  const coverLetterProgress = await page.locator('.bridge').getAttribute('data-progress');
  expect(Number(coverLetterProgress)).toBeGreaterThan(0);

  const taskNav = page.getByRole('navigation', { name: '다른 작업으로 이동' });
  await taskNav.getByRole('link', { name: '이력서' }).click();
  await expect(page.getByText('현재 작업 · 이력서 작성', { exact: true })).toBeVisible();
  // 자기소개서에서 정리한 경험이 이력서 '프로젝트·활동'에 자동으로 들어가 4개 중 1개가 이미 채워짐
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '25');
  await page.getByLabel('이름', { exact: false }).fill('김이음');
  await page.getByLabel('연락처', { exact: false }).fill('010-1234-5678');
  await page.getByLabel('이메일', { exact: false }).fill('ieum@example.com');
  await page.getByRole('button', { name: '경력', exact: true }).click();
  await page.getByRole('button', { name: '이 항목 작성하기' }).click();
  await page.getByLabel('경력 명칭').fill('서비스 기획 프로젝트');
  await page
    .getByLabel('내용 / 주요 업무 및 역할')
    .fill('이용자 조사를 진행하고 안내 문구를 개선했습니다.');
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await expect(page.getByLabel('공유된 지원 정보와 경험')).toContainText('지역 안내 개선 프로젝트');

  await taskNav.getByRole('link', { name: '면접 준비' }).click();
  await expect(page).toHaveURL(/application/);
  await expect(page.getByText('현재 작업 · 면접 준비', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '0');
  await expect(page.locator('.side-panel')).toContainText('한강기획 · 서비스 기획');
  await expect(page.locator('.side-panel')).toContainText('지역 안내 개선 프로젝트');
  await expect(page.locator('.side-panel')).toContainText('서비스 기획 프로젝트');
  await page
    .getByLabel('내 답변', { exact: true })
    .fill('사용자 의견을 정리해 실제 안내를 개선한 경험을 설명합니다.');
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '0');
  await page.getByRole('button', { name: /^답변 완료/ }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '20');

  await taskNav.getByRole('link', { name: '이력서' }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await expect(page.getByLabel('이름', { exact: false })).toHaveValue('김이음');
  await taskNav.getByRole('link', { name: '자기소개서' }).click();
  await page.getByRole('link', { name: '최종 점검', exact: true }).click();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', coverLetterProgress!);
  await expect(page.getByLabel('문항의 요구사항에 맞게 답변했어요.')).toBeChecked();
  await expect(page.getByLabel('경험과 역할, 성과가 모두 실제 사실이에요.')).toBeChecked();

  await taskNav.getByRole('link', { name: '면접 준비' }).click();
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  await page.reload();
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '20');
  await page.getByRole('button', { name: '질문 1 완료', exact: true }).click();
  await expect(page.getByLabel('내 답변')).toHaveValue(
    /사용자 의견을 정리해 실제 안내를 개선한 경험/,
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '작업 파일 저장', exact: true }).click();
  const file = await download;
  await page.goto('/home');
  await page.getByLabel('작업 파일 불러오기').setInputFiles({
    name: file.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await file.createReadStream().then(async (stream) => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    }),
  });
  await expect(page.getByRole('dialog')).toContainText('면접 준비 작업을 찾았어요.');
  await page.getByRole('button', { name: '작업 불러오기', exact: true }).click();
  await expect(page).toHaveURL(/interview/);
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '20');
  await expect(page.locator('.side-panel')).toContainText('서비스 기획 프로젝트');
});
test('notices come from the GitHub notice file and the header bell shows the latest ones', async ({
  page,
}) => {
  await page.route('**/api/notices', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'n2',
            title: '점검 안내',
            body: '10월 20일 새벽에 점검합니다.',
            urgent: true,
            publishedAt: '2026-10-12T00:00:00Z',
          },
          {
            id: 'n1',
            title: '서비스 오픈',
            body: '스토리 담 이음이 문을 열었어요.',
            urgent: false,
            publishedAt: '2026-10-10T00:00:00Z',
          },
        ],
      },
    }),
  );
  await page.goto('/notices');
  await expect(page.getByText('중요 · 점검 안내')).toBeVisible();
  await expect(page.getByText('10월 20일 새벽에 점검합니다.')).toBeVisible();
  await page.getByText('서비스 오픈').click();
  await expect(page.getByText('스토리 담 이음이 문을 열었어요.')).toBeVisible();
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: '이 길은 아직 연결되지 않았어요.' }),
  ).toBeVisible();
  await page.goto('/support');
  await expect(page).toHaveURL(/notices/);
  await page.goto('/home');
  await page.getByRole('button', { name: '공지 알림', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('점검 안내');
  await page.getByRole('button', { name: /공지사항 전체 보기/ }).click();
  await expect(page).toHaveURL(/notices/);
});
test('valid Korean DOCX and PDF exports from real buttons', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '자기소개서 작성' }).click();
  await page.goto('/cover-letter');
  await page
    .getByLabel('자기소개서 본문')
    .fill(
      '안녕하세요. 저는 서비스 기획 경험을 바탕으로 지원했습니다.\n사용자 인터뷰를 정리하고 팀과 함께 우선순위를 정했습니다.',
    );
  await page.getByRole('button', { name: '최종 점검하기' }).click();
  for (const format of ['DOCX', 'PDF']) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `${format} 저장`, exact: true }).click();
    await (await waiting).saveAs(path.join(out, `export.${format.toLowerCase()}`));
    const bytes = await fs.readFile(path.join(out, `export.${format.toLowerCase()}`));
    expect(bytes.subarray(0, format === 'PDF' ? 4 : 2).toString()).toBe(
      format === 'PDF' ? '%PDF' : 'PK',
    );
  }
});
test('resume exports contain only entered resume facts and the resume SDI restores as resume', async ({
  page,
}) => {
  await page.goto('/resume');
  await page.getByLabel('이름', { exact: false }).fill('김이음');
  await page.getByLabel('연락처', { exact: false }).fill('010-0000-0000');
  await page.getByLabel('이메일', { exact: false }).fill('release@example.test');
  await page.getByRole('button', { name: '경력', exact: true }).click();
  await page.getByRole('button', { name: '이 항목 작성하기' }).click();
  await page.getByLabel('경력 명칭').fill('서비스 기획 인턴');
  await page
    .getByLabel('내용 / 주요 업무 및 역할')
    .fill('사용자 의견을 정리해 안내 문구를 개선했습니다.');

  const sdiDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '.sdi 작업 저장', exact: true }).click();
  const sdi = await sdiDownload;
  const sdiPath = path.join(out, 'resume-release.sdi');
  await sdi.saveAs(sdiPath);
  const saved = JSON.parse(await fs.readFile(sdiPath, 'utf8'));
  expect(saved.formatVersion).toBe(1);
  expect(saved.kind).toBe('resume');
  expect(saved.resume.name).toBe('김이음');

  for (const format of ['DOCX', 'PDF']) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `${format} 저장`, exact: true }).click();
    const file = await waiting;
    const savedPath = path.join(out, `resume-release.${format.toLowerCase()}`);
    await file.saveAs(savedPath);
    const bytes = await fs.readFile(savedPath);
    expect(bytes.subarray(0, format === 'PDF' ? 4 : 2).toString()).toBe(
      format === 'PDF' ? '%PDF' : 'PK',
    );
    if (format === 'DOCX') {
      const extracted = await mammoth.extractRawText({ path: savedPath });
      expect(extracted.value).toContain('이력서');
      expect(extracted.value).toContain('김이음');
      expect(extracted.value).toContain('서비스 기획 인턴');
      expect(extracted.value).toContain('사용자 의견을 정리해 안내 문구를 개선했습니다.');
    } else {
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
      await page.goto('/application');
      await page.getByRole('button', { name: '파일 업로드', exact: true }).click();
      await page.locator('input[type=file][accept=".txt,.docx,.pdf"]').setInputFiles(savedPath);
      await expect(page.getByLabel('채용공고 원문')).toContainText('서비스 기획 인턴');
      await expect(page.getByLabel('채용공고 원문')).toContainText(
        '사용자 의견을 정리해 안내 문구를 개선했습니다.',
      );
    }
  }

  const homeImport = page.getByLabel('작업 파일 불러오기');
  await page.goto('/home');
  await homeImport.setInputFiles(sdiPath);
  await expect(page.getByRole('dialog')).toContainText('이력서 작업을 찾았어요.');
  await page.getByRole('button', { name: '작업 불러오기', exact: true }).click();
  await expect(page).toHaveURL(/resume/);
  await expect(page.getByLabel('이름', { exact: false })).toHaveValue('김이음');
  await page.getByRole('button', { name: '경력', exact: true }).click();
  await expect(page.getByLabel('경력 명칭')).toHaveValue('서비스 기획 인턴');
});
test('direct resume route and browser back/forward retain the selected work context', async ({
  page,
}) => {
  await page.goto('/resume');
  await page.getByLabel('이름', { exact: false }).fill('이음 테스트');
  await page.getByLabel('연락처', { exact: false }).fill('010-0000-0000');
  await page.getByLabel('이메일', { exact: false }).fill('journey@example.test');
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');

  const taskNav = page.getByRole('navigation', { name: '다른 작업으로 이동' });
  await taskNav.getByRole('link', { name: '면접 준비' }).click();
  await expect(page).toHaveURL(/application/);
  await page.getByRole('link', { name: '면접 연습', exact: true }).click();
  await expect(page).toHaveURL(/interview/);
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '0');
  await page.goBack();
  await expect(page).toHaveURL(/application/);
  await expect(page.getByText('현재 작업 · 면접 준비', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/resume/);
  await expect(page.getByLabel('이름', { exact: false })).toHaveValue('이음 테스트');
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '100');
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/interview/);
  await expect(page.locator('.bridge')).toHaveAttribute('data-progress', '0');
  await expect(page.getByLabel('내 답변')).toBeVisible();
});
test('Dami motion PNG inventory decodes and Interview reads through full-frame sequence', async ({
  page,
}) => {
  await page.goto('/login');
  const frameNames: Record<string, string[]> = {
    basic: ['00.webp', '01.webp', '02.webp', '03.webp'],
    wave: ['00.webp', '01.webp', '02.webp', '03.webp'],
    happy: ['00.webp', '01.webp', '02.webp', '03.webp'],
    read: ['idle.webp', 'page-grab.webp', 'page-turn.webp', 'settle.webp'],
    stack: ['00.webp', '01.webp', '02.webp', '03.webp'],
    carry: ['00.webp', '01.webp', '02.webp', '03.webp', '04.webp'],
    build: ['ready.webp', 'lift.webp', 'strike.webp', 'impact.webp', 'recover.webp'],
    complete: ['00.webp', '01.webp', '02.webp', '03.webp', '04.webp'],
  };
  const decodedFrames = await page.evaluate(async (states) => {
    const results: Array<{ state: string; frame: string; width: number; height: number }> = [];
    for (const [state, frames] of Object.entries(states)) {
      for (const frame of frames) {
        const image = new Image();
        image.src = `/src/assets/dami/motion/${state}/${frame}`;
        await image.decode();
        results.push({ state, frame, width: image.naturalWidth, height: image.naturalHeight });
      }
    }
    return results;
  }, frameNames);
  expect(decodedFrames).toHaveLength(35);
  expect(decodedFrames.every(({ width, height }) => width > 0 && height > 0)).toBeTruthy();
  const distinctPairs = await page.evaluate(async () => {
    const results: Record<string, number> = {};
    for (const state of ['carry', 'complete']) {
      const frames: Uint8ClampedArray[] = [];
      for (let index = 0; index < 5; index += 1) {
        const image = new Image();
        image.src = `/src/assets/dami/motion/${state}/${String(index).padStart(2, '0')}.webp`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('2D canvas is unavailable');
        context.drawImage(image, 0, 0);
        frames.push(context.getImageData(0, 0, canvas.width, canvas.height).data);
      }
      let differentPairs = 0;
      for (let left = 0; left < frames.length; left += 1) {
        for (let right = left + 1; right < frames.length; right += 1) {
          let pixelsChanged = 0;
          for (let offset = 0; offset < frames[left].length; offset += 4) {
            if (
              frames[left][offset] !== frames[right][offset] ||
              frames[left][offset + 1] !== frames[right][offset + 1] ||
              frames[left][offset + 2] !== frames[right][offset + 2] ||
              frames[left][offset + 3] !== frames[right][offset + 3]
            )
              pixelsChanged += 1;
          }
          if (pixelsChanged > 0) differentPairs += 1;
        }
      }
      results[state] = differentPairs;
    }
    return results;
  });
  expect(distinctPairs).toEqual({ carry: 10, complete: 10 });

  await page.goto('/interview');
  const interviewDami = page.locator('.side-panel img.dami');
  await expect(interviewDami).toHaveAttribute('src', /motion\/read\/idle\.webp$/);
  const observedFrames = await interviewDami.evaluate(async (image) => {
    const seen = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      seen.add((image as HTMLImageElement).getAttribute('src') || '');
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
    return [...seen];
  });
  expect(observedFrames.filter((src) => /motion\/read\//.test(src)).length).toBeGreaterThan(1);
  expect(
    await interviewDami.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
});

test('responsive pages, keyboard modal and accessibility', async ({ page }) => {
  await start(page);
  await page.route('**/api/notices', (route) => route.fulfill({ json: { items: [] } }));
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const route of [
      '/login',
      '/home',
      '/application',
      '/cover-letter',
      '/resume',
      '/interview',
      '/review',
      '/notices',
    ]) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({
        path: path.join(out, `${route.slice(1)}-${size.width}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/home');
  await page.getByRole('button', { name: 'AI 설정', exact: true }).click();
  await page.getByLabel('API Key', { exact: true }).fill('test-secret-never-persist');
  await page.getByRole('button', { name: '연결 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('연결 확인 불가');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'test-secret-never-persist',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'AI 설정', exact: true })).toBeFocused();
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  await fs.writeFile(
    path.join(out, 'accessibility.json'),
    JSON.stringify(audit.violations, null, 2),
  );
  expect(audit.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
    [],
  );
});
