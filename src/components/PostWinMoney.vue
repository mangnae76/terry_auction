<script setup lang="ts">
// 낙찰이후 · 진행절차 옆 박스 탭(웹) — 명도분석(협의 · 강제집행 비용 비교) / 세금분석(A안 기준 차익 · 예상 세금).
// 명도분석 기본값은 물건 값(대출 · 면적)에서, 없으면 대략의 시세. 칸마다 고쳐 쓴다.
// 세금분석은 입찰가산정 A안의 낙찰가 · 매도가 · 필요경비를 그대로 쓰고, 명도비는 명도분석 값 · 수리비는 인테리어 실제 지출(있으면)로 바꾼다.
// 매도가는 매도일이 적히면 확정 매도가다(같은 칸). 고치려면 입찰가산정으로 간다.
// 고른 값은 이 브라우저에 물건마다 기억한다. 세금 셈은 입찰가산정과 같은 profitMath.
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuctionStore } from '../stores/auctionStore';
import { useInteriorStore } from '../stores/interiorStore';
import { useFinanceStore } from '../stores/financeStore';
import { costSplitOf, ledgerRows } from '../services/expenseBook';
import { useAuthStore } from '../stores/authStore';
import { loadAccountDetail } from '../services/authRepository';
import type { AuctionDetail } from '../types/auction';
import FormattedNumberInput from './FormattedNumberInput.vue';
import { EVICT_BASIS, EVICT_DEFAULT, EVICT_SOURCES, bizIncomeTaxOf, dealCost, execCost, monthlyCarry, planOf, transferTaxOf, vatOf, type EvictInput, type HoldTerm } from '../services/postWinMoney';

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
// 예전 셈(노무비 평당 · 이사비 한 덩어리)으로 기억된 값은 버리고 새 기준으로 — 칸이 바뀌었다
const savedEv = (read().ev as Record<string, unknown> | undefined);
const ev = ref<EvictInput>({ ...seedEvict(), ...(savedEv && !('laborPerPyeong' in savedEv) ? savedEv : {}) });
/** 세금분석의 명도비 — 명도분석의 어느 쪽으로 넣을지 */
const evictPick = ref<'deal' | 'exec'>((read().pick as 'deal' | 'exec') || 'deal');
const who = ref<'biz' | 'person'>((read().who as 'biz' | 'person') || 'biz');
// 물건에서 따로 고르지 않았으면 내 정보의 사업자 구분을 따른다
const auth = useAuthStore();
onMounted(async () => {
  if (read().who) return;
  const d = await loadAccountDetail(auth.uid);
  if (d.bizType === 'none') who.value = 'person';
  else if (d.bizType === 'biz') who.value = 'biz';
});
const term = ref<HoldTerm>((read().term as HoldTerm) || 'lt1');
watch([ev, evictPick, who, term], () => {
  try { localStorage.setItem(key(), JSON.stringify({ ev: ev.value, pick: evictPick.value, who: who.value, term: term.value })); } catch { /* 그만 */ }
}, { deep: true });
const reset = () => { ev.value = seedEvict(); };

// ===== 명도분석 =====
const deal = computed(() => dealCost(ev.value));
const exec = computed(() => execCost(ev.value));
const save = computed(() => exec.value.total - deal.value.total);
const EV_FIELDS: Array<[keyof EvictInput, string, string]> = [
  ['loan', '대출금', '원'], ['ratePct', '연 금리', '%'], ['monthlyFee', '한 달 관리비 · 공과금', '원'], ['pyeong', '전용 평수', '평'],
  ['movePerPyeong', '이사비(평당)', '원'], ['dealMonths', '협의 때 걸리는 달', '개월'], ['orderCost', '인도명령 인지 · 송달료', '원'], ['noticeCost', '내용증명 한 번', '원'],
  ['execBase', '집행 접수 · 계고 예납', '원'], ['laborDaily', '노무자 일당', '원'], ['locksmith', '열쇠공(개문)', '원'], ['truck', '운반(트럭)', '원'],
  ['ladder', '사다리차', '원'], ['storagePerMonth', '짐 보관료(한 달)', '원'], ['storageMonths', '보관 달', '개월'], ['serveExtra', '특별 · 공시송달', '원'],
  ['execMonths', '강제집행 때 걸리는 달', '개월'],
];

