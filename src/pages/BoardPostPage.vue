<script setup lang="ts">
// 이벤트 상세 — 목록에서 제목 줄을 누르면 들어오는 화면.
// 글은 운영에서 올린 것(boardPosts)을 그대로 보여 준다.
import { computed, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import ImageLightbox from './../components/ImageLightbox.vue';
import { ref } from 'vue';
import { boardNow, useBoardPost } from '../services/boardFeed';
import { eventPeriodLabel, periodLabel, postedLabel, tagAt, titleOf } from '../services/boardRepository';

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
/** 이벤트가 열리는 때 — 적어 두지 않았으면 기간 글이나 예약한 때로 대신한다 */
const period = computed(() => {
  const p = post.value;
  if (!p) return '';
  return eventPeriodLabel(p.eventStartAt, p.eventEndAt) || p.period || periodLabel(p.startAt, p.endAt);
});
const posted = computed(() => {
  const p = post.value;
  return p ? postedLabel(p.postedAt ?? p.createdAt) : '';
});

/** 꼬리말은 예약한 때에 따라 안내 → 진행 → 마감 으로 바뀐다 */
const tag = computed(() => (post.value ? tagAt(post.value, boardNow.value) : ''));

const zoom = ref('');
/** 웹 — 앱 머리(뒤로 · 더보기 › 공지 경로)는 빼고 웹 글자 규칙(최소 12 · 제목 크게)으로 그린다(2026-11-08) */
const web = inject('webEmbed', false);
</script>

<template>
  <section :class="['bp-shell', { web }]">
    <button v-if="web" type="button" class="bp-list" @click="router.back()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>목록으로</button>
    <header v-else class="bp-header">
      <button type="button" class="bp-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="bp-title">{{ kindName }}</h1>
      <span class="bp-crumb">더보기 › 공지 › {{ kindName }}</span>
    </header>

    <article v-if="post" class="bp-card">
      <div class="bp-top">
        <span v-if="tag" class="bp-tag">{{ tag }}</span>
        <h2 class="bp-h">{{ titleOf(post) }}</h2>
      </div>
      <p v-if="posted" class="bp-posted">{{ posted }}</p>
      <p v-if="period" class="bp-period">기간 {{ period }}</p>

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
    <AppMobileBottomNav v-if="!web" active="more" />
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
.bp-top { display: flex; align-items: center; gap: 9px; }
.bp-tag {
  padding: 3px 8px; border-radius: 5px; background: #eef1f8;
  font-size: 10.5px; font-weight: 800; color: #2a3f8f;
}
.bp-h { margin: 0; font-size: 16px; font-weight: 800; color: #111827; word-break: keep-all; }
.bp-posted { margin: 8px 0 0; font-size: 10.5px; color: #9ca3af; }
.bp-period { margin: 6px 0 14px; font-size: 12px; font-weight: 700; color: #374151; }
.bp-img { width: 100%; border-radius: 10px; margin-bottom: 12px; cursor: zoom-in; }
.bp-body { margin: 0; font-size: 12.5px; line-height: 1.8; color: #374151; white-space: pre-wrap; word-break: keep-all; }
.bp-gone { margin: 24px 14px; font-size: 12.5px; color: #9ca3af; }

/* 웹 — 공지 화면과 같은 흰 카드 하나, 글자는 웹 규칙(최소 12 · 제목 크게 · 본문 15) */
.bp-shell.web { min-height: 0; background: transparent; padding-bottom: 24px; }
.bp-list { display: inline-flex; align-items: center; gap: 4px; margin: 0 0 10px; padding: 6px 10px 6px 6px; border: 0; border-radius: 8px; background: transparent; color: #4b5563; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.bp-list:hover { background: #eef3ff; color: #2b6df3; }
.web .bp-card { margin: 0; padding: 28px 32px 32px; border-radius: 12px; }
.web .bp-top { gap: 10px; }
.web .bp-tag { padding: 4px 10px; border-radius: 6px; font-size: 13px; }
.web .bp-h { font-size: 22px; line-height: 1.4; }
.web .bp-posted { margin-top: 10px; font-size: 13px; }
.web .bp-period { margin: 8px 0 20px; padding-bottom: 18px; border-bottom: 1px solid #eef1f6; font-size: 15px; }
.web .bp-img { max-width: 760px; display: block; margin: 0 0 18px; }
.web .bp-body { font-size: 15px; line-height: 1.85; }
.web.bp-shell .bp-gone { margin: 24px 0; font-size: 14px; }
</style>
