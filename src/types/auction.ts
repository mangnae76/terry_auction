export type AuctionStatus = '손품' | '임장예정' | '임장완료' | '입찰' | '낙찰' | '보류';

/** 화면에 보여 주는 단계 이름 — 저장값과 글자가 달라 한 곳에서만 정의한다 */
export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  손품: '손품조사',
  임장예정: '임장예정',
  임장완료: '임장완료',
  입찰: '입찰산정',
  // 아래 둘은 단계에서 뺐다 — 옛 자료를 읽을 때만 쓴다
  낙찰: '낙찰',
  보류: '탈락',
};
/** 단계 순서 — 손품 → 임장 → 입찰 → 낙찰. '보류'(옛 탈락)는 단계에서 뺐다.
 *  더 안 보는 물건은 휴지통으로 보낸다(복원 가능). */
export const AUCTION_STATUS_ORDER: AuctionStatus[] = ['손품', '임장예정', '임장완료', '입찰'];

export interface AuctionMetrics {
  appraisalValue: number;
  minimumBidValue: number;
  myBidValue: number;
  bidRate: number;
  /** 입찰보증금 — PDF의 "보증금 (10%) 17,800,000" 값 */
  depositValue?: number;
}

export interface FieldSurvey {
  occupantNote: string;
  rentalIssue: string;
  keyIssue: string;
  arrearsMaintenance: number;
  arrearsUtilities: number;
  totalArrears: number;
  surveyMemo: string;
  checklist: SurveyChecklistItem[];
}

export interface SurveyChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface RightsItem {
  id: string;
  type: string;
  creditor: string;
  amount: number;
  registeredAt: string;
  cleared: boolean;
}

export interface RightsChecklist {
  id: string;
  label: string;
  note: string;
  checked: boolean;
}

export interface RightsAnalysis {
  baseDate: string;
  totalClaimAmount: number;
  items: RightsItem[];
  checklist: RightsChecklist[];
}

export interface NearBidRow {
  saleInfo: string;
  appraisal: string;
  minimum: string;
  winning: string;
  rate: string;
  expectedWinning: string;
}

export interface RealTradeRow {
  type: string;
  contractDate: string;
  price: string;
  area: string;
  floor: string;
}

export interface ExcelAnalysis {
  expectedAvgPrice: number;
  bidPriceRatio: number;
  loanRatio: number;
  acquisitionTaxRate: number;
  legalCostRate: number;
  interestRate: number;
  transferTaxRate: number;
  brokerageRate: number;
  repairCost: number;
  evictionCost: number;
  nearestSubway: string;
  subwayDistanceM: number;
  schoolInfo: string;
  jobAccess: string;
  infraInfo: string;
  resaleDemand: string;
  saleStrategy: string;
  memo: string;
  marketYear: string;
  nearOfferSaleInfo: string;
  nearOfferExclusiveArea: string;
  nearOfferCommonPrice: string;
  nearOfferJeonsePrice: string;
  nearOfferNaverPrice: string;
  nearOfferRatio: string;
  nearOfferAvgPrice: string;
  nearOfferAvgJeonse: string;
  nearOfferAvgNaver: string;
  nearOfferAvgRatio: string;
  realTradeRows: RealTradeRow[];
  realTradeSaleInfo: string;
  realTradeArea: string;
  realTradeCommonPrice: string;
  realTradeJeonse: string;
  realTradeLocalAvg: string;
  realTradeRatio: string;
  latestTradeNote: string;
  latestTradeArea: string;
  latestTradePrice: string;
  latestTradeJeonse: string;
  latestTradeComparison: string;
  latestTradeComparedPrice: string;
  latestTradeRatio: string;
  pastTradeInfo: string;
  pastTradeCommonPrice: string;
  pastTradeJeonse: string;
  pastTradeRatio: string;
  unitPrice: string;
  unitPriceCommonPrice: string;
  unitPriceJeonsePrice: string;
  unitPriceNaverPrice: string;
  unitPriceRatio: string;
  nearBidRows: NearBidRow[];
  nearBidSaleInfo: string;
  nearBidAppraisal: string;
  nearBidMinimum: string;
  nearBidWinning: string;
  nearBidRate: string;
  nearBidExpectedWinning: string;
  regionMarket: string;
  regionBrokerName: string;
  regionContact: string;
  summaryText: string;
  summaryContact: string;
}

