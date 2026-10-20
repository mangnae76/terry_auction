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
  /** 옛 글 — 이벤트 안에서 배너로 띄우던 표시 (지금은 kind='banner' 로 따로 쓴다) */
  banner?: boolean;
  badge?: string;
  cta?: string;
  period?: string;
  /** 배너에 적는 단축 글 — 배너 칸에 한 줄로 들어간다 */
  desc?: string;
  /** 배너 칸에 띄울지 — 끄면 이벤트 목록에만 선다 */
  showBanner?: boolean;
  /** 이벤트 목록에도 한 줄로 넣을지 — 그때 본문(body)이 상세 글이 된다 */
  alsoEvent?: boolean;
  /**
   * 꼬리말 예약 — 안내 → 진행 → 마감 으로 때맞춰 바뀌게 한다.
   * 적어 둔 때가 지난 것 중 가장 늦은 것이 지금 꼬리말이 된다.
   */
  tagPlan?: Array<{ tag: string; at: string }>;
  /** 꼬리말을 손으로 고정할지 — 켜면 예약을 보지 않고 고른 꼬리말 그대로 둔다 */
  tagManual?: boolean;
  /** 이벤트가 열리는 때 — 글을 올리고 내리는 때(startAt·endAt)와 다른 값이다 */
  eventStartAt?: string;
  /** 이벤트가 닫히는 때 */
  eventEndAt?: string;
  /** 올렸는가 — false 면 작성 중이라 앱에 나가지 않는다 (옛 글에는 없다 = 올린 글) */
  published?: boolean;
  /** 처음 올린 때 — 사용자에게 보이는 '등록'은 이 시각이다 (창을 연 때가 아니다) */
  postedAt?: string;
  /** 올릴 때 — 비우면 바로. 'YYYY-MM-DDTHH:mm' (현지 시각) */
  startAt?: string;
  /** 내릴 때 — 비우면 계속 둔다 */
  endAt?: string;
  /** 작은 것이 위로 */
  order: number;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'boardPosts';

/** 지금 시각을 입력칸(datetime-local)과 같은 꼴로 — 이 꼴끼리는 글자 비교로도 앞뒤가 맞는다 */
export const nowLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 지금 내보낼 글인가.
 * 당분간은 앱에서 걸러 보여 준다 — 나중에 서버가 때맞춰 올리고 내리면 이 함수만 그쪽을 보면 된다.
 */
export const isLive = (p: BoardPost, now = nowLocal()): boolean => {
  if (p.published === false) return false;
  if (p.startAt && p.startAt > now) return false;
  if (p.endAt && p.endAt < now) return false;
  return true;
};

/**
 * 지금 보여 줄 꼬리말.
 * 예약을 적어 두지 않았거나 아직 첫 때가 되지 않았으면 적어 둔 꼬리말 그대로 둔다.
 */
export const tagAt = (p: BoardPost, now = nowLocal()): string => {
  if (p.tagManual) return p.tag;
  const done = (p.tagPlan ?? [])
    .filter((x) => x.at && x.at <= now)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  return done.length ? done[done.length - 1].tag : p.tag;
};

/** 운영 목록에 붙일 상태 — 작성중 / 예약 / 게시중 / 종료 */
export const scheduleState = (p: BoardPost, now = nowLocal()): '작성중' | '예약' | '게시중' | '종료' => {
  if (p.published === false) return '작성중';
  if (p.startAt && p.startAt > now) return '예약';
  if (p.endAt && p.endAt < now) return '종료';
  return '게시중';
};

/**
 * 예약한 때를 사람이 읽는 기간 글로 — '2026.10.01 ~ 10.31'.
 * 같은 해면 뒤쪽 해는 적지 않고, 0시·23시59분처럼 뻔한 시각은 적지 않는다.
 */
export const periodLabel = (startAt?: string, endAt?: string): string => {
  const ymd = (v: string) => v.slice(0, 10).replace(/-/g, '.');
  const md = (v: string) => `${v.slice(5, 7)}.${v.slice(8, 10)}`;
  const hm = (v: string, end: boolean) => {
    const t = v.slice(11, 16);
    if (!t || t === '00:00' || (end && t === '23:59')) return '';
    return ` ${t}`;
  };
  if (startAt && endAt) {
    const sameYear = startAt.slice(0, 4) === endAt.slice(0, 4);
    return `${ymd(startAt)}${hm(startAt, false)} ~ ${sameYear ? md(endAt) : ymd(endAt)}${hm(endAt, true)}`;
  }
  if (startAt) return `${ymd(startAt)}${hm(startAt, false)} 부터`;
  if (endAt) return `${ymd(endAt)}${hm(endAt, true)} 까지`;
  return '';
};

