<script setup lang="ts">
// 낙찰이후 · 진행절차 옆 박스 탭(웹) — 명도분석(협의 · 강제집행 비용 비교 + 리스크) / 세금분석(필요경비 · 예상 세금).
// 기본값은 물건 값(입찰가산정에 적어 둔 대출 · 취득세 · 매도가 · 면적)에서 가져오고, 없으면 대략의 시세. 칸마다 고쳐 쓴다.
// 고친 값은 이 브라우저에 물건마다 기억한다. 세금 셈은 입찰가산정과 같은 profitMath.
import { computed, ref, watch } from 'vue';
import type { AuctionDetail } from '../types/auction';
import FormattedNumberInput from './FormattedNumberInput.vue';
import { EVICT_DEFAULT, dealCost, execCost, monthlyCarry, taxOf, transferTaxOf, type EvictInput, type HoldTerm } from '../services/postWinMoney';

const props = defineProps<{ auction: AuctionDetail | null; mode: 'evict' | 'tax' }>();

const key = () => `pw.money.${props.auction?.id ?? ''}`;
const read = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch { return {}; } };
const won = (n: number) => `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
const man = (n: number) => `${Math.round((n || 0) / 10_000).toLocaleString('ko-KR')}만원`;

/** 물건 값에서 처음 값 */
const seedEvict = (): EvictInput => {
  const a = props.auction;
  return {
    ...EVICT_DEFAULT,
    loan: a?.bidCost?.loanAmount || EVICT_DEFAULT.loan,
    pyeong: Math.round(a?.buildingAreaPyeong || EVICT_DEFAULT.pyeong),
  };
};
const seedTax = () => {
  const a = props.auction; const c = a?.bidCost;
  const bid = a?.metrics?.myBidValue || 0;
  return {
    bid,
    sale: a?.expectedSaleValue || 0,
    acq: c?.acquisitionTaxAmount || Math.round(bid * 0.011),
    legal: c?.legalCostAmount || 0,
    interest: c?.interestAmount || 0,
    midRepay: c?.midRepaymentAmount || 0,
    brokerage: c?.brokerageAmount || 0,
    repair: c?.repairCost || 0,
    arrears: c?.arrearsFee || 0,
    ad: c?.advertisingCost || 0,
  };
};
const ev = ref<EvictInput>({ ...seedEvict(), ...((read().ev as object) ?? {}) });
const tx = ref({ ...seedTax(), ...((read().tx as object) ?? {}) });
/** 세금분석의 명도비 — 명도분석의 어느 쪽으로 넣을지 */
const evictPick = ref<'deal' | 'exec'>((read().pick as 'deal' | 'exec') || 'deal');
const who = ref<'biz' | 'person'>((read().who as 'biz' | 'person') || 'biz');
const term = ref<HoldTerm>((read().term as HoldTerm) || 'lt1');
watch([ev, tx, evictPick, who, term], () => {
  try { localStorage.setItem(key(), JSON.stringify({ ev: ev.value, tx: tx.value, pick: evictPick.value, who: who.value, term: term.value })); } catch { /* 그만 */ }
}, { deep: true });
const reset = () => { ev.value = seedEvict(); tx.value = seedTax(); };

// ===== 명도분석 =====
const deal = computed(() => dealCost(ev.value));
const exec = computed(() => execCost(ev.value));
const save = computed(() => exec.value.total - deal.value.total);
const EV_FIELDS: Array<[keyof EvictInput, string, string]> = [
  ['loan', '대출금', '원'], ['ratePct', '연 금리', '%'], ['monthlyFee', '한 달 관리비 · 공과금', '원'], ['pyeong', '전용 평수', '평'],
  ['moveMoney', '이사비(협의)', '원'], ['dealMonths', '협의 때 걸리는 달', '개월'], ['orderCost', '인도명령 인지 · 송달료', '원'], ['noticeCost', '내용증명 한 번', '원'],
  ['execBase', '집행 접수 · 계고 예납', '원'], ['laborPerPyeong', '노무비(평당)', '원'], ['truck', '사다리차 · 운반', '원'], ['storagePerMonth', '짐 보관료(한 달)', '원'],
  ['storageMonths', '보관 달', '개월'], ['serveExtra', '특별 · 공시송달', '원'], ['execMonths', '강제집행 때 걸리는 달', '개월'],
];
const RISKS: Array<[string, string]> = [
  ['대항력 있는 임차인', '보증금을 낙찰자가 물어 줘야 할 수 있다 — 인도명령 대상도 아니다'],
  ['유치권 주장', '공사대금 등을 이유로 버티면 소송까지 갈 수 있다'],
  ['점유자가 바뀜', '인도명령은 적힌 사람에게만 — 점유이전금지 가처분으로 막는다'],
  ['연락 두절 · 폐문부재', '송달이 늦어져 특별 · 공시송달로 1~2개월 더 걸린다'],
  ['짐을 두고 감', '강제집행 뒤 보관 · 처리 절차로 몇 달 더 걸리고 보관료가 쌓인다'],
  ['미납 관리비', '공용부분은 낙찰자 몫 — 미리 금액을 확인한다'],
];

// ===== 세금분석 =====
const evictCost = computed(() => (evictPick.value === 'deal' ? deal.value.total : exec.value.total));
const TX_FIELDS: Array<[string, string]> = [
  ['acq', '취득세'], ['legal', '법무비'], ['interest', '대출이자'], ['midRepay', '중도상환수수료'],
  ['brokerage', '매도 중개수수료'], ['repair', '수리 · 인테리어'], ['arrears', '미납 관리비'], ['ad', '광고비'],
];
const costLines = computed(() => [
  ...TX_FIELDS.map(([k, label]) => ({ label, amount: Number((tx.value as Record<string, number>)[k]) || 0 })),
  { label: `명도비(${evictPick.value === 'deal' ? '협의' : '강제집행'})`, amount: evictCost.value },
]);
const biz = computed(() => taxOf({ bid: tx.value.bid, sale: tx.value.sale, costs: costLines.value }));
// 개인 양도세는 대출이자 · 중도상환수수료를 경비로 넣지 못한다 — 그만큼 차익에 되돌린다
const personGain = computed(() => biz.value.gain + (Number(tx.value.interest) || 0) + (Number(tx.value.midRepay) || 0));
const person = computed(() => transferTaxOf(personGain.value, term.value));
const result = computed(() => (who.value === 'biz'
  ? { label: '사업소득세(매매사업자)', rate: biz.value.ratePct, tax: biz.value.incomeTax, local: biz.value.localTax, after: biz.value.afterTax }
  : { label: '양도소득세(개인)', rate: person.value.ratePct, tax: person.value.incomeTax, local: person.value.localTax, after: person.value.afterTax }));
</script>

<template>
  <section class="pwm">
    <!-- ===== 명도분석 ===== -->
    <template v-if="mode === 'evict'">
      <div class="pwm-cmp">
        <article class="pwm-case deal">
          <h3>협의로 끝날 때</h3>
          <ul><li v-for="l in deal.lines" :key="l.label"><span>{{ l.label }}</span><b>{{ won(l.amount) }}</b></li></ul>
          <p class="pwm-total">합계 <b>{{ won(deal.total) }}</b></p>
        </article>
        <article class="pwm-case exec">
          <h3>강제집행까지 갈 때</h3>
          <ul><li v-for="l in exec.lines" :key="l.label"><span>{{ l.label }}</span><b>{{ won(l.amount) }}</b></li></ul>
          <p class="pwm-total">합계 <b>{{ won(exec.total) }}</b></p>
        </article>
      </div>
      <p class="pwm-save" :class="{ neg: save < 0 }">
        <template v-if="save >= 0">협의로 끝내면 약 <b>{{ man(save) }}</b> 아낀다 — 한 달 늦어질 때마다 {{ won(monthlyCarry(ev)) }}씩 더 나간다</template>
        <template v-else>이 값으로는 강제집행 쪽이 <b>{{ man(-save) }}</b> 적다 — 이사비를 다시 본다</template>
      </p>

      <h3 class="pwm-h">리스크</h3>
      <table class="pwm-tbl">
        <tbody><tr v-for="[k, v] in RISKS" :key="k"><th>{{ k }}</th><td>{{ v }}</td></tr></tbody>
      </table>

      <h3 class="pwm-h">셈에 쓴 값<button type="button" class="pwm-reset" @click="reset">초기화</button></h3>
      <div class="pwm-fields">
        <label v-for="[k, label, unit] in EV_FIELDS" :key="k">
          <span>{{ label }}</span>
          <span class="pwm-in"><FormattedNumberInput v-model="ev[k] as number" live-group :max-fraction-digits="unit === '%' ? 2 : 0" /><em>{{ unit }}</em></span>
        </label>
      </div>
      <p class="pwm-note">기본값은 대략의 시세입니다 — 업체 견적 · 법원 예납 고지를 받으면 고쳐 쓰세요.</p>
    </template>

    <!-- ===== 세금분석 ===== -->
    <template v-else>
      <div class="pwm-who">
        <button type="button" :class="{ on: who === 'biz' }" @click="who = 'biz'">매매사업자</button>
        <button type="button" :class="{ on: who === 'person' }" @click="who = 'person'">개인양도세</button>
        <template v-if="who === 'person'">
          <span class="pwm-sep" />
          <button type="button" :class="{ on: term === 'lt1' }" @click="term = 'lt1'">1년미만</button>
          <button type="button" :class="{ on: term === 'lt2' }" @click="term = 'lt2'">2년미만</button>
          <button type="button" :class="{ on: term === 'ge2' }" @click="term = 'ge2'">2년이상</button>
        </template>
      </div>

      <div class="pwm-sum">
        <div><small>{{ who === 'biz' ? '매매차익' : '양도차익(이자 · 중도상환 제외)' }}</small><b :class="{ neg: (who === 'biz' ? biz.gain : personGain) < 0 }">{{ won(who === 'biz' ? biz.gain : personGain) }}</b></div>
        <div><small>{{ result.label }}{{ result.rate ? ` ${result.rate}%` : '' }}</small><b>{{ won(result.tax) }}</b></div>
        <div><small>지방소득세</small><b>{{ won(result.local) }}</b></div>
        <div class="main"><small>세후 남는 돈</small><b :class="{ neg: result.after < 0 }">{{ won(result.after) }}</b></div>
      </div>

      <div class="pwm-cols">
        <div>
          <h3 class="pwm-h">사고파는 값</h3>
          <div class="pwm-fields one">
            <label><span>낙찰가</span><span class="pwm-in"><FormattedNumberInput v-model="tx.bid" live-group /><em>원</em></span></label>
            <label><span>예상 매도가</span><span class="pwm-in"><FormattedNumberInput v-model="tx.sale" live-group /><em>원</em></span></label>
          </div>
          <h3 class="pwm-h">명도비</h3>
          <div class="pwm-who sm">
            <button type="button" :class="{ on: evictPick === 'deal' }" @click="evictPick = 'deal'">협의 {{ man(deal.total) }}</button>
            <button type="button" :class="{ on: evictPick === 'exec' }" @click="evictPick = 'exec'">강제집행 {{ man(exec.total) }}</button>
          </div>
        </div>
        <div>
          <h3 class="pwm-h">필요경비 <em class="pwm-sub">합계 {{ won(biz.costTotal) }}</em></h3>
          <div class="pwm-fields one">
            <label v-for="[k, label] in TX_FIELDS" :key="k"><span>{{ label }}</span><span class="pwm-in"><FormattedNumberInput v-model="(tx as Record<string, number>)[k]" live-group /><em>원</em></span></label>
          </div>
        </div>
      </div>
      <ul class="pwm-notes">
        <li>매매사업자는 팔 때마다 매매차익 예정신고(잔금 달 말일부터 2개월 안), 이듬해 5월에 종합소득세로 합산합니다.</li>
        <li>조정대상지역 주택 등은 비교과세로 양도세 세율과 비교해 큰 쪽을 냅니다 — 해당하는지 세무사에게 확인하세요.</li>
        <li>개인 양도세는 기본공제 250만 원만 넣은 대략 값입니다(1주택 비과세 · 중과 · 장기보유특별공제는 셈하지 않음). 개인은 대출이자를 경비로 넣지 못합니다.</li>
        <li>전용 85㎡ 넘는 주택 · 상가는 건물분 부가세가 따로 붙습니다.</li>
      </ul>
      <button type="button" class="pwm-reset" @click="reset">초기화</button>
    </template>
  </section>
</template>

<style scoped>
.pwm { color-scheme: light; background: #fff; border-radius: 10px; padding: 18px 22px 22px; color: #111827; }
.pwm-cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pwm-case { border: 1px solid #e3e8f0; border-radius: 10px; padding: 14px 16px; }
.pwm-case.deal { border-top: 3px solid #4f9a68; }
.pwm-case.exec { border-top: 3px solid #c95b5b; }
.pwm-case h3 { margin: 0 0 10px; font-size: 16px; font-weight: 800; }
.pwm-case ul { margin: 0; padding: 0; list-style: none; }
.pwm-case li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #eef1f6; font-size: 14px; }
.pwm-case li span { color: #4b5563; }
.pwm-case li b { font-weight: 600; }
.pwm-total { margin: 10px 0 0; display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; }
.pwm-case.deal .pwm-total b { color: #2f7d4a; }
.pwm-case.exec .pwm-total b { color: #b44545; }
.pwm-save { margin: 14px 0 0; padding: 12px 14px; border-radius: 8px; background: #eef7f1; color: #24543a; font-size: 15px; }
.pwm-save.neg { background: #fdf0e3; color: #8a4b12; }
.pwm-h { display: flex; align-items: center; gap: 10px; margin: 22px 0 10px; font-size: 15px; font-weight: 800; }
.pwm-sub { font-style: normal; font-size: 14px; font-weight: 600; color: #6b7280; }
.pwm-tbl { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e3e8f0; border-radius: 8px; overflow: hidden; }
.pwm-tbl th, .pwm-tbl td { padding: 10px 12px; font-size: 14px; text-align: left; border-top: 1px solid #eef1f6; }
.pwm-tbl tr:first-child :is(th, td) { border-top: 0; }
.pwm-tbl th { width: 200px; background: #fdf4f4; font-weight: 700; white-space: nowrap; }
.pwm-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 14px; }
.pwm-fields.one { grid-template-columns: 1fr; }
.pwm-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #4b5563; }
.pwm-fields.one label { flex-direction: row; align-items: center; justify-content: space-between; }
.pwm-in { display: inline-flex; align-items: center; gap: 6px; }
.pwm-in :deep(input) { width: 100%; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; color: #111827; background: #fff; box-sizing: border-box; }
.pwm-fields.one .pwm-in { width: 220px; }
.pwm-in em { font-style: normal; font-size: 14px; color: #6b7280; white-space: nowrap; }
.pwm-note { margin: 10px 0 0; font-size: 14px; color: #9ca3af; }
.pwm-reset { margin-left: auto; height: 30px; padding: 0 12px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; cursor: pointer; }
.pwm-who { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pwm-who button { height: 32px; padding: 0 12px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
.pwm-who button.on { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.pwm-sep { width: 1px; height: 20px; background: #e3e8f0; margin: 0 4px; }
.pwm-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0 6px; }
.pwm-sum > div { border: 1px solid #e3e8f0; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.pwm-sum small { font-size: 14px; color: #6b7280; }
.pwm-sum b { font-size: 18px; font-weight: 800; }
.pwm-sum .main { border-color: #2b6df3; background: #f2f6fe; }
.pwm-sum b.neg, .pwm-sum .neg { color: #b44545; }
.pwm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.pwm-notes { margin: 18px 0 12px; padding-left: 18px; font-size: 14px; color: #6b7280; line-height: 1.7; }
@media (max-width: 1100px) { .pwm-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pwm-sum { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
