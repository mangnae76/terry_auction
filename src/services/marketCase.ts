// 시장분석 ↔ 물건 — 손품조사에서 '시장분석으로 조사하기'로 들고 넘어온 사건, 시장분석에서 고른 값, '이 물건에 적용'.
// 자료는 시장분석 → 물건 한 방향으로만 흐른다. 시장분석 화면은 여기만 보고, 물건 쪽 저장 형식은 applyToAuction 한 곳만 안다.
import { reactive, ref, watch } from 'vue';
import type { AuctionDetail } from '../types/auction';
import { updateStamp } from './updateStamp';

export type MarketKind = 'villa' | 'apt' | 'officetel';

/** 들고 넘어온 사건 — 사건 카드에 보이는 것 */
export type MarketCase = {
  auctionId: string;
  caseNo: string;
  address: string;
  kind: MarketKind;
  typeLabel: string;
  areaM2: number;
  appraisal: number;
  minBid: number;
  bidDate: string;
  photo: string;
  /** 넘어오기 전에 보던 물건 탭 — '물건으로 돌아가기'가 그리로 */
  backTab: string;
};

const KEY = 'mkt.case';
const read = (): MarketCase | null => {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as MarketCase : null; } catch { return null; }
};
/** 지금 들고 있는 사건 — 새로고침해도 남는다(닫기를 누르면 사라진다) */
export const marketCase = ref<MarketCase | null>(read());
watch(marketCase, (v) => {
  try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* 그만 */ }
});

/** 물건 종류 글 → 시장분석 종류 */
export const marketKindOf = (propertyType: string): MarketKind => {
  const t = (propertyType ?? '').replace(/\s/g, '');
  if (/아파트/.test(t)) return 'apt';
  if (/오피스텔/.test(t)) return 'officetel';
  return 'villa';
};

/** 물건 → 사건 카드 */
export const caseOf = (a: AuctionDetail, backTab = 'survey'): MarketCase => ({
  auctionId: a.id,
  caseNo: a.caseNumber || a.id,
  address: a.address || a.roadAddress || '',
  kind: marketKindOf(a.propertyType),
  typeLabel: a.propertyType || '',
  areaM2: Number(a.buildingAreaM2) || 0,
  appraisal: Number(a.metrics?.appraisalValue) || 0,
  minBid: Number(a.metrics?.minimumBidValue) || 0,
  bidDate: a.eventDate || '',
  photo: a.exteriorUrls?.[0] ?? '',
  backTab,
});

/** 경매지번 탭에서 고른 거래 — 사건 카드의 '이 물건에 적용'이 가져간다 */
export type MarketTrade = { price: number; date: string; floor: string; areaM2: number };
export const marketPick = reactive<{ sale: MarketTrade | null; jeonse: MarketTrade | null; address: string }>({
  sale: null, jeonse: null, address: '',
});

/** 적용 미리보기 한 줄 */
export type ApplyRow = { key: string; label: string; before: string; after: string; manual: boolean };
/** 시장분석에서 모은 값 */
export type MarketValues = { listings?: number; sale?: MarketTrade | null; jeonse?: MarketTrade | null };

const won = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '');
const day = (d: string) => d.slice(0, 10).replace(/\./g, '-');

/** 바뀔 값 — 지금 물건에 든 값과 견준다. 같은 값은 빼고, 사람이 넣은 값이 있으면 manual 로 알린다 */
export const applyPreview = (a: AuctionDetail, v: MarketValues): ApplyRow[] => {
  const fv: Record<string, string> = a.surveyForm?.fieldValues ?? {};
  const mv: Record<string, string> = a.surveyForm?.mktValues ?? {};
  const out: ApplyRow[] = [];
  if (v.listings && v.listings > 0) {
    const before = String(fv['fs.dm.listings'] ?? '').replace(/[^\d]/g, '');
    if (before !== String(v.listings)) out.push({ key: 'listings', label: '수요조사 · 총 매물수', before: won(Number(before)), after: won(v.listings), manual: !!before });
  }
  if (v.sale && v.sale.price > 0) {
    const before = String(mv['mkt.d.real'] ?? '');
    if (before !== String(v.sale.price)) out.push({ key: 'sale', label: '시세조사 · 매매 실거래가', before: won(Number(before)), after: `${won(v.sale.price)} (${day(v.sale.date)}${v.sale.floor ? ` · ${v.sale.floor}층` : ''})`, manual: !!mv['mkt.d.year'] });
  }
  if (v.jeonse && v.jeonse.price > 0) {
    const before = String(mv['mkt.d.jReal'] ?? '');
    if (before !== String(v.jeonse.price)) out.push({ key: 'jeonse', label: '시세조사 · 전세 실거래가', before: won(Number(before)), after: `${won(v.jeonse.price)} (${day(v.jeonse.date)}${v.jeonse.floor ? ` · ${v.jeonse.floor}층` : ''})`, manual: !!mv['mkt.d.jYear'] });
  }
  return out;
};

/** 고른 줄만 물건에 넣는다(물건 저장은 부르는 쪽이) — 손품조사 '경매물건' 칸에 들어가는 자리와 같다 */
export const applyToAuction = (a: AuctionDetail, v: MarketValues, keys: string[]) => {
  if (!a.surveyForm) return;   // 손품조사를 한 번도 연 적 없는 물건 — 부르는 쪽이 먼저 연다
  const sf = a.surveyForm;
  if (!sf.fieldValues) sf.fieldValues = {};
  if (!sf.mktValues) sf.mktValues = {};
  const fv = sf.fieldValues; const mv = sf.mktValues;
  if (keys.includes('listings') && v.listings) {
    fv['fs.dm.listings'] = String(v.listings);
    fv['fs.dm.listingsAt'] = updateStamp();
  }
  if (keys.includes('sale') && v.sale) {
    mv['mkt.d.mode'] = '경매물건';
    mv['mkt.d.real'] = String(Math.round(v.sale.price));
    mv['mkt.d.year'] = day(v.sale.date);
    mv['mkt.d.floor'] = v.sale.floor;
    // 평단가는 이 호실 면적으로 — 손품조사 '비행기 보내기'와 같은 셈
    const areaM2 = Number(mv['mkt.d.area']) || Number(a.buildingAreaM2) || v.sale.areaM2 || 0;
    const py = areaM2 > 0 ? Number((areaM2 / 3.305785).toFixed(2)) : 0;
    if (py > 0) mv['mkt.b.unit'] = String(Math.round(v.sale.price / py));
  }
  if (keys.includes('jeonse') && v.jeonse) {
    mv['mkt.d.mode'] = '경매물건';
    mv['mkt.d.jReal'] = String(Math.round(v.jeonse.price));
    mv['mkt.d.jYear'] = day(v.jeonse.date);
    mv['mkt.d.jFloor'] = v.jeonse.floor;
  }
  sf.marketAppliedAt = updateStamp();
};
