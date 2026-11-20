// 공동주택가격(공시가) — 감정가가 공시가의 몇 %인지로 감정이 싸게 잡혔는지 본다(2026-11-20 사용자 · 영상 안양 사례 '공시가 126%').
// 브이월드가 호를 못 찾으면 면적 · 지번 아무 줄로 떨어지므로, 받은 줄의 호(· 숫자 동)와 면적이 이 사건과 맞을 때만 쓴다(추정 금지).
import { parseAddressParts } from './addressLookup';
import type { ApartPrice } from './vworldApi';

/** 받은 공시가 줄이 이 사건 호실인가 — 호 숫자 같고, 면적 0.5㎡ 안, 동이 둘 다 숫자면 같아야 */
export const isSameUnit = (addr: string, areaM2: number, p: ApartPrice | null): boolean => {
  if (!p || !(p.price > 0)) return false;
  const want = parseAddressParts(addr);
  const ho = (s: string) => String(s ?? '').replace(/\D/g, '');
  if (!want.ho || ho(p.ho) !== ho(want.ho)) return false;
  if (areaM2 > 0 && p.areaM2 > 0 && Math.abs(p.areaM2 - areaM2) > 0.5) return false;
  const dw = want.buildingDong, dp = String(p.dong ?? '').replace(/동$/, '').trim();
  if (/^\d+$/.test(dw) && /^\d+$/.test(dp) && dw !== dp) return false;
  return true;
};

/** '1억 1,200만' · '9,800만' */
export const eokText = (v: number): string => {
  const eok = Math.floor(v / 1e8); const man = Math.round((v % 1e8) / 1e4);
  return eok > 0 ? `${eok}억${man > 0 ? ` ${man.toLocaleString('ko-KR')}만` : ''}` : `${man.toLocaleString('ko-KR')}만`;
};

/** 감정가 ÷ 공시가(%) — 둘 중 하나라도 없으면 null */
export const apprToOfficial = (appr: number, official: number): number | null => (appr > 0 && official > 0 ? (appr / official) * 100 : null);
