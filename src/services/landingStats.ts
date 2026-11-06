// 대문(로그인 전 화면) 숫자 — 우리가 모아 둔 실거래 건수 · 분석 가능한 단지 수.
//
// 실거래 자료(cachePlaceHistoryV2)는 로그인해야 읽혀서 대문이 직접 셀 수 없다. 그래서 로그인한 사람이
// 시군구 실거래를 불러올 때마다 그 시군구의 건수 · 단지 수를 publicStatsD/{시군구} 에 적고,
// 전체 합을 publicStats/landing 한 장에 다시 적는다. 대문은 그 한 장만 읽는다(로그인 없이 읽기 허용).
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { firestore } from './firebase';

type Payload = { trades?: Array<{ apartmentName?: string; jibun?: string; umdNm?: string }>; rents?: unknown[] };
const DAY = 24 * 60 * 60 * 1000;
const STOPPED = true;

/** 시군구 하나 — 건수(매매 + 전월세)와 단지 수(동 · 지번 · 이름이 다른 건물) */
export const countDistrict = (p: Payload) => {
  const trades = (p.trades?.length ?? 0) + (p.rents?.length ?? 0);
  const keys = new Set((p.trades ?? []).map((t) => `${t.umdNm ?? ''}|${t.jibun || t.apartmentName || ''}`).filter((k) => !k.endsWith('|')));
  return { trades, complexes: keys.size };
};

/** 받은 시군구 자료를 집계에 더한다 — 같은 시군구는 이 브라우저에서 하루 한 번만 적는다. 실패해도 화면은 그대로 */
export const noteDistrictStats = async (key: string, p: Payload) => {
  // 2026-11-05 멈춤 — 대문 숫자는 이제 새벽 적재(jobs/trade-nightly)가 DB 전체를 세어 적는다.
  // 여기서도 적으면 그 한 장을 시군구 몇 곳의 합으로 덮어써 숫자가 줄어든다
  if (STOPPED) return;
  if (!firestore || !key) return;
  const mark = `landingStat.${key}`;
  try { if (Date.now() - Number(localStorage.getItem(mark) ?? 0) < DAY) return; } catch { /* 그냥 적는다 */ }
  try {
    const c = countDistrict(p);
    if (!c.trades) return;
    // 기간이 다른 조회(1년 · 4년)가 섞여도 줄지 않게 — 그 시군구에서 본 가장 큰 값을 남긴다
    const ref = doc(firestore, 'publicStatsD', key.replace(/[/\\.#$[\]]/g, '-'));
    const was = (await getDoc(ref)).data() as { trades?: number; complexes?: number } | undefined;
    await setDoc(ref, { trades: Math.max(c.trades, was?.trades ?? 0), complexes: Math.max(c.complexes, was?.complexes ?? 0), at: Date.now() });
    const all = await getDocs(collection(firestore, 'publicStatsD'));
    let trades = 0; let complexes = 0;
    all.forEach((d) => { const v = d.data() as { trades?: number; complexes?: number }; trades += v.trades ?? 0; complexes += v.complexes ?? 0; });
    await setDoc(doc(firestore, 'publicStats', 'landing'), { trades, complexes, districts: all.size, at: Date.now() });
    try { localStorage.setItem(mark, String(Date.now())); } catch { /* 그만 */ }
  } catch {
    /* 집계는 덤 — 못 적어도 그만 */
  }
};
