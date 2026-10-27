// 화면 되살리기 — 마지막으로 받은 자료를 이 브라우저(localStorage)에 남겨 두고,
// 새로고침하거나 다른 화면에 갔다 와도 그대로 다시 그린다.
// 공공데이터 호출 자체는 워커가 저장해 아낀다 — 여기는 '화면이 비지 않게' 하는 몫이다.
// 칩(SnapChip)이 지금 상태를 알린다: 방금 받아 저장 · 저장해 둔 걸 되살림 · 저장 못 함.
import { computed, ref } from 'vue';

export type SnapState = { kind: 'updated' | 'restored' | 'fail'; at: number } | null;

export function useScreenSnapshot<T extends object>(key: string) {
  const state = ref<SnapState>(null);

  /** 받아 온 자료를 남긴다 — 자리가 모자라면 '저장 못 함' */
  const save = (data: T) => {
    const savedAt = Date.now();
    try {
      localStorage.setItem(key, JSON.stringify({ ...data, savedAt }));
      state.value = { kind: 'updated', at: savedAt };
    } catch {
      state.value = { kind: 'fail', at: savedAt };
    }
  };

  /** 남겨 둔 자료 — 없으면 null. 꺼냈으면 칩은 '저장된 자료' */
  const restore = (): (T & { savedAt: number }) | null => {
    try {
      const snap = JSON.parse(localStorage.getItem(key) || 'null') as (T & { savedAt: number }) | null;
      if (!snap) return null;
      state.value = { kind: 'restored', at: snap.savedAt };
      return snap;
    } catch {
      return null;
    }
  };

  /** 남겨 둔 자료의 일부만 고친다(보던 동을 바꿨을 때 등) — 칩은 그대로 */
  const patch = (fields: Partial<T>, when?: (snap: T) => boolean) => {
    try {
      const snap = JSON.parse(localStorage.getItem(key) || 'null') as T | null;
      if (snap && (!when || when(snap))) localStorage.setItem(key, JSON.stringify({ ...snap, ...fields }));
    } catch { /* 못 남겨도 그만 */ }
  };

  const at = (t: number) => {
    const d = new Date(t);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  /** 칩에 쓸 글과 모양 */
  const chip = computed(() => {
    const st = state.value;
    if (!st) return null;
    if (st.kind === 'fail') return { tone: 'fail', text: '저장 못 함 — 새로고침하면 다시 조회해야 합니다' };
    if (st.kind === 'updated') return { tone: 'ok', text: `업데이트 완료 · 저장됨 ${at(st.at)}` };
    return { tone: 'saved', text: `저장된 자료 · ${at(st.at)} 조회` };
  });

  return { state, save, restore, patch, chip };
}
