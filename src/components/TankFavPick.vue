<script setup lang="ts">
/* 물건등록 › 관심물건(운영) — 탱크옥션 관심물건(마이가 목록 API 로 읽어 둔 것)을 탱크와 같은 거르기 · 현황 탭으로 보고, 골라 물건목록에 올린다.
 * 시안(2026-11-20 사용자 '적용해줘봐' — 아티팩트 '관심물건 탭 시안' v5) 배치 그대로. 1 · 2단계만: 법원 명세서 받기 · 자동 분석 줄은 아직(그 자리엔 실제 상태만).
 * 마이턴 판단 칸은 저가매수와 같은 계산(composables/useLowBuyData · services/lowBuy) — 같은 동 진행 사건(마이 hits)이 있을 때만 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { agentOnline, loadTankFav, sendAgentCommand, watchAgentStatus, type AgentStatus, type TankFav, type TankFavDoc } from '../services/agentRemote';
import { useAuctionStore } from '../stores/auctionStore';
import { caseKey } from '../services/bidPredict';
import { parseAuctionPdfText } from '../services/pdfAuctionImport';
import { addressWithName, buildingNameOf } from '../utils/addressName';
import { kakaoBuildingName } from '../services/addressSearch';
import { lookupAddress } from '../services/addressLookup';
import { useLowBuyData } from '../composables/useLowBuyData';
import { LB_WARN, type LowBuyRow } from '../services/lowBuy';
import { FAV_FILTER0, FAV_PY, FAV_STATUS, favCaseNo, favCourtName, favPass, favPlace, favRound, favSort, favStatusCounts, type FavFilter, type FavSort } from '../services/tankFav';

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = todayIso();
const auctions = useAuctionStore();

/* ---------- 자료 ---------- */
const doc = ref<TankFavDoc | null>(null);
const loading = ref(true);
const note = ref('');
const load = async () => {
  try { doc.value = await loadTankFav(); } catch { note.value = '관심물건을 읽지 못했습니다. 새로고침해 주세요.'; }
  loading.value = false;
  void fillLowBuy(); void fillNames();
};
const items = computed<TankFav[]>(() => doc.value?.items ?? []);

/* ---------- 마이 — 낙찰가예측 수집 상자 마이 줄과 같은 꼴 ---------- */
const agent = ref<AgentStatus | null>(null);
const nowMs = ref(Date.now());
let stopAgent: (() => void) | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
const agentOn = computed(() => agentOnline(agent.value, nowMs.value));
const agentAgo = computed(() => { const at = agent.value?.at?.toMillis?.(); return at ? Math.max(0, Math.round((nowMs.value - at) / 1000)) : 0; });
const verLabel = (v: string) => { const m = /(\d{4})\.(\d{2})\.(\d{2})(-\d+)?/.exec(v); return m ? `ver.${m[1].slice(2)}.${m[2]}.${m[3]}${m[4] || ''}` : v.replace(/^web-agent\s*/, ''); };
const favBusy = computed(() => !!agent.value?.busy && agent.value?.target === '탱크옥션 관심물건');
const maiCmd = async (name: 'restart' | 'pause' | 'resume') => {
  try {
    await sendAgentCommand('', name, {});
    note.value = name === 'restart' ? '다시시작을 보냈습니다. 몇 초 뒤 마이가 새로 뜹니다(크롬 · 로그인은 그대로).' : name === 'pause' ? '대기를 보냈습니다. 마이가 명령을 받지 않습니다.' : '실행을 보냈습니다. 다시 명령을 받습니다.';
  } catch { note.value = '명령을 보내지 못했습니다. 다시 해 주세요.'; }
};
const fetchFav = async () => {
  try { await sendAgentCommand('', 'fav', {}); note.value = '관심물건가져오기를 보냈습니다. 마이가 탱크 관심물건 목록을 읽는 대로 아래 목록이 바뀝니다.'; } catch { note.value = '명령을 보내지 못했습니다. 다시 해 주세요.'; }
};
/* 마이가 가져오기를 끝내면(바쁨 → 쉼) 목록을 다시 읽는다. 실패 글(탱크 로그인 필요 · 막힘)은 마이 줄 아래에 그대로 */
watch(() => agent.value?.busy, (b, was) => { if (was && !b && /관심물건/.test(agent.value?.message ?? '')) { note.value = agent.value?.message ?? ''; void load(); } });
onMounted(() => {
  stopAgent = watchAgentStatus('', (st) => { agent.value = st; }, () => { agent.value = null; });
  tick = setInterval(() => { nowMs.value = Date.now(); }, 1000);
  void load();
});
onBeforeUnmount(() => { stopAgent?.(); if (tick) clearInterval(tick); });

