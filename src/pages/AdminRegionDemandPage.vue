<script setup lang="ts">
// 실거래 분석 (시군구) — 관리자 도구. 첫 화면의 '실거래 분석' 카드가 여기로 온다.
//
// 시군구 하나를 고르면 그 안의 읍면동을 한 줄씩 늘어놓고, 읍면동마다
// 거래량·평균가와 네 가지 지표를 본다.
//
// 국토부 실거래는 '시군구 + 달' 로 부르면 읍면동이 한꺼번에 오므로,
// 12개월치 열두 번이면 표가 다 찬다 (동마다 부르지 않는다).
// 총 세대수·총 매물수는 아직 손으로 적는다 — 세대수는 건축물대장을 동마다
// 훑어야 해서 하루 한도에 닿고, 매물수는 공식 API 가 아니다.
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { REGION_GROUPS, districtsOf, type DistrictOption } from '../services/regionCodes';
import { fetchDongTradeStats, type DongTradeStat } from '../services/publicDataApi';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';

type Kind = 'villa' | 'apt' | 'officetel';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'villa', label: '연립다세대' },
  { key: 'apt', label: '아파트' },
  { key: 'officetel', label: '오피스텔' },
];

const router = useRouter();
/** 웹 시장분석 › 지역분석에 띄웠는가 — 웹(shared.entry.js)이 넣어 준다. 분석 도구에서는 false */
const webEmbed = inject<boolean>('webEmbed', false);
const auth = useAuthStore();

// 시도 → 시군구 → 읍면동 차례로 좁힌다.
// 이름을 쳐서 찾던 방식은 '인천광역시 서구' 처럼 갈라진 구에서 엉뚱한 데를
// 집었다. 표에서 고르면 그럴 일이 없다.
const SIDO_PICK = '';
const sido = ref<string>(SIDO_PICK);
const districtCode = ref<string>('');   // 빈 값이면 '전체'
const dongFilter = ref('');
const kind = ref<Kind>('villa');
// 1년치로 못 박는다 — 지표가 모두 연 기준이라 고를 까닭이 없다
const months = ref(12);

const districts = computed<DistrictOption[]>(() => districtsOf(sido.value));
/** 전체를 고르면 그 시도의 시군구를 다 돈다 — 몇 번 부르는지 미리 알려 준다 */
const targets = computed<DistrictOption[]>(() => (
  districtCode.value
    ? districts.value.filter((d) => d.lawdCode === districtCode.value)
    : districts.value
));
const callCount = computed(() => targets.value.length * months.value);
watch(sido, () => { districtCode.value = ''; dongFilter.value = ''; });

const loading = ref(false);
const errorMsg = ref('');
const notice = ref('');
type StatRow = DongTradeStat & { sigungu: string };
const stats = ref<StatRow[]>([]);
const period = ref({ from: '', to: '' });
const loadedLabel = ref('');

/** 손으로 적는 두 칸 — 읍면동 이름을 열쇠로 들고 있는다 */
type Manual = { units?: number; listings?: number };
const manual = ref<Record<string, Manual>>({});
// 열쇠에 시군구를 넣는다 — '중구'·'남구'처럼 동 이름이 시군구마다 겹치고,
// 전체로 받든 한 곳만 받든 같은 자리를 가리켜야 한다

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

const rowKey = (sigungu: string, umdNm: string) => `${kind.value}|${sigungu}|${umdNm}`;
const manualOf = (sigungu: string, umdNm: string): Manual => manual.value[rowKey(sigungu, umdNm)] ?? {};
const setManual = (sigungu: string, umdNm: string, field: keyof Manual, raw: string) => {
  const n = Number(raw.replace(/[^\d]/g, ''));
  const next = { ...manualOf(sigungu, umdNm), [field]: Number.isFinite(n) && n > 0 ? n : undefined };
  manual.value = { ...manual.value, [rowKey(sigungu, umdNm)]: next };
  saveManualSoon();
};

