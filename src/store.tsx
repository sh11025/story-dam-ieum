import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  initialWork,
  parseLibrary,
  parseWork,
  serializeLibrary,
  uid,
  MAX_LIBRARY_ITEMS as MAX_ITEMS,
  type Library,
  type LibraryItem,
  type ResumeMode,
  type Work,
} from './model';

// 브라우저 임시저장 위치. 지원서 여러 개를 한 묶음으로 저장합니다.
export const LIBRARY_KEY = 'story-dam-ieum-library-v1';
// 예전(지원서 1개) 저장 위치. 처음 한 번 읽어서 새 묶음으로 옮깁니다.
const LEGACY_KEY = 'story-dam-ieum-draft-v1';

const newItem = (work: Work, name = ''): LibraryItem => ({
  id: uid(),
  name,
  createdAt: new Date().toISOString(),
  work,
});
const emptyLibrary = (): Library => {
  const item = newItem(initialWork());
  return { version: 1, activeId: item.id, items: [item], lastBackupAt: '' };
};

function restore(): { library: Library; error: string } {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) return { library: parseLibrary(raw), error: '' };
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const item = newItem(parseWork(legacy));
      return {
        library: { version: 1, activeId: item.id, items: [item], lastBackupAt: '' },
        error: '',
      };
    }
    return { library: emptyLibrary(), error: '' };
  } catch {
    return {
      library: emptyLibrary(),
      error: '이전 임시저장을 읽지 못했어요. 저장한 .sdi 파일로 복원할 수 있습니다.',
    };
  }
}

/** 지원서 이름: 직접 붙인 이름 → 회사명 → 기본 이름 */
export const itemLabel = (item: LibraryItem) =>
  item.name.trim() ||
  [item.work.application.company, item.work.application.role].filter((x) => x.trim()).join(' · ') ||
  '새 지원서';

type Store = {
  work: Work;
  update: (recipe: (draft: Work) => void, invalidate?: boolean) => void;
  switchResumeMode: (mode: ResumeMode) => void;
  replace: (w: Work) => void;
  clear: () => void;
  saveStatus: string;
  error: string;
  // 지원서 여러 개 관리
  library: Library;
  activeId: string;
  switchApplication: (id: string) => void;
  createApplication: (options?: { copyShared?: boolean; work?: Work; name?: string }) => void;
  renameApplication: (id: string, name: string) => void;
  deleteApplication: (id: string) => void;
  importLibrary: (lib: Library) => void;
  /** 파일로 저장한 뒤 처음 바뀐 시각 (바뀐 게 없으면 0). 브라우저를 새로 열면 0부터 */
  unsavedSince: number;
  markBackedUp: () => void;
};
const Context = createContext<Store>(null!);

