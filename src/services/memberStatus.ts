// 회원 이용 상태 — 차단 · 이용 기한(운영 › 회원 관리에서 운영자가 정한다, 2026-11-13 사용자).
// 회원 문서(users)는 본인이 고칠 수 있어 따로 memberStatus/{uid} 에 둔다 — 운영자만 쓰고, 본인은 읽기만(firestore.rules).
// 웹 · 앱은 로그인할 때 이 값을 읽어 차단 · 기한 만료면 안내 화면만 보여 준다(memberBlockOf). 운영자는 늘 통과.
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';
import { isAdminEmail } from './accessControl';

export interface MemberStatus {
  /** 차단 — 켜면 웹 · 앱을 쓰지 못한다 */
  blocked: boolean;
  /** 차단 사유(회원에게도 보인다) */
  reason: string;
  /** 이용 기한 'YYYY-MM-DD'(그날까지 쓴다). 비우면 기한 없음 */
  until: string;
  /** 마지막으로 고친 운영자 메일 */
  by: string;
}

export const EMPTY_STATUS: MemberStatus = { blocked: false, reason: '', until: '', by: '' };

const need = () => { if (!firestore) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return firestore; };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const toStatus = (d: Record<string, unknown> | undefined): MemberStatus => ({
  blocked: d?.blocked === true, reason: str(d?.reason), until: /^\d{4}-\d{2}-\d{2}$/.test(str(d?.until)) ? str(d?.until) : '', by: str(d?.by),
});

/** 오늘(이 기기 시각) 'YYYY-MM-DD' */
export const todayYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 기한 지남 — 기한 날까지는 쓴다 */
export const isExpired = (s: MemberStatus, today = todayYmd()) => !!s.until && s.until < today;
/** 기한까지 남은 날(오늘 0) — 기한 없으면 null */
export const daysLeft = (s: MemberStatus, today = todayYmd()) => {
  if (!s.until) return null;
  return Math.round((new Date(`${s.until}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
};
export type MemberState = 'active' | 'blocked' | 'expired';
export const stateOf = (s: MemberStatus, today = todayYmd()): MemberState => (s.blocked ? 'blocked' : isExpired(s, today) ? 'expired' : 'active');

/** 운영자 — 모든 회원 상태(문서가 없는 회원은 빠진다 = 기본 이용 중) */
export const loadAllStatus = async (): Promise<Record<string, MemberStatus>> => {
  const snap = await getDocs(collection(need(), 'memberStatus'));
  return Object.fromEntries(snap.docs.map((s) => [s.id, toStatus(s.data() as Record<string, unknown>)]));
};
/** 운영자 — 한 회원 상태 저장(통째로) */
export const saveStatus = async (uid: string, s: MemberStatus, by: string): Promise<void> => {
  await setDoc(doc(need(), 'memberStatus', uid), { blocked: s.blocked, reason: s.reason, until: s.until, by, updatedAt: serverTimestamp() });
};

/** 로그인한 사람 — 내 상태를 읽어 막을지 정한다. 운영자는 늘 통과, 못 읽으면(네트워크 · 규칙) 막지 않는다 */
export const memberBlockOf = async (uid: string, email: string | null | undefined): Promise<{ state: Exclude<MemberState, 'active'>; reason: string; until: string } | null> => {
  if (!uid || isAdminEmail(email) || !firestore) return null;
  try {
    const snap = await getDoc(doc(firestore, 'memberStatus', uid));
    if (!snap.exists()) return null;
    const s = toStatus(snap.data() as Record<string, unknown>);
    const st = stateOf(s);
    return st === 'active' ? null : { state: st, reason: s.reason, until: s.until };
  } catch {
    return null;
  }
};

/** 마지막 접속 — 하루 한 번만 적는다(같은 날 다시 열면 쓰지 않는다). 회원 문서는 본인이 쓸 수 있다 */
export const touchLastSeen = async (uid: string): Promise<void> => {
  if (!uid || !firestore) return;
  const key = `ta.lastSeen.${uid}`; const today = todayYmd();
  try { if (localStorage.getItem(key) === today) return; } catch { /* 그만 */ }
  try {
    await updateDoc(doc(firestore, 'users', uid), { lastSeenAt: today });
    try { localStorage.setItem(key, today); } catch { /* 그만 */ }
  } catch { /* 회원 문서가 아직 없으면 다음에 */ }
};
