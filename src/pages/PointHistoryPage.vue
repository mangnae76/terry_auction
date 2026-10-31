<script setup lang="ts">
// 포인트내역 — 마이페이지의 '포인트내역'에서 들어온다.
// 등급·가진 포인트와 적립/사용 내역을 본다. 적립을 붙이기 전이라 내역은 비어 있다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { POINT_GRADES } from '../services/pointPolicy';

const router = useRouter();

/** 포인트 한 줄 — 적립을 붙이면 이 꼴로 쌓인다 */
interface PointRow {
  no: number;
  what: string;
  detail: string;
  kind: '지급' | '차감';
  paid: number | null;
  point: number;
  date: string;
}
const rows = ref<PointRow[]>([]);

/** 지금 등급 — 결제 누계를 들고 있지 않아 모두 첫 등급에서 시작한다 */
const grade = POINT_GRADES[0];
const nextGrade = POINT_GRADES[1];
const myPoint = 0;
const paidTotal = 0;

const filter = ref<'전체' | '지급' | '차감'>('전체');
const shown = computed(() => (filter.value === '전체' ? rows.value : rows.value.filter((r) => r.kind === filter.value)));
const money = (n: number) => n.toLocaleString('ko-KR');
</script>

<template>
  <section class="ph-shell">
    <header class="ph-header">
      <button type="button" class="ph-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="ph-title">포인트내역</h1>
      <span class="ph-crumb">마이페이지 › 포인트내역</span>
    </header>

    <div class="ph-body">
      <h2 class="ph-h2">포인트 내역</h2>
      <p class="ph-lead">
        포인트 적립 내역 및 등급별 적립율을 확인할 수 있습니다.
        <button type="button" class="ph-guide" @click="router.push('/points')">포인트 안내</button>
      </p>

      <!-- 요약 네 칸 -->
      <div class="ph-sum">
        <div class="ph-cell on">
          <small>현재 등급</small>
          <span :class="['ph-badge', grade.tone]">{{ grade.name.slice(0, 1) }}</span>
          <strong class="grade">{{ grade.name }}</strong>
        </div>
        <div class="ph-cell on">
          <small>내 포인트</small>
          <strong class="point">{{ money(myPoint) }} P</strong>
        </div>
        <div class="ph-cell">
          <small>현재까지 적립율</small>
          <strong>{{ money(paidTotal) }}원</strong>
          <em>총 결제금액 · {{ grade.band }}</em>
        </div>
        <div class="ph-cell">
          <small>다음등급 적립율</small>
          <strong>{{ nextGrade.korean }}</strong>
          <em>{{ nextGrade.rows[0].range }} · {{ nextGrade.rows[0].rate }}</em>
        </div>
      </div>

      <!-- 적립/사용 내역 -->
      <div class="ph-bar">
        <h3>적립/사용 내역</h3>
        <span class="ph-chips">
          <button
            v-for="f in (['전체', '지급', '차감'] as const)"
            :key="f"
            type="button"
            :class="['ph-chip', { on: filter === f }]"
            @click="filter = f"
          >{{ f }}</button>
        </span>
      </div>

      <section class="ph-card">
        <table v-if="shown.length" class="ph-table">
          <thead>
            <tr><th>No</th><th>적립 및 사용 내역</th><th>지급/차감</th><th class="num">결제금액</th><th class="num">포인트</th><th>날짜</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.no">
              <td>{{ r.no }}</td>
              <td class="left"><small>{{ r.what }}</small><b>{{ r.detail }}</b></td>
              <td>{{ r.kind }}</td>
              <td class="num">{{ r.paid === null ? '–' : money(r.paid) }}</td>
              <td :class="['num', r.point < 0 ? 'minus' : 'plus']">
                {{ r.point > 0 ? '+' : '' }}{{ money(r.point) }} P
              </td>
              <td class="date">{{ r.date }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="ph-empty">
          아직 쌓인 포인트 내역이 없습니다.<br />
          회원가입·결제·제보로 포인트를 받으면 여기에 쌓입니다.
        </p>
      </section>
    </div>

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.ph-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.ph-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.ph-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.ph-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.ph-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.ph-body { padding: 14px 12px; }
.ph-h2 { margin: 0; text-align: center; font-size: var(--title-fs, 16px); font-weight: 800; color: #111827; }
.ph-lead {
  margin: 5px 0 12px; text-align: center; font-size: 11.5px; color: #8a93a4; word-break: keep-all;
  display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;
}
.ph-guide {
  border: 1px solid #c7d2ea; border-radius: 5px; background: #fff;
  padding: 3px 7px; font-family: inherit; font-size: 10.5px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}

/* 요약 */
.ph-sum { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.ph-cell {
  background: #fff; border: 1px solid #e8ebf1; border-radius: 10px; padding: 11px 8px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
}
.ph-cell.on { border-color: #c2cdf0; background: #f3f6ff; }
.ph-cell small { font-size: 10.5px; color: #6b7280; font-weight: 700; }
.ph-cell strong { font-size: 15px; font-weight: 800; color: #2a3f8f; }
.ph-cell strong.point { font-size: 18px; color: #e8622a; }
.ph-cell strong.grade { font-size: 12px; letter-spacing: 0.4px; color: #6b7280; }
.ph-cell em { font-style: normal; font-size: 10px; color: #9ca3af; word-break: keep-all; }
.ph-badge {
  width: 30px; height: 30px; border-radius: 8px; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800;
}
.ph-badge.welcome { background: #b5d334; }
.ph-badge.silver { background: #b9bec9; }
.ph-badge.gold { background: #e8bb3d; }
.ph-badge.family { background: #7b6ad4; }

/* 머리줄 */
.ph-bar { display: flex; align-items: center; gap: 8px; margin: 14px 2px 8px; }
.ph-bar h3 { margin: 0; font-size: 13px; font-weight: 800; color: #111827; }
.ph-chips { margin-left: auto; display: flex; gap: 4px; }
.ph-chip {
  border: 1px solid #dbe3f7; border-radius: 999px; background: #fff;
  padding: 4px 10px; font-family: inherit; font-size: 11px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.ph-chip.on { background: #2a3f8f; border-color: #2a3f8f; color: #fff; }

.ph-card { background: #fff; border: 1px solid #e8ebf1; border-radius: 10px; padding: 12px; }
.ph-empty { margin: 14px 0; text-align: center; font-size: 12px; line-height: 1.8; color: #8a93a4; }

/* 표 */
.ph-table { width: 100%; border-collapse: collapse; }
.ph-table th, .ph-table td {
  padding: 7px 3px; font-size: 11px; text-align: center; border-bottom: 1px solid #f1f3f7;
}
.ph-table th { background: #f3f5fa; color: #4b5563; font-weight: 700; }
.ph-table td { color: #4b5563; }
.ph-table td.left { text-align: left; }
.ph-table td.left small { display: block; font-size: 10px; color: #9ca3af; }
.ph-table td.left b { font-size: 11px; color: #111827; font-weight: 700; }
.ph-table td.num { text-align: right; padding-right: 6px; font-variant-numeric: tabular-nums; font-weight: 800; }
.ph-table td.num.plus { color: #2a6fd2; }
.ph-table td.num.minus { color: #d2434f; }
.ph-table td.date { font-size: 10px; color: #9ca3af; }
</style>
