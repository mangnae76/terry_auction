<script setup lang="ts">
// 콘텐츠 › 관리(운영자만) — 전자책 올리고 내리기. 웹 콘텐츠 화면이 띄운다(mountEbookManage).
// 위는 올리기 칸(늘 펼쳐 둠, 고치기를 누르면 그 책이 들어온다), 아래는 올린 콘텐츠 표.
// 올린 책은 콘텐츠 › 전자책 카드로 나간다 — 무료는 '무료로받기'(회원가입 · 로그인한 회원 누구나), 유료는 결제준비중.
import { computed, nextTick, onUnmounted, ref } from 'vue';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';
import { userMessage } from '../services/userMessage';
import { auth } from '../services/firebase';
import {
  EBOOK_DESC_MAX,
  EBOOK_KINDS,
  EBOOK_MAX_MB,
  ebookBodyHtml,
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

/* 올리기 칸 — 늘 펼쳐 둔다. id 가 있으면 고치는 중 */
const draft = ref<Ebook>(emptyEbook());
const editing = computed(() => !!draft.value.id);
const pdf = ref<File | null>(null);
const cover = ref<File | null>(null);
const coverPreview = ref('');
const publishNow = ref(true);
const progress = ref(0);
const saving = ref(false);
const formEl = ref<HTMLElement | null>(null);
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

const setCoverPreview = (url: string) => { if (coverPreview.value.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value); coverPreview.value = url; };
const reset = () => {
  draft.value = emptyEbook(); paid.value = false; pdf.value = null; cover.value = null; setCoverPreview(''); publishNow.value = true; progress.value = 0; showPrev.value = false;
};
const openEdit = (b: Ebook) => {
  draft.value = { ...emptyEbook(), ...b }; paid.value = isPaidEbook(b); pdf.value = null; cover.value = null; setCoverPreview(b.coverUrl); publishNow.value = b.published; progress.value = 0; showPrev.value = false;
  nextTick(() => formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
};

/** 책 파일 받기 — 누르기와 끌어다 놓기가 같이 쓴다 */
const takePdf = (f: File | null): boolean => {
  if (!f) return false;
  if (!/\.(pdf|epub)$/i.test(f.name)) { flash('PDF · EPUB 파일만 올릴 수 있습니다.'); return false; }
  if (f.size > EBOOK_MAX_MB * 1024 * 1024) { flash(`책 파일은 ${EBOOK_MAX_MB}MB 까지 올릴 수 있습니다.`); return false; }
  pdf.value = f;
  return true;
};
const onPdf = (e: Event) => { const el = e.target as HTMLInputElement; if (!takePdf(el.files?.[0] ?? null)) el.value = ''; };
const takeCover = (f: File | null) => {
  if (!f) return;
  if (!f.type.startsWith('image/')) { flash('표지는 그림 파일(PNG · JPG)만 쓸 수 있습니다.'); return; }
  cover.value = f;
  setCoverPreview(URL.createObjectURL(f));
};
const onCover = (e: Event) => takeCover((e.target as HTMLInputElement).files?.[0] ?? null);
/* 끌어다 놓기 — 상자 위에 있는 동안 파란 테두리 */
const dragPdf = ref(false);
const dragCover = ref(false);
const onPdfDrop = (e: DragEvent) => { dragPdf.value = false; takePdf(e.dataTransfer?.files?.[0] ?? null); };
const onCoverDrop = (e: DragEvent) => { dragCover.value = false; takeCover(e.dataTransfer?.files?.[0] ?? null); };

// 가격 — 유료를 고르면 금액 칸이 열린다(천 단위 쉼표)
const paid = ref(false);
const setPaid = (on: boolean) => { paid.value = on; if (!on) draft.value.price = 0; };
const priceText = computed(() => (draft.value.price ? draft.value.price.toLocaleString('ko-KR') : ''));
const onPrice = (e: Event) => {
  const el = e.target as HTMLInputElement;
  const n = Number(el.value.replace(/[^0-9]/g, '')) || 0;
  draft.value.price = n;
  el.value = n ? n.toLocaleString('ko-KR') : '';
};
const priceLabel = (b: Ebook) => (isPaidEbook(b) ? `${Number(b.price).toLocaleString('ko-KR')}원` : '무료');

/* 내용 칸 도구 — 굵게(**글**) · 줄비우기(빈 줄) · 목록(줄 앞 ·) · 미리보기 */
const bodyEl = ref<HTMLTextAreaElement | null>(null);
const showPrev = ref(false);
const edit = (fn: (v: string, a: number, b: number) => { v: string; a: number; b: number }) => {
  const el = bodyEl.value;
  if (!el) return;
  const r = fn(draft.value.desc, el.selectionStart, el.selectionEnd);
  if (r.v.length > EBOOK_DESC_MAX) { flash(`내용은 ${EBOOK_DESC_MAX.toLocaleString('ko-KR')}자까지 적을 수 있습니다.`); return; }
  draft.value.desc = r.v;
  nextTick(() => { el.focus(); el.setSelectionRange(r.a, r.b); });
};
const bold = () => edit((v, a, b) => { const t = v.slice(a, b) || '굵게 할 글'; return { v: `${v.slice(0, a)}**${t}**${v.slice(b)}`, a: a + 2, b: a + 2 + t.length }; });
const blank = () => edit((v, a, b) => ({ v: `${v.slice(0, a)}\n\n${v.slice(b)}`, a: a + 2, b: a + 2 }));
const list = () => edit((v, a, b) => {
  const s0 = v.lastIndexOf('\n', a - 1) + 1;
  const out = v.slice(s0, b).split('\n').map((l) => (l.startsWith('· ') ? l : `· ${l}`)).join('\n');
  return { v: v.slice(0, s0) + out + v.slice(b), a: s0, b: s0 + out.length };
});

const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024)).toLocaleString('ko-KR')}KB`);
const fileText = computed(() => {
  if (pdf.value) return { name: pdf.value.name, sub: `${sizeText(pdf.value.size)} · 다른 파일을 놓으면 바뀝니다` };
  if (draft.value.fileName) return { name: draft.value.fileName, sub: `${sizeText(draft.value.fileSize)} · 올린 파일 · 새로 고르면 바뀝니다` };
  return null;
});

/** 저장 — 임시저장은 숨김으로, 올리기는 '바로공개'를 따른다 */
const save = async (asDraft: boolean) => {
  const d = draft.value;
  if (!d.title.trim()) { flash('제목을 적어 주세요.'); return; }
  if (paid.value && !(d.price > 0)) { flash('유료 금액을 적어 주세요.'); return; }
  const link = (d.link || '').trim();
  if (link && !/^https:\/\//.test(link)) { flash('링크는 https:// 로 시작하는 주소를 붙여 넣어 주세요.'); return; }
  const publish = !asDraft && publishNow.value;
  if (publish && !link && !d.filePath && !pdf.value) { flash('책 파일을 올리거나 구글드라이브 링크를 붙여 넣어 주세요.'); return; }
  saving.value = true;
  progress.value = 0;
  try {
    await saveEbook(
      { ...d, link, title: d.title.trim(), summary: (d.summary || '').trim(), desc: d.desc.trim(), price: paid.value ? d.price : 0, published: publish },
      { pdf: link ? null : pdf.value, cover: cover.value },
      (r) => { progress.value = r; },
    );
    flash(publish ? '올렸습니다. 콘텐츠 카드에 바로 나갑니다.' : '숨김으로 저장했습니다. 회원에게는 아직 보이지 않습니다.');
    reset();
  } catch (e) {
    flash(why(e, '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'), 7000);
  } finally {
    saving.value = false;
  }
};

const setPublished = async (b: Ebook, on: boolean) => {
  if (on && !hasEbookFile(b)) { flash('책 파일이 없어 공개할 수 없습니다. 고치기에서 파일이나 구글드라이브 링크를 넣어 주세요.'); return; }
  try { await patchEbook(b.id, { published: on }); flash(on ? '공개했습니다.' : '내렸습니다 — 회원에게 보이지 않습니다.'); } catch (e) { flash(why(e, '바꾸지 못했습니다.'), 7000); }
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
    run: async () => { try { await removeEbook(b); if (draft.value.id === b.id) reset(); flash('지웠습니다.'); } catch (e) { flash(userMessage(e, '지우지 못했습니다.')); } },
  };
};

const day = (iso: string) => (iso ? iso.slice(2, 10).replace(/-/g, '.') : '-');
const pct = computed(() => `${Math.round(progress.value * 100)}%`);
</script>

<template>
  <section class="ebm">
    <!-- 올리기 칸 — 왼쪽 표지, 오른쪽 칸들 -->
    <span ref="formEl" class="ebm-tag">{{ editing ? `고치는 중 · ${draft.title || '제목 없음'}` : '새 콘텐츠 올리기' }}</span>
    <div class="ebm-form">
      <label
        :class="['ebm-cover', { on: dragCover, has: !!coverPreview }]"
        @dragenter.prevent="dragCover = true"
        @dragover.prevent="dragCover = true"
        @dragleave.prevent="dragCover = false"
        @drop.prevent="onCoverDrop"
      >
        <img v-if="coverPreview" :src="coverPreview" alt="" />
        <span v-else>표지 그림을 끌어다 놓거나<br />눌러서 고르기<small>세로 3:4 · PNG/JPG</small></span>
        <em v-if="coverPreview">눌러서 바꾸기</em>
        <input type="file" accept="image/*" @change="onCover" />
      </label>

      <div class="ebm-fields">
        <div class="ebm-row2">
          <div class="ebm-f"><span class="ebm-lb">종류</span>
            <div class="ebm-seg"><button v-for="[k, t] in EBOOK_KINDS" :key="k" type="button" :class="{ on: (draft.kind || 'ebook') === k }" @click="draft.kind = k">{{ t }}</button></div>
          </div>
          <!-- 가격 — 무료(0원)면 로그인한 회원 누구나 바로 받고, 유료면 결제를 붙인 뒤 받는다 -->
          <div class="ebm-f"><span class="ebm-lb">가격</span>
            <div class="ebm-price">
              <div class="ebm-seg"><button type="button" :class="{ on: !paid }" @click="setPaid(false)">무료</button><button type="button" :class="{ on: paid }" @click="setPaid(true)">유료</button></div>
              <label v-if="paid" class="ebm-amt"><input :value="priceText" type="text" inputmode="numeric" maxlength="9" placeholder="0" @input="onPrice" /><em>원</em></label>
            </div>
          </div>
        </div>
        <div class="ebm-f"><span class="ebm-lb">꼬리표<small>카드 제목 앞 [ ]</small></span>
          <div class="ebm-seg"><button v-for="t in ['', ...TAGS]" :key="t" type="button" :class="{ on: draft.tag === t }" @click="draft.tag = t">{{ t || '없음' }}</button></div>
        </div>
        <label class="ebm-f"><span class="ebm-lb">제목</span><input v-model="draft.title" class="ebm-in" type="text" maxlength="60" placeholder="예) 빌라 경매 첫걸음 — 권리분석부터 명도까지" /></label>
        <label class="ebm-f"><span class="ebm-lb">한줄설명<small>카드 제목 아래</small></span><input v-model="draft.summary" class="ebm-in" type="text" maxlength="80" placeholder="예) 처음 빌라 경매를 하는 분이 알아야 할 순서를 사례 12개로 정리했습니다." /></label>

        <!-- 내용 — 자세히보기 창에 나간다. 줄바꿈 · 빈 줄 그대로, **굵게** -->
        <div class="ebm-f"><span class="ebm-lb">내용<small>자세히보기 창</small></span>
          <div class="ebm-body">
            <div class="ebm-tools">
              <button type="button" title="고른 글을 굵게" @click="bold"><b>굵게</b></button>
              <button type="button" title="빈 줄 넣기" @click="blank">줄비우기</button>
              <button type="button" title="고른 줄 앞에 · 붙이기" @click="list">목록</button>
              <button type="button" :class="['ebm-prev', { on: showPrev }]" @click="showPrev = !showPrev">미리보기</button>
            </div>
            <textarea ref="bodyEl" v-model="draft.desc" rows="10" :maxlength="EBOOK_DESC_MAX" placeholder="이 책에서 다루는 것, 차례, 누구에게 맞는지 등을 적어 주세요. 엔터로 줄을 바꾸고, 빈 줄로 문단을 나눕니다." />
            <small class="ebm-cnt">{{ draft.desc.length.toLocaleString('ko-KR') }} / {{ EBOOK_DESC_MAX.toLocaleString('ko-KR') }}</small>
            <!-- eslint-disable-next-line vue/no-v-html -- ebookBodyHtml 이 글을 막고(escape) 굵게만 살린다 -->
            <div v-if="showPrev && draft.desc.trim()" class="ebm-prevbox" v-html="ebookBodyHtml(draft.desc)" />
            <div v-else-if="showPrev" class="ebm-prevbox none">적은 내용이 없습니다</div>
          </div>
        </div>

        <div class="ebm-f"><span class="ebm-lb">파일</span>
          <div class="ebm-filebox">
            <label
              :class="['ebm-drop', { on: dragPdf, has: !!fileText }]"
              @dragenter.prevent="dragPdf = true"
              @dragover.prevent="dragPdf = true"
              @dragleave.prevent="dragPdf = false"
              @drop.prevent="onPdfDrop"
            >
              <span class="pdf-ic">PDF</span>
              <span v-if="fileText" class="ebm-tx"><b>{{ fileText.name }}</b><small>{{ fileText.sub }}</small></span>
              <span v-else class="ebm-tx"><b>책 파일을 끌어다 놓거나 눌러서 고르기</b><small>PDF · EPUB, {{ EBOOK_MAX_MB }}MB 까지</small></span>
              <input type="file" accept="application/pdf,.pdf,.epub" @change="onPdf" />
            </label>
            <input v-model="draft.link" class="ebm-in" type="url" placeholder="또는 구글드라이브 링크 https://drive.google.com/file/d/…" />
            <small class="ebm-hint">링크가 있으면 파일 대신 링크로 받습니다. 구글드라이브에서 '링크가 있는 모든 사용자'로 공유해 주세요.</small>
          </div>
        </div>

        <div v-if="saving" class="ebm-bar" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: pct }" /><b>{{ pct }}</b></div>

        <div class="ebm-foot">
          <div class="ebm-chks">
            <label class="ebm-chk"><input v-model="publishNow" type="checkbox" />바로공개</label>
            <!-- 받기는 늘 로그인한 회원만 — 파일 조각 읽기 규칙 · 받은 기록(회원 아이디)이 로그인을 요구한다 -->
            <p class="ebm-note">받기는 회원가입 후 로그인한 회원만 할 수 있습니다.</p>
          </div>
          <div class="ebm-btns">
            <button v-if="editing" type="button" class="ebm-btn" :disabled="saving" @click="reset">취소</button>
            <button type="button" class="ebm-btn" :disabled="saving" @click="save(true)">임시저장</button>
            <button type="button" class="ebm-btn ebm-pri" :disabled="saving" @click="save(false)">{{ saving ? '올리는 중' : editing ? '고친내용저장' : '올리기' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 올린 콘텐츠 표 -->
    <span class="ebm-tag">올린 콘텐츠<b>{{ books.length.toLocaleString('ko-KR') }}</b></span>
    <p v-if="loadErr" class="ebm-empty">{{ loadErr }}</p>
    <p v-else-if="!books.length" class="ebm-empty">아직 올린 콘텐츠가 없습니다. 위 칸에서 올려 주세요.</p>
    <div v-else class="ebm-list">
      <table class="it-table">
        <thead><tr><th>제목</th><th>종류</th><th>가격</th><th>상태</th><th class="r">받은 수</th><th>올린 날</th><th class="c">관리</th></tr></thead>
        <tbody>
          <tr v-for="(b, i) in books" :key="b.id" :class="{ off: !b.published, cur: draft.id === b.id }">
            <td class="ebm-ttl">
              <span class="ebm-th"><img v-if="b.coverUrl" :src="b.coverUrl" alt="" /></span>
              <span class="ebm-nm"><b><em v-if="b.tag">[{{ b.tag }}]</em> {{ b.title }}</b><small>{{ b.link ? '구글드라이브 링크' : b.fileName ? `${b.fileName} · ${sizeText(b.fileSize)}` : '파일 없음' }}</small></span>
            </td>
            <td>{{ ebookKindLabel(b.kind) }}</td>
            <td><span :class="['ebm-pill', isPaidEbook(b) ? 'paid' : 'free']">{{ priceLabel(b) }}</span></td>
            <td><span :class="['ebm-pill', b.published ? 'on' : 'off']">{{ b.published ? '공개' : '숨김' }}</span></td>
            <td class="r">{{ (b.downloads || 0).toLocaleString('ko-KR') }}명</td>
            <td>{{ day(b.createdAt) }}</td>
            <td class="ebm-ac">
              <button type="button" class="ebm-sq" :disabled="i === 0" aria-label="위로" @click="move(b, -1)">▲</button>
              <button type="button" class="ebm-sq" :disabled="i === books.length - 1" aria-label="아래로" @click="move(b, 1)">▼</button>
              <button type="button" @click="openEdit(b)">고치기</button>
              <button type="button" @click="setPublished(b, !b.published)">{{ b.published ? '내리기' : '공개' }}</button>
              <button type="button" class="ebm-del" @click="askRemove(b)">지우기</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="msg" class="ebm-toast">{{ msg }}</p>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.ebm { --e-line: var(--line, #dde3ee); --e-bg: var(--surface, #fff); --e-bg2: var(--surface-2, #f3f5f9); --e-text: var(--text, #1b2333); --e-muted: var(--muted, #6b7280); --e-blue: #2b6df3; --e-blue-soft: var(--blue-soft, #eef3ff);
  display: grid; gap: 12px; }
/* 칸 이름 — 주황 막대 */
.ebm-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: #f08a24; scroll-margin-top: 90px; }
.ebm-tag::before { content: ""; width: 3px; height: 14px; border-radius: 2px; background: #f08a24; }
.ebm-tag b { margin-left: 2px; color: var(--e-muted); font-weight: 700; }

.ebm-form { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; padding: 18px; border: 1px solid var(--e-line); border-radius: 12px; background: var(--e-bg); margin-bottom: 14px; }
.ebm-cover { position: relative; align-self: start; aspect-ratio: 3 / 4; border: 2px dashed var(--e-line); border-radius: 10px; background: var(--e-bg2); display: grid; place-items: center; overflow: hidden; text-align: center; color: var(--e-muted); font-size: 13px; line-height: 1.6; padding: 12px; cursor: pointer; transition: border-color .15s, background .15s; }
.ebm-cover small { display: block; margin-top: 4px; font-size: 12px; opacity: .8; }
.ebm-cover input, .ebm-drop input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ebm-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }   /* 표지는 자르지 않고 전체를 */
.ebm-cover em { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px; background: rgba(17, 24, 39, .6); color: #fff; font-style: normal; font-size: 12px; opacity: 0; transition: opacity .15s; }
.ebm-cover:hover em { opacity: 1; }
.ebm-cover.has { border-style: solid; padding: 0; }
.ebm-cover.on, .ebm-cover:hover { border-color: var(--e-blue); }

.ebm-fields { display: grid; gap: 14px; min-width: 0; align-content: start; }
.ebm-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ebm-f { display: grid; gap: 6px; min-width: 0; }
.ebm-lb { font-size: 13px; font-weight: 700; color: var(--e-muted); }
.ebm-lb small { margin-left: 6px; font-size: 12px; font-weight: 400; opacity: .8; }
.ebm-in { width: 100%; box-sizing: border-box; height: 38px; padding: 0 12px; border: 1px solid var(--e-line); border-radius: 8px; background: var(--e-bg); color: var(--e-text); font: inherit; font-size: 14px; }
.ebm-in:focus, .ebm-body textarea:focus, .ebm-amt input:focus { outline: none; border-color: var(--e-blue); }

/* 고르기 — 붙은 단추 줄 */
.ebm-seg { display: inline-flex; flex-wrap: wrap; width: max-content; max-width: 100%; border: 1px solid var(--e-line); border-radius: 8px; overflow: hidden; }
.ebm-seg button { height: 34px; padding: 0 14px; border: 0; border-radius: 0; background: var(--e-bg); color: var(--e-muted); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.ebm-seg button + button { border-left: 1px solid var(--e-line); }
.ebm-seg button.on { background: var(--e-blue-soft); color: var(--e-blue); }
.ebm-price { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ebm-amt { display: inline-flex; align-items: center; gap: 6px; }
.ebm-amt input { width: 130px; height: 36px; padding: 0 10px; border: 1px solid var(--e-line); border-radius: 8px; background: var(--e-bg); color: var(--e-text); font: inherit; font-size: 14px; text-align: right; }
.ebm-amt em { font-style: normal; font-size: 14px; color: var(--e-muted); }

/* 내용 — 도구줄 + 큰 글칸 */
.ebm-body { position: relative; display: grid; border: 1px solid var(--e-line); border-radius: 8px; overflow: hidden; background: var(--e-bg); }
.ebm-body .ebm-tools { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--e-line); background: var(--e-bg2); }
.ebm-body .ebm-tools button { height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--e-text); font: inherit; font-size: 13px; cursor: pointer; }
.ebm-body .ebm-tools button:hover { border-color: var(--e-line); background: var(--e-bg); }
.ebm-body .ebm-tools .ebm-prev { margin-left: auto; color: var(--e-muted); }
.ebm-body .ebm-tools .ebm-prev.on { border-color: var(--e-blue); background: var(--e-blue-soft); color: var(--e-blue); }
.ebm-body textarea { min-height: 220px; padding: 10px 12px 26px; border: 0; background: transparent; color: var(--e-text); font: inherit; font-size: 14px; line-height: 1.7; resize: vertical; }
.ebm-body .ebm-cnt { position: absolute; right: 12px; bottom: 8px; font-size: 12px; color: var(--e-muted); pointer-events: none; }
.ebm-body:has(.ebm-prevbox) .ebm-cnt { bottom: auto; top: 46px; }
.ebm-prevbox { padding: 12px 14px; border-top: 1px dashed var(--e-line); background: var(--e-bg2); font-size: 14px; line-height: 1.7; color: var(--e-text); white-space: pre-line; word-break: break-word; }
.ebm-prevbox.none { color: var(--e-muted); }

/* 파일 — 끌어다 놓기 상자 + 링크 */
.ebm-filebox { display: grid; gap: 8px; }
.ebm-drop { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px dashed var(--e-line); border-radius: 10px; background: var(--e-bg2); cursor: pointer; transition: border-color .15s, background .15s; }
.ebm-drop:hover, .ebm-drop.on { border-color: var(--e-blue); background: var(--e-blue-soft); }
.ebm-drop.has { border-style: solid; }
.pdf-ic { flex: none; width: 34px; height: 42px; border-radius: 4px; background: #e2554f; color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
.ebm-drop .ebm-tx { display: grid; gap: 2px; min-width: 0; }
.ebm-drop .ebm-tx b { font-size: 13px; color: var(--e-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ebm-drop .ebm-tx small, .ebm-hint { font-size: 12px; color: var(--e-muted); line-height: 1.5; }

.ebm-bar { position: relative; height: 22px; border-radius: 6px; background: var(--e-bg2); overflow: hidden; }
.ebm-bar i { position: absolute; inset: 0 auto 0 0; background: var(--e-blue); transition: width .2s; }
.ebm-bar b { position: relative; display: block; text-align: center; line-height: 22px; font-size: 12px; color: #fff; mix-blend-mode: difference; }

.ebm-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-top: 4px; }
.ebm-chks { display: flex; align-items: center; gap: 8px 18px; flex-wrap: wrap; }
.ebm-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--e-text); cursor: pointer; }
.ebm-chk input { width: 16px; height: 16px; margin: 0; accent-color: var(--e-blue); }
.ebm-note { margin: 0; font-size: 12px; color: var(--e-muted); }
.ebm-btns { display: flex; gap: 8px; margin-left: auto; }
.ebm-btn { height: 38px; padding: 0 18px; border: 1px solid var(--e-line); border-radius: 8px; background: var(--e-bg); color: var(--e-text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.ebm-btn:hover:not(:disabled) { border-color: var(--e-blue); color: var(--e-blue); }
.ebm-btn.ebm-pri { min-width: 96px; border-color: var(--e-blue); background: var(--e-blue); color: #fff; }
.ebm-btn.ebm-pri:hover:not(:disabled) { background: #1f5ad6; color: #fff; }
.ebm-btn:disabled { opacity: .55; cursor: default; }

/* 올린 콘텐츠 표 — 모서리 · 선은 웹 공통 .it-table */
.ebm-empty { margin: 0; padding: 28px 0; text-align: center; font-size: 14px; color: var(--e-muted); }
.ebm-list { overflow-x: auto; }
.ebm-list table { width: 100%; min-width: 760px; font-size: 13px; }
.ebm-list th { white-space: nowrap; }
.ebm-list td { vertical-align: middle; white-space: nowrap; color: var(--e-text); }
.ebm-list .r { text-align: right; } .ebm-list .c { text-align: center; }
.ebm-list tr.off td.ebm-ttl { opacity: .6; }
.ebm-list tr.cur td { background: var(--e-blue-soft); }
.ebm-list .ebm-ttl { display: flex; align-items: center; gap: 10px; white-space: normal; min-width: 240px; }
.ebm-list .ebm-th { flex: none; width: 30px; aspect-ratio: 3 / 4; border-radius: 4px; background: var(--e-bg2); overflow: hidden; }
.ebm-list .ebm-th img { width: 100%; height: 100%; object-fit: contain; display: block; }
.ebm-list .ebm-nm { display: grid; gap: 2px; min-width: 0; }
.ebm-list .ebm-nm b { font-size: 14px; font-weight: 700; }
.ebm-list .ebm-nm b em { font-style: normal; color: var(--e-blue); }
.ebm-list .ebm-nm small { font-size: 12px; color: var(--e-muted); }
.ebm-pill { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.ebm-pill.free { background: #e8f6ee; color: #15803d; }
.ebm-pill.paid, .ebm-pill.on { background: var(--e-blue-soft); color: var(--e-blue); }
.ebm-pill.off { background: var(--e-bg2); color: var(--e-muted); }
.ebm-list .ebm-ac { text-align: right; }
.ebm-list .ebm-ac button { height: 28px; margin-left: 4px; padding: 0 9px; border: 1px solid var(--e-line); border-radius: 6px; background: var(--e-bg); color: var(--e-text); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.ebm-list .ebm-ac button.ebm-sq { width: 28px; padding: 0; }
.ebm-list .ebm-ac button:hover:not(:disabled) { border-color: var(--e-blue); color: var(--e-blue); }
.ebm-list .ebm-ac button.ebm-del { color: #dc2626; } .ebm-list .ebm-ac button.ebm-del:hover { border-color: #dc2626; color: #dc2626; }
.ebm-list .ebm-ac button:disabled { opacity: .4; cursor: default; }

.ebm-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
@media (max-width: 760px) {
  .ebm-form { grid-template-columns: 1fr; }
  .ebm-cover { width: 160px; justify-self: center; }
  .ebm-row2 { grid-template-columns: 1fr; }
}
</style>
