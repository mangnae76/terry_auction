// 목록 값만으로 물건 만들기 — 물건등록 › 관심물건 · 매각분석 › 저가매수의 '사건등록하기'가 같이 쓴다(2026-11-20 사용자).
// PDF 등록 · 직접입력과 같은 저장 길(store.importParsedPdfAuctions)에 넣을 ParsedPdfAuction 한 건을 만든다. 화면 · DB 를 모르는 순수 함수.
import { parseAuctionPdfText, type ParsedPdfAuction } from './pdfAuctionImport';

export type CaseRegInput = {
  /** 출처 이름 — '탱크 관심물건' · '저가매수' */
  source: string;
  /** '2025타경1788' */
  caseNo: string;
  /** 물건번호 — 없으면 '' */
  pn: string;
  /** '인천지방법원' — 모르면 '' */
  court: string;
  kind: string;
  addr: string;
  road?: string;
  fails: number;
  /** 다음 매각기일 'YYYY-MM-DD' */
  date: string;
  appr: number;
  min: number;
  /** 전용(건물) ㎡ */
  bArea: number;
  /** 대지권 ㎡ — 모르면 비움 */
  lArea?: number;
  /** 물건 메모로 남길 글 — 없으면 '' */
  memo?: string;
};

/** 사건번호 글 — 물건번호가 있으면 '2025타경1788(2)' */
export const caseNumberOf = (c: Pick<CaseRegInput, 'caseNo' | 'pn'>) => (c.pn ? `${c.caseNo}(${c.pn})` : c.caseNo);

export const parsedFromCase = (c: CaseRegInput): ParsedPdfAuction => {
  const base = parseAuctionPdfText('', c.source);
  return {
    ...base,
    sourceName: c.source,
    caseNumber: caseNumberOf(c),
    courtName: c.court || base.courtName,
    propertyType: c.kind,
    address: c.addr,
    roadAddress: c.road ?? base.roadAddress,
    auctionRound: `${c.fails + 1}차`,   /* 차수 — 신건 1차 · 1회 유찰 2차(2026-11-21 사용자) */
    eventDate: c.date,
    appraisalValue: c.appr,
    minimumBidValue: c.min,
    depositValue: Math.round(c.min / 10),
    buildingAreaM2: c.bArea,
    landAreaM2: c.lArea ?? base.landAreaM2,
    notes: c.memo ?? '',
  };
};

/** 사건 열쇠 '2025-1788(2)' → '2025타경1788' · 물건번호 2(저가매수 · 공통 표가 쓴다, 예전 services/tankFav 에서 옮김) */
export const favCaseNo = (key: string): { caseNo: string; pn: string } => {
  const m = key.match(/^(\d{4})-(\d+)(?:\((\d+)\))?$/);
  return m ? { caseNo: `${m[1]}타경${m[2]}`, pn: m[3] ?? '' } : { caseNo: key, pn: '' };
};
/** 신건 · 유찰 n회 — 최저가 ÷ 감정가 % */
export const favRound = (f: { fails: number; min: number; appr: number }): { label: string; pct: string } => ({
  label: f.fails > 0 ? `유찰 ${f.fails}회` : '신건',
  pct: f.appr > 0 && f.min > 0 ? `${Math.round((f.min / f.appr) * 100)}%` : '',
});
