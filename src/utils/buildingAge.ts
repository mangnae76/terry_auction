// 건물 연차 — 햇수식 N년차 = 올해 − 사용승인(건축)연도 + 1 (2016년 사용승인 → 2026년에 11년차).
// 화면마다 '올해 − 연도'(10년차)와 '+1'(11년차)이 섞여 같은 건물이 다르게 보였다 — 이 한 곳으로 센다.

/** 연도 숫자나 '2016-06-27' · '2016.06' 같은 글을 받아 N(년차). 못 읽으면 0 */
export const buildingAgeOf = (v: number | string | null | undefined, now = new Date()): number => {
  const y = typeof v === 'number' ? Math.floor(v) : Number(String(v ?? '').match(/(\d{4})/)?.[1] ?? 0);
  return y >= 1800 ? Math.max(1, now.getFullYear() - y + 1) : 0;
};

/** 'N년차' (못 읽으면 '') */
export const buildingAgeText = (v: number | string | null | undefined, now?: Date): string => {
  const n = buildingAgeOf(v, now);
  return n ? `${n}년차` : '';
};
