<script setup lang="ts">
// 거래 타임라인 — 점 하나 = 거래 한 건(가로 계약일 · 세로 금액), 검은 선 = 월별 중간값, 바닥 막대 = 월별 거래량.
// 열면 왼쪽 달부터 재생되고, 끝나면 가운데에 '다시 재생'. 달을 누르면 그 달을 고른다(v-model, 'YYYY.MM') — 아래 목록이 그 달로 좁혀진다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DongTradeDetailRow } from '../services/publicDataApi';

const props = defineProps<{ rows: DongTradeDetailRow[]; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const EOK = 100_000_000;
const thisYear = new Date().getFullYear();
const eok = (won: number) => (won >= EOK ? `${Number((won / EOK).toFixed(2))}억` : `${Math.round(won / 10000).toLocaleString('ko-KR')}만`);
const monthOf = (r: DongTradeDetailRow) => r.contractDate.slice(0, 7);          // 'YYYY.MM'
const monthStart = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).getTime();
const monthEnd = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1).getTime();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const colorKey = ref<'age' | 'floor' | 'area'>('age');
const COLORS = {
  age: { label: '연식', keys: ['21년차 이상', '16~20년차', '11~15년차', '6~10년차', '5년차 이하'], tier: (r: DongTradeDetailRow) => { const a = r.buildYear ? thisYear - r.buildYear + 1 : 99; return a <= 5 ? 4 : a <= 10 ? 3 : a <= 15 ? 2 : a <= 20 ? 1 : 0; } },
  floor: { label: '층', keys: ['지하 · 1층', '2층', '3층', '4층', '5층 이상'], tier: (r: DongTradeDetailRow) => (r.floorNum <= 1 ? 0 : r.floorNum === 2 ? 1 : r.floorNum === 3 ? 2 : r.floorNum === 4 ? 3 : 4) },
  area: { label: '면적', keys: ['10평 미만', '10~15평', '15~20평', '20~25평', '25평 이상'], tier: (r: DongTradeDetailRow) => (r.pyeong < 10 ? 0 : r.pyeong < 15 ? 1 : r.pyeong < 20 ? 2 : r.pyeong < 25 ? 3 : 4) },
} as const;

const deals = computed(() => props.rows.filter((r) => r.priceWon > 0 && r.contractDate).slice().sort((a, b) => a.dealTime - b.dealTime));
const months = computed(() => [...new Set(deals.value.map(monthOf))].sort());
const stats = computed(() => months.value.map((m) => { const l = deals.value.filter((r) => monthOf(r) === m); return { m, n: l.length, med: median(l.map((r) => r.priceWon)) }; }));
/** 세로 끝 — 위쪽 몇 건 때문에 판이 눌리지 않게 95% 지점 기준으로 깔끔한 값 */
const yTop = computed(() => {
  const s = deals.value.map((r) => r.priceWon).sort((a, b) => a - b);
  const p95 = s[Math.floor(s.length * 0.95)] ?? EOK;
  const raw = p95 * 1.15; const mag = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(raw / (mag / 2)) * (mag / 2);
});
const insight = computed(() => {
  const st = stats.value; if (st.length < 2) return '';
  const busiest = [...st].sort((a, b) => b.n - a.n)[0];
  const k = Math.min(3, Math.floor(st.length / 2));
  const pick = (ms: string[]) => median(deals.value.filter((r) => ms.includes(monthOf(r))).map((r) => r.priceWon));
  const headMs = st.slice(0, k).map((s) => s.m); const tailMs = st.slice(-k).map((s) => s.m);
  const head = pick(headMs); const tail = pick(tailMs);
  const chg = head ? (tail / head - 1) * 100 : 0;
  const ym = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
  // 어느 달인지 괄호로 — '처음 3개월(25년 10월 · 11월 · 12월)'
  const months = (ms: string[]) => ms.map((m, i) => (i === 0 || m.slice(0, 4) !== ms[i - 1].slice(0, 4) ? `${m.slice(2, 4)}년 ${Number(m.slice(5, 7))}월` : `${Number(m.slice(5, 7))}월`)).join(' · ');
  return `거래가 가장 많았던 달은 <em>${ym(busiest.m)}(${busiest.n.toLocaleString('ko-KR')}건)</em>입니다. 처음 ${k}개월(${months(headMs)}) 중간값 ${eok(head)} → 최근 ${k}개월(${months(tailMs)}) ${eok(tail)}으로 <em>${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</em> ${chg >= 0 ? '올랐습니다' : '내렸습니다'}.`;
});

