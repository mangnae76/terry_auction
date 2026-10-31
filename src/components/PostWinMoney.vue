<script setup lang="ts">
// 낙찰이후 · 진행절차 옆 박스 탭(웹) — 명도분석(협의 · 강제집행 비용 비교) / 세금분석(A안 기준 차익 · 예상 세금).
// 명도분석 기본값은 물건 값(대출 · 면적)에서, 없으면 대략의 시세. 칸마다 고쳐 쓴다.
// 세금분석은 필요경비 · 사업경비 장부의 값(실제로 적지 않은 줄은 입찰가산정 A안)을 쓴다.
// 명도협의 · 강제집행 단추를 누르면 명도분석 금액이 사업경비 명도비로 들어간다.
// 매도가는 매도일이 적히면 확정 매도가다(같은 칸). 고치려면 입찰가산정으로 간다.
// 고른 값은 이 브라우저에 물건마다 기억한다. 세금 셈은 입찰가산정과 같은 profitMath.
import { computed, inject, onMounted, ref, watch } from 'vue';
import { withConfirmedPlan } from '../services/confirmedPlan';
import { useRouter } from 'vue-router';
import { useAuctionStore } from '../stores/auctionStore';
import { useInteriorStore } from '../stores/interiorStore';
import { useFinanceStore } from '../stores/financeStore';
import { costSplitOf, ledgerRows } from '../services/expenseBook';
import { useAuthStore } from '../stores/authStore';
import { loadAccountDetail } from '../services/authRepository';
import type { AuctionDetail } from '../types/auction';
import FormattedNumberInput from './FormattedNumberInput.vue';
import { askEvictAi } from '../services/geminiEvict';
import { getGeminiKey, isGeminiOn, loadGeminiPrefs } from '../services/geminiPdf';
import { EVICT_BASIS, EVICT_DEFAULT, EVICT_SOURCES, bizIncomeTaxOf, dealCost, execCost, monthlyCarry, planOf, transferTaxOf, vatOf, type EvictInput, type HoldTerm } from '../services/postWinMoney';

const props = defineProps<{ auction: AuctionDetail | null; mode: 'evict' | 'tax' }>();
// 웹은 수익분석에서 '확정' 한 안의 입찰가 · 매도가 · 비용을 쓴다(앱은 그대로 A안)
const webEmbed = inject<boolean>('webEmbed', false);
const planned = <T extends AuctionDetail | null | undefined>(a: T): T => (webEmbed ? withConfirmedPlan(a) : a) as T;
const A = computed(() => planned(props.auction));

