// 자금관리 — 4개 탭의 데이터 모델.
// 모든 record는 uid 필드로 사용자별 격리 (Firestore 규칙).

// 공통 메타
export interface FinanceBase {
  id: string;
  uid: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// 1) 사업계좌 자금입출금 관리 — cashFlow
export interface CashFlowRecord extends FinanceBase {
  ownerName: string;       // 소유자 (구분)
  flowType: '입금' | '출금'; // 종류
  amount: number;          // 원
  date: string;            // YYYY-MM-DD
  note: string;            // 비고
}

// 2) 사업지출내역 — businessExpense
export interface BusinessExpenseRecord extends FinanceBase {
  auctionId: string;       // 물건 ID — 빈 문자열 가능
  auctionLabel: string;    // 물건명 (UI용 캐시)
  profitCategory: string;  // 수익분석 항목 (예: 기타사업비)
  memo: string;            // 구분 (메모) (예: 소유권이전)
  detail: string;          // 명세 (예: 경매보증금)
  amountWithVat: number;   // 비용 (VAT 포함, 원)
  date: string;            // YYYY-MM-DD
  note: string;            // 비고
}

// 2-1) 인테리어 비용 — interiorExpense
// 꼴은 사업지출과 같되 자리를 따로 둔다 (자금관리와 섞이지 않는다)
export interface InteriorExpenseRecord extends FinanceBase {
  auctionId: string;       // 물건 ID — 빈 문자열 가능
  auctionLabel: string;    // 물건명 (UI용 캐시)
  /** 어느 표의 줄인지 — 'bid' 업체 비딩 · 'cost' 인테리어 비용 */
  kind: 'bid' | 'cost';
  work: string;            // 작업내용 (예: 도배, 바닥)
  status: string;          // 현황 (예정 · 진행 · 완료)
  startDate: string;       // 예상시작 YYYY-MM-DD
  endDate: string;         // 예상완료 YYYY-MM-DD
  amountWithVat: number;   // 비용 (VAT 포함, 원)
  vendor: string;          // 업체명
  phone: string;           // 연락처
  note: string;            // 비고
  /** 예전에 쓰던 결제일 — 새 자료는 startDate 를 쓴다 */
  date?: string;
}

// 3) 유류비 & 식대지출 사용내역서 — fuelMeal
export interface FuelMealRecord extends FinanceBase {
  region: string;          // 사용지역 (예: 인천서구)
  store: string;           // 사용처/구매처
  category: string;        // 사용구분 (유류/식음료/문구류/쓰레기봉투 등)
  amount: number;          // 지출 (원)
  card: string;            // 구매카드 (예: 국민신용카드)
  users: string[];         // 사용자 (다중)
  date: string;            // YYYY-MM-DD
  note: string;            // 비고
}

// 4) 물품구매 지출상세 — itemPurchase
export interface ItemPurchaseRecord extends FinanceBase {
  auctionId: string;       // 물건 (선택 가능)
  auctionLabel: string;
  category: string;        // 인테리어/가전 등
  description: string;     // 상세내역
  quantity: number;
  unitPrice: number;       // 단가 (원)
  subtotal: number;        // 계 = quantity * unitPrice
  totalWithVat: number;    // 합계(VAT 포함)
  vendor: string;          // 구매업체/구매처
  vendorUrl?: string;      // 구매처 웹주소 — 적어 두면 구매처를 눌러 바로 간다
  card: string;            // 사용카드
  user: string;            // 사용자 (단일)
  shippingFee: number;     // 배송비
  date: string;            // YYYY-MM-DD
  note: string;            // 비고
}

// 'tax' 는 세금관리 화면을 들여온 탭 — 자금관리 안에서 같이 본다
export type FinanceTabKey = 'cashFlow' | 'businessExpense' | 'fuelMeal' | 'itemPurchase' | 'tax';

export type PeriodKey = 'thisMonth' | 'thisYear' | 'all' | 'custom';
