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

/** 받아 온 값이 어떤 상태인가 —
 *  fresh  : 방금 받았거나 아직 쓸 만한 값
 *  stale  : 못 받아서 기한 지난 옛 값을 꺼내 썼다
 *  failed : 못 받았고 꺼내 쓸 옛 값도 없다 (0 이 아니라 '모름' 이다) */
export type FetchState = 'fresh' | 'stale' | 'failed';
export type FetchResult<T> = { value: T | null; savedAt: number; state: FetchState };

const wait = (ms: number) => new Promise((done) => { setTimeout(done, ms); });

/**
 * 읽어 보고, 없으면 받아 온다. 받다가 실패하면 한 번 더 해 보고,
 * 그래도 안 되면 기한이 지난 옛 값이라도 꺼내 쓴다.
 *
 * 왜 이렇게 하나 — 예전에는 실패하면 조용히 0 으로 떨어뜨렸다.
 * 화면에서는 '값이 0' 인 것과 '못 받아온 것' 이 똑같이 보여서,
 * 사용자가 모르는 숫자를 사실로 믿고 값을 매기게 된다.
 */
export const cachedEntryOrStale = async <T>(
  collection: string,
  id: string,
  maxAgeMs: number,
  load: () => Promise<T>,
  worthSaving: (value: T) => boolean = () => true,
  /** 꺼내 쓸 옛 값의 나이 한도 — 이보다 오래된 값은 쓰지 않고 '모름' 으로 둔다.
   *  너무 묵은 값을 지금 값인 양 보여 주면 틀린 판단을 부른다. */
  maxStaleMs = maxAgeMs * 30,
  retryDelayMs = 1200,
): Promise<FetchResult<T>> => {
  const hit = await readCacheEntry<T>(collection, id, maxAgeMs);
  if (hit) return { value: hit.value, savedAt: hit.savedAt, state: 'fresh' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fresh = await load();
      const savedAt = Date.now();
      if (worthSaving(fresh)) void writeCache(collection, id, fresh, savedAt);
      return { value: fresh, savedAt, state: 'fresh' };
    } catch {
      if (attempt === 0) await wait(retryDelayMs);
    }
  }
  // 두 번 다 안 됐다 — '같은 조회' 의 바로 직전 값을 꺼내 쓴다.
  // id 가 조회 조건(지역·물건종류·기간·판)을 그대로 담고 있어, 다른 조건의
  // 값이 섞일 수 없다. 나이 한도를 넘긴 값은 쓰지 않는다.
  const stale = await readCacheEntry<T>(collection, id, maxStaleMs);
  if (stale) return { value: stale.value, savedAt: stale.savedAt, state: 'stale' };
  return { value: null, savedAt: 0, state: 'failed' };
};

/** 캐시 없이 받아 오는 자리용 — 실패하면 한 번 더 해 보고, 그래도 안 되면 알린다 */
export const loadOrFail = async <T>(
  load: () => Promise<T>,
  retryDelayMs = 1200,
): Promise<FetchResult<T>> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { value: await load(), savedAt: Date.now(), state: 'fresh' };
    } catch {
      if (attempt === 0) await wait(retryDelayMs);
    }
  }
  return { value: null, savedAt: 0, state: 'failed' };
};

// ===== 1MB 를 넘는 값 — 조각으로 나눠 적는다 =====
// 문서 하나가 1MB 를 넘으면 Firestore 가 받지 않는다(시군구 4년치 실거래가 그렇다).
// 머리 문서(조각 수 · 적은 시각)와 조각 문서(id#0, id#1 …)로 나눈다. 조각은 글(JSON)을 잘라 담는다.
const PIECE = 700 * 1024;
export const readChunkedCache = async <T>(collection: string, id: string, maxAgeMs: number): Promise<T | null> => {
  if (!firestore || !id) return null;
  try {
    const head = await getDoc(doc(firestore, collection, id));
    if (!head.exists()) return null;
    const h = head.data() as { savedAt?: number; pieces?: number };
    const savedAt = Number(h.savedAt ?? 0);
    const pieces = Number(h.pieces ?? 0);
    if (!savedAt || !pieces || Date.now() - savedAt > maxAgeMs) return null;
    const parts = await Promise.all(Array.from({ length: pieces }, (_, i) => getDoc(doc(firestore!, collection, `${id}#${i}`))));
    if (parts.some((p) => !p.exists())) return null;
    const text = parts.map((p) => String((p.data() as { text?: string }).text ?? '')).join('');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};
export const writeChunkedCache = async <T>(collection: string, id: string, payload: T): Promise<void> => {
  if (!firestore || !id) return;
  try {
    const text = JSON.stringify(payload);
    const pieces = Math.max(1, Math.ceil(text.length / PIECE));
    await Promise.all(Array.from({ length: pieces }, (_, i) => setDoc(doc(firestore!, collection, `${id}#${i}`), { text: text.slice(i * PIECE, (i + 1) * PIECE) })));
    // 머리는 조각을 다 적은 뒤에 — 머리가 먼저 서면 반쯤 적힌 조각을 읽을 수 있다
    await setDoc(doc(firestore, collection, id), { savedAt: Date.now(), pieces, updatedAt: serverTimestamp() });
  } catch {
    /* 무시 */
  }
};
