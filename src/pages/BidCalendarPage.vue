<script setup lang="ts">
// 입찰 캘린더 — 선정해 둔 물건의 입찰일을 달력에 펼쳐 본다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { isPhotoId, loadSitePhoto } from '../services/sitePhotoRepository';
import type { AuctionDetail } from '../types/auction';
import { stageLabelOf, stageToneOf } from '../utils/stageLabel';

const store = useAuctionStore();
const router = useRouter();

const today = new Date();
const year = ref(today.getFullYear());
const month = ref(today.getMonth() + 1); // 1~12

const moveMonth = (step: number) => {
  const d = new Date(year.value, month.value - 1 + step, 1);
  year.value = d.getFullYear();
  month.value = d.getMonth() + 1;
};

const p2 = (n: number) => String(n).padStart(2, '0');
const todayKey = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
const keyOf = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;

/** 양력으로 날짜가 고정된 공휴일 — 음력(설·추석·부처님오신날)은 해마다 달라 넣지 않았다 */
const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
};
/** 대체공휴일이 적용되는 날 (현충일·신정·성탄절은 제외) */
const SUBSTITUTE = new Set(['03-01', '05-05', '08-15', '10-03', '10-09']);

/** 그 해의 공휴일 지도 — 토·일에 겹치면 다음 평일을 대체 휴일로 더한다 */
const holidayMap = computed(() => {
  const map: Record<string, string> = {};
  Object.entries(FIXED_HOLIDAYS).forEach(([md, name]) => {
    const [m, d] = md.split('-').map(Number);
    const date = new Date(year.value, m - 1, d);
    map[keyOf(year.value, m, d)] = name;
    if (!SUBSTITUTE.has(md)) return;
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) return;
    const next = new Date(date);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() === 0 || next.getDay() === 6 || map[keyOf(next.getFullYear(), next.getMonth() + 1, next.getDate())]);
    map[keyOf(next.getFullYear(), next.getMonth() + 1, next.getDate())] = '대체 휴일';
  });
  return map;
});

/** 입찰일(eventDate)을 YYYY-MM-DD로 맞춘다 */
const dateKeyOf = (raw?: string) => {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
};

/**
 * 달력 한 칸에 서는 줄.
 * 물건 하나가 여러 날에 걸린다 — 매각기일에 한 번, 낙찰일·잔금기한·매도일에 또 한 번.
 * 어떤 날인지(kind)를 같이 들고 다녀야 칸마다 알맞은 딱지를 붙일 수 있다.
 */
type CalKind = 'bid' | 'won' | 'balance' | 'sell';
type CalItem = { a: AuctionDetail; kind: CalKind };

/** 잔금 기한을 적어 두지 않았으면 낙찰일 + 45일로 본다 (알림과 같은 셈) */
const BALANCE_DUE_DAYS = 45;
const addDays = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number);
  if (!y) return '';
  const t = new Date(y, m - 1, d + days);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
};

const byDate = computed(() => {
  const map: Record<string, CalItem[]> = {};
  const put = (key: string, a: AuctionDetail, kind: CalKind) => {
    if (!key) return;
    (map[key] ??= []).push({ a, kind });
  };
  store.auctions.forEach((a) => {
    put(dateKeyOf(a.eventDate), a, 'bid');
    const won = dateKeyOf(a.wonDate);
    put(won, a, 'won');
    // 잔금 기한은 적어 둔 값이 먼저, 없으면 낙찰일에서 셈한다
    put(dateKeyOf(a.balanceDueDate) || (won ? addDays(won, BALANCE_DUE_DAYS) : ''), a, 'balance');
    put(dateKeyOf(a.sellDate), a, 'sell');
  });
  return map;
});

/** 칸에 붙일 딱지 — 매각기일에는 단계를, 나머지 날에는 그 날이 무엇인지 적는다 */
const KIND_TAG: Record<Exclude<CalKind, 'bid'>, { label: string; tone: string }> = {
  won: { label: '낙찰일', tone: 'won' },
  balance: { label: '잔금기한', tone: 'due' },
  sell: { label: '매도일', tone: 'sold' },
};
const tagOf = (it: CalItem) => (it.kind === 'bid'
  ? { label: stageLabelOf(it.a), tone: stageToneOf(it.a) }
  : KIND_TAG[it.kind]);

