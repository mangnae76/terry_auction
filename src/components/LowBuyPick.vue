<script setup lang="ts">
/* 시장분석 › 매각분석 › 저가매수(운영) — '1회 유찰 최저가로 낙찰받으면 얼마 남나'(2026-11-20 사용자 최종 시안).
 * 예상 매도가 1(계산) · 2(직접) 중 고른 값 − 최저가, 응찰 확률. 계산은 services/lowBuy(순수). 자료 — 마이 사건 차트(hits) · 건축물대장 · 국토부 실거래(웹 캐시) */
import { computed, ref } from 'vue';
import { LB_HOT_RATE, lbJudge } from '../services/lowBuy';
import { useSale2 } from '../composables/useSale2';
import { useLowBuyData } from '../composables/useLowBuyData';
import { useAuctionStore } from '../stores/auctionStore';
import { caseKey } from '../services/bidPredict';
import { favCaseNo } from '../services/tankFav';
import { parsedFromCase, caseNumberOf } from '../services/caseRegister';
import CaseJudgeList, { type JudgeRow } from './CaseJudgeList.vue';

/** 동 — 낙찰가예측의 동선택(이 브라우저에 남긴 값)을 그대로, 없으면 검암동 */
const dong = (() => { try { return (JSON.parse(localStorage.getItem('bidtest.v1') || 'null') as { dong?: string } | null)?.dong?.trim() || '검암동'; } catch { return '검암동'; } })();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = todayIso();

/** 뺀 까닭별 건수 — '엘베 있는 건물 30 · 지하 · 반지하 4 · 엘베 없는 5층 이상 6' */
const skipText = computed(() => { const c = new Map<string, number>(); skipWhy.value.forEach((w) => c.set(w, (c.get(w) ?? 0) + 1)); return [...c].map(([w, n]) => `${w} ${n.toLocaleString('ko-KR')}`).join(' · '); });
const { msg, hits, liveHits, factsDone, all, tradeSpan, skipKeys, skipWhy } = useLowBuyData(dong, today);
const { sale2 } = useSale2();
/** 후보 — 1회 유찰(지하 · 반지하 · 엘베 없는 5층 이상은 lowBuyRows 에서 이미 뺌) */
const cand = computed(() => all.value.filter((r) => r.fails === 1));
const judgeOf = (r: (typeof cand.value)[number]) => lbJudge(r.est, r.min, sale2.value[r.key]);
/** 최저가 낙찰 차익 큰 순(모르면 아래) */
const rows = computed(() => [...cand.value].sort((a, b) => (judgeOf(b).gap ?? -Infinity) - (judgeOf(a).gap ?? -Infinity)));
const hotN = computed(() => cand.value.filter((r) => judgeOf(r).hot).length);
const asOfSpan = computed(() => { const ds = hits.value.map((h) => h.asOf).filter(Boolean).sort(); const f = (d: string) => `${d.slice(5, 7)}-${d.slice(8)}`; return ds.length ? (ds[0] === ds[ds.length - 1] ? f(ds[0]) : `${f(ds[0])}~${f(ds[ds.length - 1])}`) : ''; });

/* ---------- 공통 표(CaseJudgeList) · 사건등록 — 관심물건과 같은 표 · 같은 저장 길(2026-11-20 사용자 '저가매수에서도 등록') ---------- */
const auctions = useAuctionStore();
const mine = computed(() => new Set(auctions.auctions.map((a) => caseKey(a.caseNumber)).filter(Boolean)));
const tidOf = computed(() => new Map(hits.value.map((h) => [h.key, h.tid])));
const judgeRows = computed<JudgeRow[]>(() => rows.value.map((r) => {
  const c = favCaseNo(r.key);
  return { id: r.key, key: r.key, tid: tidOf.value.get(r.key) ?? '', kind: r.kind, caseNo: c.caseNo, pn: c.pn, court: '', addr: r.addr, area: r.area, appr: r.appr, min: r.min, fails: r.fails,
    date: r.next, status: '진행', stateText: '', lb: r, judgeMsg: '', registered: mine.value.has(r.key) };
}));
const note = ref('');
const busyId = ref('');
const register = async (j: JudgeRow) => {
  if (busyId.value || mine.value.has(j.key)) return;
  busyId.value = j.id;
  try {
    const c = favCaseNo(j.key);
    await auctions.importParsedPdfAuctions([parsedFromCase({ source: '저가매수', caseNo: c.caseNo, pn: c.pn, court: '', kind: j.kind, addr: j.addr, fails: j.fails, date: j.date, appr: j.appr, min: j.min, bArea: j.area })]);
    note.value = `${caseNumberOf(c)} 을 물건목록에 올렸습니다.`;
  } catch { note.value = '등록하지 못했습니다. 다시 해 주세요.'; }
  busyId.value = '';
};
/** 사진 — 탱크 사건 화면을 새 창으로(관심물건과 같은 길) */
const TANK_VIEW = 'https://www.tankauction.com/ca/inc/component/popup/caView.php?tid=';
const openPhotos = (j: JudgeRow) => { if (j.tid) window.open(`${TANK_VIEW}${encodeURIComponent(j.tid)}`, '_blank', 'noopener'); };
</script>

<template>
  <div class="lbp">
    <section class="lbp-card">
      <header class="lbp-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#213366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
        <h2>저가매수 1회 유찰 최저가 낙찰 차익</h2>
      </header>
      <p class="lbp-desc"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" /></svg>{{ dong }} · 진행 중 {{ liveHits.length.toLocaleString('ko-KR') }}건 · 1회 유찰 {{ cand.length.toLocaleString('ko-KR') }}건<template v-if="skipKeys.size"> · 뺀 물건 {{ skipText }}</template> · 가격매력 = 최저가 낙찰 차익 {{ Math.round(LB_HOT_RATE * 100) }}% 이상 · 매도가 근거 2건 이상 또는 매도가 2 입력({{ hotN }}건)</p>
      <div class="lbp-how">
        <div><b>예상 매도가 1</b>같은건물 같은평형 실거래, 없으면 같은 건물 다른 평형, 그래도 없으면 같은 동 비슷한 물건 1년 평균으로 계산합니다.</div>
        <div><b>예상 매도가 2</b>알아본 매도 가능 가격을 넣으면 그 값으로 차익을 계산합니다. 체크한 칸으로 계산합니다.</div>
        <div><b>최저가 낙찰 확률</b>아무도 들어오지 않을 확률입니다. 낙찰가예측 모델의 응찰 확률을 뺀 값입니다.</div>
      </div>
      <p v-if="!factsDone" class="lbp-wait">{{ msg }}</p>
      <template v-else>
        <p v-if="note" class="lbp-msg">{{ note }}</p>
        <!-- 표는 관심물건과 같은 공통 부품(2026-11-20 사용자) -->
        <CaseJudgeList :rows="judgeRows" :busy-id="busyId" empty="비교할 1회 유찰 물건이 없습니다." @register="register" @photo="openPhotos" />
      </template>
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
.lbp-msg { margin: 0; font-size: 12px; color: #4b5563; }
.lbp-note { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.7; }
@media (max-width: 720px) { .lbp-how { grid-template-columns: minmax(0, 1fr); } }
</style>
