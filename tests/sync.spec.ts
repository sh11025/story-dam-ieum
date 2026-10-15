// 자기소개서 '내 경험'과 이력서 항목의 자동 연결 규칙 (브라우저 없이 확인)
import { test, expect } from '@playwright/test';
import { initialWork, parseWork, serializedWork, syncAllResumes, type Work } from '../src/model.ts';

const rowsOf = (w: Work, name: string) => w.resume.sections.find((s) => s.name === name)!.rows;
const withExperience = () => {
  const w = initialWork();
  Object.assign(w.experiences[0], {
    title: '지역 안내 개선',
    period: '2025.03 – 2025.06',
    situation: '이용자가 안내를 찾기 어려워했습니다.',
    role: '사용자 조사를 맡았습니다.',
    action: '의견을 분류하고 안내 문구를 다시 썼습니다.',
    result: '문의가 줄었습니다.',
  });
  syncAllResumes(w);
  return w;
};

test('an experience with a title becomes a linked resume row with title, period and summary', () => {
  const blank = initialWork();
  syncAllResumes(blank);
  expect(rowsOf(blank, '프로젝트·활동')).toHaveLength(0); // 제목이 없으면 만들지 않음

  const w = withExperience();
  const [row] = rowsOf(w, '프로젝트·활동');
  expect(row).toMatchObject({
    title: '지역 안내 개선',
    period: '2025.03 – 2025.06',
    detail:
      '사용자 조사를 맡았습니다.\n의견을 분류하고 안내 문구를 다시 썼습니다.\n문의가 줄었습니다.',
    experienceId: w.experiences[0].id,
  });
  expect(w.resume.sections.find((s) => s.name === '프로젝트·활동')!.enabled).toBe(true);
  // 세 가지 이력서(새로 만들기·기존 수정·양식) 모두에 연결
  for (const mode of ['new', 'existing', 'organization'] as const)
    expect(
      w.resumeSlots[mode].data.sections.find((s) => s.name === '프로젝트·활동')!.rows,
    ).toHaveLength(1);
});

test('changes follow the experience, but a detail edited in the resume is kept', () => {
  const w = withExperience();
  w.experiences[0].title = '지역 안내 개선 프로젝트';
  w.experiences[0].result = '문의가 30% 줄었습니다.';
  syncAllResumes(w);
  expect(rowsOf(w, '프로젝트·활동')[0].title).toBe('지역 안내 개선 프로젝트');
  expect(rowsOf(w, '프로젝트·활동')[0].detail).toContain('30%');

  rowsOf(w, '프로젝트·활동')[0].detail = '이력서용으로 직접 줄인 설명';
  rowsOf(w, '프로젝트·활동')[0].detailEdited = true;
  w.experiences[0].action = '바뀐 행동';
  w.experiences[0].period = '2025.03 – 2025.07';
  syncAllResumes(w);
  expect(rowsOf(w, '프로젝트·활동')[0].detail).toBe('이력서용으로 직접 줄인 설명');
  expect(rowsOf(w, '프로젝트·활동')[0].period).toBe('2025.03 – 2025.07');
});

test('moving, excluding and deleting an experience updates the resume', () => {
  const w = withExperience();
  w.experiences[0].resumeSection = '경력';
  syncAllResumes(w);
  expect(rowsOf(w, '프로젝트·활동')).toHaveLength(0);
  expect(rowsOf(w, '경력')).toHaveLength(1);

  w.experiences[0].resumeSection = 'none';
  syncAllResumes(w);
  expect(rowsOf(w, '경력')).toHaveLength(0);

  // 직접 고친 줄은 경험을 지워도 연결만 끊고 남김
  w.experiences[0].resumeSection = '프로젝트·활동';
  syncAllResumes(w);
  rowsOf(w, '프로젝트·활동')[0].detailEdited = true;
  w.experiences.splice(0, 1);
  syncAllResumes(w);
  expect(rowsOf(w, '프로젝트·활동')).toHaveLength(1);
  expect(rowsOf(w, '프로젝트·활동')[0].experienceId).toBeUndefined();
});

test('older files without the new fields load, and a same-titled resume row is linked instead of duplicated', () => {
  const w = initialWork();
  w.experiences[0].title = '팀 프로젝트';
  w.experiences[0].role = '기획';
  const row = {
    id: 'old-row',
    title: '팀 프로젝트',
    period: '2024',
    detail: '예전에 직접 쓴 설명',
  };
  w.resume.sections.find((s) => s.name === '프로젝트·활동')!.rows.push(row);
  const old = JSON.parse(serializedWork(w));
  for (const e of old.experiences) {
    delete e.period;
    delete e.resumeSection;
  }
  const loaded = parseWork(JSON.stringify(old));
  const rows = rowsOf(loaded, '프로젝트·활동');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'old-row',
    experienceId: loaded.experiences[0].id,
    detail: '예전에 직접 쓴 설명',
    detailEdited: true,
  });
  expect(loaded.experiences[0].period).toBe('2024'); // 이력서에만 있던 기간을 경험으로 가져옴
  expect(rows[0].period).toBe('2024');
});
