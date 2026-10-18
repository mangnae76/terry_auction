// 낙찰이후 체크리스트의 '내용' — 사용자가 직접 고친 표를 들고 있는다.
//
// 기본 글은 postWinChecklist.ts 에 있고, 사용자가 한 번이라도 고쳐 저장하면
// 그 벌이 대신 쓰인다. 저장 자리는 사용자별 설정(userPrefs.postWinDay)이라
// 디바이스를 옮겨도 따라온다. 체크 표시(했다/안 했다)는 물건마다 따로 남으므로
// 여기와 섞이지 않는다 — 다만 줄을 지우면 그 줄의 체크는 보이지 않게 된다.
import { computed, ref } from 'vue';
import { loadUserPrefs, saveUserPrefs } from './userPrefsRepository';
import { POST_WIN_DAY, type CheckGroup } from './postWinChecklist';

/** 표를 손으로 고칠 수 있게 할지.
 *  글을 다 다듬고 나면 여기만 false 로 두면 된다 — 편집 단추가 사라지고
 *  적어 둔 내용은 그대로 보인다. (다시 열 때는 true 로) */
export const POST_WIN_EDITABLE = true;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** 손대지 않은 기본 표 */
export const defaultGroups = (): CheckGroup[] => clone(POST_WIN_DAY);

/** 새로 더하는 줄·묶음의 표식 — 기본 줄의 id 와 겹치지 않게 둔다 */
export const newRowId = () => `pw.custom.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 화면 여러 곳이 같은 표를 봐야 하므로 한 벌만 두고 같이 쓴다
const groups = ref<CheckGroup[]>(defaultGroups());
const loadedFor = ref('');

export const usePostWinBook = () => {
  /** 처음 한 번만 받아 온다. 적어 둔 것이 없으면 기본 표를 그대로 쓴다 */
  const load = async (uid: string) => {
    if (!uid || loadedFor.value === uid) return;
    loadedFor.value = uid;
    const prefs = await loadUserPrefs(uid);
    const saved = prefs?.postWinDay;
    if (Array.isArray(saved) && saved.length > 0) groups.value = clone(saved) as CheckGroup[];
  };
  const save = async (uid: string, list: CheckGroup[]) => {
    groups.value = clone(list);
    if (uid) await saveUserPrefs(uid, { postWinDay: clone(list) });
  };
  /** 기본 글로 되돌린다 */
  const reset = async (uid: string) => { await save(uid, defaultGroups()); };
  return { groups: computed(() => groups.value), load, save, reset };
};
