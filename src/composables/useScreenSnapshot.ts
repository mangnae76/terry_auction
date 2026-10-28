// 화면 되살리기 — 마지막으로 받은 자료를 이 브라우저(IndexedDB)에 남겨 두고,
// 새로고침하거나 다른 화면에 갔다 와도 그대로 다시 그린다.
// localStorage 는 5MB 남짓이라 다른 저장(물건등록 목록 등)과 겹치면 넘쳐 조용히 못 남겼다 — IndexedDB 는 넉넉하다.
// 공공데이터 호출 자체는 워커가 저장해 아낀다 — 여기는 '화면이 비지 않게' 하는 몫이다.
// 칩(SnapChip)이 지금 상태를 알린다: 방금 받아 저장 · 저장해 둔 걸 되살림 · 저장 못 함.
import { computed, ref } from 'vue';

export type SnapState = { kind: 'updated' | 'restored' | 'fail'; at: number } | null;

const DB_NAME = 'ta-screen-snapshots';
const STORE = 'snap';
let dbp: Promise<IDBDatabase> | null = null;
const db = () => {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbp = null; reject(req.error); };
    });
  }
  return dbp;
};
const idbGet = async <T>(key: string): Promise<T | null> => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
};
const idbPut = async (key: string, value: unknown) => {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export function useScreenSnapshot<T extends object>(key: string) {
  const state = ref<SnapState>(null);
  // 예전에 localStorage 에 남겼던 것 — 자리만 차지하므로 치운다
  try { localStorage.removeItem(key); } catch { /* 그만 */ }

  /** 받아 온 자료를 남긴다 — 못 남기면 '저장 못 함' */
  const save = async (data: T) => {
    const savedAt = Date.now();
    try {
      // 반응형 껍데기를 벗겨 순수한 값으로 (IndexedDB 는 Proxy 를 못 담는다)
      await idbPut(key, JSON.parse(JSON.stringify({ ...data, savedAt })));
      state.value = { kind: 'updated', at: savedAt };
    } catch {
      state.value = { kind: 'fail', at: savedAt };
    }
  };

  /** 남겨 둔 자료 — 없으면 null. 꺼냈으면 칩은 '저장된 자료' */
  const restore = async (): Promise<(T & { savedAt: number }) | null> => {
    try {
      const snap = await idbGet<T & { savedAt: number }>(key);
      if (!snap) return null;
      state.value = { kind: 'restored', at: snap.savedAt };
      return snap;
    } catch {
      return null;
    }
  };

  /** 남겨 둔 자료의 일부만 고친다(보던 동을 바꿨을 때 등) — 칩은 그대로 */
  const patch = async (fields: Partial<T>, when?: (snap: T) => boolean) => {
    try {
      const snap = await idbGet<T>(key);
      if (snap && (!when || when(snap))) await idbPut(key, JSON.parse(JSON.stringify({ ...snap, ...fields })));
    } catch { /* 못 남겨도 그만 */ }
  };

  const at = (t: number) => {
    const d = new Date(t);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(2)}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  /** 칩에 쓸 글과 모양 — 글은 '26.10.29 15:37 조회' 하나로(방금 받은 것은 초록 · 저장해 둔 것은 파랑, 색으로만 가른다) */
  const chip = computed(() => {
    const st = state.value;
    if (!st) return null;
    if (st.kind === 'fail') return { tone: 'fail', text: '저장 못 함 — 새로고침하면 다시 조회해야 합니다' };
    if (st.kind === 'updated') return { tone: 'ok', text: `${at(st.at)} 조회` };
    return { tone: 'saved', text: `${at(st.at)} 조회` };
  });

  return { state, save, restore, patch, chip };
}
