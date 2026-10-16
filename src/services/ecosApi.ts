// 한국은행 ECOS — KB 주택가격지수를 달 단위로 받아 온다.
//
// ECOS 는 주소에 인증키를 끼워 부른다:
//   /api/StatisticSearch/{키}/json/kr/{시작}/{끝}/{통계표}/{주기}/{시작시점}/{끝시점}
// 뒤에 항목코드를 더 붙이면 그 항목만 오고, 안 붙이면 그 통계표의 항목이 다 온다.
// 항목코드는 통계표가 바뀌면 같이 바뀌므로 붙이지 않고, 받아 온 '항목 이름'으로 골라낸다.
// 통계표 코드가 바뀌면 .env 한 줄만 고치면 된다.

const ECOS_KEY = import.meta.env.VITE_ECOS_API_KEY ?? '';
/** 개발에서는 vite 통로(/api-ecos), 배포에서는 워커를 거친다 */
const ECOS_BASE = import.meta.env.VITE_ECOS_BASE ?? '/api-ecos';
/** KB 주택가격지수 — 매매 / 전세 통계표 */
const STAT_SALE = import.meta.env.VITE_ECOS_KB_SALE_STAT ?? '901Y062';
const STAT_JEONSE = import.meta.env.VITE_ECOS_KB_JEONSE_STAT ?? '901Y063';

export type IndexKind = 'sale' | 'jeonse';

export interface IndexPoint {
  /** YYYYMM */
  time: string;
  value: number;
}

export interface IndexSeries {
  key: string;
  /** 화면에 적는 이름 — '전국 아파트' */
  label: string;
  /** ECOS 가 준 항목 이름 그대로 */
  rawName: string;
  points: IndexPoint[];
}

export interface HousingIndexResult {
  kind: IndexKind;
  /** 가장 마지막 달 (YYYYMM) */
  baseTime: string;
  series: IndexSeries[];
  unit: string;
  warning?: string;
}

export const hasEcosKey = (): boolean => ECOS_KEY.length > 0;

/** 지금부터 거슬러 올라간 달 목록의 처음과 끝 (YYYYMM) */
const monthRange = (months: number): [string, string] => {
  const end = new Date();
  end.setMonth(end.getMonth() - 1); // 이번 달은 아직 안 나온다
  const start = new Date(end);
  start.setMonth(end.getMonth() - (months - 1));
  const ym = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return [ym(start), ym(end)];
};

type EcosRow = {
  ITEM_NAME1?: string;
  ITEM_CODE1?: string;
  TIME?: string;
  DATA_VALUE?: string;
  UNIT_NAME?: string;
};

/** 찾고 싶은 줄 — 이름에 이 낱말이 다 들어 있으면 그 줄이다 */
const WANTED: Array<{ key: string; label: string; must: string[]; not?: string[] }> = [
  { key: 'allTotal', label: '전국 전체', must: ['전국'], not: ['아파트', '연립', '단독'] },
  { key: 'allApt', label: '전국 아파트', must: ['전국', '아파트'] },
  { key: 'seoulApt', label: '서울 아파트', must: ['서울', '아파트'] },
];

const pickSeries = (rows: EcosRow[]): IndexSeries[] => {
  const byName = new Map<string, IndexPoint[]>();
  rows.forEach((row) => {
    const name = (row.ITEM_NAME1 ?? '').trim();
    const time = (row.TIME ?? '').trim();
    const value = Number(row.DATA_VALUE);
    if (!name || time.length < 6 || !Number.isFinite(value)) return;
    const list = byName.get(name) ?? [];
    list.push({ time, value });
    byName.set(name, list);
  });

  const out: IndexSeries[] = [];
  WANTED.forEach((want) => {
    const hit = [...byName.keys()].find((name) => {
      const flat = name.replace(/\s+/g, '');
      if (!want.must.every((w) => flat.includes(w))) return false;
      return !(want.not ?? []).some((w) => flat.includes(w));
    });
    if (!hit) return;
    out.push({
      key: want.key,
      label: want.label,
      rawName: hit,
      points: (byName.get(hit) ?? []).sort((a, b) => a.time.localeCompare(b.time)),
    });
  });
  return out;
};

/**
 * KB 주택가격지수를 받아 온다.
 * @param kind 매매(sale) / 전세(jeonse)
 * @param months 몇 달치를 볼지 (기본 18개월)
 */
export const fetchHousingPriceIndex = async (
  kind: IndexKind = 'sale',
  months = 18,
): Promise<HousingIndexResult> => {
  if (!ECOS_KEY) {
    return { kind, baseTime: '', series: [], unit: '', warning: 'ECOS 인증키가 없습니다 (.env 의 VITE_ECOS_API_KEY).' };
  }
  const [from, to] = monthRange(months);
  const stat = kind === 'sale' ? STAT_SALE : STAT_JEONSE;
  const url = `${ECOS_BASE}/api/StatisticSearch/${ECOS_KEY}/json/kr/1/2000/${stat}/M/${from}/${to}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`ECOS 호출 실패 (${res.status})`);
  const json = await res.json();

  // 오류는 { RESULT: { CODE, MESSAGE } } 꼴로 온다
  const result = json?.RESULT;
  if (result?.CODE) throw new Error(`ECOS: ${result.MESSAGE ?? result.CODE}`);

  const rows: EcosRow[] = json?.StatisticSearch?.row ?? [];
  if (rows.length === 0) {
    return { kind, baseTime: '', series: [], unit: '', warning: '받아 온 자료가 없습니다. 통계표 코드를 확인해 주세요.' };
  }
  const series = pickSeries(rows);
  const times = rows.map((r) => (r.TIME ?? '').trim()).filter(Boolean).sort();
  return {
    kind,
    baseTime: times[times.length - 1] ?? '',
    series,
    unit: (rows[0].UNIT_NAME ?? '').trim(),
    warning: series.length === 0 ? '전국·서울 아파트 항목을 찾지 못했습니다.' : undefined,
  };
};
