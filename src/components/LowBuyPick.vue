<script setup lang="ts">
/* 시장분석 › 매각분석 › 저가매수(운영) — '1회 유찰 최저가로 낙찰받으면 얼마 남나'(2026-11-20 사용자 최종 시안).
 * 예상 매도가 1(계산) · 2(직접) 중 고른 값 − 최저가, 응찰 확률. 계산은 services/lowBuy(순수). 자료 — 마이 사건 차트(hits) · 건축물대장 · 국토부 실거래(웹 캐시) */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { LB_HOT_RATE, lbJudge, lbKindGroup } from '../services/lowBuy';
import { agentOnline, sendAgentCommand, watchAgentStatus, type AgentStatus } from '../services/agentRemote';
import { courtOfRegion } from '../services/courtRegion';
import { useSale2 } from '../composables/useSale2';
import { lowBuyOf } from '../composables/useLowBuyData';
import { useAuctionStore } from '../stores/auctionStore';
import { caseKey } from '../services/bidPredict';
import { favCaseNo } from '../services/tankFav';
import { parsedFromCase, caseNumberOf } from '../services/caseRegister';
import CaseJudgeList, { type JudgeRow } from './CaseJudgeList.vue';
import AppConfirm from './AppConfirm.vue';
import { useCaseRegister } from '../composables/useCaseRegister';

