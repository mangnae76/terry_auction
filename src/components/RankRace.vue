<script setup lang="ts">
// 동 순위 레이스 — 달마다 동별 누적 거래건수 막대가 자라고, 순위가 바뀌면 막대가 위아래로 미끄러진다(상위 10곳).
// 열면 재생되고, 끝나면 가운데에 흐린 '다시 재생'. 거래 1건 = 정상거래 · 직거래(계약해제는 부르는 쪽에서 뺀다).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DongTradeDetailRow } from '../services/publicDataApi';

const props = defineProps<{ rows: DongTradeDetailRow[] }>();
const TOP = 10; const STEP = 420;   // 한 달에 걸리는 시간(ms)
const monthOf = (r: DongTradeDetailRow) => r.contractDate.slice(0, 7);
const months = computed(() => [...new Set(props.rows.map(monthOf))].sort());
const dongs = computed(() => [...new Set(props.rows.map((r) => r.umdNm).filter(Boolean))]);
/** 달마다 동별 누적 건수 */
const cum = computed(() => {
  const ms = months.value; const ds = dongs.value; const idx = new Map(ds.map((d, i) => [d, i]));
  const out = ms.map(() => new Array(ds.length).fill(0));
  props.rows.forEach((r) => { const di = idx.get(r.umdNm); const mi = ms.indexOf(monthOf(r)); if (di === undefined || mi < 0) return; for (let m = mi; m < ms.length; m += 1) out[m][di] += 1; });
  return out;
});
const rankAt = (mi: number) => dongs.value.map((d, i) => ({ d, v: cum.value[mi]?.[i] ?? 0 })).sort((a, b) => b.v - a.v).map((x) => x.d);
const insight = computed(() => {
  const ms = months.value; if (ms.length < 3 || !dongs.value.length) return '';
  const last = rankAt(ms.length - 1); const early = rankAt(Math.min(2, ms.length - 1));
  const finalV = cum.value[ms.length - 1][dongs.value.indexOf(last[0])];
  let best = { d: '', from: 0, to: 0 };
  last.slice(0, TOP).forEach((d, i) => { const from = early.indexOf(d) + 1; if (from - (i + 1) > best.from - best.to) best = { d, from, to: i + 1 }; });
  const ym = (m: string) => `${m.slice(2, 4)}년 ${Number(m.slice(5, 7))}월`;
  return `1년 누적 1위는 <em>${last[0]}(${finalV.toLocaleString('ko-KR')}건)</em>입니다.${best.d && best.from > best.to ? ` 가장 많이 치고 올라온 동은 <em>${best.d}</em> — ${ym(ms[Math.min(2, ms.length - 1)])} ${best.from}위 → 지금 ${best.to}위.` : ''}`;
});

const cv = ref<HTMLCanvasElement | null>(null);
const playing = ref(false);
let W = 0; let H = 0; let t0 = 0; let raf = 0; const ys = new Map<string, number>();
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const PAL = () => (dark()
  ? { bar: '#3d6cc4', top: '#6b9cff', ink: '#e8edf6', sub: '#9aa6ba', ghost: '#232d42' }
  : { bar: '#a9c3f3', top: '#2b6df3', ink: '#111827', sub: '#6b7280', ghost: '#e3e8f0' });