/** 네 지표 — 손품+현장의 매매수요와 같은 식이다 */
type Row = StatRow & {
  units: number; listings: number;
  turnover: number; absorb: number; burden: number; clearMonths: number;
};
const rows = computed<Row[]>(() => stats.value
  .filter((r) => !dongFilter.value || r.umdNm === dongFilter.value)
  .map((s) => {
  const m = manualOf(s.sigungu, s.umdNm);
  const units = m.units ?? 0;
  const listings = m.listings ?? 0;
  const monthly = s.count / Math.max(1, months.value);
  // 회전율·소화율은 1년치로 환산한다 — 24개월을 받아도 뜻이 같아야
  // 손품+현장의 등급 기준(연 거래량 ÷ 세대수)과 그대로 견줄 수 있다
  const yearly = s.count / Math.max(1, months.value / 12);
  return {
    ...s,
    units,
    listings,
    turnover: units > 0 ? (yearly / units) * 100 : 0,
    absorb: listings > 0 ? (yearly / listings) * 100 : 0,
    burden: units > 0 ? (listings / units) * 100 : 0,
    clearMonths: monthly > 0 && listings > 0 ? listings / monthly : 0,
  };
}));

// 읍면동 목록 — 표를 받기 전에도 고를 수 있어야 한다.
// 시군구를 고르면 최근 석 달치를 먼저 받아 동 이름을 채운다 (국토부 호출 3번).
// 한 번 받은 시군구는 들고 있다가 다시 고르면 그대로 쓴다.
const dongPeek = ref<Record<string, string[]>>({});
const dongPeeking = ref(false);
const peekKey = computed(() => (districtCode.value ? `${districtCode.value}|${kind.value}` : ''));
const peekDongs = async () => {
  const key = peekKey.value;
  if (!key || dongPeek.value[key]) return;
  dongPeeking.value = true;
  try {
    const res = await fetchDongTradeStats({
      lawdCd5: districtCode.value, propertyType: kind.value, months: 3,
    });
    dongPeek.value = { ...dongPeek.value, [key]: res.rows.map((r) => r.umdNm) };
  } catch {
    // 못 받아도 그만 — 표를 받고 나면 그때 목록이 찬다
  } finally {
    dongPeeking.value = false;
  }
};
watch([districtCode, kind], () => { dongFilter.value = ''; peekDongs(); });

const dongOptions = computed(() => {
  const loaded = stats.value.map((r) => r.umdNm);
  const peeked = dongPeek.value[peekKey.value] ?? [];
  return Array.from(new Set([...loaded, ...peeked])).sort((a, b) => a.localeCompare(b, 'ko'));
});
const totalCount = computed(() => rows.value.reduce((s, r) => s + r.count, 0));
// 직거래·해제도 보고 있는 줄만큼만 센다 — 동을 좁히면 그 동의 수가 나온다
const excludedShown = computed(() => rows.value.reduce((s, r) => s + (r.excludedCount ?? 0), 0));
const sumLabel = computed(() => (
  dongFilter.value ? `${loadedLabel.value} · ${dongFilter.value}` : loadedLabel.value
));

const won = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '-');
const areaText = (n: number) => (n > 0 ? n.toFixed(1) : '-');
/** 건축연수 — 올해에서 평균 건축연도를 뺀다 */
const THIS_YEAR = new Date().getFullYear();
const ageText = (buildYear: number) => (
  buildYear > 1800 ? String(Math.max(0, THIS_YEAR - buildYear)) : '-'
);
const pct = (n: number) => (n > 0 ? `${n.toFixed(1)}%` : '-');
/** 거래량을 연·월로 가른다 — 24개월을 받아도 1년치로 환산해 견준다 */
const yearlyOf = (count: number) => count / Math.max(1, months.value / 12);
const monthlyOf = (count: number) => count / Math.max(1, months.value);
/** 작은 동은 월 0건으로 뭉개진다 — 10건 아래는 소수 한 자리까지.
    일의 자리를 세로로 맞추려고 정수부와 소수부를 갈라 둔다 */
