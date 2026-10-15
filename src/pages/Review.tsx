import { StoryLandscape, StoryBridge } from '../components/illustration/StoryWorld';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, PenLine } from 'lucide-react';
import { useWork } from '../store';
import { countUnit, letterLength } from '../model';
import {
  Dami,
  PageTitle,
  CheckField,
  SidePanel,
  Notice,
  SaveBar,
  ExportButtons,
  Modal,
} from '../components';

export function Review() {
  const { work, update, clear } = useWork();
  const [finish, setFinish] = useState(false);
  const nav = useNavigate();
  const checks = [
    '문항의 요구사항에 맞게 답변했어요.',
    '경험과 역할, 성과가 모두 실제 사실이에요.',
    '지원 직무와 경험의 연결을 확인했어요.',
    '모든 문항의 글자 수를 확인했어요.',
  ];
  const limits = work.letters.every((l) => l.body.trim() && letterLength(l) <= l.limit);
  return (
    <>
      <PageTitle
        step="04 · FINAL CHECK"
        title="다음으로 나아갈 준비, 마지막 한 번."
        description="담이와 함께 이야기를 살펴보고, 완성된 파일을 저장하세요."
      />
      <div className="workspace two-column">
        <section className="panel">
          <div className="panel-body">
            <h2>최종 점검 미리보기</h2>
            {work.letters.map((l, i) => (
              <article className="review-letter" key={l.id}>
                <div className="section-heading">
                  <h3>
                    {i + 1}. {l.title}
                  </h3>
                  <button
                    className="text-button"
                    onClick={() => nav(`/cover-letter?question=${l.id}`)}
                  >
                    수정하기
                    <PenLine size={14} />
                  </button>
                </div>
                <p>{l.body || '아직 작성한 내용이 없어요.'}</p>
                <small className={letterLength(l) > l.limit ? 'danger' : ''}>
                  {letterLength(l)} / {l.limit}
                  {countUnit(l.countMode)} · {l.checked ? '확인 완료' : '확인 필요'}
                </small>
              </article>
            ))}
            <div className="completion-banner">
              <div className="completion-world" aria-hidden="true">
                <StoryLandscape compact />
                <StoryBridge />
              </div>
              <Dami state={work.review.every(Boolean) ? 'happy' : 'read'} />
              <div>
                <h3>당신의 다음을 응원합니다.</h3>
                <p>이야기는 저장하고, 가능성은 이어가세요.</p>
              </div>
            </div>
          </div>
        </section>
        <SidePanel title="마지막으로 확인해요" state="happy">
          <h4>최종 점검 항목</h4>
          {checks.map((c, i) => (
            <div className="review-check" key={c}>
              <CheckField
                checked={work.review[i]}
                disabled={i === 3 && !limits}
                onChange={(v) =>
                  update((w) => {
                    w.review[i] = v;
                  }, false)
                }
              >
                {c}
              </CheckField>
              <button
                className="text-button small"
                onClick={() =>
                  nav(
                    i === 1
                      ? '/experience'
                      : i === 2
                        ? '/application'
                        : `/cover-letter?question=${work.letters[0].id}`,
                  )
                }
              >
                관련 내용 확인
                <ArrowRight size={12} />
              </button>
            </div>
          ))}
          {!limits && (
            <p className="danger fine-print">
              비어 있거나 글자 수를 초과한 문항을 먼저 확인해 주세요.
            </p>
          )}
          <div className="side-divider" />
          <h4>나의 이야기 저장하기</h4>
          <ExportButtons />
          <p className="fine-print">
            DOCX/PDF는 제출용 문서, .sdi는 이어서 작성할 작업 파일입니다.
          </p>
          <button className="button secondary full" onClick={() => nav('/cover-letter')}>
            계속 수정하기
          </button>
          <button className="text-button danger" onClick={() => setFinish(true)}>
            이번 작업 종료 및 임시 내용 삭제
          </button>
        </SidePanel>
      </div>
      <SaveBar />
      {finish && (
        <Modal title="현재 작업을 종료할까요?" onClose={() => setFinish(false)}>
          <Notice>
            지금 열려 있는 지원서가 이 브라우저에서 지워집니다. 다른 지원서는 그대로 남아요. 이어서
            작업하려면 먼저 .sdi 파일을 저장해 주세요.
          </Notice>
          <ExportButtons />
          <div className="page-actions">
            <button className="button secondary" onClick={() => setFinish(false)}>
              계속 작성
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                clear();
                nav('/home');
              }}
            >
              임시 내용 삭제하고 종료
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
