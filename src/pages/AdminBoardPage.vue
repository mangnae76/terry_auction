<script setup lang="ts">
// 운영 — 이벤트·공지사항·업데이트 올리기.
// 여기서 저장하면 앱의 더보기 › 공지 탭에 바로 나간다.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from '../components/BrandLogo.vue';
import DateTimeField from '../components/DateTimeField.vue';
import { useAuthStore } from '../stores/authStore';
import { OPS_MENU, opsItem } from '../services/adminMenu';
import {
  newBoardId,
  removeBoardPost,
  saveBoardPost,
  dayRangeLabel,
  eventPeriodLabel,
  scheduleState,
  subscribeBoardPosts,
  tagAt,
  titleOf,
  whenLabel,
  type BoardKind,
  type BoardPost,
} from '../services/boardRepository';

const router = useRouter();
const auth = useAuthStore();
const who = computed(() => auth.nickname || auth.email || '');

/** 이벤트 꼬리표 — 배너로 띄우든 목록에 줄로 넣든 같은 것을 쓴다 */
const EVENT_TAGS = ['안내', '진행', '마감'];

const KINDS: Array<{ key: BoardKind; label: string; hint: string; tags: string[] }> = [
  // 이벤트 글 하나로 배너와 목록을 함께 쓴다 (어디에 낼지는 글마다 고른다)
  { key: 'banner', label: '이벤트', hint: '배너로 띄우거나 공지 탭의 이벤트 목록에 줄로 넣는다', tags: EVENT_TAGS },
  { key: 'notice', label: '공지사항', hint: '점검·정책처럼 알려야 하는 것', tags: ['안내', '점검', '중요'] },
  { key: 'update', label: '업데이트', hint: '새로 붙은 기능·고친 것', tags: ['신규', '기능', '개선'] },
  { key: 'issue', label: '오류및제한', hint: '알려진 오류 · 막혀 있는 기능 · 쓰임새 제한(웹 커뮤니티 › 오류및제한 탭)', tags: ['오류', '제한', '해결'] },
];

const posts = ref<BoardPost[]>([]);
const err = ref('');
let unsub: (() => void) | null = null;
onMounted(() => {
  unsub = subscribeBoardPosts(
    (rows) => { posts.value = rows; void moveOldEvents(rows); },
    (m) => { err.value = m; },
  );
});

/**
 * 따로 쓰던 '이벤트' 글을 이벤트 배너 상자로 옮긴다.
 * 상자를 합치면서 종류를 하나로 모은 자리 — 배너로 띄우던 글은 배너 켬,
 * 줄로만 보이던 글은 목록만 켬으로 옮긴다. 한 번 옮기면 다시 할 일이 없다.
 */
let moving = false;
const moveOldEvents = async (rows: BoardPost[]) => {
  if (moving) return;
  const old = rows.filter((p) => p.kind === 'event');
  if (old.length === 0) return;
  moving = true;
  try {
    for (const p of old) {
      await saveBoardPost(
        { ...p, kind: 'banner', showBanner: !!p.banner, alsoEvent: true, banner: false },
        { touch: false },
      );
    }
  } catch (e) {
    console.warn('[board] 옛 이벤트 글을 옮기지 못했습니다', e);
  } finally {
    moving = false;
  }
};
onUnmounted(() => { if (unsub) unsub(); });

/* ───────── 왼쪽 메뉴 ───────── */

const menu = ref('banner');
const KIND_KEYS: BoardKind[] = ['banner', 'notice', 'update', 'issue'];
/** 고른 메뉴가 글 상자면 그 종류, 아니면 아직 만들지 않은 칸 */
const menuKind = computed(() =>
  (KIND_KEYS as string[]).includes(menu.value) ? (menu.value as BoardKind) : null);
const menuItem = computed(() => opsItem(menu.value));

const listOf = (kind: BoardKind) => computed(() => posts.value.filter((p) => p.kind === kind));

/* ───────── 쓰기 ───────── */

