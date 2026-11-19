<script setup lang="ts">
/* 시장분석 › 매각분석 › 저가매수(운영) — 1회 유찰 물건을 같은 동 진행 중 물건끼리 평당 감정가로 견주어 가격매력 · 면적 대비 이득을 보인다.
 * 시안(2026-11-20 사용자 '일단 적용해봐') 배치 그대로. 계산은 services/lowBuy(순수). 자료 — 마이 사건 차트(hits) · 건축물대장(연식 · 엘베 · 이름) · 국토부 실거래(웹 캐시) */
import { computed, onMounted, ref } from 'vue';
import { loadHits, type HitDoc } from '../services/agentRemote';
import { getBuildingFacts } from '../services/buildingFacts';
import type { BuildingFacts } from '../services/publicDataApi';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { analyzeAddress, type CaseTradeRow } from '../services/caseTradeAnalysis';
import { lotOf } from '../services/bidPredict';
import { addressWithName, buildingNameOf } from '../utils/addressName';
import { kakaoBuildingName } from '../services/addressSearch';
import { lookupAddress } from '../services/addressLookup';
import { buildingAgeText } from '../utils/buildingAge';
import { isLiveCase, lowBuyRows, LB_HOT, LB_WARN, LB_AREA_TOL, LB_YEAR_TOL, type LowBuyCase, type LowBuyRow, type LowBuyTrade } from '../services/lowBuy';

/** 동 — 낙찰가예측의 동선택(이 브라우저에 남긴 값)을 그대로, 없으면 검암동 */
const dong = (() => { try { return (JSON.parse(localStorage.getItem('bidtest.v1') || 'null') as { dong?: string } | null)?.dong?.trim() || '검암동'; } catch { return '검암동'; } })();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = todayIso();

const msg = ref('불러오는 중입니다…');
const hits = ref<HitDoc[]>([]);
const facts = ref<Record<string, BuildingFacts | null>>({});
const factsDone = ref(false);
const trades = ref<LowBuyTrade[] | null>(null);
const tradeMsg = ref('실거래 받는 중');
const tradeSpan = ref('');

