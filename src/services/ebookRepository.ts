// 전자책 — 운영자가 올리고(콘텐츠 › 관리), 회원이 무료로 받는다(콘텐츠 › 전자책 · 콘텐츠 › 내콘텐츠).
//
// 책 한 권 = Firestore 'ebooks' 글 하나(표지는 줄인 그림을 글 안에) + 책 파일은 구글드라이브 링크(link), 또는 Storage 파일(ebooks/{id}/…).
// 받기는 회원가입 · 로그인한 회원만 — 받을 때마다 'ebookReceipts/{uid}_{책}' 에 남기고, 처음 받을 때만 받은 수를 1 올린다.
// Storage 파일 주소는 글에 적지 않는다 — 받을 때 로그인한 회원에게만 꺼내 준다. 드라이브 링크는 무료 책용(글에 그대로 보인다).
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef } from 'firebase/storage';
import { auth, firestore, firestoreDisabledReason, storage } from './firebase';

const BOOKS = 'ebooks';
const RECEIPTS = 'ebookReceipts';
/** 책 파일 조각 — 파일 저장소(결제 계정 필요) 대신 Firestore 글 여러 개에 나눠 담는다(글 하나 1MB 한도) */
const PARTS = 'ebookParts';
const PART_BYTES = 900 * 1024;
/** 올릴 수 있는 파일 크기 — 조각 글로 담으니 무료 DB 용량(1GB)을 생각해 50MB 까지 */
export const EBOOK_MAX_MB = 50;

