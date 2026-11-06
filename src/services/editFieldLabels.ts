// 최근 분석 · 최근 작성에 '무엇을 고쳤는지' — 저장할 때 바뀐 칸을 사람이 읽는 이름으로(2026-11-06).
// 웹만 켠다(enableEditDetail — 웹 startStores). 앱은 그대로 '내용수정'만 남긴다.
// 저장소(auctionStore)는 칸마다 sortedJson 글을 들고 있다 — 전 · 후 글을 받아 칸 이름을 낸다. 값(금액)은 남기지 않는다

let detailOn = false;
export const enableEditDetail = () => { detailOn = true; };
export const editDetailOn = () => detailOn;

/** 물건 맨 위 칸 → 이름. 안쪽까지 보는 칸(SUB)은 안쪽 이름을 쓴다 */
const TOP: Record<string, string> = {
  eventDate: '매각기일', courtName: '법원', courtDept: '담당계', courtPhone: '법원전화', caseNumber: '사건번호', propertyNumber: '물건번호',
  auctionKind: '경매종류', auctionRound: '회차', status: '단계', bidStatus: '입찰진행', priority: '중요도',
  wonDate: '낙찰일', sellDate: '매도일', balanceDueDate: '잔금기한', propertyType: '물건종류', address: '주소', roadAddress: '도로명주소',
  approvalDate: '사용승인일', buildingAreaPyeong: '전용면적', landAreaPyeong: '대지면적', commonAreaPyeong: '공용면적', structureType: '구조',
  appraisalCompany: '감정평가사', priceDate: '가격시점', preservationDate: '보존등기일', caseStartDate: '개시결정일', creditorName: '채권자',
  nearbyStation: '인근역', cancellationBaseDate: '말소기준일', distributionRequestDate: '배당요구종기', smallAmountBaseDate: '소액임차기준일',
  auctionHistory: '기일내역', floorInfo: '층정보', valuationWarning: '감정평가주의', surveyStatus: '현황조사', occupancyRows: '점유관계',
  officialPriceBand: '공시가격', officialPriceValue: '공시가격', officialPriceNote: '공시가격',
  ownerName: '소유자', debtorName: '채무자', ownerDebtorStatus: '소유자점유', takeoverContent: '인수사항', delinquentCharges: '체납관리비',
  mailStatus: '우편송달', occupancyStatus: '점유여부', oppositionStatus: '대항력',
  expectedSaleValue: '예상매도가', expectedSaleValue2: '입금가', expectedProfitRate: '예상수익률', confirmedPlan: '확정안',
  excelAnalysis: '시세분석', marketDemand: '손품조사', surveyForm: '임장체크', fieldCompare: '임장비교',
  sitePhotos: '현장사진', floorPlanUrl: '평면도', floorPlanUrls: '평면도', exteriorUrls: '외관사진', extraPhotos: '사진',
  rankPhotoUrls: '순위사진', tradePhotoUrls: '실거래사진', listPhotoUrls: '목록사진',
  saleClassification: '매각구분', progressNote: '진행메모', registryRows: '등기부', registryWarnings: '등기주의', relatedCaseRows: '관련사건',
  tenantOtherNotes: '임차인메모', tenantTotalDeposit: '보증금합계', tenantInfoRows: '임차인', buildingHeader: '건축물대장',
  rightsChecks: '권리체크', rightsDocUrls: '권리서류', rightsDocNotes: '서류메모', rightsAi: 'AI권리분석', rightsCaseId: '권리사례',
  basicSummary: '정보요약', pdfNearbyEnv: '주변환경', aptComplexInfo: '단지정보', arrearsInfo: '체납정보', locationSummary: '입지요약',
  realUserBandId: '실사용자', realUserRoomId: '실사용자', realUserRanks: '실사용자', realUserArea: '실사용자', realUserRooms: '실사용자',
  realUserDetail: '실사용자', realUserCondition: '실사용자', adminAgencyItems: '중개사무소',
  postWinChecks: '낙찰이후체크', postWinFlow: '진행절차', postWinDocs: '서류', postWinFormVals: '서식입력', postWinMoney: '낙찰이후비용',
  sellAgencyRows: '매도중개', directSellRows: '직거래', marketPicks: '시장분석', aiNotes: 'AI메모', aiSummary: 'AI요약',
};
/** 사람이 고친 게 아닌 칸 — 이름을 남기지 않는다 */
const SKIP = new Set(['(처음)', 'id', 'uid', 'editLog', 'hidden', 'archived', 'dupNo', 'isInterested', 'isFieldTrip', 'importMeta', 'sonView']);
const COST: Record<string, string> = {
  bidRate: '입찰가율', loanRate: '대출비율', loanAmount: '대출금', interestAmount: '대출이자',
  acquisitionTaxRate: '취득세', acquisitionTaxAmount: '취득세', legalCostRate: '법무비', legalCostAmount: '법무비',
  midRepaymentRate: '중도상환수수료', midRepaymentAmount: '중도상환수수료', brokerageRate: '중개수수료', brokerageAmount: '중개수수료',
  arrearsFee: '미납관리비', repairCost: '수리비', evictionCost: '명도비', salePrice: '매도가', advertisingCost: '광고비',
  incomeTaxRate: '양도세', incomeTaxRateManual: '양도세', incomeTaxDeduct: '양도세', incomeTaxAmount: '양도세',
  localTaxRate: '지방세', localTaxAmount: '지방세', note: '비용메모',
};
const SUB: Record<string, Record<string, string>> = {
  metrics: { appraisalValue: '감정가', minimumBidValue: '최저가', myBidValue: '입찰가', bidRate: '입찰가율', depositValue: '입찰보증금' },
  bidCost: COST,
  fieldSurvey: {
    occupantNote: '점유자메모', rentalIssue: '임대문제', keyIssue: '핵심문제', arrearsMaintenance: '체납관리비', arrearsUtilities: '체납관리비',
    totalArrears: '체납관리비', surveyMemo: '임장메모', checklist: '임장체크',
  },
  rights: { baseDate: '말소기준일', totalClaimAmount: '청구금액', items: '권리목록', checklist: '권리체크' },
};
const PLAN = { myBidValue: '입찰가', expectedSaleValue: '예상매도가', expectedSaleValue2: '입금가' } as Record<string, string>;

