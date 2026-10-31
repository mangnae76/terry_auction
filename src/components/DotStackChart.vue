<script setup lang="ts">
// 점 쌓기 분포도 — 거래 1건 = 점 1개(많으면 N건씩 묶는다)를 구간 칸에 쌓는다.
// 기준(면적 · 금액 · 연식 · 층)을 바꾸면 같은 점들이 날아가 새 구간으로 다시 쌓인다.
// 칸 위에는 건수와 그 칸의 중간값. 점 색은 계약연도 · 연식 · 층 · 금액 중에서 고른다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DongTradeDetailRow } from '../services/publicDataApi';
import { CHART_ICONS } from '../services/chartIcons';

export type DotBucket = { label: string; test: (r: DongTradeDetailRow) => boolean };
export type DotView = { key: string; title: string; icon?: string; buckets: DotBucket[] };

const props = defineProps<{ rows: DongTradeDetailRow[]; views: DotView[] }>();

const MIN_DOT = 9;                 // 점 지름 하한
const MAX_H = 900;                 // 판 높이 상한 — 이 안에 한 건씩 다 들어가면 묶지 않는다
const PER_STEPS = [1, 10, 50, 100]; // 점 하나에 담는 건수 — 딱 떨어지는 수만
const RARE = 0.01;                // 전체의 1% 미만 구간은 칸에서 뺀다(30평~ 2건 같은 칸이 판을 좁혔다)
const EOK = 100_000_000;
const thisYear = new Date().getFullYear();
const ageOf = (r: DongTradeDetailRow) => (r.buildYear ? thisYear - r.buildYear + 1 : 99);

const viewKey = ref(props.views[0]?.key ?? '');
// 기본 색은 연식 — 기간이 1년이면 계약연도는 두 가지뿐이라 거의 한 색(짙은 남색)으로 빽빽해 눈이 아팠다
const colorKey = ref<'year' | 'age' | 'floor' | 'price'>('age');
const view = computed(() => props.views.find((v) => v.key === viewKey.value) ?? props.views[0]);
const per = ref(1);
/** 뺀 구간 — 설명 줄에 적는다 */
const dropped = ref<Array<{ label: string; n: number }>>([]);

const COLOR_KEYS = {
  year: { label: '계약연도', icon: CHART_ICONS.year, tier: (r: DongTradeDetailRow, years: number[]) => Math.max(0, 4 - (years[years.length - 1] - Number(r.contractDate.slice(0, 4)))) },
  age: { label: '연식', icon: CHART_ICONS.age, tier: (r: DongTradeDetailRow) => { const a = ageOf(r); return a <= 5 ? 4 : a <= 10 ? 3 : a <= 15 ? 2 : a <= 20 ? 1 : 0; } },
  floor: { label: '층수', icon: CHART_ICONS.floor, tier: (r: DongTradeDetailRow) => (r.floorNum <= 1 ? 0 : r.floorNum === 2 ? 1 : r.floorNum === 3 ? 2 : r.floorNum === 4 ? 3 : 4) },
  price: { label: '금액', icon: CHART_ICONS.price, tier: (r: DongTradeDetailRow) => (r.priceWon < 1.2 * EOK ? 0 : r.priceWon < 1.4 * EOK ? 1 : r.priceWon < 1.6 * EOK ? 2 : r.priceWon < 2 * EOK ? 3 : 4) },
} as const;
const years = computed(() => [...new Set(props.rows.map((r) => Number(r.contractDate.slice(0, 4))))].sort());
const legend = computed(() => {
  if (colorKey.value === 'year') { const ys = years.value.slice(-5); return ys.map((y, i) => ({ tone: 5 - ys.length + i, label: `${y}년` })); }
  if (colorKey.value === 'age') return [[4, '5년차 이하'], [3, '6~10년차'], [2, '11~15년차'], [1, '16~20년차'], [0, '21년차 이상']].map(([tone, label]) => ({ tone: tone as number, label: label as string }));
  if (colorKey.value === 'floor') return ['지하 · 1층', '2층', '3층', '4층', '5층 이상'].map((label, tone) => ({ tone, label }));
  return ['1.2억 미만', '1.2~1.4억', '1.4~1.6억', '1.6~2억', '2억 이상'].map((label, tone) => ({ tone, label }));
});

