// 알림 개수 한 벌 — 머리글의 종과 더보기의 바로가기가 같이 본다.
//
// 셈은 services/alerts 가 하고, 여기서는 셈에 필요한 재료(설정·사진 용량)를
// 한 번만 받아 두었다가 나눠 쓴다. 같은 자료를 화면마다 또 받지 않는다.
import { computed, ref, watch } from 'vue';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { useInteriorStore } from '../stores/interiorStore';
import { buildAlerts, defaultAlertPrefs } from './alerts';
import { PHOTO_BUDGET_BYTES, readUsageBytes } from './sitePhotoRepository';
import { loadUserPrefs } from './userPrefsRepository';

const prefs = ref<Record<string, boolean>>(defaultAlertPrefs());
const photoBytes = ref(0);
let loadedFor: string | null = null;

const load = async (uid: string) => {
  if (loadedFor === uid) return;
  loadedFor = uid;
  if (!uid) {
    prefs.value = defaultAlertPrefs();
    photoBytes.value = 0;
    return;
  }
  photoBytes.value = await readUsageBytes(uid);
  const saved = (await loadUserPrefs(uid))?.alertPrefs;
  prefs.value = { ...defaultAlertPrefs(), ...(saved ?? {}) };
};

/** 설정 화면에서 켜고 끈 뒤 바로 반영되도록 */
export const refreshAlertBadge = () => { loadedFor = null; };

export const useAlertBadge = () => {
  const auctionStore = useAuctionStore();
  const interior = useInteriorStore();
  const auth = useAuthStore();
  interior.initialize();
  void load(auth.uid);
  watch(() => auth.uid, (uid) => { loadedFor = null; void load(uid); });

  const count = computed(() => buildAlerts({
    auctions: auctionStore.auctions,
    interior: interior.rows,
    photoBytes: photoBytes.value,
    photoBudget: PHOTO_BUDGET_BYTES,
    prefs: prefs.value,
  }).length);

  return { count };
};
