// 회원탈퇴 신청 — withdrawRequests/{uid} 한 장. 지우는 일은 되돌릴 수 없어 화면이 바로 지우지 않고,
// 신청을 남기면 운영자가 확인해 처리한다(남은 이용기간 · 전화번호 3개월 보관 안내와 같이). 본인은 신청 · 취소만 한다.
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { firestore } from './firebase';

const COLLECTION = 'withdrawRequests';

export type WithdrawRequest = { uid: string; email: string; nickname: string; reason: string; status: 'requested' | 'done'; requestedAt: number };

export const loadWithdrawRequest = async (uid: string): Promise<WithdrawRequest | null> => {
  if (!uid || !firestore) return null;
  const snap = await getDoc(doc(firestore, COLLECTION, uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Omit<WithdrawRequest, 'requestedAt'> & { requestedAt?: Timestamp | null };
  return { ...d, requestedAt: d.requestedAt?.toMillis?.() ?? Date.now() };
};

export const requestWithdraw = async (r: { uid: string; email: string; nickname: string; reason: string }): Promise<void> => {
  if (!firestore) throw new Error('DB에 연결되지 않았습니다');
  await setDoc(doc(firestore, COLLECTION, r.uid), {
    uid: r.uid, email: r.email, nickname: r.nickname, reason: r.reason.slice(0, 500), status: 'requested', requestedAt: serverTimestamp(),
  });
};

/** 신청 취소 — 아직 처리 전일 때만 */
export const cancelWithdraw = async (uid: string): Promise<void> => {
  if (!firestore) throw new Error('DB에 연결되지 않았습니다');
  await deleteDoc(doc(firestore, COLLECTION, uid));
};