type Cell = { key: string; day: number; inMonth: boolean; dow: number };
const cells = computed<Cell[]>(() => {
  const first = new Date(year.value, month.value - 1, 1);
  const lead = first.getDay();
  const out: Cell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year.value, month.value - 1, 1 - lead + i);
    out.push({
      key: keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() + 1 === month.value,
      dow: d.getDay(),
    });
  }
  // 마지막 주가 통째로 다음 달이면 잘라 낸다
  return out.slice(0, out[35].inMonth || out.slice(35).some((c) => c.inMonth) ? 42 : 35);
});

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const money = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '-');

/** '인천광역시 서구 검암동 …' → '인천, 검암동' */
const areaTag = (a: AuctionDetail) => {
  const parts = (a.address ?? '').trim().split(/\s+/);
  if (parts.length === 0) return '';
  const city = parts[0].replace(/(특별자치시|특별자치도|광역시|특별시|자치시|자치도|시|도)$/, '') || parts[0];
  const dong = parts.find((v) => /[동읍면리]$/.test(v) && !/^\d/.test(v)) ?? parts[1] ?? '';
  return dong ? `${city}, ${dong}` : city;
};

const roundText = (a: AuctionDetail) => {
  const round = (a.auctionRound ?? '').trim();
  return [a.propertyType, round ? `유찰 ${round}` : ''].filter(Boolean).join(' ');
};

/** 사건번호를 짧게 — '2025타경00001' → '2025-00001'. 달력 칸이 좁아 '타경'은 뺀다 */
const caseShort = (a: AuctionDetail) => {
  const raw = (a.caseNumber ?? '').trim();
  const m = raw.match(/(\d{4})\s*타경\s*(\d+)/);
  return m ? `${m[1]}-${m[2]}` : raw;
};
/** 유찰 횟수 — 차수에서 하나를 뺀다 ('3차'면 두 번 유찰됐다). 신건은 아직 0번이다 */
const failText = (a: AuctionDetail) => {
  const n = Number((a.auctionRound ?? '').match(/(\d+)\s*차/)?.[1] ?? 0);
  return n > 1 ? `유찰 ${n - 1}회` : '신건';
};

/** 본건사진의 첫 장 — 전경이 먼저고, 없으면 평면도. 물건상세의 '본건사진'과 같은 차례다 */
const firstPhotoOf = (a: AuctionDetail): string => (
  a.exteriorUrls?.[0] ?? a.floorPlanUrls?.[0] ?? a.floorPlanUrl ?? ''
);
/** 사진 말풍선 — 달력 칸에는 글자만 적고, 손을 올리면 그 물건의 첫 사진을 띄운다.
 *  사진은 올릴 때 한 번만 읽어 둔다 (문서로 저장된 사진은 아이디라 따로 불러와야 한다) */
const photoCache = ref<Record<string, string>>({});
const tip = ref<{ src: string; left: number; top: number } | null>(null);
const showPhotoTip = async (a: AuctionDetail, evt: MouseEvent) => {
  const entry = firstPhotoOf(a);
  if (!entry) return;
  let src = photoCache.value[entry];
  if (src === undefined) {
    src = isPhotoId(entry) ? await loadSitePhoto(entry).catch(() => '') : entry;
    photoCache.value[entry] = src;
  }
  if (!src) return;
  const box = (evt.currentTarget as HTMLElement).getBoundingClientRect();
  // 칸 오른쪽에 붙이되 화면을 넘으면 왼쪽으로 돌린다
  const w = 190;
  const left = Math.min(box.right + 8, window.innerWidth - w - 8);
  tip.value = { src, left: Math.max(8, left), top: Math.max(8, box.top) };
};
const hidePhotoTip = () => { tip.value = null; };