/* ---------- 거르기 — 고른 것은 이 브라우저에 남긴다(새로고침 · 다시 열어도 그대로) ---------- */
const SAVE_KEY = 'tankfav.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as { q?: Partial<FavFilter>; sort?: FavSort } | null; } catch { return null; } })();
const q = reactive<FavFilter>({ ...FAV_FILTER0, ...(saved?.q ?? {}) });
const sortBy = ref<FavSort>(saved?.sort ?? 'hot');
watch([q, sortBy], () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ q: { ...q }, sort: sortBy.value })); } catch { /* 그만 */ } }, { deep: true });

const catOpts = computed(() => [...(doc.value?.cats ?? []).map((c) => ({ v: c.nm, t: `${c.nm} ── ${c.cnt.toLocaleString('ko-KR')}건` })), ...((doc.value?.noCtgr ?? 0) > 0 ? [{ v: '미분류', t: `미분류 ── ${(doc.value?.noCtgr ?? 0).toLocaleString('ko-KR')}건` }] : [])]);
const kindOpts = computed(() => [...new Set(items.value.map((f) => f.kind).filter(Boolean))].sort());
const places = computed(() => items.value.map((f) => favPlace(f)));
const sidoOpts = computed(() => [...new Set(places.value.map((p) => p.sido).filter(Boolean))].sort());
const sggOpts = computed(() => [...new Set(places.value.filter((p) => !q.sido || p.sido === q.sido).map((p) => p.sgg).filter(Boolean))].sort());
const emdOpts = computed(() => [...new Set(places.value.filter((p) => (!q.sido || p.sido === q.sido) && (!q.sgg || p.sgg === q.sgg)).map((p) => p.emd).filter(Boolean))].sort());
watch(() => q.sido, () => { if (q.sgg && !sggOpts.value.includes(q.sgg)) q.sgg = ''; });
watch(() => q.sgg, () => { if (q.emd && !emdOpts.value.includes(q.emd)) q.emd = ''; });
const FAILS = Array.from({ length: 11 }, (_, i) => i);
const statusCounts = computed(() => favStatusCounts(items.value, q));

/* ---------- 마이턴 판단 — 같은 동 진행 사건과 평당 감정가 비교(저가매수와 같은 계산) ---------- */
const lowBuy = reactive<Record<string, ReturnType<typeof useLowBuyData>>>({});
const fillLowBuy = async () => {
  const dongs = [...new Set(items.value.filter((f) => f.status === '진행').map((f) => favPlace(f).emd).filter(Boolean))].slice(0, 12);
  for (const d of dongs) { if (lowBuy[d]) continue; const x = useLowBuyData(d, today, false); lowBuy[d] = x; void x.load(); }
};
const lbByKey = computed(() => { const m = new Map<string, LowBuyRow>(); Object.values(lowBuy).forEach((x) => (x.all as unknown as LowBuyRow[]).forEach((r) => m.set(r.key, r))); return m; });
/** 같은 동 비교 자료가 다 왔는지 — 다 왔는데 줄이 없으면 마이 조회수 수집에 없는 사건 */
const lbDone = (f: TankFav) => { const x = lowBuy[favPlace(f).emd]; return !!x && (!!(x.factsDone as unknown as boolean) || /없습니다|읽지 못/.test(String((x.msg as unknown as string) ?? ''))); };

