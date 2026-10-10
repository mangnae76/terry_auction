// 중개업소 목록 — 늘 도는 부동산을 사용자별로 들고 있는다.
//
// 상담표의 상호 드롭다운, 전화번호 자동 채우기, '중개업소 관리' 화면이
// 모두 이 한 곳을 본다. 업소를 더하거나 빼려면 관리 화면에서만 고치면 되고,
// 상담표는 저절로 따라온다.
import { computed, ref } from 'vue';
import { loadUserPrefs, saveUserPrefs } from './userPrefsRepository';

export interface AgencyPreset {
  /** 지우고 다시 만들어도 섞이지 않게 두는 표식 */
  id: string;
  name: string;
  phone: string;
  /** 써 보고 남긴 평가 — 상담표의 '정보'와 달리 업소에 붙는다 */
  rating?: string;
}

/** 처음 쓰는 사용자에게 깔아 두는 목록 */
export const DEFAULT_AGENCIES: AgencyPreset[] = [
  { id: 'apple', name: '애플', phone: '032-567-0004' },
  { id: 'ivill', name: '아이빌', phone: '010-8100-5019' },
  { id: 'ace', name: '에이스', phone: '010-4726-3313' },
  { id: 'myeongga', name: '명가', phone: '032-563-4422' },
];

export const newAgencyId = () => `ag_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 숫자만 남긴다 — 전화를 걸 때 쓴다 */
export const telDigits = (phone: string) => String(phone ?? '').replace(/[^\d+]/g, '');

// 화면 여러 곳이 같은 목록을 봐야 하므로 한 벌만 두고 같이 쓴다
const agencies = ref<AgencyPreset[]>([...DEFAULT_AGENCIES]);
const loadedFor = ref('');

export const useAgencyBook = () => {
  /** 처음 한 번만 받아 온다. 적어 둔 것이 없으면 기본 목록을 그대로 쓴다 */
  const load = async (uid: string) => {
    if (!uid || loadedFor.value === uid) return;
    loadedFor.value = uid;
    const prefs = await loadUserPrefs(uid);
    const saved = prefs?.agencies;
    if (Array.isArray(saved) && saved.length > 0) agencies.value = saved as AgencyPreset[];
  };
  const save = async (uid: string, list: AgencyPreset[]) => {
    agencies.value = list;
    if (uid) await saveUserPrefs(uid, { agencies: list });
  };
  /** 상호로 찾는다 — 상담표가 전화번호를 채울 때 쓴다 */
  const findByName = (name: string) => agencies.value.find((a) => a.name === String(name ?? '').trim());
  return {
    agencies: computed(() => agencies.value),
    names: computed(() => agencies.value.map((a) => a.name).filter(Boolean)),
    load,
    save,
    findByName,
  };
};
