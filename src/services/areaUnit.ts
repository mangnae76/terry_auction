// 아파트 면적 단위(㎡ · 평) — 고정카드 오른쪽 '↻ 평 / ↻ ㎡' 단추 하나로 모든 탭의 아파트 면적 글이 한꺼번에 바뀐다(2026-11-11).
// 꼴은 '공급㎡ (전용)' 하나 — 공급에만 단위, 괄호 안 전용은 숫자만(매매수요 조사 실사용자 면적과 같다). 고른 단위는 새로고침 · 다른 물건에서도 그대로.
// 웹(selected.src.html)은 'ta:areaUnit' 이벤트를 듣고 고정카드 · 물건정보를 다시 그린다
import { ref, watch } from 'vue';

export type AreaUnit = 'm2' | 'py';
const KEY = 'son.areaUnit';
const read = (): AreaUnit => { try { return localStorage.getItem(KEY) === 'py' ? 'py' : 'm2'; } catch { return 'm2'; } };
export const areaUnit = ref<AreaUnit>(read());
watch(areaUnit, (v) => {
  try { localStorage.setItem(KEY, v); } catch { /* 이 창에서만 */ }
  try { window.dispatchEvent(new CustomEvent('ta:areaUnit', { detail: v })); } catch { /* 그만 */ }
});
export const toggleAreaUnit = () => { areaUnit.value = areaUnit.value === 'm2' ? 'py' : 'm2'; };
export const getAreaUnit = () => areaUnit.value;

const PY = 3.305785;
const t2 = (n: number) => (Math.floor(n * 100 + 1e-6) / 100).toFixed(2);
/** '83.18㎡ (59.98)' · '25.2평 (18.1)' — 공급을 모르면 '전용 59.98㎡'(단위와 함께). 공급이 갈리면 '83.18~83.21㎡ (59.99)' */
export const aptAreaText = (supply: number | { lo: number; hi: number } | null | undefined, exclusive: number, unit: AreaUnit = areaUnit.value): string => {
  const py = unit === 'py';
  const one = (v: number) => (py ? (v / PY).toFixed(1) : t2(v));
  const ex = exclusive > 0 ? one(exclusive) : '-';
  const s = typeof supply === 'number' ? (supply > 0 ? { lo: supply, hi: supply } : null) : supply ?? null;
  if (!s || !(s.lo > 0)) return `전용 ${ex}${py ? '평' : '㎡'}`;
  const sp = one(s.lo) === one(s.hi) ? one(s.lo) : `${one(s.lo)}~${one(s.hi)}`;   // 평으로 줄이면 같아지는 범위(25.2~25.2)는 하나로
  return `${sp}${py ? '평' : '㎡'} (${ex})`;
};
