/* 관심물건 화면 자료 — 한 번 읽으면 탭을 옮겨 다녀도 그대로 둔다(2026-11-21 사용자 '한 번 로드했는데 왜 자꾸 로드해').
 * 다시 읽는 때는 마이가 관심물건을 새로 가져온 뒤뿐. 새로고침하면 비워진다 */
import { ref } from 'vue';
import type { TankFavDoc } from '../services/agentRemote';

export const favDocCache = ref<TankFavDoc | null>(null);
/** 지번 → 건물명(카카오 · 공동주택가격). 못 찾은 지번도 '' 로 남겨 다시 묻지 않는다 */
export const favNameCache = ref<Record<string, string>>({});
/** 사건 열쇠 → 지번 주소(도로명으로 온 것) */
export const favJibunCache = ref<Record<string, string>>({});
