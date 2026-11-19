<script setup lang="ts">
/**
 * 시장분석 › 매각분석 › 낙찰가예측(운영) — 낙찰가 예측 시험대.
 * 기일 목록 파일(그날 결과) + 붙여넣은 '사건번호 주소 조회수' + 공용 매각 자료로
 * 사건마다 예상 낙찰가 · 입찰가별 낙찰확률을 내고, 결과가 있는 사건은 맞혀본 차이를 보인다.
 * 조회수 규칙은 늘 '그 사건을 뺀 나머지'로 배운다(자기 결과로 자기를 맞히지 않게).
 */
import InfoTip from './InfoTip.vue';
import type { TipRow } from '../services/tipRows';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuctionStore } from '../stores/auctionStore';
import { getBuildingFacts } from '../services/buildingFacts';
import { kakaoBuildingName } from '../services/addressSearch';
import type { BuildingFacts } from '../services/publicDataApi';
import { buildingAgeOf } from '../utils/buildingAge';
import { addressWithName, buildingNameOf } from '../utils/addressName';
import { agentOnline, loadAgentDataset, loadCal as loadCalNums, loadDayLists, loadDayListsRange, loadHits, saveDayCsv, sendAgentCommand, sendAgentStop, watchAgentStatus, type AgentStatus, type CalRow, type DayListRow, type HitDoc } from '../services/agentRemote';
import { readSheetRows } from '../services/saleExcel';
import { resolveRegionFromAddress } from '../services/regionResolver';
import {
  BAND_NAMES, bandOf, caseKey, caseLabel, lotOf as lotParts, csvRows, dongOf, fitPriceModel, fitRoundModel, fitViewModel, parseViewLines, predictRound, priceDist, readDayRows, roundOfRatio, roundsOf, similarBands, soldOf, viewBands,
  type BidTarget, type DayRow, type Round, type ViewPair,
} from '../services/bidPredict';

type Sold = NonNullable<ReturnType<typeof soldOf>>;
const STORE_KEY = 'bidtest.v1';
const recs = ref<Sold[]>([]);
const recsInfo = ref('매각 자료를 읽는 중');
const dayRows = ref<DayRow[]>([]);
const dayName = ref('');
const dayDate = ref('');
const viewsText = ref('');
const pick = ref('');
/** 상세 상자 낙찰확률 슬라이더(50~80, 1%) — 칸은 50 · 60 · 70(추천) · 80 넷, 사건을 바꾸면 70으로(2026-11-18 사용자 시안 A) */
const qPct = ref(70);
/** DB에 들어 있는 목록 — 평소엔 접어 둔다(2026-11-18 사용자) */
const dbOpen = ref(false);
watch(pick, () => { qPct.value = 70; });
const Q_CELLS = [0.5, 0.6, 0.7, 0.8];
/* 줄을 눌러도 화면을 굴리지 않는다 — 상세가 표 위에 있어 굴리면 위로 튀었다(2026-11-17 사용자) */
const fileMsg = ref('');
/** 표에 올릴 동(주소에 이 글이 있는 줄만, 비우면 전부) */
const dongFilter = ref((() => { try { return (JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as { dong?: string } | null)?.dong ?? '검암동'; } catch { return '검암동'; } })());
/** DB 기일 목록(계마다 + CSV)을 사건번호로 합친 것 — 조회수는 수집한 날짜별 */
type DbRow = DayRow & { views: Record<string, number>; from: string };
const dbRows = ref<DbRow[]>([]);
/** 그 매각기일 계마다 건수 · 종류별 건수(마이가 모은 기일 목록 — 그날 그 법원 전체) */
const dayDepts = ref<Array<{ court: string; dept: string; n: number; kinds: Record<string, number>; stats: Record<string, number>; keys: string[] }>>([]);
const dbInfo = ref('');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plusDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** 수집 기간 — 처음은 오늘 ~ 7일 뒤(다가오는 기일). 고친 값은 이 브라우저에 남긴다(새로고침해도 그대로) */
const COL_KEY = 'bidtest.col';
const colSaved = (() => { try { return JSON.parse(localStorage.getItem(COL_KEY) || 'null') as { from?: string; to?: string } | null; } catch { return null; } })();
const colFrom = ref(colSaved?.from || todayIso());
const colTo = ref(colSaved?.to || plusDays(todayIso(), 7));
watch([colFrom, colTo], () => { try { localStorage.setItem(COL_KEY, JSON.stringify({ from: colFrom.value, to: colTo.value })); } catch { /* 그만 */ } });
const colCourt = ref('인천-본원');
/** 법원 드롭다운 — 탱크옥션 이용권 범위(서울 · 경기 · 인천). 전체 묶음은 기일 목록을 다 받지 않기로 해 아직 없음(2026-11-16 사용자) */
const COURTS = ['인천-본원', '인천-부천', '서울-중앙', '서울-동부', '서울-서부', '서울-남부', '서울-북부', '의정부-본원', '의정부-고양', '의정부-남양주', '수원-본원', '수원-성남', '수원-안산', '수원-안양', '수원-평택', '수원-여주'];
const agent = ref<AgentStatus | null>(null);
const agentNote = ref('');
const agentOn = computed(() => agentOnline(agent.value, nowMs.value));   // 1초 시계로 다시 본다 — 시계 없이 두면 마이가 꺼져 새 소식이 안 와도 녹색이 남았다(2026-11-15)
let stopAgent: (() => void) | null = null;
/** 매각분석 수집 화면과 같은 연결 알약 — 'N초 전'은 1초마다 */
const nowMs = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;
onMounted(() => { stopAgent = watchAgentStatus('', (st) => { agent.value = st; }, () => { agent.value = null; }); tick = setInterval(() => { nowMs.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { stopAgent?.(); if (tick) clearInterval(tick); });
/** 고른 줄 풀기 — 표 줄 · 아래 자세히 상자 밖을 누르면 고른 색을 지운다(다시 누른 줄도 풀린다, 2026-11-15 사용자) */
const unpick = (e: MouseEvent) => { const t = e.target as Element | null; if (pick.value && t && !t.closest?.('.bpt-day .bpt-tbl.fixed tbody tr, .bpt-detail')) pick.value = ''; if (regOpen.value && t && !t.closest?.('.bpt-cal-reg')) regOpen.value = false; };
onMounted(() => document.addEventListener('mousedown', unpick));
onBeforeUnmount(() => document.removeEventListener('mousedown', unpick));
/* 운영자 시험용 — 화면이 쓰는 자료를 그대로 꺼내 화면 밖에서 여러 방식을 견줘 본다(읽기만, 2026-11-15) */
onMounted(() => { (window as unknown as Record<string, unknown>).__bptData = () => JSON.parse(JSON.stringify({ recs: recs.value, hitDocs: hitDocs.value, facts: extFacts.value, dbRows: dbRows.value })); });
const agentAgo = computed(() => { const at = agent.value?.at?.toMillis?.(); return at ? Math.max(0, Math.round((nowMs.value - at) / 1000)) : 0; });
/** 'web-agent 2026.11.14-2' → 'ver.26.11.14-2'(매각분석과 같게) */
const verLabel = (v: string) => { const m = /(\d{4})\.(\d{2})\.(\d{2})(-\d+)?/.exec(v); return m ? `ver.${m[1].slice(2)}.${m[2]}.${m[3]}${m[4] || ''}` : v.replace(/^web-agent\s*/, ''); };
const stopCmd = async () => { try { await sendAgentStop(''); agentNote.value = '중지를 보냈습니다. 지금 사건까지 저장하고 멈춥니다.'; } catch { agentNote.value = '중지를 보내지 못했습니다. 다시 해 주세요.'; } };
const sendCmd = async (name: 'open' | 'daylist' | 'hits') => {
  try {
    const range = { site: '탱크옥션' as const, from: colFrom.value, to: colTo.value, court: colCourt.value.trim() || '인천-본원' };
    await sendAgentCommand('', name, name === 'open' ? { site: '탱크옥션' } : name === 'hits' ? { ...range, dong: dongFilter.value.trim() } : range);
    agentNote.value = name === 'open' ? '브라우저 열기를 보냈습니다. 크롬에서 탱크옥션 로그인을 확인해 주세요.' : name === 'hits' ? `${dongFilter.value.trim()} 조회수 수집을 보냈습니다. 끝나면 다시 읽습니다.` : '기일 목록 수집을 보냈습니다. 끝나면 매각기일을 골라 다시 읽습니다.';
  } catch { agentNote.value = '명령을 보내지 못했습니다. 다시 해 주세요.'; }
};
/* 도로명 주소(탱크옥션 사건 일부 — 검암동 500건 중 83건)는 지번 주소로 바꿔 쓴다. 건물명 · 엘베 · 대장 · 동 거르기가 모두 동 · 지번으로 묶이기 때문(2026-11-16).
 * 카카오 주소 변환(이 브라우저에 저장), 못 바꾸면 그대로. 원래 주소는 복사용으로 남긴다 */
const rawAddr = new Map<string, string>();
const jibunMemo = new Map<string, string>();
const toJibun = async (a: string): Promise<string> => {
  if (!a || lotParts(a).dong) return a;
  const hit = jibunMemo.get(a); if (hit !== undefined) return hit;
  const road = a.replace(/\s*\(.*$/, '').split(',')[0].trim();
  const unit = (a.split(',')[1] ?? '').replace(/\s*\(.*$/, '').trim();
  const name = a.match(/\([^,()]*,\s*([^()]+)\)/)?.[1]?.trim() ?? '';
  let out = a;
  try { const r = await resolveRegionFromAddress(road); if (r?.dong && r.jibun) out = [r.sido, r.sigungu, r.dong, r.jibun, name, unit].filter(Boolean).join(' '); } catch { /* 그대로 */ }
  jibunMemo.set(a, out); if (out !== a) rawAddr.set(out, a);
  return out;
};
const withJibun = async <T extends { addr: string }>(xs: T[]): Promise<T[]> => {
  const out = [...xs];
  for (let i = 0; i < out.length; i += 6) await Promise.all(out.slice(i, i + 6).map(async (x, j) => { const a = await toJibun(x.addr); if (a !== x.addr) out[i + j] = { ...x, addr: a }; }));
  return out;
};
/** 그 매각기일의 DB 목록 읽기 */
const loadDb = async () => {
  if (!dayDate.value) { dbRows.value = []; dbInfo.value = ''; dayDepts.value = []; return; }
  try {
    const docs = await loadDayLists(dayDate.value);
    const m = new Map<string, DbRow>();
    const put = (r: DayListRow, csv: boolean) => {
      const o = m.get(r.key);
      const base: DbRow = o ?? { key: r.key, kind: '', addr: '', area: null, appr: 0, min: 0, sold: 0, second: 0, bids: 0, status: '', date: '', views: {}, from: '' };
      const from = base.from && base.from !== (csv ? 'CSV' : '마이') ? '마이 · CSV' : csv ? 'CSV' : '마이';
      const pickN = (a: number | undefined, b: number) => (a && a > 0 ? a : b);
      m.set(r.key, { ...base, kind: base.kind || r.kind || '', addr: base.addr || r.addr || '', area: base.area ?? r.area ?? null, appr: pickN(r.appr, base.appr), min: csv && base.min ? base.min : pickN(r.min, base.min),
        sold: pickN(r.sold, base.sold), second: pickN(r.second, base.second), bids: pickN(r.bids, base.bids), status: base.status || r.status || '', date: base.date || String((r as { date?: string }).date ?? ''), views: { ...base.views, ...(r.views ?? {}) }, from });
    };
    docs.filter((d) => d.by === 'agent').forEach((d) => d.rows.forEach((r) => put(r, false)));
    docs.filter((d) => d.by !== 'agent').forEach((d) => d.rows.forEach((r) => put(r, true)));
    dbRows.value = await withJibun([...m.values()]);
    dayDepts.value = docs.filter((d) => d.by === 'agent').map((d) => {
      const kinds: Record<string, number> = {}; const stats: Record<string, number> = {};
      d.rows.forEach((r) => { const k = r.kind || '기타'; kinds[k] = (kinds[k] ?? 0) + 1; const s = statOfRow(r); stats[s] = (stats[s] ?? 0) + 1; });
      return { court: d.court, dept: d.dept, n: d.rows.length, kinds, stats, keys: d.rows.map((r) => r.key) };
    }).sort((a, b) => (parseInt(a.dept, 10) || 0) - (parseInt(b.dept, 10) || 0));
    // 매각기일 옆 한 줄 — '인천-본원 5계 · 8계 370건'(계마다 문서 하나, 건수는 겹친 사건 뺀 합)
    const courts = [...new Set(docs.map((d) => d.court).filter(Boolean))]; const depts = docs.filter((d) => d.dept).map((d) => d.dept.replace(/^경매/, ''));
    dbInfo.value = docs.length ? `${courts.join(' · ')} ${depts.length ? depts.join(' · ') : 'CSV'} ${m.size.toLocaleString('ko-KR')}건` : '기일목록 없음';
  } catch { dbInfo.value = '기일목록을 읽지 못했습니다'; }
};
watch(dayDate, () => { void loadDb(); }, { immediate: true });
/** 기일 목록 한 줄의 그날 현황 — 매각 · 유찰(다음 기일로 넘어감) · 입찰 전 · 그 밖(취하 · 변경 …) */
function statOfRow(r: DayListRow & { date?: string }): string {
  const s = String(r.status || '');
  if (s.includes('매각')) return '매각';
  if (s.includes('유찰')) return r.date && dayDate.value && r.date > dayDate.value ? '유찰' : dayDate.value >= todayIso() ? '입찰 전' : '유찰';
  if (s.includes('신건')) return dayDate.value >= todayIso() ? '입찰 전' : '유찰';
  return s.replace(/\s.*$/, '') || '기타';
}

/** 그 동 사건별 날짜별 조회수(마이가 차트에서 모은 것) → 회차표 */
const hitDocs = ref<HitDoc[]>([]);
const hitInfo = ref('');
const hitRange = ref('');   // 조회수가 있는 첫날 ~ 끝날
/** '검암동 주택 사건 500건' 말풍선 — 조회수수집이 사건마다 같이 받아 오는 것 */
const HIT_TIP: TipRow[] = [['사건', '사건번호 · 주소 · 종류 · 면적 · 감정가'], ['결과', '낙찰가 · 응찰자수 · 2등 가격 · 유찰 횟수'], ['기일', '회차마다 날짜 · 결과, 다음 매각기일'], ['조회수', '날마다 조회수 · 유효조회수(그날 하루치)']];
const loadHitDocs = async () => {
  const dong = dongFilter.value.trim();
  if (!/(동|가|읍|면|리)$/.test(dong)) { hitDocs.value = []; hitInfo.value = ''; hitRange.value = ''; return; }
  // 기간 = 조회수가 있는 날만(차트 끝의 다음 기일 날짜는 뺀다)
  try { hitDocs.value = await withJibun(await loadHits(dong)); const ds = hitDocs.value.flatMap((h) => h.hd.filter((_, i) => (h.hc[i] ?? 0) > 0)).map((d) => d.replace(/\D/g, '')).filter((d) => d.length === 8 && d <= todayIso().replace(/\D/g, '')).sort(); const dot = (d: string) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
    hitInfo.value = hitDocs.value.length ? `${dong} 주택 사건 ${hitDocs.value.length.toLocaleString('ko-KR')}건 · 날짜별 조회수` : `${dong} 사건 조회수가 아직 없습니다`;
    hitRange.value = ds.length ? `${dot(ds[0])} ~ ${dot(ds[ds.length - 1])}` : ''; }
  catch { hitInfo.value = '사건 차트를 읽지 못했습니다'; hitRange.value = ''; }
};
watch(dongFilter, () => { void loadHitDocs(); }, { immediate: true });
watch(() => agent.value?.message, (m, o) => { if (m && m !== o && m.startsWith('조회수 수집 끝')) void loadHitDocs(); });
/** 마이 진행 — 상태 글의 '기일 목록 i/n' · '사건 차트 i/n'을 읽는다(목록 20% · 차트 80%) */
const prog = ref<{ kind: 'hits' | 'daylist'; stage: 'list' | 'chart'; i: number; n: number; done: boolean } | null>(null);
watch(() => agent.value?.message, (m) => {
  if (!m) return;
  const hits = m.startsWith('조회수 '); const day = m.startsWith('기일 목록 ');
  if (m.startsWith('조회수 수집 끝') || m.startsWith('기일 목록 수집 끝')) { if (prog.value) prog.value = { ...prog.value, done: true }; return; }
  const g = m.match(/(기일 목록|사건 차트) (\d+)\/(\d+)/);
  if (g && (hits || day)) { prog.value = { kind: hits ? 'hits' : 'daylist', stage: g[1] === '사건 차트' ? 'chart' : 'list', i: Number(g[2]), n: Number(g[3]), done: false }; return; }
  // 사건마다 '조회수 저장 — 사건 (N건)'과 '사건 차트 i/n'이 번갈아 온다 — 저장 글이면 건수만 올린다(처음 열었을 때는 전체 수를 모른다)
  const s = m.match(/^조회수 저장 — .*\((\d+)건\)/);
  if (s) prog.value = { kind: 'hits', stage: 'chart', i: Number(s[1]), n: prog.value?.stage === 'chart' ? Math.max(prog.value.n, Number(s[1])) : 0, done: false };
}, { immediate: true });
const progView = computed(() => {
  const p0 = prog.value; if (!p0) return null;
  // 마이 2026.11.14-2 다음 판부터는 상태에 진행 숫자(prog)를 바로 보낸다 — 있으면 그것으로
  const ap = agent.value?.prog; const p = ap && ap.n > 0 && !p0.done && agent.value?.busy ? { ...p0, i: ap.i, n: ap.n } : p0;
  if (!p.done && p.stage === 'chart' && !p.n) return { pct: 20, what: `2단계 사건 차트 ${p.i.toLocaleString('ko-KR')}건 저장(전체 수는 다음 글에서)`, left: '' };
  const f = p.done ? 1 : p.kind === 'daylist' ? p.i / p.n : p.stage === 'list' ? 0.2 * (p.i / p.n) : 0.2 + 0.8 * (p.i / p.n);
  // 남은 시간 — 목록은 하나에 2초 남짓, 차트는 사건마다 3 ~ 6초 쉬어 가며 연다(차트 수는 목록이 끝나야 안다)
  const left = p.done ? 0 : p.kind === 'daylist' ? (p.n - p.i) * 6 : p.stage === 'list' ? (p.n - p.i) * 2 : (p.n - p.i) * 5;
  const what = p.done ? '끝' : p.kind === 'daylist' ? `기일 목록 ${p.i}/${p.n}` : p.stage === 'list' ? `1단계 기일 목록 ${p.i.toLocaleString('ko-KR')}/${p.n.toLocaleString('ko-KR')}` : `2단계 사건 차트 ${p.i.toLocaleString('ko-KR')}/${p.n.toLocaleString('ko-KR')}`;
  return { pct: Math.round(f * 100), what, left: p.done ? '' : left >= 60 ? `남은 시간 약 ${Math.ceil(left / 60)}분${p.kind === 'hits' && p.stage === 'list' ? ' + 차트' : ''}` : '곧 끝' };
});
const hitRounds = computed<Round[]>(() => hitDocs.value.flatMap((h) => roundsOf(h)));
/** 다가오는 기일을 며칠 앞서 모았으면(전날까지 안 닿음) 그 날수 — 배울 때도 매각 그 날수 앞 값으로 맞춘다 */
const leadDays = computed(() => {
  const up = hitRounds.value.filter((r) => r.date === dayDate.value).map((r) => r.upTo).filter(Boolean).sort().pop();
  if (!up || !dayDate.value) return 0;
  return Math.max(0, Math.round((new Date(`${dayDate.value}T00:00:00Z`).getTime() - new Date(`${up}T00:00:00Z`).getTime()) / 864e5) - 1);
});
const roundsAt = computed<Round[]>(() => (leadDays.value ? hitDocs.value.flatMap((h) => roundsOf(h, undefined, leadDays.value)) : hitRounds.value));
/** 매각 · 유찰 확률은 유효조회수(그날 본 사람 수)로 — 6월 ~ 11-12 시험에서 확률 오차(Brier) 0.1236 → 0.1176. 응찰 인원 · 낙찰가는 조회수 그대로(유효조회수로 바꾸면 낙찰가가 7.19 → 7.55% 로 나빠졌다, 2026-11-15) */
const effOf = (h: HitDoc) => ({ ...h, hc: h.he });
const roundsAtE = computed<Round[]>(() => hitDocs.value.flatMap((h) => roundsOf(effOf(h), undefined, leadDays.value || 0)));
/** 이 매각기일 회차 — 붙여넣은 글이 없고 차트 자료가 있으면 이것으로 맞힌다 */
const dayRounds = computed(() => (parseViewLines(viewsText.value).length ? [] : roundsAt.value.filter((r) => r.date === dayDate.value)));
const useHits = computed(() => dayRounds.value.length > 0);
/** 그날 이전 회차로만 배운 규칙(누적 조회수 + 마지막 7일 + 회차) */
const roundModel = computed(() => (useHits.value ? fitRoundModel(roundsAt.value, dayDate.value, extReady.value ? xfRound : undefined) : null));
const roundModelE = computed(() => (useHits.value ? fitRoundModel(roundsAtE.value, dayDate.value) : null));   // 덧붙임 없이 — 시험에서 확률 오차 0.1176 → 0.1131   // 시세 · 입지 자료가 있으면 같이(6월 ~ 11-12 시험에서 낙찰가 7.6% → 7.2%)

try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as { dayRows?: DayRow[]; dayName?: string; dayDate?: string; viewsText?: string; pick?: string } | null;
  if (s) { dayRows.value = s.dayRows ?? []; dayName.value = s.dayName ?? ''; dayDate.value = s.dayDate ?? '';  pick.value = s.pick ?? ''; }
} catch { /* 그만 */ }
watch([dayRows, dayName, dayDate, viewsText, pick, dongFilter], () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ dayRows: dayRows.value, dayName: dayName.value, dayDate: dayDate.value, viewsText: viewsText.value, pick: pick.value, dong: dongFilter.value })); } catch { /* 그만 */ }
});

