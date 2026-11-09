<script setup lang="ts">
// 콘텐츠 › 내콘텐츠 · 마이페이지 › 내콘텐츠(웹) — 내가 받은 전자책. 다시받기로 언제든 내려받는다.
import { inject, onUnmounted, ref } from 'vue';
import { userMessage } from '../services/userMessage';
import { getEbook, isPaidEbook, downloadEbook, subscribeMyReceipts, type EbookReceipt } from '../services/ebookRepository';

/** 웹에 들어가 있는가 — 앱(더보기 › 내콘텐츠)은 좁아서 제목을 한 줄 통째로 쓰고 받은 날은 그 아래로 */
const webEmbed = inject('webEmbed', false);
const rows = ref<EbookReceipt[]>([]);
const err = ref('');
const loaded = ref(false);
const stop = subscribeMyReceipts((r) => { rows.value = r; loaded.value = true; err.value = ''; }, (m) => { err.value = m; loaded.value = true; });
onUnmounted(stop);

const busy = ref('');
const msg = ref('');
const again = async (r: EbookReceipt) => {
  if (busy.value) return;
  busy.value = r.id;
  const w = window.open('', '_blank');   // 누른 자리에서 새 창을 먼저 연다(드라이브 링크용) — 파일이면 downloadEbook 이 닫는다
  try {
    const book = await getEbook(r.ebookId);
    if (!book || !book.published) throw new Error('지금은 받을 수 없는 책입니다. 운영자가 내렸거나 지웠습니다.');
    if (isPaidEbook(book)) throw new Error('유료로 바뀐 책입니다. 결제를 붙인 뒤 받을 수 있습니다.');
    await downloadEbook(book, w);
  } catch (e) {
    w?.close();
    msg.value = userMessage(e, '받지 못했습니다. 잠시 뒤 다시 해 주세요.');
    window.setTimeout(() => { msg.value = ''; }, 2600);
  } finally {
    busy.value = '';
  }
};
const day = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
</script>

<template>
  <section :class="['myc', { app: !webEmbed }]">
    <header><h3>내콘텐츠</h3><p>{{ webEmbed ? '무료로 받거나 구매한 콘텐츠입니다. 다시받기로 언제든 PDF를 내려받을 수 있습니다.' : '다시받기로 언제든 내려받을 수 있습니다.' }}</p></header>
    <p v-if="err" class="empty">{{ err }}</p>
    <p v-else-if="loaded && !rows.length" class="empty">아직 받은 콘텐츠가 없습니다. 콘텐츠 › 전자책에서 무료로 받아 보세요.</p>
    <ul v-else class="list">
      <li v-for="r in rows" :key="r.id">
        <span class="kind">전자책</span>
        <span class="ttl"><b>{{ r.title }}</b><small>받은 날 {{ day(r.receivedAt) }}</small></span>
        <button type="button" :disabled="busy === r.id" @click="again(r)">{{ busy === r.id ? '받는 중' : '다시받기' }}</button>
      </li>
    </ul>
    <p v-if="msg" class="toast">{{ msg }}</p>
  </section>
</template>

<style scoped>
.myc { background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 18px 20px; display: grid; gap: 10px; }
.myc header h3 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.myc header p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
.empty { margin: 0; padding: 28px 0; text-align: center; font-size: 14px; color: #9aa6c4; }
.list { list-style: none; margin: 0; padding: 0; display: grid; }
.list li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 12px 4px; border-top: 1px solid #eef1f6; }
.list li:first-child { border-top: 0; }
.kind { padding: 3px 8px; border-radius: 5px; background: #eef3ff; color: #2b6df3; font-size: 12px; font-weight: 800; }
/* 제목 · 받은 날 — 웹은 한 줄에 나란히, 앱은 제목 아래로 */
.ttl { min-width: 0; display: flex; align-items: center; gap: 12px; }
.app .ttl { flex-direction: column; align-items: flex-start; gap: 2px; }
.list b { flex: 1 1 auto; font-size: 15px; font-weight: 700; color: #111827; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list small { flex: 0 0 auto; font-size: 13px; color: #6b7280; }
/* 앱 — 좁은 폭에 맞춘 여백 · 글자 */
.app { padding: 16px 14px; }
.app header p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app .list li { gap: 10px; }
.app .list b { max-width: 100%; font-size: 14px; }
.app .list small { font-size: 12px; }
.app .list button { height: 32px; padding: 0 12px; font-size: 13px; }
.list button { height: 34px; padding: 0 14px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.list button:hover:not(:disabled) { border-color: #2b6df3; background: #eef3ff; }
.list button:disabled { opacity: .55; cursor: default; }
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
