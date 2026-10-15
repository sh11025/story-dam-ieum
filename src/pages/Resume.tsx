import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, Trash2, Upload } from 'lucide-react';
import { useWork } from '../store';
import { sharedContext, uid, resumeModeLabels, resumeModeNames } from '../model';
import { documentReadNotice, readDocument } from '../services';
import { documentContent } from '../export';
import { AiAssist } from '../components/AiAssist';
import {
  Dami,
  PageTitle,
  Field,
  CheckField,
  SidePanel,
  Notice,
  SaveBar,
  ExportButtons,
  Modal,
  Tabs,
} from '../components';

export function Resume() {
  const { work, update, switchResumeMode } = useWork();
  const r = work.resume;
  const mode = work.resumeMode;
  const slot = work.resumeSlots[mode];
  const { experiences: sharedExperiences, application: applicationContext } = sharedContext(work);
  const [tab, setTab] = useState('기본정보');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const section = r.sections.find((s) => s.name === tab);
  const content = documentContent({ ...work, kind: 'resume' });
  const setBasic = (key: 'name' | 'email' | 'phone' | 'intro' | 'photo', value: string) =>
    update((w) => {
      w.resume[key] = value;
    });
  return (
    <>
      <PageTitle
        step="RESUME"
        title="걸어온 길을 한눈에 담아요."
        description="나에게 필요한 항목을 골라, 나다운 이력서를 완성하세요."
        action={
          <button className="button secondary" onClick={() => setPreview(true)}>
            이력서 미리보기
            <ArrowRight size={16} />
          </button>
        }
      />
      <div className="start-options">
        {resumeModeNames.map((x) => (
          <button
            key={x}
            className={mode === x ? 'active' : ''}
            onClick={() => {
              switchResumeMode(x);
              setTab('기본정보');
              setMessage('');
            }}
          >
            {resumeModeLabels[x]}
          </button>
        ))}
      </div>
      {mode !== 'new' && (
        <div className="panel reference-panel">
          <Notice>
            {mode === 'organization'
              ? '양식에서 텍스트를 가져와 항목을 직접 맞출 수 있어요. 원본의 표·순서·배치를 완벽히 보존하지 않으며, 출력은 선택한 템플릿으로 생성됩니다.'
              : '기존 파일의 원문을 참고해 아래 내용을 수정하세요. .sdi 파일은 홈의 불러오기에서 전체 복원할 수 있어요.'}
          </Notice>
          <label className="button secondary small">
            <Upload size={16} />
            참고 파일 선택
            <input
              type="file"
              className="sr-only"
              accept=".txt,.docx,.pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f)
                  try {
                    const result = await readDocument(f);
                    if (!result.text.trim())
                      throw new Error('파일에서 텍스트를 찾지 못했어요. 직접 붙여넣어 주세요.');
                    update((w) => {
                      w.resumeSlots[w.resumeMode].reference = result.text;
                      w.resumeSlots[w.resumeMode].sourceConfirmed = false;
                      w.resumeSlots[w.resumeMode].reviewed = false;
                    });
                    setMessage(documentReadNotice(result));
                  } catch (err) {
                    setMessage((err as Error).message);
                  }
              }}
            />
          </label>
          <Field
            label={mode === 'organization' ? '회사·기관 양식 원문' : '기존 이력서 원문'}
            value={slot.reference}
            onChange={(value) =>
              update((w) => {
                w.resumeSlots[w.resumeMode].reference = value;
                w.resumeSlots[w.resumeMode].sourceConfirmed = false;
                w.resumeSlots[w.resumeMode].reviewed = false;
              })
            }
            multiline
            placeholder="파일을 선택하거나 내용을 직접 붙여넣어 주세요."
          />
          <CheckField
            checked={slot.sourceConfirmed}
            disabled={!slot.reference.trim()}
            onChange={(value) =>
              update((w) => {
                w.resumeSlots[w.resumeMode].sourceConfirmed = value;
              })
            }
          >
            원문을 확인했고, 아래 항목에 필요한 내용을 직접 옮겼어요.
          </CheckField>
        </div>
      )}
      <div className="workspace two-column">
        <section className="panel">
          <Tabs
            items={['기본정보', ...r.sections.map((s) => s.name)]}
            active={tab}
            onSelect={setTab}
          />
          <div className="panel-body">
            {tab === '기본정보' ? (
              <>
                <h2>기본 정보</h2>
                <div className="resume-basic">
                  <div>
                    <div className="form-grid">
                      <Field
                        label="이름"
                        required
                        value={r.name}
                        onChange={(v) => setBasic('name', v)}
                      />
                      <Field
                        label="연락처"
                        required
                        type="tel"
                        value={r.phone}
                        onChange={(v) => setBasic('phone', v)}
                      />
                    </div>
                    <Field
                      label="이메일"
                      required
                      type="email"
                      value={r.email}
                      onChange={(v) => setBasic('email', v)}
                    />
                  </div>
                  <div className="photo-box">
                    {r.photo ? (
                      <img src={r.photo} alt="선택한 이력서 사진" />
                    ) : (
                      <Upload size={25} />
                    )}
                    <label>
                      사진 선택
                      <input
                        aria-label="사진 선택"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={async (ev) => {
                          const f = ev.target.files?.[0];
                          if (!f) return;
                          if (
                            !['image/png', 'image/jpeg'].includes(f.type) ||
                            f.size > 1024 * 1024
                          ) {
                            setMessage('PNG 또는 JPG, 1MB 이하의 사진을 선택해 주세요.');
                            return;
                          }
                          try {
                            const bitmap = await createImageBitmap(f);
                            if (
                              bitmap.height / bitmap.width > 2 ||
                              bitmap.height / bitmap.width < 0.5
                            )
                              throw new Error('사진 비율은 1:2부터 2:1 사이로 선택해 주세요.');
                            bitmap.close();
                            const reader = new FileReader();
                            reader.onload = () => setBasic('photo', String(reader.result));
                            reader.onerror = () => setMessage('사진을 읽지 못했어요.');
                            reader.readAsDataURL(f);
                          } catch (err) {
                            setMessage((err as Error).message);
                          }
                        }}
                      />
                    </label>
                    <small>선택 · JPG, PNG</small>
                    {r.photo && (
                      <button className="text-button" onClick={() => setBasic('photo', '')}>
                        사진 삭제
                      </button>
                    )}
                  </div>
                </div>
                <Field
                  label="간단한 소개 (선택)"
                  multiline
                  rows={6}
                  value={r.intro}
                  onChange={(v) => setBasic('intro', v)}
                  placeholder="나의 경험과 관심 분야를 간결하게 정리해 보세요."
                />
                <AiAssist
                  task="resume"
                  text={r.intro}
                  instruction="제공된 자기소개 문장의 사실은 유지하고 표현만 다듬어 주세요."
                  onApply={(suggestion) => setBasic('intro', suggestion)}
                />
              </>
            ) : (
              section && (
                <>
                  <div className="section-heading">
                    <h2>{section.name}</h2>
                    <CheckField
                      checked={section.enabled}
                      onChange={(v) =>
                        update((w) => {
                          w.resume.sections.find((s) => s.name === tab)!.enabled = v;
                        })
                      }
                    >
                      이 항목 사용
                    </CheckField>
                  </div>
                  {!section.enabled ? (
                    <div className="empty-state">
                      <Dami state="read" />
                      <h3>해당 없다면 건너뛰어도 괜찮아요.</h3>
                      <p>사용하지 않는 항목은 진행률과 내보내기에서 제외됩니다.</p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          update((w) => {
                            const s = w.resume.sections.find((s) => s.name === tab)!;
                            s.enabled = true;
                            if (!s.rows.length)
                              s.rows.push({ id: uid(), title: '', period: '', detail: '' });
                          })
                        }
                      >
                        이 항목 작성하기
                      </button>
                    </div>
                  ) : (
                    <>
                      {section.rows.map((row, i) => (
                        <div className="resume-row" key={row.id}>
                          <div className="section-heading">
                            <h3>
                              {section.name} {i + 1}
                            </h3>
                            <button
                              className="icon-button danger"
                              aria-label={`${section.name} ${i + 1} 삭제`}
                              onClick={() =>
                                update((w) => {
                                  w.resume.sections.find((s) => s.name === tab)!.rows.splice(i, 1);
                                })
                              }
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                          <div className="form-grid">
                            <Field
                              label={`${section.name} 명칭`}
                              required
                              value={row.title}
                              onChange={(v) =>
                                update((w) => {
                                  w.resume.sections.find((s) => s.name === tab)!.rows[i].title = v;
                                })
                              }
                            />
                            <Field
                              label="기간 (선택)"
                              value={row.period}
                              onChange={(v) =>
                                update((w) => {
                                  w.resume.sections.find((s) => s.name === tab)!.rows[i].period = v;
                                })
                              }
                              placeholder="예: 2023.03 – 2024.02"
                            />
                          </div>
                          <Field
                            label="내용 / 주요 업무 및 역할"
                            required
                            multiline
                            value={row.detail}
                            onChange={(v) =>
                              update((w) => {
                                w.resume.sections.find((s) => s.name === tab)!.rows[i].detail = v;
                              })
                            }
                          />
                        </div>
                      ))}
                      <button
                        className="button secondary full"
                        disabled={section.rows.length >= 100}
                        onClick={() =>
                          update((w) => {
                            w.resume.sections
                              .find((s) => s.name === tab)!
                              .rows.push({ id: uid(), title: '', period: '', detail: '' });
                          })
                        }
                      >
                        <Plus size={17} />
                        {section.name} 추가
                      </button>
                    </>
                  )}
                </>
              )
            )}
            {message && <Notice error>{message}</Notice>}
          </div>
        </section>
        <SidePanel title="차근차근 정리해요">
          <div className="soft-card">
            <b>누락 항목 확인</b>
            <p>
              {[
                !r.name && '이름',
                !r.phone && '연락처',
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) && '올바른 이메일',
                ...r.sections
                  .filter(
                    (s) =>
                      s.enabled &&
                      (!s.rows.length || s.rows.some((x) => !x.title.trim() || !x.detail.trim())),
                  )
                  .map((s) => s.name),
              ]
                .filter(Boolean)
                .join(' · ') || '사용 중인 항목의 필수 내용이 모두 작성되었어요.'}
            </p>
          </div>
          <section className="soft-card" aria-label="공유된 지원 정보와 경험">
            <b>이미 정리한 정보</b>
            <p>{applicationContext || '지원 회사와 직무를 아직 입력하지 않았어요.'}</p>
            <Link className="text-button" to="/application">
              지원 정보 살펴보기
              <ArrowRight size={14} />
            </Link>
            {sharedExperiences.length ? (
              sharedExperiences.map((experience) => (
                <details key={experience.id}>
                  <summary>{experience.title}</summary>
                  <p>{experience.action || experience.situation}</p>
                  {experience.result && <p>{experience.result}</p>}
                </details>
              ))
            ) : (
              <p>정리한 경험이 생기면 여기에서 참고할 수 있어요.</p>
            )}
            <Link className="text-button" to="/experience">
              경험 내용 살펴보기
              <ArrowRight size={14} />
            </Link>
          </section>
          <h4>표현 다듬기</h4>
          <p>“참여했습니다”에 그치지 않고, 직접 한 일과 확인할 수 있는 결과를 적어 보세요.</p>
          <h4>미리보기 템플릿</h4>
          <div className="template-options">
            {(['기본형', '신입 중심형', '경력 중심형'] as const).map((t) => (
              <label key={t}>
                <input
                  type="radio"
                  name="template"
                  checked={r.template === t}
                  onChange={() =>
                    update((w) => {
                      w.resume.template = t;
                    })
                  }
                />
                {t}
              </label>
            ))}
          </div>
          <button
            className="resume-thumbnail"
            aria-label="이력서 미리보기 열기"
            onClick={() => setPreview(true)}
          >
            <span>{r.name || '나의 이력서'}</span>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} />
            ))}
          </button>
          <ExportButtons />
        </SidePanel>
      </div>
      <SaveBar />
      {preview && (
        <Modal
          title={`이력서 미리보기 · ${resumeModeLabels[mode]} · ${r.template}`}
          onClose={() => setPreview(false)}
        >
          <article className="document-preview">
            {r.photo && <img className="preview-photo" src={r.photo} alt="이력서 사진" />}
            <h1>이력서</h1>
            {content.sections.map((s, i) => (
              <section key={i}>
                <h2>{s.title}</h2>
                <p>{s.body || '아직 입력한 내용이 없어요.'}</p>
              </section>
            ))}
          </article>
          <CheckField
            checked={slot.reviewed}
            onChange={(value) =>
              update((w) => {
                w.resumeSlots[w.resumeMode].reviewed = value;
              })
            }
          >
            이 방식의 이력서 내용을 검토했어요.
          </CheckField>
          <ExportButtons />
        </Modal>
      )}
    </>
  );
}
