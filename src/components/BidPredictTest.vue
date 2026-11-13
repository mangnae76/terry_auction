<script setup lang="ts">
/**
 * 시장분석 › 테스트(운영) — 낙찰가 예측 시험대.
 * 기일 목록 파일(그날 결과) + 붙여넣은 '사건번호 주소 조회수' + 공용 매각 자료로
 * 사건마다 예상 낙찰가 · 입찰가별 낙찰확률을 내고, 결과가 있는 사건은 맞혀본 차이를 보인다.
 * 조회수 규칙은 늘 '그 사건을 뺀 나머지'로 배운다(자기 결과로 자기를 맞히지 않게).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { agentOnline, loadAgentDataset, loadDayLists, saveDayCsv, sendAgentCommand, watchAgentStatus, type AgentStatus, type DayListRow } from '../services/agentRemote';
import { readSheetRows } from '../services/saleExcel';
import {
  BAND_NAMES, caseLabel, csvRows, dongOf, fitPriceModel, fitViewModel, parseViewLines, priceDist, readDayRows, roundOfRatio, similarBands, soldOf, viewBands,
  type BidTarget, type DayRow, type ViewPair,
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
const fileMsg = ref('');
/** 표에 올릴 동(주소에 이 글이 있는 줄만, 비우면 전부) */
const dongFilter = ref((() => { try { return (JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as { dong?: string } | null)?.dong ?? '검암동'; } catch { return '검암동'; } })());
/** DB 기일 목록(계마다 + CSV)을 사건번호로 합친 것 — 조회수는 수집한 날짜별 */
type DbRow = DayRow & { views: Record<string, number>; from: string };
const dbRows = ref<DbRow[]>([]);
const dbInfo = ref('');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plusDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const colFrom = ref(todayIso());
const colTo = ref(plusDays(todayIso(), 7));
const colCourt = ref('인천-본원');
const agent = ref<AgentStatus | null>(null);
const agentNote = ref('');
const agentOn = computed(() => agentOnline(agent.value));
let stopAgent: (() => void) | null = null;
onMounted(() => { stopAgent = watchAgentStatus('', (st) => { agent.value = st; }, () => { agent.value = null; }); });
onBeforeUnmount(() => stopAgent?.());
const sendCmd = async (name: 'open' | 'daylist') => {
  try {
    await sendAgentCommand('', name, name === 'open' ? { site: '탱크옥션' } : { site: '탱크옥션', from: colFrom.value, to: colTo.value, court: colCourt.value.trim() || '인천-본원' });
    agentNote.value = name === 'open' ? '브라우저 열기를 보냈습니다. 크롬에서 탱크옥션 로그인을 확인해 주세요.' : '기일 목록 수집을 보냈습니다. 끝나면 매각기일을 골라 다시 읽습니다.';
  } catch { agentNote.value = '명령을 보내지 못했습니다. 다시 해 주세요.'; }
};
/** 그 매각기일의 DB 목록 읽기 */
const loadDb = async () => {
  if (!dayDate.value) { dbRows.value = []; dbInfo.value = ''; return; }
  try {
    const docs = await loadDayLists(dayDate.value);
    const m = new Map<string, DbRow>();
    const put = (r: DayListRow, csv: boolean) => {
      const o = m.get(r.key);
      const base: DbRow = o ?? { key: r.key, kind: '', addr: '', area: null, appr: 0, min: 0, sold: 0, second: 0, bids: 0, status: '', date: '', views: {}, from: '' };
      const from = base.from && base.from !== (csv ? 'CSV' : '도우미') ? '도우미 · CSV' : csv ? 'CSV' : '도우미';
      const pickN = (a: number | undefined, b: number) => (a && a > 0 ? a : b);
      m.set(r.key, { ...base, kind: base.kind || r.kind || '', addr: base.addr || r.addr || '', area: base.area ?? r.area ?? null, appr: pickN(r.appr, base.appr), min: csv && base.min ? base.min : pickN(r.min, base.min),
        sold: pickN(r.sold, base.sold), second: pickN(r.second, base.second), bids: pickN(r.bids, base.bids), status: base.status || r.status || '', date: base.date || String((r as { date?: string }).date ?? ''), views: { ...base.views, ...(r.views ?? {}) }, from });
    };
    docs.filter((d) => d.by === 'agent').forEach((d) => d.rows.forEach((r) => put(r, false)));
    docs.filter((d) => d.by !== 'agent').forEach((d) => d.rows.forEach((r) => put(r, true)));
    dbRows.value = [...m.values()];
    dbInfo.value = docs.length ? `DB ${docs.length}개 목록(${docs.map((d) => d.dept || 'CSV').join(' · ')}) · ${m.size.toLocaleString('ko-KR')}건` : 'DB에 이 날 목록이 없습니다';
  } catch { dbInfo.value = 'DB 목록을 읽지 못했습니다'; }
};
watch(dayDate, () => { void loadDb(); }, { immediate: true });

