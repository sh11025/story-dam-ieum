import { z } from 'zod';

const text = z.string().max(100000);
// experienceId: 자기소개서 '내 경험'과 연결된 이력서 항목이면 그 경험의 번호.
// detailEdited: 연결된 항목의 내용을 이력서에서 직접 고쳤으면 true (경험 내용으로 덮어쓰지 않음).
const row = z.object({
  id: text,
  title: text,
  period: text,
  detail: text,
  experienceId: text.optional(),
  detailEdited: z.boolean().optional(),
});
const sectionNames = ['학력', '경력', '프로젝트·활동', '스킬', '자격·교육', '기타'] as const;
/** 경험을 넣을 수 있는 이력서 항목 ('none'이면 이력서에 넣지 않음) */
export const experienceResumeSections = ['프로젝트·활동', '경력', 'none'] as const;
export type ExperienceResumeSection = (typeof experienceResumeSections)[number];
export const resumeModeNames = ['new', 'existing', 'organization'] as const;
export type ResumeMode = (typeof resumeModeNames)[number];
export const resumeModeLabels: Record<ResumeMode, string> = {
  new: '새 이력서 만들기',
  existing: '기존 이력서 수정',
  organization: '회사·기관 양식',
};
const resumeSchema = z.object({
  name: text,
  email: text,
  phone: text,
  intro: text,
  photo: z.string().max(1500000),
  template: z.enum(['기본형', '신입 중심형', '경력 중심형']),
  sections: z
    .array(
      z.object({ name: z.enum(sectionNames), enabled: z.boolean(), rows: z.array(row).max(100) }),
    )
    .length(6),
});
const resumeSlotSchema = z.object({
  data: resumeSchema,
  reference: text,
  sourceConfirmed: z.boolean(),
  reviewed: z.boolean(),
});
const interviewQuestionSchema = z.object({
  id: text,
  question: text,
  answer: text,
  done: z.boolean(),
  kind: z.enum(['basic', 'additional']).default('basic'),
});
export const workSchema = z.object({
  formatVersion: z.literal(1),
  kind: z.enum(['cover-letter', 'resume', 'interview']),
  savedAt: z.string().datetime(),
  application: z.object({
    source: text,
    url: text,
    company: text,
    role: text,
    duties: text,
    requirements: text,
    preferred: text,
    deadline: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/)
      .default(''),
    confirmed: z.boolean(),
  }),
  experiences: z
    .array(
      z.object({
        id: text,
        title: text,
        situation: text,
        role: text,
        action: text,
        result: text,
        selected: z.boolean(),
        period: text.default(''),
        resumeSection: z.enum(experienceResumeSections).default('프로젝트·활동'),
      }),
    )
    .max(100),
  letters: z
    .array(
      z.object({
        id: text,
        title: text,
        body: text,
        limit: z.number().int().min(1).max(20000),
        countMode: z.enum(['chars', 'noSpace', 'bytes']).default('chars'),
        checked: z.boolean(),
      }),
    )
    .min(1)
    .max(50),
  resume: resumeSchema,
  resumeMode: z.enum(resumeModeNames),
  resumeSlots: z.object({
    new: resumeSlotSchema,
    existing: resumeSlotSchema,
    organization: resumeSlotSchema,
  }),
  interview: z.array(interviewQuestionSchema).min(1).max(50),
  interviewIndex: z.number().int().min(0).max(49),
  interviewStage: z.enum(['questions', 'summary', 'complete']),
  review: z.array(z.boolean()).length(4),
});
export type Work = z.infer<typeof workSchema>;
export type Kind = Work['kind'];

/** 작업 종류별 이름과, 해당 작업을 시작하는 화면 주소 */
export const kindNames: Record<Kind, string> = {
  'cover-letter': '자기소개서',
  resume: '이력서',
  interview: '면접 준비',
};
export const kindStartPath: Record<Kind, string> = {
  'cover-letter': '/application',
  resume: '/resume',
  interview: '/application',
};
const COVER_LETTER_PATHS = ['/experience', '/cover-letter', '/review'];
/**
 * 화면 주소가 어떤 작업에 속하는지 (작업 화면이 아니면 null).
 * 지원 정보(/application)는 자기소개서와 면접 준비가 함께 쓰는 첫 단계라, 지금 하던 작업을 따릅니다.
 */
