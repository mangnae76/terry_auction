/* 예상 매도가 2 — 저가매수 · 관심물건이 같이 보는 한 자리(saleData/dayList/sale2). 한 번 읽어 모든 표가 나눠 쓴다(2026-11-20 사용자) */
import { ref } from 'vue';
import { loadSale2, saveSale2, type Sale2 } from '../services/agentRemote';

const map = ref<Record<string, Sale2>>({});
let started = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** 바꾸면 화면엔 바로, 저장은 0.6초 뒤 한 번(입력 중 매 글자 저장하지 않게) */
const setSale2 = (key: string, v: Sale2 | null) => {
  const next = { ...map.value }; if (v) next[key] = v; else delete next[key]; map.value = next;
  const t = timers.get(key); if (t) clearTimeout(t);
  timers.set(key, setTimeout(() => { timers.delete(key); void saveSale2(key, v).catch(() => { /* 다음 입력 때 다시 */ }); }, 600));
};

export const useSale2 = () => {
  if (!started) { started = true; void loadSale2().then((m) => { map.value = { ...m, ...map.value }; }).catch(() => { started = false; }); }
  return { sale2: map, setSale2 };
};
