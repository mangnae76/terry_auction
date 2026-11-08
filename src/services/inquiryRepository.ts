// 1:1 문의 · 정보 오류 제보 — 회원이 고객센터에서 남기고, 운영자가 운영 › 문의함 · 제보 처리에서 답한다.
// 글은 inquiries 한 곳에 kind 로 가른다(정보오류제보는 제보 처리 칸, 나머지는 문의함).
// 쓰기 권한은 firestore.rules 가 지킨다 — 회원은 제 글만 보고 답변대기일 때만 지운다, 답은 운영자만 단다.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';

const COLLECTION = 'inquiries';

/** 문의 종류 — 단추 이름 그대로 적는다 */
export const INQUIRY_KINDS = ['이용문의', '결제문의', '오류신고', '정보오류제보', '제휴문의', '기타'] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];
/** 제보 처리 칸으로 가는 종류 — 경공매 정보(사건 · 금액 · 날짜)가 틀렸다는 신고 */
export const REPORT_KIND: InquiryKind = '정보오류제보';
export const isReport = (q: Pick<Inquiry, 'kind'>) => q.kind === REPORT_KIND;

export const INQUIRY_TITLE_MAX = 100;
export const INQUIRY_BODY_MAX = 2000;

export interface Inquiry {
  id: string;
  uid: string;
  email: string;
  nickname: string;
  kind: InquiryKind;
  title: string;
  body: string;
  /** 정보오류제보 — 어느 사건인지(없어도 됨) */
  caseNumber: string;
  status: 'open' | 'answered';
  answer?: string;
  answeredAt?: string;
  answeredBy?: string;
  createdAt: string;
}

const nowIso = () => new Date().toISOString();
const need = () => { if (!firestore) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return firestore; };
const rowsOf = (docs: Array<{ id: string; data: () => unknown }>): Inquiry[] =>
  docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inquiry, 'id'>) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** 내 문의 — 새 것이 위로 */
export const subscribeMyInquiries = (uid: string, onRows: (rows: Inquiry[]) => void, onError: (msg: string) => void): (() => void) => {
  if (!firestore || !uid) { onRows([]); return () => {}; }
  return onSnapshot(
    query(collection(firestore, COLLECTION), where('uid', '==', uid)),
    (snap) => onRows(rowsOf(snap.docs)),
    (err) => { console.warn('[inquiry] 내 문의 실패', err); onError('문의 목록을 불러오지 못했습니다. 새로고침해 주세요.'); },
  );
};

/** 모든 문의(운영자) — 새 것이 위로 */
export const subscribeAllInquiries = (onRows: (rows: Inquiry[]) => void, onError: (msg: string) => void): (() => void) => {
  if (!firestore) { onError(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return () => {}; }
  return onSnapshot(
    collection(firestore, COLLECTION),
    (snap) => onRows(rowsOf(snap.docs)),
    (err) => { console.warn('[inquiry] 문의함 실패', err); onError('문의함을 불러오지 못했습니다. 운영자 계정인지 확인해 주세요.'); },
  );
};

export const createInquiry = async (q: Pick<Inquiry, 'uid' | 'email' | 'nickname' | 'kind' | 'title' | 'body' | 'caseNumber'>): Promise<string> => {
  const db = need();
  const ref = await addDoc(collection(db, COLLECTION), {
    uid: q.uid,
    email: q.email,
    nickname: q.nickname,
    kind: q.kind,
    title: q.title.trim().slice(0, INQUIRY_TITLE_MAX),
    body: q.body.trim().slice(0, INQUIRY_BODY_MAX),
    caseNumber: q.kind === REPORT_KIND ? q.caseNumber.trim().slice(0, 40) : '',
    status: 'open',
    createdAt: nowIso(),
  });
  return ref.id;
};

/** 답하기(운영자) — 다시 부르면 답을 고친다 */
export const answerInquiry = async (id: string, answer: string, by: string): Promise<void> => {
  await updateDoc(doc(need(), COLLECTION, id), {
    status: 'answered',
    answer: answer.trim().slice(0, INQUIRY_BODY_MAX),
    answeredAt: nowIso(),
    answeredBy: by,
  });
};

/** 지우기 — 회원은 답변대기일 때만(규칙), 운영자는 언제든 */
export const removeInquiry = async (id: string): Promise<void> => {
  await deleteDoc(doc(need(), COLLECTION, id));
};