export function kindOfPath(path: string, current: Kind = 'cover-letter'): Kind | null {
  if (path === '/resume') return 'resume';
  if (path === '/interview') return 'interview';
  if (path === '/application') return current === 'interview' ? 'interview' : 'cover-letter';
  return COVER_LETTER_PATHS.includes(path) ? 'cover-letter' : null;
}
export const uid = () => crypto.randomUUID();
export const newExperience = (): Work['experiences'][number] => ({
  id: uid(),
  title: '',
  situation: '',
  role: '',
  action: '',
  result: '',
  selected: true,
  period: '',
  resumeSection: '프로젝트·활동',
});

type Resume = Work['resume'];
/** 이력서에 들어갈 경험 요약: 내 역할·행동·결과를 한 줄씩 */
export const experienceSummary = (e: Work['experiences'][number]) =>
  [e.role, e.action, e.result]
    .map((v) => v.trim())
    .filter(Boolean)
    .join('\n');

/**
 * 자기소개서 '내 경험'과 이력서 항목(프로젝트·활동/경력)을 맞춥니다.
 * - 제목이 있는 경험마다 고른 이력서 항목에 한 줄이 생기고, 제목·기간은 항상 같게 유지합니다.
 * - 이력서 내용은 경험의 역할·행동·결과로 채우되, 이력서에서 직접 고친 항목은 그대로 둡니다.
 * - 경험을 지우거나 '이력서에 넣지 않음'으로 바꾸면 연결된 줄을 지웁니다(직접 고친 줄은 연결만 끊고 남김).
 * - 예전 파일에 같은 제목의 줄이 이미 있으면 새로 만들지 않고 그 줄과 연결합니다.
 */
export function syncResumeWithExperiences(resume: Resume, experiences: Work['experiences']) {
  const byId = new Map(experiences.map((e) => [e.id, e]));
  for (const section of resume.sections)
    section.rows = section.rows.filter((r) => {
      if (!r.experienceId) return true;
      const e = byId.get(r.experienceId);
      if (e && e.resumeSection !== 'none') return true;
      if (r.detailEdited) {
        delete r.experienceId;
        delete r.detailEdited;
        return true;
      }
      return false;
    });
  for (const e of experiences) {
    if (e.resumeSection === 'none') continue;
    const target = resume.sections.find((s) => s.name === e.resumeSection)!;
    let row: Resume['sections'][number]['rows'][number] | undefined;
    for (const section of resume.sections) {
      const i = section.rows.findIndex((r) => r.experienceId === e.id);
      if (i < 0) continue;
      row = section.rows[i];
      if (section !== target) {
        section.rows.splice(i, 1);
        target.rows.push(row);
      }
      break;
    }
    if (!row) {
      if (!e.title.trim() || target.rows.length >= 100) continue;
      const summary = experienceSummary(e);
      row = target.rows.find((r) => !r.experienceId && r.title.trim() === e.title.trim());
      if (row) {
        row.detailEdited = !!row.detail.trim() && row.detail !== summary;
        if (!e.period.trim()) e.period = row.period; // 이력서에만 적어 둔 기간은 경험으로 가져옵니다.
      } else {
        row = { id: uid(), title: '', period: '', detail: '', detailEdited: false };
        target.rows.push(row);
        target.enabled = true;
      }
      row.experienceId = e.id;
    }
    row.title = e.title;
    row.period = e.period;
    if (!row.detailEdited) row.detail = experienceSummary(e);
  }
}
/** 지금 이력서와 저장된 세 가지 이력서(새로 만들기·기존 수정·양식) 모두에 경험 연결을 맞춥니다. */
export function syncAllResumes(w: Work) {
  syncResumeWithExperiences(w.resume, w.experiences);
  for (const mode of resumeModeNames)
    if (mode !== w.resumeMode) syncResumeWithExperiences(w.resumeSlots[mode].data, w.experiences);
  w.resumeSlots[w.resumeMode].data = structuredClone(w.resume);
}