const cntRound = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const cntInt = (n: number) => {
  if (!(n > 0)) return '-';
  return Math.floor(cntRound(n)).toLocaleString('ko-KR');
};
const cntFrac = (n: number) => {
  if (!(n > 0)) return '';
  const t = cntRound(n);
  return Number.isInteger(t) ? '' : `.${Math.round((t - Math.floor(t)) * 10)}`;
};
/** 소진기간 — 위에 달 수, 아래에 해로 환산한 값 ('102' / '8년 6개월') */
const clearHead = (n: number) => (n > 0 ? String(Math.round(n)) : '');
const clearSub = (n: number) => {
  if (!(n > 0)) return '';
  let years = Math.floor(Math.round(n) / 12);
  let rest = Math.round(n) - years * 12;
  if (rest === 12) { years += 1; rest = 0; }
  if (years < 1) return '';
  return rest > 0 ? `${years}년 ${rest}개월` : `${years}년`;
};
/** 20251015 → 2025년 10월 15일, 202510 → 2025년 10월 */
const ym = (v: string) => {
  if (v.length === 8) return `${v.slice(0, 4)}년 ${Number(v.slice(4, 6))}월 ${Number(v.slice(6))}일`;
  if (v.length === 6) return `${v.slice(0, 4)}년 ${Number(v.slice(4))}월`;
  return v;
};

const progress = ref({ done: 0, total: 0 });

