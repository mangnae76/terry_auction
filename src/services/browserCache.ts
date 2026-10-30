// 브라우저 안(IndexedDB)에 큰 조회 결과를 적어 둔다 — 시군구 4년치 실거래처럼 수 MB 가 되는 것.
// Firestore 는 문서 하나가 1MB 를 넘지 못해 통째로는 못 담는다. 브라우저 저장은 크기 걱정이 없고 가장 빠르다.
// 지워져도(사이트 데이터 삭제) 다시 받으면 그만인 값만 둔다.
const DB_NAME = 'myturn-cache';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = () => {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexedDB'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};

/** 적어 둔 값을 읽는다. 오래됐거나 없거나 못 읽으면 null */
export const browserCacheGet = async <T>(key: string, maxAgeMs: number): Promise<T | null> => {
  try {
    const db = await openDb();
    const hit = await new Promise<{ savedAt: number; value: T } | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as { savedAt: number; value: T } | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!hit || !hit.savedAt || Date.now() - hit.savedAt > maxAgeMs) return null;
    return hit.value;
  } catch {
    return null;
  }
};

/** 값을 적어 둔다. 실패해도 화면은 그대로 간다 */
export const browserCachePut = async (key: string, value: unknown) => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ savedAt: Date.now(), value: JSON.parse(JSON.stringify(value)) }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* 적지 못해도 그만 */
  }
};
