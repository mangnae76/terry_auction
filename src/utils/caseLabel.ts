// 화면에 보일 사건번호 — 같은 사건을 휴지통에서 되살려 둘이 된 물건은 옆에 '(1)' · '(2)'를 붙인다.
// 진짜 사건번호(caseNumber)는 그대로 둔다 — '2026타경503385(1)'처럼 붙여 적으면 경매에서는 '물건번호 1'이라는 뜻이라
// 법원 · 탱크옥션 검색이 다른 물건으로 알아듣는다. 그래서 띄어서 화면에만 붙인다.
import type { AuctionDetail } from '../types/auction';

export const caseLabelOf = (a: Pick<AuctionDetail, 'caseNumber'> & { dupNo?: number } | null | undefined): string =>
  (a ? `${a.caseNumber ?? ''}${a.dupNo ? ` (${a.dupNo})` : ''}` : '');
