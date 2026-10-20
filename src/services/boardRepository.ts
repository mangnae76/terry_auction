// 공지·이벤트·업데이트 글 — 관리자가 올리면 앱이 그대로 읽는다.
//
// 한 컬렉션(boardPosts)에 종류(kind)로 나눠 담는다.
// 읽기는 로그인한 사용자 모두, 쓰기는 관리자만 (firestore.rules 의 isAdmin).
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';

export type BoardKind = 'event' | 'notice' | 'update' | 'banner';

export interface BoardPost {
  id: string;
  kind: BoardKind;
  /** 왼쪽 꼬리표 — 안내·점검·신규·기능·개선 … (배너는 비워 둔다) */
  tag: string;
  /** 한 줄 글 (배너는 제목) */
  text: string;
  /** 공지 맨 위에 붙박이로 둘 줄 */
  star?: boolean;
  /** 배너 전용 */
  badge?: string;
  desc?: string;
  cta?: string;
  period?: string;
  /** 작은 것이 위로 */
  order: number;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'boardPosts';

export const newBoardId = () => `bp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 글 목록을 실시간으로 받는다 — 차례는 받아서 코드에서 매긴다 (복합 색인을 만들지 않는다) */
export const subscribeBoardPosts = (
  onData: (rows: BoardPost[]) => void,
  onError: (msg: string) => void,
): Unsubscribe => {
  if (!firestore) {
    onError(firestoreDisabledReason ?? 'Firestore 미연결');
    return () => undefined;
  }
  return onSnapshot(
    query(collection(firestore, COLLECTION)),
    (snap) => {
      const rows: BoardPost[] = [];
      snap.forEach((d) => rows.push({ ...(d.data() as BoardPost), id: d.id }));
      rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      onData(rows);
    },
    (err) => onError(`글 동기화 실패: ${err.message}`),
  );
};

export const saveBoardPost = async (post: BoardPost): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? 'Firestore 미연결');
  await setDoc(doc(firestore, COLLECTION, post.id), { ...post, updatedAt: new Date().toISOString() }, { merge: true });
};

export const removeBoardPost = async (id: string): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? 'Firestore 미연결');
  await deleteDoc(doc(firestore, COLLECTION, id));
};
