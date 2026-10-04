import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';

// 사용자별 앱 설정·캐시 — 디바이스를 옮겨도 따라오는 개인 데이터.
// (디바이스 단위 캐시인 테마/지오코드 캐시 등은 그대로 localStorage 사용)
export interface UserPrefs {
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

export const saveUserPrefs = async (uid: string, partial: Partial<UserPrefs>): Promise<void> => {
  if (!uid || !ready()) return;
  try {
    await setDoc(doc(firestore!, COLLECTION, uid), stripUndefined(partial), { merge: true });
  } catch (err) {
    // Firestore 규칙 미배포 시 거부될 수 있음 — 경고만 (저장 실패해도 앱은 계속 동작)
    console.warn('[userPrefs] save 실패 (Firestore 규칙 확인):', err);
  }
};
