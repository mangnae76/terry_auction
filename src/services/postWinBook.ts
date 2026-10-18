// 낙찰이후 체크리스트의 '내용' — 사용자가 직접 고친 표를 들고 있는다.
//
// 기본 글은 postWinChecklist.ts 에 있고, 사용자가 한 번이라도 고쳐 저장하면
// 그 벌이 대신 쓰인다. 저장 자리는 사용자별 설정(userPrefs.postWinDay)이라
// 디바이스를 옮겨도 따라온다. 체크 표시(했다/안 했다)는 물건마다 따로 남으므로
// 여기와 섞이지 않는다 — 다만 줄을 지우면 그 줄의 체크는 보이지 않게 된다.
import { computed, ref } from 'vue';
import { loadUserPrefs, saveUserPrefs } from './userPrefsRepository';
import { POST_WIN_DAY, POST_WIN_VERSION, type CheckGroup } from './postWinChecklist';
import { POST_WIN_BIZ, POST_WIN_BIZ_VERSION } from './postWinBiz';
import { POST_WIN_LOAN, POST_WIN_LOAN_VERSION } from './postWinLoan';

/** 표를 손으로 고칠 수 있게 할지.
 *  글을 다 다듬고 나면 여기만 false 로 두면 된다 — 편집 단추가 사라지고
 *  적어 둔 내용은 그대로 보인다. (다시 열 때는 true 로) */
export const POST_WIN_EDITABLE = true;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 예전에 저장해 둔 이름을 지금 쓰는 이름으로 고친다.
 *  (저장해 둔 표가 있으면 기본 글을 덮어쓰므로, 이름이 바뀌면 여기에 적는다) */
const LABEL_FIX: Record<string, string> = {
  '협상 원칙': '협상원칙',
  '명도협상': '협상내용',
  '내부 확인': '내부확인',
  '폐문부재': '폐문부재\n연락부재',
  '대법원 전자소송포털(온라인)': '전자소송포털',
  '대법원 전자소송포털': '전자소송포털',
  '대법원\n전자소송포털': '전자소송포털',
};
/** 화살표 앞뒤는 한 칸씩 띄운다 — 저장해 둔 표마다 들쭉날쭉하던 자리다 */
const spaceArrows = (text: string): string => String(text ?? '')
  .replace(/\s*([>→])\s*/g, ' $1 ')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

/** 예전 제목을 지금 제목으로 (그 제목 그대로일 때만 바꾼다 — 손으로 쓴 제목은 둔다) */
const TITLE_FIX: Record<string, { from: string; to: string }> = {
  'biz.issue': { from: '사업자등록증 발급', to: '사업자등록증 발급 결과' },
};
/** 들여쓰기를 바로잡을 줄 — 저장본에 옛 들여쓰기가 남아 있다 */
const DEPTH_FIX: Record<string, 0 | 1> = {
  'bz.i2': 0,
  'ln.c5': 0,
};

const migrate = (list: CheckGroup[]): CheckGroup[] => list.map((g) => ({
  ...g,
  title: TITLE_FIX[g.key]?.from === (g.title ?? '').trim() ? TITLE_FIX[g.key].to : g.title,
  sections: (g.sections ?? []).map((sec) => ({
    ...sec,
    label: LABEL_FIX[(sec.label ?? '').trim()] ?? sec.label,
    rows: (sec.rows ?? []).map((r) => ({
      ...r,
      text: spaceArrows(r.text),
      depth: DEPTH_FIX[r.id] ?? r.depth,
    })),
  })),
}));
/** 표가 담긴 자리 — 탭마다 한 권씩 */
export type BookKey = 'day' | 'biz' | 'loan';
const BOOKS: Record<BookKey, {
  defaults: () => CheckGroup[];
  version: number;
  /** userPrefs 의 어느 칸에 담는지 */
  slot: 'postWinDay' | 'postWinBiz' | 'postWinLoan';
  verSlot: 'postWinDayVersion' | 'postWinBizVersion' | 'postWinLoanVersion';
  /** 손으로 고쳐 저장한 표인지 */
  editedSlot: 'postWinDayEdited' | 'postWinBizEdited' | 'postWinLoanEdited';
}> = {
  day: { defaults: () => clone(POST_WIN_DAY), version: POST_WIN_VERSION, slot: 'postWinDay', verSlot: 'postWinDayVersion', editedSlot: 'postWinDayEdited' },
  biz: { defaults: () => clone(POST_WIN_BIZ), version: POST_WIN_BIZ_VERSION, slot: 'postWinBiz', verSlot: 'postWinBizVersion', editedSlot: 'postWinBizEdited' },
  loan: { defaults: () => clone(POST_WIN_LOAN), version: POST_WIN_LOAN_VERSION, slot: 'postWinLoan', verSlot: 'postWinLoanVersion', editedSlot: 'postWinLoanEdited' },
};

