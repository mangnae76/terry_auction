// 전자책 — 운영자가 올리고(콘텐츠 › 관리), 회원이 무료로 받는다(콘텐츠 › 전자책 · 콘텐츠 › 내콘텐츠).
//
// 책 한 권 = Firestore 'ebooks' 글 하나(표지는 줄인 그림을 글 안에) + 책 파일은 구글드라이브 링크(link), 또는 Storage 파일(ebooks/{id}/…).
// 받기는 회원가입 · 로그인한 회원만 — 받을 때마다 'ebookReceipts/{uid}_{책}' 에 남기고, 처음 받을 때만 받은 수를 1 올린다.
// Storage 파일 주소는 글에 적지 않는다 — 받을 때 로그인한 회원에게만 꺼내 준다. 드라이브 링크는 무료 책용(글에 그대로 보인다).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { auth, firestore, firestoreDisabledReason, storage } from './firebase';

const BOOKS = 'ebooks';
const RECEIPTS = 'ebookReceipts';
/** 올릴 수 있는 파일 크기 — 규칙(storage.rules)과 같이 맞춘다 */
export const EBOOK_MAX_MB = 100;

export type Ebook = {
  id: string;
  title: string;
  desc: string;
  /** 꼬리표 — 기초 · 필수 · 실전 … (카드 제목 앞 [ ]) */
  tag: string;
  /** 분류 — 콘텐츠 어느 탭에 나가는가 */
  kind: EbookKind;
  /** 값 — 0 이면 무료(로그인한 회원 누구나 바로 받음), 1 이상이면 유료(결제 뒤 받기 — 결제는 아직 붙이지 않음) */
  price: number;
  /** 표지 — 줄인 그림(data:)을 글 안에 담는다. 예전에 저장소에 올린 표지면 그 주소 */
  coverUrl: string;
  coverPath: string;
  /** 구글드라이브 공유 링크 — 있으면 받기는 여기서 바로 내려받는다(파일 저장소를 쓰지 않음) */
  link: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  published: boolean;
  order: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type EbookKind = 'ebook' | 'report' | 'mobile';
export const EBOOK_KINDS: [EbookKind, string][] = [['ebook', '전자책'], ['report', '리포트'], ['mobile', '모바일앱']];
export const ebookKindLabel = (k: string): string => (EBOOK_KINDS.find(([v]) => v === k) ?? EBOOK_KINDS[0])[1];

export type EbookReceipt = { id: string; uid: string; ebookId: string; title: string; receivedAt: string };

export const newEbookId = (): string => `eb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyEbook = (): Ebook => ({
  id: '', title: '', desc: '', tag: '', kind: 'ebook', price: 0, coverUrl: '', coverPath: '', link: '', filePath: '', fileName: '', fileSize: 0,
  published: false, order: Date.now(), downloads: 0, createdAt: '', updatedAt: '',
});

/** 유료인가 — 값이 1원 이상 */
export const isPaidEbook = (b: Pick<Ebook, 'price'>): boolean => (Number(b.price) || 0) > 0;

/** 구글드라이브 공유 링크 → 바로 내려받는 주소. 드라이브 링크가 아니면 그대로 */
export const ebookLinkUrl = (link: string): string => {
  const id = /\/d\/([\w-]{10,})/.exec(link)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(link)?.[1];
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : link;
};
/** 받을 파일이 있는가 — 링크든 올린 파일이든 */
export const hasEbookFile = (b: Pick<Ebook, 'link' | 'filePath'>): boolean => !!(b.link || b.filePath);

/** 표지 그림 줄이기 — 가로 600px JPEG 로, 글 하나에 담을 만큼(300KB 아래) */
const coverDataUrl = async (file: File): Promise<string> => {
  const img = await createImageBitmap(file);
  const w = Math.min(600, img.width);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((img.height * w) / img.width);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.85;
  let url = c.toDataURL('image/jpeg', q);
  while (url.length > 300_000 && q > 0.4) { q -= 0.15; url = c.toDataURL('image/jpeg', q); }
  return url;
};

/** 책 목록 — 운영자는 내린 책까지 다(all), 회원 · 손님은 올린 책만 */
export const subscribeEbooks = (
  onData: (rows: Ebook[]) => void,
  onError: (msg: string) => void,
  opts: { all?: boolean } = {},
): Unsubscribe => {
  if (!firestore) { onError(firestoreDisabledReason ?? '연결되지 않았습니다.'); return () => undefined; }
  const base = collection(firestore, BOOKS);
  return onSnapshot(
    opts.all ? query(base) : query(base, where('published', '==', true)),
    (snap) => {
      const rows: Ebook[] = [];
      snap.forEach((d) => rows.push({ ...emptyEbook(), ...(d.data() as Partial<Ebook>), id: d.id }));
      rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      onData(rows);
    },
    (err) => { console.warn('[ebook] 동기화 실패', err); onError('전자책 목록을 불러오지 못했습니다. 새로고침해 주세요.'); },
  );
};

const extOf = (name: string, fallback: string) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? fallback).toLowerCase();

/** 파일 하나 올리기 — 몇 % 올렸는지 onProgress(0~1) 로 알린다 */
const upload = (path: string, file: File, onProgress?: (r: number) => void, download = false): Promise<void> => new Promise((resolve, reject) => {
  if (!storage) { reject(new Error('파일 저장소가 연결되지 않았습니다.')); return; }
  const task = uploadBytesResumable(storageRef(storage, path), file, {
    contentType: file.type || 'application/octet-stream',
    // 책 파일은 열 때 새 탭에 띄우지 않고 바로 내려받게 — 원래 파일 이름 그대로
    ...(download ? { contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}` } : {}),
  });
  task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve());
});

