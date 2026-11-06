import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';

// 사용자별 앱 설정·캐시 — 디바이스를 옮겨도 따라오는 개인 데이터.
// (디바이스 단위 캐시인 테마/지오코드 캐시 등은 그대로 localStorage 사용)
export interface UserPrefs {
  /** 화면 설정(정렬 · 보기 · 읽음 표시 · 마지막 물건 …) — services/uiPrefSync 가 localStorage 와 맞춘다 */
  ui?: Record<string, string>;
  /** 입찰달력 · 칸에 보일 항목(소재지 · 분류 · 중요도) — 기기마다 같게 */
  calendarShow?: Record<string, boolean>;
  // 늘 도는 중개업소 — 상담표의 상호 드롭다운과 '중개업소 관리' 화면이 같이 쓴다
  agencies?: Array<{ id: string; name: string; phone: string; rating?: string }>;
  // 관리자 도구 · 수요공급 분석에서 손으로 적는 세대수·매물수 (지역|종류|읍면동 열쇠)
  adminRegionManual?: Record<string, { units?: number; listings?: number }>;
  // 관리자 도구 · 실거래 조건검색에서 저장해 둔 검색조건
  adminDongFilter?: {
    sido?: string; districtCode?: string; kind?: string; dong?: string; periodMonths?: number;
    areaMin?: string; areaMax?: string; yearMin?: string; yearMax?: string;
  };
  // 낙찰이후 · 낙찰당일 체크리스트 — 사용자가 손으로 고친 표 (postWinBook.ts)
  postWinDay?: unknown[];
  /** 그 표가 어느 판의 기본 글에서 왔는지 (postWinChecklist.POST_WIN_VERSION) */
  postWinDayVersion?: number;
  /** 손으로 고쳐 저장한 표인지 — true 면 기본 글이 바뀌어도 덮지 않는다 */
  postWinDayEdited?: boolean;
  // 낙찰이후 · 사업자등록 표 (postWinBiz.ts)
  postWinBiz?: unknown[];
  postWinBizVersion?: number;
  postWinBizEdited?: boolean;
  // 낙찰이후 · 잔금·등기 표 (postWinLoan.ts)
  postWinLoan?: unknown[];
  postWinLoanVersion?: number;
  postWinLoanEdited?: boolean;
  // 낙찰이후 · 서식 — 사용자가 고쳐 저장한 서식 글({사건번호} 같은 자리표 포함). 빈 글이면 기본 서식
  postWinForms?: Record<string, string>;
  /** 낙찰이후 · 서식 — 낙찰자 이름 · 연락처(물건마다 같은 값) */
  postWinFormMe?: { winner?: string; phone?: string };
  /** 시장분석 · 호가분석 — 주소마다 적어 둔 호가 매물 줄 (종류.주소 열쇠) */
  caseTradeAsk?: Record<string, { case: unknown[]; sim: unknown[] }>;
  /** 웹 물건등록 — 마지막 결과 목록(줄 · 알림 · 마지막 시각 · 드라이브에 없는 물건 · 접힘). 앱 목록과 꼴이 달라 따로 둔다 */
  webImportList?: Record<string, unknown>;
  // 낙찰이후 · 명도 표 (postWinEvict.ts)
  postWinEvict?: unknown[];
  postWinEvictVersion?: number;
  postWinEvictEdited?: boolean;
  // 알림 설정 — 어떤 알림을 켜 둘지 (services/alerts.ts 의 AlertKey 가 열쇠)
  alertPrefs?: Record<string, boolean>;
  // 임장경로 — 한 사용자당 가장 최근 작업 (작업 진행 중 다른 메뉴 갔다와도 복원)
  fieldTripDraft?: Record<string, unknown> | null;
  // 임장경로 즐겨찾기 출발/도착 주소
  fieldTripFavorites?: string[];
  // PDF Import 화면
  /** 구글 드라이브 폴더 즐겨찾기 — 예전 자료는 주소 문자열만 들어 있다 */
  pdfImportFolderFavorites?: Array<string | { name?: string; url?: string }>;
  /** 스캔에 쓰려고 체크해 둔 폴더 주소들 */
  pdfImportSelectedFolders?: string[];
  pdfImportBanner?: string;              // 상단 안내 배너 텍스트
  pdfImportLastUpdate?: string;          // 마지막 import 시각
  pdfImportLastRows?: unknown[];         // 마지막 import 결과 미리보기
  /** AI 자동 분석 — 사용자 본인의 Gemini API 키(BYOK)와 켜짐 여부. 본인만 읽는 문서라 계정별로 둔다 */
  geminiKey?: string;
  geminiOn?: boolean;
}

const COLLECTION = 'userPrefs';

const ready = () => Boolean(firestore);

export const loadUserPrefs = async (uid: string): Promise<UserPrefs | null> => {
  if (!uid || !ready()) return null;
  try {
    const snap = await getDoc(doc(firestore!, COLLECTION, uid));
    if (!snap.exists()) return null;
    return snap.data() as UserPrefs;
  } catch (err) {
    console.warn('[userPrefs] load 실패:', err, firestoreDisabledReason);
    return null;
  }
};

const stripUndefined = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v))) as T;

/** 저장했으면 true — 실패해도 던지지 않는다(브라우저에 남은 옛 값을 지울지 이것으로 정한다) */
export const saveUserPrefs = async (uid: string, partial: Partial<UserPrefs>): Promise<boolean> => {
  if (!uid || !ready()) return false;
  try {
    await setDoc(doc(firestore!, COLLECTION, uid), stripUndefined(partial), { merge: true });
    return true;
  } catch (err) {
    // Firestore 규칙 미배포 시 거부될 수 있음 — 경고만 (저장 실패해도 앱은 계속 동작)
    console.warn('[userPrefs] save 실패 (Firestore 규칙 확인):', err);
    return false;
  }
};
