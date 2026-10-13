<script setup lang="ts">
// 경매지번 실거래가 (관리자 도구) — 물건 상세의 '가격정보 → 경매지번 실거래가'와
// 같은 구성이다. 다른 점은 하나, 경매 물건에 매여 있지 않다는 것.
// 지역을 고르고 지번이나 단지명을 손으로 적으면 그 자리의 매매·전월세를 모은다.
//
// 자료는 물건 상세와 같은 fetchPlaceHistory 를 쓰고 저장소도 같이 쓴다 —
// 앱에서 이미 받아 둔 시군구면 국토부를 다시 부르지 않는다.
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { REGION_GROUPS, districtsOf, type DistrictOption } from '../services/regionCodes';
import {
  fetchDongTradeStats, fetchPlaceHistory, PLACE_HISTORY_YEARS,
} from '../services/publicDataApi';
import { cacheKey, readCache, writeCache, CACHE_TTL } from '../services/marketCache';

type Kind = 'villa' | 'apt' | 'officetel';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'villa', label: '연립다세대' },
  { key: 'apt', label: '아파트' },
  { key: 'officetel', label: '오피스텔' },
];

const router = useRouter();

// ===== 지역 =====
const sido = ref('');
const districtCode = ref('');
const dong = ref('');
const kind = ref<Kind>('villa');
/** 지번 또는 단지명 — '513-1' 처럼 적거나 '성일연립' 처럼 적는다 */
const spot = ref('');
const years = ref(PLACE_HISTORY_YEARS);

const districts = computed<DistrictOption[]>(() => districtsOf(sido.value));
const district = computed<DistrictOption | null>(
  () => districts.value.find((d) => d.lawdCode === districtCode.value) ?? null,
);
watch(sido, () => { districtCode.value = ''; });

// 읍면동 목록 — 표를 받기 전에도 고를 수 있어야 한다.
// 시군구를 고르면 최근 석 달치를 먼저 받아 동 이름을 채운다 (국토부 호출 3번).
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
    // 못 받아도 그만 — 자료를 받고 나면 그때 목록이 찬다
  } finally {
    dongPeeking.value = false;
  }
};
watch([districtCode, kind], () => { dong.value = ''; peekDongs(); });
const dongOptions = computed(() => {
  const peeked = dongPeek.value[peekKey.value] ?? [];
  return Array.from(new Set([...loadedDongs.value, ...peeked])).sort((a, b) => a.localeCompare(b, 'ko'));
});

// ===== 받아 둔 자료 =====
type Row = {
  kind: '매매' | '직거래' | '전세' | '월세';
  contractDate: string;
  amount: string;
  price: number;
  areaM2: number;
  floor: string;
  umdNm: string;
  name: string;
  jibun: string;
};
const loading = ref(false);
const errorMsg = ref('');
const notice = ref('');
/** 시군구 전체를 들고 있다가 지번·단지명으로 추린다 — 적는 말을 바꿔도 다시 안 부른다 */
const all = ref<Row[]>([]);
const loadedLabel = ref('');
const loadedDongs = ref<string[]>([]);
const missed = ref(0);

const won = (n: number) => (n > 0 ? `${Math.round(n).toLocaleString('ko-KR')}` : '-');
const squash = (v: string) => v.replace(/\s+/g, '').toLowerCase();
const PYEONG = 3.305785;

const callCount = computed(() => years.value * 12 * 2);

