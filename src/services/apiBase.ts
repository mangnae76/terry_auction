const PROD_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export const apiPath = (path: string): string => {
  if (import.meta.env.DEV) return path;
  if (!PROD_BASE) return path;
  return `${PROD_BASE}${path}`;
};

/** 중계 서버(worker)를 거쳐 부르는가 — 거치면 공공데이터 키는 중계 서버가 붙인다(웹 묶음은 키를 싣지 않는다) */
export const usesRelay = (): boolean => !import.meta.env.DEV && !!PROD_BASE;
