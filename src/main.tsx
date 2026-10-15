import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { WorkProvider } from './store';
import './styles/base.css';
import './styles/concept.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="empty-state">
        <h1>화면을 불러오는 중 문제가 생겼어요.</h1>
        <p>브라우저 임시저장은 유지됩니다. 새로고침 후 다시 시도해 주세요.</p>
        <button className="button" onClick={() => location.reload()}>
          다시 불러오기
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <WorkProvider>
          <App />
        </WorkProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
