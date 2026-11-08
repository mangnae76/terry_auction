<script setup lang="ts">
// 콘텐츠 › 관리(운영자만) — 전자책 올리고 내리기. 웹 콘텐츠 화면이 띄운다(mountEbookManage).
// 올린 책은 콘텐츠 › 전자책 카드로 나간다 — 무료는 '무료로받기'(회원가입 · 로그인한 회원 누구나), 유료는 결제준비중.
import { computed, onUnmounted, ref } from 'vue';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';
import { userMessage } from '../services/userMessage';
import { auth } from '../services/firebase';
import {
  EBOOK_KINDS,
  EBOOK_MAX_MB,
  ebookKindLabel,
  emptyEbook,
  hasEbookFile,
  isPaidEbook,
  patchEbook,
  removeEbook,
  saveEbook,
  subscribeEbooks,
  type Ebook,
} from '../services/ebookRepository';

const books = ref<Ebook[]>([]);
const loadErr = ref('');
const stop = subscribeEbooks((rows) => { books.value = rows; loadErr.value = ''; }, (m) => { loadErr.value = m; }, { all: true });
onUnmounted(stop);

const TAGS = ['기초', '필수', '실전', '리포트'];

/* 고치는 책 — null 이면 닫힘 */
const draft = ref<Ebook | null>(null);
const pdf = ref<File | null>(null);
const cover = ref<File | null>(null);
const coverPreview = ref('');
const progress = ref(0);
const saving = ref(false);
const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };
/** 막힌 까닭을 사람 말로 — 권한 · 저장소 · 연결을 갈라 알려 준다(원문은 콘솔에만) */
const why = (e: unknown, fallback: string) => {
  console.warn('[ebook] 저장 실패', e);
  const code = String((e as { code?: string })?.code ?? '');
  const m = e instanceof Error ? e.message : '';
  const res = String((e as { customData?: { serverResponse?: string } })?.customData?.serverResponse ?? '');
  // 저장소 402 — 프로젝트 결제 계정이 닫히면 파일 저장소 전체가 멈춘다(규칙 · 계정과 무관)
  if (/billing|"code":\s*402/i.test(`${m} ${res}`)) return '파일 저장소가 멈춰 있어(결제 계정 닫힘) 파일은 올릴 수 없습니다. 파일을 빼고 책 링크에 구글드라이브 링크를 넣어 주세요.';
  if (/permission|insufficient|unauthorized|unauthenticated/i.test(`${code} ${m}`)) {
    return `이 계정(${auth?.currentUser?.email || '로그인 안 됨'})에는 올릴 권한이 없습니다. 운영자 계정으로 로그인했는지 확인해 주세요.`;
  }
  if (/bucket|object-not-found|project-not-found/i.test(code)) return '파일 저장소가 준비되지 않았습니다. 운영자에게 알려 주세요.';
  if (m === 'timeout' || /unavailable|network|retry-limit/i.test(`${code} ${m}`)) return '서버가 답하지 않습니다. 인터넷 연결을 확인하고 다시 해 주세요.';
  return userMessage(e, fallback);
};

const openNew = () => { draft.value = emptyEbook(); paid.value = false; pdf.value = null; cover.value = null; coverPreview.value = ''; progress.value = 0; };
const openEdit = (b: Ebook) => { draft.value = { ...emptyEbook(), ...b }; paid.value = isPaidEbook(b); pdf.value = null; cover.value = null; coverPreview.value = b.coverUrl; progress.value = 0; };
const close = () => { draft.value = null; };

/** 책 파일 받기 — 고르기 단추와 끌어다 놓기 상자가 같이 쓴다 */
const takePdf = (f: File | null): boolean => {
  if (!f) return false;
  if (!/\.(pdf|epub)$/i.test(f.name)) { flash('PDF · EPUB 파일만 올릴 수 있습니다.'); return false; }
  if (f.size > EBOOK_MAX_MB * 1024 * 1024) { flash(`책 파일은 ${EBOOK_MAX_MB}MB 까지 올릴 수 있습니다.`); return false; }
  pdf.value = f;
  return true;
};
const onPdf = (e: Event) => {
  const el = e.target as HTMLInputElement;
  if (!takePdf(el.files?.[0] ?? null)) el.value = '';
};
/* 끌어다 놓기 — 상자 위에 있는 동안 파란 테두리 */
const dragOn = ref(false);
const onDrop = (e: DragEvent) => { dragOn.value = false; takePdf(e.dataTransfer?.files?.[0] ?? null); };
const onCover = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  cover.value = f;
  if (coverPreview.value.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
  coverPreview.value = f ? URL.createObjectURL(f) : (draft.value?.coverUrl ?? '');
};

