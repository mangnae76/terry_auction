import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firestore } from './firebase';

// 현장사진은 Firestore에 장당 1문서로 저장한다.
// 경매 문서(auctions/{id}) 안에 base64를 넣으면 1MiB 문서 한계를 넘기 때문에
// auctionPhotos 컬렉션으로 분리하고, 경매 문서에는 photoId만 남긴다.
const COLLECTION_NAME = 'auctionPhotos';
const AUCTION_COLLECTION = 'auctions';

// 사용량 누계 문서. 총량을 알려고 사진 문서를 전부 읽으면 base64까지 내려받게 되므로
// 저장/삭제할 때마다 바이트 수를 증감시켜 누계만 따로 관리한다.
const USAGE_COLLECTION = 'photoUsage';

// Firestore 문서 한계 1MiB. base64 문자열 외 필드와 오버헤드를 감안해 여유를 둔다.
const MAX_DATA_URL_BYTES = 900 * 1024;

// 사진에 배정하는 예산. 무료 한도 1 GiB는 경매·자금 문서와 인덱스 용량까지 함께 쓰므로
// 전부를 사진에 주면 한도를 넘는다. 900 MiB만 사진 몫으로 두고 나머지를 여유로 남긴다.
export const PHOTO_BUDGET_BYTES = 900 * 1024 * 1024;

// 한 번 업로드에서 삭제를 시도할 최대 장수 (폭주 방지)
const MAX_EVICTIONS_PER_UPLOAD = 50;

// 압축 단계 — 순서대로 시도하며 MAX_DATA_URL_BYTES 아래로 떨어지면 채택
const COMPRESSION_STEPS: Array<{ maxEdge: number; quality: number }> = [
  { maxEdge: 1024, quality: 0.7 },
  { maxEdge: 1024, quality: 0.55 },
  { maxEdge: 800, quality: 0.5 },
  { maxEdge: 640, quality: 0.45 },
  { maxEdge: 512, quality: 0.4 },
];