export interface BidCostAnalysis {
  bidRate: number;
  loanRate: number;
  acquisitionTaxRate: number;
  legalCostRate: number;
  midRepaymentRate: number;
  interestRate3m: number;
  brokerageRate: number;
  arrearsFee: number;
  repairCost: number;
  evictionCost: number;
  salePrice: number;
  incomeTaxRate: number;
  localTaxRate: number;
  /** 과세표준 세율(%)·누진공제(원)을 손으로 고쳤을 때의 값.
   *  비우면 사업소득금액이 걸리는 구간의 기본값을 쓴다.
   *  (위의 incomeTaxRate 는 옛 화면이 쓰는 값이라 건드리지 않는다) */
  incomeTaxRateManual?: number;
  incomeTaxDeduct?: number;
  loanAmount: number;
  acquisitionTaxAmount: number;
  legalCostAmount: number;
  interestAmount: number;
  midRepaymentAmount: number;
  brokerageAmount: number;
  advertisingCost: number;
  /** 종합소득세·지방세를 직접 넣었을 때의 금액 (없으면 자동 계산) */
  incomeTaxAmount?: number;
  localTaxAmount?: number;
}

/** 산정표 한 벌 — 'B안이면 이 입찰가에 이 비용으로' 를 따로 담는다.
 *  감정가·최저가·보증금은 물건의 사실이라 A안과 같이 쓴다. */
export interface BidScenario {
  myBidValue: number;
  expectedSaleValue: number;
  expectedSaleValue2?: string;
  bidCost: BidCostAnalysis;
}

export interface MarketDemandAnalysis {
  practicalArea: string;
  practicalFamilyType: string;
  practicalPeople: string;
  practicalKeyword: string;
  districtLocation: string;
  complexLocation: string;
  schoolInfoA: string;
  schoolInfoB: string;
  schoolInfoC: string;
  transportInfo: string;
  jobInfo: string;
  infraInfo: string;
  layoutType: string;
  totalHouseholds: string;
  floorCurrent: string;
  floorTarget: string;
  corridorType: string;
  parking: string;
  elevator: string;
  inspectionTarget: string;
  inspectionResult: string;
  maintenanceTarget: string;
  maintenanceResult: string;
  structureHeating: string;
  structureView: string;
  structureEntrance: string;
  roomType: string;
  bathCount: string;
  roomCount: string;
  repairCondition: string;
  buildingInside: string;
  houseInside: string;
  demandNote: string;
  tradeVolumeRate: string;
  tradeVolumeSupply: string;
  tradeVolumeMonths: string;
  tradeVolumeNote: string;
  listingRate: string;
  listingSupply: string;
  listingCurrent: string;
  listingNote: string;
  lowPriceAvgPyeong: string;
  lowPriceDecision: string;
  lowPriceTarget: string;
  lowPriceNote: string;
  marketSurveyNoTrade: string;
}

export interface OccupancyInfoRow {
  label: string;
  name: string;
  date: string;
  fixed: string;
  opposition: '대항력O' | '대항력X';
  depositAmount: string;
}

export interface AuctionHistoryRow {
  round: string;
  date: string;
  minPrice: number;
  result: string;
}

export interface ImportMeta {
  source: 'manual' | 'pdf';
  pdfFieldKeys: string[];
  /** 원본 PDF 파일명 */
  pdfFileName?: string;
  /** 구글 드라이브 파일 id — 있으면 원본 PDF를 바로 열 수 있다 */
  pdfFileId?: string;
  /** 임포트에 쓴 드라이브 폴더 링크 */
  pdfFolderUrl?: string;
}

export interface RegistryRow {
  date: string;
  order: string;
  kind: string;
  holder: string;
  amount: string;
  desc: string;
  extinct: string;
}

export interface RelatedCaseRow {
  court: string;
  caseNumber: string;
  kind: string;
  result: string;
}

