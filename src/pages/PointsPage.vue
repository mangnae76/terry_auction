<script setup lang="ts">
// 포인트 제도 — 고객센터 · 추가서비스 안내의 '포인트제도 안내'에서 들어온다.
// 글은 services/pointPolicy 에 있고 여기서는 그리기만 한다.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import {
  POINT_EXCLUDES,
  POINT_GRADES,
  POINT_GUIDES,
  POINT_NOTES,
} from '../services/pointPolicy';

const router = useRouter();
const tab = ref<'grade' | 'guide'>('grade');
</script>

<template>
  <section class="pt-shell">
    <header class="pt-header">
      <button type="button" class="pt-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="pt-title">포인트 제도</h1>
      <span class="pt-crumb">고객센터 › 포인트</span>
    </header>

    <nav class="pt-tabs">
      <button type="button" :class="['pt-tab', { on: tab === 'grade' }]" @click="tab = 'grade'">회원등급 및 포인트적립률</button>
      <button type="button" :class="['pt-tab', { on: tab === 'guide' }]" @click="tab = 'guide'">포인트 안내</button>
    </nav>

    <div class="pt-body">
      <!-- 회원등급 -->
      <template v-if="tab === 'grade'">
        <section class="pt-card">
          <h2 class="pt-h2">마이턴 회원등급</h2>
          <p class="pt-lead"><small>(총결제금액 합산기준)</small> 등급에 따른 포인트 혜택</p>

          <div v-for="g in POINT_GRADES" :key="g.key" class="pt-grade">
            <div class="pt-grade-head">
              <span :class="['pt-badge', g.tone]">{{ g.name.slice(0, 1) }}</span>
              <span class="pt-grade-name">
                <strong>{{ g.name }}</strong>
                <small v-for="(l, i) in g.lead" :key="i">{{ l }}</small>
              </span>
            </div>
            <ul class="pt-rates">
              <li v-for="(r, i) in g.rows" :key="i">
                <span>{{ r.range }}</span><b>{{ r.rate }}</b>
              </li>
            </ul>
          </div>
        </section>

        <section class="pt-card">
          <h3 class="pt-h3">※ 참고사항</h3>
          <ol class="pt-notes">
            <li v-for="(n, i) in POINT_NOTES" :key="i">{{ n }}</li>
          </ol>
          <h3 class="pt-h3 red">※ 포인트 적립 제외사항</h3>
          <ol class="pt-notes red">
            <li v-for="(n, i) in POINT_EXCLUDES" :key="i">{{ n }}</li>
          </ol>
        </section>
      </template>

      <!-- 포인트 안내 -->
      <template v-else>
        <section v-for="g in POINT_GUIDES" :key="g.title" class="pt-card">
          <h2 class="pt-h2 sm">{{ g.title }}</h2>
          <ul class="pt-guide">
            <li v-for="(l, i) in g.lines" :key="i">{{ l }}</li>
          </ul>
        </section>
      </template>
    </div>

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.pt-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.pt-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
.pt-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.pt-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.pt-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }

.pt-tabs { display: flex; gap: 14px; padding: 0 14px; border-bottom: 1px solid #e5e7eb; background: #fff; }
/* 고른 칸의 밑줄은 ::after 막대로 그린다 — 전역 button 규칙의 둥근 모서리(8px)가
   테두리에 먹혀 밑줄 끝이 U 자로 말리는 것을 막는다 (물건상세 탭과 같은 방식) */
.pt-tab {
  position: relative; border: none; border-radius: 0; background: transparent;
  padding: 10px 2px 12px; cursor: pointer;
  font-family: inherit; font-size: 12.5px; font-weight: 700; color: #9ca3af;
}
.pt-tab.on { color: #1f3a72; }
.pt-tab.on::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 3px; background: #1f3a72; border-radius: 2px;
}

.pt-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.pt-card { background: #fff; border-radius: 10px; padding: 13px 13px 15px; }
.pt-h2 { margin: 0; text-align: center; font-size: 16px; font-weight: 800; color: #111827; }
.pt-h2.sm { text-align: left; font-size: 13.5px; color: #1f3a72; }
.pt-lead { margin: 5px 0 12px; text-align: right; font-size: 11px; font-weight: 700; color: #4b5563; }
.pt-lead small { font-weight: 500; color: #9ca3af; }

/* 등급 */
.pt-grade { border: 1px solid #e8ebf1; border-radius: 10px; padding: 10px 11px; }
.pt-grade + .pt-grade { margin-top: 8px; }
.pt-grade-head { display: flex; align-items: center; gap: 10px; }
.pt-badge {
  flex: none; width: 34px; height: 34px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 800; color: #fff;
}
.pt-badge.welcome { background: #8cc63f; }
.pt-badge.silver { background: #9aa6c4; }
.pt-badge.gold { background: #e0b43a; }
.pt-badge.family { background: #6a4fd1; }
.pt-grade-name { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pt-grade-name strong { font-size: 13px; font-weight: 800; color: #111827; letter-spacing: 0.4px; }
.pt-grade-name small { font-size: 10.5px; color: #6b7280; }
.pt-rates { list-style: none; margin: 9px 0 0; padding: 8px 0 0; border-top: 1px solid #f1f3f7; }
.pt-rates li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.pt-rates span { flex: 1 1 auto; font-size: 11.5px; color: #4b5563; }
.pt-rates b { flex: none; font-size: 12px; font-weight: 800; color: #d2434f; }

/* 참고 */
.pt-h3 { margin: 0 0 6px; font-size: 12px; font-weight: 800; color: #374151; }
.pt-h3.red { margin-top: 14px; color: #c62828; }
.pt-notes { margin: 0; padding-left: 18px; }
.pt-notes li { font-size: 11.5px; line-height: 1.75; color: #4b5563; word-break: keep-all; }
.pt-notes.red li { color: #8a4a4a; }

/* 안내 */
.pt-guide { list-style: none; margin: 8px 0 0; padding: 0; }
.pt-guide li {
  position: relative; padding-left: 12px; font-size: 12px; line-height: 1.8;
  color: #374151; word-break: keep-all;
}
.pt-guide li::before { content: '·'; position: absolute; left: 2px; color: #9aa6c4; }
</style>
