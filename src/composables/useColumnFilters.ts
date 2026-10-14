// 표의 칸마다 값 목록을 띄워 하나씩 걸러낸다 (엑셀 자동 필터와 같은 꼴).
//
// 고른 값이 없는 칸은 거르지 않는다. 한 칸의 값 목록은 '그 칸을 뺀 나머지
// 조건'을 건 줄에서 뽑는다 — 다른 칸에서 이미 좁혀 놓은 범위만 보여 준다.
//
// 화면이 아니라 여기에 둔 까닭: 관리자 도구의 표가 여럿이고, 분석 도구가
// 앱과 갈라져도 이 로직은 그대로 따라간다. 창의 생김새는 ColumnFilterPanel.vue.
import { computed, ref, type ComputedRef, type Ref } from 'vue';

export interface ColumnDef<T> {
  key: string;
  label: string;
  /** 그 칸에 적히는 글 — 값 목록과 거르기가 이 글을 기준으로 돈다 */
  text: (row: T) => string;
  /** 값 목록을 늘어놓는 차례 (큰 값부터). 없으면 글자순 */
  order?: (row: T) => number;
}

/** 창(ColumnFilterPanel)이 쓰는 몫만 추린 꼴 */
export interface ColumnFilterCtl {
  openKey: Ref<string>;
  pos: Ref<{ left: number; top: number; height: number }>;
  draft: Ref<string[]>;
  query: Ref<string>;
  options: ComputedRef<string[]>;
  shown: ComputedRef<string[]>;
  label: ComputedRef<string>;
  close: () => void;
  toggle: (value: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  apply: () => void;
}

/** 값 한 줄 높이 · 창에서 목록 말고 차지하는 높이(제목·찾기·단추들) · 최소 높이 */
const ROW_H = 28;
const CHROME_H = 152;
const MIN_H = 220;

export const useColumnFilters = <T>(source: Ref<T[]> | ComputedRef<T[]>, cols: ColumnDef<T>[]) => {
  const keys = cols.map((c) => c.key);
  const defOf = (key: string) => cols.find((c) => c.key === key);
  const blank = () => Object.fromEntries(keys.map((k) => [k, [] as string[]]));

  const picked = ref<Record<string, string[]>>(blank());
  const activeCount = computed(() => keys.filter((k) => (picked.value[k] ?? []).length > 0).length);
  const isActive = (key: string) => (picked.value[key] ?? []).length > 0;

  /** 한 칸을 뺀 나머지 조건만 건 줄 — 그 칸의 값 목록은 여기서 뽑는다 */
  const rowsExcept = (skip: string) => source.value.filter((row) => keys.every((k) => {
    if (k === skip) return true;
    const sel = picked.value[k] ?? [];
    if (sel.length === 0) return true;
    const col = defOf(k);
    return !col || sel.includes(col.text(row));
  }));
  const rows = computed(() => rowsExcept(''));
  const clearAll = () => { picked.value = blank(); };

  // ===== 값 목록 창 =====
  const openKey = ref('');
  const pos = ref({ left: 0, top: 0, height: 320 });
  const draft = ref<string[]>([]);
  const query = ref('');

  const options = computed(() => {
    const key = openKey.value;
    const col = key ? defOf(key) : undefined;
    if (!col) return [] as string[];
    const seen = new Map<string, number>();
    rowsExcept(key).forEach((row) => {
      const t = col.text(row);
      const o = col.order ? col.order(row) : 0;
      if (!seen.has(t) || o > (seen.get(t) ?? 0)) seen.set(t, o);
    });
    const list = Array.from(seen.entries());
    return col.order
      ? list.sort((a, b) => b[1] - a[1]).map(([t]) => t)
      : list.map(([t]) => t).sort((a, b) => a.localeCompare(b, 'ko'));
  });
  const shown = computed(() => {
    const q = query.value.trim().toLowerCase();
    return q ? options.value.filter((t) => t.toLowerCase().includes(q)) : options.value;
  });
  const label = computed(() => defOf(openKey.value)?.label ?? '');

  const close = () => { openKey.value = ''; query.value = ''; };
  const open = (key: string, ev: MouseEvent) => {
    if (openKey.value === key) { close(); return; }
    openKey.value = key;
    query.value = '';
    const sel = picked.value[key] ?? [];
    draft.value = sel.length > 0 ? [...sel] : [...options.value];

    const th = (ev.currentTarget as HTMLElement | null)?.closest('th');
    const r = th?.getBoundingClientRect();
    if (r) {
      // 값은 열 줄까지 보이게, 열 줄이 안 되면 있는 만큼만 — 빈 상자를 띄우지 않는다.
      // 화면 아래로 넘칠 자리면 그만큼 줄이고, 더 보고 싶으면 사람이 상자를 늘린다.
      // 글 속에 붙여 둬서 화면을 굴리면 머리 칸과 함께 따라 움직인다
      const visible = Math.max(1, Math.min(10, options.value.length));
      const want = Math.max(MIN_H, visible * ROW_H + CHROME_H + 6);
      pos.value = {
        left: Math.round(Math.min(r.left, window.innerWidth - 248) + window.scrollX),
        top: Math.round(r.bottom + 4 + window.scrollY),
        // 화면보다 커지지만 않게 막는다 — 아래가 좁다고 줄이면 두세 줄짜리
        // 상자가 되어 되레 쓰기 나쁘다. 더 보려면 사람이 끌어 늘린다
        height: Math.round(Math.min(want, window.innerHeight * 0.8)),
      };
    }
  };
  const toggle = (value: string) => {
    const i = draft.value.indexOf(value);
    if (i >= 0) draft.value.splice(i, 1);
    else draft.value.push(value);
  };
  const selectAll = () => { draft.value = [...options.value]; };
  const selectNone = () => { draft.value = []; };
  const apply = () => {
    const key = openKey.value;
    if (!key) return;
    const all = options.value;
    // 다 고른 것은 거르지 않는 것과 같다 — 빈 값으로 둬서 표시도 끈다
    const next = draft.value.length === all.length && all.every((t) => draft.value.includes(t))
      ? []
      : [...draft.value];
    picked.value = { ...picked.value, [key]: next };
    close();
  };

  return {
    cols, keys, picked, isActive, activeCount, rows, clearAll,
    openKey, pos, draft, query, options, shown, label,
    open, close, toggle, selectAll, selectNone, apply,
  };
};