// 문서 ID를 시간순으로 정렬 가능하게 만든다.
// 이렇게 해야 orderBy(documentId())만으로 "예전 것부터"를 얻을 수 있고,
// createdAt으로 정렬할 때 필요한 복합 색인을 만들지 않아도 된다.
const createPhotoId = (): string => {
  const stamp = Date.now().toString().padStart(14, '0');
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${stamp}-${rand}`;
};

const loadImage = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다. (HEIC 등 미지원 형식일 수 있습니다)'));
    };
    img.src = url;
  });

// dataURL의 실제 바이트 수 — base64는 원본의 약 4/3
const dataUrlBytes = (dataUrl: string): number => {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.ceil((b64.length * 3) / 4);
};

const drawToDataUrl = (img: HTMLImageElement, maxEdge: number, quality: number): string => {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 압축에 실패했습니다.');
  // JPEG은 투명도가 없으므로 흰 배경을 깔아 PNG 투명 영역이 검게 나오는 것을 막는다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
};

export const compressImage = async (file: File | Blob): Promise<string> => {
  const img = await loadImage(file);
  let last = '';
  for (const step of COMPRESSION_STEPS) {
    last = drawToDataUrl(img, step.maxEdge, step.quality);
    if (dataUrlBytes(last) <= MAX_DATA_URL_BYTES) return last;
  }
  throw new Error('사진 용량이 너무 큽니다. 더 작은 이미지를 사용해 주세요.');
};

export const isPhotoId = (entry: string): boolean =>
  !entry.startsWith('http') && !entry.startsWith('data:');

const usageRef = (uid: string) => doc(firestore!, USAGE_COLLECTION, uid);

export const readUsageBytes = async (uid: string): Promise<number> => {
  if (!firestore || !uid) return 0;
  const snap = await getDoc(usageRef(uid));
  const value = snap.exists() ? Number(snap.data().totalBytes) : 0;
  // 누계가 어긋나 음수가 되더라도 0 아래로는 내려가지 않게 한다
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const addUsageBytes = async (uid: string, delta: number): Promise<void> => {
  if (!firestore || !uid || delta === 0) return;
  await setDoc(usageRef(uid), { totalBytes: increment(delta), updatedAt: Date.now() }, { merge: true });
};

export type EvictedPhoto = { photoId: string; auctionId: string; bytes: number };

// 예산을 넘지 않도록 오래된 사진부터 지운다.
// 사진 문서에는 base64가 들어 있어 한 번에 여러 건을 읽으면 전송량이 커지므로 1건씩 처리한다.
const evictOldestPhotos = async (
  uid: string,
  needBytes: number,
  currentTotal: number,
): Promise<EvictedPhoto[]> => {
  if (!firestore) return [];
  const evicted: EvictedPhoto[] = [];
  let total = currentTotal;

  for (let i = 0; i < MAX_EVICTIONS_PER_UPLOAD; i += 1) {
    if (total + needBytes <= PHOTO_BUDGET_BYTES) break;
    const snap = await getDocs(
      query(
        collection(firestore, COLLECTION_NAME),
        where('uid', '==', uid),
        orderBy(documentId()),
        limit(1),
      ),
    );
    if (snap.empty) break;
    const oldest = snap.docs[0];
    const data = oldest.data() as { auctionId?: string; bytes?: number; dataUrl?: string };
    const bytes = Number(data.bytes) || dataUrlBytes(data.dataUrl ?? '');
    const auctionId = data.auctionId ?? '';

    await deleteDoc(oldest.ref);
    // 경매 문서에 남은 참조도 함께 끊어야 깨진 썸네일이 남지 않는다
    if (auctionId) {
      await updateDoc(doc(firestore, AUCTION_COLLECTION, auctionId), {
        sitePhotos: arrayRemove(oldest.id),
      }).catch(() => undefined);
    }
    total -= bytes;
    evicted.push({ photoId: oldest.id, auctionId, bytes });
  }

  if (evicted.length > 0) {
    const freed = evicted.reduce((sum, e) => sum + e.bytes, 0);
    await addUsageBytes(uid, -freed);
  }
  return evicted;
};

export const saveSitePhoto = async (
  auctionId: string,
  uid: string,
  file: File | Blob,
): Promise<{ photoId: string; dataUrl: string; evicted: EvictedPhoto[] }> => {
  if (!firestore) throw new Error('Firestore에 연결되지 않았습니다.');
  if (!uid) throw new Error('로그인이 필요합니다.');
  const dataUrl = await compressImage(file);
  const bytes = dataUrlBytes(dataUrl);

  // 새 사진을 넣었을 때 예산을 넘으면 넘지 않을 만큼 오래된 것부터 비운다
  const total = await readUsageBytes(uid);
  const evicted = await evictOldestPhotos(uid, bytes, total);

  const photoId = createPhotoId();
  await setDoc(doc(firestore, COLLECTION_NAME, photoId), {
    uid,
    auctionId,
    dataUrl,
    bytes,
    createdAt: Date.now(),
  });
  await addUsageBytes(uid, bytes);
  // dataUrl을 함께 돌려주어 저장 직후 화면 표시에 재조회가 필요 없게 한다
  return { photoId, dataUrl, evicted };
};

export const loadSitePhoto = async (photoId: string): Promise<string> => {
  if (!firestore) return '';
  const snap = await getDoc(doc(firestore, COLLECTION_NAME, photoId));
  if (!snap.exists()) return '';
  return (snap.data().dataUrl as string | undefined) ?? '';
};

export const deleteSitePhoto = async (photoId: string, uid: string): Promise<void> => {
  if (!firestore) return;
  const ref = doc(firestore, COLLECTION_NAME, photoId);
  const snap = await getDoc(ref);
  const bytes = snap.exists() ? Number(snap.data().bytes) || 0 : 0;
  await deleteDoc(ref);
  if (bytes > 0) await addUsageBytes(uid, -bytes);
};
