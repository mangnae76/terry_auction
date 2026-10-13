<script setup lang="ts">
// 수요공급 분석 (시군구) — 관리자 도구.
//
// 시군구 하나를 고르면 그 안의 읍면동을 한 줄씩 늘어놓고, 읍면동마다
// 거래량·평균가와 네 가지 지표를 본다.
//
// 국토부 실거래는 '시군구 + 달' 로 부르면 읍면동이 한꺼번에 오므로,
// 12개월치 열두 번이면 표가 다 찬다 (동마다 부르지 않는다).
// 총 세대수·총 매물수는 아직 손으로 적는다 — 세대수는 건축물대장을 동마다
// 훑어야 해서 하루 한도에 닿고, 매물수는 공식 API 가 아니다.
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { searchSigungu, type SigunguCandidate } from '../services/regionResolver';
import { fetchDongTradeStats, type DongTradeStat } from '../services/publicDataApi';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';

type Kind = 'villa' | 'apt' | 'officetel';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'villa', label: '연립다세대' },
  { key: 'apt', label: '아파트' },
  { key: 'officetel', label: '오피스텔' },
];

const router = useRouter();
const auth = useAuthStore();

const regionText = ref('인천광역시 서구');
const kind = ref<Kind>('villa');
const months = ref(12);

const loading = ref(false);
const errorMsg = ref('');
const notice = ref('');
const stats = ref<DongTradeStat[]>([]);
const period = ref({ from: '', to: '' });
const loadedLabel = ref('');
const excluded = ref(0);

/** 손으로 적는 두 칸 — 읍면동 이름을 열쇠로 들고 있는다 */
type Manual = { units?: number; listings?: number };
const manual = ref<Record<string, Manual>>({});
const manualKey = computed(() => `${loadedLabel.value}|${kind.value}`);

// 적어 둔 세대수·매물수는 사용자별로 남긴다 — 매번 다시 적을 값이 아니다
const prefsLoaded = ref(false);
const loadManual = async () => {
  if (!auth.uid) return;
  const prefs = await loadUserPrefs(auth.uid);
  if (prefs?.adminRegionManual) manual.value = { ...prefs.adminRegionManual };
  prefsLoaded.value = true;
};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const saveManualSoon = () => {
  if (!prefsLoaded.value || !auth.uid) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveUserPrefs(auth.uid, { adminRegionManual: manual.value });
  }, 700);
};
onMounted(() => { void loadManual(); });
watch(() => auth.uid, () => { void loadManual(); });

const rowKey = (umdNm: string) => `${manualKey.value}|${umdNm}`;
const manualOf = (umdNm: string): Manual => manual.value[rowKey(umdNm)] ?? {};
const setManual = (umdNm: string, field: keyof Manual, raw: string) => {
  const n = Number(raw.replace(/[^\d]/g, ''));
  const next = { ...manualOf(umdNm), [field]: Number.isFinite(n) && n > 0 ? n : undefined };
  manual.value = { ...manual.value, [rowKey(umdNm)]: next };
  saveManualSoon();
};

/** 네 지표 — 손품+현장의 매매수요와 같은 식이다 */
type Row = DongTradeStat & {
  units: number; listings: number;
  turnover: number; absorb: number; burden: number; clearMonths: number;
};
const rows = computed<Row[]>(() => stats.value.map((s) => {
  const m = manualOf(s.umdNm);
  const units = m.units ?? 0;
  const listings = m.listings ?? 0;
  const monthly = s.count / Math.max(1, months.value);
  return {
    ...s,
    units,
    listings,
    turnover: units > 0 ? (s.count / units) * 100 : 0,
    absorb: listings > 0 ? (s.count / listings) * 100 : 0,
    burden: units > 0 ? (listings / units) * 100 : 0,
    clearMonths: monthly > 0 && listings > 0 ? listings / monthly : 0,
  };
}));

const totalCount = computed(() => stats.value.reduce((s, r) => s + r.count, 0));

const won = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '-');
const pct = (n: number) => (n > 0 ? `${n.toFixed(1)}%` : '-');
const months2 = (n: number) => {
  if (!(n > 0)) return '-';
  const m = Math.round(n);
  return m >= 12 ? `${m}M (${Math.floor(m / 12)}Y ${m % 12}M)` : `${m}M`;
};
const ymd = (v: string) => (v.length === 6 ? `${v.slice(0, 4)}.${v.slice(4)}` : v);

