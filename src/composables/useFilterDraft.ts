// 검색 거르기 한 벌 — '고르기(초안) → 조회하기(적용) → 바뀜 표시 → 초기화(기본값)' 를 한 곳에(2026-11-12 사용자).
// 화면마다 거르기 항목 · 기본값은 다르니 그것만 넘긴다. 지금은 매매수요 입지비교가 쓰고, 다른 화면(시세분석 · 매각분석 …)은 나중에 끼운다.
//
//   const f = useFilterDraft(() => 지금 적용된 값, (v) => 적용하기, () => 기본값);
//   단추는 f.draft 만 고치고, '조회하기'가 f.apply(), '초기화'가 f.reset().
//   f.dirty — 고른 값이 적용된 값과 다르다(조회하기를 눌러야 한다), f.isDefault — 고른 값이 기본값 그대로다(초기화할 게 없다).
import { computed, ref, watch, type Ref } from 'vue';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type FilterDraft<T> = {
  /** 고르는 중인 값 — 단추가 바꾼다 */
  draft: Ref<T>;
  /** 고른 값이 적용된 값과 다르다 */
  dirty: Readonly<Ref<boolean>>;
  /** 고른 값이 기본값과 같다 */
  isDefault: Readonly<Ref<boolean>>;
  /** 고른 값을 적용한다(조회하기) */
  apply: () => void;
  /** 고른 값을 기본값으로 되돌린다(초기화) — 적용은 조회하기로 */
  reset: () => void;
};

export const useFilterDraft = <T extends object>(read: () => T, write: (v: T) => void, defaults: () => T): FilterDraft<T> => {
  const draft = ref(clone(read())) as Ref<T>;
  // 적용된 값이 바뀌면(물건을 바꾸거나 저장본을 열거나 조회하기) 고르는 값도 따라간다
  // 적용된 '값'이 정말 바뀌었을 때만 — 물건 문서가 다시 들어오기만 해도(다른 칸 저장 · 실시간 갱신) 읽기가 다시 돌아
  // 고르던 면적 · 건축이 적용값으로 되돌아갔다(2026-11-12 사용자 '왜 자꾸 리셋해')
  let last = JSON.stringify(read());
  watch(read, (v) => {
    const now = JSON.stringify(v);
    if (now === last) return;
    last = now;
    draft.value = clone(v);
  }, { deep: true });
  const dirty = computed(() => !same(draft.value, read()));
  const isDefault = computed(() => same(draft.value, defaults()));
  return {
    draft,
    dirty,
    isDefault,
    apply: () => write(clone(draft.value)),
    reset: () => { draft.value = clone(defaults()); },
  };
};
