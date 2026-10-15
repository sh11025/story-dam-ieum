// 서버에서 외부 JSON을 안전하게 다루기 위한 작은 도우미
export type Json = Record<string, unknown>;

/** 값이 일반 객체일 때만 돌려주고, 아니면 null */
export const obj = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