onMounted(async () => {
  try {
    const { recs: raw, meta } = await loadAgentDataset('');
    recs.value = raw.map(soldOf).filter((r): r is Sold => !!r);
    const at = meta?.updatedAt?.toMillis?.();
    recsInfo.value = `공용 매각 자료 ${recs.value.length.toLocaleString('ko-KR')}건${at ? ` · ${new Date(at).toLocaleDateString('ko-KR')} 기준` : ''}`;
  } catch { recsInfo.value = '매각 자료를 읽지 못했습니다. 운영자 계정인지 확인해 주세요.'; }
});

const onFile = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
  if (f) void readDayFile(f);
};
/** 파일 칸에 끌어다 놓기 — 권리분석 서류 올리기 칸과 같은 꼴 */
const dropOver = ref(false);
const onDrop = (e: DragEvent) => {
  dropOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!/\.(xlsx|csv)$/i.test(f.name)) { fileMsg.value = '엑셀(.xlsx) · CSV 파일만 넣을 수 있습니다.'; return; }
  void readDayFile(f);
};
const readDayFile = async (f: File) => {
  try {
    const buf = await f.arrayBuffer();
    // CSV 는 UTF-8 이 아니면 한글 윈도 글(EUC-KR)로 읽는다
    const text = () => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); } };
    const rows = /\.csv$/i.test(f.name) ? csvRows(text()) : await readSheetRows(buf);
    const got = readDayRows(rows);
    if (!got.length) { fileMsg.value = '사건번호 · 진행상태 칸을 찾지 못했습니다. 기일별물건에서 받은 파일인지 확인해 주세요.'; return; }
    dayRows.value = got; dayName.value = f.name; fileMsg.value = '';
    const sold = got.filter((d) => d.status === '매각' && d.date);
    const cnt = new Map<string, number>(); sold.forEach((d) => cnt.set(d.date, (cnt.get(d.date) ?? 0) + 1));
    dayDate.value = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dayDate.value;
    // DB 에도 — 그 매각기일의 '날짜_csv' 문서(입찰자수 · 2위는 CSV 에만 있다)
    if (dayDate.value) {
      try { await saveDayCsv(dayDate.value, got.map((d) => ({ key: d.key, kind: d.kind, addr: d.addr, area: d.area, appr: d.appr, min: d.min, sold: d.sold, second: d.second, bids: d.bids, status: d.status, date: d.date } as DayListRow))); await loadDb(); fileMsg.value = 'DB에 저장했습니다'; }
      catch { fileMsg.value = 'DB에 저장하지 못했습니다(이 브라우저에만 남김)'; }
    }
  } catch (err) { fileMsg.value = err instanceof Error ? err.message : '파일을 읽지 못했습니다.'; }
};

const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const man = (n: number) => { const m = Math.round(n / 1e4); const e = Math.floor(m / 1e4); const r = m % 1e4; return e ? `${e}억${r ? ` ${r.toLocaleString('ko-KR')}만` : ''}` : `${r.toLocaleString('ko-KR')}만`; };
/** 만 단위만 — '9,660만' · '10,607만'(억으로 끊지 않아 끝자리가 세로로 맞는다) */
const manN = (n: number) => `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`;
/* ===== 채권자 · 허그(주택도시보증공사) — 검암동 500건 중 374건이 허그 채권(2026-11-16). 허그는 보증금 채권으로 입찰해 낙찰가가 사람 수와 상관없이 정해지는 편.
 * 예상 낙찰가를 허그 기준(같은 차수 허그 매각 낙찰가÷감정가 중앙값)으로 옮기던 것은 뺐다(2026-11-17 사용자) — 모든 사건 일반 방식. 허그는 칩으로만 ===== */
