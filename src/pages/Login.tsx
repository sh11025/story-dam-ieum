import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Dami, Landscape, Notice } from '../components';

export function Login() {
  const nav = useNavigate();
  return (
    <main className="login-shell">
      <section className="login-story">
        <Link className="brand" to="/login">
          <Dami />
          Story Dam Ieum
        </Link>
        <div className="login-copy">
          <span className="eyebrow">STORY DAM IEUM</span>
          <h1>
            당신의 이야기를 담아,
            <br />
            다음을 잇습니다.
          </h1>
          <p>
            지금까지의 경험이,
            <br />더 나은 내일로 이어지는 다리가 됩니다.
          </p>
        </div>
        <Landscape id="login" />
        <Dami className="login-dami" />
        <div className="story-caption">
          이야기를 담고, 다음으로 이어주는 친구 <b>담이</b>
        </div>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span>
          <h2>작업을 시작해 보세요</h2>
          <p>
            스토리 담 이음과 함께
            <br />
            당신의 다음을 준비하세요.
          </p>
          <div className="demo-entry">
            <span className="pill">로컬 체험</span>
            <p>
              별도 계정 없이 바로 작성할 수 있어요.
              <br />
              입력한 내용은 이 기기에 임시저장됩니다.
            </p>
            <button className="button secondary full" onClick={() => nav('/home')}>
              체험 시작하기
              <ArrowRight size={17} />
            </button>
          </div>
          <Notice>
            자기소개서·이력서·면접 작업은 이 브라우저에만 저장됩니다. 장기 보관은 .sdi 파일로 저장해
            주세요.
          </Notice>
        </div>
      </section>
    </main>
  );
}
