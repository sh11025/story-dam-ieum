import { useState } from 'react';
import { Plus, Pencil, Trash2, Download, Check } from 'lucide-react';
import { itemLabel, useWork } from '../store';
import { calculateWorkProgress, daysUntil, dDayLabel, saveLibrarySdi } from '../model';
import { Modal } from './ui';

/** 새 지원서 만들기 창 */
function NewApplicationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { createApplication } = useWork();
  const [name, setName] = useState('');
  const [copyShared, setCopyShared] = useState(true);
  return (
    <Modal title="새 지원서 만들기" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createApplication({ name: name.trim(), copyShared });
          onClose();
          onCreated?.();
        }}
      >
        <div className="field">
          <label htmlFor="new-application-name">
            <span>지원서 제목 (선택)</span>
          </label>
          <input
            id="new-application-name"
            value={name}
            maxLength={60}
            placeholder="예: 담이랩 서비스 기획"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={copyShared}
            onChange={(e) => setCopyShared(e.target.checked)}
          />
          지금 지원서의 경험과 이력서를 복사해서 시작하기
        </label>
        <p className="fine-print">
          지원 정보, 자기소개서, 면접 연습은 새로 시작해요. 기존 지원서는 그대로 남아요.
        </p>
        <button className="button full">만들기</button>
      </form>
    </Modal>
  );
}

/** 작업 화면 머리글의 작은 지원서 선택 상자 */
export function ApplicationPicker() {
  const { library, activeId, switchApplication } = useWork();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <select
        className="application-picker"
        aria-label="지원서 선택"
        value={activeId}
        onChange={(e) => {
          if (e.target.value === '__new') setCreating(true);
          else switchApplication(e.target.value);
        }}
      >
        {library.items.map((item) => (
          <option key={item.id} value={item.id}>
            {itemLabel(item)}
          </option>
        ))}
        <option value="__new">+ 새 지원서…</option>
      </select>
      {creating && <NewApplicationDialog onClose={() => setCreating(false)} />}
    </>
  );
}

/** 홈 화면의 "내 지원서" 목록 */
export function ApplicationList() {
  const {
    library,
    activeId,
    switchApplication,
    renameApplication,
    deleteApplication,
    markBackedUp,
  } = useWork();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <section className="application-list" aria-labelledby="application-list-title">
      <div className="application-list-head">
        <h2 id="application-list-title">내 지원서 {library.items.length}개</h2>
        <div className="button-row">
          <button className="button secondary small" onClick={() => setCreating(true)}>
            <Plus size={16} /> 새 지원서
          </button>
          <button
            className="button secondary small"
            onClick={() => {
              saveLibrarySdi(library);
              markBackedUp();
            }}
          >
            <Download size={16} /> 모든 지원서 백업
          </button>
        </div>
      </div>
      <ul>
        {library.items.map((item) => {
          const w = item.work;
          const days = daysUntil(w.application.deadline);
          const progress = calculateWorkProgress(w, 'cover-letter').percent;
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className={isActive ? 'active' : ''}>
              {editing === item.id ? (
                <form
                  className="rename-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameApplication(item.id, draftName.trim());
                    setEditing(null);
                  }}
                >
                  <input
                    aria-label="지원서 제목"
                    value={draftName}
                    maxLength={60}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                  <button className="icon-button" aria-label="제목 저장">
                    <Check size={17} />
                  </button>
                </form>
              ) : (
                <button className="application-open" onClick={() => switchApplication(item.id)}>
                  <strong>{itemLabel(item)}</strong>
                  <span className="fine-print">
                    {isActive ? '지금 작업 중 · ' : ''}자기소개서 {progress}%
                  </span>
                </button>
              )}
              {days !== null && (
                <span className={`d-day ${days <= 3 ? 'urgent' : ''}`}>{dDayLabel(days)}</span>
              )}
              <button
                className="icon-button"
                aria-label={`지원서 제목 바꾸기: ${itemLabel(item)}`}
                onClick={() => {
                  setDraftName(item.name || itemLabel(item));
                  setEditing(item.id);
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                className={`icon-button ${confirmDelete === item.id ? 'danger' : ''}`}
                aria-label={
                  confirmDelete === item.id
                    ? `지원서 정말 삭제: ${itemLabel(item)}`
                    : `지원서 삭제: ${itemLabel(item)}`
                }
                onClick={() => {
                  if (confirmDelete !== item.id) return setConfirmDelete(item.id);
                  deleteApplication(item.id);
                  setConfirmDelete(null);
                }}
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {confirmDelete && (
        <p className="fine-print" role="status">
          휴지통 버튼을 한 번 더 누르면 지원서가 지워져요.
        </p>
      )}
      {creating && <NewApplicationDialog onClose={() => setCreating(false)} />}
    </section>
  );
}
