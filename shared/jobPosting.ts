// 채용공고 글에서 회사명·직무·주요 업무·자격요건·우대사항·마감일을 찾아내는 규칙입니다.
// AI 분석이 아니라, 공고에 실제로 적힌 제목/항목 이름을 기준으로 찾습니다.

export type JobFields = {
  company: string;
  role: string;
  duties: string;
  requirements: string;
  preferred: string;
};
export type JobFieldKey = keyof JobFields;

// 공고마다 같은 항목을 다르게 부르므로 비슷한 이름도 함께 찾습니다.
// (원티드 등에서 쓰는 "Our Job", "이런 분을 찾고 있어요" 같은 표현 포함)
const SYNONYMS: Record<JobFieldKey, string[]> = {
  company: ['회사명', '기업명', '회사 이름'],
  role: [
    '직무',
    '모집 직무',
    '모집직무',
    '모집 분야',
    '모집분야',
    '모집 부문',
    '모집부문',
    '포지션',
    '채용 포지션',
    '채용 직무',
  ],
  duties: [
    '주요 업무',
    '주요업무',
    '담당 업무',
    '담당업무',
    '업무 내용',
    '업무내용',
    '하는 일',
    '이런 일을 해요',
    '이런 일을 합니다',
    '합류하면 함께 할 업무예요',
    '함께하실 일',
    '앞으로 저희와 함께하실 일들이에요',
    'Our Job',
    'What you will do',
    "What you'll do",
    'Responsibilities',
    'Role',
  ],
  requirements: [
    '자격요건',
    '자격 요건',
    '지원자격',
    '지원 자격',
    '필수 요건',
    '필수요건',
    '필수 자격',
    '필요 역량',
    '응시자격',
    '응시 자격',
    '이런 분을 찾고 있어요',
    '이런 분을 찾아요',
    '이런 분과 함께하고 싶어요',
    'Our Expectation',
    'Requirements',
    'Qualifications',
    'Who you are',
  ],
  preferred: [
    '우대사항',
    '우대 사항',
    '우대조건',
    '우대 조건',
    '우대 요건',
    '우대 역량',
    '이런 분이면 더 좋아요',
    '이런 분이라면 더 좋아요',
    '이런 경험이 있다면 더 좋아요',
    'Preferred',
    'Preferred Qualifications',
    'Nice to have',
    'Bonus points',
  ],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALL = (Object.keys(SYNONYMS) as JobFieldKey[]).flatMap((key) =>
  SYNONYMS[key].map((label) => ({ key, label })),
);
// 앞쪽 꾸밈 기호(■, ●, #, [ 등)를 허용하고, 제목 뒤 괄호 설명 "(이런 분을 찾아요)"도 허용합니다.
// 뒤에 콜론이 있으면 같은 줄의 값을 읽습니다. 영어 제목은 대소문자를 가리지 않습니다.
const LINE = new RegExp(
  `^[\\s#*\\-•·■□●○▶▷◆◇★☆✔✅\\[【<(]*(${ALL.map((x) => escape(x.label))
    .sort((a, b) => b.length - a.length)
    .join('|')})[\\s\\]】>)]*(?:[(（][^)）]{0,60}[)）])?\\s*(?:[:：]\\s*(.*))?$`,
  'i',
);
const MAX_SECTION_LINES = 40;
// 항목이 아닌 다른 구역의 제목. 이런 줄이 나오면 앞 항목 목록을 끝냅니다(잡코리아·사람인 공고 본문).
const OTHER_SECTION = new RegExp(
  `^[\\s#*\\-•·■□●○▶▷◆◇★☆✔✅ㆍ\\[【<(]*(${[
    '전형\\s*절차',
    '전형\\s*방법',
    '채용\\s*절차',
    '채용\\s*전형',
    '접수\\s*기간',
    '접수\\s*방법',
    '지원\\s*방법',
    '지원서\\s*접수',
    '제출\\s*서류',
    '근무\\s*조건',
    '근무\\s*환경',
    '근무\\s*형태',
    '근무지',
    '근무\\s*장소',
    '급여',
    '복리\\s*후생',
    '혜택\\s*및\\s*복지',
    '유의\\s*사항',
    '기타\\s*사항',
    '참고\\s*사항',
    '회사\\s*소개',
    '기업\\s*소개',
    '문의',
    '혜택',
    '복지',
  ].join('|')})[\\s\\]】>):：]*$`,
);
const BULLET = /^([-•·*▪◦‣–—]|\d+[.)]|[①-⑳]|[ㄱ-ㅎ][.)])/;