/** 글자 수 세는 방법. 회사마다 기준이 달라 문항별로 고를 수 있어요. */
export type CountMode = 'chars' | 'noSpace' | 'bytes';
export const countModeLabels: Record<CountMode, string> = {
  chars: '공백 포함',
  noSpace: '공백 제외',
  bytes: '바이트',
};
/** 글자 수 세기. 바이트는 한글·한자 등 한 글자를 2, 영어·숫자·공백을 1로 셉니다(줄바꿈은 2). */
export function countText(value: string, mode: CountMode = 'chars') {
  const chars = Array.from(value);
  if (mode === 'noSpace') return chars.filter((c) => !/\s/.test(c)).length;
  if (mode === 'bytes')
    return chars.reduce((sum, c) => sum + (c === '\n' ? 2 : c.charCodeAt(0) < 128 ? 1 : 2), 0);
  return chars.length;
}
export const countUnit = (mode: CountMode = 'chars') => (mode === 'bytes' ? '바이트' : '자');
export const letterLength = (l: { body: string; countMode?: CountMode }) =>
  countText(l.body, l.countMode ?? 'chars');

/** 마감일까지 남은 날 (오늘이 마감이면 0, 지났으면 음수). 날짜가 없으면 null */
export function daysUntil(deadline: string, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const [y, m, d] = deadline.split('-').map(Number);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - start) / 86400000);
}
export const dDayLabel = (days: number | null) =>
  days === null ? '' : days > 0 ? `D-${days}` : days === 0 ? 'D-Day' : '마감';
const initialResume = (): Work['resume'] => ({
  name: '',
  email: '',
  phone: '',
  intro: '',
  photo: '',
  template: '기본형',
  sections: sectionNames.map((name) => ({ name, enabled: false, rows: [] })),
});
const initialResumeSlot = (): Work['resumeSlots']['new'] => ({
  data: initialResume(),
  reference: '',
  sourceConfirmed: false,
  reviewed: false,
});
export const initialWork = (): Work => ({
  formatVersion: 1,
  kind: 'cover-letter',
  savedAt: new Date().toISOString(),
  application: {
    source: '',
    url: '',
    company: '',
    role: '',
    duties: '',
    requirements: '',
    preferred: '',
    deadline: '',
    confirmed: false,
  },
  experiences: [newExperience()],
  letters: ['지원동기', '직무 경험', '협업 경험'].map((title) => ({
    id: uid(),
    title,
    body: '',
    limit: 1000,
    countMode: 'chars' as const,
    checked: false,
  })),
  resume: initialResume(),
  resumeMode: 'new',
  resumeSlots: {
    new: initialResumeSlot(),
    existing: initialResumeSlot(),
    organization: initialResumeSlot(),
  },
  interview: [
    '지원한 직무에 관심을 갖게 된 계기는 무엇인가요?',
    '가장 기억에 남는 경험과 본인의 역할을 이야기해 주세요.',
    '프로젝트 성과는 어떻게 확인했나요?',
    '협업 중 의견 차이를 어떻게 해결했나요?',
    '이 경험을 지원한 직무에서 어떻게 활용할 수 있나요?',
  ].map((question) => ({ id: uid(), question, answer: '', done: false, kind: 'basic' as const })),
  interviewIndex: 0,
  interviewStage: 'questions',
  review: [false, false, false, false],
});
function progressParts(w: Work, kind: Kind = w.kind) {
  if (kind === 'resume')
    return [
      ...(w.resumeMode === 'new'
        ? []
        : [
            !!w.resumeSlots[w.resumeMode].reference.trim(),
            w.resumeSlots[w.resumeMode].sourceConfirmed,
          ]),
      !!w.resume.name.trim(),
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w.resume.email),
      !!w.resume.phone.trim(),
      ...w.resume.sections
        .filter((s) => s.enabled)
        .map(
          (s) => s.rows.length > 0 && s.rows.every((r) => !!r.title.trim() && !!r.detail.trim()),
        ),
      ...(w.resumeMode === 'new' ? [] : [w.resumeSlots[w.resumeMode].reviewed]),
    ];
  if (kind === 'interview')
    return [
      ...w.interview.map((q) => q.done && !!q.answer.trim()),
      w.interviewStage === 'complete',
    ];
  return [
    w.application.confirmed &&
      !!w.application.company.trim() &&
      !!w.application.role.trim() &&
      !!w.application.duties.trim() &&
      !!w.application.requirements.trim(),
    ...w.experiences
      .filter((e) => e.selected)
      .map((e) => [e.title, e.situation, e.role, e.action, e.result].every((v) => !!v.trim())),
    ...w.letters.map((l) => !!l.body.trim() && l.checked && letterLength(l) <= l.limit),
    ...w.review,
  ];
}
type WorkProgress = { percent: number; completed: number; total: number };
function summarizeProgress(parts: boolean[]): WorkProgress {
  const completed = parts.filter(Boolean).length;
  return {
    percent: parts.length ? Math.round((completed / parts.length) * 100) : 0,
    completed,
    total: parts.length,
  };
}
const calculateCoverLetterProgress = (w: Work) =>
  summarizeProgress(progressParts(w, 'cover-letter'));