// 가격 — 유료를 고르면 금액 칸이 열린다(천 단위 쉼표)
const paid = ref(false);
const setPaid = (on: boolean) => { paid.value = on; if (!on && draft.value) draft.value.price = 0; };
const priceText = computed(() => (draft.value?.price ? draft.value.price.toLocaleString('ko-KR') : ''));
const onPrice = (e: Event) => {
  const el = e.target as HTMLInputElement;
  const n = Number(el.value.replace(/[^0-9]/g, '')) || 0;
  if (draft.value) draft.value.price = n;
  el.value = n ? n.toLocaleString('ko-KR') : '';
};
const priceLabel = (b: Ebook) => (isPaidEbook(b) ? `${Number(b.price).toLocaleString('ko-KR')}원` : '무료');

const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024)).toLocaleString('ko-KR')}KB`);

const save = async (publish: boolean) => {
  const d = draft.value;
  if (!d) return;
  if (!d.title.trim()) { flash('책 제목을 적어 주세요.'); return; }
  if (paid.value && !(d.price > 0)) { flash('유료 금액을 적어 주세요.'); return; }
  const link = (d.link || '').trim();
  if (link && !/^https:\/\//.test(link)) { flash('링크는 https:// 로 시작하는 주소를 붙여 넣어 주세요.'); return; }
  if (publish && !link && !d.filePath && !pdf.value) { flash('구글드라이브 링크를 붙여 넣어 주세요.'); return; }
  saving.value = true;
  progress.value = 0;
  try {
    await saveEbook({ ...d, link, title: d.title.trim(), desc: d.desc.trim(), price: paid.value ? d.price : 0, published: publish }, { pdf: link ? null : pdf.value, cover: cover.value }, (r) => { progress.value = r; });
    flash(publish ? '올렸습니다. 콘텐츠 › 전자책에 바로 나갑니다.' : '작성 중으로 담아 두었습니다. 회원에게는 아직 보이지 않습니다.');
    close();
  } catch (e) {
    flash(why(e, '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'), 7000);
  } finally {
    saving.value = false;
  }
};

const setPublished = async (b: Ebook, on: boolean) => {
  if (on && !hasEbookFile(b)) { flash('책 링크가 없어 올릴 수 없습니다. 고치기에서 구글드라이브 링크를 넣어 주세요.'); return; }
  try { await patchEbook(b.id, { published: on }); flash(on ? '올렸습니다.' : '내렸습니다 — 회원에게 보이지 않습니다.'); } catch (e) { flash(why(e, '바꾸지 못했습니다.'), 7000); }
};

/** 차례 바꾸기 — 작은 것이 위 */
const move = async (b: Ebook, dir: -1 | 1) => {
  const i = books.value.findIndex((x) => x.id === b.id);
  const o = books.value[i + dir];
  if (!o) return;
  try { await Promise.all([patchEbook(b.id, { order: o.order }), patchEbook(o.id, { order: b.order })]); } catch (e) { flash(userMessage(e, '차례를 바꾸지 못했습니다.')); }
};

const confirmBox = ref<ConfirmBox | null>(null);
const askRemove = (b: Ebook) => {
  confirmBox.value = {
    title: `'${b.title}' 를 지울까요?`,
    desc: '책 파일과 표지도 함께 지워집니다. 이미 받은 회원의 내콘텐츠에서도 다시 받을 수 없게 됩니다.',
    okLabel: '지우기',
    skipKey: '',
    run: async () => { try { await removeEbook(b); flash('지웠습니다.'); } catch (e) { flash(userMessage(e, '지우지 못했습니다.')); } },
  };
};

const pct = computed(() => `${Math.round(progress.value * 100)}%`);
</script>

<template>
  <section class="ebm">
    <header class="ebm-head">
      <h3>전자책 관리<span class="adm-chip">운영</span></h3>
      <p>올린 책은 콘텐츠 › 전자책에 '무료로받기' 카드로 나갑니다. 받기는 회원가입 후 로그인한 회원만 할 수 있습니다.</p>
      <button type="button" class="ebm-add" :disabled="!!draft" @click="openNew">＋ 새 책</button>
    </header>

    <!-- 고치기 · 새 책 -->
    <div v-if="draft" class="ebm-form">
      <div class="ebm-cover">
        <img v-if="coverPreview" :src="coverPreview" alt="" />
        <span v-else>표지 없음</span>
      </div>
      <div class="ebm-fields">
        <label class="f"><span>제목</span><input v-model="draft.title" type="text" maxlength="60" placeholder="예) 빌라 경매 첫걸음" /></label>
        <div class="f"><span>꼬리표</span>
          <div class="ebm-tags">
            <button v-for="t in ['', ...TAGS]" :key="t" type="button" :class="{ on: draft.tag === t }" @click="draft!.tag = t">{{ t || '없음' }}</button>
          </div>
        </div>
        <!-- 가격 — 무료(0원)면 로그인한 회원 누구나 바로 받고, 유료면 결제를 붙인 뒤 받는다 -->
        <div class="f"><span>가격</span>
          <div class="ebm-price">
            <div class="ebm-tags">
              <button type="button" :class="{ on: !paid }" @click="setPaid(false)">무료</button>
              <button type="button" :class="{ on: paid }" @click="setPaid(true)">유료</button>
            </div>
            <label v-if="paid" class="amt"><input :value="priceText" type="text" inputmode="numeric" maxlength="9" placeholder="0" @input="onPrice" /><em>원</em></label>
            <small v-if="paid">카드에 구매하기 단추가 나갑니다. 결제는 아직 붙이지 않았습니다.</small>
          </div>
        </div>
        <!-- 분류 — 콘텐츠 어느 탭(전자책 · 리포트 · 모바일앱)에 나갈지 -->
        <div class="f"><span>분류</span>
          <div class="ebm-tags">
            <button v-for="[k, t] in EBOOK_KINDS" :key="k" type="button" :class="{ on: (draft.kind || 'ebook') === k }" @click="draft!.kind = k">{{ t }}</button>
          </div>
        </div>
        <!-- 설명 — 300자가 다 보이는 높이, 오른쪽 아래 글자 수 -->
        <label class="f top"><span>설명</span><span class="ebm-desc"><textarea v-model="draft.desc" rows="7" maxlength="300" placeholder="카드에 나가는 소개 (300자까지)" /><small>{{ draft.desc.length.toLocaleString('ko-KR') }} / 300</small></span></label>
        <!-- 파일 칸 — 브라우저 기본 단추(영어)는 숨기고 우리 단추로 -->
        <div class="f"><span>표지 그림</span>
          <span class="ebm-file"><label class="pick">그림고르기<input type="file" accept="image/*" @change="onCover" /></label>
            <small>{{ cover ? cover.name : draft.coverUrl ? '올린 표지가 있습니다 (새로 고르면 바뀝니다)' : '고른 그림이 없습니다 · 세로 3:4 권장' }}</small></span>
        </div>
        <!-- 책 링크 — 구글드라이브 공유 링크. 회원은 다운로드를 누르면 여기서 바로 받는다 -->
        <label class="f top"><span>책 링크</span><span class="ebm-link"><input v-model="draft.link" type="url" placeholder="https://drive.google.com/file/d/…" />
          <small>구글드라이브에서 PDF를 '링크가 있는 모든 사용자'로 공유한 뒤 링크를 붙여 넣으세요. 링크가 있으면 아래 파일은 올리지 않아도 됩니다.</small></span></label>
        <div class="f"><span>책 파일</span>
          <span class="ebm-file"><label class="pick">파일고르기<input type="file" accept="application/pdf,.pdf,.epub" @change="onPdf" /></label>
            <small>{{ pdf ? `${pdf.name} · ${sizeText(pdf.size)}` : draft.fileName ? `${draft.fileName} · ${sizeText(draft.fileSize)} (새로 고르면 바뀝니다)` : `PDF · EPUB, ${EBOOK_MAX_MB}MB 까지` }}</small></span>
        </div>
        <!-- 책 파일 끌어다 놓기 — 파일고르기 아래 -->
        <div
          :class="['ebm-drop', { on: dragOn, has: !!pdf }]"
          @dragenter.prevent="dragOn = true"
          @dragover.prevent="dragOn = true"
          @dragleave.prevent="dragOn = false"
          @drop.prevent="onDrop"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
          <b>{{ pdf ? pdf.name : '책 파일을 여기로 끌어다 놓으세요' }}</b>
          <small>{{ pdf ? `${sizeText(pdf.size)} · 다른 파일을 놓으면 바뀝니다` : `PDF · EPUB, ${EBOOK_MAX_MB}MB 까지` }}</small>
        </div>
        <div v-if="saving" class="ebm-bar" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: pct }" /><b>{{ pct }}</b></div>
        <div class="ebm-acts">
          <button type="button" class="ghost" :disabled="saving" @click="close">닫기</button>
          <button type="button" class="ghost" :disabled="saving" @click="save(false)">작성중으로담기</button>
          <button type="button" class="pri" :disabled="saving" @click="save(true)">{{ saving ? '올리는 중' : '올리기' }}</button>
        </div>
      </div>
    </div>

    <p v-if="loadErr" class="ebm-empty">{{ loadErr }}</p>
    <p v-else-if="!books.length && !draft" class="ebm-empty">올린 책이 없습니다. '＋ 새 책'으로 올려 주세요.</p>
    <ul v-else class="ebm-list">
      <li v-for="(b, i) in books" :key="b.id" :class="{ off: !b.published }">
        <div class="th"><img v-if="b.coverUrl" :src="b.coverUrl" alt="" /><span v-else>표지</span></div>
        <div class="tx">
          <b><em v-if="b.tag">[{{ b.tag }}]</em> {{ b.title }}<i :class="['st', b.published ? 'on' : '']">{{ b.published ? '올림' : '내림' }}</i><i class="st kd">{{ ebookKindLabel(b.kind) }}</i><i :class="['st', 'pr', { paid: isPaidEbook(b) }]">{{ priceLabel(b) }}</i></b>
          <small v-if="b.desc">{{ b.desc }}</small>
          <small class="meta">{{ b.link ? '구글드라이브 링크' : b.fileName ? `${b.fileName} · ${sizeText(b.fileSize)}` : '파일 없음' }} · 받은 회원 {{ (b.downloads || 0).toLocaleString('ko-KR') }}명</small>
        </div>
        <div class="ac">
          <button type="button" class="sq" :disabled="i === 0" aria-label="위로" @click="move(b, -1)">▲</button>
          <button type="button" class="sq" :disabled="i === books.length - 1" aria-label="아래로" @click="move(b, 1)">▼</button>
          <button type="button" @click="setPublished(b, !b.published)">{{ b.published ? '내리기' : '올리기' }}</button>
          <button type="button" @click="openEdit(b)">고치기</button>
          <button type="button" class="del" @click="askRemove(b)">지우기</button>
        </div>
      </li>
    </ul>

    <p v-if="msg" class="ebm-toast">{{ msg }}</p>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.ebm { display: grid; gap: 14px; }
.ebm-head { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 12px; }
.ebm-head h3 { margin: 0; display: flex; align-items: center; font-size: 16px; font-weight: 800; color: #111827; }
.ebm-head p { grid-column: 1; margin: 0; font-size: 13px; color: #6b7280; }
.ebm-add { grid-column: 2; grid-row: 1 / span 2; height: 38px; padding: 0 16px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.ebm-add:hover:not(:disabled) { border-color: #2b6df3; background: #eef3ff; }
.ebm-add:disabled { opacity: .45; cursor: default; }

.ebm-form { display: grid; grid-template-columns: 150px 1fr; gap: 18px; padding: 18px; border: 1px solid #c9d6f5; border-radius: 12px; background: #f7f9ff; }
.ebm-cover { width: 150px; aspect-ratio: 3 / 4; border-radius: 8px; background: #e8edf7; display: grid; place-items: center; overflow: hidden; color: #9aa6c4; font-size: 13px; }
.ebm-cover img { width: 100%; height: 100%; object-fit: cover; }
.ebm-fields { display: grid; gap: 10px; min-width: 0; }
.ebm-fields .f { display: grid; grid-template-columns: 72px 1fr; align-items: center; gap: 10px; }
.ebm-fields .f > span { font-size: 13px; font-weight: 700; color: #4b5563; }
.ebm-fields input[type='text'], .ebm-fields textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font: inherit; font-size: 14px; color: #111827; }
.ebm-fields textarea { resize: vertical; min-height: 170px; line-height: 1.7; }
.ebm-fields .f.top { align-items: start; } .ebm-fields .f.top > span:first-child { padding-top: 9px; }
.ebm-fields .f > .ebm-desc { position: relative; display: block; font-weight: 400; }
.ebm-desc small { position: absolute; right: 10px; bottom: 8px; font-size: 12px; color: #9ca3af; pointer-events: none; }
.ebm-fields :is(input, textarea):focus { outline: none; border-color: #2b6df3; }
.ebm-fields .f > .ebm-file { display: flex; align-items: center; gap: 10px; min-width: 0; font-weight: 400; }
.ebm-file .pick { position: relative; flex: none; display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font-size: 13px; font-weight: 800; cursor: pointer; }
.ebm-file .pick:hover { border-color: #2b6df3; background: #eef3ff; }
.ebm-file .pick input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ebm-file small { min-width: 0; font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ebm-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.ebm-tags button { height: 30px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.ebm-tags button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.ebm-drop { margin-left: 82px; display: grid; justify-items: center; gap: 4px; padding: 18px 12px; border: 2px dashed #c9d6f5; border-radius: 10px; background: #fff; color: #6b7280; text-align: center; transition: border-color .15s, background .15s; }
.ebm-drop svg { color: #9fb8f5; }
.ebm-drop b { font-size: 14px; font-weight: 700; color: #374151; word-break: break-all; }
.ebm-drop small { font-size: 12px; color: #9ca3af; }
.ebm-drop.on { border-color: #2b6df3; background: #eef3ff; } .ebm-drop.on svg { color: #2b6df3; }
.ebm-drop.has { border-style: solid; border-color: #9fb8f5; } .ebm-drop.has svg { color: #2b6df3; }
.ebm-bar { position: relative; height: 22px; margin-left: 82px; border-radius: 6px; background: #e5eaf4; overflow: hidden; }
.ebm-bar i { position: absolute; inset: 0 auto 0 0; background: #2b6df3; transition: width .2s; }
.ebm-bar b { position: relative; display: block; text-align: center; line-height: 22px; font-size: 12px; color: #fff; mix-blend-mode: difference; }
.ebm-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.ebm-acts button { height: 38px; padding: 0 16px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.ebm-acts .ghost { border: 1px solid #dde3ee; background: #fff; color: #4b5563; }
.ebm-acts .ghost:hover:not(:disabled) { border-color: #2b6df3; color: #2b6df3; }
.ebm-acts .pri { border: 0; background: #2b6df3; color: #fff; min-width: 96px; }
.ebm-acts .pri:hover:not(:disabled) { background: #1f5ad6; }
.ebm-acts button:disabled { opacity: .55; cursor: default; }

.ebm-empty { margin: 0; padding: 28px 0; text-align: center; font-size: 14px; color: #9aa6c4; }
.ebm-list { list-style: none; margin: 0; padding: 0; display: grid; }
.ebm-list li { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 14px; padding: 12px 4px; border-top: 1px solid #eef1f6; }
.ebm-list li:first-child { border-top: 0; }
.ebm-list li.off .th, .ebm-list li.off .tx > b { opacity: .55; }
.ebm-list .th { width: 48px; aspect-ratio: 3 / 4; border-radius: 5px; background: #e8edf7; display: grid; place-items: center; overflow: hidden; font-size: 12px; color: #9aa6c4; }
.ebm-list .th img { width: 100%; height: 100%; object-fit: cover; }
.ebm-list .tx { display: grid; gap: 3px; min-width: 0; }
.ebm-list .tx b { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 800; color: #111827; }
.ebm-list .tx b em { font-style: normal; color: #2b6df3; }
.ebm-list .tx small { font-size: 13px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ebm-list .tx small.meta { font-size: 12px; color: #9ca3af; }
.ebm-list .st { padding: 2px 7px; border-radius: 5px; background: #f1f3f8; font-style: normal; font-size: 12px; font-weight: 700; color: #6b7280; }
.ebm-fields .f > .ebm-link { display: grid; gap: 6px; font-weight: 400; }
.ebm-link input { font-weight: 400;  height: 38px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; }
.ebm-link small { font-size: 12px; color: #9aa6c4; line-height: 1.5; }
.ebm-price { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ebm-price .amt { display: inline-flex; align-items: center; gap: 6px; }
.ebm-price .amt input { width: 130px; height: 34px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; text-align: right; }
.ebm-price .amt em { font-style: normal; font-size: 14px; color: #4b5563; }
.ebm-price small { flex-basis: 100%; font-size: 12px; color: #9aa6c4; }
.ebm-list .st.kd { background: #fff4e5; color: #b45309; }
.ebm-list .st.pr { background: #e8f6ee; color: #15803d; }
.ebm-list .st.pr.paid { background: #eef3ff; color: #2b6df3; }
.ebm-list .st.on { background: #e8f6ee; color: #15803d; }
.ebm-list .ac { display: flex; gap: 6px; }
.ebm-list .ac button { height: 30px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 6px; background: #fff; color: #374151; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.ebm-list .ac button.sq { width: 30px; padding: 0; font-size: 12px; }
.ebm-list .ac button:hover:not(:disabled) { border-color: #2b6df3; color: #2b6df3; }
.ebm-list .ac button.del { color: #dc2626; } .ebm-list .ac button.del:hover { border-color: #dc2626; color: #dc2626; }
.ebm-list .ac button:disabled { opacity: .4; cursor: default; }
.ebm-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
