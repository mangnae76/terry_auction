// 오류및제안 게시판(웹 커뮤니티) — 회원이 글을 쓰고, 누구나 읽고, 댓글을 단다.
// 글은 suggestPosts, 댓글은 suggestPosts/{id}/comments. 쓰기 권한은 firestore.rules 가 지킨다
// (내 글만 고치고 지운다 · 조회수는 1씩만 · 운영자는 모두 지운다).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';

const POSTS = 'suggestPosts';

export interface SuggestPost {
  id: string;
  title: string;
  body: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
  views: number;
  commentCount: number;
}

export interface SuggestComment {
  id: string;
  body: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
  /** 운영자가 단 댓글 — '운영자'로 보인다 */
  admin?: boolean;
}

const nowIso = () => new Date().toISOString();

/** 글 목록 — 새 글이 위로. 돌려주는 함수로 그만 듣는다 */
export const subscribeSuggestPosts = (onRows: (rows: SuggestPost[]) => void, onError: (msg: string) => void): (() => void) => {
  if (!firestore) { onError(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return () => {}; }
  return onSnapshot(
    query(collection(firestore, POSTS), orderBy('createdAt', 'desc')),
    (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SuggestPost, 'id'>) }))),
    (err) => onError(err.message),
  );
};

export const createSuggestPost = async (p: Pick<SuggestPost, 'title' | 'body' | 'authorUid' | 'authorName'>): Promise<string> => {
  if (!firestore) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.');
  const ref = await addDoc(collection(firestore, POSTS), { ...p, createdAt: nowIso(), views: 0, commentCount: 0 });
  return ref.id;
};

export const updateSuggestPost = async (id: string, p: Pick<SuggestPost, 'title' | 'body'>): Promise<void> => {
  if (!firestore) return;
  await updateDoc(doc(firestore, POSTS, id), { ...p, updatedAt: nowIso() });
};

export const deleteSuggestPost = async (id: string): Promise<void> => {
  if (!firestore) return;
  await deleteDoc(doc(firestore, POSTS, id));
};

/** 조회수 하나 올리기 — 실패해도 읽기는 그대로 */
export const bumpSuggestView = async (id: string): Promise<void> => {
  if (!firestore) return;
  try { await updateDoc(doc(firestore, POSTS, id), { views: increment(1) }); } catch { /* 조회수만 못 올린다 */ }
};

export const subscribeSuggestComments = (postId: string, onRows: (rows: SuggestComment[]) => void): (() => void) => {
  if (!firestore) return () => {};
  return onSnapshot(
    query(collection(firestore, POSTS, postId, 'comments'), orderBy('createdAt', 'asc')),
    (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SuggestComment, 'id'>) }))),
    () => onRows([]),
  );
};

export const addSuggestComment = async (postId: string, c: Omit<SuggestComment, 'id' | 'createdAt'>): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.');
  await addDoc(collection(firestore, POSTS, postId, 'comments'), { ...c, createdAt: nowIso() });
  try { await updateDoc(doc(firestore, POSTS, postId), { commentCount: increment(1) }); } catch { /* 숫자만 못 올린다 */ }
};

export const deleteSuggestComment = async (postId: string, commentId: string): Promise<void> => {
  if (!firestore) return;
  await deleteDoc(doc(firestore, POSTS, postId, 'comments', commentId));
  try { await updateDoc(doc(firestore, POSTS, postId), { commentCount: increment(-1) }); } catch { /* 숫자만 못 내린다 */ }
};

/** 작성자 가리기 — 김** · 정* (첫 글자만) */
export const maskName = (name: string): string => {
  const n = (name || '').trim();
  if (!n) return '회원';
  return n[0] + '*'.repeat(Math.max(1, n.length - 1));
};
