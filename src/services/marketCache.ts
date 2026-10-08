// 공공데이터 조회 결과를 Firestore에 모아 둔다.
//
// 왜 필요한가 — data.go.kr 하루 한도는 '서비스키 기준'이라 사람이 늘수록 금방 닿는다.
// 같은 동·같은 단지를 보는 물건이 여럿이면 조회도 여러 번 나가는데, 결과는 모두 같다.
// 그래서 물건이 아니라 '지역·단지' 기준으로 적어 두고 다 같이 읽는다.
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from './firebase';

/** 얼마나 오래 쓸 것인가 */
export const CACHE_TTL = {
  /** 실거래는 날마다 쌓인다 */
  trades: 24 * 60 * 60 * 1000,
  /** 단지 이력도 같은 주기 */
  place: 24 * 60 * 60 * 1000,
  /** 세대수는 건물이 들어서야 바뀐다 */
  units: 30 * 24 * 60 * 60 * 1000,
} as const;

/** 문서 id로 쓸 수 있게 다듬는다 ('/'는 경로 구분자라 못 쓴다) */
export const cacheKey = (...parts: Array<string | number>) =>
  parts.map((p) => String(p).replace(/\s+/g, '').replace(/[/\\.#$[\]]/g, '-')).join('_');

type Stored<T> = { savedAt?: number; payload?: T };

/** 값과 '언제 적어 둔 값인지'를 같이 준다 — 화면에 '갱신 시각'을 쓰려면 이게 필요하다 */
export type CacheEntry<T> = { value: T; savedAt: number };

/** 저장해 둔 값을 적어 둔 시각과 함께 읽는다. 오래됐거나 없으면 null */
export const readCacheEntry = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
): Promise<CacheEntry<T> | null> => {
  if (!firestore || !id) return null;
  try {
    const snap = await getDoc(doc(firestore, collection, id));
    if (!snap.exists()) return null;
    const data = snap.data() as Stored<T>;
    const savedAt = Number(data.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
    if (data.payload === undefined || data.payload === null) return null;
    return { value: data.payload as T, savedAt };
  } catch {
    // 캐시는 있으면 좋은 것이다 — 못 읽어도 화면은 실시간 조회로 돌아간다
    return null;
  }
};

/** 저장해 둔 값을 읽는다. 오래됐거나 없으면 null */
export const readCache = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
): Promise<T | null> => (await readCacheEntry<T>(collection, id, maxAgeMs))?.value ?? null;

/** 받아 온 값을 적어 둔다. 실패해도 화면은 그대로 간다 */
export const writeCache = async <T>(
  collection: string,
  id: string,
  payload: T,
  savedAt: number = Date.now(),
): Promise<void> => {
  if (!firestore || !id) return;
  try {
    await setDoc(doc(firestore, collection, id), {
      savedAt,
      updatedAt: serverTimestamp(),
      payload,
    });
  } catch {
    /* 무시 */
  }
};

/** 읽어 보고 없으면 받아 와서 적어 둔다 — 값이 '언제 적힌 것인지'까지 돌려준다.
 *  새로 받아 온 경우에는 지금 시각이 곧 갱신 시각이다. */
export const cachedEntry = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
  load: () => Promise<T>,
  /** 적어 둘 만한 결과인지 (덜 받아온 값을 굳히지 않으려고) */
  worthSaving: (value: T) => boolean = () => true,
): Promise<CacheEntry<T>> => {
  const hit = await readCacheEntry<T>(collection, id, maxAgeMs);
  if (hit) return hit;
  const fresh = await load();
  const savedAt = Date.now();
  if (worthSaving(fresh)) void writeCache(collection, id, fresh, savedAt);
  return { value: fresh, savedAt };
};

/** 읽어 보고 없으면 받아 와서 적어 둔다 */
export const cached = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
  load: () => Promise<T>,
  worthSaving: (value: T) => boolean = () => true,
): Promise<T> => (await cachedEntry(collection, id, maxAgeMs, load, worthSaving)).value;