/** 좁은 화면(앱)에서는 칸에 한 건만 두고 나머지는 접는다 — 칸이 작아 서너 건이면 넘친다 */
const compact = ref(true);
const syncCompact = () => {
  const wide = typeof window !== 'undefined'
    && document.documentElement.classList.contains('is-web')
    && window.matchMedia('(min-width: 768px)').matches;
  compact.value = !wide;
};
if (typeof window !== 'undefined') {
  syncCompact();
  window.addEventListener('resize', syncCompact);
}
/** 펼쳐 둔 날짜 — 그 칸만 길어지며 전부 보여 준다 */
const opened = ref<Record<string, boolean>>({});
const toggleDay = (key: string) => { opened.value = { ...opened.value, [key]: !opened.value[key] }; };

/** 지금 접혀서 가려진 건수 — 단추에 숫자로 적는다 */
const foldedCount = computed(() => Object.entries(byDate.value)
  .reduce((n, [key, list]) => (list.length > 1 && !opened.value[key] ? n + list.length - 1 : n), 0));
const anyFolded = computed(() => foldedCount.value > 0);
/** 펴 둔 날이 있는가 — 접기 단추를 보일지 가린다 */
const anyOpened = computed(() => Object.entries(byDate.value)
  .some(([key, list]) => list.length > 1 && opened.value[key]));
/** 다 보기 / 접기 — 물건이 둘 이상인 날을 한꺼번에 펴고 접는다 */
const toggleAllDays = () => {
  if (anyFolded.value) {
    const next: Record<string, boolean> = {};
    Object.keys(byDate.value).forEach((key) => { next[key] = true; });
    opened.value = next;
    return;
  }
  opened.value = {};
};
/** 그 칸에 그릴 물건 — 접혀 있으면 첫 건만 */
const shownOf = (key: string) => {
  const list = byDate.value[key] ?? [];
  if (!compact.value || opened.value[key] || list.length <= 1) return list;
  return list.slice(0, 1);
};
/** 접혀서 가려진 건수 */
const hiddenOf = (key: string) => {
  const list = byDate.value[key] ?? [];
  if (!compact.value || opened.value[key]) return 0;
  return Math.max(0, list.length - 1);
};

/**
 * 이 달의 단계별 현황 — 달력 위에 '임장완료 3건' 처럼 적는다.
 * 달력에 뿌리는 것과 같은 물건을 세므로 칸을 일일이 세어 볼 일이 없다.
 */
const monthTally = computed(() => {
  const head = `${year.value}-${String(month.value).padStart(2, '0')}`;
  const seen = new Map<string, { label: string; tone: string; count: number }>();
  Object.entries(byDate.value).forEach(([key, list]) => {
    if (!key.startsWith(head)) return;
    list.forEach((it) => {
      const { label, tone } = tagOf(it);
      const row = seen.get(label) ?? { label, tone, count: 0 };
      row.count += 1;
      seen.set(label, row);
    });
  });
  // 늘 같은 차례로 — 손품에서 매도까지 흐르는 순서, 그 뒤에 날짜 딱지
  const ORDER = ['손품조사', '임장예정', '임장완료', '입찰산정', '입찰진행',
    '낙찰', '유찰', '취소', '매도', '낙찰일', '잔금기한', '매도일'];
  return [...seen.values()].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
});
const monthTotal = computed(() => monthTally.value.reduce((n, r) => n + r.count, 0));

/**
 * 표시 항목 — 칸에 무엇까지 적을지 고른다.
 * 달력 칸은 좁아 사람마다 보고 싶은 것이 다르다. 고른 값은 이 기기에 적어 둔다.
 */
const SHOW_KEY = 'myturn.calendar.show';
type ShowKeys = 'addr' | 'money' | 'cat' | 'star';
const SHOW_LABELS: Array<{ key: ShowKeys; label: string }> = [
  { key: 'addr', label: '소재지' },
  { key: 'cat', label: '분류' },
  { key: 'star', label: '중요도' },
];
const loadShow = (): Record<ShowKeys, boolean> => {
  const base = { addr: true, money: true, cat: true, star: true };
  try {
    const raw = localStorage.getItem(SHOW_KEY);
    // 감정·최저는 고르는 항목이 아니다 — 늘 켜 둔다 (좁아지면 CSS 가 감춘다)
    return raw ? { ...base, ...(JSON.parse(raw) as Record<ShowKeys, boolean>), money: true } : base;
  } catch {
    return base;
  }
};
const show = ref(loadShow());
const toggleShow = (key: ShowKeys) => {
  show.value = { ...show.value, [key]: !show.value[key] };
  try { localStorage.setItem(SHOW_KEY, JSON.stringify(show.value)); } catch { /* 못 적어도 그만 */ }
};

