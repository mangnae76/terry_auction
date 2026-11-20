/* 탱크옥션 관심물건 — 거르기 · 현황 탭 건수 · 정렬 · 물건등록 꼴(순수 계산, 2026-11-20).
 * 자료는 마이가 탱크 관심물건 목록 API 로 읽어 saleData/dayList/fav/tank 에 둔 것(agentRemote.loadTankFav). */
import type { TankFav } from './agentRemote';

export const FAV_STATUS = ['진행', '예정', '매각', '종국', '진행외'] as const;
export const FAV_PY = 3.305785;

/** '인천광역시 서구 검암동 638-1 …' → ['인천', '서구', '검암동'] (시도는 탱크 고르는 칸처럼 짧게) */
const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
  세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원', 강원도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라북도: '전북',
  전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};
export const favPlace = (f: Pick<TankFav, 'regn' | 'addr'>): { sido: string; sgg: string; emd: string } => {
  const a = (f.regn || f.addr).replace(/\s+/g, ' ').trim();
  const t = a.split(' ');
  const sido = SIDO_SHORT[t[0]] ?? t[0] ?? '';
  // 시군구 — '수원시 권선구'처럼 둘일 수 있다. 읍면동(…동 · 가 · 읍 · 면 · 리) 앞까지
  const ei = t.findIndex((w, i) => i > 0 && /(동|가|읍|면|리)$/.test(w) && /\d/.test(t[i + 1] ?? ''));
  const sgg = ei > 1 ? t.slice(1, ei).join(' ') : t[1] ?? '';
  const emd = ei > 0 ? t[ei] : '';
  return { sido, sgg, emd };
};

export type FavFilter = { cat: string; status: string; kind: string; sido: string; sgg: string; emd: string; failFrom: number | null; failTo: number | null; pri: number };
export const FAV_FILTER0: FavFilter = { cat: '', status: '진행', kind: '', sido: '', sgg: '', emd: '', failFrom: null, failTo: null, pri: 0 };

/** 현황 탭을 뺀 거르기 — 탭 건수는 이걸로 센다 */
export const favPassNoStatus = (f: TankFav, q: FavFilter): boolean => {
  if (q.cat === '미분류' ? f.cat !== '미분류' && f.cat !== '' : q.cat && f.cat !== q.cat) return false;
  if (q.kind && f.kind !== q.kind) return false;
  if (q.sido || q.sgg || q.emd) { const p = favPlace(f); if ((q.sido && p.sido !== q.sido) || (q.sgg && p.sgg !== q.sgg) || (q.emd && p.emd !== q.emd)) return false; }
  if (q.failFrom != null && f.fails < q.failFrom) return false;
  if (q.failTo != null && f.fails > q.failTo) return false;
  if (q.pri && f.pri !== q.pri) return false;
  return true;
};
export const favPass = (f: TankFav, q: FavFilter): boolean => (!q.status || f.status === q.status) && favPassNoStatus(f, q);

/** 현황 탭 건수 — 다른 거르기는 그대로 둔 채 */
export const favStatusCounts = (items: TankFav[], q: FavFilter): Record<string, number> => {
  const c: Record<string, number> = { '': 0 }; FAV_STATUS.forEach((s) => { c[s] = 0; });
  items.forEach((f) => { if (!favPassNoStatus(f, q)) return; c[''] += 1; c[f.status] = (c[f.status] ?? 0) + 1; });
  return c;
};

export type FavSort = 'case' | 'hot' | 'date' | 'appr' | 'min' | 'pri';
/** 정렬 — hot(가격매력)은 비슷한 물건 대비 %가 낮은 순, 값이 없으면 뒤로 */
export const favSort = <T extends TankFav>(rows: T[], by: FavSort, vsOf: (f: T) => number | null): T[] => {
  const k = (f: T): number | string => {
    if (by === 'case') return f.key;
    if (by === 'hot') return vsOf(f) ?? 9;
    if (by === 'date') return f.date || '9999';
    if (by === 'appr') return -f.appr;
    if (by === 'min') return -f.min;
    return -f.pri;
  };
  return [...rows].sort((a, b) => { const x = k(a); const y = k(b); return x < y ? -1 : x > y ? 1 : 0; });
};

/** '2025-1788(2)' → '2025타경1788' · 물건번호 2 */
export const favCaseNo = (key: string): { caseNo: string; pn: string } => {
  const m = key.match(/^(\d{4})-(\d+)(?:\((\d+)\))?$/);
  return m ? { caseNo: `${m[1]}타경${m[2]}`, pn: m[3] ?? '' } : { caseNo: key, pn: '' };
};
/** 탱크 법원 '인천-본원' → '인천지방법원', '인천-부천' → '인천지방법원 부천지원' */
export const favCourtName = (court: string): string => {
  const [a, b] = court.split('-');
  if (!a) return '';
  const base = a === '서울' && b ? `서울${b}지방법원` : `${a}지방법원`;
  if (!b || b === '본원' || a === '서울') return base;
  return `${base} ${b}지원`;
};
/** 신건 · 유찰 n회 — 최저가 ÷ 감정가 % */
export const favRound = (f: Pick<TankFav, 'fails' | 'min' | 'appr'>): { label: string; pct: string } => ({
  label: f.fails > 0 ? `유찰 ${f.fails}회` : '신건',
  pct: f.appr > 0 && f.min > 0 ? `${Math.round((f.min / f.appr) * 100)}%` : '',
});
