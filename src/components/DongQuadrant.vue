<script setup lang="ts">
// 동 사분면 — 동 하나 = 원 하나. 가로 = 거래건수(활발함), 세로 = 평균 평당가(비쌈, 로그 눈금), 원 크기 = 평균가 또는 거래건수.
// 구 평균 십자선으로 네 칸(활발 · 비쌈 / 활발 · 저렴 / 한산 · 비쌈 / 한산 · 저렴). 원을 누르면 그 동을 고른다(pick-dong).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DongTradeDetailRow } from '../services/publicDataApi';

const props = defineProps<{ rows: DongTradeDetailRow[]; selected?: string }>();
const emit = defineEmits<{ 'pick-dong': [string] }>();

const EOK = 100_000_000;
const man = (won: number) => `${Math.round(won / 10000).toLocaleString('ko-KR')}만`;
const eok = (won: number) => (won >= EOK ? `${Number((won / EOK).toFixed(2))}억` : man(won));
const QN: Record<number, string> = { 1: '활발 · 비쌈', 2: '활발 · 저렴', 3: '한산 · 비쌈', 4: '한산 · 저렴' };
const sizeKey = ref<'avg' | 'n'>('avg');

type Dong = { name: string; n: number; unit: number; avg: number; med: number; q: number; x: number; y: number; r: number; tx: number; ty: number };
const model = computed(() => {
  const valid = props.rows.filter((r) => r.priceWon > 0 && r.pyeong > 0 && r.umdNm);
  const units = valid.map((r) => r.priceWon / r.pyeong);
  const guUnit = units.length ? units.reduce((a, v) => a + v, 0) / units.length : 0;
  const by = new Map<string, DongTradeDetailRow[]>();
  valid.forEach((r) => by.set(r.umdNm, [...(by.get(r.umdNm) ?? []), r]));
  const dongs: Dong[] = [...by.entries()].map(([name, l]) => {
    const ps = l.map((r) => r.priceWon).sort((a, b) => a - b);
    return { name, n: l.length, unit: l.reduce((a, r) => a + r.priceWon / r.pyeong, 0) / l.length, avg: ps.reduce((a, v) => a + v, 0) / ps.length, med: ps[Math.floor(ps.length / 2)], q: 0, x: 0, y: 0, r: 0, tx: 0, ty: 0 };
  });
  const avgN = dongs.length ? valid.length / dongs.length : 0;
  dongs.forEach((d) => { d.q = d.n >= avgN ? (d.unit >= guUnit ? 1 : 2) : (d.unit >= guUnit ? 3 : 4); });
  return { dongs, guUnit, avgN };
});
const insight = computed(() => {
  const { dongs, guUnit } = model.value; if (dongs.length < 2) return '';
  const q1 = dongs.filter((d) => d.q === 1).sort((a, b) => b.n - a.n).map((d) => d.name);
  const q2 = dongs.filter((d) => d.q === 2).sort((a, b) => b.n - a.n).map((d) => d.name);
  const top = [...dongs].sort((a, b) => b.unit - a.unit)[0];
  return `${q1.length ? `거래가 활발하면서 비싼 동은 <em>${q1.join(' · ')}</em>${q2.length ? ', ' : '입니다. '}` : ''}${q2.length ? `활발하면서 저렴한 동은 <em>${q2.join(' · ')}</em>입니다. ` : ''}평당가가 가장 높은 곳은 ${top.name}(${man(top.unit)})으로 평균 ${man(guUnit)}의 ${(top.unit / guUnit).toFixed(1)}배입니다.`;
});

// ===== 그리기 =====
const cv = ref<HTMLCanvasElement | null>(null);
const tip = ref<{ x: number; y: number; lines: Array<[string, string]> } | null>(null);
let W = 0; let H = 0; let t0 = 0; let raf = 0; let hover: Dong | null = null;
const PAD = { l: 72, r: 30, t: 30, b: 50 };
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const PAL = () => (dark()
  ? { q: { 1: '#b9d0ff', 2: '#6b9cff', 3: '#3d6cc4', 4: '#2c4e8f' } as Record<number, string>, ink: '#e8edf6', sub: '#9aa6ba', faint: '#6b778c', grid: '#232d42', mark: '#ff7a7a', card: '#182031' }
  : { q: { 1: '#1a43a1', 2: '#3a6fd8', 3: '#6f98e8', 4: '#a9c3f3' } as Record<number, string>, ink: '#111827', sub: '#6b7280', faint: '#9aa3b2', grid: '#eef1f6', mark: '#f05252', card: '#ffffff' });
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2));

