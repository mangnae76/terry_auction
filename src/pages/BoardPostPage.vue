<script setup lang="ts">
// 이벤트 상세 — 목록에서 제목 줄을 누르면 들어오는 화면.
// 글은 운영에서 올린 것(boardPosts)을 그대로 보여 준다.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import ImageLightbox from './../components/ImageLightbox.vue';
import { ref } from 'vue';
import { useBoardPost } from '../services/boardFeed';
import { periodLabel, postedLabel, titleOf } from '../services/boardRepository';

const route = useRoute();
const router = useRouter();

const post = useBoardPost(() => String(route.params.id ?? ''));

const KIND_NAME: Record<string, string> = {
  banner: '이벤트',
  event: '이벤트',
  notice: '공지사항',
  update: '업데이트',
};
const kindName = computed(() => KIND_NAME[post.value?.kind ?? ''] ?? '소식');
const period = computed(() => {
  const p = post.value;
  if (!p) return '';
  return periodLabel(p.startAt, p.endAt) || p.period || '';
});
const posted = computed(() => {
  const p = post.value;
  return p ? postedLabel(p.postedAt ?? p.createdAt, p.updatedAt) : '';
});

const zoom = ref('');
</script>

<template>
  <section class="bp-shell">
    <header class="bp-header">
      <button type="button" class="bp-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="bp-title">{{ kindName }}</h1>
      <span class="bp-crumb">더보기 › 공지 › {{ kindName }}</span>
    </header>

    <article v-if="post" class="bp-card">
      <div class="bp-top">
        <span v-if="post.tag" class="bp-tag">{{ post.tag }}</span>
        <span v-if="period" class="bp-period">{{ period }}</span>
      </div>
      <h2 class="bp-h">{{ titleOf(post) }}</h2>
      <p v-if="posted" class="bp-posted">{{ posted }}</p>

      <img
        v-if="post.imageUrl"
        :src="post.imageUrl"
        class="bp-img"
        alt=""
        @click="zoom = post.imageUrl ?? ''"
      />
      <p v-if="post.body" class="bp-body">{{ post.body }}</p>
      <p v-else-if="post.desc" class="bp-body">{{ post.desc }}</p>
    </article>

    <p v-else class="bp-gone">글을 찾지 못했습니다. 내려간 글일 수 있습니다.</p>

    <ImageLightbox v-if="zoom" :src="zoom" @close="zoom = ''" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.bp-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.bp-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.bp-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.bp-title { margin: 0; font-size: 18px; font-weight: 800; color: #111827; }
.bp-crumb { font-size: 10.5px; color: #9ca3af; }

.bp-card {
  margin: 12px 14px; padding: 16px 14px 18px;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 14px;
}
.bp-top { display: flex; align-items: center; gap: 8px; }
.bp-tag {
  padding: 3px 8px; border-radius: 5px; background: #eef1f8;
  font-size: 10.5px; font-weight: 800; color: #2a3f8f;
}
.bp-period { font-size: 10.5px; color: #6b7280; }
.bp-h { margin: 9px 0 4px; font-size: 16px; font-weight: 800; color: #111827; word-break: keep-all; }
.bp-posted { margin: 0 0 12px; font-size: 10.5px; color: #9ca3af; }
.bp-img { width: 100%; border-radius: 10px; margin-bottom: 12px; cursor: zoom-in; }
.bp-body { margin: 0; font-size: 12.5px; line-height: 1.8; color: #374151; white-space: pre-wrap; word-break: keep-all; }
.bp-gone { margin: 24px 14px; font-size: 12.5px; color: #9ca3af; }
</style>