const lotKey = (a: string) => { const l = lotOf(a); return l.dong && l.jibun ? `${l.dong} ${l.jibun}` : ''; };
/* 도로명 주소는 지번으로(낙찰가예측과 같은 길) — 동 · 지번으로 대장 · 실거래를 묶는다 */
const toJibun = async (a: string): Promise<string> => {
  if (!a || lotOf(a).dong) return a;
  const road = a.replace(/\s*\(.*$/, '').split(',')[0].trim();
  const unit = (a.split(',')[1] ?? '').replace(/\s*\(.*$/, '').trim();
  const name = a.match(/\([^,()]*,\s*([^()]+)\)/)?.[1]?.trim() ?? '';
  try { const r = await resolveRegionFromAddress(road); if (r?.dong && r.jibun) return [r.sido, r.sigungu, r.dong, r.jibun, name, unit].filter(Boolean).join(' '); } catch { /* 그대로 */ }
  return a;
};
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
  const toT = (r: CaseTradeRow): LowBuyTrade | null => { const d = r.contractDate.replace(/\D/g, ''); return r.kind === '매매' && d.length === 8 ? { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, price: r.price, area: r.areaM2, lot: `${r.umdNm} ${r.jibun}` } : null; };
  try {
    const want: Array<['villa' | 'apt', number]> = [['villa', 2]]; if (liveHits.value.some((h) => /아파트/.test(h.kind))) want.push(['apt', 1]);
    const got = await Promise.all(want.map(([t, y]) => analyzeAddress({ address: addr, propertyType: t, years: y })));
    const all = got.flatMap((g) => g.dongRows).map(toT).filter((x): x is LowBuyTrade => !!x);
    trades.value = all;
    const ds = all.map((t) => t.date).sort();
    tradeSpan.value = ds.length ? `${ds[0].slice(2, 4)}.${ds[0].slice(5, 7)}~${ds[ds.length - 1].slice(2, 4)}.${ds[ds.length - 1].slice(5, 7)}` : '';
    tradeMsg.value = got.some((g) => g.error) && !all.length ? '실거래를 받지 못했습니다' : '';
  } catch { tradeMsg.value = '실거래를 받지 못했습니다'; }
};
onMounted(() => { void load(); });

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
const all = computed(() => (factsDone.value ? lowBuyRows(cases.value, trades.value, today) : []));
/** 후보 — 1회 유찰이고 비교할 비슷한 물건이 있는 것 */
const cand = computed(() => all.value.filter((r) => r.fails === 1 && r.vs != null));
const sortDir = ref<1 | -1>(1);
const rows = computed(() => [...cand.value].sort((a, b) => sortDir.value * ((a.vs ?? 9) - (b.vs ?? 9))));
const hotN = computed(() => cand.value.filter((r) => r.hot).length);
const asOfSpan = computed(() => { const ds = hits.value.map((h) => h.asOf).filter(Boolean).sort(); const f = (d: string) => `${d.slice(5, 7)}-${d.slice(8)}`; return ds.length ? (ds[0] === ds[ds.length - 1] ? f(ds[0]) : `${f(ds[0])}~${f(ds[ds.length - 1])}`) : ''; });

const won = (v: number) => Math.round(v).toLocaleString('ko-KR');
const man = (v: number) => `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
const d8 = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : '—');
const pctSigned = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
/** 표 주소 두 줄 — '검암동 676-1' / '건물명 3층301호' */
const addrLines = (a: string): [string, string] => {
  const m = a.match(/[가-힣0-9]+(?:동|가|읍|면|리)\s+(?:산\s*)?\d+(?:-\d+)?/);
  if (!m || m.index == null) return [a, ''];
  return [m[0], a.slice(m.index + m[0].length).replace(/\s*\(.*$/, '').trim()];
};
const mktWarn = (r: LowBuyRow) => !!r.mkt && r.mkt.price < r.appr * LB_WARN;
</script>

<template>
  <div class="lbp">
    <section class="lbp-card">
      <header class="lbp-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#213366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
        <h2>저가매수 1회 유찰 가격매력</h2>
      </header>
      <p class="lbp-desc"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" /></svg>{{ dong }} · 진행 중 {{ liveHits.length.toLocaleString('ko-KR') }}건과 비교 · 1회 유찰 {{ cand.length.toLocaleString('ko-KR') }}건 · 비슷한 물건 = 전용 ±{{ LB_AREA_TOL }}㎡ · 연식 ±{{ LB_YEAR_TOL }}년 · 가격매력 = 평당 감정가가 비슷한 물건보다 {{ Math.abs(LB_HOT * 100) }}% 이상 낮음({{ hotN }}건)</p>
      <div class="lbp-how">
        <div><b>평당 감정가 비교</b>같은 동네 비슷한 물건(전용 · 연식)의 평당 감정가 가운데값과 비교합니다. 영상의 '19평인데 1억 4천'을 찾는 칸입니다.</div>
        <div><b>면적 대비 이득</b>비슷한 물건 평당 감정가 × 이 물건 평수 − 이 물건 감정가. 같은 면적이면 감정이 이만큼 싸게 잡혔다는 뜻입니다.</div>
        <div><b>실거래로 한 번 더</b>같은 건물 같은 평형 매매 실거래가가 있으면 건수 · 날짜와 함께 보여 줍니다. 실거래가 감정가보다 10% 넘게 낮으면 빨간 경고.</div>
      </div>
      <p v-if="!factsDone" class="lbp-wait">{{ msg }}</p>
      <div v-else class="table-wrap lbp-tbl-wrap">
        <table class="lbp-tbl">
          <thead><tr>
            <th>사건번호</th><th class="l">주소</th><th>전용</th><th>연식</th><th>엘베</th><th class="r">감정가</th><th class="r">최저가<br>1회 유찰</th><th class="r">비슷한 물건<br>평당 감정가</th>
            <th class="r sort" @click="sortDir = sortDir === 1 ? -1 : 1">비슷한 물건<br>대비 <i class="ar">{{ sortDir === 1 ? '▲' : '▼' }}</i></th>
            <th class="r">면적 대비<br>이득</th><th class="r">실거래가<br>같은 평형</th><th>기일</th>
          </tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key" :class="{ hot: r.hot }">
              <td><span class="lbp-case">{{ r.key.slice(0, 4) }}타경<br>{{ r.key.slice(5) }}</span><span v-if="r.hot" class="lbp-chip">가격매력</span></td>
              <td class="l addr"><span class="ln">{{ addrLines(r.addr)[0] }}</span><span class="ln">{{ addrLines(r.addr)[1] }}</span></td>
              <td>{{ r.area.toFixed(2) }}㎡<small>{{ r.py.toFixed(2) }}평</small></td>
              <td>{{ r.year ?? '—' }}<small>{{ r.year ? buildingAgeText(r.year) : '' }}</small></td>
              <td><span v-if="r.elev == null" class="mu">—</span><span v-else-if="r.elev" class="ev o">있음</span><span v-else class="ev x">없음</span></td>
              <td class="r"><span class="nb">{{ won(r.appr) }}</span><small>평당 {{ man(r.ppy) }}</small></td>
              <td class="r"><span class="nb">{{ won(r.min) }}</span><small>평당 {{ man(r.min / r.py) }}</small></td>
              <td class="r"><span class="nb">{{ man(r.peerPpy!) }}</span><small>{{ r.peerN }}건</small></td>
              <td :class="['r', r.vs! < 0 ? 'good' : 'bad']">{{ pctSigned(r.vs!) }}</td>
              <td :class="['r', r.gain! > 0 ? 'good' : 'bad']"><span class="nb">{{ r.gain! > 0 ? '+' : '−' }}{{ won(Math.abs(r.gain!)) }}</span></td>
              <td class="r">
                <template v-if="r.mkt"><span class="nb">{{ won(r.mkt.price) }}</span><small>{{ r.mkt.n }}건 · {{ d8(r.mkt.last) }} · 감정가 {{ Math.round(r.appr / r.mkt.price * 100) }}%</small><small v-if="mktWarn(r)" class="warn">실거래가 감정가보다 낮음</small></template>
                <span v-else class="mu">{{ trades ? '—' : tradeMsg || '—' }}</span>
              </td>
              <td>{{ d8(r.next) }}<small>신건 {{ d8(r.first) }}</small></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="12" class="mu">비교할 1회 유찰 물건이 없습니다.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="lbp-note">숫자는 마이가 {{ asOfSpan }}에 모은 {{ dong }} 사건과 저장된 국토부 실거래{{ tradeSpan ? `(${tradeSpan})` : '' }} 기준입니다. 연식 · 엘베는 건축물대장. 진행 상태는 그 뒤 바뀌었을 수 있습니다.</p>
    </section>
  </div>
</template>

<style scoped>
.lbp { display: flex; flex-direction: column; gap: 12px; }
.lbp-card { background: #fff; border: 1px solid #e3e7ee; border-radius: 14px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.lbp-head { display: flex; align-items: center; gap: 8px; }
.lbp-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #213366; }
.lbp-desc { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: #4b5563; }
.lbp-desc svg { flex: none; }
.lbp-how { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.lbp-how div { background: #f6f8fb; border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 12px; font-size: 12px; color: #4b5563; line-height: 1.6; }
.lbp-how b { display: block; color: #111827; font-size: 15px; font-weight: 800; margin-bottom: 2px; }   /* 카드 안 상자 제목 15 · 800, 아이콘 없음 */
.lbp-wait { margin: 0; padding: 24px 0; text-align: center; font-size: 13px; color: #6b7280; }
.lbp-tbl-wrap { border: 1px solid #e3e7ee; border-radius: 8px; overflow: auto; background: #fff; box-shadow: none; }
.lbp-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.lbp-tbl th { background: #f4f6fa; font-weight: 700; color: #374151; padding: 8px 8px; white-space: nowrap; border-bottom: 1px solid #e3e7ee; font-size: 12px; }
.lbp-tbl td { padding: 8px 8px; border-bottom: 1px solid #eef1f6; text-align: center; white-space: nowrap; vertical-align: middle; font-variant-numeric: tabular-nums; }
.lbp-tbl tr:last-child td { border-bottom: 0; }
.lbp-tbl .l { text-align: left; }
.lbp-tbl .r { text-align: right; }
.lbp-tbl td small { display: block; font-size: 12px; color: #6b7280; }
.lbp-tbl td small.warn { color: #dc2626; }
.lbp-tbl td.addr .ln { display: block; line-height: 18px; }
.lbp-tbl th.sort { cursor: pointer; user-select: none; }
.lbp-tbl th.sort:hover { background: #e9edf5; }
.lbp-tbl th .ar { font-style: normal; font-size: 12px; color: #2b6df3; }
.lbp-tbl tr.hot td { background: #fff5f5; }   /* 가격매력 줄 — 연분홍 */
.lbp-case { color: #2b6df3; line-height: 1.35; }
.lbp-chip { display: block; width: max-content; margin: 3px auto 0; font-size: 12px; padding: 0 6px; line-height: 18px; border-radius: 4px; background: #fdecec; color: #dc2626; }
.lbp-tbl .ev { font-size: 12px; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }   /* 엘베 — 낙찰가예측 표와 같은 칩 */
.lbp-tbl .ev.o { background: #e7f6ed; color: #1f7a4a; font-weight: 600; }
.lbp-tbl .ev.x { background: #fdecec; color: #dc2626; }
.lbp-tbl .good { color: #16a34a; }
.lbp-tbl .bad { color: #dc2626; }
.lbp-tbl td.good, .lbp-tbl td.bad { font-weight: 700; }
.lbp-tbl td.good .nb, .lbp-tbl td.bad .nb { font-weight: 400; }
.lbp-tbl .mu { color: #9ca3af; }
.lbp-note { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.7; }
@media (max-width: 720px) { .lbp-how { grid-template-columns: minmax(0, 1fr); } }
</style>