const resize = () => {
  const el = cv.value; if (!el) return;
  const r = el.getBoundingClientRect(); const d = devicePixelRatio || 1;
  W = r.width; H = r.height; el.width = W * d; el.height = H * d;
  el.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
};
function draw(now: number) {
  const c = cv.value?.getContext('2d'); if (!c || !W) return;
  const ms = months.value; if (!ms.length) return;
  const P = PAL(); const t = reduce ? 1e9 : (now - t0) / STEP; const pos = Math.min(ms.length - 1, Math.max(0, t));
  const lo = Math.floor(pos); const hi = Math.min(ms.length - 1, lo + 1); const f = pos - lo;
  const vals = dongs.value.map((d, i) => ({ d, v: cum.value[lo][i] + (cum.value[hi][i] - cum.value[lo][i]) * f }));
  vals.sort((a, b) => b.v - a.v);
  const shown = vals.slice(0, TOP); const max = Math.max(1, shown[0]?.v ?? 1);
  const LEFT = 92; const RIGHT = 70; const top = 14; const rowH = (H - top - 20) / TOP;
  c.clearRect(0, 0, W, H);
  // 지금 달 — 오른쪽 아래 크게, 옅게
  const m = ms[Math.round(pos)];
  c.fillStyle = P.ghost; c.font = '800 64px "Pretendard", sans-serif'; c.textAlign = 'right'; c.fillText(`${m.slice(0, 4)}.${m.slice(5, 7)}`, W - 16, H - 24);
  shown.forEach((x, rank) => {
    const want = top + rank * rowH; const cur = ys.get(x.d);
    const y = cur === undefined || reduce ? want : cur + (want - cur) * 0.2; ys.set(x.d, y);
    const w = Math.max(2, (x.v / max) * (W - LEFT - RIGHT));
    c.fillStyle = rank === 0 ? P.top : P.bar; c.beginPath(); c.roundRect(LEFT, y + 5, w, rowH - 12, 6); c.fill();
    c.fillStyle = P.ink; c.font = '700 14px "Pretendard", sans-serif'; c.textAlign = 'right'; c.fillText(x.d, LEFT - 12, y + rowH / 2 + 3);
    c.fillStyle = P.sub; c.font = '700 13px "Pretendard", sans-serif'; c.textAlign = 'left'; c.fillText(`${Math.round(x.v).toLocaleString('ko-KR')}건`, LEFT + w + 8, y + rowH / 2 + 3);
    c.fillStyle = P.sub; c.font = '700 12px "Pretendard", sans-serif'; c.textAlign = 'left'; c.fillText(`${rank + 1}`, 10, y + rowH / 2 + 3);
  });
  // 밀려난 동의 자리 기억은 지운다(다시 들어오면 밑에서부터 올라오게)
  [...ys.keys()].forEach((d) => { if (!shown.some((x) => x.d === d)) ys.set(d, top + TOP * rowH); });
  const busy = t < ms.length - 1 || shown.some((x, rank) => Math.abs((ys.get(x.d) ?? 0) - (top + rank * rowH)) > 0.5);
  playing.value = t < ms.length - 1;
  raf = busy ? requestAnimationFrame(draw) : 0;
}
const replay = () => { ys.clear(); t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
watch(() => props.rows, () => { resize(); replay(); });
let ro: ResizeObserver | null = null;
onMounted(() => { resize(); replay(); ro = new ResizeObserver(() => { resize(); if (!raf) raf = requestAnimationFrame(draw); }); if (cv.value) ro.observe(cv.value); });
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect(); });
</script>

<template>
  <section v-if="months.length > 1" class="rr">
    <strong class="rr-title">동 순위 레이스 <em>(달마다 누적 거래건수 · 상위 {{ TOP }}곳)</em></strong>
    <div class="rr-read">
      <p><b>읽는법</b><span>달이 넘어갈 때마다 동별 누적 거래건수 막대가 자라고, 순위가 바뀌면 막대가 위아래로 자리를 바꿉니다. 맨 위 파란 막대가 그달까지의 1위입니다.</span></p>
      <p v-if="insight"><b>한눈에</b><span v-html="insight" /></p>
    </div>
    <div class="rr-board">
      <canvas ref="cv" class="rr-cv" aria-label="동 순위 레이스" />
      <button v-if="!playing" type="button" class="rr-play" aria-label="다시 재생" @click="replay">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg><span>다시 재생</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.rr { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
.rr-title { padding-left: 20px; font-size: 16px; font-weight: 800; color: #111827; }
.rr-title em { font-style: normal; font-size: 13px; font-weight: 500; color: #6b7280; }
.rr-read { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid #e3e8f0; border-radius: 10px; background: #fff; font-size: 14px; line-height: 1.65; color: #111827; }
.rr-read p { margin: 0; display: grid; grid-template-columns: 64px 1fr; gap: 10px; }
.rr-read b { font-size: 12px; font-weight: 700; color: #2b6df3; padding-top: 2px; }
.rr-read :deep(em) { font-style: normal; font-weight: 600; background: linear-gradient(transparent 62%, #eef3ff 62%); }
.rr-board { position: relative; background: #fff; border: 1px solid #e3e8f0; border-radius: 10px; padding: 10px; }
.rr-cv { display: block; width: 100%; height: 460px; }
.rr-play { position: absolute; left: 50%; top: 58%; transform: translate(-50%, -50%); display: inline-flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 22px 12px; border: 0; border-radius: 18px; background: rgba(255, 255, 255, .72); color: #2b6df3; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; opacity: .2; transition: opacity .2s; box-shadow: 0 8px 24px rgba(17, 24, 39, .10); }
.rr-play svg { width: 56px; height: 56px; padding: 12px 10px 12px 14px; border-radius: 50%; background: #2b6df3; color: #fff; box-sizing: border-box; }
.rr-board:hover .rr-play, .rr-play:focus-visible { opacity: 1; }
</style>
