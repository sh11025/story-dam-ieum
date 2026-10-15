// 자기소개서 쓰기 화면 옆의 '내 경험' 칸.
// 예전에는 '내 경험' 단계가 따로 있었지만, 쓰면서 바로 보고 고칠 수 있게 쓰기 화면으로 합쳤습니다.
// 여기서 정리한 경험은 이력서(프로젝트·활동/경력)와 자동으로 연결됩니다(model.ts syncResumeWithExperiences).
import { useState } from 'react';
import { Plus, Trash2, CornerDownLeft } from 'lucide-react';
import { useWork } from '../store';
import { experienceResumeSections, newExperience, type ExperienceResumeSection } from '../model';
import { documentReadNotice, readDocument } from '../services';
import { AiAssist } from './AiAssist';
import { Field, CheckField, Notice } from './ui';

const LABELS = {
  title: '경험 제목',
  situation: '어떤 상황이었나요?',
  role: '내 역할은 무엇이었나요?',
  action: '직접 어떤 행동을 했나요?',
  result: '어떤 결과가 있었나요?',
} as const;
const SECTION_LABELS: Record<ExperienceResumeSection, string> = {
  '프로젝트·활동': '이력서 ‘프로젝트·활동’에 넣기',
  경력: '이력서 ‘경력’에 넣기',
  none: '이력서에 넣지 않기',
};

export function ExperienceBox({ onInsert }: { onInsert: (text: string) => void }) {
  const { work, update } = useWork();
  const [index, setIndex] = useState(0);
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const e = work.experiences[Math.min(index, work.experiences.length - 1)];
  const at = work.experiences.indexOf(e);
  const missing = e
    ? (Object.keys(LABELS) as (keyof typeof LABELS)[]).find((k) => !e[k].trim())
    : undefined;
  const edit = (apply: (x: (typeof work.experiences)[number]) => void) =>
    update((w) => apply(w.experiences[at]));

  return (
    <section className="experience-box" aria-label="내 경험">
      <div className="section-heading">
        <h4>내 경험</h4>
        <button
          className="button secondary small"
          disabled={work.experiences.length >= 100}
          onClick={() => {
            update((w) => {
              w.experiences.push(newExperience());
            });
            setIndex(work.experiences.length);
          }}
        >
          <Plus size={15} />
          경험 추가
        </button>
      </div>
      <p className="fine-print">
        정리한 경험은 이력서와 자동으로 이어져요. 제목·기간을 고치면 이력서에도 바로 반영돼요.
      </p>
      {work.experiences.length > 1 && (
        <div className="tabs experience-tabs" role="tablist" aria-label="경험 목록">
          {work.experiences.map((x, i) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === e?.id}
              className={x.id === e?.id ? 'active' : ''}
              onClick={() => setIndex(i)}
            >
              {x.title || `경험 ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {e ? (
        <div className="experience-editor">
          <div className="section-heading">
            <CheckField
              checked={e.selected}
              onChange={(v) =>
                edit((x) => {
                  x.selected = v;
                })
              }
            >
              이번 자기소개서에 사용
            </CheckField>
            <button
              className="icon-button danger"
              aria-label="이 경험 삭제"
              onClick={() => {
                update((w) => {
                  w.experiences.splice(at, 1);
                });
                setIndex(Math.max(0, at - 1));
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <Field
            label={LABELS.title}
            required={e.selected}
            value={e.title}
            onChange={(v) =>
              edit((x) => {
                x.title = v;
              })
            }
          />
          <Field
            label="기간 (선택)"
            value={e.period}
            placeholder="예: 2025.03 – 2025.06"
            onChange={(v) =>
              edit((x) => {
                x.period = v;
              })
            }
          />
          {(['situation', 'role', 'action', 'result'] as const).map((key) => (
            <Field
              key={key}
              label={LABELS[key]}
              required={e.selected}
              multiline
              rows={2}
              value={e[key]}
              placeholder={
                key === 'result' ? '숫자가 없어도 괜찮아요. 실제 변화와 배운 점을 적어 주세요.' : ''
              }
              onChange={(v) =>
                edit((x) => {
                  x[key] = v;
                })
              }
            />
          ))}
          <label className="field">
            <span>이력서 연결</span>
            <select
              value={e.resumeSection}
              onChange={(ev) =>
                edit((x) => {
                  x.resumeSection = ev.target.value as ExperienceResumeSection;
                })
              }
            >
              {experienceResumeSections.map((s) => (
                <option key={s} value={s}>
                  {SECTION_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="experience-question">
            <b>담이의 질문</b>{' '}
            {missing === 'title'
              ? '이 경험을 한 줄로 부른다면 뭐라고 할까요?'
              : missing
                ? LABELS[missing]
                : '이 경험은 지원 직무와 어떻게 이어지나요?'}
          </p>
          <button
            className="button secondary full"
            disabled={![e.situation, e.role, e.action, e.result].some((v) => v.trim())}
            onClick={() =>
              onInsert(
                [e.situation, e.role, e.action, e.result]
                  .map((v) => v.trim())
                  .filter(Boolean)
                  .join(' '),
              )
            }
          >
            <CornerDownLeft size={15} />
            본문에 넣기
          </button>
          <p className="fine-print">넣은 뒤에는 내 말투로 자연스럽게 다듬어 주세요.</p>
          <AiAssist
            task="experience"
            text={[e.situation, e.role, e.action, e.result].filter(Boolean).join('\n')}
            instruction="이 경험의 정보가 부족한 부분을 질문해 주세요. 없는 사실은 작성하지 마세요."
          />
        </div>
      ) : (
        <Notice>경험이 아직 없어요. ‘경험 추가’로 이야기를 시작해 주세요.</Notice>
      )}
      <details className="experience-reference">
        <summary>다른 글을 보며 정리하기</summary>
        <div className="button-row">
          <button
            className="button secondary small"
            onClick={() =>
              setReference(
                work.resume.sections.flatMap((s) => s.rows.map((r) => r.detail)).join('\n'),
              )
            }
          >
            이력서 내용 보기
          </button>
          <label className="button secondary small">
            파일에서 가져오기
            <input
              className="sr-only"
              type="file"
              accept=".txt,.docx,.pdf"
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                if (f)
                  try {
                    const result = await readDocument(f);
                    setReference(result.text);
                    setMessage(documentReadNotice(result));
                  } catch (err) {
                    setMessage((err as Error).message);
                  }
              }}
            />
          </label>
        </div>
        <Field label="참고할 원문" multiline rows={4} value={reference} onChange={setReference} />
        <p className="fine-print">
          원문을 보며 위의 상황·역할·행동·결과를 직접 나누어 적어 주세요. AI가 경험을 만들어 내지
          않습니다.
        </p>
        {message && <Notice error>{message}</Notice>}
      </details>
    </section>
  );
}