// ===== 세금분석 =====
const router = useRouter();
const store = useAuctionStore();
/** 입찰가산정으로 — 물건상세 수익분석 탭 */
const goPlan = () => { if (props.auction?.id) router.push({ path: `/auctions/${props.auction.id}`, query: { tab: 'profit' } }); };
const plan = computed(() => planOf(props.auction));
// 실제 기록 — 진행절차 필요경비 · 사업경비(자금관리와 같은 기록). 적힌 게 있으면 A안 대신 쓴다
const finance = useFinanceStore();
const interior = useInteriorStore();
finance.initialize();
interior.initialize();
const ledger = computed(() => ledgerRows({ be: finance.businessExpenses, interior: interior.rows, fuel: finance.fuelMeal, item: finance.itemPurchases }));
const saleFixed = computed(() => !!props.auction?.sellDate);
const evictCost = computed(() => (evictPick.value === 'deal' ? deal.value.total : exec.value.total));
const evictLabel = computed(() => (evictPick.value === 'deal' ? '협의' : '강제집행'));
const split = computed(() => costSplitOf({ id: props.auction?.id ?? '', bidCost: props.auction?.bidCost, metrics: props.auction?.metrics }, ledger.value, evictCost.value));
/** 매매차익(예정신고) — 매도가 − 낙찰가 − 필요경비 */
const tradeGain = computed(() => plan.value.sale - plan.value.bid - split.value.need);
/** 사업소득 — 매매차익 − 사업경비(5월 종합소득세) */
const gain = computed(() => tradeGain.value - split.value.biz);
const vat = computed(() => vatOf(props.auction?.propertyType ?? '', props.auction?.buildingAreaM2 ?? 0));
// 매출 · 다른 차익 — 매도 기록(매도일 · 매도가)에서 해마다 셈한다. 없으면 0
const thisYear = new Date().getFullYear();
const soldIn = (y: number) => store.auctions.filter((x) => x.id !== props.auction?.id && String(x.sellDate ?? '').startsWith(String(y)));
const salesOf = (y: number) => soldIn(y).reduce((s, x) => s + (x.expectedSaleValue || 0), 0);
const lastSales = computed(() => salesOf(thisYear - 1));
const thisSales = computed(() => salesOf(thisYear));
const otherGain = computed(() => soldIn(thisYear).reduce((s, x) => {
  const p = planOf(x);
  const c = costSplitOf(x, ledger.value);
  return s + Math.max(0, p.sale - p.bid - c.need - c.biz);
}, 0));
const biz = computed(() => bizIncomeTaxOf(gain.value, otherGain.value));
// 개인 양도세는 필요경비만 뺀다 — 사업경비(이자 · 수리 · 명도 …)는 경비가 아니다
const personGain = computed(() => tradeGain.value);
const person = computed(() => transferTaxOf(personGain.value, term.value));
const res = computed(() => (who.value === 'biz' ? biz.value : person.value));
const taxSum = computed(() => res.value.incomeTax + res.value.localTax);
const effPct = computed(() => { const g = who.value === 'biz' ? gain.value : personGain.value; return g > 0 ? Math.round((taxSum.value / g) * 1000) / 10 : 0; });
</script>

