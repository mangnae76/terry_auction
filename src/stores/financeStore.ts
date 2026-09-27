// 자금관리 4개 컬렉션을 사용자별로 실시간 구독.
// authStore.uid 변경 시 자동으로 재구독 / 정리.

import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Unsubscribe } from 'firebase/firestore';
import {
  removeBusinessExpense,
  removeCashFlow,
  removeFuelMeal,
  removeItemPurchase,
  subscribeBusinessExpenses,
  subscribeCashFlows,
  subscribeFuelMeal,
  subscribeItemPurchases,
  upsertBusinessExpense,
  upsertCashFlow,
  upsertFuelMeal,
  upsertItemPurchase,
} from '../services/financeRepository';
import type {
  BusinessExpenseRecord,
  CashFlowRecord,
  FuelMealRecord,
  ItemPurchaseRecord,
} from '../types/finance';
import { useAuthStore } from './authStore';

export const useFinanceStore = defineStore('finance', () => {
  const cashFlows = ref<CashFlowRecord[]>([]);
  const businessExpenses = ref<BusinessExpenseRecord[]>([]);
  const fuelMeal = ref<FuelMealRecord[]>([]);
  const itemPurchases = ref<ItemPurchaseRecord[]>([]);
  const loading = ref(false);
  const error = ref('');

  let unsubs: Unsubscribe[] = [];

  const cleanup = () => {
    unsubs.forEach((u) => u());
    unsubs = [];
    cashFlows.value = [];
    businessExpenses.value = [];
    fuelMeal.value = [];
    itemPurchases.value = [];
  };

  const subscribeForUid = (uid: string) => {
    cleanup();
    if (!uid) return;
    loading.value = true;
    error.value = '';
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending <= 0) loading.value = false;
    };
    unsubs.push(
      subscribeCashFlows(uid, (rows) => { cashFlows.value = rows; done(); }, (m) => { error.value = m; done(); }),
      subscribeBusinessExpenses(uid, (rows) => { businessExpenses.value = rows; done(); }, (m) => { error.value = m; done(); }),
      subscribeFuelMeal(uid, (rows) => { fuelMeal.value = rows; done(); }, (m) => { error.value = m; done(); }),
      subscribeItemPurchases(uid, (rows) => { itemPurchases.value = rows; done(); }, (m) => { error.value = m; done(); }),
    );
  };

  let initialized = false;
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    const authStore = useAuthStore();
    subscribeForUid(authStore.uid);
    watch(() => authStore.uid, (uid) => subscribeForUid(uid));
  };

  const dispose = () => cleanup();

  // CRUD wrappers — 호출 측에서 uid 안 채워도 자동 주입
  const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = () => new Date().toISOString();

  const saveCashFlow = async (partial: Partial<CashFlowRecord> & { id?: string }) => {
    const authStore = useAuthStore();
    const uid = authStore.uid;
    if (!uid) throw new Error('로그인이 필요합니다.');
    const id = partial.id || newId('cf');
    const existing = cashFlows.value.find((r) => r.id === id);
    const record: CashFlowRecord = {
      id,
      uid,
      ownerName: partial.ownerName ?? existing?.ownerName ?? '',
      flowType: partial.flowType ?? existing?.flowType ?? '출금',
      amount: Number(partial.amount ?? existing?.amount ?? 0),
      date: partial.date ?? existing?.date ?? new Date().toISOString().slice(0, 10),
      note: partial.note ?? existing?.note ?? '',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await upsertCashFlow(record);
  };

  const saveBusinessExpense = async (partial: Partial<BusinessExpenseRecord> & { id?: string }) => {
    const authStore = useAuthStore();
    const uid = authStore.uid;
    if (!uid) throw new Error('로그인이 필요합니다.');
    const id = partial.id || newId('be');
    const existing = businessExpenses.value.find((r) => r.id === id);
    const record: BusinessExpenseRecord = {
      id,
      uid,
      auctionId: partial.auctionId ?? existing?.auctionId ?? '',
      auctionLabel: partial.auctionLabel ?? existing?.auctionLabel ?? '',
      profitCategory: partial.profitCategory ?? existing?.profitCategory ?? '기타사업비',
      memo: partial.memo ?? existing?.memo ?? '',
      detail: partial.detail ?? existing?.detail ?? '',
      amountWithVat: Number(partial.amountWithVat ?? existing?.amountWithVat ?? 0),
      date: partial.date ?? existing?.date ?? new Date().toISOString().slice(0, 10),
      note: partial.note ?? existing?.note ?? '',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await upsertBusinessExpense(record);
  };

  const saveFuelMeal = async (partial: Partial<FuelMealRecord> & { id?: string }) => {
    const authStore = useAuthStore();
    const uid = authStore.uid;
    if (!uid) throw new Error('로그인이 필요합니다.');
    const id = partial.id || newId('fm');
    const existing = fuelMeal.value.find((r) => r.id === id);
    const record: FuelMealRecord = {
      id,
      uid,
      region: partial.region ?? existing?.region ?? '',
      store: partial.store ?? existing?.store ?? '',
      category: partial.category ?? existing?.category ?? '',
      amount: Number(partial.amount ?? existing?.amount ?? 0),
      card: partial.card ?? existing?.card ?? '',
      users: partial.users ?? existing?.users ?? [],
      date: partial.date ?? existing?.date ?? new Date().toISOString().slice(0, 10),
      note: partial.note ?? existing?.note ?? '',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await upsertFuelMeal(record);
  };

  const saveItemPurchase = async (partial: Partial<ItemPurchaseRecord> & { id?: string }) => {
    const authStore = useAuthStore();
    const uid = authStore.uid;
    if (!uid) throw new Error('로그인이 필요합니다.');
    const id = partial.id || newId('ip');
    const existing = itemPurchases.value.find((r) => r.id === id);
    const quantity = Number(partial.quantity ?? existing?.quantity ?? 0);
    const unitPrice = Number(partial.unitPrice ?? existing?.unitPrice ?? 0);
    const subtotal = quantity * unitPrice;
    const record: ItemPurchaseRecord = {
      id,
      uid,
      auctionId: partial.auctionId ?? existing?.auctionId ?? '',
      auctionLabel: partial.auctionLabel ?? existing?.auctionLabel ?? '',
      category: partial.category ?? existing?.category ?? '',
      description: partial.description ?? existing?.description ?? '',
      quantity,
      unitPrice,
      subtotal,
      totalWithVat: Number(partial.totalWithVat ?? existing?.totalWithVat ?? subtotal),
      vendor: partial.vendor ?? existing?.vendor ?? '',
      card: partial.card ?? existing?.card ?? '',
      user: partial.user ?? existing?.user ?? '',
      shippingFee: Number(partial.shippingFee ?? existing?.shippingFee ?? 0),
      date: partial.date ?? existing?.date ?? new Date().toISOString().slice(0, 10),
      note: partial.note ?? existing?.note ?? '',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await upsertItemPurchase(record);
  };

  return {
    cashFlows,
    businessExpenses,
    fuelMeal,
    itemPurchases,
    loading,
    error,
    initialize,
    dispose,
    saveCashFlow,
    saveBusinessExpense,
    saveFuelMeal,
    saveItemPurchase,
    deleteCashFlow: removeCashFlow,
    deleteBusinessExpense: removeBusinessExpense,
    deleteFuelMeal: removeFuelMeal,
    deleteItemPurchase: removeItemPurchase,
  };
});
