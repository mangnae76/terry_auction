import type { AuctionDetail } from '../types/auction';

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

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const toPyeong = (m2: number) => Number((m2 / 3.3058).toFixed(2));

const pickString = (raw: Record<string, unknown>, keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
};

const pickNumber = (raw: Record<string, unknown>, keys: string[], fallback = 0) => {
  for (const key of keys) {
    const value = toNumber(raw[key], Number.NaN);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
};

const toIsoDate = (value: string, fallback: string) => {
  const normalized = value.replace(/[.\s/]/g, '-').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }
  return fallback;
};

const createExcelAnalysis = () => ({
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
  realTradeRows: [
    {
      type: '매매',
      contractDate: '',
      price: '',
      area: '',
      floor: '',
    },
  ],
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
  nearBidRows: [
    {
      saleInfo: '',
      appraisal: '',
      minimum: '',
      winning: '',
      rate: '',
      expectedWinning: '',
    },
  ],
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

const createBidCostDefaults = () => ({
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

const createMarketDemandDefaults = () => ({
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

const createRightsChecklistDefaults = () => [
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

export const mapOnbidItemToAuction = (raw: Record<string, unknown>, index: number): AuctionDetail => {
  const today = new Date().toISOString().slice(0, 10);
  const appraisalValue = pickNumber(raw, ['apprAmt', 'apslAmt', 'evlAmt', 'pcllPrc'], 0);
  const minimumBidValue = pickNumber(raw, ['minBidPrc', 'minPrc', 'fstBidPrc'], appraisalValue * 0.7);
  const roadAddress = pickString(raw, ['roadAddr', 'rdnmadr', 'newAddr'], '');
  const lotAddress = pickString(raw, ['addr', 'jibunAddr', 'lnmadr', 'oldAddr'], '');
  const areaAddress = pickString(raw, ['siGunGuNm', 'emdNm', 'location'], '');
  const address = [roadAddress, lotAddress, areaAddress].filter((item) => item.length > 0).join(' ').trim() || '주소 미확인';
  const caseNumber = pickString(raw, ['cltrNo', 'pbctNo', 'pbctNo1', 'bidNo', 'mgmtNo'], `온비드-${index + 1}`);
  const buildingArea = pickNumber(raw, ['objPrptAr', 'bldgAr', 'totAr', 'suplyAr'], 0);
  const landArea = pickNumber(raw, ['landAr', 'lndAr'], 0);
  const bidRound = pickString(raw, ['bidRcnt', 'aucRcnt', 'rdcnt'], '');
  const eventDateRaw = pickString(raw, ['openDt', 'bidDtm', 'bidBgngYmd', 'bidEndDtm', 'exprDt'], today);
  const eventDate = toIsoDate(eventDateRaw, today);
  const orgName = pickString(raw, ['orgNm', 'orgnztNm', 'insttNm', 'deptNm'], '한국자산관리공사');
  const propertyType = pickString(raw, ['prptDvsnNm', 'cltrHstrNm', 'pbctClNm', 'prptNm'], '공공자산');
  const floorInfo = pickString(raw, ['floor', 'flrInfo', 'bldgInfo', 'spcfc'], '-');
  const occupantNote = pickString(raw, ['occupancyInfo', 'occpncyInfo', 'useInfo'], '');
  const surveyMemo = pickString(raw, ['etcDtl', 'rmrk', 'dscntRsn', 'salsCn'], '');
  const rightsMemo = pickString(raw, ['lglRghtInfo', 'rgstInfo', 'lncdn'], '');
  const bidRate = appraisalValue > 0 ? (minimumBidValue / appraisalValue) * 100 : 0;
  const expectedSaleValue = appraisalValue * 1.08;

  return {
    ...defaultPdfFields(),
    id: `onbid-${caseNumber}-${index}-${eventDate}`,
    eventDate,
    courtName: orgName,
    caseNumber,
    propertyNumber: '',
    auctionKind: '임의',
    auctionRound: bidRound ? `${bidRound}차` : '신건',
    status: '임장예정',
    isInterested: false,
    isFieldTrip: false,
    propertyType,
    address,
    approvalDate: pickString(raw, ['bldgYd', 'useAprvYmd', 'cnstrctYmd'], ''),
    buildingAreaM2: buildingArea,
    buildingAreaPyeong: toPyeong(buildingArea),
    landAreaM2: landArea,
    landAreaPyeong: toPyeong(landArea),
    floorInfo,
    valuationWarning: pickString(raw, ['bidSttusNm', 'pbctSttusNm', 'state'], ''),
    surveyStatus: pickString(raw, ['occpncyInfo', 'occupancyInfo'], '점유자관계미상'),
    occupancyRows: [
      { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
      { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
      { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    ],
    officialPriceBand: appraisalValue < 100000000 ? '1억 미만' : '1억 이상',
    officialPriceValue: appraisalValue,
    ownerName: '',
    debtorName: '',
    ownerDebtorStatus: '알수없음',
    takeoverContent: 'X',
    delinquentCharges: '',
    mailStatus: '',
    occupancyStatus: '점유X',
    oppositionStatus: '대항력X',
    metrics: {
      appraisalValue,
      minimumBidValue,
      myBidValue: minimumBidValue,
      bidRate,
    },
    expectedSaleValue,
    expectedProfitRate: minimumBidValue > 0 ? ((expectedSaleValue - minimumBidValue) / minimumBidValue) * 100 : 0,
    fieldSurvey: {
      occupantNote,
      rentalIssue: '',
      keyIssue: '',
      arrearsMaintenance: 0,
      arrearsUtilities: 0,
      totalArrears: 0,
      surveyMemo,
      checklist: [
        { id: `survey-${index}-1`, label: '외관/동선 체크', checked: false },
        { id: `survey-${index}-2`, label: '점유/명도 체크', checked: false },
      ],
    },
    rights: {
      baseDate: '',
      totalClaimAmount: 0,
      items: [],
      checklist: rightsMemo
        ? [...createRightsChecklistDefaults(), { id: `onbid-rights-${index}`, label: '온비드 권리/비고', note: rightsMemo, checked: false }]
        : createRightsChecklistDefaults(),
    },
    excelAnalysis: createExcelAnalysis(),
    bidCost: createBidCostDefaults(),
    marketDemand: createMarketDemandDefaults(),
  };
};

export const mapMolitTradeToAuction = (
  raw: Record<string, unknown>,
  index: number,
  keyword: string,
): AuctionDetail => {
  const dealAmount = toNumber(raw.거래금액, 0) * 10_000;
  const buildingArea = toNumber(raw.전용면적, 0);
  const caseNumber = `${raw.지역코드 ?? 'RTMS'}-${raw.년 ?? ''}${raw.월 ?? ''}-${index + 1}`;

  return {
    ...defaultPdfFields(),
    id: `molit-${caseNumber}`,
    eventDate: `${raw.년 ?? ''}-${String(raw.월 ?? '').padStart(2, '0')}-${String(raw.일 ?? '').padStart(2, '0')}`,
    courtName: '국토교통부 실거래가',
    caseNumber,
    propertyNumber: '',
    auctionKind: '임의',
    auctionRound: '신건',
    status: '보류',
    isInterested: true,
    isFieldTrip: false,
    propertyType: String(raw.건물유형 ?? '공동주택'),
    address: `${raw.법정동 ?? keyword} ${raw.아파트 ?? ''}`.trim(),
    approvalDate: String(raw.건축년도 ?? ''),
    buildingAreaM2: buildingArea,
    buildingAreaPyeong: toPyeong(buildingArea),
    landAreaM2: 0,
    landAreaPyeong: 0,
    floorInfo: String(raw.층 ?? '-'),
    valuationWarning: '실거래 참고값으로 생성된 카드입니다.',
    surveyStatus: '점유자관계미상',
    occupancyRows: [
      { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
      { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
      { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    ],
    officialPriceBand: dealAmount < 100000000 ? '1억 미만' : '1억 이상',
    officialPriceValue: dealAmount,
    ownerName: '',
    debtorName: '',
    ownerDebtorStatus: '알수없음',
    takeoverContent: 'X',
    delinquentCharges: '',
    mailStatus: '',
    occupancyStatus: '점유X',
    oppositionStatus: '대항력X',
    metrics: {
      appraisalValue: dealAmount,
      minimumBidValue: Math.round(dealAmount * 0.75),
      myBidValue: Math.round(dealAmount * 0.7),
      bidRate: 75,
    },
    expectedSaleValue: dealAmount,
    expectedProfitRate: 8,
    fieldSurvey: {
      occupantNote: '',
      rentalIssue: '',
      keyIssue: '',
      arrearsMaintenance: 0,
      arrearsUtilities: 0,
      totalArrears: 0,
      surveyMemo: '',
      checklist: [
        { id: `survey-${index}-1`, label: '외관/동선 체크', checked: false },
        { id: `survey-${index}-2`, label: '점유/명도 체크', checked: false },
      ],
    },
    rights: {
      baseDate: '',
      totalClaimAmount: 0,
      items: [],
      checklist: createRightsChecklistDefaults(),
    },
    excelAnalysis: createExcelAnalysis(),
    bidCost: createBidCostDefaults(),
    marketDemand: createMarketDemandDefaults(),
  };
};

export const mapMolitRentToAuction = (
  raw: Record<string, unknown>,
  index: number,
  keyword: string,
  source: string,
): AuctionDetail => {
  const deposit = toNumber(raw.보증금액 ?? raw.보증금, 0) * 10_000;
  const monthlyRent = toNumber(raw.월세금액 ?? raw.월세, 0) * 10_000;
  const buildingArea = toNumber(raw.전용면적, 0);
  const dealYear = String(raw.년 ?? '');
  const dealMonth = String(raw.월 ?? '').padStart(2, '0');
  const dealDay = String(raw.일 ?? '').padStart(2, '0');
  const caseNumber = `${raw.지역코드 ?? 'RENT'}-${dealYear}${dealMonth}-${index + 1}`;
  const estimatedValue = deposit + monthlyRent * 24;

  return {
    ...defaultPdfFields(),
    id: `rent-${caseNumber}-${index}`,
    eventDate: `${dealYear}-${dealMonth}-${dealDay}`,
    courtName: source,
    caseNumber,
    propertyNumber: '',
    auctionKind: '임의',
    auctionRound: '신건',
    status: '보류',
    isInterested: true,
    isFieldTrip: false,
    propertyType: String(raw.건물유형 ?? '주거'),
    address: `${raw.법정동 ?? keyword} ${raw.아파트 ?? raw.지번 ?? ''}`.trim(),
    approvalDate: String(raw.건축년도 ?? ''),
    buildingAreaM2: buildingArea,
    buildingAreaPyeong: toPyeong(buildingArea),
    landAreaM2: 0,
    landAreaPyeong: 0,
    floorInfo: String(raw.층 ?? '-'),
    valuationWarning: '전월세 실거래 참고값으로 생성된 카드입니다.',
    surveyStatus: '점유자관계미상',
    occupancyRows: [
      { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
      { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
      { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    ],
    officialPriceBand: estimatedValue < 100000000 ? '1억 미만' : '1억 이상',
    officialPriceValue: estimatedValue,
    ownerName: '',
    debtorName: '',
    ownerDebtorStatus: '알수없음',
    takeoverContent: 'X',
    delinquentCharges: '',
    mailStatus: '',
    occupancyStatus: '점유X',
    oppositionStatus: '대항력X',
    metrics: {
      appraisalValue: estimatedValue,
      minimumBidValue: Math.round(estimatedValue * 0.7),
      myBidValue: Math.round(estimatedValue * 0.65),
      bidRate: 70,
    },
    expectedSaleValue: estimatedValue,
    expectedProfitRate: 6,
    fieldSurvey: {
      occupantNote: '',
      rentalIssue: '',
      keyIssue: '',
      arrearsMaintenance: 0,
      arrearsUtilities: 0,
      totalArrears: 0,
      surveyMemo: '',
      checklist: [
        { id: `survey-${index}-1`, label: '외관/동선 체크', checked: false },
        { id: `survey-${index}-2`, label: '점유/명도 체크', checked: false },
      ],
    },
    rights: {
      baseDate: '',
      totalClaimAmount: 0,
      items: [],
      checklist: createRightsChecklistDefaults(),
    },
    excelAnalysis: createExcelAnalysis(),
    bidCost: createBidCostDefaults(),
    marketDemand: createMarketDemandDefaults(),
  };
};

export const mapStandardLandPriceToAuction = (
  raw: Record<string, unknown>,
  index: number,
  keyword: string,
): AuctionDetail => {
  const basePricePerM2 = toNumber(raw.pblntfPclnd ?? raw.공시지가, 0);
  const landArea = toNumber(raw.lndpclAr ?? raw.토지면적, 330);
  const appraisalValue = Math.round(basePricePerM2 * Math.max(landArea, 1));
  const stdrYear = String(raw.stdrYear ?? raw.기준연도 ?? new Date().getFullYear());
  const stdgName = String(raw.stdgNm ?? raw.법정동 ?? keyword);
  const lotNumber = String(raw.lnm ?? raw.지번 ?? '');
  const caseNumber = `LAND-${stdrYear}-${index + 1}`;

  return {
    ...defaultPdfFields(),
    id: `land-${caseNumber}`,
    eventDate: `${stdrYear}-01-01`,
    courtName: '국토교통부 표준지공시지가',
    caseNumber,
    propertyNumber: '',
    auctionKind: '임의',
    auctionRound: '신건',
    status: '보류',
    isInterested: true,
    isFieldTrip: false,
    propertyType: String(raw.lndcgrCodeNm ?? raw.지목 ?? '토지'),
    address: `${stdgName} ${lotNumber}`.trim(),
    approvalDate: '',
    buildingAreaM2: 0,
    buildingAreaPyeong: 0,
    landAreaM2: landArea,
    landAreaPyeong: toPyeong(landArea),
    floorInfo: '-',
    valuationWarning: '표준지공시지가 참고값으로 생성된 카드입니다.',
    surveyStatus: '점유자관계미상',
    occupancyRows: [
      { label: '점유O', name: '', date: '', fixed: '', opposition: '대항력X', depositAmount: '' },
      { label: '점유X', name: '', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
      { label: '입력', name: '주택도시', date: '', fixed: '', opposition: '대항력O', depositAmount: '' },
    ],
    officialPriceBand: appraisalValue < 100000000 ? '1억 미만' : '1억 이상',
    officialPriceValue: appraisalValue,
    ownerName: '',
    debtorName: '',
    ownerDebtorStatus: '알수없음',
    takeoverContent: 'X',
    delinquentCharges: '',
    mailStatus: '',
    occupancyStatus: '점유X',
    oppositionStatus: '대항력X',
    metrics: {
      appraisalValue,
      minimumBidValue: Math.round(appraisalValue * 0.7),
      myBidValue: Math.round(appraisalValue * 0.65),
      bidRate: 70,
    },
    expectedSaleValue: appraisalValue,
    expectedProfitRate: 7,
    fieldSurvey: {
      occupantNote: '',
      rentalIssue: '',
      keyIssue: '',
      arrearsMaintenance: 0,
      arrearsUtilities: 0,
      totalArrears: 0,
      surveyMemo: '',
      checklist: [
        { id: `survey-${index}-1`, label: '외관/동선 체크', checked: false },
        { id: `survey-${index}-2`, label: '점유/명도 체크', checked: false },
      ],
    },
    rights: {
      baseDate: '',
      totalClaimAmount: 0,
      items: [],
      checklist: createRightsChecklistDefaults(),
    },
    excelAnalysis: createExcelAnalysis(),
    bidCost: createBidCostDefaults(),
    marketDemand: createMarketDemandDefaults(),
  };
};