const eok = (won: number) => (won >= EOK ? `${Number((won / EOK).toFixed(2))}억` : `${Math.round(won / 10000).toLocaleString('ko-KR')}만`);

/** 한눈에 — 지금 기준(면적 · 금액 · 연식 · 층)의 결과를 두세 마디로. 칸 숫자를 사람 말로 다시 읽어 준다 */
const insight = computed(() => {
  const v = view.value; const rows = props.rows; if (!v || rows.length < 5) return '';
  const floor = Math.max(1, Math.ceil(rows.length * RARE));
  const med = (list: DongTradeDetailRow[]) => { const p = list.map((r) => r.priceWon).filter((x) => x > 0).sort((a, b) => a - b); return p.length ? p[Math.floor(p.length / 2)] : 0; };
  const g = v.buckets.map((b) => { const list = rows.filter((r) => b.test(r)); return { label: b.label, list, n: list.length, m: med(list) }; }).filter((x) => x.n >= floor);
  if (!g.length) return '';
  const total = g.reduce((a, x) => a + x.n, 0);
  const pct = (n: number, of: number) => Math.round((n / of) * 100);
  const top = [...g].sort((a, b) => b.n - a.n)[0];
  const parts = [`거래가 가장 많은 구간은 <b>${top.label}</b>입니다(${total.toLocaleString('ko-KR')}건 중 ${top.n.toLocaleString('ko-KR')}건, ${pct(top.n, total)}%).`];
  // 금액 기준은 칸 자체가 금액이라 중간값 비교를 빼고, 나머지는 중간값이 가장 낮은 · 높은 구간을 짚는다
  const priced = g.filter((x) => x.m > 0);
  if (v.key !== 'price' && priced.length >= 2) {
    const lo = priced.reduce((a, x) => (x.m < a.m ? x : a)); const hi = priced.reduce((a, x) => (x.m > a.m ? x : a));
    if (lo !== hi) parts.push(`중간값은 <b>${lo.label}</b> 구간이 ${eok(lo.m)}으로 가장 낮고, <b>${hi.label}</b> 구간이 ${eok(hi.m)}으로 가장 높습니다.`);
  }
  // 최근 6개월만 따로 — 많이 팔린 구간이 바뀌었으면 알려 준다
  const cut = Date.now() - 183 * 86400000;
  const recent = g.map((x) => ({ label: x.label, n: x.list.filter((r) => r.dealTime >= cut).length }));
  const rTotal = recent.reduce((a, x) => a + x.n, 0);
  if (rTotal >= 5) {
    const rTop = [...recent].sort((a, b) => b.n - a.n)[0];
    parts.push(rTop.label === top.label
      ? `최근 6개월(${rTotal.toLocaleString('ko-KR')}건)도 같은 구간이 ${pct(rTop.n, rTotal)}%로 가장 많습니다.`
      : `최근 6개월(${rTotal.toLocaleString('ko-KR')}건)은 <b>${rTop.label}</b> 구간이 ${pct(rTop.n, rTotal)}%로 가장 많아 흐름이 바뀌었습니다.`);
  }
  return parts.join(' ');
});

// ===== 그리기 =====
const cv = ref<HTMLCanvasElement | null>(null);
const tip = ref<{ x: number; y: number; lines: Array<[string, string]> } | null>(null);
type Dot = { key: string; rows: DongTradeDetailRow[]; tone: number; x: number; y: number; sx: number; sy: number; tx: number; ty: number; delay: number };
let dots: Dot[] = [];
let cols: Array<{ label: string; x: number; topY: number; n: number; median: number }> = [];
let W = 0; let H = 0; let D = 8; let t0 = 0; let raf = 0; let hover: Dot | null = null;
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const PAL = () => (dark()
  ? { tones: ['#22355c', '#2c4e8f', '#3d6cc4', '#6b9cff', '#b9d0ff'], ink: '#e8edf6', sub: '#9aa6ba', accent: '#6b9cff', line: '#2a3650' }
  : { tones: ['#cfdcf7', '#a3bff2', '#7299e8', '#4a78d8', '#2d56b3'], ink: '#111827', sub: '#6b7280', accent: '#2b6df3', line: '#e3e8f0' });
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const resize = () => {
  const el = cv.value; if (!el) return;
  const r = el.getBoundingClientRect(); const d = devicePixelRatio || 1;
  W = r.width; H = r.height; el.width = W * d; el.height = H * d;
  el.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
};

