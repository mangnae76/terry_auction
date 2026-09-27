import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

const isStorageReady = () => Boolean(storage);

const blobFromDataUrl = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
};

const guessExtension = (file: File | Blob): string => {
  const t = file.type.toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  if (t.includes('heic')) return 'heic';
  return 'jpg';
};

export const uploadFloorPlan = async (auctionId: string, fileOrDataUrl: File | Blob | string): Promise<string> => {
  if (!isStorageReady() || !storage) {
    throw new Error('Firebase Storage가 활성화되지 않았습니다. Firebase Console에서 Storage를 시작해 주세요.');
  }
  const blob = typeof fileOrDataUrl === 'string' ? blobFromDataUrl(fileOrDataUrl) : fileOrDataUrl;
  const ext = guessExtension(blob);
  const path = `floor-plans/${auctionId}/floor-plan.${ext}`;
  const r = storageRef(storage, path);
  try {
    await withTimeout(uploadBytes(r, blob, { contentType: blob.type || `image/${ext}` }), 30000, '평면도 업로드');
    return await withTimeout(getDownloadURL(r), 10000, '업로드 URL 조회');
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    const msg = e instanceof Error ? e.message : String(e);
    if (code.includes('unauthorized') || msg.includes('permission')) {
      throw new Error('Firebase Storage 권한 거부. Console → Storage → Rules에서 쓰기 허용 필요.');
    }
    if (code.includes('object-not-found') || code.includes('bucket')) {
      throw new Error('Firebase Storage 버킷이 없습니다. Console → Storage → 시작 클릭 필요.');
    }
    throw new Error(`${msg}${code ? ` (${code})` : ''}`);
  }
};

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 시간 초과 (${ms / 1000}초)`)), ms)),
  ]);

export const uploadSitePhoto = async (auctionId: string, file: File | Blob): Promise<string> => {
  if (!isStorageReady() || !storage) {
    throw new Error('Firebase Storage가 활성화되지 않았습니다. Firebase Console에서 Storage를 시작해 주세요.');
  }
  const ext = guessExtension(file);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `site-photos/${auctionId}/${stamp}-${rand}.${ext}`;
  const r = storageRef(storage, path);
  try {
    await withTimeout(uploadBytes(r, file, { contentType: file.type || `image/${ext}` }), 30000, '사진 업로드');
    return await withTimeout(getDownloadURL(r), 10000, '업로드 URL 조회');
  } catch (e) {
    const code = (e as { code?: string })?.code ?? '';
    const msg = e instanceof Error ? e.message : String(e);
    if (code.includes('unauthorized') || msg.includes('permission')) {
      throw new Error('Firebase Storage 권한 거부. Console → Storage → Rules에서 쓰기 허용 필요.');
    }
    if (code.includes('object-not-found') || code.includes('bucket')) {
      throw new Error('Firebase Storage 버킷이 없습니다. Console → Storage → 시작 클릭 필요.');
    }
    throw new Error(`${msg}${code ? ` (${code})` : ''}`);
  }
};

export const deleteStorageFile = async (downloadUrl: string): Promise<void> => {
  if (!isStorageReady() || !storage) return;
  try {
    const u = new URL(downloadUrl);
    // Firebase download URL 패턴: /o/{encodedPath}?alt=media&token=...
    const match = u.pathname.match(/\/o\/(.+)$/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    const r = storageRef(storage, path);
    await deleteObject(r);
  } catch {
    // ignore (already deleted, or not a Firebase URL)
  }
};

export const fetchAndUploadFloorPlan = async (auctionId: string, externalUrl: string): Promise<string> => {
  // 외부 URL의 이미지를 다운로드 → Firebase Storage 업로드 → download URL 반환
  const res = await fetch(externalUrl);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  return uploadFloorPlan(auctionId, blob);
};
