<script setup lang="ts">
// 동 × 구간 버블 판 — 상세분포의 표를 원으로. 원 크기 = 그 칸 거래건수, 원 색 = 그 칸의 평균 평당가.
// 구간(가격대 · 면적 · 연식 · 층)을 바꾸면 앞 원은 제자리에서 오그라들고 새 원이 칸마다 물결처럼 튀어나온다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DongTradeDetailRow } from '../services/publicDataApi';

type Bucket = { label: string; test: (r: DongTradeDetailRow) => boolean };
const props = defineProps<{ rows: DongTradeDetailRow[]; buckets: Bucket[]; dongs: string[] }>();
const emit = defineEmits<{ 'pick-dong': [string] }>();

const EOK = 100_000_000;
const ROW_H = 46; const TOP = 40; const LEFT = 88; const RIGHT = 104;
const unitOf = (r: DongTradeDetailRow) => (r.priceWon > 0 && r.pyeong > 0 ? r.priceWon / r.pyeong : 0);
const man = (won: number) => `${Math.round(won / 10000).toLocaleString('ko-KR')}만`;
const eok = (won: number) => (won >= EOK ? `${Number((won / EOK).toFixed(2))}억` : man(won));

type Cell = { ri: number; ci: number; dong: string; n: number; avg: number; unit: number; tone: number; x: number; y: number; r: number };
const cells = computed(() => {
  const out: Cell[] = [];
  const units: number[] = [];
  props.dongs.forEach((dong, ri) => {
    const list = props.rows.filter((r) => r.umdNm === dong);
    props.buckets.forEach((b, ci) => {
      const l = list.filter(b.test);
      const us = l.map(unitOf).filter((v) => v > 0);
      const unit = us.length ? us.reduce((a, v) => a + v, 0) / us.length : 0;
      if (unit > 0) units.push(unit);
      out.push({ ri, ci, dong, n: l.length, avg: l.length ? l.reduce((a, r) => a + r.priceWon, 0) / l.length : 0, unit, tone: -1, x: 0, y: 0, r: 0 });
    });
  });
  units.sort((a, c) => a - c);
  const q = [0.2, 0.4, 0.6, 0.8].map((f) => units[Math.floor(f * (units.length - 1))] ?? 0);
  out.forEach((c) => { c.tone = c.unit > 0 ? q.filter((v) => c.unit > v).length : 0; });
  return { list: out, edges: [units[0] ?? 0, ...q, units[units.length - 1] ?? 0] };
});
const totals = computed(() => props.dongs.map((d) => props.rows.filter((r) => r.umdNm === d).length));
const height = computed(() => TOP + Math.max(1, props.dongs.length) * ROW_H + 8);

/** 한눈에 — 가장 몰린 칸, 평당가가 가장 높은 · 낮은 동(거래 10건 이상), 전체 평균 */
const insight = computed(() => {
  const top = [...cells.value.list].sort((a, c) => c.n - a.n)[0];
  if (!top || !top.n) return '';
  const all = props.rows.map(unitOf).filter((v) => v > 0);
  const avg = all.length ? all.reduce((a, v) => a + v, 0) / all.length : 0;
  const byDong = props.dongs.map((d) => { const us = props.rows.filter((r) => r.umdNm === d).map(unitOf).filter((v) => v > 0); return { d, n: us.length, u: us.length ? us.reduce((a, v) => a + v, 0) / us.length : 0 }; }).filter((x) => x.n >= 10).sort((a, c) => c.u - a.u);
  const hi = byDong[0]; const lo = byDong[byDong.length - 1];
  return `거래가 가장 몰린 칸은 <em>${top.dong} · ${props.buckets[top.ci].label}</em>(${top.n.toLocaleString('ko-KR')}건)입니다. 평균 평당가는 전체 ${man(avg)}이고, 거래 10건 이상인 동 중 가장 높은 곳은 <em>${hi?.d ?? '-'}(${hi ? man(hi.u) : '-'})</em>, 가장 낮은 곳은 <em>${lo?.d ?? '-'}(${lo ? man(lo.u) : '-'})</em>입니다.`;
});

// ===== 그리기 =====
const cv = ref<HTMLCanvasElement | null>(null);
const tip = ref<{ x: number; y: number; lines: Array<[string, string]> } | null>(null);
let W = 0; let H = 0; let t0 = 0; let raf = 0; let prev: Cell[] = []; let hover: Cell | null = null;
/** 마지막으로 그린 원 — 구간을 바꾸면 이 원들이 제자리에서 오그라든다 */
let lastDrawn: Cell[] = [];
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const PAL = () => (dark()
  ? { tones: ['#1f2f52', '#2c4e8f', '#3d6cc4', '#6b9cff', '#b9d0ff'], ink: '#e8edf6', sub: '#9aa6ba', grid: '#232d42', bar: '#2a3650' }
  : { tones: ['#dbe6fb', '#a9c3f3', '#6f98e8', '#3a6fd8', '#1a43a1'], ink: '#111827', sub: '#6b7280', grid: '#eef1f6', bar: '#e3e8f0' });
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

