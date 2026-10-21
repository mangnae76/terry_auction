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
import { POST_WIN_EVICT, POST_WIN_EVICT_VERSION } from './postWinEvict';

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
  'ev.flow': { from: '명도의 절차', to: '명도절차' },
  'ev.deal': { from: '명도 협상을 하는 방법', to: '명도 협상 방법' },
};
/** 들여쓰기를 바로잡을 줄 — 저장본에 옛 들여쓰기가 남아 있다 */
const DEPTH_FIX: Record<string, 0 | 1> = {
  'bz.i2': 0,
  'ln.c5': 0,
};

/** 제목이 이미 한 번 바뀐 자리 — 어느 쪽이든 지금 제목으로 맞춘다 */
const TITLE_ALSO: Record<string, { from: string; to: string }> = {
  'ev.flow': { from: '명도 절차', to: '명도절차' },
};

/** 기본 글에서 뺀 안내 줄 — 저장본에 그 글이 그대로면 같이 지운다 */
const NOTE_CLEAR: Record<string, string[]> = {
  'ev.flow': ['낙찰에서 명도까지 가는 길 — 날짜는 대략이다.'],
  'ev.step': ['낙찰 받고 당장 무엇을 할지 — 때마다 할 일이 다르다.'],
  'ev.deal': ['무엇을 알고 들어가는지가 값을 가른다.'],
};

/**
 * 줄 글 갈아 끼우기 — 저장본이 '옛 기본 글 그대로'일 때만 새 글로 바꾼다.
 * 한 번 저장한 사람에게는 기본 글을 고쳐도 닿지 않아, 손대지 않은 줄만 따라오게 한다.
 * (손으로 고쳐 쓴 줄은 옛 글과 다르니 그대로 남는다)
 */
const TEXT_FIX: Record<string, { from: string; to: string }> = {
  'bz.i6': {
    from: '세무서에서 받을 때는 수령인의 신분증과 접수증(접수안내문자 포함)을 지참',
    to: '세무서에서 받을 때는 수령인의 신분증과 접수증을 지참\n(접수 안내 문자 포함)',
  },
  'bz.i7': {
    from: '본인·접수자가 아닌 제3자가 받으면 위임장과 위임자의 뜻을 확인할 수 있는 서류[대표자 신분증(사본), 법인인감증명서(사본) 등]를 더 챙긴다',
    to: '본인·접수자가 아닌 제3자가 받으면 위임장과 위임자의 뜻을 확인할 수 있는 서류를 더 챙긴다\n대표자 신분증 사본, 법인인감증명서 사본 등',
  },
};

/** 비고 칸도 같은 규칙으로 — 옛 기본 글 그대로일 때만 바꾼다 */
const MEMO_FIX: Record<string, { from: string; to: string }> = {
  'ln.d10': { from: '동사무소 발급 · 유효기간 한 달', to: '동사무소 발급\n유효기간 한 달' },
};
const fixMemo = (id: string, memo?: string): string | undefined => {
  const fix = MEMO_FIX[id];
  return fix && (memo ?? '').trim() === fix.from ? fix.to : memo;
};

const fixText = (id: string, text: string): string => {
  const fix = TEXT_FIX[id];
  return fix && (text ?? '').trim() === fix.from ? fix.to : text;
};

const migrate = (list: CheckGroup[]): CheckGroup[] => list.map((g) => ({
  ...g,
  note: NOTE_CLEAR[g.key]?.includes((g.note ?? '').trim()) ? '' : g.note,
  title: TITLE_FIX[g.key]?.from === (g.title ?? '').trim()
    ? TITLE_FIX[g.key].to
    : (TITLE_ALSO[g.key]?.from === (g.title ?? '').trim() ? TITLE_ALSO[g.key].to : g.title),
  sections: (g.sections ?? []).map((sec) => ({
    ...sec,
    label: LABEL_FIX[(sec.label ?? '').trim()] ?? sec.label,
    rows: (sec.rows ?? []).map((r) => ({
      ...r,
      text: fixText(r.id, spaceArrows(r.text)),
      memo: fixMemo(r.id, r.memo),
      depth: DEPTH_FIX[r.id] ?? r.depth,
    })),
  })),
}));
/** 표가 담긴 자리 — 탭마다 한 권씩 */
export type BookKey = 'day' | 'biz' | 'loan' | 'evict';
const BOOKS: Record<BookKey, {
  defaults: () => CheckGroup[];
  version: number;
  /** userPrefs 의 어느 칸에 담는지 */
  slot: 'postWinDay' | 'postWinBiz' | 'postWinLoan' | 'postWinEvict';
  verSlot: 'postWinDayVersion' | 'postWinBizVersion' | 'postWinLoanVersion' | 'postWinEvictVersion';
  /** 손으로 고쳐 저장한 표인지 */
  editedSlot: 'postWinDayEdited' | 'postWinBizEdited' | 'postWinLoanEdited' | 'postWinEvictEdited';
}> = {
  day: { defaults: () => clone(POST_WIN_DAY), version: POST_WIN_VERSION, slot: 'postWinDay', verSlot: 'postWinDayVersion', editedSlot: 'postWinDayEdited' },
  biz: { defaults: () => clone(POST_WIN_BIZ), version: POST_WIN_BIZ_VERSION, slot: 'postWinBiz', verSlot: 'postWinBizVersion', editedSlot: 'postWinBizEdited' },
  loan: { defaults: () => clone(POST_WIN_LOAN), version: POST_WIN_LOAN_VERSION, slot: 'postWinLoan', verSlot: 'postWinLoanVersion', editedSlot: 'postWinLoanEdited' },
  evict: { defaults: () => clone(POST_WIN_EVICT), version: POST_WIN_EVICT_VERSION, slot: 'postWinEvict', verSlot: 'postWinEvictVersion', editedSlot: 'postWinEvictEdited' },
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
  evict: ref<CheckGroup[]>(defaultGroups('evict')),
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
      // 상자의 차례·있고 없음과 '꼴'은 기본 글을 따르고, 글만 고친 것을 쓴다.
      // 꼴(큰 제목 · 바로가기 · 체크 유무)은 사용자가 고칠 수 없는 값이라
      // 저장본에 없거나 낡아 있다 — 늘 기본 글에서 가져온다.
      const mine = migrate(clone(saved) as CheckGroup[]);
      slot.value = book.defaults().map((d) => {
        const kept = mine.find((g) => g.key === d.key);
        if (!kept) return d;
        // 꼴에 해당하는 값은 모두 기본 글에서 — 저장본에는 없는 값들이다
        return {
          ...kept,
          key: d.key,
          // 기본 글에서 표를 통째로 뺀 상자는 저장본의 표도 쓰지 않는다
          sections: (d.sections ?? []).length === 0 ? [] : kept.sections,
          super: d.super,
          links: d.links,
          noCheck: d.noCheck,
          flow: d.flow,
          timeline: d.timeline,
          boxes: d.boxes,
          grid: d.grid,
          stacks: d.stacks,
          branches: d.branches,
        };
      });
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
