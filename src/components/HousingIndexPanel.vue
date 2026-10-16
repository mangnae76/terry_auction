<script setup lang="ts">
// KB 주택가격지수 — 한국은행 ECOS 에서 받아 꺾은선으로 그린다.
// 그림은 선 세 가닥뿐이라 라이브러리를 들이지 않고 SVG 로 직접 그린다.
import { computed, onMounted, ref, watch } from 'vue';
import { fetchHousingPriceIndex, hasEcosKey, type HousingIndexResult, type IndexKind } from '../services/ecosApi';

const kind = ref<IndexKind>('sale');
const loading = ref(false);
const errorMsg = ref('');
const data = ref<HousingIndexResult | null>(null);

/** 선 색 — 전국 전체는 담담하게, 전국·서울 아파트는 파랑과 주황 */
const TONE: Record<string, string> = {
  allTotal: '#9aa4b2',
  allApt: '#2b6df3',
  seoulApt: '#f97316',
};

const load = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    data.value = await fetchHousingPriceIndex(kind.value, 18);
  } catch (error) {
    data.value = null;
    errorMsg.value = error instanceof Error ? error.message : '지수를 불러오지 못했습니다.';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(kind, load);

const series = computed(() => data.value?.series ?? []);
/** 'YYYYMM' → '2026.09' */
const ym = (t: string) => (t.length >= 6 ? `${t.slice(0, 4)}.${t.slice(4, 6)}` : t);
const baseLabel = computed(() => (data.value?.baseTime ? `${ym(data.value.baseTime)} 기준` : ''));

/** 맨 위 요약 두 칸 — 전국 아파트와 서울 아파트의 마지막 값, 그리고 한 달 전 대비 */
const summary = computed(() => ['allApt', 'seoulApt'].map((key) => {
  const s = series.value.find((item) => item.key === key);
  const pts = s?.points ?? [];
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const diff = last && prev && prev.value > 0 ? ((last.value - prev.value) / prev.value) * 100 : 0;
  return {
    key,
    label: key === 'allApt' ? '아파트(전국)' : '아파트(서울)',
    value: last ? last.value.toFixed(2) : '-',
    diff,
  };
}));

// ── 그림 좌표 셈 ─────────────────────────────────────────────
const W = 960;
const H = 300;
const PAD = { top: 16, right: 18, bottom: 30, left: 44 };
const times = computed(() => {
  const all = new Set<string>();
  series.value.forEach((s) => s.points.forEach((p) => all.add(p.time)));
  return [...all].sort();
});
const bounds = computed(() => {
  const values = series.value.flatMap((s) => s.points.map((p) => p.value));
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.18, 0.6);
  return { min: min - pad, max: max + pad };
});
const xOf = (time: string) => {
  const list = times.value;
  const i = list.indexOf(time);
  const span = Math.max(list.length - 1, 1);
  return PAD.left + ((W - PAD.left - PAD.right) * i) / span;
};
const yOf = (value: number) => {
  const { min, max } = bounds.value;
  const ratio = (value - min) / Math.max(max - min, 0.0001);
  return H - PAD.bottom - ratio * (H - PAD.top - PAD.bottom);
};
const pathOf = (key: string) => {
  const s = series.value.find((item) => item.key === key);
  if (!s || s.points.length === 0) return '';
  return s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.time).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');
};
/** 가로 눈금 넷 */
const yTicks = computed(() => {
  const { min, max } = bounds.value;
  return [0, 1, 2, 3].map((i) => {
    const value = min + ((max - min) * i) / 3;
    return { value, y: yOf(value), label: value.toFixed(0) };
  });
});
/** 세로 눈금 — 석 달에 한 번만 적는다 */
const xTicks = computed(() => times.value.filter((_, i) => i % 3 === 0).map((t) => ({ t, x: xOf(t) })));
</script>

