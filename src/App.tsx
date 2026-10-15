import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Settings, ArrowRight, Menu, X } from 'lucide-react';
import { useWork } from './store';
import {
  calculateWorkProgress,
  daysUntil,
  dDayLabel,
  kindNames,
  kindOfPath,
  kindStartPath,
  parseSdi,
  resumeModeLabels,
  type Kind,
  type Library,
  type Work,
} from './model';
import { Dami, BridgeProgress, Modal, Notice } from './components';
import { AiSettings } from './components/AiSettings';
import { ApplicationPicker } from './components/Applications';
import { BackupReminder } from './components/BackupReminder';
import { Login, Home, Application, CoverLetter, Resume, Interview, Review, Notices } from './pages';
import { NoticeList, markNoticesSeen, useNotices } from './pages/Notices';

// 작업 메뉴는 각 작업의 첫 화면으로 갑니다. 자기소개서·면접 준비는 지원 정보(공고)부터 시작해요.
const MAIN_MENU: [string, string, Kind?][] = [
  ['/home', '홈'],
  [kindStartPath['cover-letter'], '자기소개서', 'cover-letter'],
  [kindStartPath.resume, '이력서', 'resume'],
  [kindStartPath.interview, '면접 준비', 'interview'],
  ['/notices', '공지사항'],
];
const TASK_MENU: Kind[] = ['cover-letter', 'resume', 'interview'];
const TASK_STEPS: Partial<Record<Kind, [string, string][]>> = {
  'cover-letter': [
    ['/application', '지원 정보'],
    ['/cover-letter', '자기소개서'],
    ['/review', '최종 점검'],
  ],
  interview: [
    ['/application', '지원 정보'],
    ['/interview', '면접 연습'],
  ],
};
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function App() {
  const path = useLocation().pathname;
  const nav = useNavigate();
  const { work, update, replace, createApplication, importLibrary, error, saveStatus } = useWork();
  const { unseen } = useNotices();
  const [pendingLibrary, setPendingLibrary] = useState<Library | null>(null);
  const [modal, setModal] = useState<'ai' | 'notifications' | null>(null);
  const [mobile, setMobile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [pending, setPending] = useState<Work | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const isWelcome = path === '/login';
  const dDay = daysUntil(work.application.deadline);
  const pathKind = kindOfPath(path, work.kind);
  const isWork = pathKind !== null;
  const taskKind: Kind = pathKind ?? 'cover-letter';
  const taskLabel = taskKind === 'interview' ? '면접 준비' : `${kindNames[taskKind]} 작성`;
  const bridgeLabel =
    taskKind === 'resume'
      ? `이력서 · ${resumeModeLabels[work.resumeMode]}`
      : taskKind === 'interview'
        ? '면접 준비'
        : '자기소개서 작성';

  /** 작업을 시작하기 전에 작업 종류를 정해 둡니다(지원 정보 화면을 자기소개서·면접이 함께 쓰므로). */
  const startTask = (kind: Kind) => {
    if (work.kind !== kind)
      update((w) => {
        w.kind = kind;
      }, false);
  };

  // 화면을 옮기면 현재 작업 종류를 맞추고, 모바일 메뉴를 닫고, 맨 위로 올립니다.
  useEffect(() => {
    if (pathKind && work.kind !== pathKind)
      update((w) => {
        w.kind = pathKind;
      }, false);
    setMobile(false);
    window.scrollTo(0, 0);
  }, [path]);

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError('');
    try {
      if (!f.name.toLowerCase().endsWith('.sdi'))
        throw new Error('.sdi 작업 파일을 선택해 주세요.');
      if (f.size > MAX_FILE_BYTES) throw new Error('8MB 이하의 .sdi 파일을 선택해 주세요.');
      const parsed = parseSdi(await f.text());
      if (parsed.kind === 'work') setPending(parsed.work);
      else setPendingLibrary(parsed.library);
    } catch (err) {
      setFileError((err as Error).message);
    }
    e.target.value = '';
  };

  return (
    <>
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      {!isWelcome && (
        <header className={`app-header${isWork ? ' work-app-header' : ''}`}>
          <Link className="brand" to="/home">
            <Dami />
            <span>Story Dam Ieum</span>
          </Link>
          {isWork ? (
            <div className="work-navigation">
              <nav className="work-task-nav" aria-label="다른 작업으로 이동">
                {TASK_MENU.map((kind) => (
                  <NavLink
                    key={kind}
                    to={kindStartPath[kind]}
                    className={taskKind === kind ? 'active' : ''}
                    aria-current={taskKind === kind ? 'page' : undefined}
                    onClick={() => startTask(kind)}
                  >
                    {kindNames[kind]}
                  </NavLink>
                ))}
              </nav>
              {TASK_STEPS[taskKind] && (
                <nav
                  className="work-subnav"
                  aria-label={taskKind === 'interview' ? '면접 준비 단계' : '자기소개서 준비 단계'}
                >
                  {TASK_STEPS[taskKind]!.map(([to, label]) => (
                    <NavLink key={to} to={to} end>
                      {label}
                    </NavLink>
                  ))}
                </nav>
              )}
              <span className="work-current-label">현재 작업 · {taskLabel}</span>
            </div>
          ) : (
            <nav className={`main-nav ${mobile ? 'open' : ''}`} aria-label="주요 메뉴">
              {MAIN_MENU.map(([to, label, kind]) => (
                <NavLink
                  key={label}
                  to={to}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => kind && startTask(kind)}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="header-actions">
            {isWork && (
              <span className="work-save-status" role="status">
                {saveStatus}
              </span>
            )}
            {isWork && dDay !== null && (
              <span className={`d-day ${dDay <= 3 ? 'urgent' : ''}`} title="지원 마감까지">
                {dDayLabel(dDay)}
              </span>
            )}
            {isWork ? <ApplicationPicker /> : <span className="local-badge">기기 내 저장</span>}
            <button
              className="icon-button bell-button"
              aria-label={unseen ? `공지 알림 (새 공지 ${unseen}개)` : '공지 알림'}
              onClick={() => setModal('notifications')}
            >
              <Bell size={19} />
              {unseen > 0 && <span className="unread-dot" aria-hidden="true" />}
            </button>
            <button className="icon-button" aria-label="AI 설정" onClick={() => setModal('ai')}>
              <Settings size={19} />
            </button>
            <button
              className="icon-button mobile-menu"
              aria-label={mobile ? '메뉴 닫기' : '메뉴 열기'}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </header>
      )}
      {isWork && (
        <div className="work-header">
          <BridgeProgress
            key={taskKind === 'resume' ? `resume-${work.resumeMode}` : taskKind}
            progress={calculateWorkProgress(work, taskKind).percent}
            taskLabel={bridgeLabel}
          />
        </div>
      )}
      <div
        data-page={path.slice(1)}
        id="main-content"
        className={isWelcome ? '' : isWork ? 'main-container' : 'outer-container'}
        tabIndex={-1}
      >
        {!isWelcome && error && <Notice error>{error}</Notice>}
        {fileError && <Notice error>{fileError}</Notice>}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/*" element={<Navigate to="/login" replace />} />
          <Route path="/home" element={<Home onImport={() => fileInput.current?.click()} />} />
          <Route path="/application" element={<Application />} />
          {/* '내 경험'은 자기소개서 쓰기 화면으로 합쳤어요. 예전 주소로 오면 그 화면으로 보냅니다. */}
          <Route path="/experience" element={<Navigate to="/cover-letter" replace />} />
          <Route path="/cover-letter" element={<CoverLetter />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/review" element={<Review />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/support" element={<Navigate to="/notices" replace />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route
            path="*"
            element={
              <section className="empty-state">
                <Dami state="wave" />
                <h1>이 길은 아직 연결되지 않았어요.</h1>
                <Link to="/home" className="button">
                  홈으로 돌아가기
                </Link>
              </section>
            }
          />
        </Routes>
      </div>
      {!isWelcome && !isWork && (
        <footer className="app-footer">
          <span>
            Story Dam Ieum <i /> 당신의 이야기를 담아, 다음을 잇습니다.
          </span>
          <Link to="/notices">공지사항</Link>
        </footer>
      )}
      <input
        ref={fileInput}
        className="sr-only"
        aria-label="작업 파일 불러오기"
        type="file"
        accept=".sdi"
        onChange={importFile}
      />
      {pending && (
        <Modal title="저장한 작업 이어쓰기" onClose={() => setPending(null)}>
          <p>{kindNames[pending.kind]} 작업을 찾았어요.</p>
          <p className="fine-print">
            저장 시점: {new Date(pending.savedAt).toLocaleString('ko-KR')}
          </p>
          <Notice>
            불러온 작업은 새 지원서로 추가돼요. 지금 작업 중인 지원서는 그대로 남아요.
          </Notice>
          <button
            className="button full"
            onClick={() => {
              createApplication({ work: pending });
              nav(pending.kind === 'interview' ? '/interview' : kindStartPath[pending.kind]);
              setPending(null);
            }}
          >
            작업 불러오기 <ArrowRight size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              replace(pending);
              nav(pending.kind === 'interview' ? '/interview' : kindStartPath[pending.kind]);
              setPending(null);
            }}
          >
            지금 지원서를 이 파일 내용으로 바꾸기
          </button>
        </Modal>
      )}
      {pendingLibrary && (
        <Modal title="전체 백업 불러오기" onClose={() => setPendingLibrary(null)}>
          <p>지원서 {pendingLibrary.items.length}개가 들어 있는 백업 파일이에요.</p>
          <Notice>지금 있는 지원서는 그대로 두고, 백업의 지원서들을 추가해요.</Notice>
          <button
            className="button full"
            onClick={() => {
              importLibrary(pendingLibrary);
              setPendingLibrary(null);
              nav('/home');
            }}
          >
            지원서 {pendingLibrary.items.length}개 추가하기 <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      <BackupReminder />
      {modal && (
        <Modal
          title={modal === 'ai' ? 'AI 설정' : '공지 알림'}
          onClose={() => {
            if (modal === 'notifications') markNoticesSeen();
            setModal(null);
          }}
        >
          {modal === 'ai' ? (
            <AiSettings onDone={() => setModal(null)} />
          ) : (
            <NoticeModalBody
              onOpenAll={() => {
                markNoticesSeen();
                setModal(null);
                nav('/notices');
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function NoticeModalBody({ onOpenAll }: { onOpenAll: () => void }) {
  const { items, error } = useNotices();
  if (items === null) return <p role="status">공지를 불러오고 있어요.</p>;
  if (error) return <Notice error>{error}</Notice>;
  return (
    <>
      {items.length ? <NoticeList items={items.slice(0, 3)} compact /> : <p>새 공지가 없습니다.</p>}
      <button className="button secondary full" onClick={onOpenAll}>
        공지사항 전체 보기 <ArrowRight size={16} />
      </button>
    </>
  );
}
