<script setup lang="ts">
// 커뮤니티 › 오류및제한(웹) — 운영툴 '오류및제한 관리'에 올린 글(알려진 오류 · 막힌 기능 · 쓰임새 제한)을 줄로 보인다.
// 줄 꼴은 공지(NewsBody)와 같다. 아래에 오류를 알리는 길(고객센터 연락처)을 둔다.
import { ref } from 'vue';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed } from '../services/boardFeed';
import { SUPPORT_CONTACTS, type ContactWay } from '../services/supportFaq';

const { issues } = useBoardFeed();
const zoom = ref('');
const openRow = ref('');
const toggleRow = (key: string, row: { body?: string; imageUrl?: string }) => {
  if (!row.body && !row.imageUrl) return;
  openRow.value = openRow.value === key ? '' : key;
};
const openContact = (c: ContactWay) => { if (c.href) window.location.href = c.href; };
</script>

<template>
  <div class="nws-wrap">
    <section class="nws-card" data-sec="issue">
      <h3 class="nws-h">오류및제한</h3>
      <template v-if="issues.length">
        <template v-for="(n, i) in issues" :key="`i${i}`">
          <button type="button" class="nws-row" @click="toggleRow(`i${i}`, n)">
            <span class="tag">{{ n.tag }}</span><span class="txt">{{ n.text }}</span>
            <span v-if="n.postedShort" class="when">{{ n.postedShort }}</span>
            <i v-if="n.body || n.imageUrl" class="chev">{{ openRow === `i${i}` ? '▴' : '▾' }}</i>
          </button>
          <div v-if="openRow === `i${i}`" class="nws-open">
            <img v-if="n.imageUrl" :src="n.imageUrl" alt="" @click="zoom = n.imageUrl" />
            <p v-if="n.body">{{ n.body }}</p>
            <p v-if="n.postedFull" class="posted">{{ n.postedFull }}</p>
          </div>
        </template>
      </template>
      <p v-else class="nws-none">지금 알려진 오류나 제한이 없습니다.</p>
    </section>

    <section class="nws-card" data-sec="report">
      <h3 class="nws-h">오류 알리기</h3>
      <p class="nws-lead">쓰다가 이상한 점을 보면 알려 주세요. 정보 오류 제보는 내용에 따라 포인트를 드립니다.</p>
      <button v-for="c in SUPPORT_CONTACTS" :key="c.title" type="button" class="nws-row" @click="openContact(c)">
        <span class="tag">{{ c.icon }}</span><span class="txt"><b>{{ c.title }}</b>{{ ' ' }}{{ c.lines.join(' ') }}</span>
        <i class="chev">›</i>
      </button>
    </section>

    <ImageLightbox v-if="zoom" :src="zoom" @close="zoom = ''" />
  </div>
</template>

<style scoped>
.nws-wrap { display: flex; flex-direction: column; gap: 8px; }
.nws-card { background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 12px 13px; }
.nws-h { margin: 0 0 6px; font-size: 13px; font-weight: 800; color: #111827; }
.nws-row {
  width: 100%; display: flex; align-items: center; gap: 7px; text-align: left; cursor: pointer;
  border: none; border-radius: 0; background: transparent; padding: 7px 0; border-bottom: 1px solid #f4f6fa;
}
.nws-row:last-child { border-bottom: none; }
.nws-row .tag {
  flex: none; min-width: 30px; text-align: center; padding: 2px 5px; border-radius: 4px;
  background: #f1f3f8; font-size: 10px; font-weight: 700; color: #6b7280;
}
.nws-row .txt { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: #374151; word-break: keep-all; }
.nws-row .txt b { color: #111827; margin-right: 4px; }
.nws-row .chev { flex: none; font-style: normal; font-size: 10px; color: #9aa6c4; }
.nws-row .when { flex: none; font-size: 10px; color: #9aa6c4; }
.nws-open { padding: 4px 0 10px 37px; }
.nws-open img { width: 100%; border-radius: 8px; margin-bottom: 7px; cursor: zoom-in; }
.nws-open p { margin: 0; font-size: 11.5px; line-height: 1.75; color: #4b5563; white-space: pre-line; word-break: keep-all; }
.nws-open .posted { margin: 6px 0 0; font-size: 10.5px; color: #9aa6c4; }
.nws-none, .nws-lead { margin: 4px 0; font-size: 11.5px; color: #6b7280; }
</style>
