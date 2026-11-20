/* 저가매수 자료 — 그 동 마이 사건(hits) · 건축물대장(연식 · 엘베 · 이름) · 국토부 실거래로 lowBuyRows 를 만든다.
 * 매각분석 › 저가매수(LowBuyPick)와 물건등록 › 관심물건(TankFavPick)이 같이 쓴다(2026-11-20 — 같은 계산 한 곳) */
import { computed, onMounted, ref } from 'vue';
import { loadHits, type HitDoc } from '../services/agentRemote';
import { getBuildingFacts } from '../services/buildingFacts';
import type { BuildingFacts } from '../services/publicDataApi';
import { toJibunAddr } from '../services/roadToJibun';
import { analyzeAddress, type CaseTradeRow } from '../services/caseTradeAnalysis';
import { lotOf } from '../services/bidPredict';
import { addressWithName, buildingNameOf } from '../utils/addressName';
import { kakaoBuildingName } from '../services/addressSearch';
import { lookupAddress } from '../services/addressLookup';
import { isLiveCase, lowBuyRows, lbSellProb, type LowBuyCase, type LowBuyTrade, lbSkip, lbSkipWhy } from '../services/lowBuy';

/** auto = false 면 onMounted 를 걸지 않는다 — 화면이 뜬 뒤 동을 알게 되는 곳(관심물건)은 load() 를 직접 부른다 */
export const useLowBuyData = (dong: string, today: string, auto = true) => {
  const msg = ref('불러오는 중입니다…');
  const hits = ref<HitDoc[]>([]);
  const facts = ref<Record<string, BuildingFacts | null>>({});
  const factsDone = ref(false);
  const trades = ref<LowBuyTrade[] | null>(null);
  const tradeMsg = ref('실거래 받는 중');
  const tradeSpan = ref('');

  const lotKey = (a: string) => { const l = lotOf(a); return l.dong && l.jibun ? `${l.dong} ${l.jibun}` : ''; };
  /* 도로명 주소는 지번으로(낙찰가예측과 같은 길) — 동 · 지번으로 대장 · 실거래를 묶는다 */
  const toJibun = toJibunAddr;   // services/roadToJibun 한 곳
  const firstOf = (h: HitDoc) => (h.ev.find((e) => e.l === '1차 매각기일') ?? h.ev.find((e) => e.l === '최초진행일'))?.d ?? '';
  const liveHits = computed(() => hits.value.filter((h) => isLiveCase(h, today)));

  const load = async () => {
    try {
      const raw = await loadHits(dong);
      const out = [...raw];
      for (let i = 0; i < out.length; i += 6) await Promise.all(out.slice(i, i + 6).map(async (x, j) => { const a = await toJibun(x.addr); if (a !== x.addr) out[i + j] = { ...x, addr: a }; }));
      hits.value = out;
      if (!liveHits.value.length) { msg.value = `${dong} 진행 중 사건이 없습니다. 낙찰가예측에서 조회수수집을 먼저 해 주세요.`; return; }
      // 건축물대장 — 지번마다 한 번(30일 저장), 넷씩
      const lots = [...new Map(liveHits.value.map((h) => [lotKey(h.addr), h.addr])).entries()].filter(([k]) => k);
      let n = 0;
      for (let i = 0; i < lots.length; i += 4) {
        await Promise.all(lots.slice(i, i + 4).map(async ([k, a]) => {
          const f = await getBuildingFacts(a); facts.value = { ...facts.value, [k]: f };
          /* 대장 · 다른 사건 주소에 이름이 없으면 카카오 주소 검색의 건물명 — 낙찰가예측과 같은 길(2026-11-20 사용자 '건물명 안 나오는 거 다 넣어') */
          if (!String(f?.name ?? '').trim() && !nameByLot.value.get(k)) { const lot = lotStr(a); const nm = lot ? await kakaoBuildingName(lot).catch(() => '') : ''; const nm2 = nm || await lookupAddress(a, { areaM2: undefined }).then((r) => String(r.price?.name ?? '').trim()).catch(() => '');   /* 그래도 없으면 공동주택가격(브이월드) 단지명(2026-11-20 사용자) */
            if (nm2) kNames.value = { ...kNames.value, [k]: nm2 }; }
        }));
        n = Math.min(lots.length, i + 4); msg.value = `건축물대장 ${n.toLocaleString('ko-KR')} / ${lots.length.toLocaleString('ko-KR')}`;
      }
      factsDone.value = true;
      void loadTrades();
    } catch { msg.value = '사건을 읽지 못했습니다. 새로고침해 주세요.'; }
  };
  /** 국토부 매매 실거래 — 웹이 받아 둔 시군구 자료(이 브라우저 → DB → 국토부). 빌라 2년, 아파트가 있으면 아파트 1년도 */
  const loadTrades = async () => {
    const addr = liveHits.value.find((h) => lotKey(h.addr))?.addr; if (!addr) { tradeMsg.value = ''; return; }
    const toT = (r: CaseTradeRow, group: 'villa' | 'apt'): LowBuyTrade | null => { const d = r.contractDate.replace(/\D/g, ''); return r.kind === '매매' && d.length === 8 ? { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, price: r.price, area: r.areaM2, lot: `${r.umdNm} ${r.jibun}`, year: r.buildYear || undefined, group } : null; };
    try {
      const want: Array<['villa' | 'apt', number]> = [['villa', 2]]; if (liveHits.value.some((h) => /아파트/.test(h.kind))) want.push(['apt', 1]);
      const got = await Promise.all(want.map(([t, y]) => analyzeAddress({ address: addr, propertyType: t, years: y })));
      const all = got.flatMap((g, i) => g.dongRows.map((r) => toT(r, want[i][0]))).filter((x): x is LowBuyTrade => !!x);
      trades.value = all;
      const ds = all.map((t) => t.date).sort();
      tradeSpan.value = ds.length ? `${ds[0].slice(2, 4)}.${ds[0].slice(5, 7)}~${ds[ds.length - 1].slice(2, 4)}.${ds[ds.length - 1].slice(5, 7)}` : '';
      tradeMsg.value = got.some((g) => g.error) && !all.length ? '실거래를 받지 못했습니다' : '';
    } catch { tradeMsg.value = '실거래를 받지 못했습니다'; }
  };
  if (auto) onMounted(() => { void load(); });

  /** 지번마다 다른 사건 주소에 적힌 건물명 — 대장에 이름이 없는 필지를 채운다(낙찰가예측과 같은 길) */
  const kNames = ref<Record<string, string>>({});
  /** 주소에서 지번까지(카카오 건물명 찾기용) — 낙찰가예측 lotOf 와 같은 식 */
  const lotStr = (addr: string) => addr.replace(/\s*\(.*$/, '').replace(/\s*외\s*\d+필지.*$/, '').match(/^(.*?(?:동|가|읍|면|리)\s+(?:산\s*)?\d+(?:-\d+)?)/)?.[1]?.replace(/\s+/g, ' ') ?? '';
  const nameByLot = computed(() => { const m = new Map<string, string>(); hits.value.forEach((h) => { const n = buildingNameOf(h.addr); const k = lotKey(h.addr); if (n && k && !m.has(k)) m.set(k, n); }); return m; });
  const cases = computed<LowBuyCase[]>(() => liveHits.value.map((h) => {
    const lot = lotKey(h.addr); const f = facts.value[lot] ?? null;
    return { key: h.key, addr: addressWithName(h.addr, f?.name || nameByLot.value.get(lot) || kNames.value[lot]), kind: h.kind, area: h.area ?? 0, appr: h.appr, min: h.min, fails: h.fails, next: h.next, state: h.state, first: firstOf(h),
      year: f?.year ?? null, elev: f ? f.elevator > 0 : null, lot };
  }));
  /** 응찰 확률 — 낙찰가예측 회차 모델(이 동 hits 전부로 배움, 다가오는 회차만) */
  const pBids = computed(() => (factsDone.value ? lbSellProb(hits.value, new Set(liveHits.value.map((h) => h.key)), today) : new Map<string, number>()));
  const all = computed(() => (factsDone.value ? lowBuyRows(cases.value, trades.value, today, pBids.value) : []));
  /** 엘베 없는 5층 이상이라 뺀 사건(2026-11-20 사용자) */
  const skipKeys = computed(() => new Set(factsDone.value ? cases.value.filter(lbSkip).map((c) => c.key) : []));
  /** 뺀 까닭별 건수 · 사건마다 까닭 */
  const skipWhy = computed(() => new Map(factsDone.value ? cases.value.map((c) => [c.key, lbSkipWhy(c)] as const).filter(([, w]) => w) : []));
  return { msg, hits, liveHits, factsDone, trades, tradeMsg, tradeSpan, all, skipKeys, skipWhy, load };
};