/** 올린 때(ISO) → '오후 3:24' — 보는 사람 시각으로 적는다 */
export const timeLabel = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const half = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 올린 때(ISO) → '2026.10.20' — 보는 사람 시각으로 적는다 */
export const dayLabel = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

/** 사용자에게 보일 등록 때 — '등록 2026.10.20 오후 3:24'. 수정 때는 보여 주지 않는다 */
export const postedLabel = (postedAt?: string): string => {
  if (!postedAt) return '';
  return `등록 ${dayLabel(postedAt)} ${timeLabel(postedAt)}`.trim();
};

/** 줄 오른쪽에 좁게 적을 날짜 — '등록 26.10.20' */
export const shortDayLabel = (iso?: string): string => (iso ? `등록 ${dayLabel(iso).slice(2)}` : '');

/**
 * 배너에 적을 기간 — 날짜까지만 적는다. '2026.10.01 ~ 10.31'
 * (배너는 좁고 훑어보는 자리라 시각은 상세 보기에서만 보여 준다)
 */
export const dayRangeLabel = (startAt?: string, endAt?: string): string => {
  const ymd = (v: string) => v.slice(0, 10).replace(/-/g, '.');
  const md = (v: string) => `${v.slice(5, 7)}.${v.slice(8, 10)}`;
  if (startAt && endAt) {
    const sameYear = startAt.slice(0, 4) === endAt.slice(0, 4);
    return `${ymd(startAt)} ~ ${sameYear ? md(endAt) : ymd(endAt)}`;
  }
  if (startAt) return `${ymd(startAt)} 부터`;
  if (endAt) return `${ymd(endAt)} 까지`;
  return '';
};

/** 'YYYY-MM-DDTHH:mm' → '오전12시' / '오후3시30분' */
const clockText = (v: string): string => {
  const h = Number(v.slice(11, 13));
  const m = Number(v.slice(14, 16));
  if (Number.isNaN(h)) return '';
  const half = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half}${h12}시${m ? `${m}분` : ''}`;
};

/**
 * 이벤트가 열리는 때 — '26.10.20 오전12시~오후3시까지'.
 * 같은 날이면 날짜를 한 번만 적는다.
 */
export const eventPeriodLabel = (startAt?: string, endAt?: string): string => {
  const day = (v: string) => v.slice(2, 10).replace(/-/g, '.');
  if (startAt && endAt) {
    const sameDay = startAt.slice(0, 10) === endAt.slice(0, 10);
    return sameDay
      ? `${day(startAt)} ${clockText(startAt)}~${clockText(endAt)}까지`
      : `${day(startAt)} ${clockText(startAt)} ~ ${day(endAt)} ${clockText(endAt)}까지`;
  }
  if (startAt) return `${day(startAt)} ${clockText(startAt)}부터`;
  if (endAt) return `${day(endAt)} ${clockText(endAt)}까지`;
  return '';
};

/** 'YYYY-MM-DDTHH:mm' → '10.20 09:00' */
export const whenLabel = (v?: string): string =>
  v ? `${v.slice(5, 7)}.${v.slice(8, 10)} ${v.slice(11, 16)}` : '';

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

/**
 * 글 담기.
 * touch=false 면 수정 시각을 건드리지 않는다 — 차례 바꾸기·올리고 내리기처럼
 * 글이 달라지지 않은 일에 '수정 날짜'가 바뀌면 보는 사람이 헷갈린다.
 */
export const saveBoardPost = async (post: BoardPost, opts: { touch?: boolean } = {}): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? 'Firestore 미연결');
  const updatedAt = opts.touch === false ? (post.updatedAt ?? post.createdAt) : new Date().toISOString();
  await setDoc(doc(firestore, COLLECTION, post.id), { ...post, updatedAt }, { merge: true });
};

export const removeBoardPost = async (id: string): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? 'Firestore 미연결');
  await deleteDoc(doc(firestore, COLLECTION, id));
};
