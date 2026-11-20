// 도로명 주소 → 지번 주소 한 줄. 탱크 · 마이 자료에 '인천광역시 서구 승학로506번길 63, 에이동 3층302호 (검암동,정성드림빌5차)' 처럼
// 도로명으로 오는 사건이 있어, 다른 줄과 같은 꼴 '인천광역시 서구 검암동 493-4 정성드림빌5차 에이동 3층302호' 로 맞춘다(2026-11-20 사용자).
// 이미 지번(동 + 번지)이면 그대로, 카카오가 못 풀면 그대로.
import { resolveRegionFromAddress } from './regionResolver';
import { lotOf } from './bidPredict';

/** 도로명 꼴 — '승학로506번길 63, …' · '(검암동,정성드림빌5차)'. '에이동 3층' 같은 건물 동을 법정동으로 잘못 읽지 않게 먼저 본다 */
export const isRoadAddr = (a: string): boolean => /[가-힣0-9](로|길)\s?\d+(-\d+)?\s*,/.test(a) || /\([가-힣0-9]+(동|가|읍|면|리)\s*,/.test(a);
export const isJibunAddr = (a: string): boolean => !isRoadAddr(a) && !!lotOf(a).dong;

export const toJibunAddr = async (a: string): Promise<string> => {
  if (!a || isJibunAddr(a)) return a;
  const road = a.replace(/\s*\(.*$/, '').split(',')[0].trim();
  const unit = (a.split(',')[1] ?? '').replace(/\s*\(.*$/, '').trim();
  const name = a.match(/\([^,()]*,\s*([^()]+)\)/)?.[1]?.trim() ?? '';
  /* 시도는 원래 주소 맨 앞 글('인천광역시')을 그대로 — 카카오는 '인천'처럼 줄여 준다 */
  const sido0 = a.trim().split(/\s+/)[0] ?? '';
  try { const r = await resolveRegionFromAddress(road); if (r?.dong && r.jibun) return [/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/.test(sido0) ? sido0 : r.sido, r.sigungu, r.dong, r.jibun, name, unit].filter(Boolean).join(' '); } catch { /* 그대로 */ }
  return a;
};
