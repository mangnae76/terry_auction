// 사건마다 공동주택가격(공시가)을 받아 둔다 — 셋씩, 한 번 받은 건 이 화면이 살아 있는 동안 다시 안 받는다(브이월드 쪽에도 1년 캐시).
// 호실을 못 맞추면 null(그 줄 없음).
import { ref } from 'vue';
import { lookupAddress } from '../services/addressLookup';
import { isSameUnit } from '../services/officialPrice';

export type Official = { price: number; year: string };
const store = ref<Record<string, Official | null>>({});
const busy = new Set<string>();

export const useOfficialPrice = () => {
  const want = async (list: { key: string; addr: string; area: number }[]) => {
    const todo = list.filter((x) => x.addr && !(x.key in store.value) && !busy.has(x.key));
    todo.forEach((x) => busy.add(x.key));
    for (let i = 0; i < todo.length; i += 3) {
      await Promise.all(todo.slice(i, i + 3).map(async (x) => {
        let v: Official | null = null;
        try {
          const r = await lookupAddress(x.addr, { areaM2: x.area || undefined });
          if (isSameUnit(x.addr, x.area, r.price)) v = { price: r.price!.price, year: r.price!.year };
        } catch { v = null; }
        store.value = { ...store.value, [x.key]: v };
        busy.delete(x.key);
      }));
    }
  };
  return { official: store, want };
};
