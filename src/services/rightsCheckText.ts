// 권리분석 결과 › 주의 항목 점검 — 항목 글 다듬기(앱 RightsPanel · 웹 selected 같이 쓴다)
/** 위반건축물 표시 — 건축물대장 이야기 문장은 이 한 문장으로(2026-11-14 사용자). 그런 문장이 없으면 끝에 붙인다 */
export const ILLEGAL_BLDG_TIP = '경매지 혹은 건축물대장을 발급하여 위반건축물 지정 여부를 확인해 주세요.';
export function rightsCheckText(item: string, text: string): string {
  const t = String(text ?? '').trim();
  if (!/위반\s*건축물/.test(String(item ?? ''))) return t;
  const out: string[] = [];
  for (const s of t.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    const x = /건축물\s*대장|정부\s*24/.test(s) ? ILLEGAL_BLDG_TIP : s;
    if (!out.includes(x)) out.push(x);
  }
  if (!out.includes(ILLEGAL_BLDG_TIP)) out.push(ILLEGAL_BLDG_TIP);
  return out.join(' ');
}