/* ---------- 건물명 — 주소에 이름이 없으면 카카오 → 공동주택가격 단지명(낙찰가예측 · 저가매수와 같은 길) ---------- */
const names = ref<Record<string, string>>({});
const lotStr = (addr: string) => addr.replace(/\s*\(.*$/, '').replace(/\s*외\s*\d+필지.*$/, '').match(/^(.*?(?:동|가|읍|면|리)\s+(?:산\s*)?\d+(?:-\d+)?)/)?.[1]?.replace(/\s+/g, ' ') ?? '';
const fillNames = async () => {
  const want = [...new Set(items.value.filter((f) => f.status === '진행' && !buildingNameOf(f.regn || f.addr)).map((f) => lotStr(f.regn || f.addr)).filter(Boolean))].slice(0, 80);
  for (let i = 0; i < want.length; i += 3) {
    await Promise.all(want.slice(i, i + 3).map(async (lot) => {
      const nm = await kakaoBuildingName(lot).catch(() => '') || await lookupAddress(lot).then((r) => String(r.price?.name ?? '').trim()).catch(() => '');
      if (nm) names.value = { ...names.value, [lot]: nm };
    }));
  }
};
const addrOf = (f: TankFav) => lbByKey.value.get(f.key)?.addr || addressWithName(f.addr || f.regn, names.value[lotStr(f.regn || f.addr)]);

/* ---------- 목록 ---------- */
const mine = computed(() => { const m = new Map<string, { id: string; ai: boolean }>(); auctions.auctions.forEach((a) => { const k = caseKey(a.caseNumber); if (k) m.set(k, { id: a.id, ai: !!(a as { rightsAi?: unknown }).rightsAi }); }); return m; });
const favMine = computed(() => items.value.filter((f) => mine.value.has(f.key)));
const aiDone = computed(() => favMine.value.filter((f) => mine.value.get(f.key)?.ai).length);
const shown = computed(() => favSort(items.value.filter((f) => favPass(f, q)), sortBy.value, (f) => lbByKey.value.get(f.key)?.vs ?? null));
const open = ref('');
const SORTS: Array<[FavSort, string]> = [['case', '사건번호'], ['hot', '가격매력'], ['date', '매각기일'], ['appr', '감정가'], ['min', '최저가'], ['pri', '관심도']];

/* ---------- 칸 글 ---------- */
const won = (v: number) => Math.round(v).toLocaleString('ko-KR');
const man = (v: number) => `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
const d8 = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : '—');
const stars = (n: number) => (n > 0 ? '★'.repeat(Math.min(5, n)) : '');
const pyOf = (m2: number) => (m2 > 0 ? (m2 / FAV_PY).toFixed(2) : '');
const pctSigned = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`;
const gainText = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${man(Math.abs(v))}`;
const fmtAt = (ms: number) => { if (!ms) return ''; const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const caseText = (f: TankFav) => { const c = favCaseNo(f.key); return c; };
/** '인천-본원' → '인천', '인천-부천' → '부천'(탱크 목록처럼 짧게) */
const courtShort = (c: string) => { const [a, b] = c.split('-'); return b && b !== '본원' ? b : a || c; };
const mktWarn = (r: LowBuyRow) => !!r.mkt && r.mkt.price < r.appr * LB_WARN;

/* ---------- 사진 — 탱크 사건 화면을 새 창으로 바로(사진 · 명세서 다 있음). 법원 사이트는 사건별 고정 주소가 없어 바로 못 간다(2026-11-20 사용자).
 *  사람이 누를 때 한 번 열리는 것이라 마이가 상세를 열지 않는 규칙과는 다르다 — 그 브라우저에 탱크 로그인이 있어야 한다 ---------- */
const TANK_VIEW = 'https://www.tankauction.com/ca/inc/component/popup/caView.php?tid=';
const openPhotos = (f: TankFav) => { window.open(`${TANK_VIEW}${encodeURIComponent(f.tid)}`, '_blank', 'noopener'); };

/* ---------- 등록하기 — 목록 값만 채운 물건(PDF 등록 · 직접입력과 같은 저장 길). 탱크 제목은 메모로 ---------- */
const busyKey = ref('');
const register = async (f: TankFav) => {
  if (busyKey.value || mine.value.has(f.key)) return;
  busyKey.value = f.key;
  try {
    const c = favCaseNo(f.key);
    const caseNumber = c.pn ? `${c.caseNo}(${c.pn})` : c.caseNo;
    const parsed = {
      ...parseAuctionPdfText('', '탱크 관심물건'),
      sourceName: '탱크 관심물건',
      caseNumber,
      courtName: favCourtName(f.court),
      propertyType: f.kind,
      address: addrOf(f),
      roadAddress: f.road,
      auctionRound: f.fails > 0 ? `유찰 ${f.fails}회` : '신건',
      eventDate: f.date,
      appraisalValue: f.appr,
      minimumBidValue: f.min,
      depositValue: Math.round(f.min / 10),
      buildingAreaM2: f.bArea,
      landAreaM2: f.lArea,
      notes: f.memo ? `탱크 관심물건 ${f.memo}` : '',
    };
    await auctions.importParsedPdfAuctions([parsed]);
    note.value = `${caseNumber} 을 물건목록에 올렸습니다.`;
  } catch { note.value = '등록하지 못했습니다. 다시 해 주세요.'; }
  busyKey.value = '';
};
</script>

<template>
  <div class="tfp">
    <section class="tfp-card">
      <header class="tfp-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#213366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-.9L12 3Z" /></svg>
        <h2>관심물건<span class="tfp-op">운영</span></h2>
        <span class="tfp-sub"><template v-if="doc">탱크옥션 관심물건 {{ items.length.toLocaleString('ko-KR') }}건 · {{ fmtAt(doc.at) }} 가져옴</template><template v-else-if="!loading">아직 가져온 관심물건이 없습니다</template></span>
      </header>
      <!-- 가져오기 단추 왼쪽 · 세로 가름선 · 오른쪽 마이 상자, 높이 36 맞춤(2026-11-20 사용자) -->
      <div class="tfp-bar">
        <button type="button" class="tfp-go" :disabled="!agentOn || !!agent?.paused || !!agent?.busy" @click="fetchFav">{{ favBusy ? '가져오는 중' : '관심물건가져오기' }}</button>
        <i class="tfp-vsep" aria-hidden="true" />
      <div class="tfp-mai">
        <span class="nm">마이</span>
        <span :class="['s', !agentOn ? 'off' : agent?.paused ? 'rest' : 'on']"><i aria-hidden="true" /><template v-if="!agentOn">꺼짐 · PC가 켜지면 저절로 뜸</template><template v-else-if="agent?.paused">대기 중 · 명령 단추 잠김</template><template v-else>{{ agent?.busy ? (favBusy ? '관심물건 가져오는 중' : '수집 중') : '켜짐' }} · <span class="ago">{{ agentAgo }}</span>초 전<template v-if="agent?.version"> · {{ verLabel(agent.version) }}</template></template></span>
        <template v-if="agentOn">
          <button type="button" class="b" @click="maiCmd('restart')">다시시작</button>
          <button v-if="agent?.paused" type="button" class="b go" @click="maiCmd('resume')">실행</button>
          <button v-else type="button" class="b" :disabled="!!agent?.busy" @click="maiCmd('pause')">대기</button>
        </template>
      </div>
      </div>
      <p v-if="favBusy && agent?.message" class="tfp-note">{{ agent.message }}</p>
      <p v-else-if="note" class="tfp-note">{{ note }}</p>
      <div class="tfp-ai">
        <span class="nm">AI 권리분석</span>
        <span class="q ok">분석됨 <b>{{ aiDone.toLocaleString('ko-KR') }}</b></span>
        <span class="q wait">분석 안 함 <b>{{ (favMine.length - aiDone).toLocaleString('ko-KR') }}</b></span>
        <span class="txt">등록한 관심물건 {{ favMine.length.toLocaleString('ko-KR') }}건 기준 · 명세서 자동 받기와 자동 분석은 준비 중</span>
      </div>

      <div class="tfp-flt">
        <label class="fr"><span class="fl">분류</span><select v-model="q.cat" aria-label="분류"><option value="">-전체-</option><option v-for="c in catOpts" :key="c.v" :value="c.v">{{ c.t }}</option></select></label>
        <label class="fr"><span class="fl">현황</span><select v-model="q.status" aria-label="현황"><option value="">-전체-</option><option v-for="s in FAV_STATUS" :key="s" :value="s">{{ s }}</option></select></label>
        <label class="fr"><span class="fl">종류</span><select v-model="q.kind" aria-label="종류"><option value="">-전체-</option><option v-for="k in kindOpts" :key="k" :value="k">{{ k }}</option></select></label>
        <div class="fr"><span class="fl">주소</span>
          <select v-model="q.sido" aria-label="시도"><option value="">-시/도-</option><option v-for="s in sidoOpts" :key="s" :value="s">{{ s }}</option></select>
          <select v-model="q.sgg" aria-label="시군구"><option value="">-시/구/군-</option><option v-for="s in sggOpts" :key="s" :value="s">{{ s }}</option></select>
          <select v-model="q.emd" aria-label="읍면동"><option value="">-읍/면/동-</option><option v-for="s in emdOpts" :key="s" :value="s">{{ s }}</option></select>
        </div>
        <div class="fr"><span class="fl">유찰</span>
          <select v-model="q.failFrom" aria-label="유찰 몇 회부터"><option :value="null">-선택-</option><option v-for="n in FAILS" :key="n" :value="n">{{ n }}</option></select>
          <span class="til">~</span>
          <select v-model="q.failTo" aria-label="유찰 몇 회까지"><option :value="null">-선택-</option><option v-for="n in FAILS" :key="n" :value="n">{{ n }}</option></select>
        </div>
        <label class="fr"><span class="fl">관심도</span><select v-model.number="q.pri" aria-label="관심도"><option :value="0">전체</option><option v-for="n in 5" :key="n" :value="n">{{ '★'.repeat(n) }}</option></select></label>
      </div>
      <div class="tfp-bar">
        <button v-for="s in ['', ...FAV_STATUS]" :key="s" type="button" :class="['stab', { on: q.status === s }]" @click="q.status = s">{{ s || '-전체-' }} <b>{{ (statusCounts[s] ?? 0).toLocaleString('ko-KR') }}</b></button>
        <span class="sp" />
        <div class="sort"><button v-for="[k, t] in SORTS" :key="k" type="button" :class="{ on: sortBy === k }" @click="sortBy = k">{{ t }}<template v-if="sortBy === k"> ▲</template></button></div>
      </div>

      <div class="tfp-list">
        <p v-if="loading" class="tfp-empty">불러오는 중입니다…</p>
        <p v-else-if="!doc" class="tfp-empty">'관심물건가져오기'를 누르면 마이가 탱크옥션 관심물건을 읽어 옵니다.</p>
        <p v-else-if="!shown.length" class="tfp-empty">조건에 맞는 관심물건이 없습니다.</p>
        <template v-for="f in shown" :key="f.tid">
          <div :class="['it', { hot: lbByKey.get(f.key)?.hot, on: open === f.tid }]" role="button" tabindex="0" @click="open = open === f.tid ? '' : f.tid" @keydown.enter="open = open === f.tid ? '' : f.tid">
            <div class="addr">
              <div class="meta"><span class="kind">{{ f.kind || '—' }}</span><span v-if="f.cat" class="ctg">{{ f.cat }}</span><span v-if="f.pri" class="star">{{ stars(f.pri) }}</span></div>
              <span class="cno">{{ caseText(f).caseNo }}<small v-if="caseText(f).pn"> (물건 {{ caseText(f).pn }})</small></span>
              <span class="ad">{{ addrOf(f) }}</span>
              <small>전용 {{ f.bArea > 0 ? `${f.bArea.toFixed(2)}㎡ / ${pyOf(f.bArea)}평` : '—' }}<template v-if="lbByKey.get(f.key)?.year"> · {{ lbByKey.get(f.key)?.year }}년식</template><template v-if="lbByKey.get(f.key)?.elev != null"> · 엘베 {{ lbByKey.get(f.key)?.elev ? '있음' : '없음' }}</template></small>
            </div>
            <div class="c r"><span class="amt">{{ f.appr ? won(f.appr) : '미확정' }}</span><small>{{ f.appr && f.bArea ? `평당 ${man(f.appr / (f.bArea / FAV_PY))}` : '' }}</small><span class="amt min">{{ f.min ? won(f.min) : '—' }}</span><small>{{ favRound(f).pct }}</small></div>
            <div class="c ctr">{{ favRound(f).label }}<small v-if="favRound(f).pct">({{ favRound(f).pct }})</small></div>
            <div class="c ctr">{{ courtShort(f.court) }}{{ f.dept ? ` ${f.dept}` : '' }}<small>{{ d8(f.date) }}</small><small>{{ f.state || f.status }}</small></div>
            <div class="my">
              <template v-if="f.status === '진행'">
                <template v-if="lbByKey.get(f.key)?.vs != null">
                  <span><span v-if="lbByKey.get(f.key)?.hot" class="chip hot">가격매력</span> 비슷한 물건보다 <b :class="lbByKey.get(f.key)!.vs! < 0 ? 'good' : 'bad'">{{ pctSigned(lbByKey.get(f.key)!.vs!) }}</b> · 이득 <b :class="lbByKey.get(f.key)!.gain! > 0 ? 'good' : 'bad'">{{ gainText(lbByKey.get(f.key)!.gain!) }}</b></span>
                  <span v-if="lbByKey.get(f.key)?.mkt" :class="{ bad: mktWarn(lbByKey.get(f.key)!) }">실거래 같은 평형 <b>{{ won(lbByKey.get(f.key)!.mkt!.price) }}</b> ({{ lbByKey.get(f.key)!.mkt!.n }}건 · {{ d8(lbByKey.get(f.key)!.mkt!.last).slice(0, 5) }}){{ mktWarn(lbByKey.get(f.key)!) ? ' — 감정가보다 낮음' : '' }}</span>
                  <span v-else>실거래 같은 평형 없음</span>
                </template>
                <span v-else-if="lbByKey.get(f.key)">비교할 비슷한 물건 없음</span>
                <span v-else>{{ lbDone(f) ? '같은 동 비교 자료 없음' : '비교 자료 불러오는 중' }}</span>
                <span>명세서 <span class="chip wait">받기 준비 중</span></span>
              </template>
              <span v-else class="mu">—</span>
            </div>
            <div class="act" @click.stop>
              <span v-if="mine.has(f.key)" class="chip reg">등록됨</span>
              <button v-else type="button" class="tfp-btn" :disabled="!!busyKey" @click="register(f)">{{ busyKey === f.key ? '등록 중' : '등록하기' }}</button>
              <button type="button" class="lnk" @click="openPhotos(f)">사진 ↗</button>
            </div>
          </div>
          <div v-if="open === f.tid" class="det">
            <div class="bx"><b>탱크 제목(내용)</b><span>{{ f.memo || '—' }}</span></div>
            <div class="bx"><b>매각물건명세서 · 기일내역</b><span class="mu">명세서 공개 뒤 채움(법원경매정보에서 받기는 준비 중)</span></div>
            <div class="bx"><b>탱크 목록 값</b><span>등록 {{ d8(f.wdate) }} · 조회 {{ f.hit.toLocaleString('ko-KR') }}<template v-if="f.sold > 0"> · 낙찰 {{ won(f.sold) }}<template v-if="f.bids"> · {{ f.bids }}명</template><template v-if="f.second"> · 2등 {{ won(f.second) }}</template></template></span></div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tfp { display: grid; gap: 14px; }
.tfp-card { background: #fff; border: 1px solid #e3e7ee; border-radius: 12px; padding: 16px; display: grid; gap: 12px; }
.tfp-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tfp-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; display: inline-flex; align-items: center; gap: 6px; }
.tfp-op { font-size: 12px; font-weight: 400; color: #b45309; background: #fff4e5; border-radius: 4px; padding: 0 6px; line-height: 18px; }
.tfp-sub { font-size: 12px; color: #6b7280; }
.sp { flex: 1; }
.tfp-go { border: 1px solid #2b6df3; background: #2b6df3; color: #fff; border-radius: 8px; padding: 7px 14px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; min-width: 128px; }
.tfp-go:disabled { background: #c9d6f5; border-color: #c9d6f5; cursor: default; }
.tfp-note { margin: -4px 0 0; font-size: 12px; color: #4b5563; }
/* 마이 줄 — 낙찰가예측 수집 상자와 같은 꼴 */
.tfp-bar { display: flex; align-items: center; gap: 12px; }
.tfp-bar .tfp-go { height: 36px; box-sizing: border-box; padding-top: 0; padding-bottom: 0; flex: none; }
.tfp-vsep { width: 1px; align-self: stretch; background: #e3e7ee; }
.tfp-bar .tfp-mai { flex: 1; min-width: 0; height: 36px; box-sizing: border-box; padding-top: 0; padding-bottom: 0; }
.tfp-mai { display: flex; align-items: center; gap: 8px; background: #f7f9fd; border: 1px solid #e3e7ee; border-radius: 8px; padding: 6px 8px 6px 10px; }
.tfp-mai .nm, .tfp-ai .nm { font-size: 12px; font-weight: 700; color: #4b5563; white-space: nowrap; }
.tfp-mai .s { flex: 1; min-width: 0; font-size: 12px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tfp-mai .s i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; background: #9ca3af; }
.tfp-mai .s.on i { background: #22c55e; box-shadow: 0 0 0 2px rgba(34, 197, 94, .25); }
.tfp-mai .s.rest { color: #b45309; }
.tfp-mai .s.rest i { background: #f59e0b; }
.tfp-mai .s.off { color: #6b7280; }
.tfp-mai .s .ago { display: inline-block; min-width: 2ch; text-align: right; font-variant-numeric: tabular-nums; }
.tfp-mai .b { flex: none; min-width: 44px; height: 26px; padding: 0 10px; border: 1px solid #d5dbe5; border-radius: 6px; background: #fff; color: #4b5563; font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.tfp-mai .b.go { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.tfp-mai .b:disabled { color: #c2c8d3; border-color: #e3e7ee; cursor: default; }
.tfp-ai { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border: 1px solid #e3e7ee; border-radius: 8px; padding: 6px 10px; font-size: 12px; color: #6b7280; }
.tfp-ai .q { border-radius: 4px; padding: 1px 7px; line-height: 18px; }
.tfp-ai .q b { font-weight: 700; }
.tfp-ai .q.ok { background: #e7f6ed; color: #16a34a; }
.tfp-ai .q.wait { background: #f6f8fb; color: #111827; border: 1px solid #e3e7ee; }
.tfp-flt { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 18px; background: #f6f8fb; border: 1px solid #e3e7ee; border-radius: 10px; padding: 12px 14px; }
.fr { display: flex; align-items: center; gap: 6px; min-width: 0; }
.fl { width: 46px; flex: none; font-size: 13px; font-weight: 700; color: #111827; }
.fr select { flex: 1; min-width: 0; height: 32px; border: 1px solid #d5dbe5; background: #fff; color: #111827; border-radius: 8px; padding: 0 8px; font: inherit; font-size: 13px; }
.til { font-size: 12px; color: #6b7280; }
.tfp-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.stab { border: 1px solid #e3e7ee; background: #fff; border-radius: 8px; padding: 6px 13px; color: #6b7280; font: inherit; font-size: 13px; cursor: pointer; }
.stab b { font-weight: 400; margin-left: 2px; font-variant-numeric: tabular-nums; }
.stab.on { border-color: #2b6df3; color: #2b6df3; background: #eef3fe; }
.sort { display: flex; gap: 12px; }
.sort button { border: 0; background: none; padding: 0; color: #6b7280; font: inherit; font-size: 12px; cursor: pointer; }
.sort button.on { color: #2b6df3; font-weight: 700; }
.tfp-list { display: grid; border: 1px solid #e3e7ee; border-radius: 8px; overflow: hidden; }
.tfp-empty { margin: 0; padding: 28px 12px; text-align: center; font-size: 13px; color: #6b7280; }
.it { display: grid; grid-template-columns: minmax(0, 2.3fr) minmax(0, 1.1fr) 84px minmax(0, 1fr) minmax(0, 1.6fr) 74px; gap: 12px; align-items: center; padding: 12px; border-bottom: 1px solid #e3e7ee; cursor: pointer; font-size: 13px; color: #111827; }
.it:last-child, .det:last-child { border-bottom: 0; }
.it.hot { background: #fff5f5; }
.it.on { background: #eef3fe; box-shadow: inset 3px 0 0 #2b6df3; }
.meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
.kind { color: #2b6df3; font-weight: 700; }
.ctg { font-size: 12px; color: #6b7280; border: 1px solid #e3e7ee; border-radius: 4px; padding: 0 5px; line-height: 17px; }
.star { color: #f59e0b; letter-spacing: -1px; }
.cno { display: block; font-size: 15px; font-weight: 800; }
.cno small { font-size: 12px; font-weight: 400; color: #6b7280; }
.ad { display: block; line-height: 1.45; }
.addr small, .c small { display: block; color: #6b7280; font-size: 12px; }
.c { font-variant-numeric: tabular-nums; }
.r { text-align: right; }
.ctr { text-align: center; }
.amt { display: block; font-weight: 700; }
.amt.min { color: #2b6df3; }
.chip { display: inline-block; font-size: 12px; border-radius: 4px; padding: 0 6px; line-height: 18px; }
.chip.hot { background: #fdecec; color: #dc2626; }
.chip.wait { background: #fff4e5; color: #b45309; }
.chip.reg { background: #eef3fe; color: #2b6df3; }
.my { display: grid; gap: 3px; font-size: 12px; color: #6b7280; }
.my b { font-weight: 700; color: #111827; white-space: nowrap; }
.my .good { color: #16a34a; }
.my .bad, .my span.bad { color: #dc2626; }
.mu { color: #9ca3af; }
.act { display: grid; gap: 6px; justify-items: center; }
.tfp-btn { border: 1px solid #d5dbe5; background: #fff; color: #111827; border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.tfp-btn:disabled { color: #c2c8d3; cursor: default; }
.lnk { border: 0; background: none; padding: 0; color: #2b6df3; font: inherit; font-size: 12px; cursor: pointer; }
.det { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px; border-bottom: 1px solid #e3e7ee; background: #fbfcfe; }
.det .bx { border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px; font-size: 12px; color: #4b5563; min-width: 0; }
.det .bx b { font-size: 13px; color: #111827; }
@media (max-width: 900px) { .tfp-flt, .det { grid-template-columns: minmax(0, 1fr); } .it { grid-template-columns: minmax(0, 1fr); } }
</style>
