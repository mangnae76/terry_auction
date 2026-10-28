// 비용 장부를 필요경비 · 사업경비로 바꾸기 전의 시험용 기록 — 사용자가 '싹 지워' 달라 했다(2026-10-28).
// 웹에서 장부를 처음 열 때 한 번만(계정마다) 지운다:
//  · 유류&식대 · 물품구매 기록 전부
//  · 사업지출 가운데 필요경비 구분(취득비용 · 자본적지출 · 양도비용)이 아닌 것
//  · 인테리어 비용(kind cost) 가운데 2026-10-28 전에 적은 것 — 업체비딩(kind bid)은 그대로
import { watch } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { useFinanceStore } from '../stores/financeStore';
import { useInteriorStore } from '../stores/interiorStore';
import { NEED_GROUPS } from './expenseBook';

const KEY = 'fin.cleanup.v1.';
const CUT = '2026-10-28';

export const cleanupLegacyOnce = () => {
  const auth = useAuthStore();
  const finance = useFinanceStore();
  const interior = useInteriorStore();
  const done = (uid: string) => { try { return localStorage.getItem(KEY + uid) === '1'; } catch { return true; } };
  const stop = watch(
    () => [auth.uid, finance.loading, interior.loading] as const,
    async ([uid, fl, il]) => {
      if (!uid || fl || il || done(uid)) return;
      try { localStorage.setItem(KEY + uid, '1'); } catch { return; }
      stop();
      const need = NEED_GROUPS.map(([g]) => g);
      const jobs: Array<Promise<unknown>> = [
        ...finance.fuelMeal.map((r) => finance.deleteFuelMeal(r.id)),
        ...finance.itemPurchases.map((r) => finance.deleteItemPurchase(r.id)),
        ...finance.businessExpenses.filter((r) => !need.includes(r.profitCategory)).map((r) => finance.deleteBusinessExpense(r.id)),
        ...interior.rows.filter((r) => (r.kind ?? 'cost') === 'cost' && String(r.createdAt || '') < CUT).map((r) => interior.remove(r.id)),
      ];
      await Promise.allSettled(jobs);
    },
    { immediate: true },
  );
};
