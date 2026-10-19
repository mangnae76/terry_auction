<script setup lang="ts">
// 결제하기 — 이용 기간을 고르고 포인트를 쓴 뒤 결제한다.
// 결제사 연동은 아직 붙이지 않았다. 고른 값과 셈은 여기서 다 끝내 두고,
// '신청 및 결제하기'만 연동 때 바꿔 끼우면 된다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';

const router = useRouter();

/** 1개월 기준가 — 긴 기간은 여기에 할인율만 걸어 셈한다 (값은 여기 한 줄만 고치면 된다) */
const MONTH_PRICE = 50_000;

/** 기간별 값 — 받는 값 price 는 기준가 × 개월 × (1 − 할인율) 이다 */
interface Plan { key: string; label: string; months: number; price: number; off: number; base?: boolean }
const planOf = (months: number, off: number): Plan => ({
  key: `m${months}`,
  label: `${months}개월`,
  months,
  off,
  price: Math.round((MONTH_PRICE * months * (100 - off)) / 100),
  base: off === 0,
});
const PLANS: Plan[] = [planOf(1, 0), planOf(3, 15), planOf(6, 25), planOf(12, 35)];

/** 안내 글도 표와 같은 값에서 뽑는다 — 할인율만 고치면 글이 저절로 따라온다 */
const offPlans = PLANS.filter((p) => !p.base);
const offText = offPlans
  .map((p, i) => (i === offPlans.length - 1 ? `${p.label}은 ${p.off}%` : `${p.label} ${p.off}%`))
  .join(', ');
const maxOff = Math.max(...PLANS.map((p) => p.off));
const offLabels = offPlans.map((p) => p.label).join('·');
/** 한 달로 치면 얼마인지 — 깎인 값이 눈에 들어오게 같이 적는다 */
const perMonth = (p: Plan) => Math.round(p.price / p.months);
const picked = ref<Plan>(PLANS[0]);

/** 내 포인트 — 붙이기 전까지는 0 */
const myPoint = ref(0);
const usePoint = ref(0);
const useAll = () => { usePoint.value = Math.min(myPoint.value, picked.value.price); };
const onPointInput = (el: HTMLInputElement) => {
  const n = Number(el.value.replace(/[^\d]/g, '')) || 0;
  usePoint.value = Math.min(n, myPoint.value, picked.value.price);
  const shown = usePoint.value ? usePoint.value.toLocaleString('ko-KR') : '';
  if (el.value !== shown) el.value = shown;
};
const restPoint = computed(() => Math.max(0, myPoint.value - usePoint.value));
const total = computed(() => Math.max(0, picked.value.price - usePoint.value));
const money = (n: number) => n.toLocaleString('ko-KR');

const payWay = ref<'card' | 'vbank'>('card');

const toastText = ref('');
const toast = (text: string) => {
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1800);
};
const submit = () => {
  // 결제사 연동 전 — 고른 내용만 알려 준다
  toast(`${picked.value.label} · ${money(total.value)}원 — 결제 연동은 준비 중입니다.`);
};
</script>

<template>
  <section class="bil-shell">
    <header class="bil-header">
      <button type="button" class="bil-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="bil-title">결제하기</h1>
      <span class="bil-crumb">마이페이지 › 결제하기</span>
    </header>

    <div class="bil-body">
      <!-- 기간별 할인 -->
      <section class="bil-card off">
        <div class="bil-off-txt">
          <strong>기간별 할인</strong>
          <small>{{ offText }} 할인 적용</small>
        </div>
        <span class="bil-off-badge">{{ maxOff }}%</span>
      </section>

      <p class="bil-note">
        1개월 기준가는 {{ money(MONTH_PRICE) }}원이고, 표에 적힌 {{ offLabels }} 금액은 <b>할인이 적용된 결제금액</b>입니다.
        표시 금액에서 할인이 더 붙는 방식이 아닙니다. 아이디 공유는 보안상 막습니다.
      </p>

      <!-- 기간 고르기 -->
      <section class="bil-plans">
        <button
          v-for="p in PLANS"
          :key="p.key"
          type="button"
          :class="['bil-plan', { on: picked.key === p.key }]"
          @click="picked = p; usePoint = 0"
        >
          <span class="bil-plan-head">
            {{ p.label }}
            <em v-if="p.base" class="tag base">기준가</em>
            <em v-else class="tag off">{{ p.off }}% OFF</em>
          </span>
          <span class="bil-plan-price">
            <i class="box" :class="{ on: picked.key === p.key }">✓</i>{{ money(p.price) }}
          </span>
          <small class="bil-plan-sub">
            <template v-if="p.base">월 {{ money(MONTH_PRICE) }}원</template>
            <template v-else>월 {{ money(perMonth(p)) }}원 꼴 · {{ money(MONTH_PRICE * p.months - p.price) }}원 절약</template>
          </small>
        </button>
      </section>

      <!-- 셈하기 -->
      <section class="bil-card sum">
        <div class="bil-row"><span class="lab">선택항목</span><span class="val"><em class="pill">{{ picked.label }} 1개</em></span></div>
        <div class="bil-row"><span class="lab">내 포인트</span><span class="val">{{ money(myPoint) }} point <small>(사용 후 : {{ money(restPoint) }} point)</small></span></div>
        <div class="bil-row">
          <span class="lab">포인트 사용</span>
          <span class="val point">
            <input class="bil-input" inputmode="numeric" placeholder="1000P부터 사용가능" @input="onPointInput($event.target as HTMLInputElement)" />
            <button type="button" class="bil-allbtn" @click="useAll">전액 사용</button>
          </span>
        </div>
        <div class="bil-row"><span class="lab">상품금액</span><span class="val">{{ money(picked.price) }} 원</span></div>
        <div class="bil-row total"><span class="lab">총 결제금액</span><span class="val">{{ money(total) }} 원</span></div>
        <div class="bil-row">
          <span class="lab">결제방법</span>
          <span class="val ways">
            <button type="button" :class="['bil-way', { on: payWay === 'card' }]" @click="payWay = 'card'">카드</button>
            <button type="button" :class="['bil-way', { on: payWay === 'vbank' }]" @click="payWay = 'vbank'">가상계좌(저축은행)</button>
          </span>
        </div>
      </section>

      <p class="bil-fine">
        신용카드 결제는 부가가치세법 제33조에 따라 세금계산서를 발급하지 않으며,
        카드매출전표로 증빙하시면 됩니다. (결제 후 : 마이페이지 → 결제관리 → 결제내역 → 해당 전표 확인)
      </p>

      <button type="button" class="bil-submit" @click="submit">신청 및 결제하기</button>
    </div>

    <AppMobileBottomNav active="more" />
    <AppToast :visible="!!toastText" :text="toastText" tone="info" />
  </section>
