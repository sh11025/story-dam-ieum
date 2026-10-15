import { useEffect, useState } from 'react';
import { configureAiSession, testAiConnection } from '../services';
import {
  AI_MODELS,
  AI_PROVIDERS as PROVIDERS,
  defaultAiModel,
  isValidModelName,
  type AiProvider as Provider,
} from '../../shared/aiModels';
import { Field, Notice } from './ui';

const CUSTOM = '__custom';
const KEY_PAGES: Record<Provider, string> = {
  Gemini: 'https://aistudio.google.com/apikey',
  ChatGPT: 'https://platform.openai.com/api-keys',
  Claude: 'https://console.anthropic.com/settings/keys',
};
const CHECKING = '연결 확인 중…';

// 창을 닫았다 열어도 입력한 값이 유지되도록 이 탭의 메모리에만 둡니다(저장하지 않음).
// 모델은 AI 회사마다 따로 기억해, 회사를 바꿨다 돌아와도 고른 모델이 남아 있어요.
let remembered: { provider: Provider; key: string; models: Record<Provider, string> } = {
  provider: 'ChatGPT',
  key: '',
  models: {
    Gemini: defaultAiModel('Gemini'),
    ChatGPT: defaultAiModel('ChatGPT'),
    Claude: defaultAiModel('Claude'),
  },
};

/** AI 설정 창 내용: AI 회사 선택, 개인 키 입력, 연결 확인 */
export function AiSettings({ onDone }: { onDone: () => void }) {
  const [provider, setProvider] = useState<Provider>(remembered.provider);
  const [apiKey, setApiKey] = useState(remembered.key);
  const [models, setModels] = useState(remembered.models);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const model = models[provider];
  const listed = AI_MODELS[provider].some((m) => m.id === model);
  // 목록에 없는 이름이면 '직접 입력' 상태로 봅니다. 빈칸으로 시작해도 직접 입력 칸이 보이도록 따로 기억합니다.
  const [customOpen, setCustomOpen] = useState(!listed);
  const custom = customOpen || !listed;
  const modelValid = isValidModelName(model.trim());

  useEffect(() => {
    remembered = { provider, key: apiKey, models };
    // 직접 입력한 이름이 형식에 맞지 않으면 기본 모델로 보냅니다(아래에 안내 표시).
    configureAiSession(provider, apiKey, modelValid ? model : defaultAiModel(provider));
  }, [provider, apiKey, models, model, modelValid]);
  useEffect(() => {
    setStatus('');
    setCustomOpen(!AI_MODELS[provider].some((m) => m.id === remembered.models[provider]));
  }, [provider]);
  useEffect(() => setStatus(''), [model]);
  const setModel = (value: string) => setModels((m) => ({ ...m, [provider]: value }));

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
      <label className="field">
        <span>모델</span>
        <select
          aria-label="모델"
          value={custom ? CUSTOM : model}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomOpen(true);
              setModel('');
            } else {
              setCustomOpen(false);
              setModel(e.target.value);
            }
          }}
        >
          {AI_MODELS[provider].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.note}
            </option>
          ))}
          <option value={CUSTOM}>직접 입력 (목록에 없는 모델)</option>
        </select>
      </label>
      {custom && (
        <>
          <Field
            label="모델 이름 직접 입력"
            value={model}
            onChange={setModel}
            placeholder={`예: ${defaultAiModel(provider)}`}
          />
          {model.trim() && !modelValid && (
            <Notice error>
              모델 이름은 영문·숫자와 . - _ : / 만 쓸 수 있어요. 고치기 전까지는 기본 모델(
              {defaultAiModel(provider)})을 써요.
            </Notice>
          )}
        </>
      )}
      <p className="fine-print">
        사용할 모델: <code>{modelValid ? model.trim() : defaultAiModel(provider)}</code>
        {' · '}
        모델마다 요금과 속도가 달라요. 모델 이름은 AI 회사 사정으로 바뀔 수 있어요.
      </p>
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
