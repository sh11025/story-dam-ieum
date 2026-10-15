import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, PenLine } from 'lucide-react';
import { useWork } from '../store';
import { countModeLabels, countText, countUnit, letterLength, uid, type CountMode } from '../model';
import { requestRevision } from '../services';
import {
  PageTitle,
  Field,
  CheckField,
  SidePanel,
  Notice,
  SaveBar,
  NextButton,
} from '../components';

export function CoverLetter() {
  const { work, update } = useWork();
  const [params, setParams] = useSearchParams();
  const requested = work.letters.findIndex((l) => l.id === params.get('question'));
  const [index, setIndex] = useState(Math.max(0, requested));
  const letter = work.letters[Math.min(index, work.letters.length - 1)];
  const editor = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState('');
  const [proposal, setProposal] = useState<{
    before: string;
    after: string;
    start: number;
    end: number;
    id: string;
    full: string;
  } | null>(null);
  const [undo, setUndo] = useState<{ id: string; body: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState('');
  const abort = useRef<AbortController | null>(null);
  const nav = useNavigate();
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (requested >= 0) {
      setIndex(requested);
      editor.current?.focus();
    }
  }, [requested]);
  const target =
    selection.end > selection.start
      ? letter.body.slice(selection.start, selection.end)
      : letter.body;
  /** 선택한 부분(없으면 문항 전체)과 수정안을 나란히 비교할 수 있게 준비합니다. */
  const compareWith = (after: string) => {
    const hasSelection = selection.end > selection.start;
    setProposal({
      before: target,
      after,
      start: hasSelection ? selection.start : 0,
      end: hasSelection ? selection.end : letter.body.length,
      id: letter.id,
      full: letter.body,
    });
  };
  const propose = async () => {
    if (!target.trim()) {
      setStatus('수정할 문장을 먼저 작성해 주세요.');
      return;
    }
    abort.current?.abort();
    const control = new AbortController();
    abort.current = control;
    setStatus('요청 중');
    try {
      const after = await requestRevision({ text: target, instruction }, control.signal);
      if (!control.signal.aborted) {
        compareWith(after);
        setStatus('성공');
      }
    } catch (e) {
      setStatus((e as Error).name === 'AbortError' ? '요청을 취소했어요.' : (e as Error).message);
    }
  };
  const changeTab = (i: number) => {
    abort.current?.abort();
    setIndex(i);
    setParams({});
    setSelection({ start: 0, end: 0 });
    setProposal(null);
    setManual(false);
    setStatus('');
  };
  const apply = () => {
    if (!proposal) return;
    if (proposal.id !== letter.id || proposal.full !== letter.body) {
      setStatus('제안 이후 원문이 변경되었어요. 새로 제안해 주세요.');
      setProposal(null);
      return;
    }
    setUndo({ id: letter.id, body: letter.body });
    update((w) => {
      const l = w.letters.find((l) => l.id === letter.id)!;
      l.body =
        letter.body.slice(0, proposal.start) + proposal.after + letter.body.slice(proposal.end);
      l.checked = false;
    });
    setProposal(null);
    setStatus('수정안을 적용했어요.');
  };
  const count = letterLength(letter);
  const unit = countUnit(letter.countMode);
  return (
    <>
      <PageTitle
        step="03 · COVER LETTER"
        title="경험을 나만의 문장으로 이어요."
        description="당신이 직접 겪은 이야기, 당신의 목소리로 들려주세요."
      />
      <div className="workspace editor-layout">
        <section className="panel editor-panel">
          <div className="tabs">
            {work.letters.map((l, i) => (
              <button
                key={l.id}
                className={l.id === letter.id ? 'active' : ''}
                onClick={() => changeTab(i)}
              >
                {l.title}
              </button>
            ))}
            <button
              disabled={work.letters.length >= 50}
              onClick={() => {
                update((w) =>
                  w.letters.push({
                    id: uid(),
                    title: `추가 문항 ${w.letters.length - 2}`,
                    body: '',
                    limit: 1000,
                    countMode: w.letters[index]?.countMode ?? 'chars',
                    checked: false,
                  }),
                );
                changeTab(work.letters.length);
              }}
            >
              <Plus size={16} />
              문항 추가
            </button>
          </div>
          <div className="panel-body">
            <div className="question-heading">
              <Field
                label="문항 제목"
                value={letter.title}
                onChange={(v) =>
                  update((w) => {
                    w.letters[index].title = v;
                    w.letters[index].checked = false;
                  })
                }
              />
              <label className="limit-field">
                세는 방법
                <select
                  aria-label="글자 수 세는 방법"
                  value={letter.countMode}
                  onChange={(e) =>
                    update((w) => {
                      w.letters[index].countMode = e.target.value as CountMode;
                      w.letters[index].checked = false;
                    })
                  }
                >
                  {(Object.keys(countModeLabels) as CountMode[]).map((m) => (
                    <option key={m} value={m}>
                      {countModeLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="limit-field">
                글자 수 제한
                <input
                  aria-label="글자 수 제한"
                  type="number"
                  min="1"
                  max="20000"
                  value={letter.limit}
                  onChange={(e) =>
                    update((w) => {
                      w.letters[index].limit = Math.max(
                        1,
                        Math.min(20000, Number(e.target.value) || 1),
                      );
                      w.letters[index].checked = false;
                    })
                  }
                />
              </label>
              {work.letters.length > 1 && (
                <button
                  className="icon-button danger"
                  aria-label="현재 문항 삭제"
                  onClick={() => {
                    update((w) => {
                      w.letters.splice(index, 1);
                    });
                    changeTab(Math.max(0, index - 1));
                  }}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
            <label className="sr-only" htmlFor="letter-body">
              자기소개서 본문
            </label>
            <textarea
              id="letter-body"
              maxLength={100000}
              ref={editor}
              className="letter-editor"
              placeholder="어떤 경험에서 시작하면 좋을까요? 나의 생각과 행동을 편안하게 적어 보세요."
              value={letter.body}
              onSelect={(e) =>
                setSelection({
                  start: e.currentTarget.selectionStart,
                  end: e.currentTarget.selectionEnd,
                })
              }
              onChange={(e) =>
                update((w) => {
                  w.letters[index].body = e.target.value;
                  w.letters[index].checked = false;
                })
              }
            />
            <div className="editor-foot">
              <span>
                {countModeLabels[letter.countMode]}
                {letter.countMode === 'bytes' ? ' (한글 2·영문 1)' : ''} · 공백 포함{' '}
                {countText(letter.body).toLocaleString()}자 / 공백 제외{' '}
                {countText(letter.body, 'noSpace').toLocaleString()}자
              </span>
              <strong className={count > letter.limit ? 'danger' : ''}>
                {count.toLocaleString()} / {letter.limit.toLocaleString()}
                {unit}
              </strong>
            </div>
            <CheckField
              checked={letter.checked}
              disabled={!letter.body.trim() || count > letter.limit || !letter.title.trim()}
              onChange={(v) =>
                update((w) => {
                  w.letters[index].checked = v;
                })
              }
            >
              문항 요구사항과 사실, 글자 수를 확인했어요.
            </CheckField>
            <div className="page-actions">
              <Link to="/experience" className="text-button">
                <ArrowLeft size={16} />내 경험
              </Link>
              <NextButton onClick={() => nav('/review')}>최종 점검하기</NextButton>
            </div>
          </div>
        </section>
        <SidePanel title="담이에게 요청하기">
          <Field
            label="어떤 도움을 원하시나요?"
            multiline
            rows={4}
            value={instruction}
            onChange={setInstruction}
            placeholder="예: 이 문장을 더 간결하게 정리하고 싶어요."
          />
          <p className="fine-print">
            수정 대상:{' '}
            {selection.end > selection.start
              ? `선택한 문장 (${countText(target, letter.countMode)}${unit})`
              : '현재 문항 전체'}
            <br />
            외부 AI 연결 시 대상 문장과 수정 요청이 전송됩니다.
          </p>
          <button className="button full" onClick={propose} disabled={status === '요청 중'}>
            {status === '요청 중' ? '요청 중…' : '수정 제안 받기'}
          </button>
          {status === '요청 중' && (
            <button className="text-button" onClick={() => abort.current?.abort()}>
              요청 취소
            </button>
          )}
          {status && <Notice error={status.includes('연결')}>{status}</Notice>}
          <button
            className="text-button"
            onClick={() => {
              setManual(!manual);
              setManualText(target);
            }}
          >
            <PenLine size={15} />
            직접 수정안 비교하기
          </button>
          {manual && (
            <>
              <Field
                label="직접 작성한 수정안"
                value={manualText}
                onChange={setManualText}
                multiline
              />
              <button
                className="button secondary full"
                onClick={() => {
                  compareWith(manualText);
                  setManual(false);
                }}
              >
                원문과 비교
              </button>
            </>
          )}
          {proposal && (
            <div className="comparison">
              <h4>변경 전</h4>
              <p>{proposal.before}</p>
              <h4>변경 후</h4>
              <p>{proposal.after}</p>
              <div className="button-row">
                <button className="button small" onClick={apply}>
                  적용
                </button>
                <button className="button secondary small" onClick={propose}>
                  다시 제안
                </button>
                <button className="text-button" onClick={() => setProposal(null)}>
                  취소
                </button>
              </div>
            </div>
          )}
          <div className="side-divider" />
          <button
            className="button secondary full"
            onClick={() =>
              setStatus(
                !letter.body.trim()
                  ? '아직 본문이 비어 있어요.'
                  : count > letter.limit
                    ? `제한보다 ${count - letter.limit}${unit} 많아요. 문장을 다듬어 주세요.`
                    : '글자 수 제한 안에 있어요. 경험·역할·성과가 모두 실제 사실인지 직접 확인해 주세요.',
              )
            }
          >
            자기소개서 점검
          </button>
          <button
            className="text-button"
            disabled={!undo || undo.id !== letter.id}
            onClick={() => {
              if (undo)
                update((w) => {
                  const l = w.letters.find((l) => l.id === undo.id)!;
                  l.body = undo.body;
                  l.checked = false;
                });
              setUndo(null);
            }}
          >
            이전 내용으로 되돌리기
          </button>
          <div className="soft-card">
            <b>당신의 이야기가 가장 중요해요.</b>
            <p>제안은 적용을 누르기 전까지 본문을 바꾸지 않아요.</p>
          </div>
        </SidePanel>
      </div>
      <SaveBar />
    </>
  );
}