/** 달력으로 볼지 목록으로 볼지 — 달력은 한눈에, 목록은 날짜 차례로 훑기 좋다 */
const view = ref<'cal' | 'list'>('cal');

/** 이 달의 날짜별 묶음 — 날짜 차례로, 그날 줄도 차례로 */
const monthDays = computed(() => {
  const head = `${year.value}-${String(month.value).padStart(2, '0')}`;
  return Object.keys(byDate.value)
    .filter((key) => key.startsWith(head))
    .sort()
    .map((key) => ({ key, list: byDate.value[key] }));
});

/** '11월 12일 (목)' */
const dayTitle = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
};

const goDetail = (id: string) => router.push(`/auctions/${id}`);
</script>

<template>
  <section class="cal-shell">
    <header class="cal-header">
      <button type="button" class="pg-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="cal-title">입찰 캘린더</h1>
      <span class="cal-eyebrow">AUCTION CALENDAR</span>
    </header>

    <div class="cal-card">
      <div class="cal-nav">
        <span class="cal-view">
          <button type="button" :class="['cal-view-btn', { on: view === 'cal' }]" @click="view = 'cal'">달력</button>
          <button type="button" :class="['cal-view-btn', { on: view === 'list' }]" @click="view = 'list'">목록</button>
        </span>
        <button type="button" class="cal-nav-btn" aria-label="이전 달" @click="moveMonth(-1)">‹</button>
        <strong>{{ year }}년 {{ month }}월</strong>
        <button type="button" class="cal-nav-btn" aria-label="다음 달" @click="moveMonth(1)">›</button>
        <!-- 한 칸씩 누르지 않고 한 번에 — 두 건 이상인 날을 모두 편다 -->
        <button
          v-if="view === 'cal' && compact && (anyFolded || anyOpened)"
          type="button"
          class="cal-openall"
          @click="toggleAllDays"
        >{{ anyFolded ? `다 보기 ${foldedCount}` : '접기' }}</button>
      </div>

      <!-- 이 달의 현황 — 단계별로 몇 건인지 달력 위에 적어 둔다 -->
      <div v-if="monthTotal" class="cal-tally">
        <span class="cal-tally-all">이달 {{ monthTotal }}건</span>
        <span v-for="r in monthTally" :key="r.label" :class="['cal-tally-chip', r.tone]">
          {{ r.label }} <b>{{ r.count }}</b>
        </span>
        <!-- 칸에 무엇까지 적을지 — 셋뿐이라 숨기지 않고 오른쪽에 늘어놓는다 -->
        <span class="cal-show">
          <label v-for="o in SHOW_LABELS" :key="o.key" class="cal-show-item">
            <input type="checkbox" :checked="show[o.key]" @change="toggleShow(o.key)" />
            {{ o.label }}
          </label>
        </span>
      </div>

      <div v-if="view === 'cal'" class="cal-grid cal-head">
        <span v-for="(w, i) in WEEKDAYS" :key="w" :class="['cal-dow', { sun: i === 0, sat: i === 6 }]">{{ w }}</span>
      </div>

      <div v-if="view === 'cal'" class="cal-grid cal-body">
        <div v-for="c in cells" :key="c.key" :class="['cal-cell', { out: !c.inMonth }]">
          <p class="cal-daynum">
            <span :class="['cal-dnum', { sun: c.dow === 0 || holidayMap[c.key], sat: c.dow === 6 && !holidayMap[c.key], today: c.key === todayKey }]">{{ c.day }}</span>
            <em v-if="holidayMap[c.key]" class="cal-holiday">{{ holidayMap[c.key] }}</em>
            <!-- 그날 몇 건인지 — 날짜에 붙으면 같이 읽히니 칸 가운데에 띄워 둔다 -->
            <em v-if="byDate[c.key]" class="cal-count">{{ byDate[c.key].length }}건</em>
          </p>
          <article
            v-for="it in shownOf(c.key)"
            :key="`${it.a.id}-${it.kind}`"
            class="cal-event"
            @click="goDetail(it.a.id)"
            @mouseenter="showPhotoTip(it.a, $event)"
            @mouseleave="hidePhotoTip()"
          >
            <p :class="['ev-stage', tagOf(it).tone]">{{ tagOf(it).label }}</p>
            <p v-if="show.star && (it.a.priority ?? 0) > 0" class="ev-star">{{ '★'.repeat(it.a.priority ?? 0) }}</p>
            <p class="ev-case">{{ caseShort(it.a) }}</p>
            <p :class="['ev-fail', { fresh: failText(it.a) === '신건' }]">{{ failText(it.a) }}</p>
            <p v-if="show.addr" class="ev-addr">{{ it.a.address }}</p>
            <p class="ev-kind">{{ roundText(it.a) }}</p>
            <p v-if="show.money" class="ev-price">감정: {{ money(it.a.metrics?.appraisalValue ?? 0) }}</p>
            <p v-if="show.money" class="ev-price">최저: {{ money(it.a.metrics?.minimumBidValue ?? 0) }}</p>
            <p v-if="show.cat" class="ev-area">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>{{ areaTag(it.a) }}
            </p>
          </article>
          <!-- 남은 건수 — 누르면 그 칸이 길어지며 모두 보인다 -->
          <button
            v-if="hiddenOf(c.key) > 0"
            type="button"
            class="cal-more"
            @click.stop="toggleDay(c.key)"
          >＋{{ hiddenOf(c.key) }}건</button>
          <button
            v-else-if="compact && opened[c.key] && (byDate[c.key]?.length ?? 0) > 1"
            type="button"
            class="cal-more fold"
            @click.stop="toggleDay(c.key)"
          >접기</button>
        </div>
      </div>

      <!-- 목록 보기 — 날짜 차례로 쭉 훑는다 -->
      <div v-if="view === 'list'" class="cal-list">
        <p v-if="monthDays.length === 0" class="cal-list-none">이 달에 잡힌 날짜가 없습니다.</p>
        <section v-for="d in monthDays" :key="d.key" class="cal-list-day">
          <header class="cal-list-head">
            <strong :class="{ today: d.key === todayKey }">{{ dayTitle(d.key) }}</strong>
            <em v-if="holidayMap[d.key]" class="cal-list-holiday">{{ holidayMap[d.key] }}</em>
            <span class="cal-list-count">{{ d.list.length }}건</span>
          </header>
          <button
            v-for="it in d.list"
            :key="`${it.a.id}-${it.kind}`"
            type="button"
            class="cal-list-row"
            @click="goDetail(it.a.id)"
          >
            <span :class="['cal-list-tag', tagOf(it).tone]">{{ tagOf(it).label }}</span>
            <span class="cal-list-main">
              <b>
                <em v-if="show.star && (it.a.priority ?? 0) > 0" class="star">{{ '★'.repeat(it.a.priority ?? 0) }}</em>
                {{ it.a.caseNumber || '사건번호 없음' }}<em class="fail">{{ failText(it.a) }}</em>
              </b>
              <small v-if="show.addr">{{ it.a.address || '주소 없음' }}</small>
              <small v-if="show.cat" class="cat">{{ areaTag(it.a) }}</small>
              <small v-if="show.money" class="won">감정 {{ money(it.a.metrics?.appraisalValue ?? 0) }} · 최저 {{ money(it.a.metrics?.minimumBidValue ?? 0) }}</small>
            </span>
            <span class="cal-list-arrow">›</span>
          </button>
        </section>
      </div>
    </div>

    <!-- 사진 말풍선 — 달력 위에 떠 있어야 해서 글(body) 쪽에 그린다 -->
    <Teleport to="body">
      <div v-if="tip" class="cal-tip" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
        <img :src="tip.src" alt="본건사진" />
      </div>
    </Teleport>

    <AppMobileBottomNav active="watchlist" />
  </section>
