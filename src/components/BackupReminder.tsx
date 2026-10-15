import { useEffect, useState } from 'react';
import { useWork } from '../store';
import { saveLibrarySdi } from '../model';

/** 저장하지 않은 변경이 이 시간 이상 지나면 파일로 저장하라고 알려 줍니다. */
export const BACKUP_REMIND_MS = 30 * 60 * 1000;
/** 저장하지 않은 변경이 이 시간 이상 지났으면, 창을 닫을 때 한 번 더 확인합니다. */
const CLOSE_WARN_MS = 10 * 60 * 1000;

export function BackupReminder() {
  const { library, unsavedSince, markBackedUp } = useWork();
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!unsavedSince) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (Date.now() - unsavedSince >= CLOSE_WARN_MS) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedSince]);

  const show = !!unsavedSince && now - unsavedSince >= BACKUP_REMIND_MS && now >= snoozedUntil;
  if (!show) return null;
  return (
    <div className="backup-reminder" role="status">
      <p>
        <strong>작업을 파일로 저장해 둘까요?</strong>
        <br />
        작성한 내용은 이 브라우저에만 있어요. 방문 기록을 지우면 사라질 수 있어요.
      </p>
      <div className="button-row">
        <button
          className="button small"
          onClick={() => {
            saveLibrarySdi(library);
            markBackedUp();
          }}
        >
          지금 저장
        </button>
        <button
          className="button secondary small"
          onClick={() => setSnoozedUntil(Date.now() + BACKUP_REMIND_MS)}
        >
          30분 뒤에
        </button>
      </div>
    </div>
  );
}
