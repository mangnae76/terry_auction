<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

// 년/월/일 휠을 굴려 고르는 날짜 선택기.
// input[type=date]는 OS가 그리는 화면이라 모양을 바꿀 수 없어 직접 만든다.
const props = defineProps<{
  open: boolean;
  /** YYYY-MM-DD (monthOnly면 YYYY-MM) */
  modelValue?: string;
  /** 일(日) 휠 없이 년·월만 고른다 */
  monthOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'close'): void;
}>();

const ITEM_H = 40;          // 한 줄 높이(px). CSS와 맞춰야 한다
const YEAR_SPAN = 30;       // 올해 기준 앞뒤로 보여줄 연도 범위

const today = new Date();
const years = Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, i) => today.getFullYear() - YEAR_SPAN + i);
const months = Array.from({ length: 12 }, (_, i) => i + 1);

const year = ref(today.getFullYear());
const month = ref(today.getMonth() + 1);
const day = ref(today.getDate());

// 선택한 연·월의 마지막 날 (윤년·30일 달 자동 처리)
const lastDay = computed(() => new Date(year.value, month.value, 0).getDate());
const days = computed(() => Array.from({ length: lastDay.value }, (_, i) => i + 1));

const yearEl = ref<HTMLElement | null>(null);
const monthEl = ref<HTMLElement | null>(null);
const dayEl = ref<HTMLElement | null>(null);

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const confirmLabel = computed(() => {
  if (props.monthOnly) return `${year.value}년 ${month.value}월 선택`;
  const d = new Date(year.value, month.value - 1, day.value);
  return `${month.value}월 ${day.value}일(${WEEKDAYS[d.getDay()]}) 선택`;
});

const scrollTo = (el: HTMLElement | null, index: number) => {
  if (el) el.scrollTop = index * ITEM_H;
};

const syncScrollPositions = async () => {
  await nextTick();
  scrollTo(yearEl.value, years.indexOf(year.value));
  scrollTo(monthEl.value, month.value - 1);
  scrollTo(dayEl.value, day.value - 1);
};

// 열릴 때 현재 값으로 휠을 맞춘다
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(props.modelValue ?? '');
    if (m) {
      year.value = Number(m[1]);
      month.value = Number(m[2]);
      day.value = Number(m[3] ?? '1');
    } else {
      year.value = today.getFullYear();
      month.value = today.getMonth() + 1;
      day.value = today.getDate();
    }
    void syncScrollPositions();
  },
  { immediate: true },
);

// 스크롤이 멈춘 뒤 가운데 줄을 읽는다 (scrollend는 지원이 고르지 않아 타이머로 처리)
let settleTimer: ReturnType<typeof setTimeout> | null = null;
const onWheelScroll = (kind: 'year' | 'month' | 'day', e: Event) => {
  const el = e.target as HTMLElement;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const idx = Math.round(el.scrollTop / ITEM_H);
    if (kind === 'year') year.value = years[Math.min(idx, years.length - 1)] ?? year.value;
    if (kind === 'month') month.value = months[Math.min(idx, months.length - 1)] ?? month.value;
    if (kind === 'day') day.value = days.value[Math.min(idx, days.value.length - 1)] ?? day.value;
    // 말일이 줄어드는 달로 바꾸면 일자를 당겨준다 (3/31 → 2월)
    if (day.value > lastDay.value) {
      day.value = lastDay.value;
      scrollTo(dayEl.value, day.value - 1);
    }
  }, 120);
};

const pick = (kind: 'year' | 'month' | 'day', value: number) => {
  if (kind === 'year') { year.value = value; scrollTo(yearEl.value, years.indexOf(value)); }
  if (kind === 'month') { month.value = value; scrollTo(monthEl.value, value - 1); }
  if (kind === 'day') { day.value = value; scrollTo(dayEl.value, value - 1); }
};

const confirm = () => {
  const value = props.monthOnly
    ? `${year.value}-${pad(month.value)}`
    : `${year.value}-${pad(month.value)}-${pad(day.value)}`;
  emit('update:modelValue', value);
  emit('close');
};

// 날짜를 비운다 — 입력칸은 다시 안내문구만 보여 준다
const clear = () => {
  emit('update:modelValue', '');
  emit('close');
};
</script>

