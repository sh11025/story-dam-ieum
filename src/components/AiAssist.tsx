import { useEffect, useRef, useState } from 'react';
import { useHasAiKey, requestRevision } from '../services';

export function AiAssist({
  text,
  instruction,
  task,
  onApply,
}: {
  text: string;
  instruction: string;
  task: 'experience' | 'resume';
  onApply?: (suggestion: string) => void;
}) {
  const aiReady = useHasAiKey();
  const [before, setBefore] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [status, setStatus] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const request = async () => {
    if (pending.current || !text.trim()) return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus('요청 중…');
    try {
      const result = await requestRevision({ text, instruction, task }, controller.signal);
      if (!controller.signal.aborted) {
        setBefore(text);
        setSuggestion(result);
        setStatus('제안을 확인해 주세요.');
      }
    } catch (error) {
      setStatus(
        (error as Error).name === 'AbortError' ? '요청을 취소했어요.' : (error as Error).message,
      );
    } finally {
      pending.current = null;
    }
  };
  return (
    <div className="soft-card">
      <button
        className="button secondary small"
        disabled={!text.trim() || status === '요청 중…'}
        onClick={request}
      >
        AI 표현 제안 요청
      </button>
      {status === '요청 중…' && (
        <button className="text-button" onClick={() => pending.current?.abort()}>
          취소
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {suggestion && (
        <>
          <h4>원문</h4>
          <p className="prewrap">{before}</p>
          <h4>AI 제안</h4>
          <p className="prewrap">{suggestion}</p>
          {onApply && (
            <button
              className="button small"
              onClick={() => {
                if (text !== before) {
                  setStatus('원문이 바뀌었어요. 다시 요청해 주세요.');
                  setSuggestion('');
                  return;
                }
                onApply(suggestion);
                setSuggestion('');
                setStatus('제안을 적용했어요.');
              }}
            >
              적용
            </button>
          )}
          <button
            className="text-button"
            onClick={() => {
              setSuggestion('');
              setStatus('제안을 취소했어요.');
            }}
          >
            취소
          </button>
        </>
      )}
      <p className="fine-print">
        {aiReady
          ? '현재 선택한 내용만 AI 서비스로 전송됩니다. 없는 사실은 직접 추가하지 마세요.'
          : '오른쪽 위 설정에서 AI 키를 넣으면 표현 제안을 받을 수 있어요. 키가 없으면 아무것도 전송되지 않습니다.'}
      </p>
    </div>
  );
}
