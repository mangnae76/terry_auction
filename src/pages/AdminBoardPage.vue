<script setup lang="ts">
// 운영 — 이벤트·공지사항·업데이트 올리기.
// 여기서 저장하면 앱의 더보기 › 공지 탭에 바로 나간다.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from '../components/BrandLogo.vue';
import DateTimeField from '../components/DateTimeField.vue';
import { useAuthStore } from '../stores/authStore';
import { markLine, TABLE_SNIPPET, type Align } from '../services/boardBody';
import {
  compressBoardImage,
  newBoardId,
  removeBoardPost,
  saveBoardPost,
  dayRangeLabel,
  eventPeriodLabel,
  scheduleState,
  subscribeBoardPosts,
  titleOf,
  whenLabel,
  type BoardKind,
  type BoardPost,
} from '../services/boardRepository';

const router = useRouter();
const auth = useAuthStore();
const who = computed(() => auth.nickname || auth.email || '');

const KINDS: Array<{ key: BoardKind; label: string; hint: string; tags: string[] }> = [
  // 배너에는 줄 목록이 없어 꼬리표를 붙일 자리가 없다 — 그 몫은 배지가 한다
  { key: 'banner', label: '이벤트 배너', hint: '앱 더보기의 모든 탭 맨 위에 돌아가며 뜬다 (3:1 그림)', tags: [] },
  { key: 'event', label: '이벤트', hint: '공지 탭의 이벤트 목록에 줄로 들어간다', tags: ['안내', '진행', '마감'] },
  { key: 'notice', label: '공지사항', hint: '점검·정책처럼 알려야 하는 것', tags: ['안내', '점검', '중요'] },
  { key: 'update', label: '업데이트', hint: '새로 붙은 기능·고친 것', tags: ['신규', '기능', '개선'] },
];

/** 배너를 이벤트 목록에도 넣을 때 쓰는 꼬리표 — 이벤트 상자와 같은 것을 쓴다 */
const EVENT_TAGS = KINDS.find((k) => k.key === 'event')?.tags ?? [];

const posts = ref<BoardPost[]>([]);
const err = ref('');
let unsub: (() => void) | null = null;
onMounted(() => {
  unsub = subscribeBoardPosts((rows) => { posts.value = rows; }, (m) => { err.value = m; });
});
onUnmounted(() => { if (unsub) unsub(); });

const listOf = (kind: BoardKind) => computed(() => posts.value.filter((p) => p.kind === kind));

/* ───────── 쓰기 ───────── */

