import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { searchAuctionsFromPublicData } from '../services/publicDataApi';
import type { ApiSourceError, ApiSourceStatus } from '../services/publicDataApi';
import type { ParsedPdfAuction } from '../services/pdfAuctionImport';
import type { AuctionDetail, AuctionSearchParams, AuctionStatus, AuctionSummary, NearBidRow, RealTradeRow } from '../types/auction';
import {
  getFirestoreWarning,
  isFirestoreAvailable,
  subscribeAuctionList,
  upsertAuction,
  upsertAuctionBatch,
} from '../services/auctionRepository';
import { useAuthStore } from './authStore';

const createNearBidRow = (): NearBidRow => ({
  saleInfo: '',
  appraisal: '',
  minimum: '',
  winning: '',
  rate: '',
  expectedWinning: '',
});

const isMeaningfulNearBidRow = (row: NearBidRow) =>
  [row.saleInfo, row.appraisal, row.minimum, row.winning, row.rate, row.expectedWinning].some((value) => value.trim().length > 0);

const serializeNearBidRows = (rows: NearBidRow[]) => {
  const meaningfulRows = rows.filter(isMeaningfulNearBidRow);
  return {
    nearBidSaleInfo: meaningfulRows.map((row) => row.saleInfo).join('\n'),
    nearBidAppraisal: meaningfulRows.map((row) => row.appraisal).join('\n'),
    nearBidMinimum: meaningfulRows.map((row) => row.minimum).join('\n'),
    nearBidWinning: meaningfulRows.map((row) => row.winning).join('\n'),
    nearBidRate: meaningfulRows.map((row) => row.rate).join('\n'),
    nearBidExpectedWinning: meaningfulRows.map((row) => row.expectedWinning).join('\n'),
  };
};

const createRealTradeRow = (): RealTradeRow => ({
  type: '매매',
  contractDate: '',
  price: '',
  area: '',
  floor: '',
});

const isMeaningfulRealTradeRow = (row: RealTradeRow) =>
  [row.contractDate, row.price, row.area, row.floor].some((value) => value.trim().length > 0) ||
  (row.type.trim().length > 0 && row.type.trim() !== '매매');

const serializeRealTradeRows = (rows: RealTradeRow[]) => {
  const meaningfulRows = rows.filter(isMeaningfulRealTradeRow);
  const latestRow = meaningfulRows[0];
  const pastRow = meaningfulRows[1];
  return {
    latestTradeNote: latestRow ? `${latestRow.type}${latestRow.floor ? ` / ${latestRow.floor}층` : ''}` : '없음',
    latestTradeArea: latestRow?.area ?? '',
    latestTradePrice: latestRow?.price ?? '',
    latestTradeJeonse: '',
    latestTradeComparedPrice: '0',
    latestTradeRatio: '',
    pastTradeInfo: pastRow ? `${pastRow.type}${pastRow.floor ? ` / ${pastRow.floor}층` : ''}` : '',
    pastTradeCommonPrice: pastRow?.price ?? '',
    pastTradeJeonse: '',
    pastTradeRatio: '',
  };
};

const normalizeRealTradeRows = (excelAnalysis?: Partial<AuctionDetail['excelAnalysis']> | null): RealTradeRow[] => {
  const rawRows = Array.isArray(excelAnalysis?.realTradeRows) ? excelAnalysis.realTradeRows : [];
  const normalizedRows = rawRows
    .map((row) => ({
      type: row?.type?.trim?.() || '매매',
      contractDate: row?.contractDate?.trim?.() ?? '',
      price: row?.price?.trim?.() ?? '',
      area: row?.area?.trim?.() ?? '',
      floor: row?.floor?.trim?.() ?? '',
    }))
    .filter(isMeaningfulRealTradeRow);

  if (normalizedRows.length > 0) {
    return normalizedRows;
  }

  const legacyRows: RealTradeRow[] = [];
  const latestInfo = typeof excelAnalysis?.latestTradeNote === 'string' ? excelAnalysis.latestTradeNote.trim() : '';
  const latestArea = typeof excelAnalysis?.latestTradeArea === 'string' ? excelAnalysis.latestTradeArea.trim() : '';
  const latestPrice = typeof excelAnalysis?.latestTradePrice === 'string' ? excelAnalysis.latestTradePrice.trim() : '';
  if ((latestInfo && latestInfo !== '없음') || latestArea || latestPrice) {
    legacyRows.push({
      type: latestInfo.startsWith('매매') ? '매매' : latestInfo || '매매',
      contractDate: '',
      price: latestPrice,
      area: latestArea,
      floor: latestInfo.match(/(\d+)층/)?.[1] ?? '',
    });
  }

  const pastInfo = typeof excelAnalysis?.pastTradeInfo === 'string' ? excelAnalysis.pastTradeInfo.trim() : '';
  const pastPrice = typeof excelAnalysis?.pastTradeCommonPrice === 'string' ? excelAnalysis.pastTradeCommonPrice.trim() : '';
  if (pastInfo || pastPrice) {
    legacyRows.push({
      type: pastInfo.startsWith('매매') ? '매매' : pastInfo || '매매',
      contractDate: '',
      price: pastPrice,
      area: '',
      floor: pastInfo.match(/(\d+)층/)?.[1] ?? '',
    });
  }

  return legacyRows.length > 0 ? legacyRows : [createRealTradeRow()];
};

const splitLegacyNearBidField = (value: unknown) =>
  typeof value === 'string'
    ? value
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const normalizeNearBidRows = (excelAnalysis?: Partial<AuctionDetail['excelAnalysis']> | null): NearBidRow[] => {
  const rawRows = Array.isArray(excelAnalysis?.nearBidRows) ? excelAnalysis.nearBidRows : [];
  const normalizedRows = rawRows
    .map((row) => ({
      saleInfo: row?.saleInfo?.trim?.() ?? '',
      appraisal: row?.appraisal?.trim?.() ?? '',
      minimum: row?.minimum?.trim?.() ?? '',
      winning: row?.winning?.trim?.() ?? '',
      rate: row?.rate?.trim?.() ?? '',
      expectedWinning: row?.expectedWinning?.trim?.() ?? '',
    }))
    .filter(isMeaningfulNearBidRow);

  if (normalizedRows.length > 0) {
    return normalizedRows;
  }

  const saleInfos = splitLegacyNearBidField(excelAnalysis?.nearBidSaleInfo);
  const appraisals = splitLegacyNearBidField(excelAnalysis?.nearBidAppraisal);
  const minimums = splitLegacyNearBidField(excelAnalysis?.nearBidMinimum);
  const winnings = splitLegacyNearBidField(excelAnalysis?.nearBidWinning);
  const rates = splitLegacyNearBidField(excelAnalysis?.nearBidRate);
  const expectedWinnings = splitLegacyNearBidField(excelAnalysis?.nearBidExpectedWinning);
  const rowCount = Math.max(
    saleInfos.length,
    appraisals.length,
    minimums.length,
    winnings.length,
    rates.length,
    expectedWinnings.length,
  );

  if (rowCount === 0) {
    return [createNearBidRow()];
  }

  return Array.from({ length: rowCount }, (_, index) => ({
    saleInfo: saleInfos[index] ?? '',
    appraisal: appraisals[index] ?? '',
    minimum: minimums[index] ?? '',
    winning: winnings[index] ?? '',
    rate: rates[index] ?? '',
    expectedWinning: expectedWinnings[index] ?? '',
  }));
};