/** 구간마다 줄을 모아 오래된 것부터 아래로 쌓을 자리를 정한다. 같은 거래는 같은 점(key)이라 기준을 바꾸면 그 점이 옮겨 간다 */
const layout = (first: boolean) => {
  const v = view.value; if (!v || !W) return;
  const all = v.buckets.map((b, bi) => ({ b, bi, list: props.rows.filter((r) => b.test(r)).sort((a, c) => a.dealTime - c.dealTime) }));
  const floor = Math.max(1, Math.ceil(props.rows.length * RARE));
  const shown = all.filter((g) => g.list.length >= floor);
  dropped.value = all.filter((g) => g.list.length > 0 && g.list.length < floor).map((g) => ({ label: g.b.label, n: g.list.length }));
  const groups = shown.map((g) => g.list);
  const prev = new Map(dots.map((d) => [d.rows[0], d]));
  const tierOf = (r: DongTradeDetailRow) => COLOR_KEYS[colorKey.value].tier(r, years.value);
  const top = 46; const bottom = 34; const colW = W / Math.max(1, groups.length);
  const G = 3;
  // 점 하나에 몇 건 — 1건이 기본, 판 높이(최대 MAX_H) 안에 다 못 들어갈 만큼 많을 때만 10 · 50 · 100건(2 · 3건 같은 어중간한 묶음은 읽기 어렵다)
  const kMin = Math.max(1, Math.floor((colW - 14) / (MIN_DOT + G)));
  const needH = (p: number) => Math.ceil(Math.max(1, ...groups.map((g) => Math.ceil(g.length / p))) / kMin) * (MIN_DOT + G) + top + bottom + 4;
  per.value = PER_STEPS.find((p) => needH(p) <= MAX_H) ?? PER_STEPS[PER_STEPS.length - 1];
  {
    const want = Math.round(Math.min(MAX_H, Math.max(580, needH(per.value))));
    const el = cv.value;
    if (el && Math.abs(want - H) > 2) { el.style.height = `${want}px`; resize(); }
  }
  // 점 지름은 16 에서 줄여 가며 판 높이에 맞는 가장 큰 값
  const counts = groups.map((g) => Math.ceil(g.length / per.value)); const max = Math.max(1, ...counts);
  for (D = 16; D > MIN_DOT; D -= 1) { const kk = Math.max(1, Math.floor((colW - 14) / (D + G))); if (Math.ceil(max / kk) * (D + G) <= H - top - bottom) break; }
  const k = Math.max(1, Math.floor((colW - 14) / (D + G)));
  const next: Dot[] = [];
  cols = groups.map((g, ci) => {
    const x0 = ci * colW + (colW - k * (D + G) + G) / 2;
    for (let i = 0, n = 0; i < g.length; i += per.value, n += 1) {
      const chunk = g.slice(i, i + per.value);
      const key = `${chunk[0].dealTime}|${chunk[0].priceWon}|${chunk[0].jibun}|${chunk[0].floor}|${i}`;
      const tx = x0 + (n % k) * (D + G) + D / 2; const ty = H - bottom - Math.floor(n / k) * (D + G) - D / 2;
      const old = prev.get(chunk[0]);
      const dot: Dot = { key, rows: chunk, tone: tierOf(chunk[0]), x: tx, y: ty, tx, ty, sx: tx, sy: ty, delay: 0 };
      if (first || !old) { dot.sx = tx + (Math.random() - 0.5) * 40; dot.sy = -20 - Math.random() * 120; dot.delay = Math.floor(n / k) * 8 + Math.random() * 160; }
      else { dot.sx = old.x; dot.sy = old.y; dot.delay = Math.random() * 260; }
      next.push(dot);
    }
    const prices = g.map((r) => r.priceWon).filter((p) => p > 0).sort((a, c) => a - c);
    return { label: shown[ci].b.label, x: ci * colW + colW / 2, topY: H - bottom - Math.ceil(counts[ci] / k) * (D + G), n: g.length, median: prices.length ? prices[Math.floor(prices.length / 2)] : 0 };
  });
  dots = next; t0 = performance.now();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
};

