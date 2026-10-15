import { useEffect, useState, type ReactNode } from 'react';
import { PageTitle, Notice } from '../components';
import { fetchNotices } from '../services';
import type { FaqItem, NoticeItem } from '../../shared/notices';

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');
const SEEN_KEY = 'story-dam-ieum-seen-notices';

// 기본 "자주 묻는 질문" (관리자가 공지 파일에 질문을 넣으면 그것으로 바뀝니다)
const DEFAULT_FAQS: FaqItem[] = [
  {
    id: 'where',
    question: '작업은 어디에 저장되나요?',
    answer:
      '취업 작업 데이터는 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다. 오래 보관하거나 다른 기기에서 이어 쓰려면 .sdi 파일로 저장해 주세요.',
  },
  {
    id: 'url',
    question: '공고 주소로 가져오기가 안 돼요.',
    answer:
      '일부 채용 사이트는 자동으로 내용을 가져가는 것을 막거나, 공고를 그림으로 올려 둡니다. 이럴 때는 공고 내용을 복사해 "공고 붙여넣기"에 넣어 주세요.',
  },
];

// ── 공지는 한 번 받아서 여러 화면이 함께 씁니다 ─────────────────────
type State = { items: NoticeItem[] | null; faqs: FaqItem[] | null; error: string; seen: string[] };
const readSeen = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-300) : [];
  } catch {
    return [];
  }
};
let state: State = { items: null, faqs: null, error: '', seen: readSeen() };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const setState = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
function load() {
  loading ??= fetchNotices()
    .then(({ items, faqs }) => setState({ items, faqs, error: '' }))
    .catch((e: Error) => setState({ items: [], error: e.message }))
    .finally(() => setTimeout(() => (loading = null), 60_000)); // 1분 뒤에는 다시 받을 수 있게
  return loading;
}
/** 지금 보이는 공지를 모두 읽음으로 표시 (내 브라우저에만 기억) */
export function markNoticesSeen() {
  const ids = Array.from(new Set([...state.seen, ...(state.items ?? []).map((n) => n.id)]));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-300)));
  } catch {}
  setState({ seen: ids });
}

export function useNotices() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const unseen = (state.items ?? []).filter((n) => !state.seen.includes(n.id)).length;
  return { items: state.items, faqs: state.faqs ?? DEFAULT_FAQS, error: state.error, unseen };
}

// ── 공지 글: **굵게** 와 인터넷 주소 링크만 꾸밉니다 (다른 코드는 그대로 글자로 보임) ──
const TOKEN = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s<>"')\]]+)/g;
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) parts.push(<strong key={m.index}>{token.slice(2, -2)}</strong>);
    else
      parts.push(
        <a key={m.index} href={token} target="_blank" rel="noopener noreferrer">
          {token}
        </a>,
      );
    last = m.index! + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className="prewrap">{parts}</p>;
}

export function NoticeList({ items, compact = false }: { items: NoticeItem[]; compact?: boolean }) {
  const { unseen } = useNotices();
  return (
    <>
      {items.map((n) => (
        <details className="notice-item" key={n.id} open={!compact && n.urgent}>
          <summary>
            {unseen > 0 && !state.seen.includes(n.id) && <span className="new-badge">새 글</span>}
            {n.urgent ? '중요 · ' : ''}
            {n.title} <span className="fine-print">{dateLabel(n.publishedAt)}</span>
          </summary>
          <RichText text={n.body} />
        </details>
      ))}
    </>
  );
}

export function Notices() {
  const { items, faqs, error } = useNotices();
  // 공지 화면을 열고 나가면 읽은 것으로 봅니다.
  useEffect(() => () => markNoticesSeen(), []);
  return (
    <>
      <PageTitle
        step="NOTICE"
        title="함께하는 이야기를 모았어요."
        description="서비스 소식과 안내를 확인해 주세요."
      />
      <section className="panel support-folder">
        <div className="panel-body">
          <h2 className="panel-heading">공지사항</h2>
          {items === null ? (
            <p role="status">공지를 불러오고 있어요.</p>
          ) : error ? (
            <Notice error>{error}</Notice>
          ) : items.length ? (
            <NoticeList items={items} />
          ) : (
            <Notice>게시된 공지가 없습니다.</Notice>
          )}
          <h2 className="panel-heading">자주 묻는 질문</h2>
          {faqs.map((f) => (
            <details className="notice-item" key={f.id}>
              <summary>{f.question}</summary>
              <RichText text={f.answer} />
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