const defaultExcelAnalysis = () => ({
  expectedAvgPrice: 0,
  bidPriceRatio: 70,
  loanRatio: 80,
  acquisitionTaxRate: 1.1,
  legalCostRate: 0.5,
  interestRate: 4.5,
  transferTaxRate: 15,
  brokerageRate: 0.4,
  repairCost: 0,
  evictionCost: 0,
  nearestSubway: '',
  subwayDistanceM: 0,
  schoolInfo: '',
  jobAccess: '',
  infraInfo: '',
  resaleDemand: '',
  saleStrategy: '',
  memo: '',
  marketYear: '2025Y',
  nearOfferSaleInfo: '',
  nearOfferExclusiveArea: '',
  nearOfferCommonPrice: '',
  nearOfferJeonsePrice: '',
  nearOfferNaverPrice: '',
  nearOfferRatio: '',
  nearOfferAvgPrice: '',
  nearOfferAvgJeonse: '',
  nearOfferAvgNaver: '',
  nearOfferAvgRatio: '',
  realTradeRows: [createRealTradeRow()],
  realTradeSaleInfo: '',
  realTradeArea: '',
  realTradeCommonPrice: '',
  realTradeJeonse: '',
  realTradeLocalAvg: '',
  realTradeRatio: '',
  latestTradeNote: '없음',
  latestTradeArea: '',
  latestTradePrice: '',
  latestTradeJeonse: '0',
  latestTradeComparison: '64.0%',
  latestTradeComparedPrice: '0',
  latestTradeRatio: '#DIV/0!',
  pastTradeInfo: '',
  pastTradeCommonPrice: '',
  pastTradeJeonse: '',
  pastTradeRatio: '0.0%',
  unitPrice: '0.00',
  unitPriceCommonPrice: '#DIV/0!',
  unitPriceJeonsePrice: '#DIV/0!',
  unitPriceNaverPrice: '#DIV/0!',
  unitPriceRatio: '#DIV/0!',
  nearBidRows: [createNearBidRow()],
  nearBidSaleInfo: '',
  nearBidAppraisal: '',
  nearBidMinimum: '',
  nearBidWinning: '',
  nearBidRate: '',
  nearBidExpectedWinning: '',
  regionMarket: '',
  regionBrokerName: '',
  regionContact: '',
  summaryText: '',
  summaryContact: '',
});

const defaultBidCost = () => ({
  bidRate: 70.01,
  loanRate: 80,
  acquisitionTaxRate: 1.1,
  legalCostRate: 0.5,
  midRepaymentRate: 1.0,
  interestRate3m: 4.5,
  brokerageRate: 0.4,
  arrearsFee: 0,
  repairCost: 0,
  evictionCost: 0,
  salePrice: 0,
  incomeTaxRate: 15,
  localTaxRate: 10,
  loanAmount: 0,
  acquisitionTaxAmount: 0,
  legalCostAmount: 0,
  interestAmount: 0,
  midRepaymentAmount: 0,
  brokerageAmount: 0,
  advertisingCost: 0,
});

const defaultMarketDemand = () => ({
  practicalArea: '전용12평',
  practicalFamilyType: '1.5룸~2룸',
  practicalPeople: '1인',
  practicalKeyword: '입지:직장,교통,인프라,공원',
  districtLocation: `경매 "단지"가 입지조건에 가까울 수록 선호도 높음`,
  complexLocation: `경매 "동"이 입지조건에 가까울 수록 선호도 높음`,
  schoolInfoA: '',
  schoolInfoB: '',
  schoolInfoC: '',
  transportInfo: '',
  jobInfo: '',
  infraInfo: '',
  layoutType: '',
  totalHouseholds: '',
  floorCurrent: '5F',
  floorTarget: '4F',
  corridorType: '계단식',
  parking: 'O',
  elevator: '없음',
  inspectionTarget: '평지',
  inspectionResult: '없음',
  maintenanceTarget: '',
  maintenanceResult: '',
  structureHeating: '복합',
  structureView: '입력',
  structureEntrance: '판상형',
  roomType: '',
  bathCount: '',
  roomCount: '',
  repairCondition: '',
  buildingInside: '',
  houseInside: '조사X',
  demandNote: '전세가격으로 등수결과 확인',
  tradeVolumeRate: '0.7%',
  tradeVolumeSupply: '307',
  tradeVolumeMonths: '거래량 월 3개',
  tradeVolumeNote: '지방이라도 이 기준 충족시 매매수요 있다',
  listingRate: '5%',
  listingSupply: '307',
  listingCurrent: '매물 25개 적체',
  listingNote: '세대수 대비 매물수 5% 초과시 많이 쌓인것',
  lowPriceAvgPyeong: '',
  lowPriceDecision: '',
  lowPriceTarget: '',
  lowPriceNote: '',
  marketSurveyNoTrade: '경쟁단지들 가치등수를 정하고 그 단지들의 최근 실거래로 경매단지평형 시세추정',
});

const defaultRightsChecklist = () => [
  {
    id: 'c1',
    label: '★배당요구 종기일확인',
    note: '대항력 임차인인 경우, 배당 종기일이 지난 후 배당요구 경우 있다.\n배당신청 및 날짜까지 확인 필요하다. 이 경우 낙찰자 인수 이다.',
    checked: false,
  },
  {
    id: 'c2',
    label: '★토지별도 등기확인',
    note: '토지만의 별도 등기가 있을 경우\n토지 별도등기자가 먼저 배당 받을 수 있음',
    checked: false,
  },
  {
    id: 'c3',
    label: '★임금채권 및 최선순위 배당 확인',
    note: '선순위 임차인 있을 경우, 임금채권등 최선 순위이기 때문에 선순위 임차인 낙찰자 인수 가능성 있음\n법인의 경우 임금채권 의심/근로복지공단(체당금)최우선 변제',
    checked: false,
  },
  {
    id: 'c4',
    label: '★당해세,금액,법정기일 확인',
    note: '법정기일 빠른 세금이 있는 경우 확인 필요\n확정일자 보다 법정기일이 빠를 경우 선순위 이다. (당해세)\n이 경우에는 매각 불허가 처리도 가능',
    checked: false,
  },
];