export function WorkProvider({ children }: { children: ReactNode }) {
  const [restored] = useState(restore);
  const [library, setLibrary] = useState(restored.library);
  const [saveStatus, setSaveStatus] = useState('임시저장 완료');
  const [error, setError] = useState(restored.error);
  const [unsavedSince, setUnsavedSince] = useState(0);
  const touch = () => setUnsavedSince((t) => t || Date.now());
  const first = useRef(true);
  const active = library.items.find((i) => i.id === library.activeId) ?? library.items[0];
  const work = active.work;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveStatus('저장 중');
    let id: ReturnType<typeof setTimeout> | undefined;
    try {
      localStorage.setItem(LIBRARY_KEY, serializeLibrary(library));
      // 저장에 성공한 뒤에만 이전 저장 오류를 지웁니다.
      setError('');
      id = setTimeout(() => setSaveStatus('임시저장 완료'), 150);
    } catch {
      setSaveStatus('저장 실패');
      setError('브라우저 저장 공간을 사용할 수 없어요. 작업 파일을 저장해 주세요.');
    }
    return () => clearTimeout(id);
  }, [library]);

  /** 지금 열려 있는 지원서만 바꿉니다. */
  const setWork = (fn: (prev: Work) => Work) => {
    setLibrary((lib) => {
      const items = lib.items.map((i) => (i.id === lib.activeId ? { ...i, work: fn(i.work) } : i));
      return { ...lib, items };
    });
    touch();
  };

  const update: Store['update'] = (recipe, invalidate = true) =>
    setWork((prev) => {
      const next = structuredClone(prev);
      recipe(next);
      next.resumeSlots[next.resumeMode].data = structuredClone(next.resume);
      if (invalidate && prev.kind === 'cover-letter') next.review = [false, false, false, false];
      return next;
    });
  const switchResumeMode = (mode: ResumeMode) =>
    setWork((prev) => {
      if (mode === prev.resumeMode) return prev;
      const next = structuredClone(prev);
      next.resumeSlots[prev.resumeMode].data = structuredClone(prev.resume);
      next.resumeMode = mode;
      next.resume = structuredClone(next.resumeSlots[mode].data);
      return next;
    });
  const replace = (next: Work) => {
    setError('');
    setWork(() => next);
  };
  /** 지금 지원서를 지웁니다. 마지막 하나면 빈 지원서로 새로 시작합니다. */
  const clear = () => deleteApplication(library.activeId);

  const switchApplication = (id: string) =>
    setLibrary((lib) => (lib.items.some((i) => i.id === id) ? { ...lib, activeId: id } : lib));

  const createApplication: Store['createApplication'] = (options = {}) => {
    if (library.items.length >= MAX_ITEMS) {
      setError(`지원서는 최대 ${MAX_ITEMS}개까지 만들 수 있어요. 쓰지 않는 지원서를 지워 주세요.`);
      return;
    }
    let next = options.work ? structuredClone(options.work) : initialWork();
    if (!options.work && options.copyShared) {
      // 경험과 이력서는 여러 회사에 함께 쓰는 경우가 많아 복사해 둡니다.
      next = {
        ...next,
        experiences: structuredClone(work.experiences).map((e) => ({ ...e, id: uid() })),
        resume: structuredClone(work.resume),
        resumeMode: work.resumeMode,
        resumeSlots: structuredClone(work.resumeSlots),
      };
    }
    const item = newItem(next, options.name ?? '');
    setLibrary((lib) => ({ ...lib, activeId: item.id, items: [...lib.items, item] }));
    setError('');
    touch();
  };

  const renameApplication = (id: string, name: string) =>
    setLibrary((lib) => ({
      ...lib,
      items: lib.items.map((i) => (i.id === id ? { ...i, name: name.slice(0, 60) } : i)),
    }));

  function deleteApplication(id: string) {
    setLibrary((lib) => {
      const items = lib.items.filter((i) => i.id !== id);
      if (!items.length) return emptyLibrary();
      return { ...lib, items, activeId: lib.activeId === id ? items[0].id : lib.activeId };
    });
    touch();
  }

  const importLibrary = (incoming: Library) => {
    setLibrary((lib) => {
      // 같은 번호가 있으면 새 번호를 붙여, 기존 지원서를 덮어쓰지 않습니다.
      const ids = new Set(lib.items.map((i) => i.id));
      const added = incoming.items.map((i) => (ids.has(i.id) ? { ...i, id: uid() } : i));
      const items = [...lib.items, ...added].slice(-MAX_ITEMS);
      return { ...lib, items, activeId: added[0]?.id ?? lib.activeId };
    });
    setError('');
  };

  const markBackedUp = () => {
    setLibrary((lib) => ({ ...lib, lastBackupAt: new Date().toISOString() }));
    setUnsavedSince(0);
  };

  return (
    <Context.Provider
      value={{
        work,
        update,
        switchResumeMode,
        replace,
        clear,
        saveStatus,
        error,
        library,
        activeId: active.id,
        switchApplication,
        createApplication,
        renameApplication,
        deleteApplication,
        importLibrary,
        unsavedSince,
        markBackedUp,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWork = () => useContext(Context);