/** 손대지 않은 기본 표 */
export const defaultGroups = (key: BookKey = 'day'): CheckGroup[] => BOOKS[key].defaults();

/** 새로 더하는 줄·묶음의 표식 — 기본 줄의 id 와 겹치지 않게 둔다 */
export const newRowId = () => `pw.custom.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 화면 여러 곳이 같은 표를 봐야 하므로 한 벌만 두고 같이 쓴다
const groups: Record<BookKey, ReturnType<typeof ref<CheckGroup[]>>> = {
  day: ref<CheckGroup[]>(defaultGroups('day')),
  biz: ref<CheckGroup[]>(defaultGroups('biz')),
  loan: ref<CheckGroup[]>(defaultGroups('loan')),
};
const loadedFor = ref('');

export const usePostWinBook = (key: BookKey = 'day') => {
  const book = BOOKS[key];
  const slot = groups[key];
  /** 처음 한 번만 받아 온다. 적어 둔 것이 없으면 기본 표를 그대로 쓴다 */
  const load = async (uid: string) => {
    if (!uid) return;
    const prefs = await loadUserPrefs(uid);
    loadedFor.value = uid;
    const saved = prefs?.[book.slot];
    // 손으로 고쳐 저장한 표는 무슨 일이 있어도 그대로 둔다 —
    // 기본 글이 새 판으로 바뀌어도 사용자가 쓴 글을 지우지 않는다.
    // (새 기본 글로 갈아타려면 편집에서 '기본글'을 누르고 저장하면 된다)
    const edited = prefs?.[book.editedSlot] === true;
    const fresh = (prefs?.[book.verSlot] ?? 0) >= book.version;
    if (Array.isArray(saved) && saved.length > 0 && (edited || fresh)) {
      // 손으로 고친 글은 그대로 두되, 상자 자체는 기본 글을 따른다 —
      // 새로 쓴 상자는 뒤에 붙이고, 없앤 상자는 저장본에서도 뺀다.
      // (상자는 사용자가 만들 수 없고 기본 글에서만 온다)
      // 상자의 차례와 있고 없음은 기본 글을 따르고, 칸 안의 글만 고친 것을 쓴다.
      // (상자는 사용자가 만들 수 없고 기본 글에서만 온다)
      const mine = migrate(clone(saved) as CheckGroup[]);
      slot.value = book.defaults().map((d) => mine.find((g) => g.key === d.key) ?? d);
    } else {
      slot.value = book.defaults();
    }
  };
  const save = async (uid: string, list: CheckGroup[]) => {
    slot.value = clone(list);
    if (uid) {
      await saveUserPrefs(uid, {
        [book.slot]: clone(list),
        [book.verSlot]: book.version,
        [book.editedSlot]: true,
      });
    }
  };
  /** 기본 글로 되돌린다 */
  const reset = async (uid: string) => { await save(uid, book.defaults()); };
  return { groups: computed(() => slot.value ?? []), load, save, reset };
};
