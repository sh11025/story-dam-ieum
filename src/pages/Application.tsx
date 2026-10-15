import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload } from 'lucide-react';
import { useWork } from '../store';
import {
  documentReadNotice,
  fetchJobPosting,
  fetchJobPostingWithAi,
  useHasAiKey,
  readDocument,
} from '../services';
import { dDayLabel, daysUntil } from '../model';
import {
  extractDeadline,
  extractJobFields,
  type JobFieldKey,
  type JobFields,
} from '../../shared/jobPosting';
import {
  PageTitle,
  Field,
  CheckField,
  SidePanel,
  Notice,
  SaveBar,
  NextButton,
  Tabs,
} from '../components';

export function Application() {
  const aiReady = useHasAiKey();
  const { work, update } = useWork();
  const a = work.application;
  const nav = useNavigate();
  const [tab, setTab] = useState('공고 붙여넣기');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyNote, setBusyNote] = useState('');
  const [urlFailed, setUrlFailed] = useState(false);
  const edit = (key: keyof typeof a, value: string) =>
    update((w) => {
      Object.assign(w.application, { [key]: value, confirmed: false });
    });
  const valid = [a.company, a.role, a.duties, a.requirements].every((x) => !!x.trim());
  /** 공고 글에서 회사명·직무 등 명시된 항목을 찾아 아래 칸에 채웁니다. */
  const applyFields = (source: string, extra: Partial<JobFields> = {}, deadline = '') => {
    const fields = { ...extractJobFields(source), ...extra };
    const keys = (Object.keys(fields) as JobFieldKey[]).filter((k) => fields[k]?.trim());
    const foundDeadline = deadline || extractDeadline(source);
    update((w) => {
      for (const key of keys) w.application[key] = fields[key]!.trim();
      if (foundDeadline && !w.application.deadline) w.application.deadline = foundDeadline;
      w.application.confirmed = false;
    });
    return keys.length + (foundDeadline && !a.deadline ? 1 : 0);
  };
  /** 오래 걸리는 요청: 5초가 넘으면 서버를 깨우는 중일 수 있다고 알려 줍니다. */
  const withWaitingNote = async <T,>(run: () => Promise<T>, note: string) => {
    setBusy(true);
    setBusyNote('');
    const timer = window.setTimeout(() => setBusyNote(note), 5000);
    try {
      return await run();
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
      setBusyNote('');
    }
  };
  const extract = () => {
    if (!a.source.trim()) {
      setMessage('공고 내용을 먼저 입력해 주세요.');
      return;
    }
    const count = applyFields(a.source);
    setMessage(
      count
        ? `공고에 명시된 ${count}개 항목을 가져왔어요. 아래 내용을 직접 확인해 주세요. (AI 분석 아님)`
        : '자동으로 구분할 수 있는 항목이 없어요. 원문을 참고해 아래 항목을 직접 정리해 주세요. 외부 AI는 연결되지 않았습니다.',
    );
  };
  const importUrl = async () => {
    if (!a.url.trim()) {
      setMessage('채용공고 주소를 먼저 입력해 주세요.');
      return;
    }
    setMessage('');
    setUrlFailed(false);
    try {
      const result = await withWaitingNote(
        () => fetchJobPosting(a.url.trim()),
        '서버를 깨우고 있어요. 한동안 아무도 쓰지 않았다면 처음 한 번은 1분 정도 걸릴 수 있어요.',
      );
      update((w) => {
        w.application.source = result.text;
        w.application.url = result.url;
        w.application.confirmed = false;
      });
      const count = applyFields(result.text, result.fields, result.deadline);
      setTab('공고 붙여넣기');
      setMessage(
        [
          result.warning,
          count
            ? `공고 페이지에서 ${count}개 항목을 찾았어요. 사이트마다 정확도가 다르니 아래 내용을 꼭 확인해 주세요.`
            : '공고 글은 가져왔지만 항목을 자동으로 나누지 못했어요. 원문을 보고 아래 항목을 직접 정리해 주세요.',
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (e) {
      setMessage((e as Error).message);
      setUrlFailed(true);
    }
  };
  /** 우리 서버가 못 가져왔을 때: 사용자의 AI 키로 AI가 직접 페이지를 읽게 합니다. */
  const importUrlWithAi = async () => {
    setMessage('');
    try {
      const result = await withWaitingNote(
        () => fetchJobPostingWithAi(a.url.trim()),
        'AI가 공고 페이지를 읽고 있어요. 30초 정도 걸릴 수 있어요.',
      );
      update((w) => {
        w.application.source = result.text;
        w.application.confirmed = false;
      });
      const count = applyFields(result.text, result.fields, result.deadline);
      setUrlFailed(false);
      setTab('공고 붙여넣기');
      setMessage(
        `AI가 공고에서 ${count}개 항목을 정리했어요. AI는 가끔 틀리거나 없는 말을 덧붙일 수 있으니, 원래 공고와 꼭 비교해 주세요.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const days = daysUntil(a.deadline);
  return (
    <>
      <PageTitle
        step="01 · APPLICATION"
        title="어떤 기회를 준비하고 있나요?"
        description="지원할 곳을 이해하는 것부터, 이야기의 첫 장을 열어요."
      />
      <div className="workspace two-column">
        <section className="panel">
          <Tabs
            items={['공고 붙여넣기', '채용공고 URL', '파일 업로드']}
            active={tab}
            onSelect={setTab}
          />
          <div className="panel-body">
            {tab === '공고 붙여넣기' ? (
              <>
                <Field
                  label="채용공고 원문"
                  multiline
                  rows={5}
                  value={a.source}
                  onChange={(v) => edit('source', v)}
                  placeholder={
                    '회사명: 지원할 회사\n직무: 서비스 기획\n주요 업무: 공고에 나온 내용을 붙여넣어 주세요.'
                  }
                />
                <button className="button secondary" onClick={extract}>
                  명시된 항목 가져오기
                </button>
              </>
            ) : tab === '채용공고 URL' ? (
              <>
                <Field
                  label="채용공고 URL"
                  value={a.url}
                  onChange={(v) => edit('url', v)}
                  type="url"
                  placeholder="https://"
                />
                <p className="fine-print">
                  사람인·잡코리아·원티드 등 공고 페이지 주소를 넣으면 글을 가져와요. 일부 사이트는
                  가져오기를 막고 있어 안 될 수 있어요. 그럴 땐 내용을 복사해 붙여넣어 주세요.
                </p>
                <div className="button-row">
                  <button className="button secondary" onClick={importUrl} disabled={busy}>
                    {busy ? '공고를 가져오고 있어요…' : '공고 가져오기'}
                  </button>
                  {urlFailed && (
                    <button
                      className="button secondary"
                      onClick={importUrlWithAi}
                      disabled={busy || !aiReady}
                      title={aiReady ? undefined : '오른쪽 위 설정에서 AI 키를 먼저 넣어 주세요.'}
                    >
                      AI로 다시 시도
                    </button>
                  )}
                </div>
                {urlFailed && !aiReady && (
                  <p className="fine-print">
                    오른쪽 위 설정(톱니바퀴)에서 AI 키를 넣으면, AI가 공고 페이지를 대신 읽어 볼 수
                    있어요.
                  </p>
                )}
                {busyNote && (
                  <p role="status" className="fine-print">
                    {busyNote}
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="upload-zone">
                  <Upload />
                  <strong>{busy ? '파일을 읽고 있어요…' : '채용공고 파일 선택'}</strong>
                  <span>TXT · DOCX · PDF / 최대 8MB</span>
                  <input
                    type="file"
                    accept=".txt,.docx,.pdf"
                    disabled={busy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setBusy(true);
                      try {
                        const result = await readDocument(f);
                        edit('source', result.text);
                        setTab('공고 붙여넣기');
                        setMessage(
                          documentReadNotice(result) ||
                            '파일에서 텍스트를 읽었어요. 내용을 확인한 후 항목을 정리해 주세요.',
                        );
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
              </>
            )}
            {message && <Notice>{message}</Notice>}
            <div className="section-heading">
              <h2>지원 정보</h2>
              <span>가져온 내용도 자유롭게 수정할 수 있어요.</span>
            </div>
            <div className="form-grid">
              <Field
                label="회사명"
                value={a.company}
                onChange={(v) => edit('company', v)}
                required
              />
              <Field label="지원 직무" value={a.role} onChange={(v) => edit('role', v)} required />
            </div>
            <div className="deadline-row">
              <Field
                label="마감일 (선택)"
                type="date"
                value={a.deadline}
                onChange={(v) => edit('deadline', v)}
              />
              {days !== null && (
                <span className={`d-day ${days <= 3 ? 'urgent' : ''}`}>
                  {days < 0 ? '마감이 지났어요' : `마감 ${dDayLabel(days)}`}
                </span>
              )}
            </div>
            <Field
              label="주요 업무"
              multiline
              rows={2}
              value={a.duties}
              onChange={(v) => edit('duties', v)}
              required
            />
            <div className="form-grid">
              <Field
                label="자격요건"
                multiline
                rows={3}
                value={a.requirements}
                onChange={(v) => edit('requirements', v)}
                required
              />
              <Field
                label="우대사항 (선택)"
                multiline
                rows={3}
                value={a.preferred}
                onChange={(v) => edit('preferred', v)}
              />
            </div>
            <CheckField
              checked={a.confirmed}
              disabled={!valid}
              onChange={(v) =>
                update((w) => {
                  w.application.confirmed = v;
                })
              }
            >
              필수 지원 정보를 원문과 비교해 확인했어요.
            </CheckField>
            <div className="page-actions">
              <Link to="/home" className="text-button">
                <ArrowLeft size={16} />
                홈으로
              </Link>
              <NextButton disabled={!a.confirmed} onClick={() => nav('/experience')}>
                내 경험 정리하기
              </NextButton>
            </div>
          </div>
        </section>
        <SidePanel title="시작을 함께할게요" state="wave">
          <h4>공고에서 찾아볼 내용</h4>
          <ul className="guide-list">
            <li>어떤 문제를 해결하는 직무인가요?</li>
            <li>어떤 경험과 역량을 기대하나요?</li>
            <li>내 경험과 만나는 지점은 어디인가요?</li>
          </ul>
          <div className="soft-card">
            <b>담이의 작은 팁</b>
            <p>처음부터 완벽하지 않아도 괜찮아요. 원문에 있는 사실부터 하나씩 정리해 보세요.</p>
          </div>
          <p className="fine-print">
            붙여넣기·파일은 이 브라우저에서만 처리돼요. 주소로 가져올 때만 서버가 공고 페이지를 대신
            받아오고, 받아온 내용은 저장하지 않아요.
          </p>
        </SidePanel>
      </div>
      <SaveBar />
    </>
  );
}
