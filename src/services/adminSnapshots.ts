// 경매지번 분석을 그 시점 값 그대로 남겨 둔다 (스냅샷).
//
// 왜 값으로 남기나 — 국토부 거래도 공시가격도 시간이 지나면 바뀐다. 입찰을
// 판단한 근거는 '그때 본 숫자'여야 하므로, 다시 계산하지 않고 박제한다.
// 거래 표(수십 줄)는 담지 않는다. 기준으로 삼은 두 줄만 있으면 지표가 선다.
//
// userPrefs 가 아니라 따로 컬렉션을 쓰는 까닭: 분석 도구가 앱과 갈라져도
// 이 자료는 그대로 따라간다. 앱 설정과 엉키지 않는다.
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, updateDoc, where,
} from 'firebase/firestore';
import { firestore } from './firebase';
import type { CaseTradeRow, CasePropertyType } from './caseTradeAnalysis';
import type { ApartPrice } from './vworldApi';

const COLLECTION = 'adminSnapshots';

export interface CaseSnapshot {
  id?: string;
  uid: string;
  /** 목록에 적히는 이름 — 비우면 주소로 대신한다 */
  label: string;
  memo: string;
  savedAt: number;
  /** 다시 분석할 때 쓰는 입력값 */
  address: string;
  kind: CasePropertyType;
  years: number;
  /** 화면 머리의 칩 — 지역·지번·호실을 그대로 적어 둔다 */
  spot: string;
  /** 공부상 전용면적 (㎡) */
  baseAreaM2: number;
  /** 그때의 공동주택가 (없으면 null) */
  price: ApartPrice | null;
  /** 전세가 비율 (기본 126) */
  rate: number;
  /** 기준으로 삼은 두 줄 */
  sale: CaseTradeRow | null;
  jeonse: CaseTradeRow | null;
}

const ready = () => Boolean(firestore);

/** 저장해 둔 목록 — 최근 것이 먼저 */
export const listSnapshots = async (uid: string, max = 100): Promise<CaseSnapshot[]> => {
  if (!uid || !ready()) return [];
  const q = query(
    collection(firestore!, COLLECTION),
    where('uid', '==', uid),
    orderBy('savedAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as CaseSnapshot), id: d.id }));
};

/** 새로 하나 남긴다 — 고친 자취가 남게 덮어쓰기보다 이쪽을 기본으로 쓴다 */
export const addSnapshot = async (snap: CaseSnapshot): Promise<string> => {
  if (!ready()) throw new Error('저장소를 쓸 수 없습니다.');
  const { id: _drop, ...body } = snap;
  const ref = await addDoc(collection(firestore!, COLLECTION), body);
  return ref.id;
};

/** 열어 둔 스냅샷을 그 자리에 고쳐 쓴다 */
export const updateSnapshot = async (id: string, snap: CaseSnapshot): Promise<void> => {
  if (!ready()) throw new Error('저장소를 쓸 수 없습니다.');
  const { id: _drop, ...body } = snap;
  await updateDoc(doc(firestore!, COLLECTION, id), body as Record<string, unknown>);
};

export const removeSnapshot = async (id: string): Promise<void> => {
  if (!ready()) return;
  await deleteDoc(doc(firestore!, COLLECTION, id));
};