export interface TenantInfoRow {
  name: string;
  subName: string;
  occupationPeriod: string;
  moveIn: string;
  fixed: string;
  distribution: string;
  deposit: string;
  opposition: string;
  analysis: string;
  other: string;
}

export interface PdfNearbyCategory {
  total: number;
  items: Array<{ name: string; distance: string }>;
}

export interface PdfNearbyEnv {
  busStop?: PdfNearbyCategory;
  hospital?: PdfNearbyCategory;
  convStore?: PdfNearbyCategory;
  park?: PdfNearbyCategory;
  publicCenter?: PdfNearbyCategory;
  realtor?: PdfNearbyCategory;
  subway?: PdfNearbyCategory;
  academy?: PdfNearbyCategory;
  daycare?: PdfNearbyCategory;
  pharmacy?: PdfNearbyCategory;
  mart?: PdfNearbyCategory;
  clinic?: PdfNearbyCategory;
}

export interface AptComplexInfo {
  name: string;
  households: string;
  buildings: string;
  approvalDate: string;
  contractor: string;
  parkingTotal: string;
  parkingPerHouse: string;
  heatingType: string;
  heatingFuel: string;
  floorRatio: string;
  buildingCoverage: string;
  topFloor: string;
  bottomFloor: string;
  managementPhone: string;
  facilities: string;
  schools: string;
  restPark: string;
  areaTypes: string;
  evCharger: string;
}

export interface ArrearsInfo {
  surveyDate: string;
  amount: string;
  note: string;
}

/** 최신 탱크옥션 PDF의 '주변환경 및 입지 요약' — 요약/입지/교육/생활/교통/건물/검토 */
export type LocationSummary = Partial<Record<'요약' | '입지' | '교육' | '생활' | '교통' | '건물' | '검토', string>>;

export interface AdminAgencyItem {
  name: string;
  type: string;
  zip: string;
  address: string;
  phone: string;
  fax: string;
  area: string;
}

export interface BuildingHeaderInfo {
  // 표제부(총괄) — 일부 PDF에는 없을 수 있음
  locationDetail: string;
  households: string;
  landAreaTotal: string;
  buildingCoverage: string;
  permitDate: string;
  buildingAreaTotal: string;
  floorAreaRatio: string;
  startDate: string;
  totalFloorArea: string;
  mainUse: string;
  approvalDate: string;
  parking: string;
  floors: string;
  elevator: string;
  exclusiveFloorRows: Array<{ floor: string; area: string; structure: string; mainUse: string; otherUse: string }>;
  // 전유부 — 표제부가 없고 전유부만 있을 때도 채워짐 (둘 다 있으면 우선 표제부 채우고 전유부도 같이)
  unitLocation?: string;
  unitExclusiveArea?: string;  // 전용면적
  unitCommonArea?: string;     // 공용면적
  unitFloor?: string;          // 층 (단일, 예: "지상 2층")
  unitStructure?: string;      // 구조 (예: "철근콘크리트구조")
  unitTotalParking?: string;   // 총 주차수
  unitHouseholds?: string;     // 전유부의 총 가구/세대/호
  commonUse?: string;          // 공용부 상세용도 (계단실/복도)
}