const parse = (s: string | undefined): unknown => { try { return JSON.parse(s ?? 'null'); } catch { return null; } };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
/** 두 묶음에서 값이 다른 안쪽 칸 */
const diffKeys = (a: unknown, b: unknown): string[] => {
  const x = obj(a); const y = obj(b);
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k] ?? null) !== JSON.stringify(y[k] ?? null));
};

/** 바뀐 칸들 → 이름(겹치면 하나). was · now 는 칸마다 sortedJson 글 */
export const changedLabels = (keys: string[], was: Record<string, string>, now: Record<string, string>): string[] => {
  const out: string[] = [];
  const add = (t: string) => { if (t && !out.includes(t)) out.push(t); };
  keys.filter((k) => !SKIP.has(k)).forEach((k) => {
    const sub = SUB[k];
    if (sub) { diffKeys(parse(was[k]), parse(now[k])).forEach((s) => add(sub[s] ?? TOP[k] ?? '')); return; }
    if (k === 'bidScenarios') {   // 수익분석 B~D안 — 'B안 입찰가' · 'C안 취득세'
      const a = parse(was[k]); const b = parse(now[k]);
      const la = Array.isArray(a) ? a : []; const lb = Array.isArray(b) ? b : [];
      for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
        const p = `${'BCDEFG'[i] ?? ''}안`;
        diffKeys(la[i], lb[i]).forEach((s) => {
          if (s === 'bidCost') diffKeys(obj(la[i]).bidCost, obj(lb[i]).bidCost).forEach((c) => add(`${p} ${COST[c] ?? '비용'}`));
          else add(`${p} ${PLAN[s] ?? '내용'}`);
        });
      }
      return;
    }
    add(TOP[k] ?? '그 밖의 내용');
  });
  return out;
};

/** 이름 목록 → 한 줄 글 — 셋까지, 넘으면 '외 N개' */
export const labelsText = (items: string[]): string => (items.length > 3 ? `${items.slice(0, 3).join(' · ')} 외 ${items.length - 3}개` : items.join(' · '));
