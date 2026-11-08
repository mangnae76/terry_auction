<script setup lang="ts">
// 마이페이지 › 받은콘텐츠(웹) — 내가 받은 전자책. 다시받기로 언제든 내려받는다.
import { onUnmounted, ref } from 'vue';
import { userMessage } from '../services/userMessage';
import { getEbook, isPaidEbook, receiveEbook, subscribeMyReceipts, type EbookReceipt } from '../services/ebookRepository';

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
  const w = window.open('', '_blank');   // 누른 자리에서 새 창을 먼저 연다 — 주소를 받은 뒤 열면 팝업으로 막힌다
  try {
    const book = await getEbook(r.ebookId);
    if (!book || !book.published) throw new Error('지금은 받을 수 없는 책입니다. 운영자가 내렸거나 지웠습니다.');
    if (isPaidEbook(book)) throw new Error('유료로 바뀐 책입니다. 결제를 붙인 뒤 받을 수 있습니다.');
    const url = await receiveEbook(book);
    if (w) w.location.href = url; else window.location.href = url;   // 구글드라이브 · 저장소 어느 쪽이든 새 창에서 받는다
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
  <section class="myc">
    <header><h3>받은콘텐츠</h3><p>콘텐츠에서 받은 전자책입니다. 다시받기로 언제든 내려받을 수 있습니다.</p></header>
    <p v-if="err" class="empty">{{ err }}</p>
    <p v-else-if="loaded && !rows.length" class="empty">아직 받은 콘텐츠가 없습니다. 콘텐츠 › 전자책에서 무료로 받아 보세요.</p>
    <ul v-else class="list">
      <li v-for="r in rows" :key="r.id">
        <span class="kind">전자책</span>
        <b>{{ r.title }}</b>
        <small>받은 날 {{ day(r.receivedAt) }}</small>
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
.list li { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 12px; padding: 12px 4px; border-top: 1px solid #eef1f6; }
.list li:first-child { border-top: 0; }
.kind { padding: 3px 8px; border-radius: 5px; background: #eef3ff; color: #2b6df3; font-size: 12px; font-weight: 800; }
.list b { font-size: 15px; font-weight: 700; color: #111827; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list small { font-size: 13px; color: #6b7280; }
.list button { height: 34px; padding: 0 14px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.list button:hover:not(:disabled) { border-color: #2b6df3; background: #eef3ff; }
.list button:disabled { opacity: .55; cursor: default; }
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