const load = async () => {
  const d = district.value;
  if (loading.value || !d) return;
  errorMsg.value = ''; notice.value = '';
  loading.value = true;
  try {
    const key = cacheKey(d.lawdCode, kind.value, `y${years.value}`);
    type Payload = Awaited<ReturnType<typeof fetchPlaceHistory>>;
    let data = await readCache<Payload>('cachePlaceHistory', key, CACHE_TTL.place);
    if (!data) {
      data = await fetchPlaceHistory({
        lawdCd5: d.lawdCode, propertyType: kind.value, years: years.value,
      });
      void writeCache('cachePlaceHistory', key, data);
    }
    const rows: Row[] = [
      ...data.trades.map((r) => ({
        kind: (r.dealType === '직거래' ? '직거래' : '매매') as Row['kind'],
        contractDate: r.contractDate,
        amount: won(r.price),
        price: r.price,
        areaM2: r.areaM2,
        floor: r.floor,
        umdNm: r.umdNm,
        name: r.apartmentName ?? '',
        jibun: r.jibun ?? '',
      })),
      // 전월세는 국토부가 '만원'으로 준다 — 매매(원)와 한 칸에 서니 원으로 맞춰 적는다
      ...data.rents.map((r) => ({
        kind: r.kind as Row['kind'],
        contractDate: r.contractDate,
        amount: r.monthlyRent > 0
          ? `보 ${won(r.deposit * 10000)} / 월 ${won(r.monthlyRent * 10000)}`
          : `보 ${won(r.deposit * 10000)}`,
        price: r.deposit * 10000,
        areaM2: r.areaM2,
        floor: r.floor,
        umdNm: r.umdNm,
        name: r.apartmentName ?? '',
        jibun: r.jibun ?? '',
      })),
    ].sort((a, b) => b.contractDate.localeCompare(a.contractDate));
    all.value = rows;
    loadedDongs.value = Array.from(new Set(rows.map((r) => r.umdNm).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko'));
    loadedLabel.value = `${sido.value} ${d.label}`;
    missed.value = data.missedMonths;
    if (rows.length === 0) notice.value = '그 기간에 거래가 없습니다.';
    else if (data.missedMonths > 0) notice.value = `${data.missedMonths}개월치를 받지 못했습니다 — 다시 받으면 채워집니다.`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

// ===== 그 자리만 추리기 =====
// 물건 상세와 같은 규칙 — 단지명이 들어 있거나, 동+지번이 맞으면 이 자리의 거래다.
const matched = computed(() => {
  const want = squash(spot.value);
  return all.value.filter((r) => {
    if (dong.value && r.umdNm !== dong.value) return false;
    if (!want) return false;
    const name = squash(r.name);
    if (name.length > 1 && name.includes(want)) return true;
    return !!r.jibun && squash(r.jibun) === want;
  });
});
/** 적어 넣은 자리에 걸린 단지 이름들 — 어디를 보고 있는지 알려 준다 */
const matchedNames = computed(() => Array.from(new Set(matched.value.map((r) => r.name).filter(Boolean))));

const areaOptions = computed(() => {
  const set = new Set<string>();
  matched.value.forEach((r) => { if (r.areaM2 > 0) set.add(String(r.areaM2)); });
  return [...set].sort((a, b) => Number(a) - Number(b));
});
const yearOptions = computed(() => {
  const set = new Set<string>();
  matched.value.forEach((r) => { const y = r.contractDate.slice(0, 4); if (y) set.add(y); });
  return [...set].sort().reverse();
});
const areaFilter = ref('');
const yearFilter = ref('');
const tab = ref<'all' | '매매' | '전세' | '월세'>('매매');

/** 면적·연도만 거른 줄 — 탭과 상관없이 요약과 탭 건수가 이걸 본다 */
const byAreaYear = computed(() => matched.value.filter((r) => {
  if (areaFilter.value && String(r.areaM2) !== areaFilter.value) return false;
  if (yearFilter.value && r.contractDate.slice(0, 4) !== yearFilter.value) return false;
  return true;
}));
const shown = computed(() => byAreaYear.value.filter((r) => (
  tab.value === 'all' || r.kind === tab.value || (tab.value === '매매' && r.kind === '직거래')
)));
const counts = computed(() => {
  const rows = byAreaYear.value;
  const by = (t: string) => rows.filter((r) => r.kind === t || (t === '매매' && r.kind === '직거래')).length;
  return { all: rows.length, 매매: by('매매'), 전세: by('전세'), 월세: by('월세') };
});
const countLabel = computed(() => (tab.value === 'all' ? '전체' : tab.value));
const countValue = computed(() => (tab.value === 'all' ? counts.value.all : counts.value[tab.value]));

/** 요약 — 가장 최근 매매 한 건 */
const recentSale = computed(() => byAreaYear.value.find((r) => r.kind === '매매' || r.kind === '직거래') ?? null);
const recentYm = computed(() => (recentSale.value ? recentSale.value.contractDate.slice(0, 7) : '최근'));
const recentPrice = computed(() => recentSale.value?.price ?? 0);
const recentPyeong = computed(() => {
  const r = recentSale.value;
  if (!r || !(r.areaM2 > 0) || !(r.price > 0)) return 0;
  return Math.round(r.price / (r.areaM2 / PYEONG));
});

const areaText = (m2: number) => (m2 > 0 ? `${m2.toFixed(2)} / ${(m2 / PYEONG).toFixed(2)}` : '-');
const areaOptText = (opt: string) => {
  const m2 = Number(opt);
  return m2 > 0 ? `${m2.toFixed(2)}㎡ / ${(m2 / PYEONG).toFixed(2)}평` : opt;
};
const kindClass = (k: string) => (k === '전세' ? 'tt-jeon' : k === '월세' ? 'tt-wol' : 'tt-buy');

const resetFilters = () => { areaFilter.value = ''; yearFilter.value = ''; tab.value = '매매'; };
watch(spot, () => { resetFilters(); });

const downloadCsv = () => {
  if (shown.value.length === 0) return;
  const head = ['구분', '계약일', '거래금액', '전용㎡', '전용평', '층', '읍면동', '지번', '단지명'];
  const body = shown.value.map((r) => [
    r.kind, r.contractDate, r.amount,
    r.areaM2.toFixed(2), (r.areaM2 / PYEONG).toFixed(2), r.floor, r.umdNm, r.jibun, r.name,
  ]);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...body].map((l) => l.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `경매지번실거래_${loadedLabel.value}_${spot.value || '전체'}.csv`;
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
          <h1>경매지번 실거래가 <em>지번 · 단지</em></h1>
          <p>지번이나 단지명을 적어 그 자리의 매매·전세·월세를 모아 봅니다.</p>
        </div>
        <button type="button" class="adm-csv" :disabled="shown.length === 0" @click="downloadCsv">엑셀 내려받기</button>
      </div>
    </header>

    <div class="adm-body">
      <!-- 지역 -->
      <div class="adm-bar">
        <label class="adm-f">
          <small>시 · 도</small>
          <select v-model="sido" class="adm-input narrow">
            <option value="">전국</option>
            <option v-for="g in REGION_GROUPS" :key="g.sido" :value="g.sido">{{ g.sido }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>시 · 군 · 구</small>
          <select v-model="districtCode" class="adm-input narrow" :disabled="!sido">
            <option value="">선택</option>
            <option v-for="d in districts" :key="d.lawdCode" :value="d.lawdCode">{{ d.label }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>읍 · 면 · 동</small>
          <select v-model="dong" class="adm-input narrow" :disabled="dongOptions.length === 0">
            <option value="">{{ dongPeeking ? '불러오는 중…' : '전체' }}</option>
            <option v-for="d in dongOptions" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>주소 <em>지번 또는 단지명</em></small>
          <input v-model="spot" class="adm-input" placeholder="예) 513-1 또는 성일연립" />
        </label>
        <label class="adm-f">
          <small>종류</small>
          <div class="adm-seg">
            <button v-for="k in KINDS" :key="k.key" type="button" :class="['adm-seg-btn', { on: kind === k.key }]" @click="kind = k.key">{{ k.label }}</button>
          </div>
        </label>
        <label class="adm-f">
          <small>기간</small>
          <div class="adm-seg">
            <button v-for="y in [3, 5, 10]" :key="y" type="button" :class="['adm-seg-btn', { on: years === y }]" @click="years = y">{{ y }}년</button>
          </div>
        </label>
        <button type="button" class="adm-load" :disabled="loading || !district" @click="load">
          {{ loading ? '불러오는 중…' : '데이터 로드' }}
        </button>
      </div>

      <p v-if="district && all.length === 0 && !loading" class="adm-warn">
        {{ sido }} {{ district.label }} {{ years }}년치를 받습니다 (국토부 호출 {{ callCount }}번 — 매매·전월세).
        앱에서 이미 받아 둔 시군구면 저장해 둔 것을 씁니다.
      </p>
      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>

      <template v-if="all.length > 0">
        <div class="adm-sum">
          <strong>{{ loadedLabel }} {{ dong }} {{ spot }}</strong>
          <span v-if="matchedNames.length > 0" class="dim">{{ matchedNames.join(' · ') }}</span>
          <span>최근 {{ years }}년 · 받아 둔 거래 {{ all.length.toLocaleString('ko-KR') }}건</span>
          <span v-if="missed > 0" class="dim">{{ missed }}개월치 못 받음</span>
        </div>

        <p v-if="!spot" class="adm-msg warn">주소 칸에 지번이나 단지명을 적으면 그 자리의 거래만 모읍니다.</p>
        <p v-else-if="matched.length === 0" class="adm-msg warn">그 자리의 실거래가 없습니다.</p>

        <template v-if="matched.length > 0">
          <!-- 요약 -->
          <div class="adm-kpis">
            <div class="adm-kpi"><small><em>{{ recentYm }}</em> 실거래가</small><strong>{{ won(recentPrice) }}</strong></div>
            <div class="adm-kpi"><small>평당가</small><strong>{{ won(recentPyeong) }}</strong></div>
            <div class="adm-kpi blue"><small>{{ countLabel }}</small><strong>{{ countValue }}건</strong></div>
          </div>

          <!-- 탭 · 거르기 -->
          <div class="adm-tabs">
            <button :class="['adm-tab', 't-all', { on: tab === 'all' }]" @click="tab = 'all'">전체 ({{ counts.all }})</button>
            <button :class="['adm-tab', 't-buy', { on: tab === '매매' }]" @click="tab = '매매'">매매 ({{ counts.매매 }})</button>
            <button :class="['adm-tab', 't-jeon', { on: tab === '전세' }]" @click="tab = '전세'">전세 ({{ counts.전세 }})</button>
            <button :class="['adm-tab', 't-wol', { on: tab === '월세' }]" @click="tab = '월세'">월세 ({{ counts.월세 }})</button>
            <span class="adm-tab-fill" />
            <select v-model="areaFilter" class="adm-input narrow">
              <option value="">전체면적(㎡/평)</option>
              <option v-for="o in areaOptions" :key="o" :value="o">{{ areaOptText(o) }}</option>
            </select>
            <select v-model="yearFilter" class="adm-input narrow">
              <option value="">거래년도</option>
              <option v-for="o in yearOptions" :key="o" :value="o">{{ o }}</option>
            </select>
            <button type="button" class="adm-ghost" @click="resetFilters">초기화</button>
          </div>

          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr><th>구분</th><th>계약일</th><th>거래금액</th><th>전용(㎡/평)</th><th>층</th><th>단지</th></tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in shown.slice(0, 300)" :key="`${r.contractDate}-${r.floor}-${i}`">
                  <td><span :class="['kind', kindClass(r.kind)]">{{ r.kind }}</span></td>
                  <td>{{ r.contractDate }}</td>
                  <td class="n strong price"><span class="v">{{ r.amount }}</span></td>
                  <td class="n area"><span class="v">{{ areaText(r.areaM2) }}</span></td>
                  <td class="n floor"><span class="v">{{ r.floor || '-' }}</span></td>
                  <td class="addr">{{ [r.umdNm, r.jibun, r.name].filter(Boolean).join(' ') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="shown.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 전체 {{ shown.length.toLocaleString('ko-KR') }}줄은 엑셀로 내려받으세요.</p>
          <p v-else-if="shown.length === 0" class="adm-foot">{{ countLabel }} 데이터 없음</p>
        </template>
      </template>
    </div>
  </section>
</template>

<style scoped>
.adm-shell { min-height: 100vh; background: #f5f7fb; color: #111827; display: flex; flex-direction: column; }
.adm-top { position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,0.9); backdrop-filter: saturate(160%) blur(10px); border-bottom: 1px solid #e8ecf3; }
.adm-top-in { max-width: 1680px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 14px; }
.adm-back {
  border: 1px solid #dde3ee; background: #fff; border-radius: 9px;
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  line-height: 0; color: #374151; cursor: pointer;
}
.adm-back:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-title h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.3px; display: flex; align-items: baseline; gap: 7px; }
.adm-title h1 em { font-style: normal; font-size: 11.5px; font-weight: 700; color: #9ca3af; }
.adm-title p { margin: 2px 0 0; font-size: 12px; color: #9ca3af; }
.adm-csv { margin-left: auto; border: 1px solid #c7d7f8; background: #fff; border-radius: 9px; padding: 8px 14px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #2b6df3; cursor: pointer; }
.adm-csv:disabled { border-color: #e5e7eb; color: #c3c9d4; cursor: default; }

.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }
.adm-bar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 16px 18px; }
.adm-f { display: flex; flex-direction: column; gap: 6px; }
.adm-f small { font-size: 11px; font-weight: 700; color: #6b7280; display: flex; align-items: baseline; gap: 4px; }
.adm-f small em { font-style: normal; color: #aeb8ca; font-weight: 600; }
.adm-input { width: 240px; box-sizing: border-box; height: 36px; border: 1px solid #dde3ee; border-radius: 9px; background: #fff; padding: 0 11px; font-family: inherit; font-size: 13.5px; color: #111827; }
.adm-input.narrow { width: 160px; }
.adm-input:focus { outline: none; border-color: #2b6df3; }
.adm-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 9px; padding: 3px; }
.adm-seg-btn { border: none; background: transparent; border-radius: 7px; padding: 7px 13px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; white-space: nowrap; }
.adm-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17,24,39,0.1); }
.adm-load { margin-left: auto; height: 36px; padding: 0 20px; border: none; border-radius: 9px; background: #1f3a72; color: #fff; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.adm-load:hover { background: #16305f; }
.adm-load:disabled { background: #aeb8ca; cursor: default; }
.adm-ghost { border: 1px solid #dde3ee; background: #fff; border-radius: 9px; height: 36px; padding: 0 16px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #374151; cursor: pointer; }
.adm-ghost:hover { border-color: #b9cdf7; color: #2b6df3; }

.adm-warn { margin: 14px 0 0; padding: 11px 14px; border-radius: 10px; background: #fff8e8; color: #8a6400; font-size: 12.5px; font-weight: 600; }
.adm-msg { margin: 14px 0 0; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.adm-msg.err { background: #fdecea; color: #c0392b; }
.adm-msg.warn { background: #fff8e8; color: #8a6400; }

.adm-sum { margin: 18px 0 12px; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: #6b7280; }
.adm-sum strong { font-size: 15px; font-weight: 800; color: #111827; }
.adm-sum .dim { color: #9ca3af; }

.adm-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.adm-kpi { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.adm-kpi small { font-size: 11.5px; font-weight: 700; color: #6b7280; }
.adm-kpi small em { font-style: normal; color: #2b6df3; }
.adm-kpi strong { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; }
.adm-kpi.blue { background: #f4f8ff; border-color: #dbe6ff; }

.adm-tabs { margin: 16px 0 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adm-tab { border: 1px solid #e3e8f0; background: #fff; border-radius: 999px; padding: 7px 14px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; }
.adm-tab.on { border-color: #1f3a72; background: #1f3a72; color: #fff; }
.adm-tab.t-buy.on { border-color: #2b6df3; background: #2b6df3; }
.adm-tab.t-jeon.on { border-color: #0f9d7a; background: #0f9d7a; }
.adm-tab.t-wol.on { border-color: #e08a1e; background: #e08a1e; }
.adm-tab-fill { flex: 1 1 auto; }

.adm-table-wrap { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; }
.adm-table th, .adm-table td { border-bottom: 1px solid #eef1f6; border-right: 1px solid #eef1f6; padding: 9px 12px; font-size: 12.5px; text-align: center; white-space: nowrap; }
.adm-table th:last-child, .adm-table td:last-child { border-right: none; }
.adm-table thead th { background: #f7f9fc; color: #374151; font-weight: 700; }
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover td { background: #fafbfe; }
.adm-table td.n { font-variant-numeric: tabular-nums; }
.adm-table td.n.strong { font-weight: 800; }
.adm-table td.addr { text-align: left; color: #6b7280; }
/* 줄끼리 끝자리를 맞춘다 — 값을 같은 폭 상자에 담아 오른쪽에 붙인다 */
.adm-table td .v { display: inline-block; text-align: right; }
.adm-table td.price .v { min-width: 150px; }
.adm-table td.area .v { min-width: 92px; }
.adm-table td.floor .v { min-width: 24px; }
.kind { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 800; }
.kind.tt-buy { background: #eaf1ff; color: #2b6df3; }
.kind.tt-jeon { background: #e8f7f1; color: #0f9d7a; }
.kind.tt-wol { background: #fff3e2; color: #b4740f; }
.adm-foot { margin: 10px 2px 0; font-size: 11.5px; color: #9ca3af; }

@media (max-width: 760px) {
  .adm-top-in, .adm-body { padding-left: 14px; padding-right: 14px; }
  .adm-f { flex: 1 1 100%; }
  .adm-input, .adm-input.narrow { width: 100%; }
  .adm-kpis { grid-template-columns: minmax(0, 1fr); }
}
</style>
