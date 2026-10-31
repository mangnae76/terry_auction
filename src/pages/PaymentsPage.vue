<script setup lang="ts">
// 결제관리 — 마이페이지의 '결제관리'에서 들어온다.
// 결제한 내역과 영수증을 본다. 결제사 연동 전이라 아직 담긴 내역이 없다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';

const router = useRouter();

/** 결제 한 건 — 결제사를 붙이면 이 꼴로 쌓인다 */
interface PayRow {
  no: number;
  product: string;
  paidAt: string;
  endsAt: string;
  restDays: number | null;
  way: string;
  listPrice: number;
  paid: number;
}
const rows = ref<PayRow[]>([]);

const money = (n: number) => n.toLocaleString('ko-KR');
const inUse = computed(() => rows.value.filter((r) => (r.restDays ?? 0) > 0).length);
const total = computed(() => rows.value.reduce((sum, r) => sum + r.paid, 0));

const toastText = ref('');
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1800);
};
</script>

<template>
  <section class="pay-shell">
    <header class="pay-header">
      <button type="button" class="pay-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="pay-title">결제관리</h1>
      <span class="pay-crumb">마이페이지 › 결제관리</span>
    </header>

    <div class="pay-body">
      <h2 class="pay-h2">결제 내역</h2>
      <p class="pay-lead">나의 결제금액과 결제기간을 한눈에 확인할 수 있습니다.</p>

      <!-- 요약 석 칸 -->
      <div class="pay-sum">
        <div class="pay-sum-cell on">
          <small>유료 콘텐츠</small>
          <strong>{{ inUse }}건</strong>
          <em>현재 이용중</em>
        </div>
        <div class="pay-sum-cell">
          <small>결제 건수</small>
          <strong>{{ rows.length }}건</strong>
          <em>전체 결제 내역</em>
        </div>
        <div class="pay-sum-cell">
          <small>총 결제금액</small>
          <strong class="red">{{ money(total) }}</strong>
          <em>누적 금액 (원)</em>
        </div>
      </div>

      <!-- 내역 -->
      <section class="pay-card">
        <table v-if="rows.length" class="pay-table">
          <thead>
            <tr>
              <th>No</th><th>상품</th><th>결제·만료</th><th class="num">잔여일</th>
              <th>결제</th><th class="num">결제금액</th><th>영수증</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.no">
              <td>{{ r.no }}</td>
              <td class="left">{{ r.product }}</td>
              <td class="date">{{ r.paidAt }}<br /><i>{{ r.endsAt }}</i></td>
              <td class="num">{{ r.restDays ?? '–' }}</td>
              <td>{{ r.way }}</td>
              <td class="num"><b>{{ money(r.paid) }}</b></td>
              <td><button type="button" class="pay-receipt" @click="notReady('영수증')">영수증</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="pay-empty">
          아직 결제한 내역이 없습니다.<br />
          이용 기간을 고르시면 여기에 결제 내역과 영수증이 쌓입니다.
        </p>
      </section>

      <!-- 안내 -->
      <section class="pay-card notes">
        <h3>카드</h3>
        <ol>
          <li>신용카드 결제는 부가가치세법 제33조에 따라 세금계산서를 발급하지 않으며, 카드매출전표로 증빙하시면 됩니다.</li>
        </ol>
        <h3>가상계좌</h3>
        <ol>
          <li>입금영수증(사업자지출증빙용)은 세금계산서와 동일한 효력을 가집니다.</li>
          <li>세금계산서는 결제일로부터 다음 달 10일까지만 발행 가능합니다. (상호명 등 발행 정보를 함께 알려 주세요)</li>
          <li>입금영수증은 자진발급분이라 조회되지 않으며, 거래명세서는 증빙으로 쓸 수 없습니다.</li>
        </ol>
      </section>

      <div class="pay-btns">
        <button type="button" class="pay-btn tax" @click="notReady('세금계산서 요청')">세금계산서 요청</button>
        <button type="button" class="pay-btn plain" @click="notReady('내역 새로고침')">새로고침</button>
        <button type="button" class="pay-btn go" @click="router.push('/billing')">결제하기</button>
      </div>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.pay-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.pay-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.pay-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.pay-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.pay-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.pay-body { padding: 14px 12px; }
.pay-h2 { margin: 0; text-align: center; font-size: var(--title-fs, 16px); font-weight: 800; color: #111827; }
.pay-lead { margin: 5px 0 12px; text-align: center; font-size: 11.5px; color: #8a93a4; word-break: keep-all; }

/* 요약 */
.pay-sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.pay-sum-cell {
  background: #fff; border: 1px solid #e8ebf1; border-radius: 10px; padding: 11px 4px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.pay-sum-cell.on { border-color: #c2cdf0; background: #f3f6ff; }
.pay-sum-cell small { font-size: 10.5px; color: #6b7280; font-weight: 700; }
.pay-sum-cell strong { font-size: 17px; font-weight: 800; color: #2a3f8f; }
.pay-sum-cell strong.red { color: #d2434f; }
.pay-sum-cell em { font-style: normal; font-size: 10px; color: #9ca3af; }

.pay-card { margin-top: 10px; background: #fff; border: 1px solid #e8ebf1; border-radius: 10px; padding: 12px; }
.pay-empty { margin: 14px 0; text-align: center; font-size: 12px; line-height: 1.8; color: #8a93a4; }

/* 표 */
.pay-table { width: 100%; border-collapse: collapse; }
.pay-table th, .pay-table td {
  padding: 7px 3px; font-size: 11px; text-align: center; border-bottom: 1px solid #f1f3f7;
}
.pay-table th { background: #2a3f8f; color: #fff; font-weight: 700; }
.pay-table th:first-child { border-top-left-radius: 6px; }
.pay-table th:last-child { border-top-right-radius: 6px; }
.pay-table td { color: #4b5563; }
.pay-table td.left { text-align: left; }
.pay-table td.num { text-align: right; padding-right: 6px; font-variant-numeric: tabular-nums; }
.pay-table td.num b { color: #111827; font-weight: 800; }
.pay-table td.date { font-size: 10px; color: #6b7280; }
.pay-table td.date i { font-style: normal; color: #d2434f; }
.pay-receipt {
  border: none; border-radius: 5px; background: #4a5bb5; color: #fff;
  padding: 4px 7px; font-family: inherit; font-size: 10px; font-weight: 700; cursor: pointer;
}

/* 안내 */
.pay-card.notes h3 { margin: 0 0 5px; font-size: 12px; font-weight: 800; color: #111827; }
.pay-card.notes h3 + ol { margin: 0 0 12px; padding-left: 17px; }
.pay-card.notes ol:last-child { margin-bottom: 0; }
.pay-card.notes li { font-size: 11px; line-height: 1.75; color: #6b7280; word-break: keep-all; }

/* 단추 */
.pay-btns { display: flex; gap: 6px; margin-top: 12px; }
.pay-btn {
  flex: 1 1 0; height: 40px; border: none; border-radius: 8px;
  font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer;
}
.pay-btn.tax { background: #f2c94c; color: #4b3b00; }
.pay-btn.plain { background: #2a3f8f; color: #fff; }
.pay-btn.go { background: #1f2a63; color: #fff; }
</style>
