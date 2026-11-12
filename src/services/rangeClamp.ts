// 면적 · 건축 범위 규칙 한 곳 — 손품조사 시세분석 · 매매수요 입지비교(RangeInputBox) · 웹 매각분석(막대)이 같이 쓴다(2026-11-12 사용자).
// 범위는 늘 내 물건(빨간 줄)을 품는다 — 왼쪽 동그라미는 내 값을 넘어 오른쪽으로, 오른쪽 동그라미는 내 값 밑으로 못 간다.
// 막대는 1칸(1㎡ · 1년)씩이라 끝까지 밀면 84 · 85 에서 멈춰 같은 면적만 고를 수 없었다 — 내 값 칸에 닿으면 정확히 내 값(84.39)으로.

/** 화면과 같은 소수 둘째 자리 버림(84.39) */
export const trunc2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/**
 * 양끝 범위를 내 값에 맞춰 고친다.
 * @param lo  왼쪽(최소)
 * @param hi  오른쪽(최대)
 * @param base 내 물건 값 — 0 이하면 막지 않고 최소 ≤ 최대만 지킨다(앱 등)
 * @param moved 방금 움직인 쪽 — 최소 > 최대가 되면 움직인 쪽을 막는다(반대쪽을 밀지 않는다)
 */
export const clampAroundBase = (lo: number, hi: number, base: number, moved?: 'lo' | 'hi'): [number, number] => {
  let a = Number(lo); let b = Number(hi);
  if (base > 0) {
    const bb = trunc2(base);
    if (moved === 'lo' && a >= Math.floor(bb)) a = bb;
    if (moved === 'hi' && b <= Math.ceil(bb)) b = bb;
    a = Math.min(a, bb); b = Math.max(b, bb);
  }
  if (a > b) { if (moved === 'hi') b = a; else a = b; }
  return [a, b];
};