<template>
  <div v-if="open" class="dwp-overlay" @click.self="emit('close')">
    <div class="dwp-sheet" role="dialog" aria-label="날짜선택">
      <header class="dwp-head">
        <button type="button" class="dwp-back" aria-label="닫기" @click="emit('close')">‹</button>
        <strong>날짜선택</strong>
        <span class="dwp-spacer" />
      </header>

      <p class="dwp-current">{{ year }}년 {{ month }}월</p>

      <div class="dwp-wheels">
        <div class="dwp-highlight" aria-hidden="true" />
        <div ref="yearEl" class="dwp-col" @scroll="onWheelScroll('year', $event)">
          <div class="dwp-pad" />
          <button
            v-for="y in years"
            :key="y"
            type="button"
            :class="['dwp-item', { on: y === year }]"
            @click="pick('year', y)"
          >{{ y }}년</button>
          <div class="dwp-pad" />
        </div>
        <div ref="monthEl" class="dwp-col" @scroll="onWheelScroll('month', $event)">
          <div class="dwp-pad" />
          <button
            v-for="m in months"
            :key="m"
            type="button"
            :class="['dwp-item', { on: m === month }]"
            @click="pick('month', m)"
          >{{ m }}월</button>
          <div class="dwp-pad" />
        </div>
        <div v-if="!monthOnly" ref="dayEl" class="dwp-col" @scroll="onWheelScroll('day', $event)">
          <div class="dwp-pad" />
          <button
            v-for="d in days"
            :key="d"
            type="button"
            :class="['dwp-item', { on: d === day }]"
            @click="pick('day', d)"
          >{{ d }}일</button>
          <div class="dwp-pad" />
        </div>
      </div>

      <div class="dwp-actions">
        <button type="button" class="dwp-clear" @click="clear">삭제</button>
        <button type="button" class="dwp-confirm" @click="confirm">{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dwp-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.dwp-sheet {
  width: 100%; max-width: 340px;
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.3);
}
.dwp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; background: #f3f4f6;
}
.dwp-head strong { font-size: 15px; font-weight: 800; color: #111827; }
.dwp-back, .dwp-spacer { width: 28px; }
.dwp-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #4b5563; padding: 0;
}
.dwp-current {
  margin: 0; padding: 14px 18px 4px;
  font-size: 16px; font-weight: 800; color: #ef6b6b;
}

.dwp-wheels {
  position: relative;
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  padding: 0 10px 8px;
}
/* 가운데 선택 줄 표시 */
.dwp-highlight {
  position: absolute; left: 10px; right: 10px; top: 80px; height: 40px;
  background: #f3f4f6; border-radius: 10px; pointer-events: none;
}
.dwp-col {
  /* 강조 배경(.dwp-highlight)이 position:absolute라 그냥 두면 글자를 덮는다 */
  position: relative; z-index: 1;
  height: 200px; overflow-y: auto;
  scroll-snap-type: y mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.dwp-col::-webkit-scrollbar { display: none; }
.dwp-pad { height: 80px; }
.dwp-item {
  display: block; width: 100%; height: 40px;
  border: none; background: transparent; cursor: pointer;
  scroll-snap-align: center;
  font-size: 15px; color: #9ca3af; font-weight: 600;
  padding: 0;
}
.dwp-item.on { color: #111827; font-weight: 800; }

.dwp-confirm {
  width: 100%; border: none; cursor: pointer;
  background: #ef6b6b; color: #fff;
  font-size: 15px; font-weight: 800;
  padding: 15px 0;
}
.dwp-confirm:active { opacity: 0.85; }
.dwp-actions { display: flex; align-items: stretch; gap: 8px; padding: 0 12px 12px; }
.dwp-actions .dwp-confirm { flex: 1 1 auto; margin: 0; }
.dwp-clear {
  flex: 0 0 auto; border: 1px solid #f0d4d0; background: #fdecea; color: #e0574a;
  border-radius: 12px; padding: 0 16px; font-size: 14px; font-weight: 800; cursor: pointer;
}
.dwp-clear:active { opacity: 0.85; }
</style>