const normalizeStatus = (status: string): AuctionStatus => {
  if (status === '임장완료' || status === '임장') {
    return '임장완료';
  }
  if (status === '낙찰') {
    return '낙찰';
  }
  if (status === '입찰' || status === '유찰') {
    return '입찰';
  }
  if (status === '보류') {
    return '보류';
  }
  return '임장예정';
};

const normalizeRound = (round: string) => {
  if (round === '1차' || round === '신건') {
    return '신건';
  }
  if (round === '2차') {
    return '2차';
  }
  if (round === '3차') {
    return '3차';
  }
  return '신건';
};

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `auction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const defaultPdfFields = () => ({
  roadAddress: '',
  commonAreaM2: 0,
  commonAreaPyeong: 0,
  structureType: '',
  appraisalCompany: '',
  priceDate: '',
  preservationDate: '',
  caseStartDate: '',
  creditorName: '',
  nearbyStation: '',
  cancellationBaseDate: '',
  distributionRequestDate: '',
  smallAmountBaseDate: '',
  auctionHistory: [] as AuctionDetail['auctionHistory'],
});

const defaultBasicInfoOptions = () => ({
  auctionKind: '임의' as const,
  surveyStatus: '점유자관계미상',
  occupancyRows: [
    { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X' as const, depositAmount: '' },
    { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O' as const, depositAmount: '' },
    { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O' as const, depositAmount: '' },
  ],
  officialPriceBand: '1억 미만' as const,
  officialPriceValue: 0,
  ownerName: '',
  debtorName: '',
  ownerDebtorStatus: '알수없음' as const,
  takeoverContent: 'X' as const,
  delinquentCharges: '',
  mailStatus: '',
  occupancyStatus: '점유X' as const,
  oppositionStatus: '대항력X' as const,
});

const sampleAuctions: AuctionDetail[] = [
  {
    ...defaultPdfFields(),
    id: '2024-50551',
    eventDate: '2025-06-27',
    courtName: '인천지방법원',
    caseNumber: '2024타경50551',
    propertyNumber: '',
    auctionKind: '임의',
    auctionRound: '2차',
    status: '입찰',
    isInterested: false,
    isFieldTrip: false,
    propertyType: '빌라',
    address: '인천 서구 검암동 502-3 뉴월드빌5차 2층 203호',
    approvalDate: '2009-03-15',
    buildingAreaM2: 44.5,
    buildingAreaPyeong: 13.5,
    landAreaM2: 28.3,
    landAreaPyeong: 8.6,
    floorInfo: '2차 매각',
    valuationWarning: '임차인 대항력 여부 반드시 확인 필요',
    surveyStatus: '점유자관계미상',
    occupancyRows: [
      { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
      { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
      { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    ],
    officialPriceBand: '1억 미만',
    officialPriceValue: 0,
    ownerName: '',
    debtorName: '',
    ownerDebtorStatus: '알수없음',
    takeoverContent: 'X',
    delinquentCharges: '',
    mailStatus: '',
    occupancyStatus: '점유X',
    oppositionStatus: '대항력X',
    metrics: {
      appraisalValue: 168000000,
      minimumBidValue: 117600000,
      myBidValue: 120000000,
      bidRate: 71.3,
    },
    expectedSaleValue: 122200000,
    expectedProfitRate: 72.6,
    fieldSurvey: {
      occupantNote: '공시가 1억 미만, 취득세 중과 제외. 공동현관 비밀번호 불명.',
      rentalIssue: '미문부재',
      keyIssue: '미확인',
      arrearsMaintenance: 3200000,
      arrearsUtilities: 850000,
      totalArrears: 4050000,
      surveyMemo: '현장 방문 시 채권 확인 필요',
      checklist: [
        { id: 's1', label: '외관/동선 체크', checked: true },
        { id: 's2', label: '점유/명도 체크', checked: false },
      ],
    },
    rights: {
      baseDate: '2025-03-05',
      totalClaimAmount: 155700000,
      items: [
        { id: 'r1', type: '근저당', creditor: '국민은행', amount: 140000000, registeredAt: '2018-06-20', cleared: true },
        { id: 'r2', type: '가압류', creditor: 'OO캐피탈', amount: 12500000, registeredAt: '2023-11-03', cleared: true },
        { id: 'r3', type: '압류', creditor: '부평구청', amount: 3200000, registeredAt: '2024-04-18', cleared: true },
      ],
      checklist: [
        { id: 'c1', label: '★ 배당요구 종기일 확인', note: '해당일자 이상 없음 확인', checked: true },
        { id: 'c2', label: '★ 토지 별도등기 확인', note: '별도등기 없음', checked: true },
        { id: 'c3', label: '★ 임금채권 / 최선순위 배당 확인', note: '법인 아님, 임금채권 해당 없음', checked: true },
        { id: 'c4', label: '★ 당해세 / 금액 / 법정기일 확인', note: '당해세 인수 위험 없음 확인', checked: true },
      ],
    },
    excelAnalysis: defaultExcelAnalysis(),
    bidCost: defaultBidCost(),
    marketDemand: defaultMarketDemand(),
  },
  {
    ...defaultPdfFields(),
    id: '2024-53394',
    eventDate: '2025-06-27',
    courtName: '인천지방법원',
    caseNumber: '2024타경53394',
    propertyNumber: '',
    auctionKind: '임의',
    auctionRound: '3차',
    status: '보류',
    isInterested: false,
    isFieldTrip: false,
    propertyType: '주택',
    address: '인천 미추홀구 주안동 395-13 3층 302호',
    approvalDate: '2010-03-12',
    buildingAreaM2: 48.8,
    buildingAreaPyeong: 14.8,
    landAreaM2: 22.5,
    landAreaPyeong: 6.8,
    floorInfo: '3차 매각',
    valuationWarning: '',
    surveyStatus: '점유자관계미상',
    occupancyRows: [
      { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
      { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
      { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    ],
    officialPriceBand: '1억 미만',
    officialPriceValue: 0,
    ownerName: '',
    debtorName: '',
    ownerDebtorStatus: '알수없음',
    takeoverContent: 'X',
    delinquentCharges: '',
    mailStatus: '',
    occupancyStatus: '점유X',
    oppositionStatus: '대항력X',
    metrics: {
      appraisalValue: 88000000,
      minimumBidValue: 43120000,
      myBidValue: 44900000,
      bidRate: 51,
    },
    expectedSaleValue: 61000000,
    expectedProfitRate: 69.3,
    fieldSurvey: {
      occupantNote: '',
      rentalIssue: '',
      keyIssue: '',
      arrearsMaintenance: 0,
      arrearsUtilities: 0,
      totalArrears: 0,
      surveyMemo: '',
      checklist: [
        { id: 's1', label: '외관/동선 체크', checked: false },
        { id: 's2', label: '점유/명도 체크', checked: false },
      ],
    },
    rights: { baseDate: '', totalClaimAmount: 0, items: [], checklist: defaultRightsChecklist() },
    excelAnalysis: defaultExcelAnalysis(),
    bidCost: defaultBidCost(),
    marketDemand: defaultMarketDemand(),
  },
];

const createDraftAuction = (): AuctionDetail => ({
  id: createId(),
  eventDate: new Date().toISOString().slice(0, 10),
  courtName: '',
  caseNumber: '',
  propertyNumber: '',
  auctionKind: '임의',
  auctionRound: '신건',
  status: '임장예정',
  isInterested: true,
  isFieldTrip: false,
  propertyType: '빌라',
  address: '',
  roadAddress: '',
  approvalDate: '',
  buildingAreaM2: 0,
  buildingAreaPyeong: 0,
  landAreaM2: 0,
  landAreaPyeong: 0,
  commonAreaM2: 0,
  commonAreaPyeong: 0,
  structureType: '',
  appraisalCompany: '',
  priceDate: '',
  preservationDate: '',
  caseStartDate: '',
  creditorName: '',
  nearbyStation: '',
  cancellationBaseDate: '',
  distributionRequestDate: '',
  smallAmountBaseDate: '',
  auctionHistory: [],
  floorInfo: '',
  valuationWarning: '',
  surveyStatus: '점유자관계미상',
  occupancyRows: [
    { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
    { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
  ],
  officialPriceBand: '1억 미만',
  officialPriceValue: 0,
  ownerName: '',
  debtorName: '',
  ownerDebtorStatus: '알수없음',
  takeoverContent: 'X',
  delinquentCharges: '',
  mailStatus: '',
  occupancyStatus: '점유X',
  oppositionStatus: '대항력X',
  metrics: {
    appraisalValue: 0,
    minimumBidValue: 0,
    myBidValue: 0,
    bidRate: 0,
  },
  expectedSaleValue: 0,
  expectedProfitRate: 0,
  fieldSurvey: {
    occupantNote: '',
    rentalIssue: '',
    keyIssue: '',
    arrearsMaintenance: 0,
    arrearsUtilities: 0,
    totalArrears: 0,
    surveyMemo: '',
    checklist: [
      { id: 's1', label: '외관/동선 체크', checked: false },
      { id: 's2', label: '점유/명도 체크', checked: false },
    ],
  },
  rights: {
    baseDate: '',
    totalClaimAmount: 0,
    items: [],
    checklist: defaultRightsChecklist(),
  },
  excelAnalysis: defaultExcelAnalysis(),
  bidCost: defaultBidCost(),
  marketDemand: defaultMarketDemand(),
  importMeta: {
    source: 'manual',
    pdfFieldKeys: [],
  },
  sitePhotos: [],
  floorPlanUrl: '',
  saleClassification: '',
  progressNote: '',
  registryRows: [],
  registryWarnings: '',
  relatedCaseRows: [],
  tenantOtherNotes: '',
  tenantTotalDeposit: '',
  tenantInfoRows: [],
  adminAgencyItems: [],
  buildingHeader: {
    locationDetail: '',
    households: '',
    landAreaTotal: '',
    buildingCoverage: '',
    permitDate: '',
    buildingAreaTotal: '',
    floorAreaRatio: '',
    startDate: '',
    totalFloorArea: '',
    mainUse: '',
    approvalDate: '',
    parking: '',
    floors: '',
    elevator: '',
    exclusiveFloorRows: [],
    unitLocation: '',
    unitExclusiveArea: '',
    unitCommonArea: '',
    unitFloor: '',
    unitStructure: '',
    unitTotalParking: '',
    unitHouseholds: '',
  },
});

const cloneAuction = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const useAuctionStore = defineStore('auction', () => {
  // allAuctions = Firestore 원본(숨긴 것 포함). auctions = 화면에 보여줄 목록.
  // 삭제는 DB에서 지우지 않고 hidden 플래그만 세우므로, 모든 화면이 쓰는 이 한 곳에서 걸러낸다.
  const allAuctions = ref<AuctionDetail[]>([...sampleAuctions]);
  const auctions = computed(() => allAuctions.value.filter((item) => !item.hidden));
  const hiddenCount = computed(() => allAuctions.value.filter((item) => item.hidden).length);
  const activeStatus = ref<AuctionStatus | '전체'>('전체');
  const searchKeyword = ref('');
  const selectedCourt = ref('전체');
  const selectedRegion = ref('전체');
  const selectedBidDate = ref('');
  const sortMode = ref<'latest' | 'court' | 'region'>('latest');
  const loading = ref(false);
  const apiWarning = ref('');
  const lastSources = ref<string[]>([]);
  const apiSourceErrors = ref<ApiSourceError[]>([]);
  const apiSourceStatuses = ref<ApiSourceStatus[]>([]);
  const storageWarning = ref('');
  const syncReady = ref(false);
  let unsubscribeRealtime: (() => void) | null = null;

  const courtOptions = computed(() => ['전체', ...new Set(auctions.value.map((item) => item.courtName))]);
  const regionOptions = computed(() => [
    '전체',
    ...new Set(
      auctions.value.map((item) => {
        const parts = item.address.trim().split(/\s+/);
        return parts.slice(0, Math.min(2, parts.length)).join(' ');
      }),
    ),
  ]);

  const filteredAuctions = computed(() =>
    auctions.value
      .filter((item) => {
        const statusMatched = activeStatus.value === '전체' || item.status === activeStatus.value;
        const courtMatched = selectedCourt.value === '전체' || item.courtName === selectedCourt.value;
        const itemRegion = item.address.trim().split(/\s+/).slice(0, 2).join(' ');
        const regionMatched = selectedRegion.value === '전체' || itemRegion === selectedRegion.value;
        const bidDateMatched = selectedBidDate.value.length === 0 || item.eventDate === selectedBidDate.value;
        const keyword = searchKeyword.value.trim().toLowerCase();
        const keywordMatched =
          keyword.length === 0 ||
          item.address.toLowerCase().includes(keyword) ||
          item.caseNumber.toLowerCase().includes(keyword) ||
          item.eventDate.includes(keyword);
        return statusMatched && courtMatched && regionMatched && bidDateMatched && keywordMatched;
      })
      .sort((a, b) => {
        if (sortMode.value === 'court') {
          return a.courtName.localeCompare(b.courtName, 'ko');
        }
        if (sortMode.value === 'region') {
          const regionA = a.address.trim().split(/\s+/).slice(0, 2).join(' ');
          const regionB = b.address.trim().split(/\s+/).slice(0, 2).join(' ');
          return regionA.localeCompare(regionB, 'ko');
        }
        return b.eventDate.localeCompare(a.eventDate);
      }),
  );

  const summary = computed<AuctionSummary>(() => {
    const totalBidAmount = auctions.value.reduce((sum, auction) => sum + auction.metrics.myBidValue, 0);
    return {
      totalItems: auctions.value.length,
      wonItems: auctions.value.filter((item) => item.status === '입찰').length,
      activeBids: auctions.value.filter((item) => item.status === '임장완료').length,
      totalBidAmount,
    };
  });

  const setFilter = (status: AuctionStatus | '전체') => {
    activeStatus.value = status;
  };

  const setKeyword = (keyword: string) => {
    searchKeyword.value = keyword;
  };
  const setCourt = (court: string) => {
    selectedCourt.value = court;
  };
  const setRegion = (region: string) => {
    selectedRegion.value = region;
  };
  const setSortMode = (mode: 'latest' | 'court' | 'region') => {
    sortMode.value = mode;
  };
  const setBidDate = (date: string) => {
    selectedBidDate.value = date;
  };

  const resetListFilters = () => {
    activeStatus.value = '전체';
    selectedCourt.value = '전체';
    selectedRegion.value = '전체';
    selectedBidDate.value = '';
    searchKeyword.value = '';
    sortMode.value = 'latest';
  };

  const getById = (id: string) => auctions.value.find((item) => item.id === id);

  const normalizeFlags = (auction: AuctionDetail): AuctionDetail => {
    const normalizedStatus = normalizeStatus(auction.status);
    const normalizedNearBidRows = normalizeNearBidRows(auction.excelAnalysis);
    const serializedNearBidRows = serializeNearBidRows(normalizedNearBidRows);
    const normalizedRealTradeRows = normalizeRealTradeRows(auction.excelAnalysis);
    const serializedRealTradeRows = serializeRealTradeRows(normalizedRealTradeRows);
    return {
      ...auction,
      ...defaultBasicInfoOptions(),
      status: normalizedStatus,
      auctionRound: normalizeRound(auction.auctionRound),
      propertyNumber: auction.propertyNumber ?? '',
      auctionKind: auction.auctionKind ?? '임의',
      isInterested: auction.isInterested ?? normalizedStatus === '임장예정',
      isFieldTrip: auction.isFieldTrip ?? normalizedStatus === '임장완료',
      officialPriceBand: auction.officialPriceBand ?? '1억 미만',
      officialPriceValue: auction.officialPriceValue ?? 0,
      roadAddress: auction.roadAddress ?? '',
      commonAreaM2: auction.commonAreaM2 ?? 0,
      commonAreaPyeong: auction.commonAreaPyeong ?? 0,
      structureType: auction.structureType ?? '',
      appraisalCompany: auction.appraisalCompany ?? '',
      priceDate: auction.priceDate ?? '',
      preservationDate: auction.preservationDate ?? '',
      caseStartDate: auction.caseStartDate ?? '',
      creditorName: auction.creditorName ?? '',
      nearbyStation: auction.nearbyStation ?? '',
      cancellationBaseDate: auction.cancellationBaseDate ?? '',
      distributionRequestDate: auction.distributionRequestDate ?? '',
      smallAmountBaseDate: auction.smallAmountBaseDate ?? '',
      auctionHistory: auction.auctionHistory ?? [],
      ownerDebtorStatus: auction.ownerDebtorStatus ?? '알수없음',
      takeoverContent: auction.takeoverContent ?? 'X',
      surveyStatus: auction.surveyStatus ?? '점유자관계미상',
      occupancyRows:
        auction.occupancyRows && auction.occupancyRows.length === 3
          ? auction.occupancyRows
          : defaultBasicInfoOptions().occupancyRows,
      ownerName: auction.ownerName ?? '',
      debtorName: auction.debtorName ?? '',
      delinquentCharges: auction.delinquentCharges ?? '',
      mailStatus: auction.mailStatus ?? '',
      occupancyStatus: auction.occupancyStatus ?? '점유X',
      oppositionStatus: auction.oppositionStatus ?? '대항력X',
      fieldSurvey: {
        ...auction.fieldSurvey,
        checklist:
          auction.fieldSurvey?.checklist && auction.fieldSurvey.checklist.length > 0
            ? auction.fieldSurvey.checklist
            : [
                { id: 's1', label: '외관/동선 체크', checked: false },
                { id: 's2', label: '점유/명도 체크', checked: false },
              ],
      },
      excelAnalysis: {
        ...defaultExcelAnalysis(),
        ...auction.excelAnalysis,
        ...serializedRealTradeRows,
        ...serializedNearBidRows,
        realTradeRows: normalizedRealTradeRows,
        nearBidRows: normalizedNearBidRows,
      },
      bidCost: {
        ...defaultBidCost(),
        ...auction.bidCost,
      },
      marketDemand: {
        ...defaultMarketDemand(),
        ...auction.marketDemand,
        districtLocation: auction.marketDemand?.districtLocation?.trim() || defaultMarketDemand().districtLocation,
        complexLocation: auction.marketDemand?.complexLocation?.trim() || defaultMarketDemand().complexLocation,
        roomType: auction.marketDemand?.roomType === '1' ? '' : (auction.marketDemand?.roomType ?? ''),
        bathCount: auction.marketDemand?.bathCount === '1' ? '' : (auction.marketDemand?.bathCount ?? ''),
        roomCount: auction.marketDemand?.roomCount === '1' ? '' : (auction.marketDemand?.roomCount ?? ''),
      },
      rights: {
        ...auction.rights,
        checklist:
          auction.rights?.checklist && auction.rights.checklist.length > 0
            ? auction.rights.checklist
            : defaultRightsChecklist(),
      },
      importMeta: {
        source: auction.importMeta?.source ?? 'manual',
        pdfFieldKeys: auction.importMeta?.pdfFieldKeys ?? [],
        pdfFileName: auction.importMeta?.pdfFileName ?? '',
        pdfFileId: auction.importMeta?.pdfFileId ?? '',
        pdfFolderUrl: auction.importMeta?.pdfFolderUrl ?? '',
      },
    };
  };

  const saveAuctionToLocal = (auction: AuctionDetail) => {
    const normalized = normalizeFlags(auction);
    const index = allAuctions.value.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      allAuctions.value[index] = normalized;
      return;
    }
    allAuctions.value.unshift(normalized);
  };

  const resubscribeForUid = (uid: string) => {
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
      unsubscribeRealtime = null;
    }
    allAuctions.value = []; // 사용자 전환 시 잔여 데이터 클리어
    if (!isFirestoreAvailable()) {
      storageWarning.value = getFirestoreWarning() ?? 'Firestore 연결 실패, 로컬 샘플 데이터 모드로 동작합니다.';
      return;
    }
    if (!uid) return; // 로그아웃 상태에서는 구독 안 함
    unsubscribeRealtime = subscribeAuctionList(
      uid,
      (rows) => {
        allAuctions.value = rows.map((row) => normalizeFlags(row));
        const dbRows = rows.filter((r) => !r.id.startsWith('onbid-'));
        console.log(
          `[auctionStore] Firestore 동기화 (uid=${uid}): 전체 ${rows.length}건 / DB 등록 ${dbRows.length}건`,
        );
      },
      (message) => {
        storageWarning.value = message;
      },
    );
    storageWarning.value = '';
  };

  const initializeStorage = () => {
    if (syncReady.value) return;
    const authStore = useAuthStore();
    // 현재 uid로 1차 구독 + uid 변화 추적
    resubscribeForUid(authStore.uid);
    watch(() => authStore.uid, (newUid) => {
      resubscribeForUid(newUid);
    });
    syncReady.value = true;
  };

  const disposeStorage = () => {
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
      unsubscribeRealtime = null;
    }
    syncReady.value = false;
  };

  const saveAuction = async (auction: AuctionDetail) => {
    const authStore = useAuthStore();
    // 로그인된 사용자 uid 강제 부여 (이전 데이터/draft 자동 마이그레이션)
    if (authStore.uid) auction.uid = authStore.uid;
    saveAuctionToLocal(auction);
    if (!isFirestoreAvailable()) {
      return;
    }
    await upsertAuction(auction);
  };

  /**
   * 목록에서 감춘다. Firestore 문서는 그대로 두고 hidden 플래그만 세운다.
   * (실수로 지워도 되살릴 수 있게 — 실제 문서 삭제는 하지 않는다)
   */
  const hideAuctions = async (ids: string[]) => {
    if (ids.length === 0) return;
    const target = new Set(ids);
    const changed: AuctionDetail[] = [];
    allAuctions.value = allAuctions.value.map((item) => {
      if (!target.has(item.id) || item.hidden) return item;
      const next = { ...item, hidden: true };
      changed.push(next);
      return next;
    });
    if (changed.length === 0 || !isFirestoreAvailable()) return;
    await upsertAuctionBatch(changed);
  };

  const deleteAuction = async (id: string) => hideAuctions([id]);

  /** 숨긴 물건을 전부 다시 보이게 한다 */
  const restoreHiddenAuctions = async () => {
    const changed: AuctionDetail[] = [];
    allAuctions.value = allAuctions.value.map((item) => {
      if (!item.hidden) return item;
      const next = { ...item, hidden: false };
      changed.push(next);
      return next;
    });
    if (changed.length === 0 || !isFirestoreAvailable()) return;
    await upsertAuctionBatch(changed);
  };

  const importParsedPdfAuctions = async (items: ParsedPdfAuction[]) => {
    if (items.length === 0) {
      return [];
    }

    const imported = items.map((parsed) => {
      const existing = allAuctions.value.find((auction) => auction.caseNumber === parsed.caseNumber);
      const base = existing
        ? { ...createDraftAuction(), ...cloneAuction(existing), id: existing.id }
        : createDraftAuction();
      const pdfFieldKeys = [
        'caseNumber',
        'eventDate',
        'address',
        'roadAddress',
        'approvalDate',
        'auctionKind',
        'auctionRound',
        'propertyType',
        'buildingAreaM2',
        'buildingAreaPyeong',
        'landAreaM2',
        'landAreaPyeong',
        'commonAreaM2',
        'commonAreaPyeong',
        'structureType',
        'appraisalCompany',
        'priceDate',
        'preservationDate',
        'caseStartDate',
        'creditorName',
        'nearbyStation',
        'cancellationBaseDate',
        'distributionRequestDate',
        'smallAmountBaseDate',
        'auctionHistory',
        'floorInfo',
        'officialPriceBand',
        'officialPriceValue',
        'valuationWarning',
        'surveyStatus',
        'delinquentCharges',
        'ownerName',
        'debtorName',
        'takeoverContent',
        'occupancyStatus',
        'oppositionStatus',
        'metrics.appraisalValue',
        'metrics.minimumBidValue',
        'metrics.myBidValue',
        'metrics.bidRate',
        'metrics.depositValue',
        'occupancyRows.0.name',
        'occupancyRows.0.date',
        'occupancyRows.0.fixed',
        'occupancyRows.0.opposition',
        'occupancyRows.0.depositAmount',
        'fieldSurvey.occupantNote',
        'fieldSurvey.totalArrears',
        'fieldSurvey.surveyMemo',
        'rights.baseDate',
        'rights.totalClaimAmount',
        'excelAnalysis.nearestSubway',
        'excelAnalysis.summaryText',
        'excelAnalysis.realTradeRows',
        'excelAnalysis.nearBidRows',
        'excelAnalysis.nearBidSaleInfo',
        'excelAnalysis.nearBidAppraisal',
        'excelAnalysis.nearBidMinimum',
        'excelAnalysis.nearBidWinning',
        'excelAnalysis.nearBidRate',
        'excelAnalysis.nearBidExpectedWinning',
        'bidCost.bidRate',
        'marketDemand.schoolInfoA',
        'marketDemand.schoolInfoB',
        'marketDemand.schoolInfoC',
        'marketDemand.transportInfo',
        'marketDemand.infraInfo',
        'marketDemand.marketSurveyNoTrade',
      ];
      // 공시가격 섹션이 빠진 최신 양식에서는 매각구분 배지의 "공시가 1~2억" 표기로 구간을 잡는다
      const officialPriceBand =
        parsed.officialPriceValue > 0
          ? (parsed.officialPriceValue >= 100000000 ? '1억 이상' : '1억 미만')
          : parsed.officialPriceBand || base.officialPriceBand;
      const occupancyRows = cloneAuction(base.occupancyRows);

      if (occupancyRows.length > 0) {
        occupancyRows[0] = {
          ...occupancyRows[0],
          name: parsed.occupancyStatus === '점유O' ? parsed.occupancySummary || occupancyRows[0].name : occupancyRows[0].name,
          date: parsed.rightsBaseDate || occupancyRows[0].date,
          fixed: parsed.takeoverContent === 'O' ? '인수 가능성 확인' : occupancyRows[0].fixed,
          opposition: parsed.oppositionStatus,
          depositAmount:
            parsed.occupancySummary.match(/-?\d[\d,]*/)?.[0]?.replace(/[^\d,.-]/g, '') || occupancyRows[0].depositAmount,
        };
      }

      return normalizeFlags({
        ...base,
        id: existing?.id ?? base.id,
        eventDate: parsed.eventDate || base.eventDate,
        courtName: parsed.courtName || base.courtName,
        caseNumber: parsed.caseNumber || base.caseNumber,
        auctionKind: parsed.auctionKind ?? base.auctionKind,
        auctionRound: parsed.auctionRound || base.auctionRound,
        status: existing?.status ?? '임장예정',
        isInterested: true,
        hidden: false, // 감춰둔 물건을 다시 임포트하면 목록에 되살린다
        isFieldTrip: existing?.isFieldTrip ?? false,
        propertyType: parsed.propertyType || base.propertyType,
        address: parsed.address || base.address || parsed.sourceName,
        roadAddress: parsed.roadAddress || base.roadAddress,
        approvalDate: parsed.approvalDate || base.approvalDate,
        buildingAreaM2: parsed.buildingAreaM2 || base.buildingAreaM2,
        buildingAreaPyeong: parsed.buildingAreaPyeong || base.buildingAreaPyeong,
        landAreaM2: parsed.landAreaM2 || base.landAreaM2,
        landAreaPyeong: parsed.landAreaPyeong || base.landAreaPyeong,
        commonAreaM2: parsed.commonAreaM2 || base.commonAreaM2,
        commonAreaPyeong: parsed.commonAreaPyeong || base.commonAreaPyeong,
        structureType: parsed.structureType || base.structureType,
        appraisalCompany: parsed.appraisalCompany || base.appraisalCompany,
        priceDate: parsed.priceDate || base.priceDate,
        preservationDate: parsed.preservationDate || base.preservationDate,
        caseStartDate: parsed.caseStartDate || base.caseStartDate,
        creditorName: parsed.creditorName || base.creditorName,
        nearbyStation: parsed.nearestStation || base.nearbyStation,
        cancellationBaseDate: parsed.cancellationBaseDate || base.cancellationBaseDate,
        distributionRequestDate: parsed.distributionRequestDate || base.distributionRequestDate,
        smallAmountBaseDate: parsed.smallAmountBaseDate || base.smallAmountBaseDate,
        auctionHistory: parsed.auctionHistory.length > 0 ? parsed.auctionHistory : base.auctionHistory,
        floorInfo:
          base.floorInfo ||
          [parsed.auctionRound, parsed.minimumBidRate > 0 ? `${parsed.minimumBidRate}%` : '']
            .filter(Boolean)
            .join(' · '),
        valuationWarning: parsed.notes || base.valuationWarning,
        surveyStatus: parsed.surveyStatus || base.surveyStatus,
        occupancyRows,
        officialPriceBand,
        officialPriceValue: parsed.officialPriceValue || base.officialPriceValue,
        ownerName: parsed.ownerName || base.ownerName,
        debtorName: parsed.debtorName || base.debtorName,
        takeoverContent: parsed.takeoverContent,
        delinquentCharges: parsed.delinquentCharges || base.delinquentCharges,
        occupancyStatus: parsed.occupancyStatus,
        oppositionStatus: parsed.oppositionStatus,
        metrics: {
          ...base.metrics,
          appraisalValue: parsed.appraisalValue || base.metrics.appraisalValue,
          minimumBidValue: parsed.minimumBidValue || base.metrics.minimumBidValue,
          myBidValue: parsed.minimumBidValue || base.metrics.myBidValue,
          bidRate: parsed.minimumBidRate || base.metrics.bidRate,
          depositValue: parsed.depositValue || base.metrics.depositValue,
        },
        fieldSurvey: {
          ...base.fieldSurvey,
          occupantNote: parsed.occupancySummary || base.fieldSurvey.occupantNote,
          totalArrears: parsed.delinquentCharges ? Number(parsed.delinquentCharges.replace(/[^\d.-]/g, '')) : base.fieldSurvey.totalArrears,
          surveyMemo: parsed.notes || base.fieldSurvey.surveyMemo,
        },
        rights: {
          ...base.rights,
          baseDate: parsed.rightsBaseDate || base.rights.baseDate,
          totalClaimAmount: parsed.rightsClaimAmount || base.rights.totalClaimAmount,
        },
        excelAnalysis: {
          ...base.excelAnalysis,
          realTradeRows: parsed.realTradeRows.length > 0 ? parsed.realTradeRows : base.excelAnalysis.realTradeRows,
          nearBidRows: parsed.nearBidRows.length > 0 ? parsed.nearBidRows : base.excelAnalysis.nearBidRows,
          nearestSubway: parsed.nearestStation || base.excelAnalysis.nearestSubway,
          summaryText: parsed.notes || base.excelAnalysis.summaryText,
          nearBidSaleInfo: parsed.nearBidSaleInfo || base.excelAnalysis.nearBidSaleInfo,
          nearBidAppraisal: parsed.nearBidAppraisal || base.excelAnalysis.nearBidAppraisal,
          nearBidMinimum: parsed.nearBidMinimum || base.excelAnalysis.nearBidMinimum,
          nearBidWinning: parsed.nearBidWinning || base.excelAnalysis.nearBidWinning,
          nearBidRate: parsed.nearBidRate || base.excelAnalysis.nearBidRate,
          nearBidExpectedWinning: parsed.nearBidExpectedWinning || base.excelAnalysis.nearBidExpectedWinning,
        },
        bidCost: {
          ...base.bidCost,
          bidRate: parsed.minimumBidRate || base.bidCost.bidRate,
        },
        marketDemand: {
          ...base.marketDemand,
          schoolInfoA: parsed.elementarySchools ? `초: ${parsed.elementarySchools}` : base.marketDemand.schoolInfoA,
          schoolInfoB: parsed.middleSchools ? `중: ${parsed.middleSchools}` : base.marketDemand.schoolInfoB,
          schoolInfoC: parsed.highSchools ? `고: ${parsed.highSchools}` : base.marketDemand.schoolInfoC,
          transportInfo: parsed.nearestStation || base.marketDemand.transportInfo,
          infraInfo: parsed.adminAgencies || base.marketDemand.infraInfo,
          demandNote: parsed.notes || base.marketDemand.demandNote,
          marketSurveyNoTrade: parsed.notes || base.marketDemand.marketSurveyNoTrade,
        },
        importMeta: {
          source: 'pdf',
          pdfFieldKeys,
          pdfFileName: parsed.sourceName || base.importMeta?.pdfFileName,
          pdfFileId: parsed.sourceFileId || base.importMeta?.pdfFileId,
          pdfFolderUrl: parsed.sourceFolderUrl || base.importMeta?.pdfFolderUrl,
        },
        saleClassification: parsed.saleClassification || base.saleClassification,
        progressNote: parsed.progressNote || base.progressNote,
        registryRows: parsed.registryRows.length > 0 ? parsed.registryRows : base.registryRows,
        registryWarnings: parsed.registryWarnings || base.registryWarnings,
        relatedCaseRows: parsed.relatedCaseRows.length > 0 ? parsed.relatedCaseRows : base.relatedCaseRows,
        tenantOtherNotes: parsed.tenantOtherNotes || base.tenantOtherNotes,
        tenantTotalDeposit: parsed.tenantTotalDeposit || base.tenantTotalDeposit,
        buildingHeader: (
          parsed.buildingHeader.locationDetail ||
          parsed.buildingHeader.unitLocation ||
          parsed.buildingHeader.unitExclusiveArea ||
          parsed.buildingHeader.totalFloorArea
        ) ? parsed.buildingHeader : base.buildingHeader,
        tenantInfoRows: parsed.tenantInfoRows.length > 0 ? parsed.tenantInfoRows : base.tenantInfoRows,
        adminAgencyItems: parsed.adminAgencyItems.length > 0 ? parsed.adminAgencyItems : base.adminAgencyItems,
        pdfNearbyEnv: Object.keys(parsed.pdfNearbyEnv ?? {}).length > 0 ? parsed.pdfNearbyEnv : base.pdfNearbyEnv,
        aptComplexInfo: parsed.aptComplexInfo ?? base.aptComplexInfo,
        arrearsInfo: parsed.arrearsInfo ?? base.arrearsInfo,
        locationSummary: parsed.locationSummary ?? base.locationSummary,
      });
    });

    // 로그인 사용자 uid를 모든 import 결과에 부여 (없으면 Firestore 규칙에 의해 저장 거부됨)
    const authStore = useAuthStore();
    if (authStore.uid) {
      imported.forEach((auction) => { auction.uid = authStore.uid; });
    }

    imported.forEach((auction) => {
      saveAuctionToLocal(auction);
    });

    if (isFirestoreAvailable()) {
      await upsertAuctionBatch(imported);
    }

    return imported;
  };

  const updateQuickStatus = async (id: string, updates: Pick<AuctionDetail, 'isInterested' | 'isFieldTrip'>) => {
    const current = getById(id);
    if (!current) {
      return;
    }
    let nextStatus = current.status;
    if (updates.isFieldTrip) {
      nextStatus = '임장완료';
    } else if (updates.isInterested) {
      nextStatus = '임장예정';
    } else if (current.status === '임장완료' || current.status === '임장예정') {
      nextStatus = '보류';
    }
    await saveAuction({
      ...current,
      ...updates,
      status: nextStatus,
    });
  };

  const toggleInterested = async (id: string) => {
    const current = getById(id);
    if (!current) {
      return;
    }
    await updateQuickStatus(id, {
      isInterested: !current.isInterested,
      isFieldTrip: current.isFieldTrip,
    });
  };

  const toggleFieldTrip = async (id: string) => {
    const current = getById(id);
    if (!current) {
      return;
    }
    await updateQuickStatus(id, {
      isInterested: current.isInterested,
      isFieldTrip: !current.isFieldTrip,
    });
  };

  const setStatus = async (id: string, status: AuctionStatus) => {
    const current = getById(id);
    if (!current) {
      return;
    }
    await saveAuction({
      ...current,
      status,
      isInterested: status === '임장예정',
      isFieldTrip: status === '임장완료',
    });
  };

  const createNewAuction = () => createDraftAuction();

  const loadFromPublicApi = async (params: AuctionSearchParams) => {
    loading.value = true;
    try {
      const result = await searchAuctionsFromPublicData(params);
      if (result.items.length > 0) {
        if (isFirestoreAvailable()) {
          await upsertAuctionBatch(result.items);
        } else {
          const merged = [...result.items, ...allAuctions.value];
          const deduped = new Map<string, AuctionDetail>();
          merged.forEach((item) => deduped.set(item.id, normalizeFlags(item)));
          allAuctions.value = [...deduped.values()].map((item) => normalizeFlags(item));
        }
      }
      apiWarning.value = result.warning ?? '';
      lastSources.value = result.sources;
      apiSourceErrors.value = result.errors;
      apiSourceStatuses.value = result.sourceStatuses;
    } finally {
      loading.value = false;
    }
  };

  return {
    auctions,
    hiddenCount,
    loading,
    summary,
    activeStatus,
    searchKeyword,
    selectedCourt,
    selectedRegion,
    selectedBidDate,
    sortMode,
    courtOptions,
    regionOptions,
    apiWarning,
    lastSources,
    apiSourceErrors,
    apiSourceStatuses,
    storageWarning,
    syncReady,
    filteredAuctions,
    setFilter,
    setKeyword,
    setCourt,
    setRegion,
    setBidDate,
    setSortMode,
    resetListFilters,
    getById,
    saveAuction,
    deleteAuction,
    hideAuctions,
    restoreHiddenAuctions,
    importParsedPdfAuctions,
    toggleInterested,
    toggleFieldTrip,
    setStatus,
    createNewAuction,
    initializeStorage,
    disposeStorage,
    loadFromPublicApi,
  };
});
