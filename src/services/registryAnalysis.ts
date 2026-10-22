// 건물등기 읽기 — 말소기준을 찾고, 낙찰자가 떠안는 권리를 가려낸다.
//
// 왜 따로 두나 — 경매에서 가장 위험한 판단이다. 화면 안에 섞여 있으면
// 맞는지 확인할 길이 없어, 셈만 떼어 표(registryAnalysis.test.ts)로 묶어 둔다.

/** 'YYYY-MM-DD' 꼴인가 */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 말소기준이 될 수 있는 권리 — 근저당·저당·가압류·압류·담보가등기·경매개시 */
export const BASE_RIGHT_KINDS = /근저당|저당권|가압류|압류|담보가등기|경매개시|강제경매|임의경매/;

/** 소유권 줄은 인수·소멸을 따지는 자리가 아니다 */
export const OWNERSHIP_KIND = /^소유권(이전|보존)(등기)?$/;

export type RegistryRow = {
  kind?: string;
  /** 'YYYY-MM-DD' (점·슬래시로 온 날짜는 부르는 쪽에서 다듬어 넘긴다) */
  date?: string;
  /** PDF 가 '소멸' 이라 적어 준 줄 */
  extinct?: string;
};

/** 날짜 칸을 'YYYY-MM-DD' 로 맞춘다 — 점·슬래시로 온 것도 받는다 */
export const normalizeYmd = (raw: string | undefined): string => {
  const t = (raw ?? '').replace(/[./]/g, '-').trim();
  return YMD_RE.test(t) ? t : '';
};

/**
 * 말소기준일 — 말소기준이 될 수 있는 권리 가운데 가장 빠른 날.
 * 날짜를 못 읽는 줄은 세지 않는다. 하나도 없으면 빈 글자.
 */
export const baseDateOf = (rows: RegistryRow[]): string => {
  const dates = rows
    .filter((r) => BASE_RIGHT_KINDS.test(r.kind ?? ''))
    .map((r) => normalizeYmd(r.date))
    .filter(Boolean)
    .sort();
  return dates[0] ?? '';
};

/**
 * 이 줄을 낙찰자가 떠안는가(인수).
 *
 * 규칙 — 말소기준보다 **앞선** 권리는 떠안는다. 다만
 *  · PDF 가 이미 '소멸' 이라 적어 준 줄은 그대로 믿는다
 *  · 소유권 줄은 따지지 않는다
 *  · 말소기준을 모르거나 날짜를 못 읽으면 판단하지 않는다(모름)
 */
export const isTakenOver = (row: RegistryRow, baseDate: string): boolean => {
  if (!YMD_RE.test(baseDate)) return false;
  if ((row.extinct ?? '') === '소멸') return false;
  if (OWNERSHIP_KIND.test((row.kind ?? '').trim())) return false;
  const date = normalizeYmd(row.date);
  if (!date) return false;
  return date < baseDate;
};