<template>
  <section class="hpi">
    <p class="hpi-eyebrow"><i /> KB 주택가격지수 · <em>HOUSING PRICE INDEX</em></p>

    <div class="hpi-card">
      <header class="hpi-head">
        <strong>KB 주택가격지수</strong>
        <small>{{ baseLabel }} (한국은행 ECOS)</small>
        <div class="hpi-seg">
          <button type="button" :class="{ on: kind === 'sale' }" @click="kind = 'sale'">매매</button>
          <button type="button" :class="{ on: kind === 'jeonse' }" @click="kind = 'jeonse'">전세</button>
        </div>
      </header>

      <div class="hpi-kpis">
        <div v-for="s in summary" :key="s.key" class="hpi-kpi">
          <span class="t">{{ s.label }}</span>
          <strong class="v">{{ s.value }}</strong>
          <em v-if="s.diff !== 0" :class="['d', s.diff > 0 ? 'up' : 'down']">
            {{ s.diff > 0 ? '↗' : '↘' }} {{ s.diff > 0 ? '+' : '' }}{{ s.diff.toFixed(1) }}%
          </em>
        </div>
      </div>

      <p v-if="!hasEcosKey()" class="hpi-msg warn">
        한국은행 ECOS 인증키가 없습니다. <b>VITE_ECOS_API_KEY</b> 를 <b>.env</b> 에 넣어 주세요.
      </p>
      <p v-else-if="loading" class="hpi-msg">불러오는 중…</p>
      <p v-else-if="errorMsg" class="hpi-msg err">{{ errorMsg }}</p>
      <p v-else-if="data?.warning" class="hpi-msg warn">{{ data.warning }}</p>

      <svg v-if="series.length > 0" class="hpi-chart" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
        <!-- 눈금 -->
        <g>
          <line
            v-for="t in yTicks"
            :key="`y${t.label}`"
            :x1="PAD.left" :x2="W - PAD.right" :y1="t.y" :y2="t.y"
            stroke="#dfe5ef" stroke-dasharray="4 4"
          />
          <text v-for="t in yTicks" :key="`yl${t.label}`" :x="PAD.left - 8" :y="t.y + 4" class="ax" text-anchor="end">
            {{ t.label }}
          </text>
          <line
            v-for="t in xTicks"
            :key="`x${t.t}`"
            :x1="t.x" :x2="t.x" :y1="PAD.top" :y2="H - PAD.bottom"
            stroke="#eef1f6" stroke-dasharray="4 4"
          />
          <text v-for="t in xTicks" :key="`xl${t.t}`" :x="t.x" :y="H - 10" class="ax" text-anchor="middle">
            {{ ym(t.t) }}
          </text>
        </g>
        <!-- 선 -->
        <path
          v-for="s in series"
          :key="s.key"
          :d="pathOf(s.key)"
          fill="none"
          :stroke="TONE[s.key]"
          :stroke-width="s.key === 'allTotal' ? 2 : 2.6"
          :stroke-dasharray="s.key === 'allTotal' ? '5 4' : undefined"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>

      <ul v-if="series.length > 0" class="hpi-legend">
        <li v-for="s in series" :key="s.key">
          <i :style="{ background: TONE[s.key] }" />{{ s.label }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.hpi-eyebrow {
  display: flex; align-items: center; gap: 8px;
  margin: 0 0 10px; font-size: 12.5px; font-weight: 800; color: #2b6df3; letter-spacing: 0.2px;
}
.hpi-eyebrow i { width: 26px; height: 2px; border-radius: 2px; background: #2b6df3; }
.hpi-eyebrow em { font-style: normal; letter-spacing: 1px; }

.hpi-card { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 18px 20px 14px; }
.hpi-head { display: flex; align-items: baseline; gap: 8px; }
.hpi-head strong { font-size: 15px; font-weight: 800; }
.hpi-head small { font-size: 11.5px; color: #9ca3af; font-weight: 600; }
.hpi-seg {
  margin-left: auto; display: inline-flex; gap: 3px;
  background: #f3f5f9; border-radius: 9px; padding: 3px;
}
.hpi-seg button {
  border: none; background: transparent; border-radius: 7px; padding: 6px 16px;
  font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.hpi-seg button.on { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(17, 24, 39, 0.12); }

.hpi-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0 6px; }
.hpi-kpi {
  display: flex; align-items: center; gap: 8px;
  background: #f7f8fb; border-radius: 10px; padding: 11px 14px;
}
.hpi-kpi .t { font-size: 12.5px; font-weight: 700; color: #4b5563; }
.hpi-kpi .v { margin-left: auto; font-size: 17px; font-weight: 800; letter-spacing: -0.3px; }
.hpi-kpi .d { font-style: normal; font-size: 11.5px; font-weight: 800; }
.hpi-kpi .d.up { color: #e0574a; }
.hpi-kpi .d.down { color: #2b6df3; }

.hpi-chart { width: 100%; height: 300px; display: block; }
.hpi-chart .ax { font-size: 11px; fill: #9ca3af; font-weight: 600; }

.hpi-legend {
  list-style: none; margin: 2px 0 0; padding: 0;
  display: flex; justify-content: center; gap: 18px; flex-wrap: wrap;
}
.hpi-legend li { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: #6b7280; }
.hpi-legend i { width: 16px; height: 3px; border-radius: 2px; }

.hpi-msg { margin: 12px 0 0; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; background: #f7f8fb; color: #6b7280; }
.hpi-msg.warn { background: #fffbeb; color: #92400e; }
.hpi-msg.err { background: #fef2f2; color: #b91c1c; }
</style>