// ===== 그리기 =====
const cv = ref<HTMLCanvasElement | null>(null);
const tip = ref<{ x: number; y: number; lines: Array<[string, string]> } | null>(null);
const playing = ref(false);
type Pt = { r: DongTradeDetailRow; x: number; y: number; jit: number };
let pts: Pt[] = [];
let W = 0; let H = 0; let play0 = 0; let raf = 0; let hover: Pt | null = null; let hoverM: string | null = null;
const PAD = { l: 60, r: 18, t: 16 }; const BAR_H = 70; const GAP = 26; const PLAY_MS = 3600;
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const PAL = () => (dark()
  ? { tones: ['#22355c', '#2c4e8f', '#3d6cc4', '#6b9cff', '#b9d0ff'], ink: '#e8edf6', sub: '#9aa6ba', grid: '#232d42', accent: '#6b9cff', soft: '#1f2c47', bar: '#2c4e8f', card: '#182031' }
  : { tones: ['#c9d8f8', '#9ab8f2', '#6493ea', '#2f6fe0', '#173f99'], ink: '#111827', sub: '#6b7280', grid: '#eef1f6', accent: '#2b6df3', soft: '#eef3ff', bar: '#a9c3f3', card: '#ffffff' });

const range = () => { const m = months.value; return m.length ? [monthStart(m[0]), monthEnd(m[m.length - 1])] : [0, 1]; };
const plotB = () => H - BAR_H - GAP;
const sx = (t: number) => { const [a, b] = range(); return PAD.l + ((t - a) / (b - a)) * (W - PAD.l - PAD.r); };
const sy = (p: number) => plotB() - (Math.min(Math.max(p, 0), yTop.value) / yTop.value) * (plotB() - PAD.t);
const mX = (m: string) => [sx(monthStart(m)), sx(monthEnd(m))];

const resize = () => {
  const el = cv.value; if (!el) return;
  const r = el.getBoundingClientRect(); const d = devicePixelRatio || 1;
  W = r.width; H = r.height; el.width = W * d; el.height = H * d;
  el.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
};
function draw(now: number) {
  const c = cv.value?.getContext('2d'); if (!c || !W) return;
  const P = PAL(); const [T0, T1] = range();
  const k = reduce ? 1 : Math.min(1, (now - play0) / PLAY_MS); const head = T0 + (T1 - T0) * k;
  const pick = props.modelValue;
  c.clearRect(0, 0, W, H);
  // 금액 눈금 다섯 줄
  c.font = '500 11px "Pretendard", sans-serif'; c.textAlign = 'right';
  // 눈금 간격은 1 · 2 · 2.5 · 5 × 10ⁿ 중에서 — 8,000만 · 1.6억 같은 어중간한 값이 서지 않게
  const raw = yTop.value / 5; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? raw;
  for (let v = step; v <= yTop.value + 1; v += step) { const y = sy(v); c.strokeStyle = P.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(PAD.l, y + 0.5); c.lineTo(W - PAD.r, y + 0.5); c.stroke(); c.fillStyle = P.sub; c.fillText(eok(v), PAD.l - 8, y + 4); }
  // 고른 달 · 마우스 올린 달 띠
  ([[pick, P.soft], [hoverM, P.grid]] as Array<[string | null, string]>).forEach(([m, col]) => { if (!m) return; const [a, b] = mX(m); c.fillStyle = col; c.fillRect(a, PAD.t, b - a, H - PAD.t - 18); });
  // 바닥 막대 — 월별 거래량
  const nmax = Math.max(1, ...stats.value.map((s) => s.n)); const base = H - 22; const per = (T1 - T0) / Math.max(1, months.value.length);
  stats.value.forEach((s) => {
    const [a, b] = mX(s.m); const mid = (a + b) / 2;
    const grow = Math.min(1, Math.max(0, (head - monthStart(s.m)) / per)); const h = (s.n / nmax) * (BAR_H - 16) * grow;
    c.fillStyle = s.m === pick ? P.accent : P.bar; c.beginPath(); c.roundRect(a + 5, base - h, Math.max(2, b - a - 10), h, [4, 4, 0, 0]); c.fill();
    c.textAlign = 'center';
    if (grow >= 1) { c.fillStyle = P.sub; c.font = '700 11px "Pretendard", sans-serif'; c.fillText(s.n.toLocaleString('ko-KR'), mid, base - h - 4); }
    c.fillStyle = P.sub; c.font = '600 11px "Pretendard", sans-serif'; c.fillText(`${Number(s.m.slice(5, 7))}월`, mid, H - 6);
  });
  // 점 — 재생 머리가 지나간 거래만, 막 나타난 점은 잠깐 크게
  pts.forEach((p) => {
    if (p.r.dealTime > head) return;
    const fresh = 1 - Math.min(1, (head - p.r.dealTime) / ((T1 - T0) / 30));
    p.x = sx(p.r.dealTime + 43_200_000) + (p.jit - 0.5) * 4; p.y = sy(p.r.priceWon);
    c.globalAlpha = pick && monthOf(p.r) !== pick ? 0.22 : 0.9;
    c.fillStyle = P.tones[COLORS[colorKey.value].tier(p.r)]; c.beginPath(); c.arc(p.x, p.y, 3.2 + fresh * 3, 0, Math.PI * 2); c.fill();
  });
  c.globalAlpha = 1;
  // 월별 중간값 선
  const line = stats.value.filter((s) => monthStart(s.m) + per / 2 <= head).map((s) => { const [a, b] = mX(s.m); return { x: (a + b) / 2, y: sy(s.med), s }; });
  if (line.length) {
    c.strokeStyle = P.ink; c.lineWidth = 2.2; c.beginPath(); line.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    line.forEach((p) => { c.fillStyle = P.card; c.beginPath(); c.arc(p.x, p.y, 4.5, 0, Math.PI * 2); c.fill(); c.strokeStyle = P.ink; c.lineWidth = 2; c.stroke(); });
    const last = line[line.length - 1]; c.fillStyle = P.ink; c.font = '700 12px "Pretendard", sans-serif'; c.textAlign = 'right'; c.fillText(`중간값 ${eok(last.s.med)}`, last.x - 10, last.y - 10);
  }
  if (k < 1) { const x = sx(head); c.strokeStyle = P.accent; c.lineWidth = 2; c.beginPath(); c.moveTo(x, PAD.t); c.lineTo(x, H - 22); c.stroke(); }
  if (hover) { c.strokeStyle = P.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(hover.x, hover.y, 6, 0, Math.PI * 2); c.stroke(); }
  playing.value = k < 1;
  raf = k < 1 ? requestAnimationFrame(draw) : 0;
}
const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
const replay = () => {
  pts = deals.value.map((r) => ({ r, x: -99, y: -99, jit: Math.random() }));
  play0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
};
const monthAt = (x: number) => months.value.find((m) => { const [a, b] = mX(m); return x >= a && x < b; }) ?? null;