const calculateResumeProgress = (w: Work) => summarizeProgress(progressParts(w, 'resume'));
const calculateInterviewProgress = (w: Work): WorkProgress => {
  const basics = w.interview.filter((q) => q.kind === 'basic');
  const additional = w.interview.filter((q) => q.kind === 'additional');
  const basicDone = basics.filter((q) => q.done && q.answer.trim()).length;
  const extraDone = additional.filter((q) => q.done && q.answer.trim()).length;
  const complete = w.interviewStage === 'complete';
  return {
    percent: complete
      ? 100
      : Math.min(
          96,
          basicDone === basics.length
            ? 90 + extraDone * 2
            : Math.round((basicDone / Math.max(basics.length, 1)) * 100),
        ),
    completed: basicDone + extraDone + Number(complete),
    total: w.interview.length + 1,
  };
};
export const calculateWorkProgress = (w: Work, kind: Kind = w.kind) => {
  if (kind === 'resume') return calculateResumeProgress(w);
  if (kind === 'interview') return calculateInterviewProgress(w);
  return calculateCoverLetterProgress(w);
};
export const progressOf = (w: Work) => calculateWorkProgress(w).percent;

/** 이력서·면접 화면 옆에 보여 줄, 다른 작업에서 이미 입력한 정보 */
export function sharedContext(w: Work) {
  return {
    experiences: w.experiences.filter((experience) => experience.title.trim()),
    application: [w.application.company, w.application.role].filter(Boolean).join(' · '),
  };
}

/** All bridge geometry is derived from the same rounded, bounded work percentage. */
export function bridgeMetrics(progress: number, segmentCount = 20) {
  const percent = Math.max(0, Math.min(100, Math.round(progress)));
  const installedLogs = Math.floor((percent / 100) * segmentCount);
  return { percent, installedLogs, segmentCount, completion: installedLogs / segmentCount };
}
/** 지원서 여러 개를 묶은 것 (브라우저 저장 및 '모든 지원서 백업' 파일) */
export type LibraryItem = { id: string; name: string; createdAt: string; work: Work };
export type Library = { version: 1; activeId: string; items: LibraryItem[]; lastBackupAt: string };
export const MAX_LIBRARY_ITEMS = 30;

export function parseLibrary(raw: string | object): Library {
  const value = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<Library>;
  if (value.version !== 1 || !Array.isArray(value.items) || !value.items.length)
    throw new Error('지원서 묶음 파일 형식이 올바르지 않습니다.');
  const items = value.items.slice(0, MAX_LIBRARY_ITEMS).map((item) => ({
    id: String(item.id),
    name: String(item.name ?? '').slice(0, 60),
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    work: parseWork(JSON.stringify(item.work)),
  }));
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error('중복된 지원서가 있는 파일입니다.');
  const activeId = items.some((i) => i.id === value.activeId) ? value.activeId! : items[0].id;
  return { version: 1, activeId, items, lastBackupAt: String(value.lastBackupAt ?? '') };
}
export const serializeLibrary = (lib: Library) =>
  JSON.stringify({
    ...lib,
    items: lib.items.map((i) => ({ ...i, work: workSchema.parse(i.work) })),
  });