/** 이름이 여럿에 걸리면 고르게 한다 — '인천광역시 서구' 는 서해구·검단구 둘이다 */
const candidates = ref<SigunguCandidate[]>([]);
const picked = ref<SigunguCandidate | null>(null);

const runFor = async (region: SigunguCandidate) => {
  loading.value = true;
  try {
    const res = await fetchDongTradeStats({
      lawdCd5: region.lawdCd5,
      propertyType: kind.value,
      months: months.value,
    });
    stats.value = res.rows;
    period.value = { from: res.periodFrom, to: res.periodTo };
    excluded.value = res.excludedCount;
    picked.value = region;
    loadedLabel.value = region.label;
    if (res.error) notice.value = res.error;
    if (res.rows.length === 0 && !res.error) notice.value = '그 기간에 거래가 없습니다.';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

const load = async () => {
  if (loading.value) return;
  errorMsg.value = '';
  notice.value = '';
  candidates.value = [];
  loading.value = true;
  let found: SigunguCandidate[] = [];
  try {
    found = await searchSigungu(regionText.value);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
  if (found.length === 0) {
    errorMsg.value = '그 지역을 찾지 못했습니다. “인천광역시 서구” 처럼 시·도와 시군구를 같이 적어 주세요.';
    stats.value = [];
    return;
  }
  if (found.length > 1) {
    // 하나로 못 좁혔다 — 말없이 첫 번째를 고르면 엉뚱한 구를 분석하게 된다
    candidates.value = found;
    notice.value = '이름이 여럿에 걸립니다. 아래에서 고르세요.';
    stats.value = [];
    return;
  }
  await runFor(found[0]);
};

/** 엑셀에서 열 수 있게 — 쉼표가 든 값은 따옴표로 감싼다 */
const downloadCsv = () => {
  if (rows.value.length === 0) return;
  const head = ['시군구', '읍면동', '주소', '총세대수', '총매물수', '회전율(%)', '매물소화율(%)', '매물부담율(%)', '매물소진기간(개월)', `총거래량(${months.value}개월)`, '평균가', '평균전용(㎡)', '평균평당가'];
  const body = rows.value.map((r) => [
    loadedLabel.value, r.umdNm, `${loadedLabel.value} ${r.umdNm}`,
    r.units || '', r.listings || '',
    r.turnover ? r.turnover.toFixed(1) : '',
    r.absorb ? r.absorb.toFixed(1) : '',
    r.burden ? r.burden.toFixed(1) : '',
    r.clearMonths ? Math.round(r.clearMonths) : '',
    r.count, r.avgPrice || '', r.avgAreaM2 || '', r.avgUnitPrice || '',
  ]);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...body].map((line) => line.map(esc).join(',')).join('\n');
  // 엑셀이 한글을 깨지 않게 BOM 을 붙인다
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `수요공급_${loadedLabel.value}_${kind.value}_${period.value.from}-${period.value.to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};
</script>

<template>
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" @click="router.push('/admin')">‹</button>
        <div class="adm-title">
          <h1>수요공급 분석 <em>시 · 군 · 구</em></h1>
          <p>시군구를 고르면 그 안의 읍면동을 한 줄씩 늘어놓습니다.</p>
        </div>
        <button
          type="button"
          class="adm-csv"
          :disabled="rows.length === 0"
          @click="downloadCsv"
        >엑셀 내려받기</button>
      </div>
    </header>

    <div class="adm-body">
      <div class="adm-bar">
        <label class="adm-f">
          <small>지역</small>
          <input
            v-model="regionText"
            class="adm-input"
            placeholder="인천광역시 서구"
            @keydown.enter.prevent="load"
          />
        </label>
        <label class="adm-f">
          <small>종류</small>
          <div class="adm-seg">
            <button
              v-for="k in KINDS"
              :key="k.key"
              type="button"
              :class="['adm-seg-btn', { on: kind === k.key }]"
              @click="kind = k.key"
            >{{ k.label }}</button>
          </div>
        </label>
        <label class="adm-f narrow">
          <small>기간</small>
          <div class="adm-seg">
            <button
              v-for="m in [12, 24]"
              :key="m"
              type="button"
              :class="['adm-seg-btn', { on: months === m }]"
              @click="months = m"
            >{{ m }}개월</button>
          </div>
        </label>
        <button type="button" class="adm-load" :disabled="loading" @click="load">
          {{ loading ? '불러오는 중…' : '데이터 로드' }}
        </button>
      </div>

      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>

      <div v-if="candidates.length > 1" class="adm-picks">
        <button
          v-for="c in candidates"
          :key="c.lawdCd5"
          type="button"
          :class="['adm-pick', { on: picked?.lawdCd5 === c.lawdCd5 }]"
          @click="candidates = []; notice = ''; runFor(c)"
        >{{ c.label }}<small>{{ c.lawdCd5 }}</small></button>
      </div>

      <div v-if="rows.length > 0" class="adm-sum">
        <strong>{{ loadedLabel }}</strong>
        <span v-if="picked" class="code">{{ picked.lawdCd5 }}</span>
        <span>{{ ymd(period.from) }} ~ {{ ymd(period.to) }} 거래분</span>
        <span>읍면동 {{ rows.length }}곳</span>
        <span>거래 {{ totalCount.toLocaleString('ko-KR') }}건</span>
        <span v-if="excluded > 0" class="dim">직거래·해제 {{ excluded.toLocaleString('ko-KR') }}건 제외</span>
      </div>

      <div v-if="rows.length > 0" class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr class="grp">
              <th colspan="2">주소지 정보</th>
              <th colspan="2" class="in">수치입력</th>
              <th colspan="6">지표결과</th>
            </tr>
            <tr>
              <th>읍면동</th>
              <th>주소</th>
              <th class="in">총 세대수</th>
              <th class="in">총 매물수</th>
              <th>회전율<small>(%)</small></th>
              <th>매물 소화율<small>(%)</small></th>
              <th>매물 부담율<small>(%)</small></th>
              <th>매물 소진기간</th>
              <th>총 거래량<small>({{ months }}개월)</small></th>
              <th>평균가<small>(최근 {{ months }}개월)</small></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.umdNm">
              <td class="nm">{{ r.umdNm }}</td>
              <td class="addr">{{ loadedLabel }} {{ r.umdNm }}</td>
              <td class="in">
                <input
                  class="adm-cell"
                  inputmode="numeric"
                  placeholder="입력"
                  :value="r.units || ''"
                  @input="setManual(r.umdNm, 'units', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="in">
                <input
                  class="adm-cell"
                  inputmode="numeric"
                  placeholder="입력"
                  :value="r.listings || ''"
                  @input="setManual(r.umdNm, 'listings', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="n">{{ pct(r.turnover) }}</td>
              <td class="n">{{ pct(r.absorb) }}</td>
              <td class="n">{{ pct(r.burden) }}</td>
              <td class="n">{{ months2(r.clearMonths) }}</td>
              <td class="n strong">{{ r.count.toLocaleString('ko-KR') }}</td>
              <td class="n strong">{{ won(r.avgPrice) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="rows.length > 0" class="adm-foot">
        회전율 = 거래량 ÷ 세대수 &nbsp;·&nbsp; 소화율 = 거래량 ÷ 매물수 &nbsp;·&nbsp;
        부담율 = 매물수 ÷ 세대수 &nbsp;·&nbsp; 소진기간 = 매물수 ÷ 월평균 거래량.
        파란 칸(세대수·매물수)은 손으로 적습니다 — 적어 두면 다음에도 남습니다.
      </p>
    </div>
  </section>
</template>

<style scoped>
.adm-shell { min-height: 100vh; background: #f5f7fb; color: #111827; display: flex; flex-direction: column; }

.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(160%) blur(10px);
  border-bottom: 1px solid #e8ecf3;
}
.adm-top-in { max-width: 1680px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 14px; }
.adm-back {
  border: 1px solid #dde3ee; background: #fff; border-radius: 9px;
  width: 32px; height: 32px; font-size: 19px; line-height: 1; color: #374151; cursor: pointer;
}
.adm-back:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-title h1 {
  margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.3px;
  display: flex; align-items: baseline; gap: 7px;
}
.adm-title h1 em { font-style: normal; font-size: 11.5px; font-weight: 700; color: #9ca3af; }
.adm-title p { margin: 2px 0 0; font-size: 12px; color: #9ca3af; }
.adm-csv {
  margin-left: auto; border: 1px solid #c7d7f8; background: #fff; border-radius: 9px;
  padding: 8px 14px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.adm-csv:disabled { border-color: #e5e7eb; color: #c3c9d4; cursor: default; }

.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }

/* 고르는 줄 */
.adm-bar {
  display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
  background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 16px 18px;
}
.adm-f { display: flex; flex-direction: column; gap: 6px; }
.adm-f small { font-size: 11px; font-weight: 700; color: #6b7280; }
.adm-f.narrow { flex: 0 0 auto; }
.adm-input {
  width: 260px; box-sizing: border-box; height: 36px;
  border: 1px solid #dde3ee; border-radius: 9px; background: #fff;
  padding: 0 11px; font-family: inherit; font-size: 13.5px; color: #111827;
}
.adm-input:focus { outline: none; border-color: #2b6df3; }
.adm-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 9px; padding: 3px; }
.adm-seg-btn {
  border: none; background: transparent; border-radius: 7px;
  padding: 7px 13px; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #6b7280; cursor: pointer; white-space: nowrap;
}
.adm-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17, 24, 39, 0.1); }
.adm-load {
  margin-left: auto; height: 36px; padding: 0 20px;
  border: none; border-radius: 9px; background: #1f3a72; color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
}
.adm-load:hover { background: #16305f; }
.adm-load:disabled { background: #aeb8ca; cursor: default; }

.adm-msg { margin: 14px 0 0; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.adm-msg.err { background: #fef2f2; color: #b91c1c; }
.adm-msg.warn { background: #fffbeb; color: #92400e; }

.adm-sum {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  margin: 18px 2px 10px; font-size: 12.5px; color: #6b7280; font-weight: 600;
}
.adm-sum strong { font-size: 14.5px; font-weight: 800; color: #111827; }
.adm-sum .dim { color: #9ca3af; font-weight: 500; }
.adm-sum .code {
  font-size: 11px; font-weight: 700; color: #6b7280;
  background: #eef1f6; border-radius: 999px; padding: 2px 8px;
}
/* 이름이 여럿에 걸릴 때 고르는 줄 */
.adm-picks { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 2px 0; }
.adm-pick {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid #c7d7f8; background: #fff; border-radius: 10px;
  padding: 9px 14px; font-family: inherit; font-size: 13px; font-weight: 700;
  color: #1f3a72; cursor: pointer;
}
.adm-pick:hover { background: #eef4ff; }
.adm-pick small { font-size: 10.5px; font-weight: 600; color: #9ca3af; }

/* 표 */
.adm-table-wrap { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; }
.adm-table th, .adm-table td {
  border-bottom: 1px solid #eef1f6; border-right: 1px solid #eef1f6;
  padding: 10px 12px; font-size: 12.5px; text-align: center; white-space: nowrap;
}
.adm-table th:last-child, .adm-table td:last-child { border-right: none; }
.adm-table thead th { background: #f7f9fc; color: #374151; font-weight: 700; }
.adm-table thead tr.grp th { background: #eef2f7; font-size: 12px; font-weight: 800; color: #1f3a72; }
/* 손으로 적는 칸은 파랗게 — 엑셀에서 쓰던 표시 그대로 */
.adm-table thead th.in, .adm-table thead tr.grp th.in { background: #dbe6ff; color: #1b3f8f; }
.adm-table th small { display: block; font-size: 10px; font-weight: 600; color: #9ca3af; }
.adm-table thead th.in small { color: #4b6cb7; }
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover td { background: #fafbfe; }
.adm-table td.nm { font-weight: 800; }
.adm-table td.addr { text-align: left; color: #6b7280; }
.adm-table td.n { font-variant-numeric: tabular-nums; }
.adm-table td.n.strong { font-weight: 800; }
.adm-table td.in { background: #f7faff; padding: 6px 8px; }
.adm-cell {
  width: 100%; box-sizing: border-box; height: 30px;
  border: 1px solid #cfdcf6; border-radius: 7px; background: #fff;
  padding: 0 8px; font-family: inherit; font-size: 12.5px; color: #1b3f8f;
  font-weight: 700; text-align: right;
}
.adm-cell:focus { outline: none; border-color: #2b6df3; }
.adm-cell::placeholder { color: #aebbd6; font-weight: 400; }

.adm-foot { margin: 14px 2px 0; font-size: 11.5px; line-height: 1.7; color: #9ca3af; }

@media (max-width: 860px) {
  .adm-top-in, .adm-body { padding-left: 16px; padding-right: 16px; }
  .adm-input { width: 100%; }
  .adm-f { flex: 1 1 100%; }
  .adm-load { margin-left: 0; }
}
</style>