try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as { dayRows?: DayRow[]; dayName?: string; dayDate?: string; viewsText?: string; pick?: string } | null;
  if (s) { dayRows.value = s.dayRows ?? []; dayName.value = s.dayName ?? ''; dayDate.value = s.dayDate ?? ''; viewsText.value = s.viewsText ?? ''; pick.value = s.pick ?? ''; }
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

const onFile = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
  if (!f) return;
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
const pct = (x: number) => `${Math.round(x * 100)}%`;
const sgn = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

/** DB 를 먼저, 없으면 이 브라우저에 읽어 둔 파일 */
const dayMap = computed(() => { const m = new Map<string, DayRow & { views?: Record<string, number> }>(dayRows.value.map((d) => [d.key, d])); dbRows.value.forEach((d) => m.set(d.key, { ...(m.get(d.key) ?? {}), ...d, bids: d.bids || m.get(d.key)?.bids || 0, second: d.second || m.get(d.key)?.second || 0 })); return m; });
/** 매각기일 전날까지 가장 늦게 모은 조회수(없으면 당일 값, 그것도 없으면 없음) */
const viewOf = (v: Record<string, number> | undefined) => {
  const ks = Object.keys(v ?? {}).sort(); const before = ks.filter((k) => k < dayDate.value); const same = ks.filter((k) => k === dayDate.value);
  const k = before[before.length - 1] ?? same[0];
  return k ? { n: v![k], at: k } : null;
};
/** 표에 올릴 줄 — 붙여넣은 글이 있으면 그것, 없으면 DB 목록(동 거르기)에서 조회수 있는 것 */
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
const items = computed<Item[]>(() => baseLines.value.map((l) => {
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

const pairs = computed<ViewPair[]>(() => items.value.filter((it) => it.result && it.views >= 0 && it.result.bids >= 0 && (it.failed || it.result.bids > 0)).map((it) => ({ key: it.key, views: it.views, bids: it.result!.bids })));

type Pred = { before: ReturnType<typeof priceDist>; after: ReturnType<typeof priceDist> | null; piBefore: number[]; piAfter: number[] | null; p0: number | null; simN: number; loose: boolean; vmN: number; expBids: number | null };
const preds = computed(() => {
  const out = new Map<string, Pred>();
  if (!recs.value.length) return out;
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

/** 맞혀보기 — 팔린 사건만, 조회수 반영 전 · 후 */
const score = computed(() => {
  const rows = items.value.filter((it) => it.result && it.result.sold > 0 && preds.value.has(it.key));
  const e = (f: (p: Pred) => ReturnType<typeof priceDist> | null) => {
    const xs = rows.map((it) => { const d = f(preds.value.get(it.key)!); return d ? { d: it.result!.sold / d.median - 1, inR: it.result!.sold >= d.lo && it.result!.sold <= d.hi } : null; }).filter((x): x is { d: number; inR: boolean } => !!x);
    return xs.length ? { n: xs.length, mae: xs.reduce((s, x) => s + Math.abs(x.d), 0) / xs.length, inR: xs.filter((x) => x.inR).length } : null;
  };
  return { rows, before: e((p) => p.before), after: e((p) => p.after) };
});

/* 곡선 — 최저가 ~ 최저가 1.8배 */
const curve = computed(() => {
  const it = sel.value; const p = selP.value; if (!it?.target || !p) return null;
  const x0 = it.target.min; const x1 = it.target.min * 1.8;
  const sx = (w: number) => 50 + ((w - x0) / (x1 - x0)) * 570; const sy = (v: number) => 250 - v * 230;
  const ws = Array.from({ length: 37 }, (_, i) => x0 + ((x1 - x0) * i) / 36);
  const line = (d: ReturnType<typeof priceDist>) => ws.map((w, i) => `${i ? 'L' : 'M'}${sx(w).toFixed(1)} ${sy(d.win(w)).toFixed(1)}`).join(' ');
  const main = p.after ?? p.before;
  const ticks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4).map((w) => ({ x: sx(w), label: man(w) }));
  const pts = ws.filter((_, i) => i % 3 === 0).map((w) => ({ x: sx(w), y: sy(main.win(w)), tip: `${man(w)} 원 → 낙찰확률 ${pct(main.win(w))}` }));
  const act = it.result && it.result.sold > 0 ? { x: sx(it.result.sold), y: sy(main.win(it.result.sold)), label: `실제 ${man(it.result.sold)} · ${pct(main.win(it.result.sold))}` } : null;
  const second = it.result && it.result.second > 0 ? { x: sx(it.result.second), label: `2위 ${man(it.result.second)}` } : null;
  return { before: line(p.before), after: p.after ? line(p.after) : '', ticks, pts, act, second, sy };
});

/* 조회수 규칙 그림 — 가로 조회수(로그), 세로 인원 */
const rule = computed(() => {
  const ps = pairs.value; if (ps.length < 2) return null;
  const vm = fitViewModel(ps);
  const vMax = Math.max(...ps.map((p) => p.views), 10); const bMax = Math.max(...ps.map((p) => p.bids), 5);
  const sx = (v: number) => 40 + (Math.log(1 + v) / Math.log(1 + vMax)) * 330; const sy = (b: number) => 170 - (b / bMax) * 150;
  const dots = ps.map((p) => ({ x: sx(p.views), y: sy(p.bids), tip: `${caseLabel(p.key)} · 조회 ${p.views.toLocaleString('ko-KR')} · ${p.bids ? `${p.bids}명` : '유찰'}` }));
  const line = vm ? Array.from({ length: 30 }, (_, i) => { const v = Math.expm1((Math.log(1 + vMax) * i) / 29); return `${i ? 'L' : 'M'}${sx(v).toFixed(1)} ${sy(Math.min(bMax, Math.max(0, Math.exp(vm.a + vm.c * Math.log(1 + v)) - 1))).toFixed(1)}`; }).join(' ') : '';
  return { dots, line, vm, vMax, bMax, sx, sy, twice: vm ? 2 ** vm.c : null };
});

/** DB 에 들어 있는 이 날 목록(동 거르기) — 사건번호 · 주소 · 조회수 */
const dbList = computed(() => {
  const f = dongFilter.value.trim();
  return dbRows.value.filter((d) => !f || d.addr.includes(f)).map((d) => {
    const ks = Object.keys(d.views ?? {}).sort(); const k = ks[ks.length - 1];   // 목록에는 가장 늦게 모은 값(매각 뒤여도) — 예측은 viewOf(전날까지)만
    return { ...d, v: k ? { n: d.views[k], at: k, after: k > dayDate.value } : null };
  });
});
const nUnmatched = computed(() => items.value.filter((it) => !it.target).length);
</script>

<template>
  <div class="bpt">
    <section class="bpt-card">
      <header class="bpt-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#213366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>
        <h2>낙찰가 예측 테스트</h2>
        <span class="bpt-note">{{ recsInfo }}</span>
      </header>
      <div class="bpt-in">
        <div class="bpt-box">
          <h3>기일 목록 파일</h3>
          <label class="bpt-file"><input type="file" accept=".xlsx,.csv" @change="onFile" />파일넣기</label>
          <p v-if="dayName" class="bpt-sub">{{ dayName }} · {{ dayRows.length.toLocaleString('ko-KR') }}건</p>
          <p v-else class="bpt-sub">기일별물건에서 받은 엑셀 · CSV(그날 결과 · 2위 · 입찰자수)</p>
          <label class="bpt-date">매각기일<input v-model="dayDate" type="date" /></label>
          <p v-if="dbInfo" class="bpt-sub">{{ dbInfo }}</p>
          <p v-if="fileMsg" class="bpt-warn">{{ fileMsg }}</p>
        </div>
        <div class="bpt-box">
          <h3>기일 목록 수집 <small :class="['bpt-on', { on: agentOn }]">{{ agentOn ? 'MyAgent 연결됨' : 'MyAgent 꺼짐' }}</small></h3>
          <label class="bpt-date">법원<input v-model="colCourt" type="text" class="court" /></label>
          <div class="bpt-range"><input v-model="colFrom" type="date" aria-label="시작일" /><span>~</span><input v-model="colTo" type="date" aria-label="끝일" /></div>
          <div class="bpt-btns">
            <button type="button" class="bpt-btn line" :disabled="!agentOn || !!agent?.busy" @click="sendCmd('open')">브라우저열기</button>
            <button type="button" class="bpt-btn" :disabled="!agentOn || !agent?.ready || !!agent?.busy" @click="sendCmd('daylist')">기일목록수집</button>
          </div>
          <p class="bpt-sub">{{ agentNote || (agentOn ? agent?.message : '') || '집 PC 에서 agent.py 를 켜 두면 여기서 시킬 수 있습니다' }}</p>
        </div>
        <div class="bpt-box grow">
          <h3>사건번호 · 주소 · 조회수</h3>
          <textarea v-model="viewsText" rows="5" spellcheck="false" placeholder="손으로 넣을 때만 — 한 줄에 한 사건, 2026타경501308 검암동 493-4 정성드림빌 500&#10;조회수는 매각 전일까지 누적(줄 맨 끝 숫자)" />
          <label class="bpt-date">동 거르기<input v-model="dongFilter" type="text" class="court" placeholder="비우면 전부" /></label>
          <p class="bpt-sub">{{ items.length.toLocaleString('ko-KR') }}건<template v-if="nUnmatched"> · 자료 못 찾음 {{ nUnmatched }}건</template> · 칸이 비어 있으면 DB 기일 목록에서 조회수가 있는 줄을 씁니다(매각기일 전날까지 가장 늦게 모은 값) · 조회수 규칙은 늘 그 사건을 뺀 나머지로 배웁니다</p>
        </div>
      </div>
    </section>

    <section v-if="dayDate" class="bpt-card">
      <h3 class="bpt-h3">DB에 들어 있는 목록 <small>{{ dayDate }} · {{ dongFilter.trim() || '전체' }} {{ dbList.length.toLocaleString('ko-KR') }}건 / 이 날 전체 {{ dbRows.length.toLocaleString('ko-KR') }}건</small></h3>
      <div v-if="dbList.length" class="bpt-tbl-wrap bpt-scroll">
        <table class="bpt-tbl">
          <thead><tr><th>사건번호</th><th class="l">주소</th><th>조회수</th><th>종류</th><th>진행상태</th><th>넣은 곳</th></tr></thead>
          <tbody>
            <tr v-for="d in dbList" :key="d.key" class="ro">
              <td>{{ caseLabel(d.key) }}</td>
              <td class="l addr">{{ d.addr || '—' }}</td>
              <td class="r">{{ d.v ? d.v.n.toLocaleString('ko-KR') : '—' }}<small v-if="d.v" :class="['bpt-at', { after: d.v.after }]">{{ d.v.at === dayDate ? '당일' : d.v.at.slice(5).replace('-', '.') }}{{ d.v.after ? ' 매각 뒤' : '' }}</small></td>
              <td>{{ d.kind || '—' }}</td>
              <td>{{ d.status || '—' }}</td>
              <td>{{ d.from }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="bpt-sub">이 날짜로 DB에 들어간 목록이 없습니다. 파일넣기로 CSV를 올리거나 도우미로 기일목록수집을 하세요</p>
      <p class="bpt-sub">조회수는 가장 늦게 모은 값이고, 아래 작은 글은 모은 날입니다. '매각 뒤'로 모은 값은 예측에 쓰지 않습니다(입찰 전날까지 모은 값만). CSV에는 조회수가 없어 도우미로 모은 줄에만 있습니다</p>
    </section>

    <section v-if="items.length" class="bpt-card">
      <h3 class="bpt-h3">사건별 예측</h3>
      <div class="bpt-tbl-wrap">
        <table class="bpt-tbl">
          <thead><tr><th>사건번호</th><th class="l">주소</th><th>조회수</th><th>차수</th><th>최저가</th><th>예상 낙찰가</th><th>흔한 범위</th><th>실제</th><th>차이</th></tr></thead>
          <tbody>
            <tr v-for="it in items" :key="it.key" :class="{ on: sel?.key === it.key, off: !preds.has(it.key) }" @click="pick = it.key">
              <td><button type="button" class="bpt-link" @click.stop="pick = it.key">{{ caseLabel(it.key) }}</button></td>
              <td class="l addr">{{ it.addr || '—' }}</td>
              <td class="r">{{ it.views.toLocaleString('ko-KR') }}<small class="bpt-at">{{ it.viewAt === dayDate ? '당일' : it.viewAt.slice(5).replace('-', '.') }}</small></td>
              <td>{{ it.target ? `${it.target.round + 1}차` : '—' }}</td>
              <td class="r">{{ it.target ? won(it.target.min) : '자료 없음' }}</td>
              <template v-if="preds.get(it.key)">
                <td class="r strong">{{ won((preds.get(it.key)!.after ?? preds.get(it.key)!.before).median) }}</td>
                <td class="r">{{ man((preds.get(it.key)!.after ?? preds.get(it.key)!.before).lo) }} ~ {{ man((preds.get(it.key)!.after ?? preds.get(it.key)!.before).hi) }}</td>
              </template>
              <template v-else><td>—</td><td>—</td></template>
              <td class="r">{{ it.result ? (it.result.sold > 0 ? `${won(it.result.sold)} · ${it.result.bids ? `${it.result.bids}명` : '인원 모름'}` : '유찰') : '입찰 전' }}</td>
              <td class="r">{{ it.result && it.result.sold > 0 && preds.get(it.key) ? sgn(it.result.sold / (preds.get(it.key)!.after ?? preds.get(it.key)!.before).median - 1) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="bpt-sub">예상 낙찰가는 조회수 규칙이 있으면 반영한 값, 없으면 비슷한 물건 인원 비율로 낸 값입니다. 줄을 누르면 아래에 자세히 나옵니다</p>
    </section>

    <section v-if="sel && selP && sel.target" class="bpt-card">
      <h3 class="bpt-h3">{{ caseLabel(sel.key) }} <small>{{ sel.addr }}</small></h3>
      <div class="bpt-flow">
        <div class="bpt-tile"><span>전일까지 누적 조회수</span><b>{{ sel.views.toLocaleString('ko-KR') }}회</b><small>{{ selP.vmN ? `조회수 규칙 ${selP.vmN}건으로 배움` : '조회수 규칙 없음(6건 이상 필요)' }}</small></div>
        <div class="bpt-tile"><span>예상 응찰 인원</span><b>{{ selP.expBids != null ? `약 ${Math.round(selP.expBids)}명` : BAND_NAMES[selP.piBefore.indexOf(Math.max(...selP.piBefore))] + ' 가장 흔함' }}</b><small>{{ selP.p0 != null ? `유찰 확률 ${pct(selP.p0)}` : `비슷한 물건 ${selP.simN}건${selP.loose ? '(조건 넓힘)' : ''}` }}</small></div>
        <div class="bpt-tile key"><span>예상 낙찰가(가운데)</span><b>{{ won((selP.after ?? selP.before).median) }}</b><small>흔한 범위 {{ won((selP.after ?? selP.before).lo) }} ~ {{ won((selP.after ?? selP.before).hi) }}</small></div>
        <div class="bpt-tile"><span>낙찰확률 60%로 쓰려면</span><b>{{ won((selP.after ?? selP.before).q(0.6)) }}</b><small>50% {{ won((selP.after ?? selP.before).q(0.5)) }} · 70% {{ won((selP.after ?? selP.before).q(0.7)) }}</small></div>
      </div>
      <div class="bpt-two">
        <div class="bpt-box">
          <h3>응찰 인원 확률</h3>
          <p class="bpt-legend"><span><i class="sw a" />비슷한 물건 비율</span><span v-if="selP.piAfter"><i class="sw b" />조회수 반영</span></p>
          <div v-for="(nm, k) in BAND_NAMES" :key="nm" class="bpt-bar">
            <span class="nm">{{ nm }}</span>
            <span class="tr">
              <span class="f a" :style="{ width: `${selP.piBefore[k] * 100}%` }" :title="`비슷한 물건 ${pct(selP.piBefore[k])}`" />
              <span v-if="selP.piAfter" class="f b" :style="{ width: `${selP.piAfter[k] * 100}%` }" :title="`조회수 반영 ${pct(selP.piAfter[k])}`" />
            </span>
            <span class="v">{{ pct(selP.piBefore[k]) }}<template v-if="selP.piAfter"> → <b>{{ pct(selP.piAfter[k]) }}</b></template></span>
            <span class="w">{{ man(selP.before.bandWon[k]) }}</span>
          </div>
          <p class="bpt-sub">오른쪽 금액은 그 인원일 때 예상 낙찰가입니다</p>
        </div>
        <div v-if="curve" class="bpt-box">
          <h3>입찰가별 낙찰확률</h3>
          <p class="bpt-legend"><span><i class="ln a" />비슷한 물건 비율</span><span v-if="curve.after"><i class="ln b" />조회수 반영</span><span v-if="curve.act"><i class="dt" />실제 낙찰가</span></p>
          <svg viewBox="0 0 640 290" class="bpt-svg" role="img" aria-label="입찰가별 낙찰확률 곡선">
            <g v-for="v in [0, 0.25, 0.5, 0.75, 1]" :key="v"><line x1="50" x2="620" :y1="curve.sy(v)" :y2="curve.sy(v)" class="grid" /><text x="42" :y="curve.sy(v) + 4" class="ax" text-anchor="end">{{ pct(v) }}</text></g>
            <text v-for="(t, i) in curve.ticks" :key="t.x" :x="t.x" y="272" class="ax" :text-anchor="i === 0 ? 'start' : i === curve.ticks.length - 1 ? 'end' : 'middle'">{{ t.label }}</text>
            <line v-if="curve.second" :x1="curve.second.x" :x2="curve.second.x" y1="20" y2="250" class="mk2" />
            <line v-if="curve.act" :x1="curve.act.x" :x2="curve.act.x" y1="20" y2="250" class="mk" />
            <text v-if="curve.act" :x="curve.act.x + 6" y="14" class="lb">{{ curve.act.label }}</text>
            <path :d="curve.before" :class="['cv', curve.after ? 'a' : 'b']" />
            <path v-if="curve.after" :d="curve.after" class="cv b" />
            <g v-for="p in curve.pts" :key="p.x"><circle :cx="p.x" :cy="p.y" r="9" class="hit"><title>{{ p.tip }}</title></circle><circle :cx="p.x" :cy="p.y" r="3" class="dot"><title>{{ p.tip }}</title></circle></g>
            <circle v-if="curve.act" :cx="curve.act.x" :cy="curve.act.y" r="5" class="act"><title>{{ curve.act.label }}</title></circle>
          </svg>
          <p v-if="curve.second" class="bpt-sub">회색 점선은 2위 금액입니다</p>
        </div>
      </div>
    </section>

    <section v-if="score.rows.length" class="bpt-card">
      <h3 class="bpt-h3">맞혀보기 <small>결과가 있는 매각 {{ score.rows.length }}건 · 그날 이전 자료와 자기 사건을 뺀 조회수 규칙만 사용</small></h3>
      <div class="bpt-score">
        <div v-if="score.before" class="bpt-tile"><span>조회수 반영 전</span><b>평균 차이 {{ (score.before.mae * 100).toFixed(1) }}%</b><small>흔한 범위 안 {{ score.before.inR }} / {{ score.before.n }}</small></div>
        <div v-if="score.after" class="bpt-tile key"><span>조회수 반영 후</span><b>평균 차이 {{ (score.after.mae * 100).toFixed(1) }}%</b><small>흔한 범위 안 {{ score.after.inR }} / {{ score.after.n }}</small></div>
        <div v-else class="bpt-tile"><span>조회수 반영 후</span><b>—</b><small>결과 있는 사건 조회수가 6건 이상이면 나옵니다</small></div>
      </div>
      <div v-if="rule" class="bpt-two">
        <div class="bpt-box">
          <h3>조회수와 응찰 인원</h3>
          <svg viewBox="0 0 390 200" class="bpt-svg" role="img" aria-label="조회수와 응찰 인원 점 그림">
            <line x1="40" x2="370" y1="170" y2="170" class="grid" />
            <text x="40" y="190" class="ax">0</text><text x="370" y="190" class="ax" text-anchor="end">조회 {{ rule.vMax.toLocaleString('ko-KR') }}</text>
            <text x="34" y="24" class="ax" text-anchor="end">{{ rule.bMax }}명</text><text x="34" y="174" class="ax" text-anchor="end">0</text>
            <path v-if="rule.line" :d="rule.line" class="cv b" />
            <circle v-for="(d, i) in rule.dots" :key="i" :cx="d.x" :cy="d.y" r="5" class="act"><title>{{ d.tip }}</title></circle>
          </svg>
        </div>
        <div class="bpt-box">
          <h3>배운 규칙</h3>
          <p v-if="rule.vm" class="bpt-rule">조회수가 2배가 되면 응찰 인원이 약 {{ rule.twice!.toFixed(2) }}배</p>
          <p v-else class="bpt-rule">아직 배우지 못했습니다(결과 있는 사건 6건 이상 필요)</p>
          <p class="bpt-sub">점 하나가 사건 하나입니다. 유찰은 0명으로 들어갑니다. 가로는 조회수(많을수록 촘촘), 세로는 실제 응찰 인원입니다</p>
        </div>
      </div>
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
.bpt-box h3, .bpt-h3 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }
.bpt-h3 small { margin-left: 6px; font-size: 12px; font-weight: 400; color: #4b5563; }
.bpt-sub { margin: 0; font-size: 12px; color: #4b5563; }
.bpt-warn { margin: 0; font-size: 12px; color: #c4392f; }
.bpt-file { align-self: flex-start; display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 8px; background: #2b6df3; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.bpt-file input { display: none; }
.bpt-date { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.bpt-date input { height: 32px; border: 1px solid #d5dbe5; border-radius: 8px; padding: 0 8px; font: inherit; }
.bpt textarea { width: 100%; box-sizing: border-box; border: 1px solid #d5dbe5; border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; line-height: 1.6; resize: vertical; }
.bpt textarea:focus, .bpt textarea:not(:placeholder-shown) { border-color: #2b6df3; outline: none; }
.bpt-tbl-wrap { border: 1px solid #e3e7ee; border-radius: 8px; overflow: auto; }
.bpt-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.bpt-tbl th { background: #f4f6fa; font-weight: 700; color: #374151; padding: 8px 10px; white-space: nowrap; border-bottom: 1px solid #e3e7ee; }
.bpt-tbl td { padding: 7px 10px; border-bottom: 1px solid #eef1f6; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bpt-tbl tr:last-child td { border-bottom: 0; }
.bpt-tbl .l { text-align: left; }
.bpt-tbl .r { text-align: right; }
.bpt-tbl td.addr { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
.bpt-tbl td.strong { font-weight: 800; color: #1f5fe0; }
.bpt-tbl tbody tr { cursor: pointer; }
.bpt-tbl tbody tr.ro { cursor: default; }
.bpt-scroll { max-height: 420px; }
.bpt-scroll thead th { position: sticky; top: 0; z-index: 1; }
.bpt-tbl tbody tr.on td { background: #f5f8ff; }
.bpt-tbl tbody tr.off td { color: #9ca3af; }
.bpt-link { border: 0; background: none; padding: 0; font: inherit; color: #1f5fe0; cursor: pointer; }
.bpt-flow, .bpt-score { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.bpt-score { grid-template-columns: repeat(2, minmax(0, 260px)); }
.bpt-tile { border: 1px solid #e3e7ee; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
.bpt-tile.key { background: #f5f8ff; border-color: #dbe5fa; }
.bpt-tile span { font-size: 12px; color: #4b5563; }
.bpt-tile b { font-size: 19px; font-variant-numeric: tabular-nums; }
.bpt-tile.key b { color: #1f5fe0; }
.bpt-tile small { font-size: 12px; color: #4b5563; }
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
.bpt-range { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.bpt-range input { height: 32px; border: 1px solid #d5dbe5; border-radius: 8px; padding: 0 8px; font: inherit; }
.bpt-btns { display: flex; gap: 8px; }
.bpt-btn { height: 36px; padding: 0 14px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.bpt-btn.line { background: #fff; color: #2b6df3; border: 1px solid #2b6df3; }
.bpt-btn:disabled { opacity: .45; cursor: default; }
.bpt-at { display: block; font-size: 12px; color: #6b7280; }
.bpt-at.after { color: #c4392f; }
.bpt-rule { margin: 0; font-size: 15px; font-weight: 700; color: #111827; }
@media (max-width: 900px) { .bpt-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bpt-two { grid-template-columns: minmax(0, 1fr); } }
</style>