export type Ebook = {
  id: string;
  title: string;
  /** 한줄설명 — 카드 제목 아래 한 줄 */
  summary: string;
  /** 내용 — 자세히보기 창에 나간다. 줄바꿈 · 빈 줄은 그대로, **굵게** 만 쓴다(1,000자까지) */
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
  /** 조각 수 — filePath 가 'parts:…' 이면 ebookParts 글 이만큼에 나눠 담겼다 */
  fileParts: number;
  published: boolean;
  /** 출시예정 — 카드 · 설명은 보이고 받기는 막는다(규칙도 막는다). 출시하면 false */
  upcoming: boolean;
  /** 출시일 'YYYY-MM-DD' — 출시예정일 때 받기 단추에 '11월 20일 출시'. 비워도 된다 */
  releaseDate: string;
  order: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type EbookKind = 'ebook' | 'report' | 'manual' | 'mobile';
export const EBOOK_KINDS: [EbookKind, string][] = [['ebook', '전자책'], ['report', '리포트'], ['manual', '매뉴얼'], ['mobile', '모바일앱']];
export const ebookKindLabel = (k: string): string => (EBOOK_KINDS.find(([v]) => v === k) ?? EBOOK_KINDS[0])[1];

export type EbookReceipt = { id: string; uid: string; ebookId: string; title: string; receivedAt: string };

export const newEbookId = (): string => `eb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyEbook = (): Ebook => ({
  id: '', title: '', summary: '', desc: '', tag: '', kind: 'ebook', price: 0, coverUrl: '', coverPath: '', link: '', filePath: '', fileName: '', fileSize: 0, fileParts: 0,
  published: false, upcoming: false, releaseDate: '', order: Date.now(), downloads: 0, createdAt: '', updatedAt: '',
});

/** 내용 글자 수 한도 */
export const EBOOK_DESC_MAX = 1000;

/** 카드에 나갈 한 줄 — 한줄설명이 없던 예전 책은 내용 첫 줄 */
export const ebookSummary = (b: Pick<Ebook, 'summary' | 'desc'>): string =>
  (b.summary || '').trim() || (b.desc || '').split('\n').map((l) => l.replace(/\*\*/g, '').trim()).find(Boolean) || '';

/** 내용 → HTML — 글은 그대로 막고(escape), **굵게** 만 살린다. 줄바꿈 · 빈 줄은 보이는 쪽이 white-space: pre-line 으로 */
export const ebookBodyHtml = (text: string): string =>
  (text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

/** 출시예정인가 — 보이기만 하고 받지 못한다 */
export const isUpcomingEbook = (b: Partial<Pick<Ebook, 'upcoming'>>): boolean => b.upcoming === true;
/** 출시예정 단추 글 — 출시일이 있으면 '11월 20일 출시', 없으면 '출시예정' */
export const ebookReleaseText = (b: Partial<Pick<Ebook, 'releaseDate'>>): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(b.releaseDate || '');
  return m ? `${Number(m[1])}월 ${Number(m[2])}일 출시` : '출시예정';
};

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

const PARTS_PREFIX = 'parts:';
const partId = (bookId: string, key: string, n: number) => `${bookId}_${key}_${n}`;
const inTime = <T>(p: Promise<T>, ms = 60000): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

/** 책 파일을 조각 글로 담는다 — onProgress(0~1) */
const writeParts = async (bookId: string, file: File, onProgress?: (r: number) => void): Promise<{ key: string; parts: number }> => {
  if (!firestore) throw new Error('연결되지 않았습니다.');
  const buf = new Uint8Array(await file.arrayBuffer());
  const key = Date.now().toString(36);
  const parts = Math.max(1, Math.ceil(buf.length / PART_BYTES));
  for (let n = 0; n < parts; n += 1) {
    const data = Bytes.fromUint8Array(buf.subarray(n * PART_BYTES, (n + 1) * PART_BYTES));
    await inTime(setDoc(doc(firestore, PARTS, partId(bookId, key, n)), { book: bookId, key, n, data }));
    onProgress?.((n + 1) / parts);
  }
  return { key, parts };
};

/** 예전 조각 지우기 — 파일을 바꾸거나 책을 지울 때 */
const dropParts = async (bookId: string, filePath: string, parts: number) => {
  if (!firestore || !filePath.startsWith(PARTS_PREFIX)) return;
  const key = filePath.slice(PARTS_PREFIX.length);
  for (let n = 0; n < parts; n += 1) {
    try { await deleteDoc(doc(firestore, PARTS, partId(bookId, key, n))); } catch { /* 이미 없으면 그만 */ }
  }
};

const dropFile = async (path: string) => {
  if (!storage || !path || path.startsWith(PARTS_PREFIX)) return;
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
    const { key, parts } = await writeParts(id, files.pdf, onProgress);
    const path = `${PARTS_PREFIX}${key}`;
    if (book.filePath && book.filePath !== path) { await dropParts(id, book.filePath, book.fileParts || 0); await dropFile(book.filePath); }
    next.filePath = path;
    next.fileParts = parts;
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
export const patchEbook = async (id: string, patch: Partial<Pick<Ebook, 'published' | 'order' | 'upcoming'>>): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? '연결되지 않았습니다.');
  await updateDoc(doc(firestore, BOOKS, id), patch);
};

/** 지우기(운영자) — 글과 파일 · 표지를 함께 */
export const removeEbook = async (book: Ebook): Promise<void> => {
  if (!firestore) throw new Error(firestoreDisabledReason ?? '연결되지 않았습니다.');
  await deleteDoc(doc(firestore, BOOKS, book.id));
  await dropParts(book.id, book.filePath, book.fileParts || 0);
  await dropFile(book.filePath);
  await dropFile(book.coverPath);
};

/**
 * 받기 — 로그인한 회원만(유료 · 무료 회원 모두 무료 책은 받는다). 유료 책은 아직 받지 못한다.
 * 받은 기록을 남기고(처음이면 받은 수 +1) 실제로 내려받는다.
 *  - 구글드라이브 링크면 win(누른 자리에서 미리 연 새 창)에서 드라이브로
 *  - 조각 글이면 모아서 PDF 파일로 바로 저장(원래 파일 이름)
 * 로그인 전이면 'login' 을 던진다 — 화면이 로그인 창을 띄운다.
 */
export const downloadEbook = async (
  book: Pick<Ebook, 'id' | 'title' | 'filePath' | 'price' | 'link' | 'fileName' | 'fileParts'> & Partial<Pick<Ebook, 'upcoming'>>,
  win?: Window | null,
): Promise<void> => {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('login');
  if (isUpcomingEbook(book)) throw new Error('출시예정 콘텐츠입니다. 출시한 뒤 받을 수 있습니다.');   // 규칙도 막는다
  if (isPaidEbook(book)) throw new Error('유료 콘텐츠는 결제를 붙인 뒤 받을 수 있습니다.');   // 규칙(firestore.rules)도 막는다
  if (!firestore) throw new Error('연결되지 않았습니다.');
  if (!hasEbookFile(book)) throw new Error('아직 파일이 올라오지 않은 책입니다.');
  const rid = `${uid}_${book.id}`;
  const rref = doc(firestore, RECEIPTS, rid);
  const first = !(await getDoc(rref)).exists();
  await setDoc(rref, { uid, ebookId: book.id, title: book.title, receivedAt: new Date().toISOString() });
  if (first) { try { await updateDoc(doc(firestore, BOOKS, book.id), { downloads: increment(1) }); } catch { /* 받은 수는 못 올려도 받기는 그대로 */ } }

  if (book.link) {   // 구글드라이브에서 바로
    const url = ebookLinkUrl(book.link);
    if (win) win.location.href = url; else window.location.href = url;
    return;
  }
  win?.close();
  let blob: Blob;
  if (book.filePath.startsWith(PARTS_PREFIX)) {
    const key = book.filePath.slice(PARTS_PREFIX.length);
    const chunks: Uint8Array[] = [];
    for (let n = 0; n < (book.fileParts || 0); n += 1) {
      const snap = await inTime(getDocFromServer(doc(firestore, PARTS, partId(book.id, key, n))));
      const data = snap.get('data') as Bytes | undefined;
      if (!data) throw new Error('책 파일 일부를 찾지 못했습니다. 운영자에게 알려 주세요.');
      chunks.push(data.toUint8Array());
    }
    blob = new Blob(chunks as BlobPart[], { type: /\.epub$/i.test(book.fileName) ? 'application/epub+zip' : 'application/pdf' });
  } else {
    if (!storage) throw new Error('연결되지 않았습니다.');
    blob = await (await fetch(await getDownloadURL(storageRef(storage, book.filePath)))).blob();
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = book.fileName || `${book.title}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
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