const onMove = (e: MouseEvent) => {
  const b = cv.value?.getBoundingClientRect(); if (!b) return;
  const x = e.clientX - b.left; const y = e.clientY - b.top;
  let best: Pt | null = null; let bd = 49;
  pts.forEach((p) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } });
  hover = best; hoverM = monthAt(x); redraw();
  const h = best as Pt | null;
  if (h) {
    const r = h.r;
    tip.value = { x: Math.min(x + 18, W - 230), y: Math.max(y - 80, 4), lines: [['주소', `${r.umdNm} ${r.jibun} ${r.name}`.trim()], ['계약일', r.contractDate], ['금액', eok(r.priceWon)], ['전용', `${r.areaM2.toFixed(2)}㎡ / ${r.pyeong.toFixed(2)}평`], ['층 · 건축', `${r.floorNum <= 0 ? '지하' : `${r.floorNum}층`} · ${r.buildYear || '-'}년`]] };
  } else if (hoverM) {
    const i = months.value.indexOf(hoverM); const s = stats.value[i]; const p = stats.value[i - 1];
    const dn = p ? s.n - p.n : null; const dm = p && p.med ? (s.med / p.med - 1) * 100 : null;
    tip.value = { x: Math.min(x + 18, W - 230), y: Math.max(y - 80, 4), lines: [['달', `${hoverM.slice(0, 4)}년 ${Number(hoverM.slice(5, 7))}월`], ['거래', `${s.n.toLocaleString('ko-KR')}건${dn == null ? '' : ` (전달 ${dn >= 0 ? '+' : ''}${dn})`}`], ['중간값', `${eok(s.med)}${dm == null ? '' : ` (${dm >= 0 ? '+' : ''}${dm.toFixed(1)}%)`}`], ['누르면', '아래 목록이 이 달로']] };
  } else tip.value = null;
};
const onLeave = () => { hover = null; hoverM = null; tip.value = null; redraw(); };
const onClick = (e: MouseEvent) => {
  const b = cv.value?.getBoundingClientRect(); if (!b) return;
  const m = monthAt(e.clientX - b.left); if (!m) return;
  emit('update:modelValue', props.modelValue === m ? '' : m);
};
const pickColor = (k: keyof typeof COLORS) => { colorKey.value = k; redraw(); };

watch(() => props.rows, () => { resize(); replay(); });
watch(() => props.modelValue, redraw);
let ro: ResizeObserver | null = null;
onMounted(() => { resize(); replay(); ro = new ResizeObserver(() => { resize(); redraw(); }); if (cv.value) ro.observe(cv.value); });
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect(); });
</script>