const resize = () => {
  const el = cv.value; if (!el) return;
  const r = el.getBoundingClientRect(); const d = devicePixelRatio || 1;
  W = r.width; H = r.height; el.width = W * d; el.height = H * d;
  el.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
};
const scales = () => {
  const { dongs } = model.value;
  const nMax = Math.max(1, ...dongs.map((d) => d.n)) * 1.12;
  const us = dongs.map((d) => d.unit).filter((v) => v > 0);
  const uLo = (Math.min(...us) || 1) * 0.85; const uHi = (Math.max(...us) || 2) * 1.35;
  const sx = (n: number) => PAD.l + (n / nMax) * (W - PAD.l - PAD.r);
  // 평당가는 넓게 퍼져 있어 로그 눈금 — 아래쪽 동들이 한데 뭉치지 않게
  const sy = (u: number) => H - PAD.b - ((Math.log(Math.max(u, uLo)) - Math.log(uLo)) / (Math.log(uHi) - Math.log(uLo))) * (H - PAD.t - PAD.b);
  return { nMax, uLo, uHi, sx, sy };
};
/** 자리 정하기 — 원끼리 겹치면 살짝 밀어낸다(몇 번 되풀이) */
const place = () => {
  const { dongs } = model.value; const { sx, sy } = scales();
  const key = sizeKey.value; const m = Math.max(1, ...dongs.map((d) => (key === 'avg' ? d.avg : d.n)));
  dongs.forEach((d) => { d.tx = sx(d.n); d.ty = sy(d.unit); d.r = 10 + Math.sqrt((key === 'avg' ? d.avg : d.n) / m) * 32; });
  for (let it = 0; it < 40; it += 1) {
    for (let i = 0; i < dongs.length; i += 1) for (let j = i + 1; j < dongs.length; j += 1) {
      const a = dongs[i]; const b = dongs[j]; const dx = b.tx - a.tx; const dy = b.ty - a.ty; const dist = Math.hypot(dx, dy) || 0.01; const need = a.r + b.r + 2;
      if (dist < need) { const push = (need - dist) / 2; const ux = dx / dist; const uy = dy / dist; a.tx -= ux * push; a.ty -= uy * push; b.tx += ux * push; b.ty += uy * push; }
    }
  }
};
function draw(now: number) {
  const c = cv.value?.getContext('2d'); if (!c || !W) return;
  const P = PAL(); const t = reduce ? 1e9 : now - t0; const { dongs, guUnit, avgN } = model.value; const { nMax, uLo, uHi, sx, sy } = scales();
  const cx0 = sx(avgN); const cy0 = sy(guUnit);
  c.clearRect(0, 0, W, H);
  c.font = '700 14px "Pretendard", sans-serif'; c.fillStyle = P.faint;
  c.textAlign = 'right'; c.fillText('활발 · 비쌈', W - PAD.r - 6, PAD.t + 16); c.fillText('활발 · 저렴', W - PAD.r - 6, H - PAD.b - 10);
  c.textAlign = 'left'; c.fillText('한산 · 비쌈', PAD.l + 8, PAD.t + 16); c.fillText('한산 · 저렴', PAD.l + 8, H - PAD.b - 10);
  c.strokeStyle = P.grid; c.lineWidth = 1; c.font = '600 13px "Pretendard", sans-serif'; c.fillStyle = P.sub;
  [300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000].forEach((u) => { const won = u * 10000; if (won < uLo || won > uHi) return; const y = sy(won); c.beginPath(); c.moveTo(PAD.l, y + 0.5); c.lineTo(W - PAD.r, y + 0.5); c.stroke(); c.textAlign = 'right'; c.fillText(`${u.toLocaleString('ko-KR')}만`, PAD.l - 8, y + 4); });
  const stepN = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => nMax / s <= 8) ?? 1000;
  for (let n = 0; n <= nMax; n += stepN) { c.textAlign = 'center'; c.fillText(`${n.toLocaleString('ko-KR')}건`, sx(n), H - PAD.b + 18); }
  c.font = '600 13px "Pretendard", sans-serif'; c.fillText('거래건수 →', (PAD.l + W - PAD.r) / 2, H - 10);
  c.save(); c.translate(16, (PAD.t + H - PAD.b) / 2); c.rotate(-Math.PI / 2); c.fillText('평균 평당가 →', 0, 0); c.restore();
  c.strokeStyle = P.mark; c.setLineDash([5, 5]); c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(cx0 + 0.5, PAD.t); c.lineTo(cx0 + 0.5, H - PAD.b); c.moveTo(PAD.l, cy0 + 0.5); c.lineTo(W - PAD.r, cy0 + 0.5); c.stroke(); c.setLineDash([]);
  c.fillStyle = P.mark; c.font = '700 13px "Pretendard", sans-serif'; c.textAlign = 'left'; c.fillText(`평균 ${man(guUnit)} · 동당 ${Math.round(avgN).toLocaleString('ko-KR')}건`, cx0 + 6, PAD.t + 34);
  let busy = false;
  [...dongs].sort((a, b) => b.r - a.r).forEach((d, i) => {
    const k = (t - i * 60) / 750; if (k < 1) busy = true;
    const go = Math.min(1, Math.max(0, k * 1.2)); const s = ease(k); const fade = Math.min(1, Math.max(0, k * 1.4));
    d.x = cx0 + (d.tx - cx0) * go; d.y = cy0 + (d.ty - cy0) * go;
    const r = d.r * s; if (r <= 0) return;
    const dim = props.selected && props.selected !== d.name;
    c.globalAlpha = (dim ? 0.35 : 0.88) * fade; c.fillStyle = P.q[d.q]; c.beginPath(); c.arc(d.x, d.y, r, 0, Math.PI * 2); c.fill();
    c.globalAlpha = fade; c.strokeStyle = P.card; c.lineWidth = 2; c.stroke();
    c.textAlign = 'center'; c.font = `700 ${r > 22 ? 14 : 12}px "Pretendard", sans-serif`;
    if (r > 18) { c.fillStyle = d.q <= 2 ? '#fff' : P.ink; c.fillText(d.name, d.x, d.y + 4); } else { c.fillStyle = P.ink; c.fillText(d.name, d.x, d.y - r - 5); }
    c.globalAlpha = 1;
    if (hover === d || props.selected === d.name) { c.strokeStyle = P.ink; c.lineWidth = 2; c.beginPath(); c.arc(d.x, d.y, r + 3, 0, Math.PI * 2); c.stroke(); }
  });
  raf = busy ? requestAnimationFrame(draw) : 0;
}
const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
const play = () => { place(); t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
const hit = (x: number, y: number) => [...model.value.dongs].sort((a, b) => a.r - b.r).find((d) => (d.x - x) ** 2 + (d.y - y) ** 2 <= d.r ** 2) ?? null;
const onMove = (e: MouseEvent) => {
  const b = cv.value?.getBoundingClientRect(); if (!b) return;
  const x = e.clientX - b.left; const y = e.clientY - b.top; const d = hit(x, y);
  if (d !== hover) { hover = d; redraw(); }
  if (!d) { tip.value = null; return; }
  const { guUnit, avgN } = model.value;
  tip.value = { x: Math.min(x + 20, W - 250), y: Math.max(y - 70, 4), lines: [['동', `${d.name} · ${QN[d.q]}`], ['거래', `${d.n.toLocaleString('ko-KR')}건 (동 평균 ${Math.round(avgN).toLocaleString('ko-KR')}건)`], ['평균 평당가', `${man(d.unit)} (평균 대비 ${d.unit >= guUnit ? '+' : ''}${((d.unit / guUnit - 1) * 100).toFixed(0)}%)`], ['평균가', `${eok(d.avg)} · 중간값 ${eok(d.med)}`], ['누르면', '이 동으로 좁힘']] };
};
const onLeave = () => { hover = null; tip.value = null; redraw(); };
// 원을 누르면 그 동으로 좁히고, 고른 원을 다시 누르거나 빈 곳을 누르면 전체 동으로 되돌린다
const onClick = (e: MouseEvent) => {
  const b = cv.value?.getBoundingClientRect(); if (!b) return;
  const d = hit(e.clientX - b.left, e.clientY - b.top);
  if (d && d.name !== props.selected) emit('pick-dong', d.name);
  else if (props.selected) emit('pick-dong', '');
};
const pickSize = (k: 'avg' | 'n') => { sizeKey.value = k; play(); };

watch(() => props.rows, () => { resize(); play(); });
watch(() => props.selected, redraw);
let ro: ResizeObserver | null = null;
onMounted(() => { resize(); play(); ro = new ResizeObserver(() => { resize(); place(); redraw(); }); if (cv.value) ro.observe(cv.value); });
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect(); });
</script>

