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

/** 저장해 둔 값을 읽는다. 오래됐거나 없으면 null */
export const readCache = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
): Promise<T | null> => {
  if (!firestore || !id) return null;
  try {
    const snap = await getDoc(doc(firestore, collection, id));
    if (!snap.exists()) return null;
    const data = snap.data() as Stored<T>;
    const savedAt = Number(data.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
    return (data.payload ?? null) as T | null;
  } catch {
    // 캐시는 있으면 좋은 것이다 — 못 읽어도 화면은 실시간 조회로 돌아간다
    return null;
  }
};

/** 받아 온 값을 적어 둔다. 실패해도 화면은 그대로 간다 */
export const writeCache = async <T>(
  collection: string,
  id: string,
  payload: T,
): Promise<void> => {
  if (!firestore || !id) return;
  try {
    await setDoc(doc(firestore, collection, id), {
      savedAt: Date.now(),
      updatedAt: serverTimestamp(),
      payload,
    });
  } catch {
    /* 무시 */
  }
};

/** 읽어 보고 없으면 받아 와서 적어 둔다 */
export const cached = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
  load: () => Promise<T>,
  /** 적어 둘 만한 결과인지 (덜 받아온 값을 굳히지 않으려고) */
  worthSaving: (value: T) => boolean = () => true,
): Promise<T> => {
  const hit = await readCache<T>(collection, id, maxAgeMs);
  if (hit !== null) return hit;
  const fresh = await load();
  if (worthSaving(fresh)) void writeCache(collection, id, fresh);
  return fresh;
};