<template>
  <section class="pwm">
    <header class="pwm-head">
      <h2>{{ mode === 'evict' ? '명도분석' : '세금분석' }}</h2>
      <span v-if="auction?.caseNumber" class="pwm-cap">경매 <b>{{ auction.caseNumber }}</b> {{ mode === 'evict' ? '사건의 명도 비용을 비교합니다' : '사건의 예상 세금을 셈합니다 — 필요경비 · 사업경비는 실제 기록, 없으면 입찰가산정 A안' }}</span>
    </header>
    <!-- ===== 명도분석 ===== -->
    <template v-if="mode === 'evict'">
      <!-- 한눈에 — 협의 · 강제집행의 기간과 비용, 그 차이 -->
      <div class="pwm-nav">
        <div class="deal"><small>협의로 끝날 때</small><b>{{ ev.dealMonths }}개월 · {{ man(deal.total) }}</b></div>
        <div class="exec"><small>강제집행까지 갈 때</small><b>{{ ev.execMonths }}개월 · {{ man(exec.total) }}</b></div>
        <div class="gap"><small>차이</small><b>{{ ev.execMonths - ev.dealMonths >= 0 ? '+' : '' }}{{ ev.execMonths - ev.dealMonths }}개월 · {{ save >= 0 ? '+' : '-' }}{{ man(Math.abs(save)) }}</b><em>한 달 늦어질 때마다 {{ man(monthlyCarry(ev)) }}</em></div>
      </div>
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
      <p v-if="save < 0" class="pwm-save neg">이 값으로는 강제집행 쪽이 <b>{{ man(-save) }}</b> 적다 — 이사비를 다시 본다</p>


      <article class="pwm-box">
      <h3 class="pwm-h">계산에 쓴 값<button type="button" class="pwm-reset" @click="reset">초기화</button></h3>
      <div class="pwm-fields">
        <label v-for="[k, label, unit] in EV_FIELDS" :key="k">
          <span>{{ label }}</span>
          <span class="pwm-in"><FormattedNumberInput v-model="ev[k] as number" live-group :max-fraction-digits="unit === '%' ? 2 : 0" /><em>{{ unit }}</em></span>
        </label>
      </div>
      <ul class="pwm-basis"><li v-for="b in EVICT_BASIS" :key="b">{{ b }}</li></ul>
      <p class="pwm-src">출처 <a v-for="x in EVICT_SOURCES" :key="x.href" :href="x.href" target="_blank" rel="noopener">{{ x.label }} ↗</a></p>
      <p class="pwm-note">기본값은 위 시세를 따른 대략 값입니다 — 업체 견적 · 법원 예납 고지를 받으면 고쳐 쓰세요.</p>
      </article>
    </template>

    <!-- ===== 세금분석 ===== -->
    <template v-else>
      <div class="pwm-taxbar">
        <div class="pwm-seg">
          <button type="button" :class="{ on: who === 'biz' }" @click="who = 'biz'">매매사업자</button>
          <button type="button" :class="{ on: who === 'person' }" @click="who = 'person'">개인</button>
        </div>
        <div class="pwm-seg">
          <span>명도비</span>
          <button type="button" :class="{ on: evictPick === 'deal' }" @click="evictPick = 'deal'">협의 {{ man(deal.total) }}</button>
          <button type="button" :class="{ on: evictPick === 'exec' }" @click="evictPick = 'exec'">강제집행 {{ man(exec.total) }}</button>
        </div>
        <button type="button" class="pwm-go" @click="goPlan">입찰가산정 A안 고치기 ›</button>
      </div>

      <div class="pwm-tax">
        <article class="pwm-card">
          <h3>비용 및 차익</h3>
          <dl>
            <div><dt>낙찰가</dt><dd>{{ won(plan.bid) }}</dd></div>
            <div><dt>매도가</dt><dd>{{ won(plan.sale) }}<small>{{ saleFixed ? `확정 — 매도일 ${auction?.sellDate}` : '입찰가산정 A안 예상' }}</small></dd></div>
            <div><dt>필요경비</dt><dd>{{ won(split.need) }}<small>{{ split.needActual ? '실제 기록 — 필요경비 탭' : `A안 — 취득세 ${won(split.acq)}(낙찰가의 ${plan.acqPct}%) · 법무비 · 중개수수료` }}</small></dd></div>
            <div :class="{ key: who !== 'biz' }"><dt>{{ who === 'biz' ? '매매차익' : '양도차익' }}</dt><dd :class="{ neg: tradeGain < 0 }">{{ won(tradeGain) }}<small>매도가 − 낙찰가 − 필요경비{{ who === 'biz' ? ' — 예정신고' : '' }}</small></dd></div>
            <template v-if="who === 'biz'">
              <div><dt>사업경비</dt><dd>{{ won(split.biz) }}<small>{{ split.bizActual ? '실제 기록 — 사업경비 탭' : `A안 — 이자 · 수리 · 관리비 등 ${won(split.bizPlan - split.evictPlan)} + 명도비(${evictLabel}) ${won(split.evictPlan)}` }}</small></dd></div>
              <div class="key"><dt>사업소득</dt><dd :class="{ neg: gain < 0 }">{{ won(gain) }}<small>매매차익 − 사업경비 — 5월 종합소득세</small></dd></div>
            </template>
            <div><dt>부가세 대상</dt><dd><span :class="['pwm-tag', { on: who === 'biz' && vat.taxable }]">{{ who !== 'biz' ? '해당없음' : vat.taxable ? '과세' : '면세' }}</span><small>{{ who !== 'biz' ? '개인 양도는 부가세가 없습니다' : vat.why }}</small></dd></div>
          </dl>
        </article>

        <article class="pwm-card">
          <h3>{{ who === 'biz' ? '종합소득세(예상)' : '양도소득세(예상)' }}</h3>
          <dl v-if="who === 'biz'">
            <div><dt>전년도 매출</dt><dd>{{ won(lastSales) }}<small>{{ lastSales >= 300_000_000 ? '3억 이상 — 복식부기 의무' : '3억 미만 — 간편장부 대상' }}</small></dd></div>
            <div><dt>금년도 누적매출</dt><dd>{{ won(thisSales) }}<small>올해 다른 매매차익 {{ won(otherGain) }}</small></dd></div>
            <div><dt>적용 세율</dt><dd>{{ biz.ratePct }}%<small>과세표준 {{ won(biz.base) }} — 올해 차익 합산</small></dd></div>
            <div class="key"><dt>예상 종합소득세</dt><dd>{{ won(taxSum) }}<small>실효세율 {{ effPct }}% · 지방세 {{ won(biz.localTax) }} 포함</small></dd></div>
            <div><dt>세후 남는 돈</dt><dd :class="{ neg: biz.afterTax < 0 }">{{ won(biz.afterTax) }}</dd></div>
          </dl>
          <dl v-else>
            <div><dt>보유 기간</dt><dd><span class="pwm-seg sm">
              <button type="button" :class="{ on: term === 'lt1' }" @click="term = 'lt1'">1년미만</button>
              <button type="button" :class="{ on: term === 'lt2' }" @click="term = 'lt2'">2년미만</button>
              <button type="button" :class="{ on: term === 'ge2' }" @click="term = 'ge2'">2년이상</button>
            </span></dd></div>
            <div><dt>양도차익</dt><dd>{{ won(personGain) }}<small>필요경비만 뺌 — 이자 · 수리 · 명도비는 개인 양도세 경비가 아님</small></dd></div>
            <div><dt>적용 세율</dt><dd>{{ person.ratePct }}%<small>과세표준 {{ won(person.base) }} — 기본공제 250만원</small></dd></div>
            <div class="key"><dt>예상 양도소득세</dt><dd>{{ won(taxSum) }}<small>실효세율 {{ effPct }}% · 지방세 {{ won(person.localTax) }} 포함</small></dd></div>
            <div><dt>세후 남는 돈</dt><dd :class="{ neg: person.afterTax < 0 }">{{ won(person.afterTax) }}</dd></div>
          </dl>
          <p class="pwm-memo" v-if="who === 'biz'">비교과세 — 조정대상지역 주택 · 비사업용 토지 등은 양도세 세율로 셈한 금액과 비교해 큰 쪽을 냅니다(소득세법 제64조). 매도 뒤 2개월 안에 매매차익 예정신고, 이듬해 5월 종합소득세로 합산합니다.</p>
          <p class="pwm-memo" v-else>1주택 비과세 · 다주택 중과 · 장기보유특별공제는 셈하지 않은 대략 값입니다 — 세무사에게 확인하세요.</p>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pwm { color-scheme: light; background: #fff; border-radius: 10px; padding: 24px 32px 30px; color: #111827; }
.pwm-head { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid #eef1f6; }
.pwm-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.pwm-cap { font-size: 14px; color: #6b7280; }
.pwm-cap b { color: #111827; font-weight: 700; }
.pwm-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.pwm-nav > div { display: flex; flex-direction: column; gap: 6px; padding: 16px 22px; border: 1px solid #e3e8f0; border-radius: 10px; }
.pwm-nav small { font-size: 14px; color: #6b7280; }
.pwm-nav b { font-size: 18px; font-weight: 800; }
.pwm-nav em { font-style: normal; font-size: 14px; color: #6b7280; }
.pwm-nav .deal b { color: #2f7d4a; }
.pwm-nav .exec b { color: #b44545; }
.pwm-nav .gap { border-color: #2b6df3; background: #f2f6fe; }
.pwm-nav .gap b { color: #1d4ed8; }
.pwm-cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pwm-case { border: 1px solid #e3e8f0; border-radius: 10px; padding: 18px 24px 20px; }
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
.pwm-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 14px; }
.pwm-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #4b5563; }
.pwm-in { display: inline-flex; align-items: center; gap: 6px; }
.pwm-in :deep(input) { width: 100%; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; color: #111827; background: #fff; box-sizing: border-box; }
.pwm-in em { font-style: normal; font-size: 14px; color: #6b7280; white-space: nowrap; }
.pwm-basis { margin: 12px 0 0; padding-left: 18px; font-size: 14px; color: #4b5563; line-height: 1.7; }
.pwm-src { margin: 10px 0 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #6b7280; }
.pwm-src a { color: #1d4ed8; text-decoration: none; }
.pwm-src a:hover { text-decoration: underline; }
.pwm-box { margin-top: 22px; border: 1px solid #e3e8f0; border-radius: 10px; padding: 18px 24px 20px; }
.pwm-box > .pwm-h:first-child { margin-top: 0; }
.pwm-note { margin: 10px 0 0; font-size: 14px; color: #9ca3af; }
.pwm-reset { margin-left: auto; height: 30px; padding: 0 12px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; cursor: pointer; }
.pwm-taxbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-bottom: 18px; }
.pwm-seg { display: inline-flex; align-items: center; gap: 6px; }
.pwm-seg > span { font-size: 14px; color: #6b7280; margin-right: 2px; }
.pwm-seg button { height: 32px; padding: 0 12px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
.pwm-seg button.on { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.pwm-seg.sm button { height: 28px; padding: 0 10px; }
.pwm-go { margin-left: auto; height: 32px; padding: 0 14px; border: 1px solid #2b6df3; border-radius: 6px; background: #fff; color: #1d4ed8; font-size: 14px; cursor: pointer; }
.pwm-go:hover { background: #f2f6fe; }
.pwm-tax { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.pwm-card { border: 1px solid #e3e8f0; border-radius: 10px; padding: 20px 26px 22px; }
.pwm-card h3 { margin: 0 0 6px; font-size: 16px; font-weight: 800; }
.pwm-card dl { margin: 0; }
.pwm-card dl > div { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; padding: 14px 4px; border-bottom: 1px solid #eef1f6; }
.pwm-card dl > div:last-child { border-bottom: 0; }
.pwm-card dt { font-size: 14px; font-weight: 700; color: #374151; white-space: nowrap; }
.pwm-card dd { margin: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 15px; font-weight: 700; color: #111827; text-align: right; }
.pwm-card dd small { font-size: 12px; font-weight: 400; color: #6b7280; }
.pwm-card .key dt { font-size: 15px; color: #111827; }
.pwm-card .key dd { font-size: 18px; font-weight: 800; color: #1d4ed8; }
.pwm-card dd.neg { color: #b44545; }
.pwm-tag { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #f1f3f6; color: #4b5563; font-size: 13px; font-weight: 700; }
.pwm-tag.on { background: #fdecec; color: #b44545; }
.pwm-memo { margin: 12px 0 0; padding: 12px 16px; border-radius: 8px; background: #f7f8fa; font-size: 13px; color: #4b5563; line-height: 1.6; }
@media (max-width: 1100px) { .pwm-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pwm-tax { grid-template-columns: 1fr; } }
</style>