<template>
  <section class="dq">
    <div class="dq-top">
      <strong>동 사분면 <em>(원 = 동 · 정상 + 직거래)</em></strong>
      <!-- 동 하나로 좁혔을 때 — 위 탭까지 가지 않고 여기서 전체로 되돌린다 -->
      <button v-if="selected" type="button" class="dq-all" @click="emit('pick-dong', '')"><b>{{ selected }}</b>만 보는 중<span>전체 동 보기</span></button>
      <div class="dq-seg" role="tablist" aria-label="원 크기">
        <button type="button" :class="{ on: sizeKey === 'avg' }" @click="pickSize('avg')">원 크기 평균가</button>
        <button type="button" :class="{ on: sizeKey === 'n' }" @click="pickSize('n')">원 크기 거래건수</button>
      </div>
    </div>
    <div class="dq-read">
      <p><b>읽는법</b><span>원 하나가 동 하나입니다. <em>오른쪽일수록 거래가 활발하고, 위로 갈수록 평당가가 비쌉니다.</em> 빨간 십자선은 평균이라 네 칸으로 나뉩니다. 원에 마우스를 대면 그 동의 숫자가 뜨고, 누르면 그 동으로 좁힙니다. 같은 원을 다시 누르거나 빈 곳을 누르면 전체 동으로 돌아갑니다.</span></p>
      <p v-if="insight"><b>한눈에</b><span v-html="insight" /></p>
    </div>
    <div class="dq-board">
      <canvas ref="cv" class="dq-cv" aria-label="동 사분면 버블" @mousemove="onMove" @mouseleave="onLeave" @click="onClick" />
      <div v-if="tip" class="dq-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <template v-for="l in tip.lines" :key="l[0]"><b>{{ l[0] }}</b><span>{{ l[1] }}</span></template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dq { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.dq-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.dq-top strong { padding-left: 20px; font-size: 16px; font-weight: 800; color: #111827; }