const key = () => `pw.money.${props.auction?.id ?? ''}`;
const read = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch { return {}; } };
const won = (n: number) => `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
const man = (n: number) => `${Math.round((n || 0) / 10_000).toLocaleString('ko-KR')}만원`;

/** 물건 값에서 처음 값 */
const seedEvict = (): EvictInput => {
  const a = A.value;
  return {
    ...EVICT_DEFAULT,
    loan: a?.bidCost?.loanAmount || EVICT_DEFAULT.loan,
    pyeong: Math.round(a?.buildingAreaPyeong || EVICT_DEFAULT.pyeong),
  };
};
// 예전 셈(노무비 평당 · 이사비 한 덩어리)으로 기억된 값은 버리고 새 기준으로 — 칸이 바뀌었다
const savedEv = (read().ev as Record<string, unknown> | undefined);
const ev = ref<EvictInput>({ ...seedEvict(), ...(savedEv && !('laborPerPyeong' in savedEv) ? savedEv : {}) });
const who = ref<'biz' | 'person'>((read().who as 'biz' | 'person') || 'biz');
// 물건에서 따로 고르지 않았으면 내 정보의 사업자 구분을 따른다
const auth = useAuthStore();
// 내 정보의 세금 계산 기준(웹) — 매출 · 다른 소득금액을 적어 두었으면 그 값을 쓴다
const acctSales = ref<Record<string, number>>({});
const acctOther = ref<Record<string, number>>({});
// 웹은 늘 내 정보의 사업자 구분으로 계산한다(물건마다 고르는 단추는 뺐다)
const acctBiz = ref<string>('');
const BIZ_LABEL: Record<string, string> = { none: '개인', corp: '법인', biz: '개인매매사업자', corpBiz: '법인매매사업자' };
onMounted(async () => {
  const d = await loadAccountDetail(auth.uid);
  if (webEmbed) {
    acctSales.value = d.salesByYear ?? {}; acctOther.value = d.otherIncomeByYear ?? {};
    acctBiz.value = d.bizType || '';
    who.value = d.bizType === 'none' ? 'person' : 'biz';   // 법인 · 법인매매사업자 · 안 고름은 법인세 계산이 없어 매매사업자 기준
    return;
  }
  if (read().who) return;
  if (d.bizType === 'none') who.value = 'person';
  else if (d.bizType === 'biz') who.value = 'biz';   // 법인 · 법인매매사업자는 법인세 셈이 아직 없어 기본(매매사업자) 그대로
});
const term = ref<HoldTerm>((read().term as HoldTerm) || 'lt1');
/** AI 명도 — 고친 칸마다 까닭 · 한두 문장 요약(이 브라우저에 물건마다 기억) */
const aiNotes = ref<Record<string, string>>((read().aiNotes as Record<string, string>) ?? {});
const aiSummary = ref(String(read().aiSummary ?? ''));
watch([ev, who, term, aiNotes, aiSummary], () => {
  try { localStorage.setItem(key(), JSON.stringify({ ev: ev.value, who: who.value, term: term.value, aiNotes: aiNotes.value, aiSummary: aiSummary.value })); } catch { /* 그만 */ }
}, { deep: true });
const reset = () => { ev.value = seedEvict(); aiNotes.value = {}; aiSummary.value = ''; };

// === AI로 채우기 — 권리분석 AI 결과 · 현장조사 · 물건 정보를 보내 계산에 쓴 값을 고친다(계산은 그대로 정해진 식) ===
const aiBusy = ref(false);
const aiErr = ref('');
/** AI 에게 넘길 사실 — 없는 것은 적지 않는다 */
const evictFacts = () => {
  const a = props.auction;
  if (!a) return '';
  const r = a.rightsAi;
  const f = a.fieldSurvey;
  const sum = a.basicSummary ?? {};
  const line = (k: string, v: unknown) => (v !== undefined && v !== null && String(v).trim() ? `- ${k}: ${String(v).trim()}` : '');
  return [
    line('물건 종류', a.propertyType),
    line('전용면적', a.buildingAreaM2 ? `${a.buildingAreaM2}㎡ (${Math.round(a.buildingAreaPyeong || a.buildingAreaM2 / 3.3058)}평)` : ''),
    line('층', [sum['sum.floorCurrent'], sum['sum.floorTotal']].filter(Boolean).join(' / 전체 ')),
    line('주소', a.address),
    line('현장조사 점유자', f?.occupantNote), line('현장조사 임대 문제', f?.rentalIssue), line('현장조사 열쇠 · 비번', f?.keyIssue),
    line('현장조사 미납 관리비 · 공과금', f?.totalArrears), line('현장조사 메모', f?.surveyMemo),
    line('권리분석 AI 명도 난이도', r?.evict?.level), line('명도 난이도 근거', r?.evict?.reason),
    line('명도 대응 전략', r?.evict?.strategy), line('명도 투자 조언', r?.evict?.advice),
    line('위험 요약', r?.risk?.summary), ...(r?.risk?.items ?? []).map((x) => line('위험', x)),
    line('인수 권리', r?.takeover?.summary),
  ].filter(Boolean).join('\n');
};
const aiFill = async () => {
  aiErr.value = '';
  const a = props.auction;
  if (!a?.rightsAi && !a?.fieldSurvey?.occupantNote && !a?.fieldSurvey?.surveyMemo) {
    aiErr.value = '먼저 물건상세 › 권리분석에서 AI 분석을 돌리거나 임장조사에 점유자 메모를 적어 주세요 — 근거가 있어야 AI가 값을 고칩니다.';
    return;
  }
  aiBusy.value = true;
  try {
    if (!isGeminiOn()) await loadGeminiPrefs(auth.uid).catch(() => undefined);
    const res = await askEvictAi(getGeminiKey(), evictFacts(), ev.value);
    const next = { ...ev.value };
    const notes: Record<string, string> = {};
    res.changes.forEach((c) => { (next as Record<string, number>)[c.field] = c.value; notes[c.field] = c.reason; });
    ev.value = next;
    aiNotes.value = notes;
    aiSummary.value = res.summary || (res.changes.length ? '' : '근거가 있는 칸이 없어 바꾼 값이 없습니다.');
    evEdit.value = true;
  } catch (e) {
    aiErr.value = e instanceof Error ? e.message : 'AI 명도 실패';
  } finally { aiBusy.value = false; }
};

// ===== 명도분석 =====
// 웹 — 수익분석(확정안)에 명도비를 적었으면 '협의로 끝날 때' 명도비로 그 금액을 쓴다(사용자가 적은 값이 먼저). 안 적었으면(0원) 자동 계산
const planEvict = computed(() => (webEmbed ? A.value?.bidCost?.evictionCost ?? 0 : 0));
// 진행절차에서 '명도협의종결'을 찍었으면 예상이 아니라 실제 — 명도비는 수익분석에 적은 금액 그대로(0원이면 0원), 지연 비용 없음, 강제집행은 진행 안 함
const dealDone = computed(() => webEmbed && !!props.auction?.postWinFlow?.endedAt);
const dealFromPlan = computed(() => planEvict.value > 0 || dealDone.value);
/** 자동 계산이었으면 얼마였나(협의 명도비) — 수익분석 값을 쓸 때 견주어 보라고 작게 적는다 */
const dealAutoDirect = computed(() => { const b = dealCost(ev.value); return b.total - b.lines[b.lines.length - 1].amount; });
const deal = computed(() => {
  const base = dealCost(ev.value);
  if (!dealFromPlan.value) return base;
  const last = base.lines[base.lines.length - 1];   // 맨 끝 줄이 늦어지는 달 이자 · 관리비
  const delay = dealDone.value ? { ...last, label: '지연 비용 없음(협의 종결)', amount: 0 } : last;
  const lines = [{ label: `명도비(${planName}에 적은 값)`, amount: planEvict.value }, delay];
  return { lines, total: lines.reduce((n, l) => n + l.amount, 0) };
});
const exec = computed(() => execCost(ev.value));
const save = computed(() => exec.value.total - deal.value.total);
/** 명도 비용을 두 묶음으로 — 명도비(이사비 또는 강제집행 비용 · 서류) · 지연 비용(늦어지는 달 이자 · 관리비) */
const delayOf = (months: number) => monthlyCarry(ev.value) * months;
const dealDelay = () => (dealDone.value ? 0 : delayOf(ev.value.dealMonths));
const evGroups = computed(() => ({
  deal: { delay: dealDelay(), direct: deal.value.total - dealDelay(), lines: deal.value.lines.slice(0, -1), months: ev.value.dealMonths },
  exec: { delay: delayOf(ev.value.execMonths), direct: exec.value.total - delayOf(ev.value.execMonths), lines: exec.value.lines.slice(0, -1), months: ev.value.execMonths },
}));
/** 계산에 쓴 값 칸을 펼쳤나 */
const evEdit = ref(false);
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
const plan = computed(() => planOf(A.value));
// 실제 기록 — 진행절차 필요경비 · 사업경비(자금관리와 같은 기록). 적힌 게 있으면 A안 대신 쓴다
const finance = useFinanceStore();
const interior = useInteriorStore();
finance.initialize();
interior.initialize();
const ledger = computed(() => ledgerRows({ be: finance.businessExpenses, interior: interior.rows }));
const saleFixed = computed(() => !!props.auction?.sellDate);
// 명도비도 사업경비 장부의 값(실제 기록, 없으면 A안 명도비) — 명도분석은 견주어 보는 계산기
const split = computed(() => costSplitOf({ id: props.auction?.id ?? '', wonDate: props.auction?.wonDate, expectedSaleValue: A.value?.expectedSaleValue, bidCost: A.value?.bidCost, metrics: A.value?.metrics }, ledger.value));
// 명도협의 · 강제집행 — 누르면 그 금액을 사업경비 명도비로 넣는다(다시 누르면 빼고 A안으로).
// 늦어지는 달의 이자 · 관리비는 대출이자 · 관리비 줄과 겹치므로 빼고 명도에 드는 돈만 넣는다
const EV_DETAIL = { deal: '이사비(합의)', exec: '강제집행 비용' } as const;
const evDirect = computed(() => ({
  deal: deal.value.total - monthlyCarry(ev.value) * ev.value.dealMonths,
  exec: exec.value.total - monthlyCarry(ev.value) * ev.value.execMonths,
}));
const evRows = computed(() => interior.rows.filter((r) => r.auctionId === props.auction?.id && r.category === '명도비' && String(r.note || '').startsWith('명도분석')));
const evOn = computed(() => (evRows.value.some((r) => r.work === EV_DETAIL.deal) ? 'deal' : evRows.value.some((r) => r.work === EV_DETAIL.exec) ? 'exec' : ''));
const evBusy = ref(false);
const pickEvict = async (k: 'deal' | 'exec') => {
  const a = props.auction;
  if (!a?.id || evBusy.value) return;
  evBusy.value = true;
  try {
    const was = evOn.value;
    for (const r of evRows.value) await interior.remove(r.id);
    if (was === k) return;
    await interior.save({
      kind: 'cost', auctionId: a.id, auctionLabel: a.caseNumber, category: '명도비', work: EV_DETAIL[k], status: '',
      startDate: new Date().toISOString().slice(0, 10), endDate: '', amountWithVat: Math.round(evDirect.value[k]),
      vendor: '', phone: '', note: k === 'deal' ? '명도분석 협의' : '명도분석 강제집행',
    });
  } finally { evBusy.value = false; }
};
// 웹은 '입찰가A' 대신 화면 이름 '수익분석' 으로 부른다(새화면엔 A안 이름이 크게 서지 않는다)
const planName = webEmbed ? '수익분석 확정안' : '입찰가A';   // 웹은 수익분석에서 확정한 안의 값을 쓴다
const srcText = (actual: number, planned: number, tab: string) => (actual && planned ? `실제 ${won(actual)} + ${planName} ${won(planned)} — ${tab} 탭`
  : actual ? `실제 기록 — ${tab} 탭` : `${planName}에서 가져옵니다 — ${tab} 탭에서 직접 입력`);
/** 매매차익(예정신고) — 매도가 − 낙찰가 − 필요경비 */
const tradeGain = computed(() => plan.value.sale - plan.value.bid - split.value.need);
/** 사업소득 — 매매차익 − 사업경비(5월 종합소득세) */
// 웹 위쪽 카드는 명도비를 빼고 계산한다(명도 전 기준) — 명도비용은 아래 두 시나리오 상자에서 명도분석 값으로 넣는다
const gain = computed(() => tradeGain.value - (webEmbed ? bizBase.value : split.value.biz));
const vat = computed(() => vatOf(props.auction?.propertyType ?? '', props.auction?.buildingAreaM2 ?? 0));
// 매출 · 다른 차익 — 매도 기록(매도일 · 매도가)에서 해마다 셈한다. 없으면 0
const thisYear = new Date().getFullYear();
const soldIn = (y: number) => store.auctions.filter((x) => x.id !== props.auction?.id && String(x.sellDate ?? '').startsWith(String(y)));
const salesOf = (y: number) => soldIn(y).reduce((s, x) => s + (planned(x).expectedSaleValue || 0), 0);
const lastSales = computed(() => acctSales.value[thisYear - 1] ?? salesOf(thisYear - 1));   // 내 정보에 적었으면 그 값
const thisSales = computed(() => acctSales.value[thisYear] ?? salesOf(thisYear));
const otherGainRec = computed(() => soldIn(thisYear).reduce((s, x) => {
  const p = planOf(planned(x));
  const c = costSplitOf(planned(x), ledger.value);
  return s + Math.max(0, p.sale - p.bid - c.need - c.biz);
}, 0));
// 과세 구간에 더할 다른 소득 — 내 정보에 적었으면 그 값, 아니면 매도 기록의 다른 매매차익
const otherGain = computed(() => acctOther.value[thisYear] ?? otherGainRec.value);
const otherFromAcct = computed(() => acctOther.value[thisYear] != null);
const biz = computed(() => bizIncomeTaxOf(gain.value, otherGain.value));
// 개인 양도세는 필요경비만 뺀다 — 사업경비(이자 · 수리 · 명도 …)는 경비가 아니다
const personGain = computed(() => tradeGain.value);
const person = computed(() => transferTaxOf(personGain.value, term.value));
const res = computed(() => (who.value === 'biz' ? biz.value : person.value));
const taxSum = computed(() => res.value.incomeTax + res.value.localTax);
/** 지금 사업경비에 들어 있는 명도비 — 명도분석에서 고른 확정 금액, 없으면 수익분석 확정안의 예상값 */
const evictCost = computed(() => (evRows.value.length ? evRows.value.reduce((n, r) => n + (Number(r.amountWithVat) || 0), 0) : (A.value?.bidCost?.evictionCost ?? 0)));
const netInvest = computed(() => plan.value.bid - (A.value?.bidCost?.loanAmount ?? 0) + split.value.need + split.value.biz);
/** 최종 순수익 두 경우 — 명도협의 · 강제집행. 사업경비에서 지금 들어 있는 명도비를 빼고, 경우마다 명도비 + 지연 비용을 넣어 세금까지 다시 셈한다 */
const bizBase = computed(() => split.value.biz - evictCost.value);
const finalCase = (k: 'deal' | 'exec') => {
  const g = evGroups.value[k];
  const evTotal = g.direct + g.delay;
  const tax = who.value === 'biz'
    ? (() => { const t = bizIncomeTaxOf(tradeGain.value - bizBase.value - evTotal, otherGain.value); return t.incomeTax + t.localTax; })()
    : taxSum.value;   // 개인 양도세는 명도비 · 이자를 경비로 빼지 않는다
  const net = tradeGain.value - bizBase.value - evTotal - tax;
  return { direct: g.direct, delay: g.delay, months: g.months, evTotal, tax, net, rate: netInvest.value > 0 ? Math.round((net / netInvest.value) * 10000) / 100 : 0 };
};
const finals = computed(() => ({ deal: finalCase('deal'), exec: finalCase('exec') }));
const acqTax = computed(() => A.value?.bidCost?.acquisitionTaxAmount ?? 0);
const effPct = computed(() => { const g = who.value === 'biz' ? gain.value : personGain.value; return g > 0 ? Math.round((taxSum.value / g) * 1000) / 10 : 0; });
</script>

<template>
  <section class="pwm">
    <header class="pwm-head">
      <!-- 명도분석은 AI 로 값을 채운다 — 제목에 AI 표시, 오른쪽 끝에 시작 단추(권리분석 'AI 권리분석 시작'과 같은 꼴) -->
      <h2 v-if="mode === 'evict'"><svg class="pwm-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z"/></svg>{{ webEmbed ? '명도분석' : 'AI 명도분석' }}</h2>
      <h2 v-else>세금분석</h2>
      <span v-if="auction?.caseNumber" class="pwm-cap">경매 <b>{{ auction.caseNumber }}</b> {{ mode === 'evict' ? '사건의 명도 비용을 비교합니다' : '사건의 예상 세금을 필요경비 · 사업경비 탭의 값으로 계산합니다' }}</span>
      <button v-if="mode === 'evict' && !webEmbed" type="button" class="pwm-ai-start head" :disabled="aiBusy" @click="aiFill">{{ aiBusy ? 'AI가 읽는 중…' : 'AI 명도분석 시작' }}</button>
    </header>
    <!-- ===== 명도분석 ===== -->
    <template v-if="mode === 'evict'">
      <!-- 한눈에 — 협의 · 강제집행의 기간과 비용, 그 차이 -->
      <div class="pwm-nav">
        <div class="deal"><small>협의로 끝날 때</small><b>{{ ev.dealMonths }}개월 · {{ man(deal.total) }}</b></div>
        <div class="exec"><small>강제집행까지 갈 때</small><b>{{ ev.execMonths }}개월 · {{ man(exec.total) }}</b></div>
        <div class="gap"><small>차이</small><b>{{ ev.execMonths - ev.dealMonths >= 0 ? '+' : '' }}{{ ev.execMonths - ev.dealMonths }}개월 · {{ save >= 0 ? '+' : '-' }}{{ man(Math.abs(save)) }}</b><em>한 달 늦어질 때마다 {{ man(monthlyCarry(ev)) }}</em></div>
      </div>
      <p v-if="dealDone" class="pwm-done">명도협의로 종결했습니다({{ auction?.postWinFlow?.endedAt }}) — 명도비는 {{ planName }}에 적은 금액({{ won(planEvict) }})을 쓰고, 강제집행은 진행하지 않습니다. 실제로 쓴 금액은 수익분석 명도비에 적으세요.</p>
      <div :class="['pwm-cmp', { done: dealDone }]">
        <article class="pwm-case deal">
          <h3>협의로 끝날 때</h3>
          <template v-if="webEmbed">
            <div class="pwm-grpbox">
              <p class="pwm-grp"><span>명도비 <em>{{ dealDone ? `협의 종결 — ${planName}에 적은 실제 금액` : dealFromPlan ? `${planName}에 적은 값 — 지우면 자동 계산` : '이사비 · 서류' }}</em></span><b>{{ won(evGroups.deal.direct) }}</b></p>
              <ul><li v-for="l in evGroups.deal.lines" :key="l.label"><span>{{ l.label }}</span><b>{{ won(l.amount) }}</b></li></ul>
              <p v-if="dealFromPlan && !dealDone" class="pwm-auto">자동 계산이면 {{ won(dealAutoDirect) }}(이사비 · 서류)</p>
            </div>
            <p class="pwm-grp"><span>지연 비용 <em>{{ dealDone ? '협의 종결 — 없음' : `늦어지는 ${evGroups.deal.months}개월 이자 · 관리비` }}</em></span><b>{{ won(evGroups.deal.delay) }}</b></p>
          </template>
          <ul v-else><li v-for="l in deal.lines" :key="l.label"><span>{{ l.label }}</span><b>{{ won(l.amount) }}</b></li></ul>
          <p class="pwm-total">합계 <b>{{ won(deal.total) }}</b></p>
        </article>
        <article class="pwm-case exec">
          <h3>강제집행까지 갈 때</h3>
          <template v-if="webEmbed">
            <div class="pwm-grpbox">
              <p class="pwm-grp"><span>명도비 <em>강제집행 비용 · 서류</em></span><b>{{ won(evGroups.exec.direct) }}</b></p>
              <ul><li v-for="l in evGroups.exec.lines" :key="l.label"><span>{{ l.label }}</span><b>{{ won(l.amount) }}</b></li></ul>
            </div>
            <p class="pwm-grp"><span>지연 비용 <em>늦어지는 {{ evGroups.exec.months }}개월 이자 · 관리비</em></span><b>{{ won(evGroups.exec.delay) }}</b></p>
          </template>
          <ul v-else><li v-for="l in exec.lines" :key="l.label"><span>{{ l.label }}</span><b>{{ won(l.amount) }}</b></li></ul>
          <p class="pwm-total">합계 <b>{{ won(exec.total) }}</b></p>
        </article>
      </div>
      <p v-if="save < 0" class="pwm-save neg">이 값으로는 강제집행 쪽이 <b>{{ man(-save) }}</b> 적다 — 이사비를 다시 본다</p>


      <article class="pwm-box">
      <!-- 계산에 쓴 값 — 평소엔 접어 두고, 실제 비용(견적 · 예납 고지)이 나오면 [직접입력]으로 펼쳐 고친다 -->
      <h3 class="pwm-h">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v7" /></svg>
        계산에 쓴 값
        <!-- 앱: 직접입력 왼쪽 · AI 오른쪽. 웹: AI 명도분석 시작을 직접입력 왼쪽에(머리 단추는 뺐다) — 두 단추는 같은 크기 -->
        <button v-if="webEmbed" type="button" class="pwm-ai-start lead" :disabled="aiBusy" @click="aiFill">{{ aiBusy ? 'AI가 읽는 중…' : 'AI 명도분석 시작' }}</button>
        <button type="button" :class="['pwm-edit', { on: evEdit }]" @click="evEdit = !evEdit">{{ evEdit ? '접기' : '직접입력' }}</button>
        <button v-if="!webEmbed" type="button" class="pwm-ai-start" :disabled="aiBusy" @click="aiFill">{{ aiBusy ? 'AI가 읽는 중…' : 'AI 명도분석 시작' }}</button>
        <button v-if="evEdit" type="button" class="pwm-reset" @click="reset">초기화</button>
      </h3>
      <p v-if="aiErr" class="pwm-aierr">{{ aiErr }}</p>
      <p v-if="aiSummary" class="pwm-aisum"><b>AI 요약</b>{{ aiSummary }}</p>
      <div v-if="evEdit" class="pwm-fields">
        <label v-for="[k, label, unit] in EV_FIELDS" :key="k">
          <span>{{ label }}</span>
          <span class="pwm-in"><FormattedNumberInput v-model="ev[k] as number" live-group :max-fraction-digits="unit === '%' ? 2 : 0" /><em>{{ unit }}</em></span>
          <small v-if="aiNotes[k]" class="pwm-ainote">AI · {{ aiNotes[k] }}</small>
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
        <div v-if="!webEmbed" class="pwm-seg">
          <button type="button" :class="{ on: who === 'biz' }" @click="who = 'biz'">매매사업자</button>
          <button type="button" :class="{ on: who === 'person' }" @click="who = 'person'">개인</button>
        </div>
        <!-- 웹 — 사업자 구분은 내 정보에서 정한다 -->
        <span v-else class="pwm-biz">
          사업자 구분 <b>{{ BIZ_LABEL[acctBiz] ?? '안 정함' }}</b>
          <!-- 바로가기 — 내 정보 수정으로 가서 고치고, 돌아오면 다시 읽어 계산한다 -->
          <button type="button" class="pwm-bizgo" title="내 정보 수정에서 사업자 구분 바꾸기" @click="router.push('/profile')">내 정보<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
          <em v-if="!acctBiz">내 정보에서 사업자 구분을 정해 주세요 — 지금은 매매사업자 기준</em>
          <em v-else-if="acctBiz === 'corp' || acctBiz === 'corpBiz'">법인세 계산은 준비 중 — 지금은 매매사업자 기준</em>
        </span>
        <div v-if="!webEmbed" class="pwm-seg" :title="`누르면 명도분석 금액이 사업경비 명도비로 들어갑니다 — 다시 누르면 빼고 ${webEmbed ? '수익분석 확정안' : '입찰가A'} 값으로`">
          <button type="button" :class="{ on: evOn === 'deal' }" :disabled="evBusy" @click="pickEvict('deal')">명도협의 {{ man(evDirect.deal) }}</button>
          <button type="button" :class="{ on: evOn === 'exec' }" :disabled="evBusy" @click="pickEvict('exec')">강제집행 {{ man(evDirect.exec) }}</button>
        </div>
        <button type="button" class="pwm-go" @click="goPlan">{{ webEmbed ? '수익분석 고치기 ›' : '입찰가A 고치기 ›' }}</button>
      </div>

      <div class="pwm-tax">
        <article class="pwm-card">
          <!-- 웹 — 제목 '비용 및 차익' + 아이콘(동전 쌓기) -->
          <h3><svg v-if="webEmbed" class="pwm-h3-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" /><path d="M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" /></svg>{{ webEmbed ? '비용 및 차익' : '개별소득세' }}</h3>
          <dl>
            <div><dt>낙찰가</dt><dd>{{ won(plan.bid) }}</dd></div>
            <div><dt>매도가</dt><dd>{{ won(plan.sale) }}<small>{{ saleFixed ? `확정 — 매도일 ${auction?.sellDate}` : planName }}</small></dd></div>
            <div><dt>필요경비</dt><dd>{{ won(split.need) }}<small>{{ srcText(split.needActual, split.needPlan, '필요경비') }}</small></dd></div>
            <div v-if="webEmbed" class="sub"><dt>└ 취득세</dt><dd>{{ won(acqTax) }}<small>취득세 · 지방교육세 · 농특세(필요경비에 포함)</small></dd></div>
            <div :class="{ key: who !== 'biz' }"><dt>{{ who === 'biz' ? '매매차익' : '양도차익' }}</dt><dd :class="{ neg: tradeGain < 0 }">{{ won(tradeGain) }}<small>매도가 − 낙찰가 − 필요경비{{ who === 'biz' ? ' — 예정신고' : '' }}</small></dd></div>
            <template v-if="who === 'biz'">
              <div><dt>사업경비</dt><dd>{{ won(webEmbed ? bizBase : split.biz) }}<small>{{ webEmbed ? '명도비용 빼고 — 명도비용은 아래 시나리오에서 넣습니다' : srcText(split.bizActual, split.bizPlan, '사업경비') }}</small></dd></div>
              <div class="key"><dt>사업소득</dt><dd :class="{ neg: gain < 0 }">{{ won(gain) }}<small>매매차익 − 사업경비 — 5월 종합소득세</small></dd></div>
            </template>
            <div><dt>부가세 대상</dt><dd><span :class="['pwm-tag', { on: who === 'biz' && vat.taxable }]">{{ who !== 'biz' ? '해당없음' : vat.taxable ? '과세' : '면세' }}</span><small>{{ who !== 'biz' ? '개인 양도는 부가세가 없습니다' : vat.why }}</small></dd></div>
          </dl>
        </article>

        <article class="pwm-card">
          <!-- 웹 — 아이콘(세금 고지서) -->
          <h3><svg v-if="webEmbed" class="pwm-h3-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><path d="M9 7h6M9 11h6" /><path d="m9.5 16 5-3" /><circle cx="9.5" cy="13" r=".6" /><circle cx="14.5" cy="16" r=".6" /></svg>{{ who === 'biz' ? '종합소득세(예상)' : '양도소득세(예상)' }}</h3>
          <dl v-if="who === 'biz'">
            <div><dt>전년도 매출</dt><dd>{{ won(lastSales) }}<small>{{ lastSales >= 300_000_000 ? '3억 이상 — 복식부기 의무' : '3억 미만 — 간편장부 대상' }}</small></dd></div>
            <div><dt>금년도 누적매출</dt><dd>{{ won(thisSales) }}<small>{{ otherFromAcct ? '다른 소득금액(내 정보)' : '올해 다른 매매차익' }} {{ won(otherGain) }}</small></dd></div>
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
          <p class="pwm-memo" v-if="who === 'biz'">비교과세 — 조정대상지역 주택 · 비사업용 토지 등은 양도세 세율로 계산한 금액과 비교해 큰 쪽을 냅니다(소득세법 제64조). 매도 뒤 2개월 안에 매매차익 예정신고, 이듬해 5월 종합소득세로 합산합니다.</p>
          <p class="pwm-memo" v-else>1주택 비과세 · 다주택 중과 · 장기보유특별공제는 셈하지 않은 대략 값입니다 — 세무사에게 확인하세요.</p>
        </article>
      </div>
      <!-- 최종 예상 순수익(명도비용 포함) — 두 시나리오를 상자 둘로 알려 준다(고르거나 확정하지 않는다). 명도비용은 명도분석 합계 그대로 -->
      <section v-if="webEmbed" class="pwm-finals">
        <h3 class="pwm-finals-h"><svg class="pwm-h3-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>최종 예상 순수익 <em>명도비용 포함</em></h3>
        <div class="pwm-finals-grid">
          <article v-for="[k, no, name] in (dealDone ? [['deal', '실제', '명도협의로 종결']] : [['deal', '시나리오 1', '명도협의로 끝날 때'], ['exec', '시나리오 2', '강제집행까지 갈 때']]) as Array<readonly ['deal' | 'exec', string, string]>" :key="k" :class="['pwm-card', 'pwm-final', k]">
            <h4><small>{{ no }}</small>{{ name }}</h4>
            <dl>
              <div><dt>{{ who === 'biz' ? '매매차익' : '양도차익' }}</dt><dd>{{ won(tradeGain) }}<small>매도가 − 낙찰가 − 필요경비</small></dd></div>
              <div><dt>− 사업경비</dt><dd>{{ won(bizBase) }}<small>이자 · 관리비 · 수리 · 광고 등(명도비용 빼고)</small></dd></div>
              <div><dt>− 명도비용</dt><dd>{{ won(finals[k].evTotal) }}<small>명도분석 합계 — 명도비 {{ won(finals[k].direct) }} + 지연 비용 {{ won(finals[k].delay) }}</small></dd></div>
              <div><dt>− 세금</dt><dd>{{ won(finals[k].tax) }}<small>{{ who === 'biz' ? '종합소득세' : '양도소득세' }} + 지방세</small></dd></div>
              <div class="total"><dt>세후 순수익</dt><dd :class="{ neg: finals[k].net < 0 }">{{ won(finals[k].net) }}<small>실투자금 {{ won(netInvest) }} 대비 {{ finals[k].rate.toFixed(2) }}%</small></dd></div>
            </dl>
          </article>
        </div>
      </section>
      <!-- 중요 안내 — 세금 계산은 참고용(웹). 아이콘 · 제목 한 줄 + 짧은 세 줄 -->
      <aside v-if="webEmbed" class="pwm-notice" role="note">
        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></svg></span>
        <div class="body">
          <h4>중요 안내사항</h4>
          <ul>
            <li>세금 계산은 참고용 예상 금액입니다. 일반적인 기준으로 계산했으며, 실제 세금은 소득 · 보유 자산 · 공제 · 세법 개정에 따라 달라집니다.</li>
            <li>장기보유특별공제 · 1세대1주택 비과세 등 개인별 공제는 빠져 있습니다.</li>
            <li class="key">신고 전 반드시 세무사와 상담하세요.</li>
          </ul>
          <p class="last">본 서비스는 세금 계산 결과에 대한 법적 책임을 지지 않으며, 최종 의사결정은 전문가의 상담을 받으신 후 진행하시기를 권장드립니다.</p>
        </div>
      </aside>
    </template>
  </section>
</template>

<style scoped>
.pwm { color-scheme: light; background: #fff; border-radius: 10px; padding: 24px 32px 30px; color: #111827; }
.pwm-head { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid #eef1f6; }
.pwm-head h2 { margin: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 800; color: #111827; }
.pwm-h2-ico { flex: none; color: #2a5fbf; }   /* 권리분석 카드 제목 아이콘과 같은 색 */
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
.pwm-case { border: 1px solid #e3e8f0; border-radius: 10px; padding: 18px 24px 20px; font-variant-numeric: tabular-nums; }
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
.pwm-ai { margin-left: auto; height: 30px; padding: 0 14px; border: 1px solid #7c3aed; border-radius: 6px; background: #f5f0ff; color: #6d28d9; font-size: 14px; font-weight: 600; cursor: pointer; }
.pwm-ai:disabled { opacity: .6; cursor: default; }
.pwm-ai + .pwm-edit { margin-left: 0; }
.pwm-aierr { margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: #fdf0e3; color: #8a4b12; font-size: 14px; }
.pwm-aisum { margin: 0 0 12px; padding: 10px 12px; border-radius: 8px; background: #f5f0ff; color: #3b2a63; font-size: 14px; line-height: 1.6; }
.pwm-aisum b { margin-right: 8px; color: #6d28d9; }
.pwm-ainote { font-size: 12px; color: #6d28d9; line-height: 1.4; }
/* AI 명도분석 시작 · 직접입력 — 권리분석 'AI 권리분석 시작'과 같은 크기(높이 34 · 모서리 10 · 14px 굵게), 둘은 같은 폭 */
.pwm-ai-start, .pwm-edit { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 128px; height: 34px; padding: 0 16px; border-radius: 10px; font-size: 14px; font-weight: 800; letter-spacing: -0.3px; cursor: pointer; }
.pwm-ai-start { border: 0; background: #2b6df3; color: #fff; transition: background .15s; }
.pwm-ai-start:hover:not(:disabled) { background: #1f5fe0; }
.pwm-ai-start:disabled { background: #9db9ef; cursor: default; }
.pwm-ai-start.head { margin-left: auto; }
.pwm-ai-start.lead { margin-left: auto; }
.pwm-ai-start.lead + .pwm-edit { margin-left: 8px; }
.pwm-edit { margin-left: auto; border: 1px solid #2b6df3; background: #fff; color: #1d4ed8; }
.pwm-edit + .pwm-ai-start { margin-left: 0; }
.pwm-edit.on { background: #2b6df3; color: #fff; }
.pwm-edit + .pwm-reset, .pwm-ai-start + .pwm-reset { margin-left: 0; }
.pwm-reset { margin-left: auto; height: 30px; padding: 0 12px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; cursor: pointer; }
.pwm-taxbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-bottom: 18px; }
.pwm-seg { display: inline-flex; align-items: center; gap: 6px; }
.pwm-seg > span { font-size: 14px; color: #6b7280; margin-right: 2px; }
.pwm-seg button { height: 32px; padding: 0 12px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
.pwm-seg button.on { border-color: #2b6df3; background: #2b6df3; color: #fff; }
/* 위 줄 단추는 글자 길이와 상관없이 같은 폭 — 매매사업자 · 개인 · 명도협의 · 강제집행 */
.pwm-taxbar > .pwm-seg button { width: 132px; padding: 0 8px; }
.pwm-seg button:disabled { opacity: .6; cursor: default; }
.pwm-seg.sm button { height: 28px; padding: 0 10px; }
.pwm-go { margin-left: auto; height: 32px; padding: 0 14px; border: 1px solid #2b6df3; border-radius: 6px; background: #fff; color: #1d4ed8; font-size: 14px; cursor: pointer; }
.pwm-go:hover { background: #f2f6fe; }
/* 두 카드는 늘 같은 폭 · 같은 높이 — 매매사업자 · 개인을 바꿔도 크기가 흔들리지 않게(높이는 긴 쪽에 맞춘 고정값) */
.pwm-tax { --pwm-card-h: 560px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.pwm-tax > .pwm-card { min-height: var(--pwm-card-h, 0px); display: flex; flex-direction: column; }
.pwm-card { border: 1px solid #e3e8f0; border-radius: 10px; padding: 20px 26px 22px; }
.pwm-card h3 { margin: 0 0 6px; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 7px; }
.pwm-h3-ico { flex: none; width: 17px; height: 17px; color: #2a5fbf; }   /* 다른 카드 제목 아이콘과 같은 파랑 */
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

/* 중요 안내(웹 세금분석) — 흰 상자 + 왼쪽 호박색 막대 · 둥근 아이콘, 글은 굵기 400(노란 알림 규칙) */
.pwm-notice { display: flex; gap: 14px; margin-top: 16px; padding: 18px 20px 18px 18px; border: 1px solid #f3dfb8; border-left: 4px solid #f59e0b; border-radius: 12px; background: #fffdf8; }
.pwm-notice .ico { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: #fef3c7; color: #b45309; }
.pwm-notice .ico svg { width: 20px; height: 20px; }
.pwm-notice .body { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.pwm-notice h4 { margin: 6px 0 0; font-size: 15px; font-weight: 800; color: #92400e; }
.pwm-notice ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
.pwm-notice li { position: relative; padding-left: 14px; font-size: 14px; font-weight: 400; line-height: 1.6; color: #4b5563; }
.pwm-notice li::before { content: ""; position: absolute; left: 2px; top: 9px; width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; }
.pwm-notice li.key { color: #92400e; }
.pwm-notice p.last { margin: 4px 0 0; padding-top: 10px; border-top: 1px dashed #f3dfb8; font-size: 13px; font-weight: 400; line-height: 1.6; color: #6b7280; }
.pwm-biz { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 14px; color: #4b5563; }
.pwm-biz b { font-weight: 800; color: #1f2a44; }
.pwm-bizgo { display: inline-flex; align-items: center; gap: 2px; height: 26px; padding: 0 6px 0 9px; border: 1px solid #c9d8fb; border-radius: 13px; background: #f5f8ff; font-family: inherit; font-size: 12px; font-weight: 700; color: #2b6df3; cursor: pointer; }
.pwm-bizgo:hover { background: #e8efff; }
.pwm-bizgo svg { width: 13px; height: 13px; }
.pwm-biz em { font-style: normal; font-size: 13px; color: #b45309; }
/* 명도분석 두 묶음(웹) — 명도비 · 지연 비용 머리 줄 */
/* 명도비 상자 — 머리 줄과 세부 항목을 한 바탕 안에. 바탕은 양옆 10px 내밀고 글은 제자리('원' 끝이 한 줄) */
.pwm-grpbox { margin: 10px -10px 4px; padding: 2px 10px 6px; border-radius: 8px; background: #f5f7fb; }
.pwm-grpbox .pwm-grp { margin: 0 -10px; background: transparent; }
.pwm-grpbox li { padding-left: 24px; border-bottom-color: #e6eaf2; }   /* 명도비보다 두 글자쯤 안쪽 */
.pwm-grpbox li span, .pwm-grpbox li b { font-weight: 400; color: #4b5563; }
.pwm-grpbox li:last-child { border-bottom: 0; }
.pwm-auto { margin: 2px 0 0; padding-left: 24px; font-size: 12px; color: #9aa3b2; }
/* 바탕 띠는 양옆으로 10px 내밀고 글은 제자리 — 명도비 · 지연 비용 · 세부 · 합계의 '원' 끝이 한 줄에 선다 */
.pwm-grp { display: flex; align-items: baseline; gap: 8px; margin: 10px -10px 4px; padding: 8px 10px; border-radius: 8px; background: #f5f7fb; font-size: 14px; font-weight: 800; color: #1f2a44; }
.pwm-grp em { margin-left: 4px; font-style: normal; font-size: 12px; font-weight: 500; color: #6b7280; }
.pwm-grp b { margin-left: auto; font-weight: 800; }
.pwm-card dl > div.sub dt { padding-left: 12px; color: #6b7280; font-weight: 500; }
/* 최종 예상 순수익 — 시나리오 둘을 상자 둘로(정보만, 고르지 않는다) */
.pwm-finals { margin-top: 16px; }
.pwm-finals-h { display: flex; align-items: center; gap: 7px; margin: 0 0 10px; font-size: 16px; font-weight: 800; }
.pwm-finals-h em { font-style: normal; font-size: 13px; font-weight: 500; color: #6b7280; }
.pwm-finals-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.pwm-final { font-variant-numeric: tabular-nums; }
.pwm-final.deal { border-top: 3px solid #4f9a68; }
.pwm-final.exec { border-top: 3px solid #c95b5b; }
.pwm-final h4 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; font-size: 15px; font-weight: 800; color: #111827; }
.pwm-final h4 small { font-size: 12px; font-weight: 700; color: #6b7280; }
.pwm-final dl > div.total { margin-top: 6px; padding: 12px 14px; border: 0; border-radius: 10px; background: #1f2a44; }
.pwm-final dl > div.total dt, .pwm-final dl > div.total dd { color: #fff; font-weight: 800; }
.pwm-final dl > div.total dd { font-size: 18px; }
.pwm-final dl > div.total dd.neg { color: #ff9b9b; }
.pwm-final dl > div.total small { color: #c9d3ea; font-weight: 500; }
@media (max-width: 900px) { .pwm-finals-grid { grid-template-columns: 1fr; } }
.pwm-done { margin: 0 0 10px; padding: 10px 14px; border-radius: 8px; background: #e7f6ee; font-size: 14px; color: #1f7a4a; }
.pwm-cmp.done .pwm-case.exec { opacity: .45; }
</style>
