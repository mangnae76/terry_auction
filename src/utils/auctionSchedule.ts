import type { AuctionHistoryRow } from '../types/auction';

const FUTURE_ROUND_RESULTS = ['예정', '연기'];

/**
 * 기일내역에서 '이번에 열리는 회차'를 고른다.
 * 감정가·최저가 라벨이 PDF에서 값과 떨어져 추출될 때 최저매각가격·보증금을 되살리는 기준이 된다.
 *  1) '예정'으로 표시된 뒤쪽 회차를 빼고 남은 마지막 행 (예: 1차 "" / 2~4차 예정 → 1차)
 *  2) 결과 칸이 통째로 비어 있으면 매각기일과 같은 행, 없으면 매각기일 이후 첫 행
 *     (결과를 못 읽던 구 파서로 임포트한 데이터 대비)
 */
export const pickCurrentRound = (rows: AuctionHistoryRow[], eventDate = '') => {
  if (rows.length === 0) return undefined;

  const opened = rows.filter((row) => !FUTURE_ROUND_RESULTS.includes(row.result));
  if (opened.length > 0 && opened.length < rows.length) {
    return opened[opened.length - 1];
  }

  if (eventDate) {
    const exact = rows.find((row) => row.date === eventDate);
    if (exact) return exact;
    const upcoming = rows.find((row) => row.date >= eventDate);
    if (upcoming) return upcoming;
  }

  return rows[rows.length - 1];
};
