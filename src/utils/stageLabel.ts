// 단계 이름표 — 한 물건이 지금 어느 자리에 있나.
// 선정물건 카드·휴지통·보관함·임장경로가 같은 말을 쓰도록 여기 한곳에 둔다.
// (전에는 화면마다 베껴 적어 두어, 결과가 난 물건이 보관함에서는 '입찰산정'으로 보였다)
import { AUCTION_STATUS_LABELS, type AuctionDetail } from '../types/auction';

/** 입찰 뒤의 상태 — 단계(status)는 '입찰'에 머물고 이 칸에 적힌다.
 *  '대기'는 두지 않는다. 입찰산정에서 더 나아가지 않은 것이 곧 대기다. */
export const BID_STAGE_LABELS: Record<string, string> = {
  진행: '입찰진행',
  낙찰: '낙찰',
  매도: '매도',
  유찰: '유찰',
  취소: '취소',
};
/** 결과가 난 자리 — 더 손댈 일이 없다 */
export const BID_RESULTS = ['낙찰', '유찰', '취소', '매도'];

/** 적어 둔 입찰상태 ('입찰진행' 처럼 앞에 '입찰'이 붙어 온 옛 값도 받는다) */
export const bidStageOf = (item: AuctionDetail): string => {
  if (item.status !== '입찰') return '';
  const raw = (item.bidStatus ?? '').replace(/^입찰/, '');
  return raw && BID_STAGE_LABELS[raw] ? raw : '';
};

/** 결과(낙찰·유찰·취소·매도)가 난 물건인가 */
export const hasBidResult = (item: AuctionDetail): boolean => BID_RESULTS.includes(bidStageOf(item));

/** 화면에 적을 단계 이름 — '손품조사' · '입찰산정' · '낙찰' … */
export const stageLabelOf = (item: AuctionDetail): string => {
  const bid = bidStageOf(item);
  if (bid) return BID_STAGE_LABELS[bid];
  return AUCTION_STATUS_LABELS[item.status] ?? String(item.status);
};

/** 태그 색 이름 — 화면마다 제 CSS 에 이 이름으로 색을 적어 둔다 */
export const stageToneOf = (item: AuctionDetail): string => {
  const bid = bidStageOf(item);
  if (bid === '진행') return 'bidding';
  if (bid === '낙찰' || bid === '매도') return 'done';
  if (bid === '유찰' || bid === '취소') return 'closed';
  if (item.status === '손품') return 'desk';
  if (item.status === '임장예정') return 'plan';
  if (item.status === '임장완료') return 'visited';
  if (item.status === '입찰') return 'bid';
  return 'etc';
};