.dq-top strong em { font-style: normal; font-size: 13px; font-weight: 500; color: #6b7280; }
.dq-seg { display: grid; grid-auto-flow: column; gap: 6px; }
.dq-all { margin-right: auto; display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 6px 0 12px; border: 1px solid #c9d8fb; border-radius: 999px; background: #f5f8ff; font-family: inherit; font-size: 14px; color: #1f2a44; cursor: pointer; }
.dq-all b { font-weight: 800; }
.dq-all span { padding: 3px 10px; border-radius: 999px; background: #2b6df3; font-size: 13px; font-weight: 700; color: #fff; }
.dq-all:hover span { background: #1f5fe0; }
.dq-seg button { height: 34px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
.dq-seg button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.dq-read { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid #e3e8f0; border-radius: 10px; background: #fff; font-size: 14px; line-height: 1.65; color: #111827; }
.dq-read p { margin: 0; display: grid; grid-template-columns: 64px 1fr; gap: 10px; }
.dq-read b { font-size: 12px; font-weight: 700; color: #2b6df3; padding-top: 2px; }
.dq-read :deep(em) { font-style: normal; font-weight: 600; background: linear-gradient(transparent 62%, #eef3ff 62%); }
.dq-board { position: relative; background: #fff; border: 1px solid #e3e8f0; border-radius: 10px; padding: 10px; overflow-x: auto; }
.dq-cv { display: block; width: 100%; min-width: 640px; height: 520px; cursor: pointer; }
.dq-tip { position: absolute; z-index: 5; pointer-events: none; display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; min-width: 220px; padding: 9px 11px; border-radius: 8px; background: #1f2937; color: #f3f4f6; font-size: 12.5px; line-height: 1.55; box-shadow: 0 10px 24px rgba(17, 24, 39, .25); }
.dq-tip b { font-weight: 600; color: #9aa6ba; }
</style>