export interface AuctionDetail {
  id: string;
  uid?: string;       // 소유 사용자 (Firebase Auth uid). 비어있는 옛 데이터는 어느 사용자에게도 안 보임.
  eventDate: string;
  courtName: string;
  /** 담당 경매계 — '경매3계' */
  courtDept?: string;
  /** 담당계 전화번호 */
  courtPhone?: string;
  caseNumber: string;
  propertyNumber: string;
  auctionKind: '임의' | '강제';
  auctionRound: string;
  status: AuctionStatus;
  isInterested: boolean;
  /** 목록에서 감춘 물건 — DB에는 남겨두고 화면에서만 제외한다 */
  hidden?: boolean;
  /** 별표로 매긴 중요도 — 없으면 빈 별, 1~3을 돌아가며 매긴다 */
  priority?: number;
  /** 입찰 상태 — 입찰대기 / 입찰포기 / 입찰진행. status(관심·임장·입찰·낙찰·탈락)와는 별개 */
  bidStatus?: string;
  /** 예상수익분석에서 직접 적는 낙찰일 */
  wonDate?: string;
  /** 예상수익분석에서 직접 적는 매도일 */
  sellDate?: string;
  isFieldTrip: boolean;
  propertyType: string;
  address: string;
  roadAddress: string;
  approvalDate: string;
  buildingAreaM2: number;
  buildingAreaPyeong: number;
  landAreaM2: number;
  landAreaPyeong: number;
  commonAreaM2: number;
  commonAreaPyeong: number;
  structureType: string;
  appraisalCompany: string;
  priceDate: string;
  preservationDate: string;
  caseStartDate: string;
  creditorName: string;
  nearbyStation: string;
  cancellationBaseDate: string;
  distributionRequestDate: string;
  smallAmountBaseDate: string;
  auctionHistory: AuctionHistoryRow[];
  floorInfo: string;
  valuationWarning: string;
  surveyStatus: string;
  occupancyRows: OccupancyInfoRow[];
  officialPriceBand: '1억 미만' | '1억 이상';
  officialPriceValue: number;
  ownerName: string;
  debtorName: string;
  ownerDebtorStatus: '점유자O' | '알수없음';
  takeoverContent: 'O' | 'X';
  delinquentCharges: string;
  mailStatus: string;
  occupancyStatus: '점유O' | '점유X';
  oppositionStatus: '대항력O' | '대항력X';
  metrics: AuctionMetrics;
  expectedSaleValue: number;
  /** 매도가 옆 자유 입력칸(입금가·메모) — 비고처럼 아무 말이나 적는다. 계산에 안 들어간다 */
  expectedSaleValue2?: string;
  expectedProfitRate: number;
  /** A안 말고 더 만든 산정표 (B안·C안…) */
  bidScenarios?: BidScenario[];
  fieldSurvey: FieldSurvey;
  rights: RightsAnalysis;
  excelAnalysis: ExcelAnalysis;
  bidCost: BidCostAnalysis;
  marketDemand: MarketDemandAnalysis;
  importMeta?: ImportMeta;
  sitePhotos?: string[];
  /** @deprecated 단일 평면도 — floorPlanUrls로 옮겨간 기존 데이터 호환용 */
  floorPlanUrl?: string;
  /** 평면도 링크 여러 장 */
  floorPlanUrls?: string[];
  /** 본건전경 링크 여러 장 */
  exteriorUrls?: string[];
  saleClassification?: string;
  progressNote?: string;
  registryRows?: RegistryRow[];
  registryWarnings?: string;
  relatedCaseRows?: RelatedCaseRow[];
  tenantOtherNotes?: string;
  tenantTotalDeposit?: string;
  buildingHeader?: BuildingHeaderInfo;
  tenantInfoRows?: TenantInfoRow[];
  rightsChecks?: Record<string, boolean>;
  /** 권리분석 탭에 붙여둔 매각물건명세서 등 캡처·링크 */
  rightsDocUrls?: string[];
  /** 서류 확인 항목별 비고 (현황조사서 조사일시·점유관계 포함) */
  rightsDocNotes?: Record<string, string>;
  /** 정보요약 카드 값 — 'sum.units' 같은 id별 값 */
  basicSummary?: Record<string, string>;
  /** 입지 등수 근거 캡처 (아실·디스코 평단가/전세가 등수) */
  rankPhotoUrls?: string[];
  /** 입지조사 등 항목별 사진·링크 모음 (key → URL 목록) */
  extraPhotos?: Record<string, string[]>;
  /** 실거래가 현황 사진 (아실·디스코) */
  tradePhotoUrls?: string[];
  /** 네이버부동산 매물 사진 (최저가) */
  listPhotoUrls?: string[];
  /** 권리분석 케이스 선택값 ('1'~'6') */
  rightsCaseId?: string;
  /** 실사용자 평형대 선택값 ('12'|'15'|'18'). 비어 있으면 전용 평수로 자동 판정 */
  realUserBandId?: string;
  /** 룸수 선택값 — 세대구성이 이 값을 따라간다. 비어 있으면 세대구성도 비운다 */
  realUserRoomId?: string;
  /** 입지조건별 등수 — 조건명이 키 */
  realUserRanks?: Record<string, string>;
  /** @deprecated 자유입력 방식이던 시절의 필드 — 남은 데이터 보존용 */
  realUserArea?: string;
  realUserRooms?: string;
  realUserDetail?: string;
  realUserCondition?: string;
  adminAgencyItems?: AdminAgencyItem[];
  surveyForm?: SurveyForm;
  pdfNearbyEnv?: PdfNearbyEnv;
  aptComplexInfo?: AptComplexInfo;
  arrearsInfo?: ArrearsInfo;
  locationSummary?: LocationSummary;
}