const resize = () => {
  const el = cv.value; if (!el) return;
  const r = el.getBoundingClientRect(); const d = devicePixelRatio || 1;
  W = r.width; H = r.height; el.width = W * d; el.height = H * d;
  el.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
};
function draw(now: number) {
  const c = cv.value?.getContext('2d'); if (!c || !W) return;
  const P = PAL(); const t = reduce ? 1e9 : now - t0; let busy = false;
  const nb = props.buckets.length; const cw = (W - LEFT - RIGHT) / Math.max(1, nb); const rmax = Math.min(cw, ROW_H) / 2 - 3;
  const max = Math.max(1, ...cells.value.list.map((x) => x.n)); const tmax = Math.max(1, ...totals.value);
  c.clearRect(0, 0, W, H);
  c.textAlign = 'center'; c.fillStyle = P.sub; c.font = '600 12px "Pretendard", "Apple SD Gothic Neo", sans-serif';
  props.buckets.forEach((b, ci) => c.fillText(b.label, LEFT + cw * (ci + 0.5), 22));
  props.dongs.forEach((d, ri) => {
    const y = TOP + ROW_H * (ri + 0.5);
    c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(LEFT, y + 0.5); c.lineTo(W - RIGHT, y + 0.5); c.stroke();
    c.textAlign = 'right'; c.fillStyle = P.ink; c.font = '600 13px "Pretendard", sans-serif'; c.fillText(d, LEFT - 14, y + 4);
    const bw = (totals.value[ri] / tmax) * (RIGHT - 52);
    c.fillStyle = P.bar; c.beginPath(); c.roundRect(W - RIGHT + 12, y - 4, Math.max(bw, 2), 8, 4); c.fill();
    c.textAlign = 'left'; c.fillStyle = P.sub; c.font = '700 12px "Pretendard", sans-serif'; c.fillText(totals.value[ri].toLocaleString('ko-KR'), W - RIGHT + 16 + bw, y + 4);
  });
  prev.forEach((p) => {
    const s = 1 - ease(t / 260); if (s <= 0 || !p.r) return; busy = true;
    c.globalAlpha = s; c.fillStyle = P.tones[p.tone]; c.beginPath(); c.arc(p.x, p.y, p.r * s, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  });
  cells.value.list.forEach((cell) => {
    cell.x = LEFT + cw * (cell.ci + 0.5); cell.y = TOP + ROW_H * (cell.ri + 0.5);
    if (!cell.n) { cell.r = 0; return; }
    const k = (t - 160 - cell.ci * 45 - cell.ri * 14) / 520; if (k < 1) busy = true;
    const s = reduce ? 1 : k <= 0 ? 0 : k >= 1 ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);   // 살짝 튀어나왔다 앉는다
    const r = Math.max(2.5, Math.sqrt(cell.n / max) * rmax); cell.r = r;
    if (s <= 0) return;
    c.fillStyle = P.tones[cell.tone]; c.beginPath(); c.arc(cell.x, cell.y, r * s, 0, Math.PI * 2); c.fill();
    if (s > 0.98 && r > 13) { c.textAlign = 'center'; c.fillStyle = cell.tone >= 3 ? '#fff' : P.ink; c.font = '700 11px "Pretendard", sans-serif'; c.fillText(String(cell.n), cell.x, cell.y + 4); }
  });
  lastDrawn = cells.value.list;
  if (hover && hover.n) { c.strokeStyle = P.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(hover.x, hover.y, hover.r + 2, 0, Math.PI * 2); c.stroke(); }
  raf = busy ? requestAnimationFrame(draw) : 0;
  if (!busy) prev = [];
}
const play = (keepPrev: boolean) => {
  prev = keepPrev ? lastDrawn.map((x) => ({ ...x })) : [];
  t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
};
const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

