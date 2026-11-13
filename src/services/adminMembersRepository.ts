// 운영 › 회원 관리 · 탈퇴 처리 — 운영자만 읽는다(firestore.rules: users 는 운영자 읽기, withdrawRequests 는 운영자 목록 · 고치기).
// 계정 자체(로그인 아이디)를 지우는 일은 서버 권한이 있어야 해서 여기서 하지 않는다 — 탈퇴는 '처리완료'로 적고 콘솔에서 지운다.
import { collection, doc, getDocs, onSnapshot, updateDoc, type Timestamp } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';

export interface MemberRow {
  uid: string;
  email: string;
  nickname: string;
  realName: string;
  phone: string;
  region: string;
  joinPath: string;
  joinPathDetail: string;
  referralCode: string;
  createdAt: string;
  /** 마지막 접속일 'YYYY-MM-DD' — 2026-11-13부터 적는다(그 전은 빈칸) */
  lastSeenAt: string;
}

export interface LeaveRow {
  uid: string;
  email: string;
  nickname: string;
  reason: string;
  status: 'requested' | 'done';
  requestedAt: number;
  doneAt?: string;
  doneBy?: string;
}

const need = () => { if (!firestore) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return firestore; };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** 연락처 — 쪼개 적은 칸(phone1~3)만 있는 회원도 있다 */
const phoneOf = (d: Record<string, unknown>) => str(d.phone) || [d.phone1, d.phone2, d.phone3].map(str).filter(Boolean).join('-');

/** 회원 목록(운영자) — 새로 가입한 사람이 위로. 한 번 읽는다(새로고침 단추로 다시) */
export const loadMembers = async (): Promise<MemberRow[]> => {
  const snap = await getDocs(collection(need(), 'users'));
  return snap.docs.map((s) => {
    const d = s.data() as Record<string, unknown>;
    return {
      uid: s.id, email: str(d.email), nickname: str(d.nickname), realName: str(d.realName), phone: phoneOf(d),
      region: str(d.region), joinPath: str(d.joinPath), joinPathDetail: str(d.joinPathDetail), referralCode: str(d.referralCode),
      createdAt: str(d.createdAt), lastSeenAt: str(d.lastSeenAt),
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** 탈퇴 신청(운영자) — 새 신청이 위로 */
export const subscribeLeaveRequests = (onRows: (rows: LeaveRow[]) => void, onError: (msg: string) => void): (() => void) => {
  if (!firestore) { onError(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return () => {}; }
  return onSnapshot(
    collection(firestore, 'withdrawRequests'),
    (snap) => onRows(snap.docs.map((s) => {
      const d = s.data() as Record<string, unknown>;
      const at = d.requestedAt as Timestamp | null | undefined;
      return {
        uid: s.id, email: str(d.email), nickname: str(d.nickname), reason: str(d.reason),
        status: d.status === 'done' ? 'done' : 'requested', requestedAt: at?.toMillis?.() ?? 0,
        doneAt: str(d.doneAt), doneBy: str(d.doneBy),
      } as LeaveRow;
    }).sort((a, b) => b.requestedAt - a.requestedAt)),
    (err) => { console.warn('[leave] 읽기 실패', err); onError('탈퇴 신청을 불러오지 못했습니다. 운영자 계정인지 확인해 주세요.'); },
  );
};

/** 처리완료로 적기 — 회원 계정은 Firebase 콘솔 › Authentication 에서 지운다 */
export const markLeaveDone = async (uid: string, by: string): Promise<void> => {
  await updateDoc(doc(need(), 'withdrawRequests', uid), { status: 'done', doneAt: new Date().toISOString(), doneBy: by });
};
