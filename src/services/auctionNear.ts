// 시세예측 빌라 — 낙찰 자료(saleData/main, 운영 전용)를 동 단위로 골라 쓴다(2026-11-29 시안 v7, docs/시세예측-v7-대조표.md).
// 읽기만 한다. 좌표는 없어서 화면이 지번으로 찾는다(실거래와 같은 길).
import { loadAgentDataset, type SaleRecord } from './agentRemote';
import { buildingName } from './saleAnalysis';

export type AucRec = {
  /** 화면 안 번호 */
  i: number;
  cs: string;
  /** 'YYYY.MM.DD' */
  date: string;
  /** 비교용 'YYYYMMDD' */
  ymd: string;
  ap: number;
  low: number;
  pr: number;
  /** 낙찰가율(%) */
  rate: number;
  fails: number;
  bids: number;
  area: number;
  year: number;
  floor: number;
  /** '201' — 호 숫자만 */
  ho: string;
  /** 지번 '640-4' */
  lot: string;
  name: string;
  addr: string;
};

const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const ymdOf = (v: unknown) => { const m = String(v ?? '').match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/); return m ? `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}` : ''; };
const VILLA = /다세대|연립|빌라|도시형/;
/** 낙찰가율(%) — 자료에 0.7(=70%)처럼 소수로 든 것도 있어 3 이하면 100을 곱한다. 없으면 낙찰가 ÷ 감정가 */
const rateOf = (v: number, pr: number, ap: number) => (v > 0 ? (v <= 3 ? v * 100 : v) : ap ? (pr / ap) * 100 : 0);

let all: Promise<SaleRecord[]> | null = null;
/** 모은 낙찰 전부 — 한 번만 받는다(같은 창 안) */
const loadAll = () => (all ??= loadAgentDataset('').then((x) => x.recs).catch(() => { all = null; return [] as SaleRecord[]; }));

/** 그 동(읍면동) 빌라 낙찰 — 매각된 것만(매각가 있는 것). 시도 앞 두 글자 · 동 이름으로 고른다 */
export const auctionsOfDong = async (sido: string, dong: string): Promise<AucRec[]> => {
  if (!dong) return [];
  const recs = await loadAll();
  const sd = String(sido ?? '').slice(0, 2);
  const out: AucRec[] = [];
  recs.forEach((r) => {
    const addr = String(r['소재지'] ?? '');
    if (!addr.includes(dong) || (sd && !addr.startsWith(sd) && !addr.includes(sd))) return;
    const kind = String(r['종류'] ?? '');
    if (kind && !VILLA.test(kind)) return;
    const pr = num(r['매각가']); const ap = num(r['감정가']);
    const ymd = ymdOf(r['매각일']);
    if (!(pr > 0) || !ymd) return;
    const after = addr.slice(addr.indexOf(dong) + dong.length);
    const lot = (after.match(/^\s*(산?\s?\d+(?:-\d+)?)/)?.[1] ?? '').replace(/\s+/g, '');
    const ho = addr.match(/(\d{2,5})\s*호/)?.[1] ?? '';
    out.push({
      i: out.length, cs: String(r['사건번호'] ?? ''), date: `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`, ymd,
      ap, low: num(r['최저가']), pr, rate: rateOf(num(r['매각가율']), pr, ap),
      fails: num(r['유찰회수']), bids: num(r['응찰자수']), area: num(r['전용면적']), year: num(r['건축연도']), floor: num(r['층']),
      ho, lot, name: buildingName(addr), addr,
    });
  });
  return out.sort((a, b) => b.ymd.localeCompare(a.ymd));
};