function draw(now: number) {
  const el = cv.value; const c = el?.getContext('2d'); if (!c) return;
  const P = PAL(); const t = reduce ? 1e9 : now - t0; let busy = false;
  c.clearRect(0, 0, W, H);
  c.textAlign = 'center';
  cols.forEach((col) => {
    c.fillStyle = P.sub; c.font = '600 14px "Pretendard", "Apple SD Gothic Neo", sans-serif'; c.fillText(col.label, col.x, H - 12);
    if (!col.n) return;
    // 칸 위 두 줄 — 위 '거래 843건', 아래 파란 중간값('7,300만'). 파란 숫자 뜻은 위 안내 줄에 적는다
    c.fillStyle = P.ink; c.font = '700 14px "Pretendard", sans-serif'; c.fillText(`거래 ${col.n.toLocaleString('ko-KR')}건`, col.x, col.topY - 24);
    if (col.median) {
      const t = eok(col.median); const room = (cols.length > 1 ? cols[1].x - cols[0].x : W) - 8;
      c.fillStyle = P.accent; c.font = '700 13px "Pretendard", sans-serif';
      if (c.measureText(t).width > room) c.font = '700 12px "Pretendard", sans-serif';   // 칸이 좁으면 한 단계 작게 — 옆 칸 글과 겹치지 않게
      c.fillText(t, col.x, col.topY - 8);
    }
  });
  c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, H - 29.5); c.lineTo(W, H - 29.5); c.stroke();
  dots.forEach((d) => {
    const k = (t - d.delay) / 750; if (k < 1) busy = true;
    const e = ease(k); d.x = d.sx + (d.tx - d.sx) * e; d.y = d.sy + (d.ty - d.sy) * e;
    c.fillStyle = P.tones[d.tone] ?? P.tones[2]; c.beginPath(); c.arc(d.x, d.y, D / 2, 0, Math.PI * 2); c.fill();
  });
  if (hover) { c.strokeStyle = P.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(hover.x, hover.y, D / 2 + 2, 0, Math.PI * 2); c.stroke(); }
  raf = busy ? requestAnimationFrame(draw) : 0;
}
const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

const onMove = (e: MouseEvent) => {
  const el = cv.value; if (!el) return;
  const b = el.getBoundingClientRect(); const x = e.clientX - b.left; const y = e.clientY - b.top;
  let best: Dot | null = null; let bd = Math.max(36, D * D);
  dots.forEach((d) => { const dd = (d.x - x) ** 2 + (d.y - y) ** 2; if (dd < bd) { bd = dd; best = d; } });
  if (best !== hover) { hover = best; redraw(); }
  const h = best as Dot | null;
  if (!h) { tip.value = null; return; }
  const r = h.rows[0];
  const lines: Array<[string, string]> = h.rows.length > 1
    ? [['거래', `${h.rows.length}건 묶음`], ['계약', (() => { const ds = h.rows.map((x) => x.contractDate).sort(); return ds[0] === ds[ds.length - 1] ? ds[0] : `${ds[0]} ~ ${ds[ds.length - 1]}`; })()], ['첫 거래', `${r.umdNm} ${r.jibun} ${r.name}`.trim()], ['금액', `${eok(Math.min(...h.rows.map((x) => x.priceWon)))} ~ ${eok(Math.max(...h.rows.map((x) => x.priceWon)))}`]]
    : [['주소', `${r.umdNm} ${r.jibun} ${r.name}`.trim()], ['계약일', r.contractDate], ['금액', eok(r.priceWon)], ['전용', `${r.areaM2.toFixed(2)}㎡ / ${r.pyeong.toFixed(2)}평`], ['층 · 건축', `${r.floor || '-'}층 · ${r.buildYear ? `${r.buildYear}년(${ageOf(r)}년차)` : '-'}`]];
  tip.value = { x: Math.min(h.x + 20, W - 230), y: Math.max(h.y - 80, 4), lines };
};
const onLeave = () => { hover = null; tip.value = null; redraw(); };