/** 표의 칸 이름("응 시 자 격", "담당업무")이 어떤 항목인지 알려 줍니다. 띄어쓰기는 무시합니다. */
export function fieldKeyOfLabel(label: string): JobFieldKey | null {
  const norm = (v: string) => v.replace(/[\s:：*■□●○▶▷◆◇★☆ㆍ·•[\]【】]/g, '').toLowerCase();
  const target = norm(label);
  if (!target || target.length > 20) return null;
  return ALL.find((x) => norm(x.label) === target)?.key ?? null;
}

function keyOf(label: string): JobFieldKey {
  const lower = label.toLowerCase();
  return ALL.find((x) => x.label.toLowerCase() === lower)!.key;
}

/**
 * 글에서 항목을 찾습니다.
 * - "회사명: 담이랩"처럼 같은 줄에 적힌 값
 * - "자격요건" 제목 다음 줄부터 이어지는 목록 (다음 항목 제목이 나올 때까지)
 * - 자격요건 목록 안의 "(우대) …" 줄은 우대사항으로 옮깁니다.
 */
export function extractJobFields(source: string): Partial<JobFields> {
  const found: Partial<JobFields> = {};
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(LINE);
    if (!match) continue;
    const key = keyOf(match[1]);
    if (found[key]) continue;
    const inline = (match[2] ?? '').trim();
    if (inline) {
      found[key] = inline;
      continue;
    }
    const collected: string[] = [];
    let blank = 0;
    for (let j = i + 1; j < lines.length && collected.length < MAX_SECTION_LINES; j++) {
      const line = lines[j].trim();
      if (LINE.test(line) || OTHER_SECTION.test(line)) break;
      if (!line) {
        if (collected.length && ++blank >= 2) break;
        continue;
      }
      // 빈 줄 다음에 목록 기호 없이 짧은 줄이 오면, 다른 구역의 제목으로 보고 멈춥니다.
      if (collected.length && blank && line.length < 40 && !BULLET.test(line)) break;
      blank = 0;
      // 짧은 목록 뒤에 긴 문단이 나오면 다른 내용(회사 소개 등)으로 보고 멈춥니다.
      if (collected.length && line.length >= 60 && collected.every((l) => l.length < 60)) break;
      collected.push(line);
    }
    // 표의 머리줄("담당업무 | 경력 구분 | 모집 인원 | 근무지")을 제목으로 잘못 본 경우: 짧은 칸 이름만 이어지면 버립니다.
    const looksLikeTableHeader =
      collected.length >= 4 && collected.slice(0, 4).every((l) => l.length <= 6 && !BULLET.test(l));
    if (collected.length && !looksLikeTableHeader) found[key] = collected.join('\n');
  }
  if (found.requirements) {
    const PREFERRED_MARK = /^[-•·*\s]*[(（[]\s*우대\s*[)）\]]\s*/;
    const lines = found.requirements.split('\n');
    const preferred = lines.filter((l) => PREFERRED_MARK.test(l));
    if (preferred.length && preferred.length < lines.length) {
      found.requirements = lines.filter((l) => !PREFERRED_MARK.test(l)).join('\n');
      const moved = preferred.map((l) => l.replace(PREFERRED_MARK, '')).join('\n');
      found.preferred = [found.preferred, moved].filter(Boolean).join('\n');
    }
  }
  return found;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${y}-${pad(m)}-${pad(d)}`
    : '';
};

/**
 * 마감일 찾기. "마감일: 2026.10.31", "접수기간 2026-10-01 ~ 2026-10-31", "~10/31(금)" 등.
 * 연도가 없으면 오늘 기준으로 가장 가까운 앞날로 봅니다. 상시채용이면 빈칸.
 */
export function extractDeadline(source: string, today = new Date()): string {
  const lines = source.split(/\r?\n/);
  const KEY = /(마감|접수\s*기간|모집\s*기간|지원\s*기간|채용\s*기간|deadline)/i;
  const DATE = /(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;
  for (let i = 0; i < lines.length; i++) {
    if (!KEY.test(lines[i])) continue;
    const window = [lines[i], lines[i + 1] ?? ''].join(' ');
    if (/상시|채용\s*시\s*마감/.test(window)) return '';
    const dates = [...window.matchAll(DATE)]
      .map((m) => {
        const month = Number(m[2]);
        const day = Number(m[3]);
        let year = m[1] ? Number(m[1]) : today.getFullYear();
        if (!m[1]) {
          const candidate = Date.UTC(year, month - 1, day);
          const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
          if (candidate < start - 60 * 86400000) year += 1; // 두 달 넘게 지난 날짜면 내년으로
        }
        return isoDate(year, month, day);
      })
      .filter(Boolean);
    // 기간(시작 ~ 끝)이면 마지막 날짜가 마감일
    if (dates.length) return dates[dates.length - 1];
  }
  return '';
}
