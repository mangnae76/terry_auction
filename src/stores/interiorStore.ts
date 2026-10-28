// 인테리어 비용 — 낙찰이후 · 인테리어 탭의 목록. 웹은 자금관리 › 인테리어 탭에도 같은 기록을 보인다(같은 저장소라 저절로 맞는다).
// 자금관리(사업지출)와 꼴은 같지만 자리를 따로 둔다 — 여기서 적은 것은 자금관리에
// 들어가지 않고, 자금관리에 적은 것도 여기에 보이지 않는다.
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Unsubscribe } from 'firebase/firestore';
import {
  removeInteriorExpense,
  subscribeInteriorExpenses,
  upsertInteriorExpense,
} from '../services/financeRepository';
import type { InteriorExpenseRecord } from '../types/finance';
import { useAuthStore } from './authStore';

export const useInteriorStore = defineStore('interior', () => {
  const rows = ref<InteriorExpenseRecord[]>([]);
  const loading = ref(false);
  const error = ref('');

  let unsub: Unsubscribe | null = null;
  const cleanup = () => {
    if (unsub) unsub();
    unsub = null;
    rows.value = [];
  };

  const subscribeForUid = (uid: string) => {
    cleanup();
    if (!uid) return;
    loading.value = true;
    error.value = '';
    unsub = subscribeInteriorExpenses(
      uid,
      (list) => { rows.value = list; loading.value = false; },
      (m) => { error.value = m; loading.value = false; },
    );
  };

  let initialized = false;
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    const auth = useAuthStore();
    subscribeForUid(auth.uid);
    watch(() => auth.uid, (uid) => subscribeForUid(uid));
  };

  const newId = () => `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = () => new Date().toISOString();

  const save = async (partial: Partial<InteriorExpenseRecord> & { id?: string }) => {
    const auth = useAuthStore();
    const uid = auth.uid;
    if (!uid) throw new Error('로그인이 필요합니다.');
    const id = partial.id || newId();
    const existing = rows.value.find((r) => r.id === id);
    const record: InteriorExpenseRecord = {
      id,
      uid,
      auctionId: partial.auctionId ?? existing?.auctionId ?? '',
      auctionLabel: partial.auctionLabel ?? existing?.auctionLabel ?? '',
      kind: partial.kind ?? existing?.kind ?? 'cost',
      work: partial.work ?? existing?.work ?? '',
      status: partial.status ?? existing?.status ?? '예정',
      startDate: partial.startDate ?? existing?.startDate ?? existing?.date ?? new Date().toISOString().slice(0, 10),
      endDate: partial.endDate ?? existing?.endDate ?? '',
      amountWithVat: Number(partial.amountWithVat ?? existing?.amountWithVat ?? 0),
      vendor: partial.vendor ?? existing?.vendor ?? '',
      phone: partial.phone ?? existing?.phone ?? '',
      note: partial.note ?? existing?.note ?? '',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await upsertInteriorExpense(record);
  };

  const remove = async (id: string) => { await removeInteriorExpense(id); };

  return { rows, loading, error, initialize, dispose: cleanup, save, remove };
});
