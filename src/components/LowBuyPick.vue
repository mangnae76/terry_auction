<script setup lang="ts">
/* 시장분석 › 매각분석 › 저가매수(운영) — 1회 유찰 물건을 같은 동 진행 중 물건끼리 평당 감정가로 견주어 가격매력 · 면적 대비 이득을 보인다.
 * 시안(2026-11-20 사용자 '일단 적용해봐') 배치 그대로. 계산은 services/lowBuy(순수). 자료 — 마이 사건 차트(hits) · 건축물대장(연식 · 엘베 · 이름) · 국토부 실거래(웹 캐시) */
import { computed, ref } from 'vue';
import { buildingAgeText } from '../utils/buildingAge';
import { LB_HOT, LB_WARN, LB_AREA_TOL, LB_YEAR_TOL, type LowBuyRow } from '../services/lowBuy';
import { useLowBuyData } from '../composables/useLowBuyData';

/** 동 — 낙찰가예측의 동선택(이 브라우저에 남긴 값)을 그대로, 없으면 검암동 */
const dong = (() => { try { return (JSON.parse(localStorage.getItem('bidtest.v1') || 'null') as { dong?: string } | null)?.dong?.trim() || '검암동'; } catch { return '검암동'; } })();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = todayIso();

const { msg, hits, liveHits, factsDone, trades, all, tradeMsg, tradeSpan } = useLowBuyData(dong, today);
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
            <th class="r">면적 대비<br>이득</th><th class="r">실거래가<br>같은 평형</th><th>다음기일</th>
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
              <td>{{ r.fails + 1 }}차 {{ d8(r.next) }}<small>신건 {{ d8(r.first) }} 유찰</small></td>   <!-- 위 = 이번에 입찰하는 날(1회 유찰 최저가), 아래 = 유찰된 신건 날(2026-11-20 사용자 — 헷갈림) -->
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