const onMove = (e: MouseEvent) => {
  const b = cv.value?.getBoundingClientRect(); if (!b) return;
  const x = e.clientX - b.left; const y = e.clientY - b.top;
  const hit = cells.value.list.find((cl) => cl.n && (cl.x - x) ** 2 + (cl.y - y) ** 2 <= (cl.r + 3) ** 2) ?? null;
  if (hit !== hover) { hover = hit; redraw(); }
  if (!hit) { tip.value = null; return; }
  const rowN = totals.value[hit.ri] || 1;
  tip.value = { x: Math.min(hit.x + hit.r + 16, W - 220), y: Math.max(hit.y - 44, 4), lines: [['동', hit.dong], ['구간', props.buckets[hit.ci].label], ['거래', `${hit.n.toLocaleString('ko-KR')}건 (이 동의 ${Math.round((hit.n / rowN) * 100)}%)`], ['평균가', eok(hit.avg)], ['평균 평당가', hit.unit ? man(hit.unit) : '-']] };
};
const onLeave = () => { hover = null; tip.value = null; redraw(); };
/** 동 이름 자리를 누르면 그 동으로 좁힌다(표의 동 이름 단추와 같다) */
const onClick = (e: MouseEvent) => {
  const b = cv.value?.getBoundingClientRect(); if (!b) return;
  const x = e.clientX - b.left; const y = e.clientY - b.top;
  if (x > LEFT || y < TOP) return;
  const ri = Math.floor((y - TOP) / ROW_H);
  if (props.dongs[ri]) emit('pick-dong', props.dongs[ri]);
};

// 구간을 바꾸면(앞 원을 남겨 두려고) 바뀌기 직전 값을 잡아 둔다
watch(() => props.buckets.map((b) => b.label).join('|'), () => play(true));
watch(() => [props.rows, props.dongs.join('|')], () => { requestAnimationFrame(() => { resize(); play(false); }); });
let ro: ResizeObserver | null = null;
onMounted(() => {
  resize(); play(false);
  ro = new ResizeObserver(() => { resize(); redraw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect(); });
</script>

<template>
  <div class="bm">
    <div class="bm-read">
      <p><b>읽는법</b><span>줄 하나가 동 하나입니다. <em>원이 클수록 그 칸 거래가 많고, 색이 진할수록 비쌉니다</em>(평균 평당가). 같은 줄의 큰 원이 그 동의 주력 상품이고, 같은 칸을 위아래로 보면 동끼리 값 차이가 보입니다. 동 이름을 누르면 그 동으로 좁힙니다.</span></p>
      <p v-if="insight"><b>한눈에</b><span v-html="insight" /></p>
    </div>
    <div class="bm-board">
      <canvas ref="cv" class="bm-cv" :style="{ height: `${height}px` }" aria-label="동 × 구간 버블 판" @mousemove="onMove" @mouseleave="onLeave" @click="onClick" />
      <div v-if="tip" class="bm-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <template v-for="l in tip.lines" :key="l[0]"><b>{{ l[0] }}</b><span>{{ l[1] }}</span></template>
      </div>
    </div>
    <div class="bm-foot">
      <span>평균 평당가</span>
      <span v-for="i in 5" :key="i" class="bm-key"><i :class="`t${i - 1}`" />{{ man(cells.edges[i - 1]) }}~{{ man(cells.edges[i]) }}</span>
    </div>
  </div>
</template>

<style scoped>
.bm { display: flex; flex-direction: column; gap: 10px; }
.bm-read { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid #e3e8f0; border-radius: 10px; background: #fff; font-size: 14px; line-height: 1.65; color: #111827; }
.bm-read p { margin: 0; display: grid; grid-template-columns: 64px 1fr; gap: 10px; }
.bm-read b { font-size: 12px; font-weight: 700; color: #2b6df3; padding-top: 2px; }
.bm-read :deep(em) { font-style: normal; font-weight: 600; background: linear-gradient(transparent 62%, #eef3ff 62%); }
.bm-board { position: relative; background: #fff; border: 1px solid #e3e8f0; border-radius: 10px; padding: 10px 10px 6px; overflow-x: auto; }
.bm-cv { display: block; width: 100%; min-width: 720px; cursor: default; }
.bm-tip { position: absolute; z-index: 5; pointer-events: none; display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; min-width: 190px; padding: 9px 11px; border-radius: 8px; background: #1f2937; color: #f3f4f6; font-size: 12.5px; line-height: 1.55; box-shadow: 0 10px 24px rgba(17, 24, 39, .25); }
.bm-tip b { font-weight: 600; color: #9aa6ba; }
.bm-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #6b7280; }
.bm-key { display: inline-flex; align-items: center; gap: 5px; }
.bm-key i { width: 18px; height: 10px; border-radius: 3px; }
.bm-key i.t0 { background: #dbe6fb; } .bm-key i.t1 { background: #a9c3f3; } .bm-key i.t2 { background: #6f98e8; } .bm-key i.t3 { background: #3a6fd8; } .bm-key i.t4 { background: #1a43a1; }
</style>