const credOf = computed(() => new Map(hitDocs.value.map((h) => [h.key, h.creditor])));
const isHug = (key: string) => /주택도시보증/.test(credOf.value.get(key) ?? '');
/** 허그가 직접 낙찰 — 탱크는 낙찰자를 가림 글자로 준다. '주○○○○○○○'(여덟 자)이고 채권자가 허그면 주택도시보증공사로 본다(2026-11-17 사용자 — 칩은 실제 낙찰가에만) */
const winOf = computed(() => new Map(hitDocs.value.map((h) => [h.key, h.winner])));
const hugWon = (key: string) => { const w = winOf.value.get(key) ?? ''; return /주택도시보증/.test(w) || (/^주○{7}$/.test(w) && isHug(key)); };
const HUG_WON_TIP = '허그 낙찰 · 낙찰자 주○○○○○○○(주택도시보증공사) — 채권자인 허그가 보증금 채권으로 직접 받았습니다';
/** 채권자 짧게 — '주택도시보증공사' → 허그, '서울보증보험(주)' → 서울보증보험 */
const credShort = (key: string) => { const c = credOf.value.get(key) ?? ''; return !c ? '' : /주택도시보증/.test(c) ? '허그' : c.replace(/\(주\)|주식회사|㈜/g, '').trim().slice(0, 7); };
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** 주소 복사 — 지도 · 로드뷰에서 입지 · 개별성을 볼 때 붙여 넣으려고(2026-11-14 사용자). 괄호 안 도로명 등은 뺀 지번 주소 */
const copiedKey = ref('');
let copyTimer: ReturnType<typeof setTimeout> | null = null;
/** 표에 보일 주소 — 동부터('검암동 523-2 시크릿가든4차 4층402호'). 시 · 구는 빼고, 복사 단추는 전체 주소 */
const shortAddr = (a: string) => { const m = a.match(/[가-힣0-9]+(?:동|가|읍|면|리)\s+(?:산\s*)?\d/); return m && m.index ? a.slice(m.index) : a; };
/** 표 주소 — 주소에 건물명이 없으면 건축물대장 건물명(없으면 같은 지번 다른 사건 주소의 이름)을 끼운다('검암동 634-7 ○○빌라 2층202호'). 복사는 원래 주소 그대로 */
/** 지번마다 다른 사건 주소에 적힌 건물명 — 대장에 이름이 없는 필지(검암동 129곳 중 100곳)를 채운다 */
const nameByLot = computed(() => { const m = new Map<string, string>(); [...hitDocs.value.map((h) => h.addr), ...recs.value.map((r) => r.addr)].forEach((a) => { const n = buildingNameOf(a); if (!n) return; const l = lotParts(a); const k = `${l.dong} ${l.jibun}`; if (!m.has(k)) m.set(k, n); }); return m; });
/* 이름 출처 — ① 동 단위로 받은 대장(extFacts) ② 줄마다 엘베 · 연식을 채우며 읽은 대장, 대장에 이름이 없으면 카카오 주소 검색(bldNames, 2026-11-19 — '검암동 614-3 3층301호'처럼 빠졌다) ③ 같은 지번 다른 사건 주소 */
const tblAddr = (a: string) => { const l = lotParts(a); const k = `${l.dong} ${l.jibun}`; return shortAddr(addressWithName(a, extFacts.value[k]?.name || bldNames.value[lotOf(a)] || nameByLot.value.get(k))); };
/** 표 주소 두 줄 — 지번까지 윗줄, 건물명 · 동호수는 아랫줄(2026-11-16 사용자). 지번이 없으면 한 줄 */
const addrLines = (a: string): [string, string] => {
  const parts = tblAddr(a).split(/\s+/).filter(Boolean);
  let last = -1; parts.forEach((t, i) => { if (/^\d+(-\d+)?,?$/.test(t)) last = i; });
  if (last < 0) return [parts.join(' '), ''];
  return [parts.slice(0, last + 1).join(' ').replace(/,$/, ''), parts.slice(last + 1).join(' ')];
};
const copyAddr = async (it: { key: string; addr: string }) => {
  const text = (rawAddr.get(it.addr) ?? it.addr).replace(/\s*\(.*$/, '').replace(/\s*외\s*\d+필지\s*$/, '').trim();
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* 그만 */ } ta.remove(); }
  copiedKey.value = it.key; if (copyTimer) clearTimeout(copyTimer); copyTimer = setTimeout(() => { copiedKey.value = ''; }, 1500);
};
/** 엘베 — 건축물대장 승강기 수(매각사례 표와 같은 출처). 표에 보이는 줄의 지번만, 한 번 받은 건 이 화면에 남긴다 */
const elevs = ref<Record<string, number | null>>({});
/** 연식 — 매각사례에 같은 지번 기록이 없으면 건축물대장 사용승인 해 */
const bldYears = ref<Record<string, number | null>>({});
/** 지번(lotOf)마다 건축물대장 건물명 — 엘베 · 연식과 같이 읽는다. 빈 글 = 대장에 이름 없음 */
const bldNames = ref<Record<string, string>>({});
const yearShow = (it: Item) => it.target?.year || bldYears.value[lotOf(it.addr)] || null;
const lotOf = (addr: string) => addr.replace(/\s*\(.*$/, '').replace(/\s*외\s*\d+필지.*$/, '').match(/^(.*?(?:동|가|읍|면|리)\s+(?:산\s*)?\d+(?:-\d+)?)/)?.[1]?.replace(/\s+/g, ' ') ?? '';
const elevOf = (addr: string): number | null | undefined => { const k = lotOf(addr); return k ? elevs.value[k] : null; };
let elevBusy = false;
const fillElevs = async () => {
  if (elevBusy) return; elevBusy = true;
  try {
    const want = [...new Set(shownItems.value.map((it) => lotOf(it.addr)).filter((k) => k && !(k in elevs.value)))].slice(0, 400);
    for (let i = 0; i < want.length; i += 3) {
      await Promise.all(want.slice(i, i + 3).map(async (k) => { const f = await getBuildingFacts(k); elevs.value = { ...elevs.value, [k]: f ? f.elevator : null }; bldYears.value = { ...bldYears.value, [k]: f?.year ?? null }; const nm = String(f?.name ?? '').trim() || await kakaoBuildingName(k); bldNames.value = { ...bldNames.value, [k]: nm }; }));   /* 대장에 이름이 없으면 카카오 주소 검색의 건물명 */
    }
  } finally { elevBusy = false; }
  if (shownItems.value.some((it) => { const k = lotOf(it.addr); return k && !(k in elevs.value); })) void fillElevs();
};
/** 차이 금액 — '+4,660,000' · '−1,020,000' */
const signWon = (x: number) => `${x >= 0 ? '+' : '−'}${won(Math.abs(x))}`;
/** 감정가 대비 % — 최저가 · 예상 낙찰가 · 실제 낙찰가 아랫줄(차이 칸과 같은 꼴) */
const apprPct = (v: number, appr: number) => `${(v / appr * 100).toFixed(1).replace(/\.0$/, '')}%`;
const sgn = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

/** DB 를 먼저, 없으면 이 브라우저에 읽어 둔 파일 */
const dayMap = computed(() => { const m = new Map<string, DayRow & { views?: Record<string, number> }>(dayRows.value.map((d) => [d.key, d])); dbRows.value.forEach((d) => m.set(d.key, { ...(m.get(d.key) ?? {}), ...d, bids: d.bids || m.get(d.key)?.bids || 0, second: d.second || m.get(d.key)?.second || 0 })); return m; });
/** 매각기일 전날까지 가장 늦게 모은 조회수(없으면 당일 값, 그것도 없으면 없음) */
const viewOf = (v: Record<string, number> | undefined) => {
  const ks = Object.keys(v ?? {}).sort(); const before = ks.filter((k) => k < dayDate.value); const same = ks.filter((k) => k === dayDate.value);
  const k = before[before.length - 1] ?? same[0];
  return k ? { n: v![k], at: k } : null;
};
/** 표에 올릴 줄 — 붙여넣은 글이 있으면 그것, 없으면 DB 목록(동선택)에서 조회수 있는 것 */
const baseLines = computed(() => {
  const pasted = parseViewLines(viewsText.value);
  if (pasted.length) return pasted.map((l) => ({ ...l, viewAt: '붙여넣기' }));
  const f = dongFilter.value.trim();
  return dbRows.value.filter((d) => !f || d.addr.includes(f)).map((d) => { const v = viewOf(d.views); return v ? { key: d.key, addr: d.addr, views: v.n, viewAt: v.at } : null; })
    .filter((x): x is { key: string; addr: string; views: number; viewAt: string } => !!x);
});
const soldMap = computed(() => { const m = new Map<string, Sold>(); recs.value.forEach((r) => { const o = m.get(r.key); if (!o || o.d < r.d) m.set(r.key, r); }); return m; });
/** 같은 지번 다른 호실의 건축연도(기일 목록엔 연식이 없다) */
const yearOfAddr = (addr: string) => {
  const m = addr.match(/([가-힣0-9]+(?:동|가|읍|면|리))\s+(\d+(?:-\d+)?)/); if (!m) return null;
  const tok = `${m[1]} ${m[2]}`; const hit = recs.value.find((r) => r.year && r.addr.replace(/\s+/g, ' ').includes(tok));
  return hit?.year ?? null;
};

type Item = { key: string; addr: string; views: number; viewAt: string; target: BidTarget | null; result: { sold: number; bids: number; second: number } | null; failed: boolean; src: string };
const items = computed<Item[]>(() => useHits.value ? dayRounds.value.map((r) => ({
  key: r.key, addr: r.addr, views: r.views, viewAt: r.upTo, src: '차트', failed: r.result === 'fail',
  target: { round: r.round, appr: r.appr, min: r.min, area: r.area, year: yearOfAddr(r.addr), floor: Number(r.addr.match(/(\d+)층/)?.[1] ?? 0) || null, date: r.date, dong: dongOf(r.addr) },
  result: r.result === 'sold' ? { sold: r.sold, bids: r.bids, second: r.second } : r.result === 'fail' ? { sold: 0, bids: 0, second: 0 } : null,
})) : baseLines.value.map((l) => {
  const d = dayMap.value.get(l.key); const s = soldMap.value.get(l.key);
  if (d) {
    const floor = Number(d.addr.match(/(\d+)층/)?.[1] ?? 0) || null; const year = yearOfAddr(d.addr);
    if (d.status.includes('매각')) {
      return { key: l.key, addr: l.addr || d.addr, views: l.views, viewAt: l.viewAt, src: '기일 목록', failed: false,
        target: { round: roundOfRatio(d.min / d.appr), appr: d.appr, min: d.min, area: d.area, year, floor, date: d.date || dayDate.value, dong: dongOf(d.addr) },
        result: { sold: d.sold, bids: d.bids, second: d.second } };
    }
    const n = Number(d.status.match(/유찰\s*(\d+)/)?.[1] ?? 0);
    // 입찰일자가 이 매각기일보다 뒤 = 그날 유찰돼 다음 기일로 넘어간 것(최저가 칸은 다음 기일 값). 같거나 없으면 아직 입찰 전
    const failedHere = !!d.date && d.date > dayDate.value;
    if (!failedHere) {
      return { key: l.key, addr: l.addr || d.addr, views: l.views, viewAt: l.viewAt, src: '기일 목록', failed: false,
        target: { round: n, appr: d.appr, min: d.min, area: d.area, year, floor, date: dayDate.value, dong: dongOf(d.addr) }, result: null };
    }
    const round = Math.max(0, n - 1); const min = Math.round(d.appr * 0.7 ** round / 1000) * 1000;   // 그날 최저가
    return { key: l.key, addr: l.addr || d.addr, views: l.views, viewAt: l.viewAt, src: '기일 목록', failed: true,
      target: { round, appr: d.appr, min, area: d.area, year, floor, date: dayDate.value, dong: dongOf(d.addr) }, result: { sold: 0, bids: 0, second: 0 } };
  }
  if (s) {
    return { key: l.key, addr: l.addr || s.addr, views: l.views, viewAt: l.viewAt, src: '매각 자료', failed: false,
      target: { round: s.round, appr: s.appr, min: s.min, area: s.area, year: s.year, floor: s.floor, date: s.d, dong: s.dong }, result: s.bids != null ? { sold: s.sold, bids: s.bids, second: 0 } : null };
  }
  return { key: l.key, addr: l.addr, views: l.views, viewAt: l.viewAt, src: '', failed: false, target: null, result: null };
}));

/** 기일 목록 한 줄 → 표 줄(조회수 · 예측 없이 사건 · 차수 · 최저가 · 결과만). 다른 동은 날짜별 조회수를 아직 안 모았다 */
const dayItem = (d: DayRow): Item => {
  const floor = Number(d.addr.match(/(\d+)층/)?.[1] ?? 0) || null; const base = { key: d.key, addr: d.addr, views: 0, viewAt: '', src: '기일 목록' };
  if (d.status.includes('매각')) return { ...base, failed: false, target: { round: roundOfRatio(d.min / d.appr), appr: d.appr, min: d.min, area: d.area, year: null, floor, date: dayDate.value, dong: dongOf(d.addr) }, result: { sold: d.sold, bids: d.bids, second: d.second } };
  const n = Number(d.status.match(/유찰\s*(\d+)/)?.[1] ?? 0); const failedHere = !!d.date && d.date > dayDate.value;
  if (!failedHere) return { ...base, failed: false, target: d.appr ? { round: n, appr: d.appr, min: d.min, area: d.area, year: null, floor, date: dayDate.value, dong: dongOf(d.addr) } : null, result: null };
  const round = Math.max(0, n - 1);
  return { ...base, failed: true, target: { round, appr: d.appr, min: Math.round(d.appr * 0.7 ** round / 1000) * 1000, area: d.area, year: null, floor, date: dayDate.value, dong: dongOf(d.addr) }, result: { sold: 0, bids: 0, second: 0 } };
};
/** 표에 올릴 줄 — 처음은 보고 있는 동(예측 있음), '모든동'이면 그날 기일 목록 전부(그 동 밖은 예측 칸 —) */
const fDong = ref(dongFilter.value.trim());   // '' = 모든동
watch(dongFilter, (v) => { fDong.value = v.trim(); });
const allDayItems = computed<Item[]>(() => {
  if (!useHits.value) return items.value;
  const have = new Set(items.value.map((it) => it.key));
  return [...items.value, ...dbRows.value.filter((d) => !have.has(d.key)).map(dayItem)];
});
const listItems = computed<Item[]>(() => (fDong.value === dongFilter.value.trim() || !useHits.value ? items.value : allDayItems.value.filter((it) => !fDong.value || dongOf(it.addr) === fDong.value)));
/** 동 드롭다운 — 그날 목록(고른 계)에 있는 동과 건수, 많은 순 */
const dongOpts = computed(() => {
  const o = new Map<string, number>(); allDayItems.value.filter((it) => !fDept.value || deptOf(it.key) === fDept.value).forEach((it) => { const d = dongOf(it.addr) || '동 모름'; o.set(d, (o.get(d) ?? 0) + 1); });
  const me = dongFilter.value.trim(); if (me && !o.has(me)) o.set(me, 0);
  return [...o.entries()].sort((a, b) => (a[0] === me ? -1 : b[0] === me ? 1 : b[1] - a[1]));
});

const pairs = computed<ViewPair[]>(() => items.value.filter((it) => it.result && it.views >= 0 && it.result.bids >= 0 && (it.failed || it.result.bids > 0)).map((it) => ({ key: it.key, views: it.views, bids: it.result!.bids })));

type Pred = { before: ReturnType<typeof priceDist>; after: ReturnType<typeof priceDist> | null; piBefore: number[]; piAfter: number[] | null; p0: number | null; simN: number; loose: boolean; vmN: number; expBids: number | null };
/** 차트 모드 — 응찰확률 · 예상응찰(신건도) */
const sellMap = computed(() => {
  const m = new Map<string, { pSold: number; pi: number[]; expBids: number }>(); const rm = roundModel.value;
  const rmE = roundModelE.value; const eOf = new Map(roundsAtE.value.filter((r) => r.date === dayDate.value).map((r) => [r.key, r]));
  if (rm) dayRounds.value.forEach((r) => { const p = predictRound(rm, r); const re = eOf.get(r.key); m.set(r.key, rmE && re ? { ...p, pSold: predictRound(rmE, re).pSold } : p); });
  return m;
});
const preds = computed(() => {
  const out = new Map<string, Pred>();
  if (!recs.value.length) return out;
  if (useHits.value) {
    const rm = roundModel.value;
    for (const it of items.value) {
      if (!it.target || it.target.round < 1) continue;   // 신건은 응찰확률만(배수 식은 1회 유찰부터)
      const tg = { ...it.target, addr: it.addr }; const m = fitPriceModel(recs.value, tg, extReady.value ? pxPrice : undefined); if (!m) continue;
      const sim = similarBands(recs.value, it.target); const s = sellMap.value.get(it.key);
      out.set(it.key, { before: priceDist(m, tg, sim.pi), after: s ? priceDist(m, tg, s.pi) : null, piBefore: sim.pi, piAfter: s?.pi ?? null, p0: s ? 1 - s.pSold : null, simN: sim.n, loose: sim.loose, vmN: rm?.n ?? 0, expBids: s?.expBids ?? null });
    }
    return out;
  }
  for (const it of items.value) {
    if (!it.target) continue;
    const m = fitPriceModel(recs.value, it.target); if (!m) continue;
    const sim = similarBands(recs.value, it.target);
    const vm = fitViewModel(pairs.value.filter((p) => p.key !== it.key));   // 자기 사건은 빼고 배운다
    const vb = vm ? viewBands(vm, it.views) : null;
    out.set(it.key, { before: priceDist(m, it.target, sim.pi), after: vb ? priceDist(m, it.target, vb.pi) : null, piBefore: sim.pi, piAfter: vb?.pi ?? null, p0: vb?.p0 ?? null, simN: sim.n, loose: sim.loose, vmN: vm?.n ?? 0, expBids: vb?.bids ?? null });
  }
  return out;
});

const sel = computed(() => items.value.find((it) => it.key === pick.value && preds.value.has(it.key)) ?? items.value.find((it) => preds.value.has(it.key)) ?? null);
const selP = computed(() => (sel.value ? preds.value.get(sel.value.key) ?? null : null));

/** 내 낙찰확률 — 아무도 안 올 확률 + (누가 올 확률 × 그 사람들보다 높게 쓸 확률). 예전엔 '누가 온다'고만 쳐서
 *  응찰확률이 2%인 물건도 최저가에서 0%로 그렸다(2026-11-14 사용자 — 파인힐타운이면 최저가를 쓰면 된다) */
const myWin = (p: Pred) => { const d = p.after ?? p.before; const p0 = p.p0 ?? 0; return (w: number) => p0 + (1 - p0) * d.win(w); };
/** 예상 낙찰가 — 입찰자가 있을 때 그 확률로 이기는 값(조건부, 시험에서 말한 대로 맞은 쪽). 50% = 예상 낙찰가 가운데(2026-11-17 사용자 — 한 숫자 대신 확률별 입찰가를 주 결과로) */
const Q_TIP = '입찰자가 있을 때 그 확률로 이기는 값 · 50%가 분포 가운데';
const qOf = (it: Item, q: number) => { const p = preds.value.get(it.key)!; const d = p.after ?? p.before; return Math.max(it.target!.min, d.q(q)); };
/** 매각된 사건 — 실제 낙찰가로 썼으면 이겼을 확률(조건부). 이 값보다 높게 써야 받는다 */
const winAt = (it: Item) => { const p = preds.value.get(it.key); return p && it.result && it.result.sold > 0 ? (p.after ?? p.before).win(it.result.sold + 1) : null; };
/** 입찰가별 낙찰확률 표 — 그날 보고 있는 동의 예측 있는 사건 */
/** 실제 낙찰가 칸은 끝난 기일만(다가오는 기일은 전부 '입찰 전') */
/** 실제 낙찰가 칸 — 지난 기일과 오늘(결과가 들어온 사건은 금액, 아니면 '입찰 전'). 다가오는 기일만 뺀다(2026-11-16 사용자: 당일 결과가 안 보였음) */

/** DB 에 들어 있는 이 날 목록(동선택) — 사건번호 · 주소 · 조회수 */
const dbList = computed(() => {
  const f = dongFilter.value.trim();
  return dbRows.value.filter((d) => !f || d.addr.includes(f)).map((d) => {
    const ks = Object.keys(d.views ?? {}).sort(); const k = ks[ks.length - 1];   // 목록에는 가장 늦게 모은 값(매각 뒤여도) — 예측은 viewOf(전날까지)만
    return { ...d, v: k ? { n: d.views[k], at: k, after: k > dayDate.value } : null };
  });
});
/* ===== 엘베 · 세대수 — 덧붙인 계산(2026-11-14 사용자: 사람 몰린 물건을 낮게 맞히는 까닭 ③ 입지 · 개별성). 건축물대장(건물 자체라 날짜와 상관없음).
 * 시세(매각일 이전 실거래 대비 최저가)는 뺐다 — 6월 ~ 11-12 시험에서 시세만 7.63% · 없음 7.62% · 엘베 · 세대수만 7.36% · 셋 다 7.33%. 효과는 엘베(빌라 개별성 1순위, 2026-11-15 사용자) ===== */
const extFacts = ref<Record<string, BuildingFacts | null>>({});
const extMsg = ref(''); const extBusy = ref(false);
const extDone = ref(false);
const extReady = computed(() => extDone.value);
const extMemo = new Map<string, number[]>();
const loadExt = async () => {
  if (extBusy.value) return; extBusy.value = true; extMemo.clear(); extDone.value = false;
  try {
    const dong = dongFilter.value.trim();
    const lots = new Map<string, string>();
    [...hitDocs.value.map((h) => h.addr), ...recs.value.map((r) => r.addr)].forEach((a) => { const l = lotParts(a); if (l.dong === dong && l.jibun) lots.set(`${l.dong} ${l.jibun}`, a); });
    let i = 0;
    for (const [k, a] of lots) {
      if (!(k in extFacts.value)) { const f = await getBuildingFacts(a); extFacts.value = { ...extFacts.value, [k]: f }; }
      i += 1; if (i % 10 === 0) extMsg.value = `건축물대장 ${i.toLocaleString('ko-KR')} / ${lots.size.toLocaleString('ko-KR')}`;
    }
    extMemo.clear(); extDone.value = true;
    extMsg.value = `건축물대장 ${lots.size.toLocaleString('ko-KR')}곳`;
  } catch { extMsg.value = '건축물대장을 받지 못함'; }
  finally { extBusy.value = false; }
};
/** 아파트 사건 주소 — 세대수는 아파트만(빌라는 한 동 몇 세대라 뜻이 없다, 2026-11-15 사용자). 종별을 모르는 매각 자료 줄은 빌라로 본다 */
const aptAddrs = computed(() => new Set(hitDocs.value.filter((h) => /아파트/.test(h.kind)).map((h) => h.addr)));
/** 덧붙일 값 — [엘베, 세대수(ln, 아파트만 · 빌라 0), 대장 못 찾음]. 낙찰가 · 응찰 인원에만 쓴다(응찰확률은 빼는 게 낫다) */
const extVec = (addr: string, area: number | null, min: number, d: string): number[] => {
  const key = `${addr}|${area}|${min}|${d}`; const hit = extMemo.get(key); if (hit) return hit;
  const l = lotParts(addr); const f = extFacts.value[`${l.dong} ${l.jibun}`];
  const v = [f ? (f.elevator > 0 ? 1 : 0) : 0, f?.households && aptAddrs.value.has(addr) ? Math.log(1 + f.households) : 0, f ? 0 : 1];
  extMemo.set(key, v); return v;
};
watch(() => [hitDocs.value.length, recs.value.length] as const, ([h, r]) => { if (h && r && !extReady.value && !extBusy.value) void loadExt(); });
const xfRound = (r: Round) => extVec(r.addr, r.area, r.min, r.date);
const pxPrice = (x: { addr: string; area: number | null; min: number; d: string }) => extVec(x.addr, x.area, x.min, x.d);

/* ===== 채점하기 — 기간 안 모든 회차를 그날 이전 자료로만 맞혀 본다(그날 결과는 안 본다, 2026-11-14) =====
 * 조회수 없이(같은 회차 팔린 비율 · 비슷한 물건 인원) ↔ 조회수 반영(누적 + 마지막 7일 + 회차) 나란히 */
const gradeFrom = ref('2026-06-01');
const gradeTo = ref(plusDays(todayIso(), -1));
type GradeAcc = { n: number; sold: number; sell: number[]; band: number[]; nb: number; err: number[]; inR: number[]; np: number; ext: boolean };   // nk … — 새 방식(k)을 낼 수 있던 건만, 같은 건의 지금 방식(eo · io)과 나란히   // [조회수 없이, 조회수 반영, + 시세 · 입지]
const acc0 = (): GradeAcc => ({ n: 0, sold: 0, sell: [0, 0, 0], band: [0, 0, 0], nb: 0, err: [0, 0, 0], inR: [0, 0, 0], np: 0, ext: false });
const grade = ref<{ total: GradeAcc; days: Array<GradeAcc & { date: string }>; skipped: number; from: string; to: string } | null>(null);
const grading = ref(false);
const gradeMsg = ref('');
const runGrade = async () => {
  if (grading.value) return;
  if (!hitRounds.value.length || !recs.value.length) { gradeMsg.value = '사건 차트 · 매각 자료를 다 읽은 뒤에 눌러 주세요'; return; }
  grading.value = true; gradeMsg.value = ''; grade.value = null;
  await new Promise((r) => setTimeout(r, 20));
  try {
    const R = hitRounds.value; const RE = hitDocs.value.flatMap((h) => roundsOf(effOf(h))); const eKey = new Map(RE.map((r) => [`${r.key}|${r.date}|${r.round}`, r])); const from = gradeFrom.value; const to = gradeTo.value;
    const ok = (r: Round) => r.complete && r.round <= 4 && (r.result === 'fail' || (r.result === 'sold' && r.bids > 0));
    const T = R.filter((r) => ok(r) && r.date >= from && r.date <= to);
    const dates = [...new Set(T.map((r) => r.date))].sort();
    const total = acc0(); const days: Array<GradeAcc & { date: string }> = []; let skipped = 0;
    const REP = [1, 2, 5, 8, 15];
    for (let di = 0; di < dates.length; di++) {
      const d = dates[di]; const m = fitRoundModel(R, d); const useX = extReady.value; const mx = useX ? fitRoundModel(R, d, xfRound) : null;
      const mE = fitRoundModel(RE, d);   // 매각 · 유찰 확률은 유효조회수, 덧붙임 없이
      const rows = T.filter((r) => r.date === d);
      if (!m) { skipped += rows.length; continue; }
      const rate: Record<number, [number, number]> = {};
      R.filter((r) => ok(r) && r.date < d).forEach((r) => { const g = Math.min(r.round, 3); rate[g] = rate[g] ?? [0, 0]; rate[g][0] += r.result === 'sold' ? 1 : 0; rate[g][1] += 1; });
      const a = { ...acc0(), date: d };
      for (const r of rows) {
        const re = eKey.get(`${r.key}|${r.date}|${r.round}`); const ps = mE && re ? predictRound(mE, re).pSold : predictRound(m, r).pSold; const ps2 = ps;
        const p = predictRound(m, r); const p2 = mx ? predictRound(mx, r) : p; const g = rate[Math.min(r.round, 3)]; const pb = g ? (g[0] + 1) / (g[1] + 2) : 0.5;
        const sold = r.result === 'sold';
        for (const x of [a, total]) { x.n += 1; x.sold += sold ? 1 : 0; x.sell[0] += (pb >= 0.5) === sold ? 1 : 0; x.sell[1] += (ps >= 0.5) === sold ? 1 : 0; x.sell[2] += (ps2 >= 0.5) === sold ? 1 : 0; x.ext = !!mx; }
        if (!sold) continue;
        const tg: BidTarget = { round: r.round, appr: r.appr, min: r.min, area: r.area, year: yearOfAddr(r.addr), floor: Number(r.addr.match(/(\d+)층/)?.[1] ?? 0) || null, date: r.date, dong: dongOf(r.addr) };
        const sim = similarBands(recs.value, tg); const eb0 = sim.pi.reduce((s, q, k) => s + q * REP[k], 0);
        for (const x of [a, total]) { x.nb += 1; x.band[0] += bandOf(Math.round(eb0)) === bandOf(r.bids) ? 1 : 0; x.band[1] += bandOf(Math.round(p.expBids)) === bandOf(r.bids) ? 1 : 0; x.band[2] += bandOf(Math.round(p2.expBids)) === bandOf(r.bids) ? 1 : 0; }
        if (r.round < 1) continue;
        const pm = fitPriceModel(recs.value, tg); if (!pm) continue;
        const d0 = priceDist(pm, tg, sim.pi); const d1 = priceDist(pm, tg, p.pi);
        const tgx = { ...tg, addr: r.addr }; const pm2 = useX ? fitPriceModel(recs.value, tgx, pxPrice) : null; const d2 = pm2 ? priceDist(pm2, tgx, p2.pi) : d1;
        for (const x of [a, total]) {
          x.np += 1; x.err[0] += Math.abs(r.sold / d0.median - 1); x.err[1] += Math.abs(r.sold / d1.median - 1); x.err[2] += Math.abs(r.sold / d2.median - 1);
          x.inR[0] += r.sold >= d0.lo && r.sold <= d0.hi ? 1 : 0; x.inR[1] += r.sold >= d1.lo && r.sold <= d1.hi ? 1 : 0; x.inR[2] += r.sold >= d2.lo && r.sold <= d2.hi ? 1 : 0;
        }
      }
      days.push(a);
      if (di % 6 === 5) { gradeMsg.value = `채점하는 중 — 기일 ${di + 1}/${dates.length}`; await new Promise((r) => setTimeout(r, 0)); }
    }
    grade.value = { total, days: days.reverse(), skipped, from, to }; gradeMsg.value = '';
  } catch { gradeMsg.value = '채점하지 못했습니다. 다시 눌러 주세요'; }
  finally { grading.value = false; }
};
const rate = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)}%` : '—');
const errPct = (x: number, n: number) => (n ? `${((x / n) * 100).toFixed(1)}%` : '—');
const goDay = (d: string) => { dayDate.value = d; requestAnimationFrame(() => document.querySelector('.bpt-day')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

const WD = ['일', '월', '화', '수', '목', '금', '토'];
/** 표 맨 왼쪽 입찰일 — '26.11.19(목)' */
const bidDay = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8)}(${WD[new Date(`${d}T00:00:00`).getDay()]})` : '—');

