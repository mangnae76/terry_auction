<script setup lang="ts">
// 포인트 제도 — 고객센터·더보기 바로가기의 '포인트'에서 들어온다.
// 글은 services/pointPolicy 에 있고 여기서는 그리기만 한다.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import {
  POINT_CAUTIONS,
  POINT_GRADES,
  POINT_INTRO,
  POINT_NOTES,
} from '../services/pointPolicy';

const router = useRouter();
const TABS = [
  { key: 'intro', label: '포인트 제도 소개' },
  { key: 'grade', label: '회원등급 및 포인트적립률' },
  { key: 'caution', label: '주의사항' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const tab = ref<TabKey>('intro');
</script>

<template>
  <section class="pt-shell">
    <header class="pt-header">
      <button type="button" class="pt-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="pt-title">포인트 제도</h1>
      <span class="pt-crumb">더보기 › 포인트</span>
    </header>

    <nav class="pt-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        :class="['pt-tab', { on: tab === t.key }]"
        @click="tab = t.key"
      >{{ t.label }}</button>
    </nav>

    <div class="pt-body">
      <!-- 1. 포인트 제도 소개 -->
      <template v-if="tab === 'intro'">
        <h2 class="pt-pill">포인트 제도 소개</h2>
        <section class="pt-blue">
          <div v-for="sec in POINT_INTRO" :key="sec.title" class="pt-blue-sec">
            <h3>{{ sec.title }}</h3>
            <p v-for="(t, i) in sec.texts" :key="i">{{ t }}</p>
            <ul v-if="sec.bullets">
              <li v-for="(b, i) in sec.bullets" :key="i">{{ b }}</li>
            </ul>
          </div>
        </section>
      </template>

      <!-- 2. 회원등급 및 포인트적립률 -->
      <template v-else-if="tab === 'grade'">
        <h2 class="pt-pill">포인트 적립율 안내</h2>
        <p class="pt-pt1">※ 1pt당 1원 적용</p>

        <section v-for="g in POINT_GRADES" :key="g.key" class="pt-grade">
          <div class="pt-grade-top">
            <span :class="['pt-badge', g.tone]">{{ g.name.slice(0, 1) }}</span>
            <strong>{{ g.korean }}</strong>
          </div>
          <div :class="['pt-band', g.tone]">{{ g.band }}</div>
          <ul class="pt-rates">
            <li v-for="(r, i) in g.rows" :key="i">
              <span>{{ r.range }}</span><b>{{ r.rate }}</b>
            </li>
          </ul>
        </section>

        <section class="pt-card">
          <h3 class="pt-h3">※ 참고사항</h3>
          <ol class="pt-notes">
            <li v-for="(n, i) in POINT_NOTES" :key="i">{{ n }}</li>
          </ol>
        </section>
      </template>

      <!-- 3. 주의사항 -->
      <template v-else>
        <h2 class="pt-pill">주의사항</h2>
        <section class="pt-blue">
          <ul class="pt-caution">
            <li v-for="(c, i) in POINT_CAUTIONS" :key="i">{{ c }}</li>
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

/* 탭 — 좁은 화면에서는 옆으로 밀어 본다 */
.pt-tabs {
  display: flex; gap: 14px; padding: 0 14px; background: #fff;
  border-bottom: 1px solid #e5e7eb; overflow-x: auto; -webkit-overflow-scrolling: touch;
}
/* 고른 칸의 밑줄은 ::after 막대로 그린다 — 전역 button 규칙의 둥근 모서리(8px)가
   테두리에 먹혀 밑줄 끝이 U 자로 말리는 것을 막는다 (물건상세 탭과 같은 방식) */
.pt-tab {
  position: relative; flex: none; border: none; border-radius: 0; background: transparent;
  padding: 10px 2px 12px; cursor: pointer; white-space: nowrap;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #9ca3af;
}
.pt-tab.on { color: #1f3a72; }
.pt-tab.on::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 3px; background: #1f3a72; border-radius: 2px;
}

.pt-body { padding: 14px 12px; display: flex; flex-direction: column; gap: 10px; }

/* 파란 알약 제목 */
.pt-pill {
  align-self: center; margin: 0 0 4px; padding: 9px 22px; border-radius: 12px;
  background: #4a7bd8; color: #fff; font-size: 15px; font-weight: 800; letter-spacing: -0.3px;
}
.pt-pt1 { margin: 0 2px 2px; font-size: 11px; color: #6b7280; }

/* 파란 글상자 */
.pt-blue { background: #4a7bd8; border-radius: 12px; padding: 16px 15px; color: #fff; }
.pt-blue-sec + .pt-blue-sec { margin-top: 16px; }
.pt-blue h3 { margin: 0 0 7px; font-size: 13.5px; font-weight: 800; color: #ffe27a; }
.pt-blue p { margin: 0 0 7px; font-size: 12.5px; line-height: 1.75; word-break: keep-all; }
.pt-blue ul { list-style: none; margin: 0; padding: 0; }
.pt-blue li {
  position: relative; padding-left: 11px; margin-bottom: 6px;
  font-size: 12px; line-height: 1.7; white-space: pre-line; word-break: keep-all;
}
.pt-blue li::before { content: '·'; position: absolute; left: 2px; }

/* 등급 */
.pt-grade { background: #fff; border-radius: 10px; padding: 12px 12px 10px; }
.pt-grade-top { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.pt-badge {
  width: 34px; height: 34px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 800; color: #fff;
}
.pt-badge.welcome { background: #b5d334; }
.pt-badge.silver { background: #b9bec9; }
.pt-badge.gold { background: #e8bb3d; }
.pt-badge.family { background: #7b6ad4; }
.pt-grade-top strong { font-size: 13px; font-weight: 800; color: #374151; }
.pt-band {
  margin: 9px 0 0; padding: 9px 8px; border-radius: 6px; text-align: center;
  font-size: 13px; font-weight: 800; color: #3b3b3b;
}
.pt-band.welcome { background: #d7e95c; }
.pt-band.silver { background: #c8ccd4; }
.pt-band.gold { background: #f6d073; }
.pt-band.family { background: #8b7ce0; color: #fff; }
.pt-rates { list-style: none; margin: 10px 0 0; padding: 0; }
.pt-rates li { display: flex; align-items: center; gap: 8px; padding: 3px 2px; }
.pt-rates span { flex: 1 1 auto; font-size: 11.5px; color: #4b5563; word-break: keep-all; }
.pt-rates b { flex: none; font-size: 12px; font-weight: 800; color: #4a7bd8; }

/* 참고 */
.pt-card { background: #fff; border-radius: 10px; padding: 13px; }
.pt-h3 { margin: 0 0 6px; font-size: 12px; font-weight: 800; color: #374151; }
.pt-notes { margin: 0; padding-left: 18px; }
.pt-notes li { font-size: 11.5px; line-height: 1.75; color: #4b5563; word-break: keep-all; }

/* 주의사항 */
.pt-caution { list-style: none; margin: 0; padding: 0; }
.pt-caution li {
  position: relative; padding-left: 11px; margin-bottom: 9px;
  font-size: 12px; line-height: 1.7; white-space: pre-line; word-break: keep-all;
}
.pt-caution li::before { content: '·'; position: absolute; left: 2px; }
.pt-caution li:last-child { margin-bottom: 0; }
</style>