const dropFile = async (path: string) => {
  if (!storage || !path) return;
  try { await deleteObject(storageRef(storage, path)); } catch { /* 이미 없으면 그만 */ }
};

/**
 * 책 담기(운영자) — 새 파일을 골랐으면 올리고 예전 파일은 지운다.
 * onProgress(0~1) — 책 파일 올리는 진행(표지는 작아서 따로 알리지 않는다)
 */
export const saveEbook = async (
  book: Ebook,
  files: { pdf?: File | null; cover?: File | null } = {},
  onProgress?: (r: number) => void,
): Promise<Ebook> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? '연결되지 않았습니다.');
  const id = book.id || newEbookId();
  const now = new Date().toISOString();
  const next: Ebook = { ...book, id, updatedAt: now, createdAt: book.createdAt || now };
  if (files.pdf) {
    if (files.pdf.size > EBOOK_MAX_MB * 1024 * 1024) throw new Error(`파일이 ${EBOOK_MAX_MB}MB 보다 큽니다.`);
    const path = `ebooks/${id}/${Date.now()}.${extOf(files.pdf.name, 'pdf')}`;
    await upload(path, files.pdf, onProgress, true);
    if (book.filePath && book.filePath !== path) await dropFile(book.filePath);
    next.filePath = path;
    next.fileName = files.pdf.name;
    next.fileSize = files.pdf.size;
  }
  if (files.cover) {
    // 표지는 줄여서 글 안에 담는다 — 파일 저장소(결제 계정 필요)를 거치지 않는다
    next.coverUrl = await coverDataUrl(files.cover);
    if (book.coverPath) await dropFile(book.coverPath);
    next.coverPath = '';
  }
  const { id: _omit, ...data } = next;
  // 서버가 끝내 답하지 않으면(연결 끊김 · 다른 창이 막음) 20초 뒤 알려 준다 — '올리는 중'에 멈춰 있지 않게
  await Promise.race([
    setDoc(doc(firestore, BOOKS, id), data),
    new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 20000)),
  ]);
  return next;
};

/** 올리기 · 내리기 · 차례만 바꾸기(운영자) — 파일은 건드리지 않는다 */
export const patchEbook = async (id: string, patch: Partial<Pick<Ebook, 'published' | 'order'>>): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? '연결되지 않았습니다.');
  await updateDoc(doc(firestore, BOOKS, id), patch);
};

/** 지우기(운영자) — 글과 파일 · 표지를 함께 */
export const removeEbook = async (book: Ebook): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? '연결되지 않았습니다.');
  await deleteDoc(doc(firestore, BOOKS, book.id));
  await dropFile(book.filePath);
  await dropFile(book.coverPath);
};

/**
 * 받기 — 로그인한 회원만(유료 · 무료 회원 모두 무료 책은 받는다). 유료 책은 아직 받지 못한다. 받은 기록을 남기고(처음이면 받은 수 +1) 파일 주소를 돌려준다.
 * 로그인 전이면 'login' 을 던진다 — 화면이 로그인 창을 띄운다.
 */
export const receiveEbook = async (book: Pick<Ebook, 'id' | 'title' | 'filePath' | 'price' | 'link'>): Promise<string> => {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('login');
  if (isPaidEbook(book)) throw new Error('유료 콘텐츠는 결제를 붙인 뒤 받을 수 있습니다.');   // 규칙(firestore.rules)도 막는다
  if (!firestore) throw new Error('연결되지 않았습니다.');
  if (!hasEbookFile(book)) throw new Error('아직 파일이 올라오지 않은 책입니다.');
  const rid = `${uid}_${book.id}`;
  const rref = doc(firestore, RECEIPTS, rid);
  const first = !(await getDoc(rref)).exists();
  await setDoc(rref, { uid, ebookId: book.id, title: book.title, receivedAt: new Date().toISOString() });
  if (first) { try { await updateDoc(doc(firestore, BOOKS, book.id), { downloads: increment(1) }); } catch { /* 받은 수는 못 올려도 받기는 그대로 */ } }
  if (book.link) return ebookLinkUrl(book.link);   // 구글드라이브에서 바로
  if (!storage) throw new Error('연결되지 않았습니다.');
  return getDownloadURL(storageRef(storage, book.filePath));
};

/** 내가 받은 책 — 콘텐츠 › 내콘텐츠 */
export const subscribeMyReceipts = (onData: (rows: EbookReceipt[]) => void, onError: (msg: string) => void): Unsubscribe => {
  const uid = auth?.currentUser?.uid;
  if (!firestore || !uid) { onData([]); return () => undefined; }
  return onSnapshot(
    query(collection(firestore, RECEIPTS), where('uid', '==', uid)),
    (snap) => {
      const rows: EbookReceipt[] = [];
      snap.forEach((d) => rows.push({ ...(d.data() as Omit<EbookReceipt, 'id'>), id: d.id }));
      rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      onData(rows);
    },
    (err) => { console.warn('[ebook] 받은 목록 실패', err); onError('받은 콘텐츠를 불러오지 못했습니다. 새로고침해 주세요.'); },
  );
};

/** 책 하나 — 받은 목록에서 다시 받을 때 파일 자리를 찾는다 */
export const getEbook = async (id: string): Promise<Ebook | null> => {
  if (!firestore) return null;
  const s = await getDoc(doc(firestore, BOOKS, id));
  return s.exists() ? { ...emptyEbook(), ...(s.data() as Partial<Ebook>), id: s.id } : null;
};