</template>

<style scoped>
.pg-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 4px 0 0; align-self: center;
}
.cal-shell {
  min-height: 100vh;
  background: #f4f6fb;
  padding-bottom: 86px;
}
.cal-header {
  padding: 16px 14px 8px;
  display: flex; align-items: baseline; gap: 8px;
}
.cal-title { margin: 0; flex: 0 0 auto; font-size: 20px; font-weight: 800; color: #111827; }
.cal-eyebrow {
  min-width: 0; font-size: 9.5px; font-weight: 400; color: #2b6df3; letter-spacing: 0.2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.cal-card {
  margin: 0 14px; background: #fff;
  border: 1px solid #e8ebf1; border-radius: 14px; overflow: hidden;
}
.cal-nav {
  position: relative;
  display: flex; align-items: center; justify-content: center; gap: 20px;
  padding: 12px 0; border-bottom: 1px solid #eef0f5;
}
.cal-nav strong { font-size: 15.3px; font-weight: 800; color: #111827; }
.cal-nav-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 17px; color: #6b7280; line-height: 1; padding: 2px 6px;
}

.cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.cal-head { border-bottom: 1px solid #eef0f5; }
.cal-dow {
  padding: 7px 0; text-align: center;
  font-size: 11px; font-weight: 700; color: #4b5563;
}
.cal-dow.sun { color: #dc2626; }
.cal-dow.sat { color: #2b6df3; }

.cal-cell {
  min-height: 62px; min-width: 0; height: auto;
  padding: 4px 3px 6px;
  border-right: 1px solid #f1f3f7; border-bottom: 1px solid #f1f3f7;
}
.cal-cell:nth-child(7n) { border-right: none; }
.cal-cell.out { background: #fcfcfd; }
.cal-cell.out .cal-daynum { visibility: hidden; }
.cal-daynum {
  position: relative;
  margin: 0 0 3px; display: flex; align-items: center; gap: 3px; min-height: 18px;
  font-size: 11px; font-weight: 700; color: #111827;
}
/* 오늘 — 숫자를 정확히 가운데 둔 파란 동그라미 */
.cal-dnum.today {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: 18px; height: 18px; padding: 0;
  line-height: 1; border-radius: 50%;
  background: #2a5fbf; color: #fff !important;
}
.cal-daynum .sun { color: #dc2626; }
.cal-daynum .sat { color: #2b6df3; }
.cal-holiday {
  font-style: normal; font-size: 8px; font-weight: 600; color: #dc2626;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 입찰 건수 — 날짜에 붙으면 같이 읽히니 칸의 한가운데에 띄워 둔다 (가로·세로 모두) */
.cal-count {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  font-style: normal; font-size: 11px; font-weight: 800; color: #dc2626; line-height: 1;
}
/* 중요도 별 — 사건번호 위에 작게 */
.cal-event .ev-star {
  font-size: 9px !important; line-height: 1.2; color: #eab308; letter-spacing: -1px;
}

/* 남은 건수 상자 — 물건 줄과 같은 너비로 바로 아래에 붙는다 */
.cal-more {
  display: block; width: 100%; box-sizing: border-box;
  border: 1px dashed #c7d2e4; border-radius: 5px; background: #fff;
  padding: 4px 0; margin-bottom: 3px;
  font-family: inherit; font-size: 12px; font-weight: 800; color: #2a5fbf; cursor: pointer;
}
.cal-more.fold { border-style: solid; color: #9ca3af; }
.cal-more:active { background: #f3f4f6; }

.cal-event {
  background: #f7f8fb; border: 1px solid #e8ebf1; border-radius: 5px;
  padding: 5px 4px; margin-bottom: 3px; cursor: pointer; min-width: 0;
}
.cal-event p {
  margin: 0; font-size: 8px; line-height: 1.45; color: #6b7280;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 표시 항목 — 현황 띠 오른쪽 끝에 나란히 */
.cal-show { margin-left: auto; display: flex; flex-wrap: wrap; gap: 12px; }
.cal-show-item {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 700; color: #4b5563; cursor: pointer;
}
.cal-show-item input { width: 14px; height: 14px; margin: 0; accent-color: #2a3f8f; }
.cal-list-main .star { font-style: normal; margin-right: 4px; color: #eab308; letter-spacing: -1px; }
.cal-list-main small.cat { color: #2a5fbf; }

/* 보기 전환 — 달 이름 왼쪽에 둔다 */
.cal-view {
  position: absolute; left: 2px; top: 50%; transform: translateY(-50%);
  display: inline-flex; border: 1px solid #dde3ee; border-radius: 999px; overflow: hidden; background: #fff;
}
.cal-view-btn {
  border: none; border-radius: 0; background: #fff;
  padding: 5px 11px; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.cal-view-btn.on { background: #2a3f8f; color: #fff; }

/* 목록 보기 */
.cal-list { padding: 4px 0 8px; }
.cal-list-none { margin: 24px 0; text-align: center; font-size: 12.5px; color: #9ca3af; }
.cal-list-day + .cal-list-day { margin-top: 14px; }
.cal-list-head { display: flex; align-items: baseline; gap: 8px; padding: 6px 2px; border-bottom: 1px solid #eef1f6; }
.cal-list-head strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.cal-list-head strong.today { color: #2a5fbf; }
.cal-list-holiday { font-style: normal; font-size: 11px; color: #dc2626; }
.cal-list-count { font-size: 11.5px; font-weight: 800; color: #dc2626; }
.cal-list-row {
  display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;
  border: none; border-bottom: 1px solid #f4f6fb; border-radius: 0; background: #fff;
  padding: 10px 2px; text-align: left; cursor: pointer;
}
.cal-list-tag {
  flex: none; min-width: 54px; text-align: center; padding: 4px 6px; border-radius: 5px;
  font-size: 10.5px; font-weight: 800; background: #f1f3f8; color: #6b7280;
}
.cal-list-tag.desk { background: #eef1f8; color: #4b5563; }
.cal-list-tag.plan { background: #e8f0ff; color: #2b6df3; }
.cal-list-tag.visited { background: #e6f4ea; color: #1b7f3b; }
.cal-list-tag.bid { background: #fff3e0; color: #b26a00; }
.cal-list-tag.bidding { background: #fde7d5; color: #c2410c; }
.cal-list-tag.done, .cal-list-tag.won { background: #2a3f8f; color: #fff; }
.cal-list-tag.due { background: #dc2626; color: #fff; }
.cal-list-tag.sold { background: #1b7f3b; color: #fff; }
.cal-list-tag.closed { background: #f1f3f8; color: #9ca3af; }
.cal-list-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cal-list-main b { font-size: 12.5px; font-weight: 700; color: #111827; }
.cal-list-main .fail { margin-left: 6px; font-style: normal; font-size: 11px; font-weight: 700; color: #dc2626; }
.cal-list-main small {
  font-size: 11px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cal-list-main small.won { color: #9ca3af; }
.cal-list-arrow { flex: none; font-size: 15px; color: #c7d2ea; }

/* 다 보기 — 달 이름 오른쪽에 둔다 */
.cal-openall {
  position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
  border: 1px solid #c7d2ea; border-radius: 999px; background: #fff;
  padding: 5px 12px; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2a5fbf; cursor: pointer;
}

/* 이 달의 현황 띠 */
.cal-tally {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
  padding: 8px 2px 10px; border-bottom: 1px solid #eef1f6; margin-bottom: 8px;
}
.cal-tally-all {
  font-size: 11px; font-weight: 800; color: #111827;
  background: #eef1f8; border-radius: 999px; padding: 4px 10px;
}
.cal-tally-chip {
  font-size: 11px; font-weight: 600; border-radius: 999px; padding: 4px 9px;
  background: #f4f6fb; color: #4b5563;
}
.cal-tally-chip b { font-weight: 800; }
.cal-tally-chip.desk { background: #eef1f8; color: #4b5563; }
.cal-tally-chip.plan { background: #e8f0ff; color: #2b6df3; }
.cal-tally-chip.visited { background: #e6f4ea; color: #1b7f3b; }
.cal-tally-chip.bid { background: #fff3e0; color: #b26a00; }
.cal-tally-chip.bidding { background: #fde7d5; color: #c2410c; }
.cal-tally-chip.done { background: #2a3f8f; color: #fff; }
.cal-tally-chip.closed { background: #f1f3f8; color: #9ca3af; }
.cal-tally-chip.won { background: #2a3f8f; color: #fff; }
.cal-tally-chip.due { background: #dc2626; color: #fff; }
.cal-tally-chip.sold { background: #1b7f3b; color: #fff; }

/* 단계 태그 — 사건번호 위에 붙어 '어디까지 했는지'를 한눈에 알린다 */
.cal-event .ev-stage {
  display: block; margin-bottom: 2px !important; padding: 1px 2px;
  border-radius: 4px; font-size: 7.5px !important; font-weight: 700; line-height: 1.5;
  text-align: center; letter-spacing: -0.5px; white-space: nowrap;
}
.cal-event .ev-stage.desk { background: #eef1f8; color: #4b5563; }
.cal-event .ev-stage.plan { background: #e8f0ff; color: #2b6df3; }
.cal-event .ev-stage.visited { background: #e6f4ea; color: #1b7f3b; }
.cal-event .ev-stage.bid { background: #fff3e0; color: #b26a00; }
.cal-event .ev-stage.bidding { background: #fde7d5; color: #c2410c; }
.cal-event .ev-stage.done { background: #2a3f8f; color: #fff; }
.cal-event .ev-stage.closed { background: #f1f3f8; color: #9ca3af; }
.cal-event .ev-stage.etc { background: #f1f3f8; color: #6b7280; }
/* 날짜 딱지 — 잔금기한은 놓치면 보증금이 걸리니 가장 세게 */
.cal-event .ev-stage.won { background: #2a3f8f; color: #fff; }
.cal-event .ev-stage.due { background: #dc2626; color: #fff; }
.cal-event .ev-stage.sold { background: #1b7f3b; color: #fff; }

/* 손전화에서는 이 둘만 보이므로 크게 쓴다 — 칸이 좁아 줄을 내려 두 줄로 선다
   ('2025-' / '00001'). 웹은 아래 style.css 에서 제 치수로 되돌린다 */
.cal-event .ev-case {
  font-size: 10.5px !important; font-weight: 500; color: #111827 !important;
  /* 줄은 붙임표(-)에서만 내린다 — '2025-' / '00003' 두 줄 */
  white-space: normal; word-break: normal; overflow-wrap: normal; line-height: 1.15; letter-spacing: -0.6px;
}
/* 유찰 횟수 — 사건번호와 같은 크기로. 값이 떨어진 만큼 눈에 띄어야 한다 */
.cal-event .ev-fail {
  font-size: 10.5px !important; font-weight: 500; color: #dc2626 !important;
  white-space: normal; line-height: 1.15; margin-top: 2px !important;
}
.cal-event .ev-fail.fresh { color: #6b7280 !important; font-weight: 500; }
/* 앱(손전화)에서는 사건번호와 유찰 횟수만 — 달력 한 칸이 좁아 나머지는 뭉개진다.
   넓은 화면(웹)에서는 style.css 의 html.is-web 규칙이 도로 펴 준다 */
.cal-event .ev-addr,
.cal-event .ev-kind,
.cal-event .ev-price,
.cal-event .ev-area { display: none; }
.ev-area {
  display: flex; align-items: center; gap: 2px;
  margin-top: 2px !important; color: #9ca3af !important;
}
/* 본건사진 말풍선 — body 로 옮겨 가므로 scoped 밖에서 적는다 (아래 전역 블록) */
</style>

<style>
/* 사진 말풍선은 Teleport 로 body 에 그려져 scoped 가 닿지 않는다 */
.cal-tip {
  position: fixed; z-index: 9999; width: 190px;
  background: #fff; border: 1px solid #dfe5ef; border-radius: 10px; padding: 4px;
  box-shadow: 0 14px 34px rgba(17, 24, 39, 0.18); pointer-events: none;
}
.cal-tip img { display: block; width: 100%; height: auto; max-height: 240px; object-fit: contain; border-radius: 7px; }
</style>
