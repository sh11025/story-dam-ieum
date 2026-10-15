// 공지 파일(notices.json)의 형식. 관리자 앱(admin-app)에도 같은 형식이 있습니다.
// { "version": 1, "updatedAt": "...", "notices": [NoticeItem...], "faqs": [FaqItem...] }
export type NoticeItem = {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  publishedAt: string; // 게시일 (ISO 날짜)
  startAt?: string; // 이때부터 보임 (선택)
  endAt?: string; // 이때까지 보임 (선택)
};
export type FaqItem = { id: string; question: string; answer: string };
export type NoticeContent = { notices: NoticeItem[]; faqs: FaqItem[] | null };

const MAX_NOTICES = 200;
const MAX_FAQS = 50;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : '');

/** 공지가 지금 보여야 하는지 (게시 기간 안인지) */
export function isNoticeActive(n: NoticeItem, now = Date.now()) {
  if (n.startAt && Date.parse(n.startAt) > now) return false;
  if (n.endAt && Date.parse(n.endAt) < now) return false;
  return true;
}

/**
 * 외부에서 받은 JSON을 검사해 안전한 내용만 돌려줍니다. 잘못된 항목은 버립니다.
 * 게시 기간이 지나거나 아직 시작되지 않은 공지는 빼고 돌려줍니다.
 * faqs가 파일에 없으면 null (사용자 사이트의 기본 질문을 보여 줌).
 */
export function parseNoticeFile(input: unknown, now = Date.now()): NoticeContent {
  if (!input || typeof input !== 'object') throw new Error('공지 파일 형식이 올바르지 않습니다.');
  const file = input as Record<string, unknown>;
  if (file.version !== 1 || !Array.isArray(file.notices))
    throw new Error('공지 파일 형식이 올바르지 않습니다.');
  const notices: NoticeItem[] = [];
  for (const raw of file.notices.slice(0, MAX_NOTICES)) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    const item: NoticeItem = {
      id: str(n.id, 80),
      title: str(n.title, 180),
      body: str(n.body, 10000),
      urgent: n.urgent === true,
      publishedAt: date(n.publishedAt),
    };
    if (date(n.startAt)) item.startAt = date(n.startAt);
    if (date(n.endAt)) item.endAt = date(n.endAt);
    if (!item.id || !item.title || !item.publishedAt || !isNoticeActive(item, now)) continue;
    notices.push(item);
  }
  notices.sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  let faqs: FaqItem[] | null = null;
  if (Array.isArray(file.faqs)) {
    faqs = [];
    for (const raw of file.faqs.slice(0, MAX_FAQS)) {
      if (!raw || typeof raw !== 'object') continue;
      const f = raw as Record<string, unknown>;
      const item = {
        id: str(f.id, 80),
        question: str(f.question, 300),
        answer: str(f.answer, 5000),
      };
      if (item.id && item.question) faqs.push(item);
    }
  }
  return { notices, faqs };
}
