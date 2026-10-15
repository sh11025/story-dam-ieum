// 공고 주소 시험 도구 — 실제 채용 사이트에서 공고를 가져올 수 있는지 확인합니다.
//
// 사용법 (user-app 폴더에서):
//   npm run check:job -- https://www.saramin.co.kr/... https://www.wanted.co.kr/wd/...
//   npm run check:job -- urls.txt        (한 줄에 주소 하나씩 적은 파일)
//
// 결과는 화면에 나오고, test-results/job-check.md 파일에도 저장됩니다.
// 이 파일을 Claude에게 보여 주면 사이트별 맞춤 처리를 할 수 있어요.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { FetchError } from '../server/safeFetch.ts';
import { detailPageUrl, importJobPage } from '../server/jobPage.ts';

const args = process.argv.slice(2);
if (!args.length) {
  console.log('사용법: npm run check:job -- <공고 주소...> 또는 <주소 목록 파일.txt>');
  process.exit(1);
}
const urls: string[] = [];
for (const arg of args) {
  if (/^https?:\/\//.test(arg)) urls.push(arg);
  else if (existsSync(arg))
    urls.push(
      ...(await readFile(arg, 'utf8'))
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^https?:\/\//.test(l)),
    );
  else console.log(`건너뜀(주소도 파일도 아님): ${arg}`);
}

const LABELS = {
  company: '회사명',
  role: '직무',
  duties: '주요 업무',
  requirements: '자격요건',
  preferred: '우대사항',
} as const;
const short = (v: string, n = 120) =>
  v.length > n ? `${v.slice(0, n).replace(/\n/g, ' / ')}…` : v.replace(/\n/g, ' / ');
const report: string[] = [`# 공고 가져오기 시험 결과 (${new Date().toLocaleString('ko-KR')})`, ''];
let ok = 0;

for (const url of urls) {
  const site = new URL(url).hostname;
  const started = Date.now();
  const lines: string[] = [`## ${site}`, `- 주소: ${url}`];
  try {
    const result = await importJobPage(url);
    const detail = detailPageUrl('', url);
    const found = (Object.keys(LABELS) as (keyof typeof LABELS)[]).filter((k) => result.fields[k]);
    lines.push(
      `- 결과: 가져옴 (${((Date.now() - started) / 1000).toFixed(1)}초, 읽은 글 ${result.text.length}자${detail ? ', 본문 창도 함께 읽음' : ''})`,
      `- 제목: ${result.title || '(없음)'}`,
      `- 찾은 항목 ${found.length}/5${result.deadline ? ` + 마감일 ${result.deadline}` : ''}`,
      ...(Object.keys(LABELS) as (keyof typeof LABELS)[]).map(
        (k) => `  - ${LABELS[k]}: ${result.fields[k] ? short(result.fields[k]!) : '❌ 못 찾음'}`,
      ),
      ...(result.warning ? [`- 안내: ${result.warning}`] : []),
      `- 글 앞부분: ${short(result.text, 300)}`,
    );
    if (found.length >= 3) ok++;
  } catch (error) {
    const code = error instanceof FetchError ? error.code : 'unknown';
    lines.push(`- 결과: ❌ 실패 (${code}) ${(error as Error).message}`);
  }
  console.log(lines.join('\n') + '\n');
  report.push(...lines, '');
}

report.push(`---`, `총 ${urls.length}개 중 ${ok}개에서 항목을 3개 이상 찾았어요.`);
await mkdir('test-results', { recursive: true });
await writeFile('test-results/job-check.md', report.join('\n'));
console.log(`총 ${urls.length}개 중 ${ok}개에서 항목을 3개 이상 찾았어요.`);
console.log('자세한 결과: test-results/job-check.md');