const load = async () => {
  if (loading.value || targets.value.length === 0) return;
  errorMsg.value = '';
  notice.value = '';
  loading.value = true;
  progress.value = { done: 0, total: targets.value.length };
  try {
    const merged = new Map<string, DongTradeStat & { sigungu: string }>();
    const errs = new Set<string>();
    let from = ''; let to = '';
    // 시군구를 하나씩 — 한꺼번에 던지면 국토부가 막는다
    for (const d of targets.value) {
      const res = await fetchDongTradeStats({
        lawdCd5: d.lawdCode,
        propertyType: kind.value,
        months: months.value,
      });
      from = res.periodFromDate || res.periodFrom; to = res.periodToDate || res.periodTo;
      if (res.error) errs.add(res.error);
      res.rows.forEach((r) => {
        // 시군구가 달라도 동 이름은 겹친다 — 시군구를 붙여 열쇠로 쓴다
        merged.set(`${d.label}|${r.umdNm}`, { ...r, sigungu: d.label });
      });
      progress.value = { done: progress.value.done + 1, total: targets.value.length };
    }
    // 거래량 랭킹 — 시군구 전체를 받아도 거래 많은 동이 위로 온다
    stats.value = Array.from(merged.values()).sort((a, b) => b.count - a.count);
    period.value = { from, to };
    loadedLabel.value = districtCode.value
      ? `${sido.value} ${targets.value[0]?.label ?? ''}`.trim()
      : `${sido.value} 전체`;
    if (errs.size > 0) notice.value = Array.from(errs).join(' / ');
    if (stats.value.length === 0 && errs.size === 0) notice.value = '그 기간에 거래가 없습니다.';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

/** 엑셀에서 열 수 있게 — 쉼표가 든 값은 따옴표로 감싼다 */
const downloadCsv = () => {
  if (rows.value.length === 0) return;
  const head = ['소속 구', '읍면동', '총세대수', '총매물수', `총거래량(최근 ${months.value}개월)`, '평균가', '회전율(%)', '매물소화율(%)', '매물부담율(%)', '매물소진기간(개월)', '평균전용(㎡)', '평균건축연수', '평균평당가', '직거래·해제'];
  const body = rows.value.map((r) => [
    r.sigungu, r.umdNm,
    r.units || '', r.listings || '',
    r.count, r.avgPrice || '',
    r.turnover ? r.turnover.toFixed(1) : '',
    r.absorb ? r.absorb.toFixed(1) : '',
    r.burden ? r.burden.toFixed(1) : '',
    r.clearMonths ? Math.round(r.clearMonths) : '',
    r.avgAreaM2 || '', ageText(r.avgBuildYear), r.avgUnitPrice || '', r.excludedCount || '',
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
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-title">
          <h1>실거래 분석 <em>지역 단위</em></h1>
          <p>지역 세부 단위(읍면동)의 거래량·평균가를 통해 수요공급을 분석한다.</p>
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
          <small>시 · 도</small>
          <select v-model="sido" :class="['adm-input', 'narrow', { ph: !sido }]">
            <option value="">{{ webEmbed ? '시도 선택' : '전국' }}</option>
            <option v-for="g in REGION_GROUPS" :key="g.sido" :value="g.sido">{{ g.sido }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>시 · 군 · 구</small>
          <select v-model="districtCode" :class="['adm-input', 'narrow', { ph: !districtCode }]" :disabled="!sido">
            <option value="">{{ webEmbed ? '시군구 선택' : '전체' }}</option>
            <option v-for="d in districts" :key="d.lawdCode" :value="d.lawdCode">{{ d.label }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>읍 · 면 · 동</small>
          <select v-model="dongFilter" :class="['adm-input', 'narrow', { ph: !dongFilter }]" :disabled="dongOptions.length === 0">
            <option value="">{{ dongPeeking ? '불러오는 중…' : (webEmbed ? '읍면동 선택' : '전체') }}</option>
            <option v-for="d in dongOptions" :key="d" :value="d">{{ d }}</option>
          </select>
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
        <button type="button" class="adm-load" :disabled="loading || !sido" @click="load">
          <template v-if="loading && progress.total > 1">{{ progress.done }}/{{ progress.total }} 불러오는 중…</template>
          <template v-else-if="loading">불러오는 중…</template>
          <template v-else>데이터 로드</template>
        </button>
      </div>

      <!-- 전체를 고르면 시군구마다 열두 번씩 부른다 — 하루 한도가 있으니 미리 알린다 -->
      <p v-if="sido && !districtCode" class="adm-msg warn">
        <b>{{ sido }} 전체</b> — 시군구 {{ districts.length }}곳을 차례로 받습니다
        (국토부 호출 {{ callCount.toLocaleString('ko-KR') }}번). 한 곳만 보려면 시·군·구를 고르세요.
      </p>

      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>

      <div v-if="rows.length > 0" class="adm-sum">
        <strong>{{ sumLabel }}</strong>
        <span>기간 {{ ym(period.from) }} ~ {{ ym(period.to) }}</span>
        <span>읍면동 {{ rows.length }}곳</span>
        <span>거래 {{ totalCount.toLocaleString('ko-KR') }}건</span>
        <span v-if="excludedShown > 0" class="dim">직거래·해제 {{ excludedShown.toLocaleString('ko-KR') }}건 제외</span>
      </div>

      <div v-if="rows.length > 0" class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr class="grp">
              <th colspan="2">주소지 정보</th>
              <th colspan="2" class="in">수치입력</th>
              <th colspan="8">지표결과</th>
            </tr>
            <tr>
              <th>소속 구</th>
              <th>읍면동</th>
              <th class="in">총 세대수</th>
              <th class="in">총 매물수</th>
              <th>총 거래량<small>(최근 {{ months }}개월)</small></th>
              <th>평균가<small>(최근 {{ months }}개월)</small></th>
              <th>평균 전용면적<small>(㎡)</small></th>
              <th>평균 건축연수<small>(년)</small></th>
              <th>회전율<small>(%)</small></th>
              <th>매물 소화율<small>(%)</small></th>
              <th>매물 부담율<small>(%)</small></th>
              <th>매물 소진기간<small>(개월)</small></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="`${r.sigungu}|${r.umdNm}`">
              <td class="gu">{{ r.sigungu }}</td>
              <td class="nm">{{ r.umdNm }}</td>
              <td class="in">
                <input
                  class="adm-cell"
                  inputmode="numeric"
                  placeholder="입력"
                  :value="r.units || ''"
                  @input="setManual(r.sigungu, r.umdNm, 'units', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="in">
                <input
                  class="adm-cell"
                  inputmode="numeric"
                  placeholder="입력"
                  :value="r.listings || ''"
                  @input="setManual(r.sigungu, r.umdNm, 'listings', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="n strong deal">
                <span class="grp y"><em class="pre">연</em><i>{{ cntInt(yearlyOf(r.count)) }}</i></span><b>{{ cntFrac(yearlyOf(r.count)) }}</b>
                <em class="bar">|</em>
                <span class="grp m"><em class="pre">월</em><i>{{ cntInt(monthlyOf(r.count)) }}</i></span><b>{{ cntFrac(monthlyOf(r.count)) }}</b>
              </td>
              <td class="n strong price"><span class="v">{{ won(r.avgPrice) }}</span></td>
              <td class="n area"><span class="v">{{ areaText(r.avgAreaM2) }}</span></td>
              <td class="n age"><span class="v">{{ ageText(r.avgBuildYear) }}</span></td>
              <td class="n rate"><em v-if="r.turnover > 0" class="pre">연</em><span class="v">{{ pct(r.turnover) }}</span></td>
              <td class="n rate"><em v-if="r.absorb > 0" class="pre">연</em><span class="v">{{ pct(r.absorb) }}</span></td>
              <td class="n rate"><span class="v">{{ pct(r.burden) }}</span></td>
              <td class="n clear">
                <template v-if="r.clearMonths > 0">
                  <span class="v">{{ clearHead(r.clearMonths) }}</span>
                  <small v-if="clearSub(r.clearMonths)">{{ clearSub(r.clearMonths) }}</small>
                </template>
                <template v-else>-</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="rows.length > 0" class="adm-foot">
        회전율 = 1년 거래량 ÷ 세대수 &nbsp;·&nbsp; 소화율 = 1년 거래량 ÷ 매물수 &nbsp;·&nbsp;
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
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  line-height: 0; color: #374151; cursor: pointer;
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

/* 표 */
.adm-table-wrap { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
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
.adm-table td.gu { font-weight: 700; color: #374151; white-space: nowrap; }
.adm-table td.nm { font-weight: 800; white-space: nowrap; }
.adm-table td.n { font-variant-numeric: tabular-nums; }
.adm-table td.n.strong { font-weight: 800; }
.adm-table td.in { background: #f7faff; padding: 6px 8px; }
/* 총 거래량 — 연 | 월 두 값을 가운데 막대로 가른다 (손품+현장과 같은 꼴) */
.adm-table td.deal { white-space: nowrap; letter-spacing: -0.3px; font-size: 11.5px; }
.adm-table td em.pre { font-style: normal; font-size: 10.5px; font-weight: 600; color: #6b7280; margin-right: 3px; }
.adm-table td.deal em.bar { font-style: normal; font-weight: 400; color: #c3cbd8; margin: 0 3px; }
/* 숫자 자리를 못 박는다 — 연은 세 자리, 월은 두 자리.
   앞붙임(연·월)은 제자리에 서고 숫자는 그 안에서 오른쪽에 붙어,
   줄이 달라도 끝자리가 세로로 맞는다. 소수점 아래는 뒤로 흘린다 */
.adm-table td.deal { padding-left: 6px; padding-right: 6px; font-variant-numeric: tabular-nums; }
.adm-table td.deal .grp { display: inline-block; }
.adm-table td.deal .grp i { display: inline-block; font-style: normal; text-align: right; }
.adm-table td.deal .grp.y i { min-width: 3ch; }
.adm-table td.deal .grp.m i { min-width: 2ch; }
/* 소수점 아래 자리도 폭을 잡아 둔다 — 없는 줄과 있는 줄의 전체 너비가
   달라지면 가운데 정렬 때문에 끝선이 어긋난다 */
.adm-table td.deal b { display: inline-block; width: 11px; text-align: left; font-weight: inherit; }
/* 매물 소진기간 — 달 수를 위에, 해로 환산한 값을 아래에 */
.adm-table td.clear { line-height: 1.25; }
.adm-table td.clear em { font-style: normal; font-size: 10.5px; font-weight: 600; color: #6b7280; margin-left: 1px; }
.adm-table td.clear small { display: block; font-size: 10.5px; font-weight: 600; color: #6b7280; }
/* 줄끼리 끝자리를 맞춘다 — 값을 같은 폭 상자에 담아 오른쪽으로 붙인다.
   상자째로는 칸 가운데에 서므로 머리글과도 어긋나 보이지 않는다 */
.adm-table td .v { display: inline-block; text-align: right; }
.adm-table td.price .v { min-width: 84px; }
.adm-table td.area .v { min-width: 36px; }
.adm-table td.age .v { min-width: 22px; }
.adm-table td.rate .v { min-width: 44px; }
.adm-table td.clear .v { min-width: 26px; }
.adm-table td.clear small { width: 54px; margin: 0 auto; text-align: right; }
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
