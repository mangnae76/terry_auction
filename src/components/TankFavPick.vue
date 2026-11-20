<script setup lang="ts">
/* 물건등록 › 관심물건(운영) — 탱크옥션 관심물건(마이가 목록 API 로 읽어 둔 것)을 탱크와 같은 거르기 · 현황 탭으로 보고, 골라 물건목록에 올린다.
 * 시안(2026-11-20 사용자 '적용해줘봐' — 아티팩트 '관심물건 탭 시안' v5) 배치 그대로. 1 · 2단계만: 법원 명세서 받기 · 자동 분석 줄은 아직(그 자리엔 실제 상태만).
 * 마이턴 판단 칸은 저가매수와 같은 계산(composables/useLowBuyData · services/lowBuy) — 같은 동 진행 사건(마이 hits)이 있을 때만 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { agentOnline, loadTankFav, sendAgentCommand, watchAgentStatus, type AgentStatus, type TankFav, type TankFavDoc } from '../services/agentRemote';
import { useAuctionStore } from '../stores/auctionStore';
import { caseKey } from '../services/bidPredict';
import { parsedFromCase, caseNumberOf } from '../services/caseRegister';
import CaseJudgeList, { type JudgeRow } from './CaseJudgeList.vue';
import { addressWithName, buildingNameOf } from '../utils/addressName';
import { kakaoBuildingName } from '../services/addressSearch';
import { lookupAddress } from '../services/addressLookup';
import { useLowBuyData } from '../composables/useLowBuyData';
import { isJibunAddr, toJibunAddr } from '../services/roadToJibun';
import { type LowBuyRow } from '../services/lowBuy';
import { FAV_FILTER0, FAV_STATUS, favCaseNo, favCourtName, favPass, favPlace, favSort, favStatusCounts, type FavFilter, type FavSort } from '../services/tankFav';

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
  void fillLowBuy(); void fillNames(); void fillJibun();
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
/** 저가매수 계산에서 뺀 사건과 그 까닭(지하 · 반지하 · 엘베 없는 5층 이상 · 엘베 있는 건물) */
const lbSkipWhyOf = (f: TankFav) => (lowBuy[favPlace(f).emd]?.skipWhy as unknown as Map<string, string> | undefined)?.get(f.key) ?? '';
const lbSkipped = (f: TankFav) => !!(lowBuy[favPlace(f).emd]?.skipKeys as unknown as Set<string> | undefined)?.has(f.key);
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
/** 도로명으로 온 주소를 지번 꼴로(다른 줄과 같게, 2026-11-20 사용자 — 정성드림빌5차) */
const jibunOf = ref<Record<string, string>>({});
const fillJibun = async () => {
  const want = items.value.filter((f) => !lbByKey.value.get(f.key) && f.addr && !isJibunAddr(f.addr) && !(f.key in jibunOf.value));
  for (let i = 0; i < want.length; i += 6) {
    const got = await Promise.all(want.slice(i, i + 6).map(async (f) => [f.key, await toJibunAddr(f.addr || f.regn)] as const));
    jibunOf.value = { ...jibunOf.value, ...Object.fromEntries(got) };
  }
};
const addrOf = (f: TankFav) => { const a = lbByKey.value.get(f.key)?.addr || (isJibunAddr(f.addr) ? f.addr : jibunOf.value[f.key] || f.addr || f.regn);   /* 호수까지 있는 f.addr 우선(regn 은 호수가 없다) */ return isJibunAddr(a) ? addressWithName(a, names.value[lotStr(a)]) : a; };

/* ---------- 목록 ---------- */
const mine = computed(() => { const m = new Map<string, { id: string; ai: boolean }>(); auctions.auctions.forEach((a) => { const k = caseKey(a.caseNumber); if (k) m.set(k, { id: a.id, ai: !!(a as { rightsAi?: unknown }).rightsAi }); }); return m; });
const favMine = computed(() => items.value.filter((f) => mine.value.has(f.key)));
const aiDone = computed(() => favMine.value.filter((f) => mine.value.get(f.key)?.ai).length);
const shown = computed(() => favSort(items.value.filter((f) => favPass(f, q)), sortBy.value, (f) => lbByKey.value.get(f.key)?.vs ?? null));
const open = ref('');
const SORTS: Array<[FavSort, string]> = [['case', '사건번호'], ['hot', '가격매력'], ['date', '매각기일'], ['appr', '감정가'], ['min', '최저가'], ['pri', '관심도']];

