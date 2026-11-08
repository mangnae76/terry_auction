// 운영자 계정 목록 — 기본 2계정(accessControl.BASE_ADMIN_EMAILS)을 뺀 나머지를 DB adminConfig/main.admins 에 둔다.
// 운영 › 접근 권한 관리에서 더하고 뺀다. 운영자만 읽고 쓴다(firestore.rules) — 운영자가 아니면 읽기가 막혀 빈 목록으로 본다.
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';
import { setExtraAdmins } from './accessControl';

export const ADMIN_MAX = 20;
const ref = () => (firestore ? doc(firestore, 'adminConfig', 'main') : null);

/** 받을 때마다 accessControl 에도 깔고 'admins:changed' 를 알린다(웹 껍데기가 운영 단추 · 칩을 다시 그리게) */
let stop: (() => void) | null = null;
let forUid = '';
export const startAdminSync = (uid: string) => {
  if (uid === forUid) return;
  forUid = uid;
  stop?.(); stop = null;
  setExtraAdmins(null);
  const r = ref();
  if (!uid || !r) return;
  stop = onSnapshot(
    r,
    (s) => {
      setExtraAdmins(s.exists() ? ((s.data().admins as string[]) ?? []) : null);
      window.dispatchEvent(new CustomEvent('admins:changed'));
    },
    () => {   // 운영자가 아니면 막힌다 — 이 계정은 DB 목록에 없다
      setExtraAdmins([]);
      window.dispatchEvent(new CustomEvent('admins:changed'));
    },
  );
};

/** 운영 화면용 — 문서가 없으면 null */
export const subscribeAdminConfig = (onData: (admins: string[] | null, meta: { updatedAt: string; updatedBy: string }) => void, onError: (msg: string) => void): (() => void) => {
  const r = ref();
  if (!r) { onError(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return () => {}; }
  return onSnapshot(
    r,
    (s) => {
      const d = s.exists() ? s.data() : null;
      onData(d ? ((d.admins as string[]) ?? []) : null, { updatedAt: String(d?.updatedAt ?? ''), updatedBy: String(d?.updatedBy ?? '') });
    },
    (err) => { console.warn('[adminConfig] 읽기 실패', err); onError('운영자 목록을 불러오지 못했습니다. 운영자 계정인지 확인해 주세요.'); },
  );
};

export const saveAdmins = async (admins: string[], by: string): Promise<void> => {
  const r = ref();
  if (!r) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.');
  const list = [...new Set(admins.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, ADMIN_MAX);
  await setDoc(r, { admins: list, updatedAt: new Date().toISOString(), updatedBy: by });
};
