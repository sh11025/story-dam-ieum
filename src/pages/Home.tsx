import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  FolderOpen,
  MessageSquare,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import { useWork } from '../store';
import { type Kind } from '../model';
import { Dami, Landscape } from '../components';
import { ApplicationList } from '../components/Applications';

export function Home({ onImport }: { onImport: () => void }) {
  const { update } = useWork();
  const nav = useNavigate();
  const cards = [
    {
      title: '자기소개서 작성',
      desc: (
        <>
          나만의 경험을
          <br />
          설득력 있는 이야기로.
        </>
      ),
      icon: FileText,
      to: '/cover-letter',
      kind: 'cover-letter',
    },
    {
      title: '이력서 작성',
      desc: (
        <>
          걸어온 길을 한눈에,
          <br />
          나답게 정리해요.
        </>
      ),
      icon: BookOpen,
      to: '/resume',
      kind: 'resume',
    },
    {
      title: '면접 준비',
      desc: (
        <>
          내 이야기를 말하는 연습,
          <br />
          담이와 함께 준비해요.
        </>
      ),
      icon: MessageSquare,
      to: '/interview',
      kind: 'interview',
    },
    {
      title: '저장한 작업 불러오기',
      desc: (
        <>
          내 기기에 저장한 .sdi 파일로
          <br />
          이어서 작성해요.
        </>
      ),
      icon: FolderOpen,
      to: '',
      kind: '',
    },
  ];
  return (
    <main className="home">
      <section className="home-story">
        <div className="home-copy">
          <span className="eyebrow">한 걸음씩, 나의 다음으로</span>
          <h1>오늘은 무엇을 준비할까요?</h1>
          <p>
            당신의 경험이 더 큰 기회로 이어지도록,
            <br />
            스토리 담 이음이 함께합니다.
          </p>
        </div>
        <Landscape id="home" />
        <Dami homeIdle className="home-dami" />
        <span className="land-label">경험을 모아, 가능성을 잇는 시간</span>
      </section>
      <section className="home-actions">
        <div className="section-intro">
          <span className="eyebrow">LET’S MAKE YOUR NEXT CHAPTER</span>
          <h2>나의 다음을 시작해요.</h2>
          <p>필요한 준비부터 편안하게 시작하세요.</p>
        </div>
        <div className="home-grid">
          {cards.map((c, i) => (
            <button
              key={c.title}
              className="home-card"
              onClick={() => {
                if (!c.to) {
                  onImport();
                  return;
                }
                update((w) => {
                  w.kind = c.kind as Kind;
                }, false);
                nav(c.to);
              }}
            >
              <span className="card-icon">
                <c.icon size={27} />
              </span>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
              <span className="card-bottom">
                {i === 3 ? '파일 선택하기' : '시작하기'}
                <ArrowRight size={18} />
              </span>
            </button>
          ))}
        </div>
        <ApplicationList />
        <div className="privacy-note">
          <ShieldCheck size={17} />
          <span>
            작성 내용은 서비스 서버에 영구 저장하지 않습니다.
            <br />
            중요한 작업은 .sdi 파일로 기기에 저장해 주세요.
          </span>
        </div>
      </section>
    </main>
  );
}