/* ---------- 조회 조건 — 웹 맨 위 띠(시/도 · 시/군/구 · 읍면동 · 종류 · 조회)가 'lowbuy:query' 로 알리고 이 브라우저에 남긴다(2026-11-20 사용자 시안) ---------- */
type LbQuery = { sido: string; sgg: string; dong: string; kind: '연립다세대' | '아파트' | '오피스텔' };
const Q_KEY = 'ta.web.lowbuy.q';
const KIND_GROUP: Record<LbQuery['kind'], 'villa' | 'apt' | 'etc'> = { 연립다세대: 'villa', 아파트: 'apt', 오피스텔: 'etc' };
const readQ = (): LbQuery => {
  const d: LbQuery = { sido: '인천광역시', sgg: '서해구', dong: '검암동', kind: '연립다세대' };
  try { const v = JSON.parse(localStorage.getItem(Q_KEY) || 'null') as Partial<LbQuery> | null; return v?.dong ? { ...d, ...v, kind: v.kind && v.kind in KIND_GROUP ? v.kind : d.kind } as LbQuery : d; } catch { return d; }
};
const q = ref<LbQuery>(readQ());
const dong = computed(() => q.value.dong);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = todayIso();
const isoPlus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** 동마다 자료 묶음 하나 — 한 번 읽은 동은 탭을 옮겨 와도 그대로(lowBuyOf, 관심물건과 같은 곳). fresh 는 마이가 새로 받은 뒤만 */
const data = shallowRef(lowBuyOf(q.value.dong, today));
const reload = (fresh = false) => { data.value = lowBuyOf(q.value.dong, today, fresh); };
const onQuery = (e: Event) => {
  const d = (e as CustomEvent<Partial<LbQuery>>).detail; if (!d?.dong) return;
  const was = q.value.dong; q.value = { ...q.value, ...d } as LbQuery;
  if (d.dong !== was) reload();
};
const msg = computed(() => data.value.msg.value);
const hits = computed(() => data.value.hits.value);
const factsDone = computed(() => data.value.factsDone.value);
const tradeSpan = computed(() => data.value.tradeSpan.value);
const loaded = computed(() => msg.value !== '불러오는 중입니다…' || hits.value.length > 0);
/** 종류 — 고른 종류만(빌라 = 다세대 · 연립 · 도시형) */
const inKind = (kind: string) => lbKindGroup(kind) === KIND_GROUP[q.value.kind];
const kindOfKey = computed(() => new Map(hits.value.map((h) => [h.key, h.kind])));
const liveHits = computed(() => data.value.liveHits.value.filter((h) => inKind(h.kind)));
const all = computed(() => data.value.all.value.filter((r) => inKind(r.kind)));
const skipWhy = computed(() => new Map([...data.value.skipWhy.value].filter(([k]) => inKind(kindOfKey.value.get(k) ?? ''))));
const skipKeys = computed(() => new Set(skipWhy.value.keys()));
/** 뺀 까닭별 건수 — '엘베 있는 건물 30 · 지하 · 반지하 4 · 엘베 없는 5층 이상 6' */
const skipText = computed(() => { const c = new Map<string, number>(); skipWhy.value.forEach((w) => c.set(w, (c.get(w) ?? 0) + 1)); return [...c].map(([w, n]) => `${w} ${n.toLocaleString('ko-KR')}`).join(' · '); });
const { sale2 } = useSale2();
/** 후보 — 1회 유찰(지하 · 반지하 · 엘베 없는 5층 이상은 lowBuyRows 에서 이미 뺌) */
const cand = computed(() => all.value.filter((r) => r.fails === 1));
const judgeOf = (r: (typeof cand.value)[number]) => lbJudge(r.est, r.min, sale2.value[r.key]);
/** 최저가 낙찰 차익 큰 순(모르면 아래) */
const rows = computed(() => [...cand.value].sort((a, b) => (judgeOf(b).gap ?? -Infinity) - (judgeOf(a).gap ?? -Infinity)));
const hotN = computed(() => cand.value.filter((r) => judgeOf(r).hot).length);
const asOfSpan = computed(() => { const ds = hits.value.map((h) => h.asOf).filter(Boolean).sort(); const f = (d: string) => `${d.slice(5, 7)}-${d.slice(8)}`; return ds.length ? (ds[0] === ds[ds.length - 1] ? f(ds[0]) : `${f(ds[0])}~${f(ds[ds.length - 1])}`) : ''; });
/** 받은 때 — 그 동 사건 문서가 마지막으로 저장된 때 '11.20 14:32' */
const gotAt = computed(() => { const t = Math.max(0, ...hits.value.map((h) => h.at)); if (!t) return ''; const d = new Date(t); const z = (n: number) => String(n).padStart(2, '0'); return `${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; });

/* ---------- 마이로 받기 — 낙찰가예측 '조회수수집'과 같은 명령(hits · 탱크옥션 기일 목록 → 그 동 사건 · 차트) ---------- */
const agent = ref<AgentStatus | null>(null);
const nowMs = ref(Date.now());
let stopAgent: (() => void) | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
const agentOn = computed(() => agentOnline(agent.value, nowMs.value));
const agentAgo = computed(() => { const at = agent.value?.at?.toMillis?.(); return at ? Math.max(0, Math.round((nowMs.value - at) / 1000)) : 0; });
/** 마이가 지금 이 동을 받는 중인가 — target '2026-05-24 ~ 2027-01-18 인천-본원 검암동' */
const hitsBusy = computed(() => !!agent.value?.busy && String(agent.value?.target ?? '').endsWith(` ${dong.value}`));
const court = computed(() => courtOfRegion(q.value.sido, q.value.sgg));
const cmdNote = ref('');
const fetchHits = async (fresh: boolean) => {
  if (!court.value) { cmdNote.value = `${q.value.sido} ${q.value.sgg}는 아직 마이가 받는 법원 목록에 없습니다.`; return; }
  try {
    /* 처음은 지난 반년 + 앞으로 두 달(응찰 확률을 배울 매각 사건까지), 다시받기는 지난 2주 + 앞으로 두 달 */
    await sendAgentCommand('', 'hits', { site: '탱크옥션', from: isoPlus(fresh ? -180 : -14), to: isoPlus(60), court: court.value, dong: dong.value });
    cmdNote.value = '';
  } catch { cmdNote.value = '명령을 보내지 못했습니다. 다시 해 주세요.'; }
};
/* 받기가 끝나면(바쁨 → 쉼) 다시 읽는다 */
watch(() => agent.value?.busy, (b, was) => { if (was && !b && String(agent.value?.target ?? '').endsWith(` ${dong.value}`)) reload(true); });
onMounted(() => {
  window.addEventListener('lowbuy:query', onQuery);
  stopAgent = watchAgentStatus('', (st) => { agent.value = st; }, () => { agent.value = null; });
  tick = setInterval(() => { nowMs.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => { window.removeEventListener('lowbuy:query', onQuery); stopAgent?.(); if (tick) clearInterval(tick); });

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
const { confirmBox, register: registerCase } = useCaseRegister();
const register = async (j: JudgeRow) => {
  if (busyId.value || mine.value.has(j.key)) return;
  busyId.value = j.id;
  const c = favCaseNo(j.key);
  await registerCase(j.key, caseNumberOf(c), () => parsedFromCase({ source: '저가매수', caseNo: c.caseNo, pn: c.pn, court: '', kind: j.kind, addr: j.addr, fails: j.fails, date: j.date, appr: j.appr, min: j.min, bArea: j.area }), (m) => { note.value = m; });
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
      <!-- 자료 상태 줄 — 받아 둔 자료 있음(초록) · 없음(주황) · 받는 중(파랑), 시안 그대로(2026-11-20) -->
      <div v-if="hitsBusy" class="lbp-state run"><i class="dot" /><b>{{ dong }} {{ q.kind }}</b><span>마이가 탱크옥션에서 받는 중<template v-if="agent?.message"> · {{ agent.message }}</template></span></div>
      <div v-else-if="loaded && !hits.length" class="lbp-state none"><i class="dot" /><b>{{ dong }} {{ q.kind }}</b><span>받아 둔 자료가 없습니다</span><span class="sp" /><small>{{ agentOn ? `마이 켜짐 · ${agentAgo.toLocaleString('ko-KR')}초 전` : '마이 꺼짐' }}</small><button type="button" class="lbp-btn pri" :disabled="!agentOn || !!agent?.busy || !!agent?.paused" @click="fetchHits(true)">마이로받기</button></div>
      <div v-else-if="hits.length" class="lbp-state"><i class="dot" /><b>{{ dong }} {{ q.kind }}</b><span>진행 중 {{ liveHits.length.toLocaleString('ko-KR') }}건<template v-if="gotAt"> · {{ gotAt }} 받음(마이 · 탱크옥션)</template></span><span class="sp" /><small v-if="!agentOn">마이 꺼짐</small><button type="button" class="lbp-btn" :disabled="!agentOn || !!agent?.busy || !!agent?.paused" @click="fetchHits(false)">다시받기</button></div>
      <p v-if="cmdNote" class="lbp-msg">{{ cmdNote }}</p>
      <p v-if="hits.length" class="lbp-desc"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" /></svg>{{ dong }} · {{ q.kind }} · 진행 중 {{ liveHits.length.toLocaleString('ko-KR') }}건 · 1회 유찰 {{ cand.length.toLocaleString('ko-KR') }}건<template v-if="skipKeys.size"> · 뺀 물건 {{ skipText }}</template> · 가격매력 = 최저가 낙찰 차익 {{ Math.round(LB_HOT_RATE * 100) }}% 이상 · 매도가 근거 2건 이상 또는 매도가 2 입력({{ hotN }}건)</p>
      <div class="lbp-how">
        <div><b>예상 매도가 1</b>같은건물 같은평형 실거래, 없으면 같은 건물 다른 평형, 그래도 없으면 같은 동 비슷한 물건 1년 평균으로 계산합니다.</div>
        <div><b>예상 매도가 2</b>알아본 매도 가능 가격을 넣으면 그 값으로 차익을 계산합니다. 체크한 칸으로 계산합니다.</div>
        <div><b>최저가 낙찰 확률</b>아무도 들어오지 않을 확률입니다. 낙찰가예측 모델의 응찰 확률을 뺀 값입니다.</div>
      </div>
      <p v-if="!factsDone && !(loaded && !hits.length) && !hitsBusy" class="lbp-wait">{{ msg }}</p>
      <template v-else-if="factsDone">
        <p v-if="note" class="lbp-msg">{{ note }}</p>
        <!-- 표는 관심물건과 같은 공통 부품(2026-11-20 사용자) -->
        <CaseJudgeList :rows="judgeRows" :busy-id="busyId" empty="비교할 1회 유찰 물건이 없습니다." @register="register" @photo="openPhotos" />
      </template>
      <p v-if="hits.length" class="lbp-note">숫자는 마이가 {{ asOfSpan }}에 모은 {{ dong }} 사건과 저장된 국토부 실거래{{ tradeSpan ? `(${tradeSpan})` : '' }} 기준입니다. 연식 · 엘베는 건축물대장. 진행 상태는 그 뒤 바뀌었을 수 있습니다.</p>
    </section>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>   <!-- 보관함에 있으면 꺼낼지 묻는다 -->
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
.lbp-state { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #374151; }
.lbp-state b { color: #111827; }
.lbp-state .dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; flex: none; }
.lbp-state.none { background: #fff4e5; } .lbp-state.none .dot { background: #b45309; }
.lbp-state.run { background: #eef3fe; } .lbp-state.run .dot { background: #2b6df3; }
.lbp-state .sp { flex: 1; }
.lbp-state small { font-size: 12px; color: #6b7280; }
.lbp-btn { height: 32px; padding: 0 14px; border: 1px solid #d5dbe5; border-radius: 8px; background: #fff; color: #111827; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.lbp-btn.pri { background: #2b6df3; border-color: #2b6df3; color: #fff; font-weight: 700; }
.lbp-btn:disabled { opacity: .5; cursor: default; }
.lbp-wait { margin: 0; padding: 24px 0; text-align: center; font-size: 13px; color: #6b7280; }
.lbp-msg { margin: 0; font-size: 12px; color: #4b5563; }
.lbp-note { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.7; }
@media (max-width: 720px) { .lbp-how { grid-template-columns: minmax(0, 1fr); } }
</style>
