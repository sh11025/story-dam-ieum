// AI 회사별로 고를 수 있는 모델 목록입니다. 화면(AI 설정 창)과 서버가 같이 씁니다.
// 2026-10-15 각 회사 공식 문서 기준. 모델 이름이 바뀌면 이 파일만 고치면 됩니다.
// 목록에 없는 모델도 AI 설정 창의 '직접 입력'으로 쓸 수 있어요.

export type AiProvider = 'Gemini' | 'ChatGPT' | 'Claude';
export const AI_PROVIDERS: AiProvider[] = ['Gemini', 'ChatGPT', 'Claude'];

export type AiModelOption = { id: string; label: string; note: string };

/** 각 회사의 첫 번째 모델이 기본값(균형형)입니다. */
export const AI_MODELS: Record<AiProvider, AiModelOption[]> = {
  Claude: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: '균형형' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: '가장 똑똑함' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: '빠르고 저렴' },
  ],
  Gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: '균형형' },
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: '가장 똑똑함' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: '빠르고 저렴' },
  ],
  ChatGPT: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: '균형형' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', note: '가장 똑똑함' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', note: '빠르고 저렴' },
  ],
};

export const defaultAiModel = (provider: AiProvider) => AI_MODELS[provider][0].id;

/**
 * 직접 입력한 모델 이름 검사. 영문·숫자와 . - _ : / 만, 80자까지.
 * (모델 이름이 AI 회사 주소에 들어가므로, 이상한 글자로 주소를 바꾸지 못하게 막습니다.)
 */
export const isValidModelName = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(value) && !value.includes('..');
