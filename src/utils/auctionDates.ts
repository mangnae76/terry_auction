// 낙찰일 · 잔금기한 규칙 한곳 — 물건상세 수익분석 · 단계 바꾸기 · 알림 · 입찰달력이 같은 것을 쓴다.
// 낙찰일은 매각기일(입찰한 날) 그날이다 — 앞이든 뒤든 다른 날이면 잘못 적은 것 (BUG-0012 같은 일이 다시 없게).
// 잔금기한은 법원 통지서의 날짜가 먼저고, 비어 있으면 낙찰일(없으면 매각기일)에서 45일로 어림한 예정일을 보여 준다.
import type { AuctionDetail } from '../types/auction';

/** 낙찰일에서 잔금기한까지 어림하는 날수 — 매각허가 · 확정 뒤 대금지급기한이 보통 이쯤 */
export const BALANCE_DUE_DAYS = 45;

type DateLike = Pick<AuctionDetail, 'wonDate' | 'balanceDueDate'> & { eventDate?: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** 'YYYY-MM-DD…' 앞 열 자만 — 날짜가 아니면 빈 글 */
export const ymdOf = (v?: string): string => { const s = String(v ?? '').trim().slice(0, 10).replace(/[./]/g, '-'); return YMD.test(s) ? s : ''; };

/** '2026-11-10' → '26년 11월 10일' */
export const koreanYmd = (ymd: string): string => {
  const s = ymdOf(ymd);
  if (!s) return '';
  return `${s.slice(2, 4)}년 ${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;
};

const plusDays = (ymd: string, n: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  const p2 = (x: number) => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
};

/** 낙찰일로 적을 수 있는지 — 안 되면 까닭 글, 되면 빈 글 */
export const wonDateError = (a: DateLike, value: string): string => {
  const sale = ymdOf(a.eventDate);
  const v = ymdOf(value);
  if (!sale || !v || v === sale) return '';
  return `입찰일(매각기일)은 ${koreanYmd(sale)}입니다. 낙찰일은 입찰일과 같은 날이어야 합니다 — ${koreanYmd(v)}로는 적을 수 없습니다.`;
};

/** 잔금기한 — 적어 둔 날짜, 없으면 낙찰일(없으면 매각기일) + 45일 예정일 */
export const balanceDueOf = (a: DateLike): { date: string; expected: boolean } => {
  const told = ymdOf(a.balanceDueDate);
  if (told) return { date: told, expected: false };
  const base = ymdOf(a.wonDate) || ymdOf(a.eventDate);
  return base ? { date: plusDays(base, BALANCE_DUE_DAYS), expected: true } : { date: '', expected: false };
};

/** 잔금기한으로 적을 수 있는지 — 낙찰일(없으면 매각기일)보다 앞서면 안 된다 */
export const balanceDueError = (a: DateLike, value: string): string => {
  const base = ymdOf(a.wonDate) || ymdOf(a.eventDate);
  const v = ymdOf(value);
  if (!base || !v || v > base) return '';
  return `${ymdOf(a.wonDate) ? '낙찰일' : '입찰일(매각기일)'}은 ${koreanYmd(base)}입니다. 잔금기한은 그 뒤여야 합니다 — ${koreanYmd(v)}로는 적을 수 없습니다.`;
};
