import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useWork } from '../store';
import { uid } from '../model';
import { documentReadNotice, readDocument } from '../services';
import { AiAssist } from '../components/AiAssist';
import {
  PageTitle,
  Field,
  CheckField,
  SidePanel,
  Notice,
  SaveBar,
  NextButton,
} from '../components';

export function Experience() {
  const { work, update } = useWork();
  const nav = useNavigate();
  const [index, setIndex] = useState(0);
  const [source, setSource] = useState('직접 이야기하기');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const e = work.experiences[index];
  const labels = {
    title: '경험 제목',
    situation: '어떤 상황이었나요?',
    role: '내 역할은 무엇이었나요?',
    action: '직접 어떤 행동을 했나요?',
    result: '어떤 결과가 있었나요?',
  };
  const missing = e
    ? Object.entries(labels).find(([k]) => !String(e[k as keyof typeof e]).trim())
    : null;
  return (
    <>
      <PageTitle
        step="02 · EXPERIENCE"
        title="당신의 경험에는 이야기가 있어요."
        description="크고 작은 경험 속에서, 내가 한 일을 차근차근 찾아보세요."
        action={
          <button
            className="button secondary"
            disabled={work.experiences.length >= 100}
            onClick={() => {
              update((w) => {
                w.experiences.push({
                  id: uid(),
                  title: '',
                  situation: '',
                  role: '',
                  action: '',
                  result: '',
                  selected: true,
                });
              });
              setIndex(work.experiences.length);
            }}
          >
            <Plus size={17} />
            경험 추가
          </button>
        }
      />
      <div className="workspace two-column">
        <section className="panel">
          <div className="tabs">
            {['직접 이야기하기', '이력서에서 가져오기', '자기소개서에서 가져오기'].map((t) => (
              <button
                key={t}
                className={source === t ? 'active' : ''}
                onClick={() => {
                  setSource(t);
                  setImportText(
                    t === '이력서에서 가져오기'
                      ? work.resume.sections.flatMap((s) => s.rows.map((r) => r.detail)).join('\n')
                      : t === '자기소개서에서 가져오기'
                        ? work.letters.map((l) => l.body).join('\n')
                        : '',
                  );
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {source !== '직접 이야기하기' && (
              <div className="soft-card">
                <Field label="참고할 원문" multiline value={importText} onChange={setImportText} />
                <label className="button secondary small">
                  파일에서 원문 가져오기
                  <input
                    className="sr-only"
                    type="file"
                    accept=".txt,.docx,.pdf"
                    onChange={async (ev) => {
                      const f = ev.target.files?.[0];
                      if (f)
                        try {
                          const result = await readDocument(f);
                          setImportText(result.text);
                          setMessage(documentReadNotice(result));
                        } catch (err) {
                          setMessage((err as Error).message);
                        }
                    }}
                  />
                </label>
                <p className="fine-print">
                  원문을 참고해 아래에 실제 상황·역할·행동·결과를 나누어 적어 주세요. AI가 경험을
                  생성하지 않습니다.
                </p>
              </div>
            )}
            <div className="tabs experience-tabs">
              {work.experiences.map((x, i) => (
                <button
                  className={i === index ? 'active' : ''}
                  key={x.id}
                  onClick={() => setIndex(i)}
                >
                  {x.title || `경험 ${i + 1}`}
                </button>
              ))}
            </div>
            {e ? (
              <>
                <div className="section-heading">
                  <CheckField
                    checked={e.selected}
                    onChange={(v) =>
                      update((w) => {
                        w.experiences[index].selected = v;
                      })
                    }
                  >
                    이번 자기소개서에 사용할 경험
                  </CheckField>
                  <button
                    className="icon-button danger"
                    aria-label="이 경험 삭제"
                    onClick={() => {
                      update((w) => {
                        w.experiences.splice(index, 1);
                      });
                      setIndex(Math.max(0, index - 1));
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {Object.entries(labels).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    required={e.selected}
                    value={String(e[key as keyof typeof e])}
                    multiline={key !== 'title'}
                    rows={3}
                    onChange={(v) =>
                      update((w) => {
                        (w.experiences[index] as unknown as Record<string, unknown>)[key] = v;
                      })
                    }
                    placeholder={
                      key === 'result'
                        ? '숫자가 없어도 괜찮아요. 실제 변화와 배운 점을 적어 주세요.'
                        : ''
                    }
                  />
                ))}
                <AiAssist
                  task="experience"
                  text={[e.situation, e.role, e.action, e.result].filter(Boolean).join('\n')}
                  instruction="이 경험의 정보가 부족한 부분을 질문해 주세요. 없는 사실은 작성하지 마세요."
                />
              </>
            ) : (
              <Notice>경험이 아직 없어요. ‘경험 추가’로 이야기를 시작해 주세요.</Notice>
            )}
            {message && <Notice error>{message}</Notice>}
            <div className="page-actions">
              <Link to="/application" className="text-button">
                <ArrowLeft size={16} />
                지원 정보
              </Link>
              <NextButton onClick={() => nav('/cover-letter')}>자기소개서 작성하기</NextButton>
            </div>
          </div>
        </section>
        <SidePanel title="한 가지씩 이야기해요">
          <span className="pill">담이의 질문</span>
          <h3 className="question-small">
            {missing ? missing[1] : '이 경험은 지원 직무와 어떻게 이어지나요?'}
          </h3>
          <p>
            한 번에 하나씩 충분히 떠올려 보세요. 직접 한 일과 함께한 사람들의 일을 구분하면 더
            명확해져요.
          </p>
          <div className="soft-card">
            <b>직무와 연결하기</b>
            <p>
              {work.application.role
                ? `지원 직무는 ‘${work.application.role}’입니다. 공고의 ‘${work.application.duties || '주요 업무'}’와 관련된 행동이 있는지 확인해 보세요.`
                : '지원 정보를 입력하면 공고와 나란히 비교할 수 있어요.'}
            </p>
            <small>연결 여부는 직접 확인해 주세요. 자동으로 적합성을 판단하지 않습니다.</small>
          </div>
        </SidePanel>
      </div>
      <SaveBar />
    </>
  );
}