<template>
  <section class="ttl">
    <div class="ttl-top">
      <strong>거래 타임라인 <em>(점 = 거래 한 건 · 정상 + 직거래)</em></strong>
      <div class="ttl-colors">
        <span class="ttl-colors-lab">색</span>
        <div class="ttl-seg" role="tablist" aria-label="점 색">
          <button v-for="(c, k) in COLORS" :key="k" type="button" :class="{ on: colorKey === k }" @click="pickColor(k)">{{ c.label }}</button>
        </div>
      </div>
    </div>
    <div class="ttl-read">
      <p><b>읽는 법</b><span>오른쪽으로 갈수록 최근, 위로 갈수록 고가 거래입니다. 검은 선은 월 중간값, 바닥 막대는 월 거래량입니다. 월을 누르면 그달 거래로 정리됩니다.</span></p>
      <p v-if="insight"><b>한눈에</b><span v-html="insight" /></p>
    </div>
    <div class="ttl-board">
      <canvas ref="cv" class="ttl-cv" aria-label="거래 타임라인" @mousemove="onMove" @mouseleave="onLeave" @click="onClick" />
      <div v-if="tip" class="ttl-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <template v-for="l in tip.lines" :key="l[0]"><b>{{ l[0] }}</b><span>{{ l[1] }}</span></template>
      </div>
      <button v-if="!playing && deals.length" type="button" class="ttl-play" aria-label="다시 재생" @click="replay">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg><span>다시 재생</span>
      </button>
    </div>
    <div class="ttl-foot"><span v-for="(l, i) in COLORS[colorKey].keys" :key="l" class="ttl-key"><i :class="`t${i}`" />{{ l }}</span></div>
  </section>
</template>

<style scoped>
.ttl { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.ttl-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ttl-top strong { font-size: 16px; font-weight: 800; color: #111827; }
.ttl-top strong em { font-style: normal; font-size: 13px; font-weight: 500; color: #6b7280; }
.ttl-colors { display: inline-flex; align-items: center; gap: 8px; }
.ttl-colors-lab { font-size: 13px; font-weight: 700; color: #6b7280; }
.ttl-seg { display: grid; grid-auto-flow: column; gap: 6px; }
.ttl-seg button { height: 34px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
.ttl-seg button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.ttl-read { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid #e3e8f0; border-radius: 10px; background: #fff; font-size: 14px; line-height: 1.65; color: #111827; }
.ttl-read p { margin: 0; display: grid; grid-template-columns: 64px 1fr; gap: 10px; }
.ttl-read b { font-size: 12px; font-weight: 700; color: #2b6df3; padding-top: 2px; }
.ttl-read :deep(em) { font-style: normal; font-weight: 600; background: linear-gradient(transparent 62%, #eef3ff 62%); }
.ttl-board { position: relative; background: #fff; border: 1px solid #e3e8f0; border-radius: 10px; padding: 12px 10px 6px; overflow-x: auto; }
.ttl-cv { display: block; width: 100%; min-width: 720px; height: 640px; cursor: crosshair; }
.ttl-tip { position: absolute; z-index: 5; pointer-events: none; display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; min-width: 200px; padding: 9px 11px; border-radius: 8px; background: #1f2937; color: #f3f4f6; font-size: 12.5px; line-height: 1.55; box-shadow: 0 10px 24px rgba(17, 24, 39, .25); }
.ttl-tip b { font-weight: 600; color: #9aa6ba; }
.ttl-play { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 3; display: inline-flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 22px 12px; border: 0; border-radius: 18px; background: rgba(255, 255, 255, .72); color: #2b6df3; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; opacity: .55; transition: opacity .2s, transform .2s; box-shadow: 0 8px 24px rgba(17, 24, 39, .10); backdrop-filter: blur(2px); }
.ttl-play svg { width: 56px; height: 56px; padding: 12px 10px 12px 14px; border-radius: 50%; background: #2b6df3; color: #fff; box-sizing: border-box; }
.ttl-board:hover .ttl-play, .ttl-play:focus-visible { opacity: 1; }
.ttl-play:hover { transform: translate(-50%, -50%) scale(1.05); }
.ttl-foot { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #6b7280; }
.ttl-key { display: inline-flex; align-items: center; gap: 5px; }
.ttl-key i { width: 10px; height: 10px; border-radius: 50%; }
.ttl-key i.t0 { background: #c9d8f8; } .ttl-key i.t1 { background: #9ab8f2; } .ttl-key i.t2 { background: #6493ea; } .ttl-key i.t3 { background: #2f6fe0; } .ttl-key i.t4 { background: #173f99; }
</style>
