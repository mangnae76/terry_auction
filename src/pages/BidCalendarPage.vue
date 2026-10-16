<script setup lang="ts">
// 입찰 캘린더 — 선정해 둔 물건의 입찰일을 달력에 펼쳐 본다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { isPhotoId, loadSitePhoto } from '../services/sitePhotoRepository';
import type { AuctionDetail } from '../types/auction';

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

const byDate = computed(() => {
  const map: Record<string, AuctionDetail[]> = {};
  store.auctions.forEach((a) => {
    const key = dateKeyOf(a.eventDate);
    if (!key) return;
    (map[key] ??= []).push(a);
  });
  return map;
});

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

const goDetail = (id: string) => router.push(`/auctions/${id}`);
</script>

<template>
  <section class="cal-shell">
    <header class="cal-header">
      <h1 class="cal-title">입찰 캘린더</h1>
      <span class="cal-eyebrow">AUCTION CALENDAR</span>
    </header>

    <div class="cal-card">
      <div class="cal-nav">
        <button type="button" class="cal-nav-btn" aria-label="이전 달" @click="moveMonth(-1)">‹</button>
        <strong>{{ year }}년 {{ month }}월</strong>
        <button type="button" class="cal-nav-btn" aria-label="다음 달" @click="moveMonth(1)">›</button>
      </div>

      <div class="cal-grid cal-head">
        <span v-for="(w, i) in WEEKDAYS" :key="w" :class="['cal-dow', { sun: i === 0, sat: i === 6 }]">{{ w }}</span>
      </div>

      <div class="cal-grid cal-body">
        <div v-for="c in cells" :key="c.key" :class="['cal-cell', { out: !c.inMonth }]">
          <p class="cal-daynum">
            <span :class="['cal-dnum', { sun: c.dow === 0 || holidayMap[c.key], sat: c.dow === 6 && !holidayMap[c.key], today: c.key === todayKey }]">{{ c.day }}</span>
            <em v-if="holidayMap[c.key]" class="cal-holiday">{{ holidayMap[c.key] }}</em>
            <!-- 그날 몇 건인지는 공휴일이어도 적는다 — 날짜 옆에서 바로 읽혀야 한다 -->
            <em v-if="byDate[c.key]" class="cal-count">{{ byDate[c.key].length }}건</em>
          </p>
          <article
            v-for="a in byDate[c.key] ?? []"
            :key="a.id"
            class="cal-event"
            @click="goDetail(a.id)"
            @mouseenter="showPhotoTip(a, $event)"
            @mouseleave="hidePhotoTip()"
          >
            <p class="ev-case">{{ caseShort(a) }}</p>
            <p :class="['ev-fail', { fresh: failText(a) === '신건' }]">{{ failText(a) }}</p>
            <p class="ev-addr">{{ a.address }}</p>
            <p class="ev-kind">{{ roundText(a) }}</p>
            <p class="ev-price">감정: {{ money(a.metrics?.appraisalValue ?? 0) }}</p>
            <p class="ev-price">최저: {{ money(a.metrics?.minimumBidValue ?? 0) }}</p>
            <p class="ev-area">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>{{ areaTag(a) }}
            </p>
          </article>
        </div>
      </div>
    </div>

    <!-- 사진 말풍선 — 달력 위에 떠 있어야 해서 글(body) 쪽에 그린다 -->
    <Teleport to="body">
      <div v-if="tip" class="cal-tip" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
        <img :src="tip.src" alt="본건사진" />
      </div>
    </Teleport>

    <AppMobileBottomNav active="calendar" />
  </section>
</template>

<style scoped>
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
  min-height: 62px; min-width: 0;
  padding: 4px 3px 6px;
  border-right: 1px solid #f1f3f7; border-bottom: 1px solid #f1f3f7;
}
.cal-cell:nth-child(7n) { border-right: none; }
.cal-cell.out { background: #fcfcfd; }
.cal-cell.out .cal-daynum { visibility: hidden; }
.cal-daynum {
  margin: 0 0 3px; display: flex; align-items: center; gap: 3px;
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
/* 입찰 건수 — 눈에 띄게 크고 파랗게 */
.cal-count { font-style: normal; font-size: 17px; font-weight: 800; color: #2a5fbf; line-height: 1; }

.cal-event {
  background: #f7f8fb; border: 1px solid #e8ebf1; border-radius: 5px;
  padding: 4px 4px; margin-bottom: 3px; cursor: pointer; min-width: 0;
}
.cal-event p {
  margin: 0; font-size: 8px; line-height: 1.45; color: #6b7280;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ev-case { font-size: 8.5px !important; font-weight: 800; color: #111827 !important; }
/* 유찰 횟수 — 값이 떨어진 만큼 눈에 띄어야 한다. 아직 안 떨어진 신건은 담담하게 */
.ev-fail { font-size: 8px !important; font-weight: 800; color: #dc2626 !important; }
.ev-fail.fresh { color: #6b7280 !important; font-weight: 700; }
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
