import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useWork } from '../store';
import { sharedContext, uid } from '../model';
import { useHasAiKey, requestRevision } from '../services';
import { PageTitle, Field, SidePanel, Notice, SaveBar, ExportButtons, Modal } from '../components';

export function Interview() {
  const aiReady = useHasAiKey();
  const { work, update } = useWork();
  const index = Math.min(work.interviewIndex, work.interview.length - 1);
  const [records, setRecords] = useState(false);
  const [hint, setHint] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    id: string;
    before: string;
    after: string;
  } | null>(null);
  const [aiStatus, setAiStatus] = useState('');
  const aiAbort = useRef<AbortController | null>(null);
  useEffect(() => () => aiAbort.current?.abort(), []);
  const q = work.interview[index];
  const nav = useNavigate();
  const { experiences: sharedExperiences, application: applicationContext } = sharedContext(work);
  const resumeFacts = work.resume.sections
    .filter((section) => section.enabled)
    .flatMap((section) =>
      section.rows
        .filter((row) => row.title.trim() || row.detail.trim())
        .map((row) => ({ section: section.name, ...row })),
    );
  const allAnswered = work.interview.every((item) => item.done && item.answer.trim());
  const addQuestions = async () => {
    if (aiStatus === '요청 중') return;
    const subjects = [
      ...work.experiences.filter((item) => item.title.trim()).map((item) => item.title.trim()),
      ...work.resume.sections
        .flatMap((section) => section.rows.map((row) => row.title.trim()))
        .filter(Boolean),
      work.application.role.trim(),
    ].filter(Boolean);
    const templates = [
      (subject: string) =>
        subject
          ? `“${subject}”에서 직접 맡은 역할을 조금 더 자세히 설명해 주시겠어요?`
          : '본인이 직접 맡았던 역할을 보여주는 경험을 하나 더 이야기해 주시겠어요?',
      (subject: string) =>
        subject
          ? `“${subject}”을 진행할 때 어려웠던 점과 본인의 판단은 무엇이었나요?`
          : '어려운 상황에서 스스로 내린 판단을 사례로 설명해 주시겠어요?',
      (subject: string) =>
        subject
          ? `“${subject}”에서 결과를 어떻게 확인했는지 이야기해 주시겠어요?`
          : '직접 한 일의 결과를 어떻게 확인했는지 이야기해 주시겠어요?',
    ];
    const existing = new Set(work.interview.map((item) => item.question));
    const batch = Math.floor(
      work.interview.filter((item) => item.kind === 'additional').length / 3,
    );
    let additions = templates.map((template, i) => {
      const subject = subjects[(batch * 3 + i) % subjects.length] || '';
      const question = template(subject);
      return existing.has(question)
        ? `${batch + 1}번째 추가 연습: 다른 사례를 떠올려 ${question}`
        : question;
    });
    if (aiReady) {
      const control = new AbortController();
      aiAbort.current = control;
      setAiStatus('요청 중');
      try {
        const proposal = await requestRevision(
          {
            text: subjects.join('\n') || '제공된 경험 제목 없음',
            instruction:
              '제공된 제목만 참고해 사실을 가정하지 않는 면접 질문 세 개를 각 줄에 하나씩 제안해 주세요.',
            task: 'interview-questions',
          },
          control.signal,
        );
        const aiQuestions = proposal
          .split('\n')
          .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 3);
        if (!aiQuestions.length) throw new Error('AI 추가 질문을 읽지 못했어요.');
        additions = aiQuestions;
        setAiStatus('AI 추가 질문을 확인해 주세요.');
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          setAiStatus('요청을 취소했어요.');
          return;
        }
        // AI가 실패해도 연습은 이어갈 수 있게 기본 연습 질문을 넣습니다.
        setAiStatus(`${(error as Error).message} 대신 기본 연습 질문을 추가했어요.`);
      }
    }
    update((draft) => {
      const first = draft.interview.length;
      for (const question of additions.slice(0, Math.max(0, 50 - first)))
        draft.interview.push({ id: uid(), question, answer: '', done: false, kind: 'additional' });
      draft.interviewIndex = first;
      draft.interviewStage = 'questions';
    }, false);
    setSuggestion(null);
  };
  const requestInterviewRevision = async (item: typeof q) => {
    if (!item.answer.trim() || aiStatus === '요청 중') return;
    const control = new AbortController();
    aiAbort.current = control;
    setAiStatus('요청 중');
    try {
      const after = await requestRevision(
        {
          text: item.answer,
          instruction: '실제 사실을 추가하지 않고 답변 표현을 다듬어 주세요.',
          task: 'interview-answer',
        },
        control.signal,
      );
      if (!control.signal.aborted) {
        setSuggestion({ id: item.id, before: item.answer, after });
        setAiStatus('제안을 확인해 주세요.');
      }
    } catch (error) {
      setAiStatus(
        (error as Error).name === 'AbortError' ? '요청을 취소했어요.' : (error as Error).message,
      );
    }
  };
  return (
    <>
      <PageTitle
        step="INTERVIEW"
        title="내 이야기를 말하는 연습."
        description="잘 외운 답보다, 내가 직접 겪은 경험을 자연스럽게 전해요."
        action={
          <button className="button secondary" onClick={() => setRecords(true)}>
            연습 기록 확인
          </button>
        }
      />
      {work.interviewStage !== 'questions' ? (
        <section className="panel interview-summary">
          <div className="panel-body">
            <span className="pill">
              {work.interviewStage === 'complete' ? '면접 연습 완료' : '질문·답변 전체 보기'}
            </span>
            <h2>
              {work.interviewStage === 'complete'
                ? '나의 면접 연습 기록'
                : '작성한 답변을 함께 살펴봐요.'}
            </h2>
            <p>기본 질문과 추가 질문을 모두 확인하고, 필요하면 답변을 다시 다듬어 주세요.</p>
            {work.interview.map((item, i) => (
              <article className="record interview-summary-record" key={item.id}>
                <span className="eyebrow">
                  {item.kind === 'additional' ? '추가 질문 · 로컬 데모' : '기본 질문'} {i + 1}
                </span>
                <h3>{item.question}</h3>
                <p>{item.answer || '아직 작성하지 않았어요.'}</p>
                <div className="button-row">
                  <button
                    className="button secondary small"
                    onClick={() =>
                      update((draft) => {
                        draft.interviewIndex = i;
                        draft.interviewStage = 'questions';
                      }, false)
                    }
                  >
                    답변 다시 보기·수정
                  </button>
                  <button
                    className="button secondary small"
                    disabled={!item.answer.trim() || aiStatus === '요청 중'}
                    onClick={() => requestInterviewRevision(item)}
                  >
                    AI 보완 요청
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setSuggestion({ id: item.id, before: item.answer, after: item.answer })
                    }
                  >
                    직접 수정안 비교
                  </button>
                </div>
                {suggestion?.id === item.id && (
                  <div className="comparison">
                    <h4>원래 답변</h4>
                    <p>{suggestion.before}</p>
                    <Field
                      label="수정 제안"
                      multiline
                      value={suggestion.after}
                      onChange={(value) => setSuggestion({ ...suggestion, after: value })}
                    />
                    <div className="button-row">
                      <button
                        className="button small"
                        onClick={() => {
                          if (item.answer !== suggestion.before) {
                            setAiStatus('원래 답변이 바뀌었어요. 다시 비교해 주세요.');
                            setSuggestion(null);
                            return;
                          }
                          update((draft) => {
                            const target = draft.interview.find((entry) => entry.id === item.id)!;
                            target.answer = suggestion.after;
                            target.done = !!suggestion.after.trim();
                            if (!target.done) draft.interviewStage = 'summary';
                          }, false);
                          setSuggestion(null);
                          setAiStatus('수정안을 적용했어요.');
                        }}
                      >
                        적용
                      </button>
                      <button className="text-button" onClick={() => setSuggestion(null)}>
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
            {aiStatus === '요청 중' && (
              <button className="text-button" onClick={() => aiAbort.current?.abort()}>
                AI 요청 취소
              </button>
            )}
            {aiStatus && <Notice error={aiStatus.includes('연결')}>{aiStatus}</Notice>}
            <Notice>
              {aiReady
                ? 'AI 요청에는 입력한 지원 정보와 경험 제목만 전송됩니다. 제안된 질문의 사실 관계를 확인해 주세요.'
                : 'AI 키를 넣지 않으면 추가 질문은 이 브라우저에서 만든 연습용 질문입니다. 입력한 지원 정보와 경험 제목만 참고하며, 없는 사실은 제시하지 않습니다.'}
            </Notice>
            <div className="page-actions">
              {work.interviewStage !== 'complete' && (
                <button
                  className="button secondary"
                  disabled={!allAnswered || work.interview.length >= 50 || aiStatus === '요청 중'}
                  onClick={addQuestions}
                >
                  추가 질문 받기
                </button>
              )}
              {work.interviewStage !== 'complete' ? (
                <button
                  className="button"
                  disabled={!allAnswered}
                  onClick={() =>
                    update((draft) => {
                      draft.interviewStage = 'complete';
                    }, false)
                  }
                >
                  면접 연습 완료
                </button>
              ) : (
                <button
                  className="button secondary"
                  onClick={() =>
                    update((draft) => {
                      draft.interviewStage = 'summary';
                    }, false)
                  }
                >
                  다시 검토하기
                </button>
              )}
            </div>
            <ExportButtons />
          </div>
        </section>
      ) : (
        <div className="workspace editor-layout">
          <section className="panel interview-panel">
            <div className="panel-body">
              <span className="pill">
                질문 {index + 1} / {work.interview.length}
              </span>
              <h2 className="interview-question">{q.question}</h2>
              <p>구체적인 상황과 내가 한 행동, 그 결과를 중심으로 이야기해 주세요.</p>
              <Field
                label="내 답변"
                multiline
                rows={12}
                value={q.answer}
                onChange={(v) =>
                  update((w) => {
                    w.interview[index].answer = v;
                    w.interview[index].done = false;
                    w.interviewStage = 'questions';
                  })
                }
                placeholder="나의 경험을 떠올리며 편안하게 적어 보세요."
              />
              <div className="editor-foot">
                <span>{Array.from(q.answer).length.toLocaleString()}자</span>
                <span>{q.done ? '✓ 답변 완료' : '답변 작성 중'}</span>
              </div>
              <div className="page-actions">
                <button
                  className="button secondary"
                  disabled={index === 0}
                  onClick={() => {
                    update((w) => {
                      w.interviewIndex = index - 1;
                    }, false);
                    setHint(false);
                  }}
                >
                  <ArrowLeft size={16} />
                  이전 질문
                </button>
                <button
                  className="button"
                  disabled={!q.answer.trim()}
                  onClick={() => {
                    update((w) => {
                      w.interview[index].done = true;
                      if (index < work.interview.length - 1) w.interviewIndex = index + 1;
                      else if (w.interview.every((item) => item.done && item.answer.trim()))
                        w.interviewStage = 'summary';
                    }, false);
                    setHint(false);
                  }}
                >
                  답변 완료{index < work.interview.length - 1 && ' · 다음 질문'}
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="question-dots">
                {work.interview.map((x, i) => (
                  <button
                    aria-label={`질문 ${i + 1}${x.done ? ' 완료' : ''}`}
                    className={`${i === index ? 'current' : ''} ${x.done ? 'done' : ''}`}
                    key={x.id}
                    onClick={() =>
                      update((w) => {
                        w.interviewIndex = i;
                      }, false)
                    }
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <SidePanel title="담이와 함께 연습해요" state="read">
            <h4>답변에서 확인된 내용</h4>
            <p>
              {q.answer.trim()
                ? `현재 ${Array.from(q.answer).length}자를 작성했어요. 답변에 쓴 내용의 사실 여부는 직접 확인해 주세요.`
                : '답변을 작성하면 이곳에서 작성 상태를 확인할 수 있어요.'}
            </p>
            <h4>더 이야기해볼 부분</h4>
            <ul className="guide-list">
              <li>그 상황에서 내 역할은 무엇이었나요?</li>
              <li>어떤 판단으로 행동했나요?</li>
              <li>결과는 어떻게 확인했나요?</li>
            </ul>
            <button className="button full" onClick={() => setHint(!hint)}>
              답변 보완하기
            </button>
            {hint && (
              <Notice>
                답변에서 내가 직접 한 행동 한 가지를 골라, 왜 그렇게 했는지 덧붙여 보세요.
              </Notice>
            )}
            <div className="soft-card">
              <b>참고할 내 이야기</b>
              <p>{applicationContext || '지원 정보가 아직 없어요.'}</p>
              {sharedExperiences.slice(0, 3).map((e) => (
                <details key={e.id}>
                  <summary>{e.title}</summary>
                  <p>
                    {e.action}
                    <br />
                    {e.result}
                  </p>
                </details>
              ))}
              {resumeFacts.length > 0 && (
                <>
                  <p className="fine-print">이력서에서 정리한 사실</p>
                  {resumeFacts.slice(0, 3).map((fact) => (
                    <details key={fact.id}>
                      <summary>{fact.title || fact.section}</summary>
                      <p>{fact.detail}</p>
                    </details>
                  ))}
                </>
              )}
              {work.letters
                .filter((l) => l.body.trim())
                .map((l) => (
                  <button
                    className="text-button"
                    key={l.id}
                    onClick={() => {
                      update((w) => {
                        w.kind = 'cover-letter';
                      }, false);
                      nav(`/cover-letter?question=${l.id}`);
                    }}
                  >
                    {l.title} 문장 보기
                    <ArrowRight size={14} />
                  </button>
                ))}
            </div>
          </SidePanel>
        </div>
      )}
      <SaveBar />
      {records && (
        <Modal title="나의 면접 연습 기록" onClose={() => setRecords(false)}>
          <p>
            {work.interview.filter((x) => x.done).length} / {work.interview.length}개 답변 완료
          </p>
          {work.interview.map((x, i) => (
            <div className="record" key={x.id}>
              <button
                className="text-button"
                onClick={() => {
                  update((w) => {
                    w.interviewIndex = i;
                    w.interviewStage = 'questions';
                  }, false);
                  setRecords(false);
                }}
              >
                {i + 1}. {x.question} {x.done ? '✓' : ''}
              </button>
              <p>{x.answer || '아직 작성하지 않았어요.'}</p>
            </div>
          ))}
          <ExportButtons />
        </Modal>
      )}
    </>
  );
}