/** .sdi 파일 읽기: 지원서 1개 파일(formatVersion 1) 또는 모든 지원서 백업 파일(formatVersion 2) */
export function parseSdi(
  raw: string,
): { kind: 'work'; work: Work } | { kind: 'library'; library: Library } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('손상된 파일입니다. 올바른 .sdi 파일을 선택해 주세요.');
  }
  if (
    value &&
    typeof value === 'object' &&
    (value as { formatVersion?: unknown }).formatVersion === 2
  )
    return { kind: 'library', library: parseLibrary((value as { library: object }).library) };
  return { kind: 'work', work: parseWork(raw) };
}

export function parseWork(raw: string): Work {
  if (raw.length > 8 * 1024 * 1024) throw new Error('작업 파일은 8MB 이하만 불러올 수 있어요.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('손상된 파일입니다. 올바른 .sdi 파일을 선택해 주세요.');
  }
  // Older formatVersion 1 files contain one resume and five basic interview questions.
  // Normalize them without changing the file version or losing the original content.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const legacy = value as Record<string, unknown>;
    if (!legacy.resumeMode) legacy.resumeMode = 'new';
    if (!legacy.resumeSlots && legacy.resume) {
      const blank = initialResumeSlot();
      legacy.resumeSlots = {
        new: { ...blank, data: legacy.resume },
        existing: initialResumeSlot(),
        organization: initialResumeSlot(),
      };
    }
    if (Array.isArray(legacy.interview))
      legacy.interview = legacy.interview.map((q) =>
        q && typeof q === 'object' ? { kind: 'basic', ...q } : q,
      );
    if (legacy.interviewIndex === undefined) legacy.interviewIndex = 0;
    if (!legacy.interviewStage) legacy.interviewStage = 'questions';
  }
  const parsed = workSchema.safeParse(value);
  if (!parsed.success)
    throw new Error('지원하지 않는 버전이거나 필수 내용이 빠진 .sdi 파일입니다.');
  const data = parsed.data;
  data.resumeSlots[data.resumeMode].data = structuredClone(data.resume);
  syncAllResumes(data);
  if (data.interviewIndex >= data.interview.length)
    throw new Error('면접 질문 위치가 올바르지 않습니다.');
  if (new Set(data.resume.sections.map((s) => s.name)).size !== 6)
    throw new Error('이력서 항목 구조가 올바르지 않습니다.');
  for (const mode of resumeModeNames) {
    if (new Set(data.resumeSlots[mode].data.sections.map((s) => s.name)).size !== 6)
      throw new Error('이력서 항목 구조가 올바르지 않습니다.');
    const candidate = data.resumeSlots[mode].data;
    if (candidate.photo && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(candidate.photo))
      throw new Error('사진 형식이 올바르지 않습니다.');
    for (const section of candidate.sections)
      if (new Set(section.rows.map((entry) => entry.id)).size !== section.rows.length)
        throw new Error('중복된 항목이 있는 파일입니다.');
  }
  for (const list of [
    data.letters,
    data.experiences,
    data.interview,
    ...data.resume.sections.map((s) => s.rows),
  ])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw new Error('중복된 항목이 있는 파일입니다.');
  return data;
}
export const serializedWork = (w: Work) =>
  JSON.stringify(workSchema.parse({ ...w, savedAt: new Date().toISOString() }), null, 2);
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const safeName = (v: string) => v.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
export function saveSdi(w: Work) {
  const company = w.application.company.trim();
  download(
    new Blob([serializedWork(w)], { type: 'application/json' }),
    `스토리담이음-${company ? `${safeName(company)}-` : ''}${w.kind}.sdi`,
  );
}
/** 모든 지원서를 한 파일로 백업 */
export function saveLibrarySdi(lib: Library) {
  const date = new Date().toISOString().slice(0, 10);
  download(
    new Blob(
      [
        JSON.stringify(
          {
            formatVersion: 2,
            savedAt: new Date().toISOString(),
            library: JSON.parse(serializeLibrary(lib)),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
    `스토리담이음-전체백업-${date}.sdi`,
  );
}