</template>

<style scoped>
.bil-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.bil-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.bil-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.bil-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.bil-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.bil-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.bil-card { background: #fff; border-radius: 10px; padding: 12px; }

/* 기간별 할인 */
.bil-card.off {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid #f0d9c4; background: #fffaf3;
}
.bil-off-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.bil-off-txt strong { font-size: 13.5px; font-weight: 800; color: #8a5a22; }
.bil-off-txt small { font-size: 11.5px; color: #8a6d4a; line-height: 1.5; }
.bil-off-badge {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  width: 58px; height: 46px; border-radius: 8px; background: #fde8cf;
  font-size: 17px; font-weight: 800; color: #d97b16;
}
.bil-note { margin: 0 2px; font-size: 11.5px; line-height: 1.6; color: #6b7280; }
.bil-note b { color: #111827; }

/* 기간 고르기 */
.bil-plans { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.bil-plan {
  display: flex; flex-direction: column; gap: 6px; padding: 9px 10px;
  border: 1px solid #e3e8f0; border-radius: 10px; background: #fff; cursor: pointer;
  font-family: inherit; text-align: left;
}
.bil-plan.on { border-color: #2b6df3; box-shadow: 0 0 0 1px #2b6df3 inset; }
.bil-plan-head { display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 800; color: #111827; }
.bil-plan-head .tag {
  font-style: normal; font-size: 10px; font-weight: 800; border-radius: 999px; padding: 1px 6px;
}
.bil-plan-head .tag.base { background: #eef2f7; color: #6b7280; }
.bil-plan-head .tag.off { background: #ffe7d4; color: #d9641a; }
.bil-plan-price { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; color: #1f2937; }
.bil-plan-price .box {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border: 1px solid #c9d3e3; border-radius: 4px;
  background: #fff; color: transparent; font-size: 11px; font-style: normal;
}
.bil-plan-price .box.on { background: #2b6df3; border-color: #2b6df3; color: #fff; }

/* 셈하기 */
.bil-card.sum { padding: 4px 12px; }
.bil-row { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid #f1f3f7; font-size: 12.5px; }
.bil-row:first-child { border-top: none; }
.bil-row .lab { flex: 0 0 76px; color: #6b7280; font-weight: 700; }
.bil-row .val { flex: 1 1 auto; min-width: 0; color: #111827; font-weight: 600; }
.bil-row .val small { color: #9ca3af; font-weight: 500; }
.bil-row .pill { font-style: normal; background: #eef2fb; border-radius: 999px; padding: 2px 8px; font-size: 11.5px; font-weight: 700; color: #3850c2; }
.bil-row.total .lab, .bil-row.total .val { color: #e0574a; font-weight: 800; font-size: 14px; }
.bil-plan-sub { display: block; margin-top: 3px; font-size: 11px; color: #6b7280; }
.bil-row .val.point { display: flex; align-items: center; gap: 6px; }
.bil-input {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box; height: 28px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 2px 8px; font-family: inherit; font-size: 12px; color: #111827;
}
.bil-allbtn {
  flex: 0 0 auto; height: 28px; padding: 0 9px;
  border: 1px solid #c7d7f8; border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.bil-row .val.ways { display: flex; gap: 6px; }
.bil-way {
  flex: 1 1 0; height: 30px; border: 1px solid #e3e8f0; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.bil-way.on { border-color: #2b6df3; background: #eef4ff; color: #2b6df3; }

.bil-fine {
  margin: 0 2px; padding: 9px 10px; background: #eef2f7; border-radius: 8px;
  font-size: 11px; line-height: 1.6; color: #6b7280;
}
.bil-submit {
  margin: 4px 2px 0; height: 46px; border: none; border-radius: 10px;
  background: #2a3f8f; color: #fff; font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer;
}
.bil-submit:active { background: #22347a; }
</style>
