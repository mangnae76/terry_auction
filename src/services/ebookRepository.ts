// 전자책 — 운영자가 올리고(콘텐츠 › 관리), 회원이 무료로 받는다(콘텐츠 › 전자책 · 마이페이지 › 받은콘텐츠).
//
// 책 한 권 = Firestore 'ebooks' 글 하나 + Storage 파일(ebooks/{id}/…) · 표지(ebook-covers/{id}/…).
// 받기는 회원가입 · 로그인한 회원만 — 받을 때마다 'ebookReceipts/{uid}_{책}' 에 남기고, 처음 받을 때만 받은 수를 1 올린다.
// 파일 주소는 글에 적지 않는다 — 받을 때 로그인한 회원에게만 그때그때 꺼내 준다(Storage 규칙이 로그인을 본다).
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
  coverUrl: string;
  coverPath: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  published: boolean;
  order: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type EbookReceipt = { id: string; uid: string; ebookId: string; title: string; receivedAt: string };

export const newEbookId = (): string => `eb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyEbook = (): Ebook => ({
  id: '', title: '', desc: '', tag: '', coverUrl: '', coverPath: '', filePath: '', fileName: '', fileSize: 0,
  published: false, order: Date.now(), downloads: 0, createdAt: '', updatedAt: '',
});

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
const upload = (path: string, file: File, onProgress?: (r: number) => void): Promise<void> => new Promise((resolve, reject) => {
  if (!storage) { reject(new Error('파일 저장소가 연결되지 않았습니다.')); return; }
  const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
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
    await upload(path, files.pdf, onProgress);
    if (book.filePath && book.filePath !== path) await dropFile(book.filePath);
    next.filePath = path;
    next.fileName = files.pdf.name;
    next.fileSize = files.pdf.size;
  }
  if (files.cover) {
    if (!storage) throw new Error('파일 저장소가 연결되지 않았습니다.');
    const path = `ebook-covers/${id}/${Date.now()}.${extOf(files.cover.name, 'jpg')}`;
    await upload(path, files.cover);
    if (book.coverPath && book.coverPath !== path) await dropFile(book.coverPath);
    next.coverPath = path;
    next.coverUrl = await getDownloadURL(storageRef(storage, path));   // 표지는 손님도 본다 — 주소를 글에 적어 둔다
  }
  const { id: _omit, ...data } = next;
  await setDoc(doc(firestore, BOOKS, id), data);
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
 * 받기 — 로그인한 회원만. 받은 기록을 남기고(처음이면 받은 수 +1) 파일 주소를 돌려준다.
 * 로그인 전이면 'login' 을 던진다 — 화면이 로그인 창을 띄운다.
 */
export const receiveEbook = async (book: Pick<Ebook, 'id' | 'title' | 'filePath'>): Promise<string> => {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('login');
  if (!firestore || !storage) throw new Error('연결되지 않았습니다.');
  if (!book.filePath) throw new Error('아직 파일이 올라오지 않은 책입니다.');
  const rid = `${uid}_${book.id}`;
  const rref = doc(firestore, RECEIPTS, rid);
  const first = !(await getDoc(rref)).exists();
  await setDoc(rref, { uid, ebookId: book.id, title: book.title, receivedAt: new Date().toISOString() });
  if (first) { try { await updateDoc(doc(firestore, BOOKS, book.id), { downloads: increment(1) }); } catch { /* 받은 수는 못 올려도 받기는 그대로 */ } }
  return getDownloadURL(storageRef(storage, book.filePath));
};

/** 내가 받은 책 — 마이페이지 › 받은콘텐츠 */
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