const emptyPost = (kind: BoardKind): BoardPost => ({
  id: newBoardId(),
  kind,
  // 배너가 이벤트 줄까지 겸할 때를 미리 채워 둔다
  tag: kind === 'banner' ? '안내' : (KINDS.find((k) => k.key === kind)?.tags[0] ?? ''),
  title: '',
  body: '',
  imageUrl: '',
  published: false,
  postedAt: '',
  showBanner: kind === 'banner',
  alsoEvent: kind === 'banner',
  tagPlan: [],
  tagManual: false,
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

/* 글 종류마다 쓰는 칸이 다르다 — 한 틀에서 갈라 쓴다 */
const kindLabel = computed(() => KINDS.find((k) => k.key === draft.value?.kind)?.label ?? '');
/** 이벤트 꼬리표는 배너도 함께 쓴다 */
const tagList = computed(() =>
  draft.value?.kind === 'banner' ? EVENT_TAGS : (KINDS.find((k) => k.key === draft.value?.kind)?.tags ?? []));
/** 내릴 때 — 공지사항·업데이트는 한번 올리면 기록으로 남는다 */
const hasEnd = computed(() => draft.value?.kind === 'banner');
/** 꼬리말 예약·이벤트 기간 — 이벤트에만 */
const hasTagPlan = computed(() => hasEnd.value);
const hasPeriod = computed(() => hasEnd.value);
/** 기간 글을 비워 두면 배너에 대신 나갈 글 */
const autoPeriod = computed(() => {
  const d = draft.value;
  if (!d) return '';
  // 배너는 날짜까지만 — 시각은 상세 보기의 '기간 :' 줄에서 본다
  return dayRangeLabel(d.eventStartAt, d.eventEndAt) || dayRangeLabel(d.startAt, d.endAt);
});
const openNew = (kind: BoardKind) => { draft.value = emptyPost(kind); };
const openEdit = (p: BoardPost) => { draft.value = { ...p, title: titleOf(p) }; };
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

/* ───────── 꼬리말 예약 — 안내 → 진행 → 마감 ───────── */

const planAt = (tag: string): string =>
  (draft.value?.tagPlan ?? []).find((x) => x.tag === tag)?.at ?? '';

const setPlan = (tag: string, at: string) => {
  const d = draft.value;
  if (!d) return;
  const plan = (d.tagPlan ?? []).filter((x) => x.tag !== tag);
  if (at) plan.push({ tag, at });
  // 차례대로 흐르도록 때 순서로 담아 둔다
  d.tagPlan = plan.sort((a, b) => (a.at < b.at ? -1 : 1));
  onDateChange();
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
      <!-- 왼쪽 메뉴 — 아직 만들지 않은 칸도 자리를 잡아 둔다 -->
      <nav class="ops-menu">
        <div v-for="g in OPS_MENU" :key="g.title" class="ops-group">
          <h3>{{ g.title }}</h3>
          <button
            v-for="it in g.items"
            :key="it.key"
            type="button"
            :class="['ops-item', { on: menu === it.key, soon: !it.ready }]"
            @click="menu = it.key"
          >
            {{ it.label }}
            <em v-if="!it.ready">준비 중</em>
          </button>
        </div>
      </nav>

      <div class="ops-main">
      <div class="adm-head">
        <h1>{{ menuItem?.label ?? '운영' }}</h1>
        <p>{{ menuItem?.desc }}</p>
      </div>

      <p v-if="err && menuKind" class="adb-err">
        {{ err }}
        <template v-if="/permission|insufficient/i.test(err)"> — 지금 계정 {{ auth.email || '(로그인 안 됨)' }}</template>
      </p>

      <!-- 아직 만들지 않은 칸 -->
      <section v-if="!menuKind" class="adb-card ops-soon">
        <h2>준비 중입니다</h2>
        <p>{{ menuItem?.desc }}</p>
        <p v-if="menuItem?.need" class="ops-need">먼저 있어야 하는 것 — {{ menuItem.need }}</p>
      </section>

      <section v-for="k in KINDS.filter((x) => x.key === menuKind)" :key="k.key" class="adb-card">
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
              {{ p.kind === 'banner' ? (p.badge || 'EVENT') : (p.star ? '✦' : (tagAt(p) || '—')) }}
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
    </div>

    <!-- 쓰기 창 -->
    <div v-if="draft" class="adb-modal" @mousedown.self="downOnBack = true" @mouseup="onBackUp">
      <div class="adb-box">
        <header class="adb-box-head">
          <strong>{{ KINDS.find((k) => k.key === draft!.kind)?.label }}</strong>
          <!-- 어디에 낼지 — 글 전체에 걸리는 값이라 제목 옆에 둔다 -->
          <span v-if="draft.kind === 'banner'" class="adb-where">
            <label class="adb-chip"><input v-model="draft.showBanner" type="checkbox" /> 배너</label>
            <label class="adb-chip"><input v-model="draft.alsoEvent" type="checkbox" /> 목록</label>
          </span>
          <button type="button" class="adb-x" aria-label="닫기" @click="close">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="adb-form">
          <!-- 언제 올리고 내릴지 -->
          <div class="adb-sec first">
            <h4>{{ kindLabel }} 예약 기능</h4>
          </div>
          <div class="adb-when-row">
            <div class="adb-field">
              <small>올릴 때 <em>(비우면 바로)</em></small>
              <DateTimeField v-model="draft.startAt" @update:model-value="onDateChange" />
            </div>
            <div v-if="hasEnd" class="adb-field">
              <small>내릴 때 <em>(비우면 계속)</em></small>
              <DateTimeField v-model="draft.endAt" @update:model-value="onDateChange" />
            </div>
          </div>
          <p class="adb-note">
            {{ hasEnd ? '예약한 때가 되면 앱에서 저절로 올라오고 내려갑니다.' : '예약한 때가 되면 앱에 저절로 올라갑니다.' }}
          </p>

          <!-- 꼬리말 예약 — 이벤트에만 (때맞춰 안내 → 진행 → 마감) -->
          <template v-if="hasTagPlan">
            <div class="adb-sec">
              <h4>꼬리말 예약 기능</h4>
              <label class="adb-chip"><input v-model="draft.tagManual" type="checkbox" /> 수동</label>
              <span class="adb-tags sec">
                <button
                  v-for="t in tagList"
                  :key="t"
                  type="button"
                  :class="['adb-tagbtn', { on: draft!.tag === t, off: !draft!.tagManual }]"
                  :disabled="!draft.tagManual"
                  @click="draft!.tag = t"
                >{{ t }}</button>
              </span>
            </div>
            <div class="adb-when-row">
              <div v-for="t in tagList" :key="`plan-${t}`" class="adb-field" :class="{ off: draft.tagManual }">
                <small>{{ t }}</small>
                <DateTimeField
                  :model-value="planAt(t)"
                  :disabled="draft.tagManual"
                  @update:model-value="(v: string) => setPlan(t, v)"
                />
              </div>
            </div>
            <p class="adb-note">
              지금 나가는 꼬리말 — <b>{{ tagAt(draft) }}</b>
              <template v-if="!draft.tagManual && !(draft.tagPlan ?? []).length">
                (적어 둔 때가 없습니다)
              </template>
            </p>
          </template>

          <!-- 여기서부터가 목록·상세에 나가는 내용이다 -->
          <div class="adb-sec">
            <h4>{{ kindLabel }} 상세 내용</h4>
            <span v-if="!hasTagPlan" class="adb-tags sec">
              <button
                v-for="t in tagList"
                :key="t"
                type="button"
                :class="['adb-tagbtn', { on: draft!.tag === t }]"
                @click="draft!.tag = t"
              >{{ t }}</button>
            </span>
          </div>

          <label>
            <small>제목 <em v-if="draft.kind === 'banner'">(배너·목록이 함께 씁니다)</em></small>
            <input v-model="draft.title" class="adb-input" placeholder="목록에 적히는 한 줄" />
          </label>

          <!-- 배너 칸에만 나가는 것들 -->
          <template v-if="draft.kind === 'banner'">
            <label :class="{ off: !draft.showBanner }">
              <small>단축 글 <em>(배너 칸에 한 줄로 들어갑니다)</em></small>
              <input
                v-model="draft.desc"
                class="adb-input"
                :disabled="!draft.showBanner"
                placeholder="기간을 길게 고를수록 더 깎입니다"
              />
            </label>
            <div class="adb-row">
              <label class="narrow" :class="{ off: !draft.showBanner }">
                <small>배지</small>
                <input v-model="draft.badge" class="adb-input" :disabled="!draft.showBanner" placeholder="EVENT" />
              </label>
              <label :class="{ off: !draft.showBanner }">
                <small>기간 글 <em>(비워 두세요)</em></small>
                <input
                  v-model="draft.period"
                  class="adb-input"
                  :disabled="!draft.showBanner"
                  placeholder="비우면 이벤트 기간 (예: 상시)"
                />
              </label>
              <!-- 단추 글은 '자세히 보기' 로 고정이다 — 고를 일이 없으니 잠가 둔다 -->
              <label class="narrow off">
                <small>단추 글 <em>(고정)</em></small>
                <input class="adb-input" value="자세히 보기" disabled />
              </label>
            </div>
            <p v-if="draft.showBanner && !draft.period && autoPeriod" class="adb-note">
              비워 두어 배너에는 <b>{{ autoPeriod }}</b> 이(가) 나갑니다.
            </p>
          </template>

          <!-- 이벤트가 열리는 때 — 상세 보기의 '기간 :' 줄이 된다 -->
          <template v-if="hasPeriod">
            <div class="adb-when-row">
              <div class="adb-field">
                <small>이벤트 시작</small>
                <DateTimeField v-model="draft.eventStartAt" @update:model-value="onDateChange" />
              </div>
              <div class="adb-field">
                <small>이벤트 끝</small>
                <DateTimeField v-model="draft.eventEndAt" @update:model-value="onDateChange" />
              </div>
            </div>
            <p v-if="eventPeriodLabel(draft.eventStartAt, draft.eventEndAt)" class="adb-note">
              상세에 나갈 글 — 기간 : {{ eventPeriodLabel(draft.eventStartAt, draft.eventEndAt) }}
            </p>
          </template>

          <label>
            <small>본문 <em>(상세 보기에 펼쳐지는 글)</em></small>
            <textarea
              v-model="draft.body"
              class="adb-area"
              rows="18"
              :placeholder="draft.kind === 'notice' ? '알릴 내용을 적습니다' : '조건·기간·주의할 점을 적습니다'"
            ></textarea>
          </label>

          <label v-if="draft.kind === 'notice'" class="adb-check">
            <input v-model="draft.star" type="checkbox" />
            맨 위에 붙박이로 둔다 (✦)
          </label>

          <p v-if="draft.imageUrl" class="adb-oldimg">
            전에 올린 그림이 남아 있습니다
            <button type="button" @click="draft!.imageUrl = ''">빼기</button>
          </p>

          <p class="adb-note">등록 시각은 올릴 때 저절로 찍혀 상세 보기에 함께 나갑니다.</p>
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

.adm-body {
  max-width: 1200px; margin: 0 auto; padding: 28px 24px 60px;
  display: flex; align-items: flex-start; gap: 24px;
}
/* 왼쪽 메뉴 */
.ops-menu { flex: 0 0 206px; position: sticky; top: 76px; }
.ops-group + .ops-group { margin-top: 16px; }
.ops-group h3 {
  margin: 0 0 6px; padding-left: 10px;
  font-size: 11px; font-weight: 800; color: #9ca3af; letter-spacing: .3px;
}
.ops-item {
  display: flex; align-items: center; gap: 6px; width: 100%;
  border: none; border-radius: 8px; background: transparent;
  padding: 8px 10px; margin-bottom: 1px; text-align: left;
  font-family: inherit; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer;
}
.ops-item:hover { background: #eef1f8; }
.ops-item.on { background: #2a3f8f; color: #fff; }
.ops-item.soon { color: #9ca3af; font-weight: 500; }
.ops-item em {
  margin-left: auto; font-style: normal; font-size: 9.5px; font-weight: 700;
  color: #b6bdcc; border: 1px solid #e3e8f0; border-radius: 4px; padding: 1px 4px;
}
.ops-item.on em { color: #ffffffcc; border-color: #ffffff4d; }
.ops-main { flex: 1 1 auto; min-width: 0; }
.ops-soon h2 { margin: 0 0 8px; font-size: 16px; font-weight: 800; color: #111827; }
.ops-soon p { margin: 0; font-size: 13px; color: #6b7280; }
.ops-need { margin-top: 8px !important; color: #2a3f8f !important; font-weight: 700; }
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
.adb-when-row > .adb-field { flex: 1 1 0; min-width: 0; }
.adb-note { margin: -4px 0 0; font-size: 11px; color: #9ca3af; }

/* 쓰기 창 */
.adb-modal {
  position: fixed; inset: 0; z-index: 60; background: rgba(17, 24, 39, .45);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.adb-box {
  width: 100%; max-width: 620px; max-height: 92vh;
  display: flex; flex-direction: column;
  background: #fff; border-radius: 12px; overflow: hidden;
}
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
.adb-form {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
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
.adb-tagbtn.off { opacity: .45; cursor: default; }
.adb-field.off > small { color: #b6bdcc; }
.adb-check { flex-direction: row !important; align-items: center; gap: 7px; font-size: 12.5px; color: #374151; }
.adb-form em { font-style: normal; font-weight: 400; color: #9ca3af; }
.adb-area {
  width: 100%; box-sizing: border-box; min-height: 280px; border: 1px solid #e3e8f0; border-radius: 8px;
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
/* 배너로 나간다는 표 — 눈에 먼저 들어와야 한다 */
.adb-badge {
  margin-left: 6px; font-style: normal; font-size: 10px; font-weight: 800;
  background: #ef4444; color: #fff; border-radius: 4px; padding: 2px 5px;
}
/* 목록 표 — 빛깔만 다르고 크기·굵기는 배너와 똑같이 */
.adb-badge.alt { background: #2a3f8f; color: #fff; }
/* 묶음 머리 — 예약 / 이벤트 상세 내용 */
.adb-sec {
  display: flex; align-items: center; gap: 10px;
  border-top: 1px solid #dde3ee; margin-top: 6px; padding-top: 16px;
}
.adb-sec.first { border-top: none; margin-top: 0; padding-top: 0; }
.adb-sec h4 { margin: 0; font-size: 13.5px; font-weight: 800; color: #111827; }
.adb-sec-note { margin-left: auto; font-size: 11px; color: #9ca3af; }
/* 어디에 낼지 — 쓰기 창 제목 옆 */
.adb-where { display: flex; align-items: center; gap: 12px; margin-left: 14px; }
.adb-tags.sec { margin-left: auto; }
/* 네모칸과 글자가 한 줄에 가운데로 — 머리글에서는 .adb-form label 규칙이 닿지 않는다 */
.adb-chip {
  display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 6px; line-height: 1;
  font-size: 12.5px; font-weight: 700; color: #374151; cursor: pointer;
}
.adb-chip input { width: 15px; height: 15px; margin: 0; accent-color: #2a3f8f; display: block; }
/* 두 칸을 한 줄에 */
.adb-row { display: flex; gap: 10px; }
.adb-row > label { flex: 1 1 0; min-width: 0; }
.adb-row > label.narrow { flex: 0 0 104px; }

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
