// 자금관리 4개 컬렉션 CRUD + 사용자별 실시간 구독.
// Firestore 규칙: 각 컬렉션 doc.uid === request.auth.uid 일 때만 접근 가능 (firestore.rules 참조).

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';
import type {
  BusinessExpenseRecord,
  CashFlowRecord,
  FuelMealRecord,
  ItemPurchaseRecord,
} from '../types/finance';

const COLLECTIONS = {
  cashFlow: 'financeCashFlows',
  businessExpense: 'financeBusinessExpenses',
  fuelMeal: 'financeFuelMeal',
  itemPurchase: 'financeItemPurchases',
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

const ensureFirestore = () => {
  if (!firestore) {
    throw new Error(firestoreDisabledReason ?? 'Firestore가 초기화되지 않았습니다.');
  }
  return firestore;
};

const stripUndefined = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v))) as T;

const subscribeGeneric = <T extends { id: string; uid: string }>(
  key: CollectionKey,
  uid: string,
  onData: (rows: T[]) => void,
  onError: (msg: string) => void,
): Unsubscribe => {
  if (!firestore) {
    onError(firestoreDisabledReason ?? 'Firestore 미연결');
    return () => undefined;
  }
  if (!uid) {
    onData([]);
    return () => undefined;
  }
  const q = query(collection(firestore, COLLECTIONS[key]), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows: T[] = [];
      snap.forEach((d) => {
        rows.push({ ...(d.data() as T), id: d.id });
      });
      onData(rows);
    },
    (err) => onError(`Firestore 동기화 실패: ${err.message}`),
  );
};

const upsertGeneric = async <T extends { id: string; uid: string }>(key: CollectionKey, record: T) => {
  const fs = ensureFirestore();
  await setDoc(doc(fs, COLLECTIONS[key], record.id), stripUndefined(record), { merge: true });
};

const removeGeneric = async (key: CollectionKey, id: string) => {
  const fs = ensureFirestore();
  await deleteDoc(doc(fs, COLLECTIONS[key], id));
};

// ----- 공개 API (타입 안전 wrappers) -----

export const subscribeCashFlows = (uid: string, onData: (r: CashFlowRecord[]) => void, onError: (m: string) => void) =>
  subscribeGeneric<CashFlowRecord>('cashFlow', uid, onData, onError);
export const upsertCashFlow = (r: CashFlowRecord) => upsertGeneric('cashFlow', r);
export const removeCashFlow = (id: string) => removeGeneric('cashFlow', id);

export const subscribeBusinessExpenses = (uid: string, onData: (r: BusinessExpenseRecord[]) => void, onError: (m: string) => void) =>
  subscribeGeneric<BusinessExpenseRecord>('businessExpense', uid, onData, onError);
export const upsertBusinessExpense = (r: BusinessExpenseRecord) => upsertGeneric('businessExpense', r);
export const removeBusinessExpense = (id: string) => removeGeneric('businessExpense', id);

export const subscribeFuelMeal = (uid: string, onData: (r: FuelMealRecord[]) => void, onError: (m: string) => void) =>
  subscribeGeneric<FuelMealRecord>('fuelMeal', uid, onData, onError);
export const upsertFuelMeal = (r: FuelMealRecord) => upsertGeneric('fuelMeal', r);
export const removeFuelMeal = (id: string) => removeGeneric('fuelMeal', id);

export const subscribeItemPurchases = (uid: string, onData: (r: ItemPurchaseRecord[]) => void, onError: (m: string) => void) =>
  subscribeGeneric<ItemPurchaseRecord>('itemPurchase', uid, onData, onError);
export const upsertItemPurchase = (r: ItemPurchaseRecord) => upsertGeneric('itemPurchase', r);
export const removeItemPurchase = (id: string) => removeGeneric('itemPurchase', id);

export const FINANCE_COLLECTIONS = COLLECTIONS;