const pickView = (k: string) => { if (k !== viewKey.value) { viewKey.value = k; layout(false); } };
const pickColor = (k: keyof typeof COLOR_KEYS) => { colorKey.value = k; dots.forEach((d) => { d.tone = COLOR_KEYS[k].tier(d.rows[0], years.value); }); redraw(); };
const replay = () => { dots = []; layout(true); };

watch(() => props.rows, () => layout(true));
watch(() => props.views.map((v) => v.buckets.map((b) => b.label).join()).join('|'), () => layout(false));
let ro: ResizeObserver | null = null;
onMounted(() => {
  resize(); layout(true);
  ro = new ResizeObserver(() => { resize(); layout(false); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect(); });
</script>

<template>
  <section class="dsc">
    <div class="dsc-top">
      <!-- 상세분포 단추와 같은 꼴(같은 폭 · 높이 40 · 아이콘 18) -->
      <!-- 왼쪽 — 기준 단추, 그 아래 읽는 법 한 줄(오른쪽 색 범례 줄과 나란히 — 판이 위로 올라온다) -->
      <div class="dsc-left">
        <div class="dsc-kinds" role="tablist" aria-label="분포 기준">
          <button v-for="v in views" :key="v.key" type="button" :class="{ on: viewKey === v.key }" @click="pickView(v.key)"><svg v-if="v.icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="v.icon" /></svg>{{ v.title }}</button>
        </div>
        <p class="dsc-read">점 하나가 거래 <b>{{ per > 1 ? `${per}건` : '한 건' }}</b>입니다. 칸마다 아래가 오래된 거래, 위가 최근 거래이고, 칸 위 파란 숫자는 중간값입니다.<template v-if="dropped.length"> 거래가 1% 미만인 구간({{ dropped.map((x) => `${x.label} ${x.n}건`).join(' · ') }})은 뺐습니다.</template></p>
      </div>
      <!-- '색' 은 단추 밖에 한 번만 — 단추마다 '색 ○○' 이라 적으니 말이 겹쳤다 -->
      <div class="dsc-right">
        <div class="dsc-colors">
          <span class="dsc-colors-lab">색</span>
          <div class="dsc-seg sm" role="tablist" aria-label="점 색">
            <button v-for="(c, k) in COLOR_KEYS" :key="k" type="button" :class="{ on: colorKey === k }" @click="pickColor(k)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="c.icon" /></svg>{{ c.label }}</button>
          </div>
        </div>
        <!-- 색 뜻은 색 단추 바로 아래 — 단추와 범례가 이어져 보이게 -->
        <div class="dsc-legend"><span class="dsc-legend-lab">범례</span><span v-for="l in legend" :key="l.label" class="dsc-key"><i :class="`t${l.tone}`" />{{ l.label }}</span></div>
      </div>
    </div>
    <div class="dsc-board">
      <canvas ref="cv" class="dsc-cv" aria-label="점 쌓기 분포도" @mousemove="onMove" @mouseleave="onLeave" />
      <div v-if="tip" class="dsc-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <template v-for="l in tip.lines" :key="l[0]"><b>{{ l[0] }}</b><span>{{ l[1] }}</span></template>
      </div>
    </div>
    <!-- 한눈에 — 결과를 사람 말로 -->
    <p v-if="insight" class="dsc-sum"><b>한눈에</b><span v-html="insight" /></p>
    <div class="dsc-foot">
      <button type="button" class="dsc-replay" @click="replay">다시 쌓기</button>
    </div>
  </section>
</template>

<style scoped>
.dsc { display: flex; flex-direction: column; gap: 10px; }
.dsc-top { display: grid; grid-template-columns: minmax(0, 640px) auto; justify-content: space-between; align-items: center; gap: 8px 16px; }
.dsc-top > .dsc-left, .dsc-top > .dsc-right { display: contents; }   /* 두 묶음을 풀어 한 격자에 — 안내 줄과 범례가 같은 줄에 선다 */
.dsc-top .dsc-kinds { grid-column: 1; grid-row: 1; }
.dsc-top .dsc-read { grid-column: 1; grid-row: 2; }
.dsc-top .dsc-colors { grid-column: 2; grid-row: 1; justify-self: end; }
.dsc-top .dsc-legend { grid-column: 2; grid-row: 2; justify-self: end; }
@media (max-width: 900px) {
  .dsc-top { grid-template-columns: minmax(0, 1fr); }
  .dsc-top .dsc-kinds { grid-row: 1; } .dsc-top .dsc-colors { grid-column: 1; grid-row: 2; justify-self: start; }
  .dsc-top .dsc-read { grid-row: 3; } .dsc-top .dsc-legend { grid-column: 1; grid-row: 4; justify-self: start; }
}
.dsc-kinds { flex: 1 1 520px; max-width: 640px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.dsc-kinds button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 14px; border: 1px solid #e3e8f0; border-radius: 8px; background: #fff; font-family: inherit; font-size: 15px; font-weight: 700; color: #4b5563; cursor: pointer; }
.dsc-kinds button.on { border-color: #2b6df3; color: #2b6df3; background: #eef4ff; }
.dsc-seg { display: grid; grid-auto-flow: column; gap: 6px; }
.dsc-seg button { height: 40px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 14px; font-weight: 700; color: #6b7280; cursor: pointer; }
.dsc-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.dsc-left { flex: 1 1 520px; max-width: 640px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dsc-left .dsc-kinds { flex: none; max-width: none; }
.dsc-legend { display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-end; font-size: 13px; color: #6b7280; }
.dsc-colors { display: inline-flex; align-items: center; gap: 8px; }
.dsc-colors-lab { font-size: 13px; font-weight: 700; color: #6b7280; }
.dsc-seg.sm button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 78px; height: 34px; font-size: 13px; padding: 0 12px; }
.dsc-seg button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.dsc-read { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6; }
.dsc-read b { color: #2b6df3; }
.dsc-sum { display: flex; gap: 10px; margin: 0; padding: 12px 14px; border-radius: 8px; background: #f5f8ff; font-size: 14px; line-height: 1.6; color: #374151; }
.dsc-sum > b { flex: none; font-weight: 800; color: #1f2a44; }
.dsc-sum :deep(b) { font-weight: 800; color: #2b6df3; }
.dsc-board { position: relative; background: #f6f8fb; border: 1px solid #e3e8f0; border-radius: 10px; padding: 12px 10px 6px; }
.dsc-cv { display: block; width: 100%; height: 580px; }   /* 높이는 그릴 때 거래 수에 맞춰 다시 정한다(580 ~ 900) */
.dsc-tip { position: absolute; z-index: 5; pointer-events: none; display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; min-width: 200px; padding: 9px 11px; border-radius: 8px; background: #1f2937; color: #f3f4f6; font-size: 12.5px; line-height: 1.55; box-shadow: 0 10px 24px rgba(17, 24, 39, .25); }
.dsc-tip b { font-weight: 600; color: #9aa6ba; }
.dsc-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #6b7280; }
.dsc-key { display: inline-flex; align-items: center; gap: 5px; }
.dsc-legend-lab { font-weight: 700; color: #374151; }
.dsc-key i { width: 10px; height: 10px; border-radius: 50%; }
.dsc-key i.t0 { background: #cfdcf7; } .dsc-key i.t1 { background: #a3bff2; } .dsc-key i.t2 { background: #7299e8; } .dsc-key i.t3 { background: #4a78d8; } .dsc-key i.t4 { background: #2d56b3; }
.dsc-replay { margin-left: auto; height: 32px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 13px; font-weight: 700; color: #2b6df3; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .dsc-replay { display: none; } }
</style>