/* ---------- 칸 글 ---------- */
const won = (v: number) => Math.round(v).toLocaleString('ko-KR');
const d8 = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : '—');
const fmtAt = (ms: number) => { if (!ms) return ''; const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** '인천-본원' → '인천', '인천-부천' → '부천'(탱크 목록처럼 짧게) */
const courtShort = (c: string) => { const [a, b] = c.split('-'); return b && b !== '본원' ? b : a || c; };

/* ---------- 사진 — 탱크 사건 화면을 새 창으로 바로(사진 · 명세서 다 있음). 법원 사이트는 사건별 고정 주소가 없어 바로 못 간다(2026-11-20 사용자).
 *  사람이 누를 때 한 번 열리는 것이라 마이가 상세를 열지 않는 규칙과는 다르다 — 그 브라우저에 탱크 로그인이 있어야 한다 ---------- */
const TANK_VIEW = 'https://www.tankauction.com/ca/inc/component/popup/caView.php?tid=';
const openPhotos = (r: JudgeRow) => { if (r.tid) window.open(`${TANK_VIEW}${encodeURIComponent(r.tid)}`, '_blank', 'noopener'); };

/* ---------- 등록하기 — 목록 값만 채운 물건(PDF 등록 · 직접입력과 같은 저장 길). 탱크 제목은 메모로 ---------- */
const busyId = ref('');
const favById = computed(() => new Map(items.value.map((f) => [f.tid, f])));
const register = async (r: JudgeRow) => {
  const f = favById.value.get(r.id);
  if (!f || busyId.value || mine.value.has(f.key)) return;
  busyId.value = r.id;
  try {
    const c = favCaseNo(f.key);
    await auctions.importParsedPdfAuctions([parsedFromCase({ source: '탱크 관심물건', caseNo: c.caseNo, pn: c.pn, court: favCourtName(f.court), kind: f.kind, addr: addrOf(f), road: f.road, fails: f.fails, date: f.date, appr: f.appr, min: f.min, bArea: f.bArea, lArea: f.lArea, memo: f.memo ? `탱크 관심물건 ${f.memo}` : '' })]);
    note.value = `${caseNumberOf(c)} 을 물건목록에 올렸습니다.`;
  } catch { note.value = '등록하지 못했습니다. 다시 해 주세요.'; }
  busyId.value = '';
};

/* ---------- 공통 표 줄(CaseJudgeList) — 저가매수와 같은 표 ---------- */
const judgeMsgOf = (f: TankFav) => (f.status !== '진행' ? '—' : lbSkipped(f) ? `${lbSkipWhyOf(f)} — 저가매수 계산에서 뺌` : lbByKey.value.get(f.key) ? `비교 부족 · 비슷한 물건 ${lbByKey.value.get(f.key)!.peerN}건(5건 이상일 때 계산)` : lbDone(f) ? '같은 동 비교 자료 없음' : '비교 자료 불러오는 중');
const favRows = computed<JudgeRow[]>(() => shown.value.map((f) => {
  const c = favCaseNo(f.key);
  return { id: f.tid, key: f.key, tid: f.tid, kind: f.kind, cat: f.cat, pri: f.pri, caseNo: c.caseNo, pn: c.pn, court: `${courtShort(f.court)}${f.dept ? ` ${f.dept}` : ''}`,
    addr: addrOf(f), area: f.bArea, appr: f.appr, min: f.min, fails: f.fails, date: f.date, status: f.status, stateText: f.state || f.status,
    lb: lbByKey.value.get(f.key) ?? null, judgeMsg: judgeMsgOf(f), registered: mine.value.has(f.key) };
}));
</script>

<template>
  <div class="tfp">
    <section class="tfp-card">
      <header class="tfp-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#213366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-.9L12 3Z" /></svg>
        <h2>관심물건<span class="tfp-op">운영</span></h2>
        <span class="tfp-sub"><template v-if="doc">탱크옥션 관심물건 {{ items.length.toLocaleString('ko-KR') }}건 · {{ fmtAt(doc.at) }} 가져옴</template><template v-else-if="!loading">아직 가져온 관심물건이 없습니다</template></span>
        <!-- 제목 · 가져옴 글 오른쪽에 한 줄로 — 가져오기 단추 · 세로 가름선 · 마이 상자, 높이 36(2026-11-20 사용자) -->
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
      </header>
      <p v-if="favBusy && agent?.message" class="tfp-note">{{ agent.message }}</p>
      <p v-else-if="note" class="tfp-note">{{ note }}</p>
      <div class="tfp-ai">
        <span class="nm">AI 권리분석</span>
        <span class="q ok">분석됨 <b>{{ aiDone.toLocaleString('ko-KR') }}</b></span>
        <span class="q wait">분석 안 함 <b>{{ (favMine.length - aiDone).toLocaleString('ko-KR') }}</b></span>
        <span class="txt">등록한 관심물건 {{ favMine.length.toLocaleString('ko-KR') }}건 기준 · 매각물건명세서 자동 받기와 자동 분석은 준비 중</span>
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

      <p v-if="loading" class="tfp-empty">불러오는 중입니다…</p>
      <p v-else-if="!doc" class="tfp-empty">'관심물건가져오기'를 누르면 마이가 탱크옥션 관심물건을 읽어 옵니다.</p>
      <!-- 표는 저가매수와 같은 공통 부품(2026-11-20 사용자) -->
      <CaseJudgeList v-else :rows="favRows" :busy-id="busyId" :open-id="open" expandable empty="조건에 맞는 관심물건이 없습니다." @register="register" @photo="openPhotos" @toggle="(r) => (open = open === r.id ? '' : r.id)">
        <template #detail="{ row }">
          <div v-if="favById.get(row.id)" class="det">
            <div class="bx"><b>탱크 제목(내용)</b><span>{{ favById.get(row.id)!.memo || '—' }}</span></div>
            <div class="bx"><b>매각물건명세서 · 기일내역</b><span class="mu">매각물건명세서 공개 뒤 채움(법원경매정보에서 받기는 준비 중)</span></div>
            <div class="bx"><b>탱크 목록 값</b><span>등록 {{ d8(favById.get(row.id)!.wdate) }} · 조회 {{ favById.get(row.id)!.hit.toLocaleString('ko-KR') }}<template v-if="favById.get(row.id)!.sold > 0"> · 낙찰 {{ won(favById.get(row.id)!.sold) }}<template v-if="favById.get(row.id)!.bids"> · {{ favById.get(row.id)!.bids }}명</template><template v-if="favById.get(row.id)!.second"> · 2등 {{ won(favById.get(row.id)!.second) }}</template></template></span></div>
          </div>
        </template>
      </CaseJudgeList>
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
.tfp-bar { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; margin-left: 8px; }
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
/* 표 줄 꼴은 CaseJudgeList 한 곳 — 여기는 펼친 칸만 */
.tfp-empty { margin: 0; padding: 28px 12px; text-align: center; font-size: 13px; color: #6b7280; border: 1px solid #e3e7ee; border-radius: 8px; }
.mu { color: #9ca3af; }
.det { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px; border-bottom: 1px solid #e3e7ee; background: #fbfcfe; }
.det:last-child { border-bottom: 0; }
.det .bx { border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px; font-size: 12px; color: #4b5563; min-width: 0; }
.det .bx b { font-size: 13px; color: #111827; }
@media (max-width: 900px) { .tfp-flt, .det { grid-template-columns: minmax(0, 1fr); } }
</style>