/** 저렴매물조사 — 해당 빌라 저가 매물 한 줄 */
export interface LowListingRow {
  /** 전용면적(㎡) */
  area: string;
  /** 비고 */
  note: string;
  /** 매매호가(낮은금액) */
  price: string;
  /** '경매물건' | '유사물건' — 어느 쪽을 조사한 줄인지 */
  mode?: string;
}

/** 시세조사 본표의 한 줄 (구분 라벨은 화면에 고정, 값만 저장) */
export interface MarketSurveyRow {
  /** 거래일 */
  date: string;
  /** 매물 정보 (건물명 동/호) */
  name: string;
  /** 전용면적(평) */
  area: string;
  /** 공동주택가(공시가) */
  pub: string;
  jeonse: string;
  /** 공시가에 곱할 비율(%) — 기본 126, 고칠 수 있다 */
  pubRate?: string;
  /** 실거래가 — 평단가 줄에서는 평단가, 저가매물 줄에서는 매물가 */
  real: string;
}

/** 시세조사 카드의 '부동산 정보' 한 줄 */
export interface AgencyRow {
  /** 업체 상호 */
  name: string;
  phone: string;
  /** 응대 성향 메모 (친절/불친절/적극/비적극 등) */
  info: string;
  /** 보증금/월세 */
  monthly: string;
  /** @deprecated 전세가 — 상담표에서 뺐다. 예전 자료만 남아 있다 */
  jeonse: string;
  /** 매매가 — 범위의 아래쪽 (억) */
  real: string;
  /** 매매가 — 범위의 위쪽 (억) */
  realTo?: string;
  /** 입금가 — 범위의 아래쪽 (억). 예전에는 급매가였다.
   *  적어 둔 값을 잃지 않으려고 키 이름은 그대로 둔다 */
  urgent: string;
  /** 입금가 — 범위의 위쪽 (억) */
  urgentTo?: string;
  /** @deprecated 급매가 — 칸을 뺐다. 잠깐 적어 둔 자료만 남아 있다 */
  quick?: string;
  /** 협의한 내용 — 금액으로는 안 남는 것들 */
  note?: string;
  /** @deprecated 비고 — 칸을 뺐다(협의가 줄을 통으로 쓴다). 적어 둔 자료만 남아 있다 */
  memo?: string;
}

