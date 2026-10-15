import { useEffect, useState } from 'react';
import { configureAiSession, testAiConnection } from '../services';
import { Field, Notice } from './ui';

type Provider = 'Gemini' | 'ChatGPT' | 'Claude';
const PROVIDERS: Provider[] = ['Gemini', 'ChatGPT', 'Claude'];
const KEY_PAGES: Record<Provider, string> = {
  Gemini: 'https://aistudio.google.com/apikey',
  ChatGPT: 'https://platform.openai.com/api-keys',
  Claude: 'https://console.anthropic.com/settings/keys',
};
const CHECKING = '연결 확인 중…';

// 창을 닫았다 열어도 입력한 값이 유지되도록 이 탭의 메모리에만 둡니다(저장하지 않음).
let remembered: { provider: Provider; key: string } = { provider: 'ChatGPT', key: '' };

/** AI 설정 창 내용: AI 회사 선택, 개인 키 입력, 연결 확인 */
export function AiSettings({ onDone }: { onDone: () => void }) {
  const [provider, setProvider] = useState<Provider>(remembered.provider);
  const [apiKey, setApiKey] = useState(remembered.key);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    remembered = { provider, key: apiKey };
    configureAiSession(provider, apiKey);
  }, [provider, apiKey]);
  useEffect(() => setStatus(''), [provider]);

  const check = async () => {
    setStatus(CHECKING);
    setFailed(false);
    try {
      await testAiConnection();
      setStatus('AI 연결을 확인했습니다.');
    } catch (err) {
      setFailed(true);
      setStatus(`연결 확인 불가: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <p>사용할 AI를 선택하고 연결 상태를 확인하세요.</p>
      <div className="tabs provider-tabs">
        {PROVIDERS.map((p) => (
          <button key={p} className={provider === p ? 'active' : ''} onClick={() => setProvider(p)}>
            {p}
          </button>
        ))}
      </div>
      <Field
        label="API Key"
        value={apiKey}
        onChange={setApiKey}
        type="password"
        placeholder="이 탭을 닫으면 사라집니다"
      />
      <Notice>
        요청한 일부 내용과 Key가 선택한 AI 제공자에게 전송됩니다. Key는 이 탭의 메모리에만 두며
        서비스 서버에 저장하지 않습니다.
      </Notice>
      <button
        className="button secondary full"
        disabled={status === CHECKING || !apiKey.trim()}
        onClick={check}
      >
        {status === CHECKING ? status : '연결 확인'}
      </button>
      {status && status !== CHECKING && <Notice error={failed}>{status}</Notice>}
      <p className="fine-print">
        API 이용 요금은 공급자에게 별도로 청구될 수 있습니다. Key는 작업 파일·브라우저 저장소·로그에
        저장하지 않습니다.
      </p>
      <a className="text-button" href={KEY_PAGES[provider]} target="_blank" rel="noreferrer">
        {provider} 공식 API Key 발급 안내 ↗
      </a>
      <button className="button full" onClick={onDone}>
        완료
      </button>
    </>
  );
}
