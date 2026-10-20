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

export type BoardKind = 'event' | 'notice' | 'update';

export interface BoardPost {
  id: string;
  kind: BoardKind;
  /** 왼쪽 꼬리표 — 안내·점검·신규·기능·개선 … (배너는 비워 둔다) */
  tag: string;
  /** 제목 — 목록에 적히는 한 줄 */
  title: string;
  /** 본문 — 눌러서 펼치면 보인다 (없어도 된다) */
  body?: string;
  /** 그림 한 장 — 줄여서 글과 함께 담는다 (없어도 된다) */
  imageUrl?: string;
  /** 옛 글은 제목을 여기 담았다 — 읽을 때만 쓴다 */
  text?: string;
  /** 공지 맨 위에 붙박이로 둘 줄 */
  star?: boolean;
  /** 이벤트에만 — 큰 배너로 띄울지 */
  banner?: boolean;
  badge?: string;
  cta?: string;
  period?: string;
  /** 옛 배너 글의 설명 — 읽을 때만 쓴다 (지금은 본문을 쓴다) */
  desc?: string;
  /** 작은 것이 위로 */
  order: number;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'boardPosts';

/** 제목 — 옛 글(text)도 함께 읽는다 */
export const titleOf = (p: BoardPost) => (p.title ?? '').trim() || (p.text ?? '').trim();

/** 글에 담을 그림은 작게 줄인다 — 모든 사용자가 글과 함께 받아 가는 자리다 */
const IMAGE_MAX_BYTES = 220 * 1024;
const IMAGE_STEPS: Array<{ maxEdge: number; quality: number }> = [
  { maxEdge: 1000, quality: 0.72 },
  { maxEdge: 820, quality: 0.66 },
  { maxEdge: 640, quality: 0.6 },
  { maxEdge: 480, quality: 0.5 },
];

const dataUrlBytes = (dataUrl: string) => {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4);
};

export const compressBoardImage = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('그림을 줄이지 못했습니다.')); return; }
      let last = '';
      for (const step of IMAGE_STEPS) {
        const scale = Math.min(1, step.maxEdge / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        last = canvas.toDataURL('image/jpeg', step.quality);
        if (dataUrlBytes(last) <= IMAGE_MAX_BYTES) { resolve(last); return; }
      }
      reject(new Error('그림이 너무 큽니다. 더 작은 그림을 올려 주세요.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('그림을 읽지 못했습니다.')); };
    img.src = url;
  });

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