export interface SurveyForm {
  // 현장조사
  fieldNote: string;
  surveyReport: string[];
  oppositionStatus: string;
  arrearsTax: string;
  arrearsMaint: string;
  arrearsUtility: string;
  mailCheck: '있음' | '없음' | '미확인' | '';
  occupancyDetail: string;
  // 입지조사
  sizeRange: string;
  layout: string;
  userType: string;
  locationConditions: string;
  regionGrade: string;
  complexGrade: string;
  pricePerPyeong: string;
  jeonsePrice: string;
  schoolNote: string;
  transportNote: string;
  jobNote: string;
  infraNote: string;
  // 가격 (입지조사 카드 하단)
  realTradePrice?: string;
  /** 실거래가의 거래일 (YYYY-MM-DD) */
  realTradeDate?: string;
  /** 실거래 건물명 */
  realTradeBuilding?: string;
  /** 실거래 층 */
  realTradeFloor?: string;
  lowListPrice?: string;
  urgentSalePrice?: string;
  // 시세조사 및 급매가 조사 표
  /** 공동주택가(공시가) */
  mktPubPrice?: string;
  /** 해당구역 실거래 평균가 행 — 전용면적 / 전세가 / 실거래가 */
  mktRegionArea?: string;
  mktRegionJeonse?: string;
  mktRegionReal?: string;
  /** 해당경매물건 실거래가 행 — 전용면적 / 전세가 (금액·거래일·건물명은 realTrade* 재사용) */
  mktCaseArea?: string;
  mktCaseJeonse?: string;
  /** 해당구역 평단가 행 */
  mktUnitArea?: string;
  mktUnitPrice?: string;
  /** 해당단지 저가매물 행의 매물 정보 (금액은 lowListPrice 재사용) */
  mktLowListName?: string;
  /** 시세조사 본표 4줄 (해당구역 평균 / 해당경매물건 / 평단가 / 저가매물) — 옛 구조 */
  mktRows?: MarketSurveyRow[];
  /** 저렴매물조사 — 해당 빌라 저가 매물 목록 */
  mktLowRows?: LowListingRow[];
  /** 시세조사 항목값 — 'mkt.a.area' 같은 id별 입력값 */
  mktValues?: Record<string, string>;
  /** 부동산 정보 표 */
  agencyRows?: AgencyRow[];
  /** 현장조사 4. 부동산 현장 상담 */
  siteAgencyRows?: AgencyRow[];
  /** 시세 및 급매가 결론 — 기본값은 자동으로 채우고 사용자가 고칠 수 있다 */
  mktConcAvg?: string;
  mktConcLow?: string;
  mktConcPyeong?: string;
  /** 결론표 평단가 칸 — 경매물건/유사물건을 나란히 적는다 (면적은 평) */
  mktSimUnitPrice?: string;
  mktSimPyeong?: string;
  /** 결론표에서 예전 필드가 없는 칸 — '<칸>.<줄>' (예: 'avg.area') 로 담는다 */
  mktConcValues?: Record<string, string>;
  /** 전세가를 '공시가 × 비율' 자동 계산으로 바꾸면서 예전 자동값을 한 번 비웠는지 */
  mktJeonseReset?: boolean;
  /** 현장조사 항목값 — 'fs.roofLeak' 같은 id별 값 */
  fieldValues?: Record<string, string>;
  /** 개별성 분석 — 항목 id별 선택/입력값 */
  indivValues?: Record<string, string>;
  /** 개별성 분석 하단 실거래평균가 */
  indivAvgPrice?: string;
  // 아파트 전용
  hasUndergroundParking?: boolean;
  brandTier?: string;
  // 거래율
  totalUnits: string;
  yearlyDeals: string;
  monthlyDeals: string;
  dealRate: string;
  /** 거래율 기준 지역 — 서울 7% / 지방 4% */
  dealRegion?: string;
  // 매물적체
  listingUnits: string;
  listingCount: string;
  listingTarget: string;
  listingBacklog: string;
  // 매매수요 결론
  /** '있음' | '없음' */
  saleDemandYn?: string;
  saleDemandNote?: string;
  // 개별성 - 구역내
  buildYear: string;
  floorCurrent: string;
  floorTotal: string;
  floorPosition: string;
  structureType: string;
  hasElevator: boolean;
  /** PDF 건축물정보로 한 번 자동 채웠는지 — 사용자가 고친 값을 덮지 않기 위한 표시 */
  pdfAutoFilled?: boolean;
  slopeOk: boolean;
  noOdor: boolean;
  buildingState: string;
  // 개별성 - 단지내
  direction: string;
  viewType: string;
  rooms: string;
  baths: string;
  households: string;
  parkingPerHouse: string;
  insideSurveyDone: boolean;
  repairState: string;
  insideNote: string;
}

export interface AuctionSummary {
  totalItems: number;
  wonItems: number;
  activeBids: number;
  totalBidAmount: number;
}

export interface AuctionSearchParams {
  keyword: string;
  lawdCode?: string;
  dealYmd?: string;
  onbidOnly?: boolean;
}
