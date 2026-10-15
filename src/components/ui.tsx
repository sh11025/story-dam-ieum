import { useEffect, useRef, useState, useId, type ReactNode } from 'react';
import { X, Check, ArrowRight, FileDown } from 'lucide-react';
import { useWork } from '../store';
import { saveSdi } from '../model';
import { exportFile } from '../export';
import { Dami } from './Dami';

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="닫기">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  placeholder = '',
  type = 'text',
  autoComplete,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>
          {label}
          {required && (
            <b className="required" aria-hidden="true">
              {' '}
              *
            </b>
          )}
        </span>
      </label>
      {multiline ? (
        <textarea
          id={id}
          maxLength={100000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          id={id}
          maxLength={100000}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
      )}
    </div>
  );
}
export function CheckField({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`check-field ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{children}</span>
    </label>
  );
}
export function SidePanel({
  title = '담이와 함께 정리해요',
  state = 'basic',
  children,
}: {
  title?: string;
  state?: 'basic' | 'read' | 'happy' | 'wave';
  children: ReactNode;
}) {
  return (
    <aside className="side-panel">
      <div className="helper-title">
        <Dami state={state} />
        <div>
          <span className="eyebrow">당신의 이야기를 함께 정리해요</span>
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </aside>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
/** 지금 지원서를 .sdi로 저장. 지원서가 하나뿐이면 백업한 것으로 봅니다. */
function useSaveCurrent() {
  const { work, library, markBackedUp } = useWork();
  return () => {
    saveSdi(work);
    if (library.items.length === 1) markBackedUp();
  };
}
export function SaveBar() {
  const { saveStatus } = useWork();
  const saveCurrent = useSaveCurrent();
  return (
    <div className="save-bar">
      <span className={saveStatus === '저장 실패' ? 'danger' : ''}>
        <Check size={15} />
        {saveStatus}
      </span>
      <button className="button secondary small" onClick={saveCurrent}>
        <FileDown size={16} />
        작업 파일 저장
      </button>
    </div>
  );
}
export function ExportButtons() {
  const { work } = useWork();
  const saveCurrent = useSaveCurrent();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      <div className="button-row">
        {(['docx', 'pdf'] as const).map((format) => (
          <button
            key={format}
            className="button"
            disabled={!!busy}
            onClick={async () => {
              setError('');
              setBusy(format);
              try {
                await exportFile(work, format);
              } catch (e) {
                setError(e instanceof Error ? e.message : '파일을 생성하지 못했어요.');
              } finally {
                setBusy('');
              }
            }}
          >
            {busy === format ? '파일 생성 중…' : `${format.toUpperCase()} 저장`}
            <FileDown size={16} />
          </button>
        ))}
        <button className="button secondary" onClick={saveCurrent}>
          .sdi 작업 저장
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
    </>
  );
}
export function PageTitle({
  step,
  title,
  description,
  action,
}: {
  step: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{step}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function NextButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="button" onClick={onClick} disabled={disabled}>
      {children}
      <ArrowRight size={17} />
    </button>
  );
}

/** 글자 목록으로 만드는 탭 버튼 줄 */
export function Tabs({
  items,
  active,
  onSelect,
}: {
  items: string[];
  active: string;
  onSelect: (item: string) => void;
}) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button key={t} className={active === t ? 'active' : ''} onClick={() => onSelect(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