/* ===== 기일 달력 — 한 달 월~금, 날마다 법원 · 계별 건수(괄호 = 동선택의 동). 계별은 기일목록수집을 받은 날만, 나머지 날은 사건 차트의 다음 기일로 센 동 건수만.
 * 탱크옥션 기일별물건처럼 모든 법원 · 계 건수는 나중에 마이가 그 달력을 받아 채운다(2026-11-15 사용자) ===== */
const calMonth = ref(todayIso().slice(0, 7));
const calDocs = ref<Awaited<ReturnType<typeof loadDayListsRange>>>([]);
/** 탱크옥션 달력 숫자(모든 법원 · 계 · 날짜 · 건수) — 마이가 달마다 저장. 칸마다 그날 물건이 가장 많은 법원을 보인다(2026-11-16) */
const calRows = ref<CalRow[]>([]);
/** 달력 지역 고르기 — 드롭다운(전체 + 지역 목록, 여러 개). 처음은 서울 · 경기 · 인천(갈 수 있는 곳). 이 브라우저에 남긴다(2026-11-16 사용자) */
const REGION_KEY = 'ta.web.bpt.calRegions';
const REGION_ORDER = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '창원', '전주', '청주', '춘천', '제주'];
const regionOf = (court: string) => { const p = court.split('-')[0]; return p === '의정부' || p === '수원' ? '경기' : p; };
const loadRegions = (): string[] => { try { const v = JSON.parse(localStorage.getItem(REGION_KEY) || 'null'); return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : ['서울', '경기', '인천']; } catch { return ['서울', '경기', '인천']; } };
const calRegions = ref<string[]>(loadRegions());
watch(calRegions, (v) => { try { localStorage.setItem(REGION_KEY, JSON.stringify(v)); } catch { /* 그만 */ } }, { deep: true });
const allRegions = computed(() => { const got = new Set(calRows.value.map((r) => regionOf(r.court))); return [...REGION_ORDER.filter((r) => got.has(r)), ...[...got].filter((r) => !REGION_ORDER.includes(r)).sort()]; });
const regAllOn = computed(() => allRegions.value.length > 0 && allRegions.value.every((r) => calRegions.value.includes(r)));
const regToggleAll = () => { calRegions.value = regAllOn.value ? [] : [...allRegions.value]; };
const regLabel = computed(() => (regAllOn.value || !calRegions.value.length ? '전체' : calRegions.value.length <= 3 ? calRegions.value.join(' · ') : `${calRegions.value.length}개 지역`));
const regOpen = ref(false);
/** 고른 지역의 달력 숫자만 — 아무것도 안 고르면 전체 */
const calRowsSel = computed(() => (!calRegions.value.length || regAllOn.value ? calRows.value : calRows.value.filter((r) => calRegions.value.includes(regionOf(r.court)))));
const loadCalRows = async () => { const m = calMonth.value; try { const got = await loadCalNums(m); if (m === calMonth.value) calRows.value = got; } catch { if (m === calMonth.value) calRows.value = []; } };
const loadCal = async () => { const m = calMonth.value; try { const got = await loadDayListsRange(`${m}-01`, `${m}-31`); if (m === calMonth.value) calDocs.value = got; } catch { if (m === calMonth.value) calDocs.value = []; } };
watch(calMonth, () => { void loadCal(); void loadCalRows(); }, { immediate: true });
watch(dayDate, (d) => { if (/^\d{4}-\d{2}/.test(d) && d.slice(0, 7) !== calMonth.value) calMonth.value = d.slice(0, 7); }, { immediate: true });   // 매각기일을 고르면 달력도 그 달로
const calStep = (n: number) => { const [y, m] = calMonth.value.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); calMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const calDong = computed(() => dongFilter.value.trim());
const calWeeks = computed(() => {
  const [y, m] = calMonth.value.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const today = todayIso();
  const dongN = new Map<string, number>(); hitRounds.value.forEach((r) => dongN.set(r.date, (dongN.get(r.date) ?? 0) + 1));
  const byDay = new Map<string, typeof calDocs.value>(); calDocs.value.forEach((d) => byDay.set(d.date, [...(byDay.get(d.date) ?? []), d]));
  // 달력 숫자 — 날마다 법원별 합계 · 계별 건수, 그중 1등 법원
  const calByDay = new Map<string, Map<string, { n: number; depts: string[] }>>();
  calRowsSel.value.forEach((r) => { const m = calByDay.get(r.d) ?? new Map(); const g = m.get(r.court) ?? { n: 0, depts: [] }; g.n += r.n; g.depts.push(`${r.dept.replace(/^경매/, '')}(${r.n.toLocaleString('ko-KR')})`); m.set(r.court, g); calByDay.set(r.d, m); });
  const topOf = (d: string) => { const m = calByDay.get(d); if (!m) return null; const [court, g] = [...m.entries()].sort((a, b) => b[1].n - a[1].n)[0]; return { court, n: g.n, depts: g.depts }; };
  // 그날 전국 합계 — 많은 날일수록 입찰자가 나뉘어 가기 좋은 날(2026-11-16 사용자: 날을 먼저, 법원은 그다음). 이달 상위 3일을 띄운다
  const allOf = (d: string) => { const m = calByDay.get(d); return m ? [...m.values()].reduce((s, g) => s + g.n, 0) : 0; };
  const busyDays = new Set([...calByDay.keys()].map((d) => [d, allOf(d)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d));
  const cellOf = (day: number) => {
    const d = `${calMonth.value}-${String(day).padStart(2, '0')}`; const docs = byDay.get(d) ?? []; const depts = docs.filter((x) => x.dept);
    const use = depts.length ? depts : docs;   // 계별 문서가 있으면 그것만(CSV 는 같은 사건을 또 담는다)
    const lines = use.map((x) => ({ label: x.dept ? `${x.court.replace(/^[^-]+-/, '')} ${x.dept.replace(/^경매/, '')}` : 'CSV', n: x.rows.length, dong: calDong.value ? x.rows.filter((r) => String(r.addr ?? '').includes(calDong.value)).length : 0 }));
    const courts = [...new Set(use.map((x) => x.court).filter(Boolean))];   // 날짜 옆 이름 — 한 법원이면 '인천-본원 375', 여럿이면 '총 375'
    return { d, day, court: courts.length === 1 ? courts[0] : '총', total: use.reduce((s, x) => s + x.rows.length, 0), lines, dongN: dongN.get(d) ?? 0, today: d === today, top: topOf(d), all: allOf(d), busy: busyDays.has(d), rec: recCountByDay.value.get(d) ?? 0 };
  };
  const weeks: Array<Array<ReturnType<typeof cellOf> | null>> = []; let wk: Array<ReturnType<typeof cellOf> | null> = [];
  for (let day = 1; day <= last; day += 1) {
    const wd = new Date(y, m - 1, day).getDay(); if (wd === 0 || wd === 6) continue;
    if (wd === 1 && wk.length) { weeks.push(wk); wk = []; }
    if (!wk.length) for (let k = 1; k < wd; k += 1) wk.push(null);
    wk.push(cellOf(day));
  }
  if (wk.length) { while (wk.length < 5) wk.push(null); weeks.push(wk); }
  return weeks;
});

/** 사건별 예측 머리 표 — 그날 법원 전체(작은 회색) · 보고 있는 동(단추 숫자). 단추를 누르면 아래 표를 거른다 */
const fDept = ref(''); const fStat = ref(''); const fKind = ref(''); const fRound = ref(''); const fCred = ref('');
watch(dayDate, () => { fDept.value = ''; fStat.value = ''; fKind.value = ''; fRound.value = ''; fCred.value = ''; });
/** 채권자별 거르기(2026-11-16 사용자) — 허그 · 그 밖. 차수별 줄은 뺐다(차수 정렬로 충분, 2026-11-16 사용자) — fRound 는 코드만 남김 */
const roundOf = (it: Item) => (it.target ? (it.target.round === 0 ? '신건' : `${it.target.round + 1}차`) : '모름');
const credOfIt = (it: Item) => (isHug(it.key) ? '허그' : credShort(it.key) ? '그 밖' : '모름');
/** 표 정렬 — 머리글 누르기. 처음은 응찰확률 낮은 순(경쟁 적은 사건이 위로) */
const sortKey = ref('pSold'); const sortDir = ref(1);
const sortBy = (k: string) => { if (sortKey.value === k) sortDir.value = -sortDir.value; else { sortKey.value = k; sortDir.value = 1; } };
const sortVal = (it: Item, k: string): number | null => {
  const s = sellOf(it.key); const p = preds.value.get(it.key);
  switch (k) {
    case 'pSold': return s ? s.pSold : null; case 'bids': return s ? s.expBids : null; case 'min': return it.target?.min ?? null; case 'appr': return it.target?.appr ?? null; case 'round': return it.target?.round ?? null;
    case 'views': return it.viewAt ? it.views : null; case 'pred': return p ? (p.after ?? p.before).median : null; case 'sold': return it.result && it.result.sold > 0 ? it.result.sold : null;
    case 'actBids': return it.result && it.result.sold > 0 ? it.result.bids : null; case 'year': return yearShow(it) ?? null; case 'area': return it.target?.area ?? null;
    case 'cred': return isHug(it.key) ? 0 : credShort(it.key) ? 1 : null; default: return null;
  }
};
const deptOf = (key: string) => dayDepts.value.find((d) => d.keys.includes(key))?.dept ?? '';
const dbByKey = computed(() => new Map(dbRows.value.map((d) => [d.key, d])));
/** 그날 현황 — 기일 목록에서 온 줄은 법원 쪽 셈(statOfRow)과 같은 기준(변경 · 취하도) */
const statOf = (it: Item) => { if (it.src === '기일 목록') { const d = dbByKey.value.get(it.key); if (d) return statOfRow(d); } return it.result ? (it.result.sold > 0 ? '매각' : '유찰') : '입찰 전'; };
const kindOf = (it: Item) => dayRounds.value.find((x) => x.key === it.key)?.kind || dayMap.value.get(it.key)?.kind || '기타';
const KIND5 = ['아파트', '연립주택', '다세대주택', '오피스텔(주거)', '도시형생활주택'];
const daySum = computed(() => {
  const courts = new Map<string, Array<{ dept: string; n: number }>>(); const kinds: Record<string, number> = {}; const stats: Record<string, number> = {};
  dayDepts.value.forEach((d) => {
    const c = (d.court || '').replace('-', ' '); courts.set(c, [...(courts.get(c) ?? []), { dept: d.dept, n: d.n }]);
    if (fDept.value && d.dept !== fDept.value) return;   // 현황 · 종류의 법원 쪽 수는 고른 계만
    Object.entries(d.kinds).forEach(([k, n]) => { kinds[k] = (kinds[k] ?? 0) + n; }); Object.entries(d.stats).forEach(([k, n]) => { stats[k] = (stats[k] ?? 0) + n; });
  });
  // 단추 숫자 — 다른 줄에서 고른 거르기(계 · 선정물건 · 현황 ↔ 종류)를 반영해 센다. 표 줄 수와 맞게(2026-11-14 사용자)
  const base = listItems.value.filter((it) => (!fDept.value || deptOf(it.key) === fDept.value) && (!fMine.value || mineKeys.value.has(it.key)));
  const cnt = (f: (it: Item) => string, rows: Item[] = base) => { const o: Record<string, number> = {}; rows.forEach((it) => { const k = f(it); o[k] = (o[k] ?? 0) + 1; }); return o; };
  const mDept = cnt((it) => deptOf(it.key) || '계 모름');
  const okR = (it: Item) => !fRound.value || roundOf(it) === fRound.value; const okC = (it: Item) => !fCred.value || credOfIt(it) === fCred.value;
  const mStat = cnt(statOf, base.filter((it) => (!fKind.value || kindOf(it) === fKind.value) && okR(it) && okC(it)));
  const mKind = cnt(kindOf, base.filter((it) => (!fStat.value || statOf(it) === fStat.value) && okR(it) && okC(it)));
  const mRound = cnt(roundOf, base.filter((it) => (!fStat.value || statOf(it) === fStat.value) && (!fKind.value || kindOf(it) === fKind.value) && okC(it)));
  const mCred = cnt(credOfIt, base.filter((it) => (!fStat.value || statOf(it) === fStat.value) && (!fKind.value || kindOf(it) === fKind.value) && okR(it)));
  const ROUND_ORDER = ['신건', '2차', '3차', '4차', '5차', '6차', '7차', '모름']; const CRED_ORDER = ['허그', '그 밖', '모름'];
  const STAT_ORDER = ['유찰', '매각', '입찰 전'];
  const inDept = base.length;
  const statAll = base.filter((it) => !fKind.value || kindOf(it) === fKind.value).length; const kindAll = base.filter((it) => !fStat.value || statOf(it) === fStat.value).length;
  const dongN = items.value.filter((it) => !fDept.value || deptOf(it.key) === fDept.value).length;
  return {
    total: dayDepts.value.reduce((s, d) => s + d.n, 0), dongN, statAll, kindAll, scopeN: fDept.value ? dayDepts.value.find((d) => d.dept === fDept.value)?.n ?? 0 : dayDepts.value.reduce((s, d) => s + d.n, 0), inDept,
    courts: [...courts.entries()].map(([c, ds]) => ({ c, n: ds.reduce((s, d) => s + d.n, 0) })),
    depts: dayDepts.value.map((d) => ({ k: d.dept, label: `${(d.court || '').replace('-', ' ')} ${d.dept}`.trim(), mine: mDept[d.dept] ?? 0, all: d.n })),
    stats: [...new Set([...STAT_ORDER.filter((s) => mStat[s] || stats[s]), ...Object.keys(stats)])].map((k) => ({ k, mine: mStat[k] ?? 0, all: stats[k] ?? 0 })),
    kinds: KIND5.map((k) => ({ k, mine: mKind[k] ?? 0, all: kinds[k] ?? 0 })),   // 탱크옥션 기일별물건과 같은 다섯 종류만
    rounds: ROUND_ORDER.filter((k) => mRound[k]).map((k) => ({ k, mine: mRound[k] })), creds: CRED_ORDER.filter((k) => mCred[k]).map((k) => ({ k, mine: mCred[k] })),
    dong: dongFilter.value.trim() || '전체', mineN: items.value.length,
  };
});
const nMine = computed(() => items.value.filter((it) => mineKeys.value.has(it.key)).length);
/** 단추로 거른 줄 */
const shownItems = computed(() => {
  // 선정물건만보기는 다른 거르기(계 · 현황 · 종류 · 차수)를 덮는다 — 리베라(도시형)가 '다세대' 칩에 걸려 안 보이는데 숫자만 2로 찍혔다(2026-11-17 사용자)
  const rows = listItems.value.filter((it) => (fMine.value ? mineKeys.value.has(it.key) : (!fDept.value || deptOf(it.key) === fDept.value) && (!fStat.value || statOf(it) === fStat.value) && (!fKind.value || kindOf(it) === fKind.value) && (!fRound.value || roundOf(it) === fRound.value) && (!fCred.value || credOfIt(it) === fCred.value)));
  const k = sortKey.value; if (!k) return rows;
  if (k === 'key') return [...rows].sort((a, b) => sortDir.value * a.key.localeCompare(b.key));
  const off = (it: Item) => (preds.value.has(it.key) ? 0 : 1);   // 예측 없는 줄(신건 · 자료 없음)은 어떤 정렬이든 맨 아래
  return [...rows].map((it, i) => ({ it, i, v: sortVal(it, k), o: off(it) })).sort((a, b) => a.o - b.o || (a.v == null ? 1 : 0) - (b.v == null ? 1 : 0) || (a.v != null && b.v != null && a.v !== b.v ? sortDir.value * (a.v - b.v) : a.i - b.i)).map((x) => x.it);   // 값 없는 줄은 맨 아래, 같으면 원래 순서
});
const FR = { dept: fDept, stat: fStat, kind: fKind, round: fRound, cred: fCred } as const;
// 엘베 — 표에 보이는 줄이 바뀌면 그 지번만 더 받는다(shownItems 다음에 둬야 한다)
watch(() => shownItems.value.map((it) => it.key).join(','), () => { void fillElevs(); }, { immediate: true });
const pickF = (w: keyof typeof FR, v: string) => { FR[w].value = FR[w].value === v ? '' : v; };
/** 내 관심 물건 = 물건카드(선정물건)에 올린 사건 — 사건번호로 맞춘다 */
const auctions = useAuctionStore();
const mineKeys = computed(() => new Set(auctions.auctions.map((a) => caseKey(a.caseNumber)).filter(Boolean)));
const fMine = ref(false);
watch(dayDate, () => { fMine.value = false; fDong.value = dongFilter.value.trim(); });

/* ===== 추천 · 어디로 갈까 — 추천 = 조회수로 본 응찰확률 30% 아래 · 예상응찰 1명 아래(채권자는 가리지 않음 — 허그가 올지 실수요자가 올지는 아무도 모른다, 2026-11-16 사용자).
 * 어디로 갈까 = 달력 숫자에서 그날 서울 · 경기 · 인천 법원을 물건 많은 순으로 한두 곳(한 법원에 오는 입찰자는 400~500명으로 비슷해 물건이 많을수록 건당 경쟁이 준다) ===== */
/** '경쟁↓' 칩 툴팁(2026-11-17 사용자 — '추천'은 비싸게 들어가라는 뜻으로 읽혀 바꿈) */
const REC_TIP = '응찰확률 30% 아래 · 예상응찰 1명 아래 · 입찰자가 적어 최저가 근처로 받을 가능성이 높습니다';
const REC_P = 0.3; const REC_BIDS = 1;   // 신건은 예상 낙찰가가 없어(확률만) 추천에서 뺀다
const recItems = computed(() => listItems.value.filter((it) => { const s = sellOf(it.key); return !!it.target && preds.value.has(it.key) && !!s && s.pSold < REC_P && s.expBids < REC_BIDS; }).sort((a, b) => sellOf(a.key)!.pSold - sellOf(b.key)!.pSold));
const recKeys = computed(() => new Set(recItems.value.map((it) => it.key)));
const isRec = (key: string) => recKeys.value.has(key);
/** 낙찰확률 q 로 이기는 예상 낙찰가(입찰자가 있을 때) — 입찰가별 낙찰확률 표와 같은 셈 */
const bidQ = (it: Item, q: number) => { const p = preds.value.get(it.key); if (!p || !it.target) return null; return Math.max(it.target.min, (p.after ?? p.before).q(q)); };
/** 건물 · 호만 — '검암동 647-3 부경캐슬 5층502호' → '부경캐슬 5층502호' */
const placeOf = (addr: string) => { const t = tblAddr(addr).split(/\s+/); return (t.length > 2 ? t.slice(2) : t).join(' '); };
/** 달력 칸의 '추천 N' — 날마다 늘 보인다(2026-11-16 사용자). 그날 이전 자료로 회차 모델을 맞춰 표와 같은 기준으로 센다(유효조회수 모델의 응찰확률 30% 아래 · 조회수 모델의 예상응찰 1명 아래 · 신건 제외). 고른 날은 표의 추천 수 그대로 */
const recCountByDay = computed(() => {
  const out = new Map<string, number>();
  if (!useHits.value) return out;
  const m = calMonth.value; const days = [...new Set(roundsAtE.value.filter((r) => r.date.startsWith(m) && r.round >= 1).map((r) => r.date))];
  for (const d of days) {
    if (d === dayDate.value) { out.set(d, recItems.value.length); continue; }
    const mE = fitRoundModel(roundsAtE.value, d); const mH = fitRoundModel(roundsAt.value, d); if (!mE || !mH) continue;
    const hs = new Map(roundsAt.value.filter((r) => r.date === d).map((r) => [r.key, r]));
    let n = 0;
    roundsAtE.value.filter((r) => r.date === d && r.round >= 1).forEach((r) => { const h = hs.get(r.key); if (h && predictRound(mE, r).pSold < REC_P && predictRound(mH, h).expBids < REC_BIDS) n += 1; });
    out.set(d, n);
  }
  return out;
});
const goRows = computed(() => {
  const by = new Map<string, { n: number; depts: string[] }>();
  calRowsSel.value.filter((r) => r.d === dayDate.value).forEach((r) => { const g = by.get(r.court) ?? { n: 0, depts: [] }; g.n += r.n; g.depts.push(`${r.dept.replace(/^경매/, '')}(${r.n.toLocaleString('ko-KR')})`); by.set(r.court, g); });
  if (!by.size) dayDepts.value.forEach((d) => { const g = by.get(d.court) ?? { n: 0, depts: [] }; g.n += d.n; g.depts.push(`${d.dept.replace(/^경매/, '')}(${d.n.toLocaleString('ko-KR')})`); by.set(d.court, g); });   // 달력 숫자가 아직 없으면 받아 둔 기일 목록으로
  return [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2).map(([court, g]) => {
    const mine = dayDepts.value.filter((d) => d.court === court);
    const kinds: Record<string, number> = {}; mine.forEach((d) => Object.entries(d.kinds).forEach(([k, n]) => { kinds[k] = (kinds[k] ?? 0) + n; }));
    const kindStr = mine.length ? KIND5.filter((k) => kinds[k]).sort((a, b) => kinds[b] - kinds[a]).map((k) => `${k.replace('(주거)', '').replace('다세대주택', '다세대').replace('도시형생활주택', '도시형').replace('연립주택', '연립')} ${kinds[k].toLocaleString('ko-KR')}`).join(' · ') : '';
    const recs = mine.length ? recItems.value.map((it) => ({ key: it.key, place: placeOf(it.addr), round: it.target!.round + 1, pSold: sellOf(it.key)!.pSold, bids: sellOf(it.key)!.expBids, bid50: bidQ(it, 0.5) })) : [];
    return { court, n: g.n, depts: g.depts.join(' · '), kinds: kindStr, listed: mine.length > 0, recs };
  });
});
/** 표의 응찰확률 · 예상응찰 */
const sellOf = (key: string) => { const s = sellMap.value.get(key); if (s) return s; const p = preds.value.get(key); return p && p.p0 != null ? { pSold: 1 - p.p0, expBids: p.expBids ?? 0 } : null; };
/** 누적이 매각 전날까지 안 닿았으면 — 빨간 '~11.14' */
const stale = (at: string) => useHits.value && !!at && at < plusDays(dayDate.value, -1);
</script>

<template>
  <div class="bpt">
    <section class="bpt-card">
      <header class="bpt-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#213366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>
        <h2>낙찰가 예측</h2>
        <span class="bpt-note">{{ recsInfo }}</span>
      </header>
      <div class="bpt-in">
        <div class="bpt-box bpt-colbox">
          <h3 class="bpt-colh">기일목록 · 조회수 수집
            <span :class="['bpt-conn', agentOn ? 'on' : 'off']"><i aria-hidden="true" />{{ agentOn ? 'MyAgent · ' : 'MyAgent' }}<template v-if="agentOn"><span class="ago">{{ agentAgo }}</span>초 전</template></span>
            <span v-if="agentOn && agent?.version" class="bpt-ver">{{ verLabel(agent.version) }}</span>
          </h3>
          <div class="bpt-pair"><label class="bpt-date">법원<select v-model="colCourt" class="court" aria-label="법원"><option v-for="c in COURTS" :key="c" :value="c">{{ c }}</option></select></label><label class="bpt-date">동선택<input v-model="dongFilter" type="text" class="court" placeholder="검암동" /></label></div>
          <div class="bpt-date">기간<div class="bpt-range"><input v-model="colFrom" type="date" aria-label="시작일" /><span>~</span><input v-model="colTo" type="date" aria-label="끝일" /></div></div>
          <div class="bpt-btns">
            <button type="button" class="bpt-btn line" :disabled="!agentOn || !!agent?.busy" @click="sendCmd('open')">브라우저열기</button>
            <button type="button" class="bpt-btn" :disabled="!agentOn || !agent?.ready || !!agent?.busy" @click="sendCmd('daylist')">기일목록수집</button>
            <button type="button" class="bpt-btn" :disabled="!agentOn || !agent?.ready || !!agent?.busy || !/(동|가|읍|면|리)$/.test(dongFilter.trim())" @click="sendCmd('hits')">조회수수집</button>
          </div>
          <div class="bpt-prog">
            <p v-if="agentOn && agent?.busy && agent?.target" class="bpt-target">수집 중인 곳 <b>{{ agent.target }}</b></p>
            <div class="row" role="progressbar" :aria-valuenow="agent?.busy && progView ? progView.pct : 0" aria-valuemin="0" aria-valuemax="100">
              <span class="bar"><b :style="{ width: `${agent?.busy && progView ? progView.pct : progView?.pct === 100 ? 100 : 0}%` }" /></span>
              <span v-if="progView && (agent?.busy || progView.pct === 100)" class="num"><b>{{ progView.pct }}%</b></span>
              <button type="button" class="bpt-stop" :disabled="!agentOn || !agent?.busy" @click="stopCmd">{{ agentOn && agent?.busy ? '중지' : '대기중' }}</button>
            </div>
            <p v-if="progView && agent?.busy" class="bpt-sub num">{{ progView.what }}<template v-if="progView.left"> · {{ progView.left }}</template></p>
          </div>
          <p v-if="hitInfo" class="bpt-sub bpt-kv"><span class="k">조회수</span><InfoTip v-if="hitDocs.length" :rows="HIT_TIP" align="start">{{ hitInfo }}</InfoTip><template v-else>{{ hitInfo }}</template></p>
          <p v-if="hitRange" class="bpt-sub bpt-kv"><span class="k">기간</span>{{ hitRange }}</p>
          <p v-if="agentNote || (agentOn && agent?.message)" class="bpt-sub">{{ agentNote || agent?.message }}</p>
          <hr class="bpt-part" />
          <label :class="['bpt-drop', { over: dropOver }]" @dragover.prevent="dropOver = true" @dragleave="dropOver = false" @drop.prevent="onDrop">
            <span class="ic" aria-hidden="true">📂</span>
            <b>기일목록 엑셀 · CSV 파일 선택하기</b><span>또는 이 칸에 끌어다 넣어 주세요.</span>
            <input type="file" accept=".xlsx,.csv" hidden @change="onFile" />
          </label>
          <p v-if="dayName" class="bpt-sub">{{ dayName }} · {{ dayRows.length.toLocaleString('ko-KR') }}건</p>
          <p v-if="fileMsg" class="bpt-warn">{{ fileMsg }}</p>
        </div>
        <div class="bpt-box bpt-cal">
          <h3 class="bpt-colh">기일별물건
            <span v-if="dayDate" class="bpt-cal-day">매각기일 <b>{{ Number(dayDate.slice(5, 7)) }}월 {{ Number(dayDate.slice(8)) }}일 ({{ WD[new Date(`${dayDate}T00:00:00`).getDay()] }})</b><small v-if="dbInfo">{{ dbInfo }}</small></span>
            <span class="bpt-cal-reg"><button type="button" class="bpt-cal-regbtn" :aria-expanded="regOpen" @click="regOpen = !regOpen">법원 {{ regLabel }} ▾</button>
              <div v-if="regOpen" class="bpt-cal-regmenu">
                <label><input type="checkbox" :checked="regAllOn" @change="regToggleAll" /> 전체</label>
                <label v-for="r in allRegions" :key="r"><input v-model="calRegions" type="checkbox" :value="r" /> {{ r }}</label>
              </div></span>
            <span class="bpt-cal-nav"><button type="button" aria-label="이전 달" @click="calStep(-1)">‹</button><b>{{ Number(calMonth.slice(0, 4)) }}년 {{ Number(calMonth.slice(5)) }}월</b><button type="button" aria-label="다음 달" @click="calStep(1)">›</button></span>
          </h3>
          <div class="bpt-cal-grid" role="grid" :aria-label="`${calMonth} 기일별물건`">
            <span v-for="w in ['월', '화', '수', '목', '금']" :key="w" class="hd">{{ w }}</span>
            <template v-for="(wk, wi) in calWeeks" :key="wi">
              <span v-for="(c, ci) in wk" :key="`${wi}-${ci}`" class="cell-wrap">
                <button v-if="c" type="button" :class="['cell', { on: c.d === dayDate, today: c.today, has: c.lines.length || c.dongN || c.top, busy: c.busy }]" @click="dayDate = c.d">
                  <span class="dn">{{ c.day }}<small v-if="c.all" :class="['all', { busy: c.busy }]">{{ regAllOn || !calRegions.length ? '전국' : '합계' }} {{ c.all.toLocaleString('ko-KR') }}</small></span>
                  <span v-if="c.top || c.total" class="ln top">{{ c.top ? c.top.court : c.court }} {{ (c.top ? c.top.n : c.total).toLocaleString('ko-KR') }}<b v-if="c.rec" class="recchip">경쟁↓ {{ c.rec }}</b></span>
                  <template v-if="c.lines.length"><span v-for="x in c.lines" :key="x.label" class="ln">{{ x.label }}<i v-if="calDong">({{ x.dong }})</i></span></template>
                  <template v-else-if="c.top"><span v-for="x in c.top.depts" :key="x" class="ln">{{ x }}</span></template>
                  <span v-if="!c.lines.length && c.dongN" class="ln dg">{{ calDong || '동' }} {{ c.dongN }}</span>
                </button>
              </span>
            </template>
          </div>
        </div>
      </div>
    </section>

    <section v-if="dayDate && goRows.length" class="bpt-card bpt-go bpt-tight">
      <h3 class="bpt-ttl">{{ Number(dayDate.slice(5, 7)) }}월 {{ Number(dayDate.slice(8)) }}일 ({{ WD[new Date(`${dayDate}T00:00:00`).getDay()] }}) 어디로 갈까 <small>달력에서 고른 날 · 고른 지역({{ regLabel }}) 법원 중 물건 많은 순 한두 곳</small></h3>
      <div class="bpt-tbl-wrap">
        <table class="bpt-tbl bpt-gotbl">
          <colgroup><col style="width: 64px" /><col style="width: 110px" /><col style="width: 150px" /><col style="width: 260px" /><col /></colgroup>
          <thead><tr><th>순위</th><th>법원</th><th>건수</th><th>종류</th><th class="rechd"><div class="bpt-recs hd"><span>경쟁↓</span><span>사건번호</span><span>건물</span><span>차수</span><span>응찰확률 · 예상응찰</span><span>낙찰확률 50%</span><span>채권자</span></div></th></tr></thead>
          <tbody>
            <tr v-for="(g, i) in goRows" :key="g.court" :class="{ first: i === 0 }">
              <td><span :class="['bpt-rank', { one: i === 0 }]">{{ i + 1 }}순위</span></td>
              <td class="strong">{{ g.court }}</td>
              <td><span class="bpt-nb">{{ g.n.toLocaleString('ko-KR') }}<small class="bpt-at bpt-nb">{{ g.depts }}</small></span></td>
              <td class="kinds"><template v-if="g.kinds">{{ g.kinds }}</template><small v-else class="bpt-at">기일목록수집 뒤</small></td>
              <td class="recs">
                <div v-if="g.recs.length" class="bpt-recs">
                  <div v-for="r in g.recs" :key="r.key" :class="['row', { on: pick === r.key }]">   <!-- 한 사건 한 줄(subgrid) — 고른 사건은 사건별 예측 표처럼 파란 바탕 · 왼쪽 파란 막대(2026-11-19 사용자) -->
                    <span class="bpt-rec" :data-tip="REC_TIP">경쟁↓</span><button type="button" class="bpt-link" @click="pick = r.key">{{ caseLabel(r.key) }}</button><span class="pl">{{ r.place }}</span><span>{{ r.round }}차</span><span class="pb"><b>{{ pct(r.pSold) }}</b><i>·</i><em>{{ r.bids.toFixed(1) }}명</em></span><span class="nb">{{ r.bid50 != null ? won(r.bid50) : '—' }}</span><span><span v-if="isHug(r.key)" class="bpt-hug sm" data-tip="채권자 허그(주택도시보증공사)">허그</span></span>
                  </div>
                </div>
                <small v-else class="bpt-at">{{ g.listed ? '경쟁↓ 없음 · 조회수 받은 사건 중 응찰확률 30% 아래 · 예상응찰 1명 아래가 없음' : '조회수수집 뒤' }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="bpt-sub">달력의 '전국 N' = 그날 법원 물건 합계(달력의 법원 드롭다운으로 지역을 고르면 '합계 N'), 주황은 이달 많은 날 셋(물건이 많은 날일수록 입찰자가 나뉘어 가기 좋은 날 — 날을 먼저 고르고 법원은 그다음) · 건수는 탱크옥션 달력 숫자(마이가 탱크옥션을 열 때 저장) · 종류 · 사건은 그 법원 기일 목록 · 조회수를 받은 만큼만 · 한 법원에 오는 입찰자는 비슷해서 물건이 많은 날일수록 건당 경쟁이 줆 · 사건을 누르면 아래 사건별 예측 줄로</p>
    </section>

    <section v-if="items.length" class="bpt-card bpt-day">
      <div class="bpt-dayhead">
      <h3 class="bpt-h3">사건별 예측 <small v-if="useHits">{{ roundModel ? `그날 이전 ${roundModel.n.toLocaleString('ko-KR')}회차(매각 ${roundModel.nSold.toLocaleString('ko-KR')})로 배움` : '배울 회차 모자람' }}{{ leadDays ? ` · 조회수 매각 ${leadDays + 1}일 전 기준` : '' }}</small></h3>
      </div>
      <table class="bpt-dayinfo">
        <tbody>
          <tr><th>매각기일</th><td class="chips date-row"><b class="date">{{ dayDate ? `${dayDate.slice(0, 4)}년 ${Number(dayDate.slice(5, 7))}월 ${Number(dayDate.slice(8))}일 (${WD[new Date(`${dayDate}T00:00:00`).getDay()]})` : '' }}</b>
            <button type="button" :class="['bpt-fchip', 'big', { on: !fDept && !fDong }]" :disabled="!daySum.total" @click="fDept = ''; fDong = ''">전체보기<b class="all">{{ daySum.total ? daySum.total.toLocaleString('ko-KR') : daySum.mineN }}</b></button>
            <button v-for="d in daySum.depts" :key="d.k" type="button" :class="['bpt-fchip', 'big', { on: fDept === d.k && !fDong }]" @click="fDept = d.k; fDong = ''">{{ d.label }}<b class="all">{{ d.all.toLocaleString('ko-KR') }}</b><small>/ {{ daySum.total.toLocaleString('ko-KR') }}</small></button>
            <select v-model="fDong" :class="['bpt-dongsel', { on: !!fDong }]" aria-label="동 고르기">
              <option value="">모든동 {{ allDayItems.filter((it) => !fDept || deptOf(it.key) === fDept).length.toLocaleString('ko-KR') }}</option>
              <option v-for="[d, n] in dongOpts" :key="d" :value="d">{{ d }} {{ n.toLocaleString('ko-KR') }}{{ d === daySum.dong ? ' · 예측' : '' }}</option>
            </select>
            <button type="button" :class="['bpt-fchip', 'big', { on: fMine }]" :disabled="!nMine" @click="fMine = !fMine">선정물건만보기<b>{{ nMine }}</b></button>
            </td></tr>
          <tr><th>현황별 물건수</th><td class="chips">
            <button type="button" :class="['bpt-fchip', { on: !fStat }]" @click="fStat = ''">전체<b>{{ daySum.statAll }}</b><small v-if="daySum.total">/ {{ daySum.scopeN.toLocaleString('ko-KR') }}</small></button>
            <button v-for="s in daySum.stats" :key="s.k" type="button" :class="['bpt-fchip', { on: fStat === s.k }]" :disabled="!s.mine" @click="pickF('stat', s.k)">{{ s.k }}<b>{{ s.mine }}</b><small v-if="daySum.total">/ {{ s.all.toLocaleString('ko-KR') }}</small></button></td></tr>
          <tr><th>종류별 물건수</th><td class="chips">
            <button type="button" :class="['bpt-fchip', { on: !fKind }]" @click="fKind = ''">전체<b>{{ daySum.kindAll }}</b><small v-if="daySum.total">/ {{ daySum.scopeN.toLocaleString('ko-KR') }}</small></button>
            <button v-for="k in daySum.kinds" :key="k.k" type="button" :class="['bpt-fchip', { on: fKind === k.k }]" :disabled="!k.mine" @click="pickF('kind', k.k)">{{ k.k }}<b>{{ k.mine }}</b><small v-if="daySum.total">/ {{ k.all.toLocaleString('ko-KR') }}</small></button></td></tr>
          <!-- 채권자별 물건수 줄은 뺐다(2026-11-17 사용자 — 허그는 경쟁 대상이 아니라 거를 까닭이 없다). fCred 는 코드만 남김 -->
        </tbody>
      </table>
      <p class="bpt-sub">예측 · {{ daySum.dong }}만(다른 동은 목록만, 구현 예정) · / 뒤 숫자 · 그날 법원 전체(고른 계)</p>
      <!-- 사건 상세 — 필터 아래 · 표 위(2026-11-17 사용자: 줄을 누르면 내비게이터처럼 위에서 바로 보이게). 응찰 인원 확률 막대 · 입찰가별 낙찰확률 그래프는 뺌(위 칸 · 아래 표와 겹침) -->
      <div v-if="sel && selP && sel.target" class="bpt-detail">
        <h3 class="bpt-h3">{{ caseLabel(sel.key) }} <small>{{ sel.addr }}</small> <button type="button" class="bpt-x" aria-label="상세 닫기" @click="pick = ''">✕</button></h3>
      <div class="bpt-flow">
          <!-- 왼쪽 두 칸을 한 상자로 — 위 누적 조회수 · 아래 예상 응찰 인원, 가운데 가로 가름선(2026-11-19 사용자 시안 A) -->
          <div class="bpt-tile bpt-stack">
            <div class="h"><span>전일까지 누적 조회수</span><b>{{ sel.views.toLocaleString('ko-KR') }}회</b><small>{{ useHits ? `${sel.viewAt.slice(5).replace('-', '.')}까지 · 그날 이전 ${selP.vmN.toLocaleString('ko-KR')}회차로 배움` : selP.vmN ? `조회수 규칙 ${selP.vmN}건으로 배움` : '조회수 규칙 없음(6건 이상 필요)' }}</small></div>
            <div class="h"><span>예상 응찰 인원</span><b>{{ selP.expBids != null ? `약 ${Math.round(selP.expBids)}명` : BAND_NAMES[selP.piBefore.indexOf(Math.max(...selP.piBefore))] + ' 가장 흔함' }}</b><small>{{ selP.p0 != null ? `${useHits ? '매각된다고 칠 때 · ' : ''}유찰 확률 ${pct(selP.p0)}` : `비슷한 물건 ${selP.simN}건${selP.loose ? '(조건 넓힘)' : ''}` }}</small></div>
          </div>
          <div class="bpt-tile key wide"><span>입찰가별 낙찰확률(입찰자가 있을 때)</span>
            <!-- 온도계꼴(2026-11-18 사용자 시안 A): 네 칸(50 · 60 · 70 추천 · 80)의 가운데가 밑 슬라이더 눈금 바로 위, 슬라이더는 1%씩 · 말풍선은 막대 아래 눈금 줄. 표기는 탱크옥션처럼 '금액 (감정가 대비 %)' -->
            <div class="bpt-qs">
              <div v-for="q in Q_CELLS" :key="q" :class="['bpt-q', { on: Math.round(q * 100) === qPct }]" :style="{ left: `${(q - 0.5) / 0.3 * 100}%` }" role="button" tabindex="0" @click="qPct = Math.round(q * 100)" @keydown.enter="qPct = Math.round(q * 100)">
                <span v-if="q === 0.7" class="p">추천</span><b class="w">{{ won(qOf(sel, q)) }} <small>({{ apprPct(qOf(sel, q), sel.target.appr) }})</small></b>
              </div>
            </div>
            <div class="bpt-qsl">
              <div class="bar"><span class="k"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>낙찰확률</span><input v-model.number="qPct" type="range" min="50" max="80" step="1" aria-label="낙찰확률" /><span class="bub" :style="{ left: `${(qPct - 50) / 30 * 100}%` }">{{ qPct }}%</span></div>
              <div class="tk"><span v-for="t in [50, 55, 60, 65, 70, 75, 80]" :key="t" :class="{ b: t % 10 === 0 }" :style="{ left: `${(t - 50) / 30 * 100}%` }"><i />{{ t }}%</span></div>
            </div>
            <!-- 세 칸 카드(2026-11-19 사용자 시안 A) — 숫자 같은 크기, 퍼센트는 숫자 왼쪽, 입찰가 칸만 파랑. 바뀌는 값은 31개 값을 겹쳐 가장 넓은 폭(흔들림 없게) -->
            <div class="bpt-qout3">
              <div class="c"><span class="l">감정가</span><span class="v"><small>100%</small>{{ won(sel.target.appr) }}</span><span class="d">법원 감정</span></div>
              <div class="c"><span class="l">최저가<span class="rd">{{ sel.target.round + 1 }}차</span></span><span class="v"><small>{{ apprPct(sel.target.min, sel.target.appr) }}</small>{{ won(sel.target.min) }}</span><span class="d">감정가보다 {{ won(sel.target.appr - sel.target.min) }} 낮음</span></div>
              <div class="c bid"><span class="l">입찰가 · 낙찰확률 {{ qPct }}%</span><span class="v"><small class="fx"><i v-for="v in 31" :key="v" aria-hidden="true">{{ apprPct(qOf(sel, (v + 49) / 100), sel.target.appr) }}</i><em>{{ apprPct(qOf(sel, qPct / 100), sel.target.appr) }}</em></small><span class="fx"><i v-for="v in 31" :key="v" aria-hidden="true">{{ won(qOf(sel, (v + 49) / 100)) }}</i><em>{{ won(qOf(sel, qPct / 100)) }}</em></span></span><span class="d">최저가 <span class="fx lt"><i v-for="v in 31" :key="v" aria-hidden="true">{{ signWon(qOf(sel, (v + 49) / 100) - sel.target.min) }}</i><em>{{ signWon(qOf(sel, qPct / 100) - sel.target.min) }}</em></span></span></div>
            </div>
            <small v-if="sel.result && sel.result.sold > 0">{{ `실제 ${won(sel.result.sold)}${hugWon(sel.key) ? '(허그)' : ''} — ${winAt(sel) == null ? '' : winAt(sel)! <= 0.7 ? '70% 추천가로 이김' : winAt(sel)! <= 0.8 ? '70% 추천가로는 짐, 80% 입찰가면 이김' : '80% 입찰가로도 짐'}` }}</small></div>
        </div>
      </div>
      <div class="table-wrap bpt-tbl-wrap">
        <table class="bpt-tbl fixed">
          <!-- 칸 너비 고정 — 동 · 기일을 바꿔도 표가 흔들리지 않게. 칸마다 가장 넓은 내용(검암동 · 11-13 · 17 · 20 에서 잼) + 같은 여백 15px(정렬 머리는 화살표 자리 14px 더), 주소는 남는 폭(2026-11-17 사용자: 간격 균일) -->
          <colgroup><col style="width: 80px" /><col style="width: 170px" /><col style="width: 57px" /><col style="width: 73px" /><col style="width: 56px" /><col style="width: 65px" /><col style="width: 88px" /><col style="width: 51px" /><col style="width: 92px" /><col style="width: 58px" /><col style="width: 50px" /><col style="width: 94px" /><col style="width: 59px" /><col style="width: 92px" /><col style="width: 80px" /></colgroup>   <!-- 70 · 80% 칸 뺀 뒤 주소 폭을 줄여 다른 칸에 고르게(2026-11-17 사용자) -->
          <thead><tr><th class="sort" @click="sortBy('key')">사건번호<i :class="['ar', { on: sortKey === 'key' }]">{{ sortKey === 'key' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="hd-addr">주소</th><th class="sort" @click="sortBy('year')">연식<i :class="['ar', { on: sortKey === 'year' }]">{{ sortKey === 'year' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="sort" @click="sortBy('area')">전용<i :class="['ar', { on: sortKey === 'area' }]">{{ sortKey === 'area' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th>엘베</th><th class="r sort" @click="sortBy('views')">조회수<br>조회일<i :class="['ar', { on: sortKey === 'views' }]">{{ sortKey === 'views' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r sort" @click="sortBy('appr')">감정가<i :class="['ar', { on: sortKey === 'appr' }]">{{ sortKey === 'appr' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="sort" @click="sortBy('round')">차수<i :class="['ar', { on: sortKey === 'round' }]">{{ sortKey === 'round' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r sort" @click="sortBy('min')">최저가<i :class="['ar', { on: sortKey === 'min' }]">{{ sortKey === 'min' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="sort" @click="sortBy('pSold')">응찰<br>확률<i :class="['ar', { on: sortKey === 'pSold' }]">{{ sortKey === 'pSold' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r sort" @click="sortBy('bids')">예상<br>응찰<i :class="['ar', { on: sortKey === 'bids' }]">{{ sortKey === 'bids' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r sort" :data-tip="Q_TIP" @click="sortBy('pred')">낙찰확률<br>50%<i :class="['ar', { on: sortKey === 'pred' }]">{{ sortKey === 'pred' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r sort" @click="sortBy('actBids')">실제<br>응찰<i :class="['ar', { on: sortKey === 'actBids' }]">{{ sortKey === 'actBids' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r sort" @click="sortBy('sold')">실제<br>낙찰가<i :class="['ar', { on: sortKey === 'sold' }]">{{ sortKey === 'sold' ? (sortDir > 0 ? '▲' : '▼') : '↕' }}</i></th><th class="r">차이</th></tr></thead>
          <tbody>
            <tr v-for="it in shownItems" :key="it.key" :class="{ on: pick === it.key, off: !preds.has(it.key), rec: isRec(it.key) }" @click="pick = pick === it.key ? '' : it.key">
              <td><button type="button" class="bpt-link two" @click.stop="pick = it.key">{{ it.key.slice(0, 4) }}타경<br>{{ it.key.slice(5) }}</button><span v-if="isRec(it.key)" class="bpt-rec under" :data-tip="REC_TIP">경쟁↓</span></td>   <!-- 두 줄 — 타경 밑에 번호(칸을 좁혀 감정가 칸 자리, 2026-11-17 사용자) -->
              <td class="l addr" :data-tip="it.addr || undefined" data-tip-trunc><button v-if="it.addr" type="button" :class="['bpt-copy', { done: copiedKey === it.key }]" :data-tip="copiedKey === it.key ? '복사됨' : '주소복사'" :aria-label="`${caseLabel(it.key)} 주소 복사`" @click.stop="copyAddr(it)"><svg v-if="copiedKey !== it.key" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg><svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg></button><span v-if="it.addr" class="a2"><span class="ln">{{ addrLines(it.addr)[0] }}</span><span v-if="addrLines(it.addr)[1]" class="ln">{{ addrLines(it.addr)[1] }}</span></span><template v-else>—</template></td>
              <td>{{ yearShow(it) ? `${yearShow(it)}` : '—' }}<small v-if="yearShow(it)" class="bpt-at">{{ buildingAgeOf(yearShow(it)!) }}년차</small></td>
              <td><template v-if="it.target?.area">{{ /아파트/.test(kindOf(it)) ? '—' : `${it.target.area.toFixed(2)}㎡` }}<small class="bpt-at">{{ /아파트/.test(kindOf(it)) ? `(${it.target.area.toFixed(2)})` : `${(it.target.area / 3.305785).toFixed(2)}평` }}</small></template><template v-else>—</template></td>
              <td><span v-if="elevOf(it.addr) === undefined" class="ev u">·</span><span v-else-if="elevOf(it.addr) === null" class="ev u" title="건축물대장을 찾지 못했습니다">-</span><span v-else-if="elevOf(it.addr)! > 0" class="ev o two">{{ elevOf(it.addr) }}대<br>있음</span><span v-else class="ev x">없음</span></td>
              <td v-if="!it.viewAt" class="r">—</td>
              <td v-else class="r">{{ it.views.toLocaleString('ko-KR') }}<small :class="['bpt-at', { after: stale(it.viewAt) }]">{{ it.viewAt === dayDate ? '당일' : `${stale(it.viewAt) ? '~' : ''}${it.viewAt.slice(5).replace('-', '.')}` }}</small></td>
              <td class="r"><span v-if="it.target?.appr" class="bpt-nb">{{ won(it.target.appr) }}</span><template v-else>—</template></td>
              <td>{{ it.target ? `${it.target.round + 1}차` : '—' }}</td>
              <td class="r"><span v-if="it.target" class="bpt-nb">{{ won(it.target.min) }}<small v-if="it.target.appr" class="bpt-at bpt-nb">{{ apprPct(it.target.min, it.target.appr) }}</small></span><template v-else>자료 없음</template></td>
              <td>{{ sellOf(it.key) ? pct(sellOf(it.key)!.pSold) : '—' }}</td>
              <td class="r">{{ sellOf(it.key) ? `${sellOf(it.key)!.expBids.toFixed(1)}명` : '—' }}</td>
              <td v-if="preds.get(it.key)" class="r strong"><span class="bpt-nb">{{ won((preds.get(it.key)!.after ?? preds.get(it.key)!.before).median) }}<small v-if="it.target?.appr" class="bpt-at bpt-nb">{{ apprPct((preds.get(it.key)!.after ?? preds.get(it.key)!.before).median, it.target.appr) }}</small></span></td>
              <td v-else>—</td>
              <td class="r">{{ it.result ? (it.result.sold > 0 ? (it.result.bids ? `${it.result.bids}명` : '모름') : '유찰') : '입찰 전' }}</td>
              <td class="r act-sold"><span v-if="it.result && it.result.sold > 0" class="bpt-nb">{{ won(it.result.sold) }}<small v-if="it.target?.appr" class="bpt-at bpt-nb"><span v-if="hugWon(it.key)" class="bpt-hug sm" :data-tip="HUG_WON_TIP">허그</span>{{ apprPct(it.result.sold, it.target.appr) }}</small></span><template v-else>—</template></td>
              <td v-if="it.result && it.result.sold > 0 && preds.get(it.key)" class="r"><span class="bpt-nb">{{ signWon(it.result.sold - (preds.get(it.key)!.after ?? preds.get(it.key)!.before).median) }}<small class="bpt-at bpt-nb">{{ sgn(it.result.sold / (preds.get(it.key)!.after ?? preds.get(it.key)!.before).median - 1) }}</small></span></td>
              <td v-else class="r">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="useHits" class="bpt-sub">경쟁↓ · 응찰확률 30% 아래 · 예상응찰 1명 아래(채권자는 가리지 않음 — 사람이 안 들어오면 최저가로 낙찰) · 머리글 ▲▼ 로 정렬, 처음은 응찰확률 낮은 순 · 허그 · 실제 낙찰자가 허그(주택도시보증공사)면 실제 낙찰가 % 앞에 칩 · 조회일 · 누적에 넣은 마지막 날 · 빨간 '~11.14'는 그날까지만 모은 것(매각 전날까지 못 모음), 조회수수집 다시 · 예상응찰 · 입찰자 있을 때 · 신건은 확률만 · 낙찰확률 50% · 입찰자가 있을 때 절반 확률로 이기는 입찰가(아래 입찰가별 낙찰확률 표와 같은 값), 70 · 80%는 줄을 눌러 상세 · 아래 표에서 · 차이 · 실제 낙찰가 − 낙찰확률 50% 입찰가 · 줄 누르면 자세히</p>
      <p v-else class="bpt-sub">낙찰확률 50% · 조회수 규칙 반영(없으면 비슷한 물건 인원 비율) · 줄 누르면 자세히</p>
    </section>

    <section v-if="dayDate" class="bpt-card">
      <h3 class="bpt-h3">DB에 들어 있는 목록 <small>{{ dayDate }} · {{ dongFilter.trim() || '전체' }} {{ dbList.length.toLocaleString('ko-KR') }}건 / 이 날 전체 {{ dbRows.length.toLocaleString('ko-KR') }}건</small> <button type="button" class="bpt-fold" :aria-expanded="dbOpen" @click="dbOpen = !dbOpen">{{ dbOpen ? '접기' : '펼치기' }}</button></h3>
      <template v-if="dbOpen">
      <div v-if="dbList.length" class="table-wrap bpt-tbl-wrap bpt-scroll">
        <table class="bpt-tbl">
          <thead><tr><th>사건번호</th><th class="l">주소</th><th class="r">조회수</th><th>종류</th><th>진행상태</th><th>넣은 곳</th></tr></thead>
          <tbody>
            <tr v-for="d in dbList" :key="d.key" class="ro">
              <td>{{ caseLabel(d.key) }}</td>
              <td class="l addr" :data-tip="d.addr || undefined" data-tip-trunc>{{ d.addr || '—' }}</td>
              <td class="r">{{ d.v ? d.v.n.toLocaleString('ko-KR') : '—' }}<small v-if="d.v" :class="['bpt-at', { after: d.v.after }]">{{ d.v.at === dayDate ? '당일' : d.v.at.slice(5).replace('-', '.') }}{{ d.v.after ? ' 매각 뒤' : '' }}</small></td>
              <td>{{ d.kind || '—' }}</td>
              <td>{{ d.status || '—' }}</td>
              <td>{{ d.from }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="bpt-sub">이 날 목록 없음 · 기일목록수집 또는 CSV 파일 넣기</p>
      <p class="bpt-sub">조회수 · 가장 늦게 모은 값(아래 모은 날) · 매각 뒤 값은 예측에 안 씀 · CSV엔 조회수 없음</p>
      </template>
    </section>

    <!-- 채점은 맨 아래 — 평소 볼 건 아니고 모델이 계속 맞는지 볼 때만(2026-11-17 사용자) -->
    <section class="bpt-card bpt-tight">
      <div class="bpt-grade-head">
        <h3 class="bpt-h3">채점 <small>기간 안 모든 회차 · 그날 이전 자료로만</small></h3>
        <div class="bpt-range"><input v-model="gradeFrom" type="date" aria-label="채점 시작일" /><span>~</span><input v-model="gradeTo" type="date" aria-label="채점 끝일" /></div>
        <button type="button" class="bpt-btn line" :disabled="extBusy || !hitRounds.length || !recs.length" @click="loadExt">{{ extBusy ? '받는중' : '엘베자료' }}</button>
        <button type="button" class="bpt-btn" :disabled="grading || !hitRounds.length" @click="runGrade">{{ grading ? '채점하는중' : '채점하기' }}</button>
      </div>
      <p v-if="extMsg" class="bpt-sub">엘베 · 세대수 · {{ extMsg }}{{ extReady ? ' · 채점하기를 누르면 + 엘베 칸이 같이 나옵니다' : '' }}</p>
      <p v-if="gradeMsg" class="bpt-sub">{{ gradeMsg }}</p>
      <p v-else-if="!hitRounds.length" class="bpt-sub">사건 차트 없음 · 동선택에 동을 적고 조회수수집 먼저</p>
      <template v-if="grade">
        <div class="bpt-grade">
          <div class="bpt-tile"><span>맞힌 회차</span><b>{{ grade.total.n.toLocaleString('ko-KR') }}회차</b><small>매각 {{ grade.total.sold.toLocaleString('ko-KR') }} · 유찰 {{ (grade.total.n - grade.total.sold).toLocaleString('ko-KR') }}{{ grade.skipped ? ` · 배울 자료 모자라 뺌 ${grade.skipped}` : '' }}</small></div>
          <div class="bpt-tile key"><span>매각 · 유찰 맞힘</span><b>{{ rate(grade.total.sell[1], grade.total.n) }}</b><small>조회수 없이 {{ rate(grade.total.sell[0], grade.total.n) }}<template v-if="grade.total.ext"> · + 엘베 <b>{{ rate(grade.total.sell[2], grade.total.n) }}</b></template></small></div>
          <div class="bpt-tile key"><span>인원 구간 맞힘(매각된 것)</span><b>{{ rate(grade.total.band[1], grade.total.nb) }}</b><small>조회수 없이 {{ rate(grade.total.band[0], grade.total.nb) }}<template v-if="grade.total.ext"> · + 엘베 <b>{{ rate(grade.total.band[2], grade.total.nb) }}</b></template></small></div>
          <div class="bpt-tile key"><span>낙찰가 평균 차이</span><b>{{ errPct(grade.total.err[1], grade.total.np) }}</b><small>조회수 없이 {{ errPct(grade.total.err[0], grade.total.np) }}<template v-if="grade.total.ext"> · + 엘베 <b>{{ errPct(grade.total.err[2], grade.total.np) }}</b></template> · {{ grade.total.np }}건</small></div>
          <div class="bpt-tile key"><span>예상범위 안</span><b>{{ rate(grade.total.inR[1], grade.total.np) }}</b><small>조회수 없이 {{ rate(grade.total.inR[0], grade.total.np) }}<template v-if="grade.total.ext"> · + 엘베 <b>{{ rate(grade.total.inR[2], grade.total.np) }}</b></template> · 50%가 정상</small></div>
        </div>
        <div class="table-wrap bpt-tbl-wrap bpt-scroll">
          <table class="bpt-tbl bpt-gradetbl">
            <thead><tr><th>매각기일</th><th class="r">회차</th><th class="r">매각</th><th class="r">매각 · 유찰 맞힘</th><th class="r">인원 구간 맞힘</th><th class="r">낙찰가 평균 차이</th><th class="r">예상범위 안</th></tr></thead>
            <tbody>
              <tr v-for="g in grade.days" :key="g.date" :class="{ on: g.date === dayDate }" @click="goDay(g.date)">
                <td><button type="button" class="bpt-link" @click.stop="goDay(g.date)">{{ g.date }}</button></td>
                <td class="r">{{ g.n }}</td>
                <td class="r">{{ g.sold }}</td>
                <td class="r">{{ rate(g.sell[1], g.n) }}<small class="bpt-at">없이 {{ rate(g.sell[0], g.n) }}</small></td>
                <td class="r">{{ rate(g.band[1], g.nb) }}<small class="bpt-at">없이 {{ rate(g.band[0], g.nb) }}</small></td>
                <td class="r">{{ errPct(g.err[1], g.np) }}<small class="bpt-at">없이 {{ errPct(g.err[0], g.np) }}</small></td>
                <td class="r">{{ g.np ? `${g.inR[1]} / ${g.np}` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="bpt-sub">{{ grade.from }} ~ {{ grade.to }} · 기일 {{ grade.days.length }}개 · 줄 누르면 그날 사건별 예측 · 실제응찰을 알아도 낙찰가 차이 약 7%(1등 금액은 사람마다 다름)</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.bpt { display: flex; flex-direction: column; gap: 12px; }
.bpt-card { background: #fff; border: 1px solid #e3e7ee; border-radius: 14px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.bpt-head { display: flex; align-items: center; gap: 8px; }
.bpt-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #213366; }
.bpt-note { margin-left: auto; font-size: 12px; color: #4b5563; }
.bpt-in { display: flex; gap: 12px; flex-wrap: wrap; }
.bpt-box { border: 1px solid #e3e7ee; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 260px; }
.bpt-box.grow { flex: 1 1 420px; }
.bpt-pair { display: flex; flex-wrap: wrap; gap: 8px 14px; }   /* 법원 · 동선택 한 줄 */
/* 수집 상자 — 법원 · 동선택 칸이 기간 줄 오른쪽 끝까지 고르게(2026-11-17 사용자): 이름표 · 칸 · 이름표 · 칸 격자, 두 칸 같은 폭 */
.bpt-colbox .bpt-pair { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; }
.bpt-colbox .bpt-pair .bpt-date { display: contents; }
.bpt-colbox .bpt-pair .court { width: 100%; min-width: 0; }
/* 수집 상자 — 폭은 법원 · 동선택 줄이 정한다. 기간 · 단추 · 진행줄 · 안내 · 파일 칸은 그 오른쪽 끝(검암동 칸 끝)까지만 늘고 글은 그 안에서 줄내림 */
.bpt-colbox { flex: none; width: 394px; }   /* 폭 고정 — 법원 · 동선택 칸이 늘어나는 격자라 max-content 로는 폭을 못 정한다 */
.bpt-colbox > :not(.bpt-pair):not(.bpt-colh) { contain: inline-size; }
.bpt-colbox .bpt-range { flex: 1 1 auto; min-width: 0; }
.bpt-colbox .bpt-range input { flex: 1 1 0; min-width: 0; }
.bpt-colbox .bpt-btns > .bpt-btn { flex: 1 1 0; padding: 0 6px; white-space: nowrap; }
.bpt-colbox .bpt-drop { flex: 1 1 auto; align-content: center; }   /* 파일 칸 아래 끝 = 오른쪽 기일별물건 달력표 아래 끝 */
.bpt-part { width: 100%; margin: 6px 0 2px; border: 0; border-top: 1px solid #e3e7ee; }   /* 기일목록 · 조회수 수집 아래 — 기일목록 파일 칸 가름줄 */
.bpt-kv { display: flex; gap: 8px; }
.bpt-kv > .k { flex: none; width: 3.2em; color: #9ca3af; }   /* 조회수 · 기간 이름표 */
.bpt-cal { flex: 1 1 370px; min-width: 370px; }   /* 기일 달력 — 기일 목록 · 조회수 수집 오른쪽 */
.bpt-cal-reg { margin-left: auto; position: relative; }
.bpt-cal-regbtn { height: 26px; padding: 0 10px; border: 1px solid #d5dbe5; border-radius: 6px; background: #fff; color: #213366; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.bpt-cal-regmenu { position: absolute; right: 0; top: 30px; z-index: 20; min-width: 150px; padding: 6px 4px; background: #fff; border: 1px solid #d5dbe5; border-radius: 8px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12); display: flex; flex-direction: column; }
.bpt-cal-regmenu label { display: flex; align-items: center; gap: 6px; padding: 5px 8px; font-size: 13px; color: #374151; cursor: pointer; border-radius: 6px; }
.bpt-cal-regmenu label:hover { background: #f4f6fa; }
.bpt-cal-regmenu label:first-child { font-weight: 700; border-bottom: 1px solid #eef1f6; border-radius: 6px 6px 0 0; margin-bottom: 2px; }
.bpt-cal-nav { margin-left: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: #111827; }
.bpt-cal-day { font-size: 13px; font-weight: 400; color: #374151; margin-left: 4px; }   /* 고른 매각기일 — 기일별물건 제목 오른쪽(날짜 칸 걷음, 달력에서 고른다) */
.bpt-cal-day b { color: #2b6df3; font-weight: 700; }
.bpt-cal-day small { margin-left: 8px; font-size: 13px; color: #6b7280; }   /* 그날 기일목록 — '인천-본원 5계 · 8계 370건' */
.bpt-cal-nav button { width: 24px; height: 24px; border: 1px solid #d5dbe5; border-radius: 6px; background: #fff; color: #374151; font: inherit; font-size: 14px; line-height: 1; cursor: pointer; padding: 0; }
.bpt-cal-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid #e3e7ee; border-radius: 8px; overflow: hidden; }
.bpt-cal-grid .hd { background: #f4f6fa; font-size: 12px; font-weight: 700; color: #374151; text-align: center; padding: 6px 0; border-bottom: 1px solid #e3e7ee; }
.bpt-cal-grid .cell-wrap { border-right: 1px solid #eef1f6; border-bottom: 1px solid #eef1f6; min-height: 68px; display: flex; }   /* 안내 줄을 걷고 칸을 넉넉히 */
.bpt-cal-grid .cell-wrap:nth-child(5n) { border-right: 0; }
.bpt-cal-grid .cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 7px 9px; border: 0; border-radius: 0; background: #fff; font: inherit; font-size: 12px; color: #374151; text-align: left; cursor: pointer; }
.bpt-cal-grid .cell:hover { background: #f5f8ff; }
.bpt-cal-grid .cell .dn { font-weight: 700; color: #111827; display: flex; gap: 4px; align-items: baseline; white-space: nowrap; }
.bpt-cal-grid .cell .dn small { font-size: 12px; font-weight: 400; color: #c4392f; }
.bpt-cal-grid .cell .ln { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; letter-spacing: -0.4px; }   /* '본원 13계(1)' 이 칸 안에 들게 */
.bpt-cal-grid .cell .ln i { font-style: normal; color: #1f5fe0; margin-left: 1px; }
.bpt-cal-grid .cell .ln.dg { color: #1f5fe0; }
.bpt-cal-grid .cell.today .dn { color: #1f5fe0; }
.bpt-cal-grid .cell.on { background: #eaf1ff; box-shadow: inset 0 0 0 2px #2b6df3; }
.bpt-cal-grid .cell:not(.has) { color: #9ca3af; }
.bpt-box h3, .bpt-h3 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }
.bpt-h3 small { margin-left: 6px; font-size: 12px; font-weight: 400; color: #4b5563; }
.bpt-sub { margin: 0; font-size: 12px; color: #4b5563; }
.bpt-warn { margin: 0; font-size: 12px; color: #c4392f; }
/* 기일 목록 파일 칸 — 권리분석 서류 올리기(.rt-drop)와 같은 꼴(2026-11-15 사용자) */
.bpt-drop { display: grid; justify-items: center; gap: 6px; padding: 22px 12px; border: 1.5px dashed var(--line-2, #d5dbe5); border-radius: 10px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
.bpt-drop .ic { font-size: 32px; line-height: 1; filter: grayscale(1); opacity: .55; transition: filter .15s, opacity .15s; }
.bpt-drop:hover .ic, .bpt-drop.over .ic { filter: none; opacity: 1; }
.bpt-drop b { font-size: 14px; font-weight: 700; color: var(--text, #111827); }
.bpt-drop span:not(.ic) { font-size: 12px; line-height: 1.6; color: var(--muted, #6b7280); }
.bpt-drop:hover, .bpt-drop.over { border-color: var(--blue, #2b6df3); background: var(--blue-soft, #eef3ff); }
.bpt-date { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.bpt-date input { height: 32px; border: 1px solid #d5dbe5; border-radius: 8px; padding: 0 8px; font: inherit; }
.bpt textarea { width: 100%; box-sizing: border-box; border: 1px solid #d5dbe5; border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; line-height: 1.6; resize: vertical; }
.bpt textarea:focus, .bpt textarea:not(:placeholder-shown) { border-color: #2b6df3; outline: none; }
.bpt-tbl-wrap { border: 1px solid #e3e7ee; border-radius: 8px; overflow: auto; background: #fff; box-shadow: none; }   /* 웹 공통 .table-wrap(표 안 말풍선용)을 같이 달았다 — 그림자는 뺀다 */
.bpt-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.bpt-tbl th { background: #f4f6fa; font-weight: 700; color: #374151; padding: 8px 10px; white-space: nowrap; border-bottom: 1px solid #e3e7ee; }
.bpt-tbl td { padding: 7px 10px; border-bottom: 1px solid #eef1f6; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bpt-tbl tr:last-child td { border-bottom: 0; }
.bpt-day .bpt-tbl th, .bpt-day .bpt-tbl td { padding-left: 5px; padding-right: 5px; text-align: center; }   /* 1440 화면 안에 들게 — 칸 폭 합 1,236 px, 화면 1280 */   /* 사건별 예측은 머리 · 내용 모두 가운데(2026-11-14 사용자) */
.bpt-day .bpt-tbl td.act-sold { font-weight: 700; }
/* 추천 줄 · 칩 — 조회수로 본 경쟁 적은 사건(2026-11-16) */
.bpt-tbl td .bpt-rec, .bpt-recs .bpt-rec { display: inline-flex; align-items: center; justify-content: center; height: 20px; padding: 0 6px; border-radius: 4px; background: #e8f7ee; color: #15803d; font-size: 12px; font-weight: 700; white-space: nowrap; }
.bpt-tbl td .bpt-rec.under { display: block; width: max-content; margin: 2px auto 0; height: 18px; line-height: 18px; }   /* 사건번호 아래 한 줄 — 칸을 따로 두지 않는다(표가 옆으로 넘치지 않게) */
.bpt-day .bpt-tbl tbody tr.rec td { background: #f3fbf6; }
.bpt-day .bpt-tbl tbody tr.rec.on td { background: #fff1f3; }
/* 정렬 머리글 */
.bpt-tbl th.sort { cursor: pointer; user-select: none; }
.bpt-tbl th.sort:hover { background: #e9edf5; }
.bpt-tbl th .ar { font-style: normal; margin-left: 3px; font-size: 12px; color: #9ca3af; }
.bpt-tbl th .ar.on { color: #2b6df3; }
.bpt-day .bpt-tbl th.sort { position: relative; padding-right: 14px; }   /* 화살표를 오른쪽 끝에 띄워 두 줄 머리(조회수 / 조회일)가 가운데 그대로 맞게(2026-11-16 사용자) */
.bpt-day .bpt-tbl th.sort .ar { position: absolute; right: 1px; top: 50%; transform: translateY(-50%); margin: 0; }
.bpt-fnote { font-size: 12px; color: #6b7280; align-self: center; }
/* 달력 — 전국 합계 · 많은 날 */
.bpt-cal-grid .cell .dn small.all { color: #6b7280; }
.bpt-cal-grid .cell .dn small.all.busy { color: #c2410c; font-weight: 700; }
.bpt-cal-grid .cell .ln.top { font-weight: 700; color: #213366; }
.bpt-cal-grid .cell .ln .recchip { display: inline-block; margin-left: 5px; padding: 0 5px; border-radius: 4px; background: #e8f7ee; color: #15803d; font-size: 12px; font-weight: 700; line-height: 17px; vertical-align: 1px; }
/* 어디로 갈까 */
.bpt-go .bpt-ttl { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }   /* h3 기본 여백(위아래 16px)을 걷어 다른 상자 제목과 같은 간격(2026-11-17 사용자) */
.bpt-go .bpt-ttl small { font-size: 12px; font-weight: 400; color: #6b7280; margin-left: 8px; }
.bpt-recs .pb { display: grid; grid-template-columns: 36px 16px 44px; align-items: baseline; font-variant-numeric: tabular-nums; }   /* 응찰확률 · 예상응찰 — % 끝자리 · 명 끝자리 세로로 맞춤 */
.bpt-recs .pb b { text-align: right; }
.bpt-recs .pb i { text-align: center; font-style: normal; color: #9ca3af; }
.bpt-recs .pb em { text-align: right; font-style: normal; }
.bpt-gotbl th, .bpt-gotbl td { text-align: center; vertical-align: middle; }   /* 말머리와 내용 중앙 맞춤(2026-11-16 사용자) */
.bpt-gotbl td.kinds, .bpt-gotbl td.recs { white-space: normal; }   /* 종류 · 추천 칸은 칸 안에서 줄을 바꾼다(표가 옆으로 넘치지 않게) */
.bpt-gotbl th.rechd { padding-left: 10px; padding-right: 10px; }
.bpt-recs.hd span { text-align: center; white-space: nowrap; font-weight: 700; color: #374151; }
.bpt-gotbl tbody tr.first td { background: #f3fbf6; }
/* 채점 · 어디로 갈까 — 세로 여백 줄임(2026-11-17 사용자): 상자 안 간격 8, 칸 위아래 4, 두 줄 칸 줄간 1.25, 추천 줄 사이 1 */
.bpt-card.bpt-tight { gap: 8px; }
.bpt-tight .bpt-tbl th { padding-top: 6px; padding-bottom: 6px; }
.bpt-tight .bpt-tbl td { padding-top: 4px; padding-bottom: 4px; line-height: 1.25; }
.bpt-tight .bpt-grade .bpt-tile { padding: 7px 12px; gap: 1px; }
.bpt-tight .bpt-recs { gap: 1px 8px; }
.bpt-rank { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 4px; background: #eef3ff; color: #1d4ed8; font-size: 12px; font-weight: 700; }
.bpt-rank.one { background: #e8f7ee; color: #15803d; }
.bpt-recs { display: grid; grid-template-columns: 52px 112px minmax(140px, 1fr) 36px 150px 104px 44px; gap: 3px 8px; align-items: center; justify-items: center; font-size: 12.5px; }   /* 말머리(hd)와 줄이 같은 칸 폭 — 세로로 맞는다 */
.bpt-recs .pl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.bpt-recs .nb { font-variant-numeric: tabular-nums; }
.bpt-recs > .row { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; justify-items: center; border-radius: 4px; }
.bpt-recs > .row.on { background: #e8effd; box-shadow: inset 3px 0 0 #2b6df3; }   /* 고른 사건 — 사건별 예측 표의 고른 줄과 같은 왼쪽 파란 막대 */
/* 허그 칩(남색) — 실제 낙찰가 % 앞(허그가 직접 낙찰) · 어디로 갈까 채권자 칸에 작게(2026-11-17 사용자) */
.bpt-tbl td .bpt-hug { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #213366; color: #fff; font-size: 12px; font-weight: 700; line-height: 16px; margin-bottom: 2px; }
.bpt-tbl td .bpt-hug.sm { padding: 0 3px; margin: 0 3px 0 0; border-radius: 3px; font-weight: 400; line-height: 14px; vertical-align: 1px; }   /* 굵기 없이 작게 — 글자는 웹 하한 12px(2026-11-17 사용자) */   /* 실제 낙찰가는 굵게 */
/* 실제 낙찰가 — 흐린 빨강(채도 낮게), 두 표 모두(2026-11-15 사용자) */
.bpt-tbl td.act-sold .bpt-nb { color: #e0475b; }   /* 숫자만 — 유찰 · 입찰 전 · '—'는 칠하지 않는다 */
:root[data-theme="dark"] .bpt-tbl td.act-sold .bpt-nb { color: #ff7a8a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .bpt-tbl td.act-sold .bpt-nb { color: #ff7a8a; } }
.bpt-day .bpt-tbl td.addr { text-align: left; }
.bpt-day .bpt-tbl th.hd-addr { text-align: center; }   /* 주소 머리는 가운데 — 칸 폭을 내용 폭에 맞춰 내용 덩어리와 가운데가 맞는다(2026-11-17 사용자) */
.bpt-tbl.fixed { table-layout: fixed; }
.bpt-tbl.fixed td { overflow: hidden; text-overflow: ellipsis; }
.bpt-tbl.fixed td.addr { max-width: none; }
.bpt-tbl td.addr .bpt-copy { vertical-align: top; margin-top: 1px; }
.bpt-tbl td.addr .a2 { display: inline-block; vertical-align: top; max-width: calc(100% - 28px); line-height: 18px; }   /* 두 줄 — 지번 / 건물명 · 동호수, 둘째 줄도 단추 오른쪽에서 시작 */
.bpt-tbl td.addr .a2 .ln { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bpt-tbl .bpt-nb { display: inline-block; min-width: min(11ch, 100%); max-width: 100%; text-align: right; font-variant-numeric: tabular-nums; }   /* 칸보다 넓으면 줄임표(…)가 붙었다 — 칸 안에서만   /* 금액 — 가운데 칸 안에서 끝자리 세로 맞춤 */
.bpt-tbl .bpt-nb small { display: block; text-align: right; }
.bpt-tbl .bpt-nb.rng { min-width: min(10ch, 100%); }
.bpt-tbl .bpt-nb .ghost { visibility: hidden; font-style: normal; }   /* 아랫줄에도 ' ~' 자리를 비워 둬 두 줄 금액의 끝자리가 세로로 맞는다 */
.bpt-tbl td.two small { display: block; font-size: inherit; color: inherit; }   /* 두 줄 칸 — 아래 줄도 같은 크기 · 같은 색(매각사례 표 전용 칸과 같게) */
.bpt-tbl .ev { font-size: 12px; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }   /* 엘베 — 매각사례 · 시세분석 표와 같은 칩 */
.bpt-tbl .ev.two { display: inline-block; text-align: center; line-height: 1.3; padding: 2px 7px; }
.bpt-tbl .ev.o { background: #e7f6ed; color: #1f7a4a; font-weight: 600; }
.bpt-tbl .ev.x { background: #fdecec; color: #dc2626; }
.bpt-tbl .ev.u { color: #9ca3af; }
.bpt-copy { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-right: 6px; padding: 0; border: 1px solid #d5dbe5; border-radius: 6px; background: #fff; color: #4b5563; cursor: pointer; vertical-align: -5px; }
.bpt-copy:hover { border-color: #2b6df3; color: #2b6df3; }
.bpt-copy.done { border-color: #15803d; color: #15803d; }   /* 주소 내용만 왼쪽 줄 맞춤(머리는 가운데) */   /* 사건별 예측은 칸이 많다 — 1440 화면에서도 옆으로 안 구르게 */
.bpt-tbl .l { text-align: left; }
.bpt-tbl .r { text-align: right; }
.bpt-tbl td.addr { max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
.bpt-tbl td.strong { font-weight: 800; color: #1f5fe0; }
.bpt-tbl tbody tr { cursor: pointer; }
.bpt-tbl tbody tr.ro { cursor: default; }
.bpt-scroll { max-height: 420px; }
.bpt-scroll thead th { position: sticky; top: 0; z-index: 1; }
.bpt-tbl tbody tr.on td { background: #f5f8ff; }
.bpt-tbl tbody tr.on td:first-child { box-shadow: inset 3px 0 0 #2b6df3; }
.bpt-day .bpt-tbl .bpt-link.two { line-height: 1.25; white-space: normal; text-align: center; }   /* 사건번호 두 줄 */   /* 고른 줄 왼쪽 파란 막대 — 매매수요 · 매각분석 표와 같게(2026-11-17 사용자) */
.bpt-tbl tbody tr.off td { color: #9ca3af; }
.bpt-link { border: 0; background: none; padding: 0; font: inherit; color: #1f5fe0; cursor: pointer; }
.bpt-flow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.bpt-tile { border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
.bpt-tile.key { background: #f5f8ff; border-color: #dbe5fa; }
.bpt-tile span { font-size: 12px; color: #4b5563; }
.bpt-tile b { font-size: 19px; font-variant-numeric: tabular-nums; }
.bpt-tile.key b { color: #1f5fe0; }
.bpt-tile small { font-size: 12px; color: #4b5563; }
.bpt-detail { border: 1px solid #e3e7ee; border-radius: 10px; padding: 12px 14px; display: grid; gap: 10px; background: #fbfcfe; }   /* 카드 안 상자 — 제목 15 · 800, 아이콘 없음 */
.bpt-detail .bpt-h3 { display: flex; align-items: center; gap: 8px; }
.bpt-detail .bpt-h3 small { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #111827; }   /* 주소는 검정으로 또렷하게(2026-11-17 사용자) */
.bpt-fold { margin-left: auto; height: 24px; padding: 0 10px; border: 1px solid #d5dbe5; border-radius: 6px; background: #fff; font: inherit; font-size: 12px; font-weight: 700; color: #4b5563; cursor: pointer; }   /* 제목 줄 오른쪽 끝 접기 · 펼치기 */
.bpt-h3:has(.bpt-fold) { display: flex; align-items: center; gap: 8px; }
.bpt-x { border: 1px solid #d5dbe5; background: #fff; border-radius: 6px; width: 24px; height: 24px; font-size: 12px; color: #4b5563; cursor: pointer; padding: 0; }
.bpt-flow:has(.bpt-tile.wide) { grid-template-columns: 170px minmax(0, 1fr); }   /* 왼쪽 한 상자 170(조회수 · 응찰 인원 위아래) · 나머지는 입찰가별 낙찰확률(2026-11-19 사용자 시안 A) */
.bpt-tile.bpt-stack { padding: 0; gap: 0; display: grid; grid-template-rows: 1fr 1fr; }
.bpt-stack .h { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.bpt-stack .h + .h { border-top: 1px solid #e3e7ee; }   /* 가운데 가로 가름선 */
.bpt-stack .h span { font-size: 13px; }
.bpt-stack .h b { font-size: 22px; font-weight: 800; line-height: 1.2; }
.bpt-stack .h small { color: #6b7280; line-height: 1.5; }
/* 입찰가별 낙찰확률 — 온도계꼴(2026-11-18 사용자 시안 A). 칸 폭 164(반 82), 칸 가운데 = 눈금 자리 */
.bpt-qs { --half: 82px; position: relative; height: 44px; margin: 10px var(--half) 0; }
.bpt-q { position: absolute; top: 0; bottom: 0; width: calc(var(--half) * 2); transform: translateX(-50%); box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 1px solid #e3e7ee; border-radius: 8px; background: #fff; cursor: pointer; }
.bpt-q::after { content: ""; position: absolute; left: 50%; bottom: -16px; width: 2px; height: 16px; background: #d5dbe5; transform: translateX(-50%); }
.bpt-q.on { border-color: #9fb8f5; box-shadow: 0 0 0 2px #dbe5fa; }
.bpt-q.on::after { background: #2b6df3; }
.bpt-q .p { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); font-size: 11px; line-height: 16px; padding: 0 7px; border-radius: 999px; background: #1f5fe0; color: #fff; font-weight: 700; }   /* 추천 — 칸 위 알약 */
.bpt-tile.key .bpt-q .w { font-size: 17px; font-weight: 700; color: #1f2937; font-variant-numeric: tabular-nums; white-space: nowrap; }   /* 고른 칸도 크기 · 굵기 그대로 — 색만(딸깍이지 않게) */
.bpt-tile.key .bpt-q .w small { font-size: 12px; font-weight: 600; color: #6b7280; }
.bpt-tile.key .bpt-q.on .w, .bpt-tile.key .bpt-q.on .w small { color: #1f5fe0; }
.bpt-qsl { position: relative; margin: 6px 82px 0; padding-bottom: 22px; }
.bpt-qsl .bar { position: relative; display: flex; align-items: center; }
.bpt-qsl .bar .k { position: absolute; right: calc(100% + 10px); top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; gap: 4px; line-height: 1; font-size: 12px; font-weight: 700; color: #4b5563; white-space: nowrap; }
.bpt-qsl .bar .k svg { color: #2b6df3; }   /* 과녁 아이콘 */   /* 막대와 가로 일직선 */
.bpt-qsl .bar input[type='range'] { display: block; width: calc(100% + 16px); margin: 0 -8px; height: 16px; accent-color: #2b6df3; cursor: pointer; }   /* 손잡이 가운데가 0 · 100% 자리에 오게 손잡이 폭만큼 늘림 */
.bpt-qsl .bar .bub { position: absolute; top: 27px; transform: translateX(-50%); z-index: 2; font-size: 11px; font-weight: 800; color: #fff; background: #1f5fe0; border-radius: 6px; padding: 0 7px; line-height: 20px; white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums; }   /* 막대 아래 눈금 줄 — 50 · 60 · 70 · 80에 오면 눈금 글자를 덮는다 */
.bpt-qsl .bar .bub::after { content: ""; position: absolute; left: 50%; top: -3px; width: 7px; height: 7px; background: #1f5fe0; transform: translateX(-50%) rotate(45deg); border-radius: 1px; }
.bpt-qsl .tk { position: absolute; left: 0; right: 0; top: 22px; height: 20px; font-size: 11px; color: #6b7280; }
.bpt-qsl .tk span { position: absolute; transform: translateX(-50%); display: grid; justify-items: center; gap: 2px; font-variant-numeric: tabular-nums; }
.bpt-qsl .tk span i { display: block; width: 1px; height: 6px; background: #d5dbe5; }
.bpt-qsl .tk span.b { color: #111827; font-weight: 700; }
.bpt-qout3 { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 10px; margin-top: 10px; padding-top: 12px; border-top: 1px solid #e3e7ee; }
.bpt-qout3 .c { background: #fff; border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bpt-tile .bpt-qout3 .l { font-size: 12px; color: #6b7280; display: flex; gap: 6px; align-items: center; }
.bpt-tile .bpt-qout3 .l .rd { font-size: 12px; color: #4b5563; background: #eef1f6; border-radius: 6px; padding: 0 6px; line-height: 18px; }
.bpt-tile .bpt-qout3 .v { display: flex; align-items: baseline; font-size: 20px; font-weight: 800; line-height: 1.2; color: #111827; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bpt-tile .bpt-qout3 .v small { font-size: 13px; font-weight: 600; color: #6b7280; margin-right: 6px; }
.bpt-tile .bpt-qout3 .d { font-size: 12px; color: #4b5563; font-variant-numeric: tabular-nums; }
.bpt-qout3 .c.bid { border-color: #9fb8f5; background: #eef3fe; }
.bpt-tile .bpt-qout3 .c.bid .l, .bpt-tile .bpt-qout3 .c.bid .v, .bpt-tile .bpt-qout3 .c.bid .v small { color: #1f5fe0; }
.bpt-qout3 .fx { display: inline-grid; text-align: right; }   /* 값 상자 — 31개 값을 겹쳐 가장 넓은 폭 */
.bpt-qout3 .fx.lt { text-align: left; }
.bpt-tile .bpt-qout3 .v span.fx { font-size: inherit; color: inherit; }
.bpt-qout3 .fx > * { grid-area: 1 / 1; white-space: nowrap; font-style: normal; }
.bpt-qout3 .fx > i { visibility: hidden; }
.bpt-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 12px; }
.bpt-legend { display: flex; gap: 14px; margin: 0; font-size: 12px; color: #374151; }
.bpt-legend span { display: inline-flex; align-items: center; gap: 5px; }
.bpt-legend .sw { width: 14px; height: 10px; border-radius: 2px; }
.bpt-legend .ln { width: 18px; height: 2px; }
.bpt-legend .dt { width: 10px; height: 10px; border-radius: 50%; background: #e8590c; }
.bpt-legend .a { background: #9aa6b8; }
.bpt-legend .b { background: #2b6df3; }
.bpt-bar { display: grid; grid-template-columns: 72px minmax(0, 1fr) 92px 84px; gap: 8px; align-items: center; font-size: 13px; }
.bpt-bar .tr { display: flex; flex-direction: column; gap: 2px; background: #eef1f6; border-radius: 4px; padding: 2px; }
.bpt-bar .f { height: 7px; border-radius: 0 4px 4px 0; }
.bpt-bar .f.a { background: #9aa6b8; }
.bpt-bar .f.b { background: #2b6df3; }
.bpt-bar .v { text-align: right; font-variant-numeric: tabular-nums; }
.bpt-bar .w { text-align: right; color: #374151; font-variant-numeric: tabular-nums; }
.bpt-svg { width: 100%; height: auto; display: block; }
.bpt-svg .grid { stroke: #eef1f6; stroke-width: 1; }
.bpt-svg .ax { font-size: 12px; fill: #6b7280; }
.bpt-svg .lb { font-size: 12px; fill: #374151; }
.bpt-svg .cv { fill: none; stroke-width: 2; stroke-linejoin: round; }
.bpt-svg .cv.a { stroke: #9aa6b8; stroke-dasharray: 5 4; }
.bpt-svg .cv.b { stroke: #2b6df3; }
.bpt-svg .hit { fill: transparent; }
.bpt-svg .dot { fill: #2b6df3; stroke: #fff; stroke-width: 1.5; }
.bpt-svg .act { fill: #e8590c; stroke: #fff; stroke-width: 2; }
.bpt-svg .mk { stroke: #e8590c; stroke-width: 1.5; stroke-dasharray: 4 4; }
.bpt-svg .mk2 { stroke: #9aa6b8; stroke-width: 1; stroke-dasharray: 3 4; }
.bpt-on { margin-left: 6px; font-size: 12px; font-weight: 700; color: #9ca3af; }
.bpt-on.on { color: #15803d; }

.bpt-date input.court { width: 120px; }
.bpt-date select.court { height: 32px; width: 124px; border: 1px solid #d5dbe5; border-radius: 8px; padding: 0 6px; font: inherit; font-size: 13px; background: #fff; color: #213366; font-weight: 600; }
.bpt-range { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.bpt-range input { height: 32px; border: 1px solid #d5dbe5; border-radius: 8px; padding: 0 8px; font: inherit; }
.bpt-btns { display: flex; gap: 8px; }
.bpt-btn { height: 36px; padding: 0 14px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.bpt-btn.line { background: #fff; color: #2b6df3; border: 1px solid #2b6df3; }
.bpt-btn:disabled { opacity: .45; cursor: default; }
.bpt-at { display: block; font-size: 12px; color: #6b7280; }
.bpt-at.after { color: #c4392f; }
.bpt-tbl td .bpt-nb small.bpt-at { font-weight: 400; color: #6b7280; }   /* 금액 아랫줄 % — 굵은 · 색 칸(예상 · 실제 낙찰가)에서도 차이 칸처럼 회색 보통 굵기 */
/* 매각분석 › 인근매각사례 데이터수집과 같은 꼴(연결 알약 · 진행 막대 · 중지) — selected.src.html .sx-conn · .sx-prog */
.bpt-colh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bpt-conn { display: inline-flex; align-items: center; gap: 4px; height: 16px; padding: 0 7px; line-height: 16px; border-radius: 999px; background: #eef1f6; color: #6b7280; font-size: 12px; font-weight: 400; white-space: nowrap; }
.bpt-conn i { width: 5px; height: 5px; border-radius: 50%; background: radial-gradient(circle at 34% 30%, #d5d9e0 0 10%, #9aa3b0 35%, #6b7482 70%, #4f5763 100%); }
.bpt-conn.on { background: #213366; color: #fff; }
.bpt-conn.on i { background: radial-gradient(circle at 34% 30%, #ffffff 0 12%, #b6ffcf 26%, #3dff7a 55%, #16b84c 100%); box-shadow: 0 0 2px 0 rgba(61, 255, 122, .8), 0 0 5px 1px rgba(61, 255, 122, .3); animation: bpt-live 2.4s ease-in-out infinite; }
.bpt-conn .ago { display: inline-block; min-width: 2ch; text-align: right; font-variant-numeric: tabular-nums; }
@keyframes bpt-live { 50% { box-shadow: 0 0 3px 1px rgba(61, 255, 122, .9), 0 0 7px 1px rgba(61, 255, 122, .4); } }
@media (prefers-reduced-motion: reduce) { .bpt-conn.on i { animation: none; } }
.bpt-ver { font-size: 12px; font-weight: 400; color: #6b7280; white-space: nowrap; }
.bpt-prog { display: grid; gap: 2px; }
.bpt-target { margin: 0; font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bpt-target b { color: #2b6df3; font-weight: 700; }
.bpt-prog .row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #6b7280; white-space: nowrap; }
.bpt-prog .bar { flex: 1 1 auto; min-width: 96px; height: 6px; border-radius: 3px; background: #e3e7ee; overflow: hidden; }
.bpt-prog .bar b { display: block; height: 100%; background: #2b6df3; transition: width .3s; }
.bpt-prog .num { font-variant-numeric: tabular-nums; }
.bpt-prog .num b { color: #1f5fe0; }
.bpt-stop { min-width: 64px; height: 34px; padding: 0 12px; border: 1px solid #c22e2e; border-radius: 8px; background: none; color: #c22e2e; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.bpt-stop:disabled { border-color: #e3e7ee; color: #9ca3af; cursor: default; }   /* 대기중 · 중지 한 단추 — 쉬면 회색 '대기중', 수집 중이면 빨간 '중지'(폭 고정) */
.bpt-grade-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bpt-grade-head .bpt-h3 { margin-right: auto; }
.bpt-grade { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 900px) { .bpt-grade { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bpt-dayhead { display: flex; align-items: flex-start; gap: 16px; }
.bpt-dayhead .bpt-h3 { flex: 1 1 auto; min-width: 0; }
.bpt-dayinfo { width: 100%; border-collapse: collapse; border-top: 1px solid #e3e7ee; font-size: 14px; }
.bpt-dayinfo th { width: 120px; padding: 10px 12px; background: #f4f6fa; color: #374151; font-weight: 600; text-align: center; border-bottom: 1px solid #e3e7ee; white-space: nowrap; }
.bpt-dayinfo td { padding: 8px 12px; border-bottom: 1px solid #e3e7ee; color: #374151; }
.bpt-dayinfo .date { font-size: 18px; color: #1f5fe0; margin-right: 12px; }
.bpt-dayinfo .muted { font-size: 13px; color: #6b7280; }
.bpt-dayinfo .muted .dong { color: #1f5fe0; }
.bpt-dayinfo td.date-row { align-items: center; }
.bpt-dongsel { height: 32px; border: 1px solid #d5dbe5; border-radius: 8px; padding: 0 8px; font: inherit; font-size: 14px; color: #111827; background: #fff; }
.bpt-dongsel:focus, .bpt-dongsel.on { border-color: #2b6df3; outline: none; }
.bpt-dayinfo td.date-row .date { margin-right: 8px; }
.bpt-dayinfo td.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.bpt-fchip { height: 30px; padding: 0 10px; border: 1px solid #d5dbe5; border-radius: 8px; background: #fff; color: #374151; font: inherit; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
.bpt-fchip b { color: #111827; font-weight: 700; display: inline-block; min-width: 3ch; text-align: right; }   /* 숫자 자리 고정 — 누를 때마다 단추 폭이 흔들리지 않게 */
.bpt-fchip small { font-size: 13px; color: #111827; display: inline-block; min-width: 5.5ch; }   /* 법원 전체 수 — 회색이면 안 보인다(2026-11-14 사용자) */
.bpt-fchip.on { border-color: #2b6df3; background: #eef3ff; }
.bpt-fchip b.all { color: #111827; min-width: 3ch; }
.bpt-fchip.big { height: 32px; font-size: 14px; }
.bpt-fchip:disabled { opacity: .5; cursor: default; }
@media (max-width: 900px) { .bpt-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bpt-two { grid-template-columns: minmax(0, 1fr); } }
</style>