const emptyPost = (kind: BoardKind): BoardPost => ({
  id: newBoardId(),
  kind,
  // 배너가 이벤트 줄까지 겸할 때를 미리 채워 둔다
  tag: kind === 'banner' ? '진행' : (KINDS.find((k) => k.key === kind)?.tags[0] ?? ''),
  title: '',
  body: '',
  imageUrl: '',
  published: false,
  postedAt: '',
  showBanner: kind === 'banner',
  alsoEvent: kind === 'banner',
  eventStartAt: '',
  eventEndAt: '',
  star: false,
  banner: kind === 'banner',
  badge: 'EVENT',
  cta: '자세히 보기',
  period: '',
  startAt: '',
  endAt: '',
  order: Date.now(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** 날짜를 고른 때 — 고르개가 닫히며 흘린 손길이 다른 것을 누르는 일을 막는다 */
let dateTouchedAt = 0;
const onDateChange = () => { dateTouchedAt = Date.now(); };

const draft = ref<BoardPost | null>(null);
/** 기간 글을 비워 두면 배너에 대신 나갈 글 */
const autoPeriod = computed(() => {
  const d = draft.value;
  if (!d) return '';
  // 배너는 날짜까지만 — 시각은 상세 보기의 '기간 :' 줄에서 본다
  return dayRangeLabel(d.eventStartAt, d.eventEndAt) || dayRangeLabel(d.startAt, d.endAt);
});
const openNew = (kind: BoardKind) => { draft.value = emptyPost(kind); imgSize.value = ''; };
const openEdit = (p: BoardPost) => {
  draft.value = { ...p, title: titleOf(p) };
  readSize(p.imageUrl ?? '');
};
const close = () => { draft.value = null; };

/**
 * 바깥을 눌러 닫기 — 누르기와 떼기가 모두 바깥일 때만 닫는다.
 * 달력은 쓰기 상자 밖까지 펼쳐지는데, 그 위에서 날짜를 고르면 떼는 손길이
 * 바깥에 떨어져 창이 닫혀 버렸다. 그래서 누른 자리까지 본다.
 */
const downOnBack = ref(false);
const onBackUp = (ev: MouseEvent) => {
  const onBack = ev.target === ev.currentTarget;
  if (downOnBack.value && onBack && Date.now() - dateTouchedAt > 400) close();
  downOnBack.value = false;
};

const saving = ref(false);
const msg = ref('');
const flash = (text: string) => {
  msg.value = text;
  window.setTimeout(() => { msg.value = ''; }, 2600);
};

/** 막힌 까닭을 사람 말로 — 규칙에 막히면 어느 계정인지 같이 알려 준다 */
const reason = (e: unknown, fallback: string) => {
  const m = e instanceof Error ? e.message : '';
  if (/permission|insufficient/i.test(m)) {
    return `이 계정(${auth.email || '로그인 안 됨'})에는 올릴 권한이 없습니다 — 운영자 계정으로 들어와 주세요.`;
  }
  return m || fallback;
};

/** 그림 고르기 — 올리기 전에 작게 줄인다 */
const picking = ref(false);
/** 고른 그림의 실제 크기 — 운영자가 비율을 눈으로 맞출 수 있게 */
const imgSize = ref('');
const readSize = (dataUrl: string) => {
  if (!dataUrl) { imgSize.value = ''; return; }
  const img = new Image();
  img.onload = () => {
    imgSize.value = `${img.width}×${img.height}`;
  };
  img.src = dataUrl;
};
const fileEl = ref<HTMLInputElement | null>(null);
const openFile = () => {
  if (Date.now() - dateTouchedAt < 500) return;
  fileEl.value?.click();
};

const pickImage = async (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !draft.value) return;
  picking.value = true;
  try {
    draft.value.imageUrl = await compressBoardImage(file);
    readSize(draft.value.imageUrl);
  } catch (e) {
    flash(e instanceof Error ? e.message : '그림을 올리지 못했습니다.');
  } finally {
    picking.value = false;
  }
};

/**
 * 글 담기.
 * publish=false 면 작성 중으로만 둔다 — 앱에는 나가지 않고 운영 목록에만 보인다.
 */
const save = async (publish: boolean) => {
  const d = draft.value;
  if (!d) return;
  if (publish && !d.title.trim()) { flash('제목을 적어 주세요.'); return; }
  if (d.startAt && d.endAt && d.endAt <= d.startAt) { flash('내리는 때가 올리는 때보다 빠릅니다.'); return; }
  saving.value = true;
  try {
    await saveBoardPost({
      ...d,
      published: publish,
      // 등록 시각은 처음 올린 때 — 창을 연 때가 아니다
      postedAt: publish ? (d.postedAt || new Date().toISOString()) : d.postedAt,
      title: d.title.trim(),
      body: (d.body ?? '').trim(),
    });
    flash(publish ? '올렸습니다. 앱에 바로 나갑니다.' : '작성 중으로 담아 두었습니다. 앱에는 아직 나가지 않습니다.');
    close();
  } catch (e) {
    flash(reason(e, '저장하지 못했습니다.'));
  } finally {
    saving.value = false;
  }
};

/** 목록에서 바로 올리고 내리기 */
const setPublished = async (p: BoardPost, publish: boolean) => {
  if (publish && !titleOf(p)) { flash('제목이 없어 올릴 수 없습니다 — 고치기에서 적어 주세요.'); return; }
  try {
    await saveBoardPost(
      { ...p, published: publish, postedAt: publish ? (p.postedAt || new Date().toISOString()) : p.postedAt },
      { touch: false },
    );
    flash(publish ? '올렸습니다.' : '내렸습니다 — 작성 중으로 둡니다.');
  } catch (e) {
    flash(reason(e, '바꾸지 못했습니다.'));
  }
};

const removeOne = async (p: BoardPost) => {
  if (!window.confirm(`'${titleOf(p)}' 를 지울까요?`)) return;
  try {
    await removeBoardPost(p.id);
    flash('지웠습니다.');
  } catch (e) {
    flash(reason(e, '지우지 못했습니다.'));
  }
};

/** 굴러가는 모양을 보려면 여러 장이 있어야 한다 — 눌러서 보기용 배너 두 장을 넣는다 (쓰고 나면 지우면 된다) */
const seeding = ref(false);
const seedBanners = async () => {
  seeding.value = true;
  const base = Date.now();
  const samples = [
    {
      title: '가을맞이 3개월 35% 할인',
      desc: '기간을 길게 고를수록 더 깎입니다',
      body: '12개월을 고르면 35%, 6개월 25%, 3개월 15% 깎입니다. 포인트가 있으면 깎인 금액에서 또 뺄 수 있습니다.',
      badge: 'SALE',
      period: '2026.10.01 ~ 10.31',
    },
    {
      title: '친구 부르면 2,000P',
      desc: '친구와 나, 둘 다 받습니다',
      body: '친구가 가입을 마치면 두 분 모두에게 2,000P 를 드립니다. 포인트는 결제할 때 바로 쓸 수 있습니다.',
      badge: 'POINT',
      period: '상시',
    },
  ];
  try {
    for (let i = 0; i < samples.length; i += 1) {
      const sm = samples[i];
      await saveBoardPost({
        ...emptyPost('banner'),
        id: newBoardId(),
        published: true,
        title: sm.title,
        desc: sm.desc,
        body: sm.body,
        badge: sm.badge,
        period: sm.period,
        cta: '자세히 보기',
        order: base + i,
      });
    }
    flash('보기용 배너 두 장을 넣었습니다.');
  } catch (e) {
    flash(reason(e, '넣지 못했습니다.'));
  } finally {
    seeding.value = false;
  }
};

/* ───────── 본문 꾸미기 — 표와 줄 맞춤 ───────── */

const bodyEl = ref<HTMLTextAreaElement | null>(null);

/** 고친 글을 되돌려 놓고 커서 자리까지 맞춘다 */
const putBody = (text: string, from: number, to: number) => {
  if (!draft.value) return;
  draft.value.body = text;
  window.setTimeout(() => {
    const el = bodyEl.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(from, to);
  }, 0);
};

/** 커서 자리에 표 뼈대를 끼워 넣는다 */
const insertTable = () => {
  const el = bodyEl.value;
  const body = draft.value?.body ?? '';
  const at = el ? el.selectionStart : body.length;
  const before = body.slice(0, at);
  const after = body.slice(at);
  const head = before && !before.endsWith('\n') ? '\n' : '';
  const tail = after && !after.startsWith('\n') ? '\n' : '';
  const piece = `${head}${TABLE_SNIPPET}${tail}`;
  putBody(before + piece + after, at + head.length, at + head.length + TABLE_SNIPPET.length);
};

/** 고른 줄들의 맞춤을 바꾼다 (고른 것이 없으면 커서가 놓인 줄) */
const setAlign = (align: Align) => {
  const el = bodyEl.value;
  const body = draft.value?.body ?? '';
  const from = el ? el.selectionStart : 0;
  const to = el ? el.selectionEnd : 0;
  const head = body.lastIndexOf('\n', from - 1) + 1;
  const tailAt = body.indexOf('\n', to);
  const tail = tailAt === -1 ? body.length : tailAt;
  const fixed = body.slice(head, tail).split('\n').map((l) => markLine(l, align)).join('\n');
  putBody(body.slice(0, head) + fixed + body.slice(tail), head, head + fixed.length);
};

/** 차례 바꾸기 — 작은 것이 위 */
const move = async (p: BoardPost, dir: -1 | 1) => {
  const list = posts.value.filter((x) => x.kind === p.kind);
  const i = list.findIndex((x) => x.id === p.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  try {
    await saveBoardPost({ ...a, order: b.order }, { touch: false });
    await saveBoardPost({ ...b, order: a.order }, { touch: false });
  } catch (e) {
    flash(reason(e, '차례를 바꾸지 못했습니다.'));
  }
};
</script>

<template>
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-brand">
          <BrandLogo :size="36" tone="white" />
          <small class="adm-brand-tag">운영</small>
        </div>
        <nav class="adm-top-nav">
          <button type="button" class="adm-top-link" @click="router.push('/more')">앱에서 보기</button>
          <span class="adm-who">{{ who }}</span>
        </nav>
      </div>
    </header>

    <div class="adm-body">
      <div class="adm-head">
        <h1>배너 · 이벤트 · 공지 · 업데이트</h1>
        <p>
          <b>이벤트 배너</b>는 앱 더보기의 <b>모든 탭 맨 위</b>에 돌아가며 뜨고,
          나머지는 <b>더보기 › 공지</b> 탭에 줄로 들어갑니다.
          <b>작성 중 저장</b>해 둔 글은 앱에 나가지 않습니다.
        </p>
      </div>

      <p v-if="err" class="adb-err">
        {{ err }}
        <template v-if="/permission|insufficient/i.test(err)"> — 지금 계정 {{ auth.email || '(로그인 안 됨)' }}</template>
      </p>

      <section v-for="k in KINDS" :key="k.key" class="adb-card">
        <header class="adb-head">
          <h2>{{ k.label }}<small>{{ k.hint }}</small></h2>
          <button
            v-if="k.key === 'banner'"
            type="button"
            class="adb-seed"
            :disabled="seeding"
            title="굴러가는 모양을 보려고 넣는 보기용 배너입니다. 확인한 뒤 지우세요."
            @click="seedBanners"
          >{{ seeding ? '넣는 중…' : '보기용 2장' }}</button>
          <button type="button" class="adb-add" @click="openNew(k.key)">＋ 새 글</button>
        </header>

        <p v-if="listOf(k.key).value.length === 0" class="adb-empty">
          올린 글이 없습니다 — 앱에는 기본 글이 보입니다.
        </p>
        <ul v-else class="adb-list">
          <li v-for="p in listOf(k.key).value" :key="p.id">
            <span class="adb-tag" :class="{ star: p.star, badge: p.kind === 'banner' }">
              {{ p.kind === 'banner' ? (p.badge || 'EVENT') : (p.star ? '✦' : (p.tag || '—')) }}
            </span>
            <img v-if="p.imageUrl" :src="p.imageUrl" class="adb-thumb" alt="" />
            <span class="adb-txt">
              <b>
                {{ titleOf(p) || '(제목 없음)' }}
                <em v-if="p.kind === 'event' && p.banner" class="adb-badge">배너</em>
                <em v-if="p.kind === 'banner' && p.showBanner !== false" class="adb-badge">배너</em>
                <em v-if="p.kind === 'banner' && p.alsoEvent" class="adb-badge alt">목록</em>
                <em :class="['adb-state', scheduleState(p)]">{{ scheduleState(p) }}</em>
              </b>
              <small v-if="p.body">{{ p.body }}</small>
              <small v-if="p.startAt || p.endAt" class="adb-when">
                {{ p.startAt ? whenLabel(p.startAt) : '바로' }} ~ {{ p.endAt ? whenLabel(p.endAt) : '계속' }}
              </small>
              <small v-else-if="p.period">{{ p.period }}</small>
            </span>
            <span class="adb-acts">
              <button type="button" @click="move(p, -1)" title="위로">▲</button>
              <button type="button" @click="move(p, 1)" title="아래로">▼</button>
              <button v-if="scheduleState(p) === '작성중'" type="button" class="up" @click="setPublished(p, true)">올리기</button>
              <button v-else type="button" @click="setPublished(p, false)">내리기</button>
              <button type="button" @click="openEdit(p)">고치기</button>
              <button type="button" class="del" @click="removeOne(p)">지우기</button>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!-- 쓰기 창 -->
    <div v-if="draft" class="adb-modal" @mousedown.self="downOnBack = true" @mouseup="onBackUp">
      <div class="adb-box">
        <header class="adb-box-head">
          <strong>{{ KINDS.find((k) => k.key === draft!.kind)?.label }}</strong>
          <button type="button" class="adb-x" aria-label="닫기" @click="close">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="adb-form">
          <!-- 어디에 낼지 — 글 전체에 걸리는 값이라 맨 위에서 정한다 -->
          <div v-if="draft.kind === 'banner'" class="adb-where">
            <small>어디에 낼까요</small>
            <label class="adb-chip"><input v-model="draft.showBanner" type="checkbox" /> 배너</label>
            <label class="adb-chip"><input v-model="draft.alsoEvent" type="checkbox" /> 목록</label>
          </div>

          <!-- 언제 올리고 내릴지 -->
          <div class="adb-sec first">
            <h4>{{ draft.kind === 'banner' ? '이벤트' : KINDS.find((k) => k.key === draft!.kind)?.label }} 예약 기능</h4>
          </div>
          <div class="adb-when-row">
            <label>
              <small>올릴 때 <em>(비우면 바로)</em></small>
              <DateTimeField v-model="draft.startAt" @update:model-value="onDateChange" />
            </label>
            <label>
              <small>내릴 때 <em>(비우면 계속)</em></small>
              <DateTimeField v-model="draft.endAt" @update:model-value="onDateChange" />
            </label>
          </div>
          <p class="adb-note">예약한 때가 되면 앱에서 저절로 올라오고 내려갑니다.</p>

          <label v-if="draft.kind !== 'banner'">
            <small>꼬리표</small>
            <span class="adb-tags">
              <button
                v-for="t in KINDS.find((k) => k.key === draft!.kind)?.tags ?? []"
                :key="t"
                type="button"
                :class="['adb-tagbtn', { on: draft!.tag === t }]"
                @click="draft!.tag = t"
              >{{ t }}</button>
            </span>
          </label>

          <label>
            <small>제목 <em v-if="draft.kind === 'banner'">(배너·목록이 함께 씁니다)</em></small>
            <input v-model="draft.title" class="adb-input" placeholder="목록에 적히는 한 줄" />
          </label>

          <label v-if="draft.kind === 'banner'" :class="{ off: !draft.showBanner }">
            <small>단축 글 <em>(배너 칸에 한 줄로 들어갑니다)</em></small>
            <input
              v-model="draft.desc"
              class="adb-input"
              :disabled="!draft.showBanner"
              placeholder="기간을 길게 고를수록 더 깎입니다"
            />
          </label>

          <label v-if="draft.kind !== 'banner'">
            <small>본문 <em>(없어도 됩니다)</em></small>
            <textarea v-model="draft.body" class="adb-area" rows="4" placeholder="눌러서 펼치면 보이는 글"></textarea>
          </label>

          <!--
            그림 칸은 label 로 감싸지 않는다 — label 안에 파일 입력이 있으면 그 칸 아무 데나
            닿기만 해도(날짜 고르개가 닫히며 지나가는 손길까지) 파일 창이 열려 버린다.
          -->
          <div v-if="draft.kind !== 'banner'" class="adb-field">
            <small>
              그림 <em>(없어도 됩니다)</em>
              <b class="adb-spec">가로 1000px 안팎 권장</b>
            </small>
            <span class="adb-img">
              <img v-if="draft.imageUrl" :src="draft.imageUrl" alt="" />
              <small v-if="imgSize" class="adb-imgsize">올린 그림 {{ imgSize }}</small>
              <span class="adb-img-acts">
                <button type="button" class="adb-file" :disabled="picking" @click="openFile">
                  {{ picking ? '줄이는 중…' : (draft.imageUrl ? '다른 그림' : '그림 고르기') }}
                </button>
                <button v-if="draft.imageUrl" type="button" class="adb-img-del" @click="draft!.imageUrl = ''; imgSize = ''">빼기</button>
              </span>
            </span>
          </div>
          <input
            v-if="draft.kind !== 'banner'"
            ref="fileEl"
            type="file"
            accept="image/*"
            class="adb-hidden-file"
            @change="pickImage"
          />

          <label v-if="draft.kind === 'notice'" class="adb-check">
            <input v-model="draft.star" type="checkbox" />
            맨 위에 붙박이로 둔다 (✦)
          </label>

          <!-- 배너 칸에만 나가는 것들 -->
          <template v-if="draft.kind === 'banner'">
            <p v-if="draft.imageUrl" class="adb-oldimg">
              전에 올린 그림이 남아 있습니다
              <button type="button" @click="draft!.imageUrl = ''">빼기</button>
            </p>
            <!-- 배지·기간 글·단추 글은 짧은 값이라 한 줄에 셋 -->
            <div class="adb-row">
              <label class="narrow" :class="{ off: !draft.showBanner }">
                <small>배지</small>
                <input v-model="draft.badge" class="adb-input" :disabled="!draft.showBanner" placeholder="EVENT" />
              </label>
              <label :class="{ off: !draft.showBanner }">
                <small>기간 글 <em>(비우면 이벤트 기간)</em></small>
                <input
                  v-model="draft.period"
                  class="adb-input"
                  :disabled="!draft.showBanner"
                  placeholder="2026.10.01 ~ 10.31"
                />
              </label>
              <label class="narrow" :class="{ off: !draft.showBanner }">
                <small>단추 글</small>
                <input v-model="draft.cta" class="adb-input" :disabled="!draft.showBanner" placeholder="자세히 보기" />
              </label>
            </div>
            <p v-if="draft.showBanner && !draft.period && autoPeriod" class="adb-note">
              배너에 나갈 기간 — {{ autoPeriod }}
            </p>

            <!-- 목록·상세에 나가는 것들 -->
            <div class="adb-sec">
              <h4>이벤트 상세 내용</h4>
              <span class="adb-sec-note">{{ draft.alsoEvent ? '목록과 상세 보기에 나갑니다' : "'목록' 을 켜야 나갑니다" }}</span>
            </div>
            <div class="adb-when-row">
              <label>
                <small>이벤트 시작</small>
                <DateTimeField v-model="draft.eventStartAt" @update:model-value="onDateChange" />
              </label>
              <label>
                <small>이벤트 끝</small>
                <DateTimeField v-model="draft.eventEndAt" @update:model-value="onDateChange" />
              </label>
            </div>
            <p v-if="eventPeriodLabel(draft.eventStartAt, draft.eventEndAt)" class="adb-note">
              상세에 나갈 글 — 기간 : {{ eventPeriodLabel(draft.eventStartAt, draft.eventEndAt) }}
            </p>
            <div class="adb-field">
              <small class="adb-bodyhead">
                이벤트 본문 <em>(상세 보기에 펼쳐지는 글)</em>
                <span class="adb-tools">
                  <button type="button" title="표 집어넣기" @click="insertTable">표</button>
                  <button type="button" title="왼쪽" @click="setAlign('left')">⇤</button>
                  <button type="button" title="가운데" @click="setAlign('center')">중</button>
                  <button type="button" title="오른쪽" @click="setAlign('right')">⇥</button>
                </span>
              </small>
              <textarea
                ref="bodyEl"
                v-model="draft.body"
                class="adb-area"
                rows="6"
                placeholder="이벤트 조건·기간·주의할 점을 적습니다"
              ></textarea>
            </div>
            <label>
              <small>꼬리표</small>
              <span class="adb-tags">
                <button
                  v-for="t in EVENT_TAGS"
                  :key="t"
                  type="button"
                  :class="['adb-tagbtn', { on: draft!.tag === t }]"
                  @click="draft!.tag = t"
                >{{ t }}</button>
              </span>
            </label>
            <p class="adb-note">등록·수정 시각은 올리고 고칠 때 저절로 찍혀 상세 보기에 함께 나갑니다.</p>
          </template>
        </div>

        <footer class="adb-box-foot">
          <button type="button" class="adb-cancel" @click="close">그만두기</button>
          <button type="button" class="adb-keep" :disabled="saving" @click="save(false)">작성 중 저장</button>
          <button type="button" class="adb-save" :disabled="saving" @click="save(true)">{{ saving ? '올리는 중…' : '올리기' }}</button>
        </footer>
      </div>
    </div>

    <p v-if="msg" class="adb-toast">{{ msg }}</p>
  </section>
</template>

<style scoped>
.adm-shell { min-height: 100vh; background: #f4f6fb; }
.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: linear-gradient(180deg, #1f3a72 0%, #15295b 100%);
  border-bottom: 1px solid #16265280;
}
.adm-top-in {
  max-width: 1480px; margin: 0 auto; padding: 12px 28px;
  display: flex; align-items: center; gap: 16px;
}
.adm-back {
  border: 1px solid #ffffff4d; background: #ffffff1a; border-radius: 8px;
  width: 30px; height: 30px; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
}
.adm-brand { display: flex; align-items: center; gap: 12px; }
.adm-brand-tag {
  font-size: 11.5px; font-weight: 700; color: #c7d2ea;
  padding-left: 12px; border-left: 1px solid #ffffff33; line-height: 1.2;
}
.adm-top-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.adm-top-link {
  border: 1px solid #ffffff4d; background: #ffffff1a; border-radius: 8px;
  padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #fff; cursor: pointer;
}
.adm-who { font-size: 12px; color: #c7d2ea; font-weight: 600; }

.adm-body { max-width: 1000px; margin: 0 auto; padding: 28px 24px 60px; }
.adm-head { margin-bottom: 20px; }
.adm-head h1 { margin: 0 0 6px; font-size: 24px; font-weight: 800; color: #111827; }
.adm-head p { margin: 0; font-size: 13px; color: #6b7280; }
.adm-head b { color: #1f3a72; }
.adb-err { margin: 0 0 12px; font-size: 12.5px; color: #c62828; }

.adb-card { background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
.adb-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.adb-head h2 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; display: flex; align-items: baseline; gap: 8px; }
.adb-head h2 small { font-size: 11.5px; font-weight: 500; color: #9ca3af; }
.adb-add {
  margin-left: auto; border: 1px solid #c7d2ea; border-radius: 8px; background: #fff;
  padding: 6px 12px; font-family: inherit; font-size: 12px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}
.adb-seed {
  margin-left: auto; border: 1px dashed #c7d2ea; border-radius: 8px; background: #fff;
  padding: 6px 10px; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.adb-seed:disabled { color: #b6bdcc; cursor: default; }
/* 보기용 단추가 먼저 자리를 밀어 두었으면 '새 글'은 바로 옆에 붙는다 */
.adb-seed + .adb-add { margin-left: 0; }
.adb-empty { margin: 8px 0 0; font-size: 12.5px; color: #9ca3af; }
.adb-list { list-style: none; margin: 0; padding: 0; }
.adb-list li {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0; border-bottom: 1px solid #f1f3f7;
}
.adb-list li:last-child { border-bottom: none; }
.adb-tag {
  flex: none; min-width: 42px; text-align: center; padding: 3px 7px; border-radius: 5px;
  background: #f1f3f8; font-size: 11px; font-weight: 700; color: #6b7280;
}
.adb-tag.star { background: #e8f0ff; color: #2b6df3; }
.adb-tag.badge { background: #2a3f8f; color: #fff; }
.adb-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.adb-txt b { font-size: 13px; font-weight: 600; color: #111827; }
.adb-txt small { font-size: 11px; color: #9ca3af; }
.adb-acts { flex: none; display: flex; gap: 4px; }
.adb-acts button {
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 4px 8px; font-family: inherit; font-size: 11px; color: #4b5563; cursor: pointer;
}
.adb-acts .del { color: #c62828; border-color: #f0d4d4; }
.adb-acts .up { color: #1b7f3b; border-color: #cfe8d6; font-weight: 700; }

.adb-state {
  margin-left: 6px; font-style: normal; font-size: 10px; font-weight: 800;
  border-radius: 4px; padding: 2px 5px; background: #eef1f6; color: #6b7280;
}
.adb-state.게시중 { background: #e6f4ea; color: #1b7f3b; }
.adb-state.예약 { background: #fff3e0; color: #b26a00; }
.adb-state.종료 { background: #f1f3f8; color: #9ca3af; }
.adb-state.작성중 { background: #eef1f6; color: #4b5563; }
.adb-when { color: #6b7280 !important; }
/* 올릴 때·내릴 때를 한 줄에 — 각 칸 안에 날짜와 시각이 함께 선다 */
.adb-when-row { display: flex; gap: 10px; }
.adb-when-row > label { flex: 1 1 0; min-width: 0; }
.adb-note { margin: -4px 0 0; font-size: 11px; color: #9ca3af; }

/* 쓰기 창 */
.adb-modal {
  position: fixed; inset: 0; z-index: 60; background: rgba(17, 24, 39, .45);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.adb-box { width: 100%; max-width: 540px; background: #fff; border-radius: 12px; overflow: hidden; }
.adb-box-head {
  display: flex; align-items: center; padding: 14px 16px; border-bottom: 1px solid #eef1f6;
}
.adb-box-head strong { font-size: 14px; font-weight: 800; color: #111827; }
/* 글자 ✕ 는 글꼴마다 치우쳐 선으로 그린다 — 칸 한가운데에 선다 */
.adb-x {
  margin-left: auto; width: 26px; height: 26px; border: 1px solid #e3e8f0; border-radius: 6px;
  background: #fff; color: #4b5563; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 0;
}
.adb-x svg { display: block; }
.adb-form { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.adb-form label { display: flex; flex-direction: column; gap: 5px; }
.adb-form small { font-size: 11.5px; font-weight: 700; color: #6b7280; }
.adb-input {
  width: 100%; box-sizing: border-box; height: 38px;
  border: 1px solid #e3e8f0; border-radius: 8px; padding: 2px 11px;
  font-family: inherit; font-size: 13px; color: #111827;
}
.adb-input:focus { outline: none; border-color: #2a3f8f; }
.adb-input:disabled { background: #f7f8fb; color: #9ca3af; }
.adb-tags { display: flex; gap: 5px; }
.adb-tagbtn {
  border: 1px solid #e3e8f0; border-radius: 999px; background: #fff;
  padding: 5px 12px; font-family: inherit; font-size: 12px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.adb-tagbtn.on { background: #2a3f8f; border-color: #2a3f8f; color: #fff; }
.adb-check { flex-direction: row !important; align-items: center; gap: 7px; font-size: 12.5px; color: #374151; }
.adb-form em { font-style: normal; font-weight: 400; color: #9ca3af; }
.adb-area {
  width: 100%; box-sizing: border-box; border: 1px solid #e3e8f0; border-radius: 8px;
  padding: 9px 11px; font-family: inherit; font-size: 13px; line-height: 1.6; color: #111827; resize: vertical;
}
.adb-area:focus { outline: none; border-color: #2a3f8f; }
.adb-img { display: flex; flex-direction: column; gap: 8px; }
.adb-img img { width: 100%; max-height: 180px; object-fit: cover; border-radius: 8px; border: 1px solid #eef1f6; }
/* 배너는 앱에서 3:1 로 잘린다 — 여기서도 같은 비율로 보여 준다 */
.adb-img img.banner { max-height: none; aspect-ratio: 3 / 1; }
.adb-spec { display: block; margin-top: 2px; font-size: 11px; font-weight: 600; color: #2a3f8f; }
.adb-imgsize { font-size: 11px; color: #6b7280; }
.adb-img-acts { display: flex; gap: 6px; }
.adb-file {
  display: inline-block; border: 1px solid #c7d2ea; border-radius: 8px; background: #fff;
  padding: 7px 12px; font-family: inherit; font-size: 12px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}
.adb-file:disabled { color: #9aa6c4; cursor: default; }
.adb-hidden-file { display: none; }
/* label 이 아닌 칸 — 생김새는 다른 칸과 같게 */
.adb-field { display: flex; flex-direction: column; gap: 5px; }
.adb-field > small { font-size: 11.5px; font-weight: 700; color: #6b7280; }
.adb-img-del {
  border: 1px solid #f0d4d4; border-radius: 8px; background: #fff;
  padding: 7px 12px; font-family: inherit; font-size: 12px; font-weight: 700; color: #c62828; cursor: pointer;
}
.adb-thumb { flex: none; width: 44px; height: 32px; object-fit: cover; border-radius: 5px; border: 1px solid #eef1f6; }
.adb-badge {
  margin-left: 6px; font-style: normal; font-size: 10px; font-weight: 800;
  background: #2a3f8f; color: #fff; border-radius: 4px; padding: 2px 5px;
}
.adb-badge.alt { background: #e8f0ff; color: #2b6df3; }
/* 묶음 머리 — 예약 / 이벤트 상세 내용 */
.adb-sec {
  display: flex; align-items: center; gap: 10px;
  border-top: 1px solid #eef1f6; margin-top: 4px; padding-top: 14px;
}
.adb-sec.first { border-top: none; margin-top: 0; padding-top: 0; }
.adb-sec h4 { margin: 0; font-size: 13.5px; font-weight: 800; color: #111827; }
.adb-sec-note { margin-left: auto; font-size: 11px; color: #9ca3af; }
/* 어디에 낼지 — 쓰기 창 맨 위 */
.adb-where {
  display: flex; align-items: center; gap: 12px;
  background: #f7f8fb; border: 1px solid #eef1f6; border-radius: 8px; padding: 9px 12px;
}
.adb-where > small { font-size: 11.5px; font-weight: 700; color: #6b7280; }
.adb-chip {
  flex-direction: row !important; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 700; color: #374151; cursor: pointer;
}
.adb-chip input { width: 15px; height: 15px; accent-color: #2a3f8f; }
/* 두 칸을 한 줄에 */
.adb-row { display: flex; gap: 10px; }
.adb-row > label { flex: 1 1 0; min-width: 0; }
.adb-row > label.narrow { flex: 0 0 104px; }

/* 본문 꾸미기 단추 — 글칸 오른쪽 위 */
.adb-bodyhead { display: flex; align-items: center; gap: 6px; }
.adb-tools { margin-left: auto; display: flex; gap: 4px; }
.adb-tools button {
  min-width: 26px; height: 24px; padding: 0 7px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #4b5563; cursor: pointer;
}
.adb-tools button:hover { border-color: #c7d2ea; color: #2a3f8f; }
.adb-oldimg {
  display: flex; align-items: center; gap: 8px; margin: 0;
  font-size: 11.5px; color: #6b7280;
}
.adb-oldimg button {
  border: 1px solid #f0d4d4; border-radius: 6px; background: #fff;
  padding: 3px 9px; font-family: inherit; font-size: 11px; font-weight: 700; color: #c62828; cursor: pointer;
}
/* '배너' 를 끄면 배너에만 들어가는 칸들을 흐리게 둔다 */
.adb-form label.off small { color: #b6bdcc; }
.adb-txt small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px; }
.adb-check input { width: 15px; height: 15px; accent-color: #2a3f8f; }
.adb-box-foot { display: flex; gap: 8px; padding: 0 16px 16px; }
.adb-cancel, .adb-keep, .adb-save {
  flex: 1 1 0; height: 40px; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
}
.adb-cancel { border: 1px solid #e3e8f0; background: #fff; color: #4b5563; }
/* 올리지 않고 담아만 두는 자리 — 올리기와 헷갈리지 않게 테두리만 */
.adb-keep { border: 1px solid #c7d2ea; background: #fff; color: #2a3f8f; }
.adb-keep:disabled { color: #9aa6c4; cursor: default; }
.adb-save { border: none; background: #2a3f8f; color: #fff; }
.adb-save:disabled { background: #9aa6c4; cursor: default; }

.adb-toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 70;
  margin: 0; padding: 10px 16px; border-radius: 999px;
  background: rgba(17, 24, 39, .92); color: #fff; font-size: 12.5px;
}
</style>
