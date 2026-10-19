<script setup lang="ts">
// 마이페이지 — 내 정보·보관함·휴지통처럼 계정에 딸린 자리를 모아 둔다.
// 목록은 services/myPageMenu 에 있고 더보기의 알약과 같은 것을 쓴다.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { MY_PAGE_ITEMS, type MyPageItem } from '../services/myPageMenu';

const router = useRouter();

const toastText = ref('');
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};

// 아직 화면이 없는 항목은 안내만 띄운다
const open = (item: MyPageItem) => {
  if (!item.path) { notReady(item.name); return; }
  router.push({ path: item.path, query: item.query });
};
</script>

<template>
  <section class="myp-shell">
    <header class="myp-header">
      <button type="button" class="myp-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="myp-title">마이페이지</h1>
      <span class="myp-crumb">더보기 › 마이페이지</span>
    </header>

    <div class="myp-body">
      <section class="myp-card">
        <button
          v-for="m in MY_PAGE_ITEMS"
          :key="m.name"
          type="button"
          class="family"
          @click="open(m)"
        >
          <span class="fname">{{ m.name }}</span>
          <span class="fdesc">{{ m.desc }}</span>
          <span class="arr">›</span>
        </button>
      </section>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.myp-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.myp-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.myp-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.myp-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.myp-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.myp-body { padding: 10px 12px; }
.myp-card {
  padding: 2px 13px; background: #fff; border: 1px solid #e8ebf1; border-radius: 14px;
}

/* 줄 — 더보기에 있던 것과 같은 꼴 */
.family {
  display: flex; align-items: center; gap: 8px;
  width: 100%; border: none; background: transparent; cursor: pointer;
  padding: 13px 0; border-bottom: 1px solid #f1f3f7; text-align: left;
}
.family:last-child { border-bottom: none; }
.fname { flex: 0 0 auto; font-size: 13px; font-weight: 800; color: #111827; }
.fdesc {
  flex: 1 1 auto; min-width: 0; font-size: 11px; color: #8a93a4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.arr { flex: 0 0 auto; font-size: 17px; color: #c3cbdd; }
</style>
