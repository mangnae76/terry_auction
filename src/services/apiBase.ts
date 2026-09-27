const PROD_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export const apiPath = (path: string): string => {
  if (import.meta.env.DEV) return path;
  if (!PROD_BASE) return path;
  return `${PROD_BASE}${path}`;
};
