import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchCourtOffices, fetchWeekSchedule } from '../services/courtAuctionApi';
import type {
  CourtDeptGroup,
  CourtOffice,
  DayScheduleGroup,
  ScheduleEntry,
  WeekSchedule,
} from '../types/courtAuction';

const CACHE_KEY = 'court-schedule-cache-v1';
const CACHE_TTL = 6 * 60 * 60 * 1000;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toIso = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const getMondayIso = (ref?: Date | string): string => {
  const base = ref instanceof Date ? new Date(ref) : ref ? parseIso(ref) : new Date();
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return toIso(base);
};

const addDaysIso = (iso: string, days: number): string => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};

const weekdayLabel = (iso: string): string => WEEKDAY_LABELS[parseIso(iso).getDay()] ?? '';

const cacheKeyFor = (weekStart: string, courtCode: string): string => `${weekStart}_${courtCode || 'ALL'}`;

const loadCacheMap = (): Record<string, WeekSchedule> => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, WeekSchedule>) : {};
  } catch {
    return {};
  }
};

const saveCacheMap = (map: Record<string, WeekSchedule>): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
};

const groupByDayAndCourt = (
  weekStart: string,
  courtCode: string,
  entries: ScheduleEntry[],
): WeekSchedule => {
  const days: DayScheduleGroup[] = [];
  for (let i = 0; i < 5; i += 1) {
    const date = addDaysIso(weekStart, i);
    days.push({ date, weekday: weekdayLabel(date), totalCount: 0, byCourt: [] });
  }
  const dayMap = new Map<string, DayScheduleGroup>();
  days.forEach((d) => dayMap.set(d.date, d));

  entries.forEach((entry) => {
    const day = dayMap.get(entry.bidDate);
    if (!day) return;
    const key = `${entry.courtCode || entry.courtName}|${entry.deptName}|${entry.bidTime}`;
    let group = day.byCourt.find((g) => `${g.courtCode || g.courtName}|${g.deptName}|${g.bidTime}` === key);
    if (!group) {
      group = {
        courtCode: entry.courtCode,
        courtName: entry.courtName,
        deptName: entry.deptName,
        bidTime: entry.bidTime,
        count: 0,
        entries: [],
      };
      day.byCourt.push(group);
    }
    group.entries.push(entry);
    group.count += 1;
    day.totalCount += 1;
  });

  days.forEach((day) => {
    day.byCourt.sort((a, b) => {
      if (a.bidTime !== b.bidTime) return a.bidTime.localeCompare(b.bidTime);
      return b.count - a.count;
    });
  });

  return {
    weekStart,
    weekEnd: addDaysIso(weekStart, 4),
    courtCode,
    fetchedAt: Date.now(),
    days,
  };
};

export const useScheduleStore = defineStore('schedule', () => {
  const weekStart = ref<string>(getMondayIso());
  const selectedCourtCode = ref<string>('');
  const weekCache = ref<Record<string, WeekSchedule>>(loadCacheMap());
  const offices = ref<CourtOffice[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const currentWeek = computed<WeekSchedule | null>(() => {
    const key = cacheKeyFor(weekStart.value, selectedCourtCode.value);
    const cached = weekCache.value[key];
    if (!cached) return null;
    return cached;
  });

  const loadOffices = async () => {
    if (offices.value.length > 0) return;
    try {
      offices.value = await fetchCourtOffices();
    } catch {
      offices.value = [{ code: '', name: '전체 법원' }];
    }
  };

  const loadWeek = async (opts?: { force?: boolean }) => {
    const key = cacheKeyFor(weekStart.value, selectedCourtCode.value);
    const cached = weekCache.value[key];
    const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL;
    if (fresh && !opts?.force) return;
    loading.value = true;
    error.value = null;
    try {
      const entries = await fetchWeekSchedule({
        startDate: weekStart.value,
        endDate: addDaysIso(weekStart.value, 4),
        courtCode: selectedCourtCode.value || undefined,
      });
      const week = groupByDayAndCourt(weekStart.value, selectedCourtCode.value, entries);
      weekCache.value = { ...weekCache.value, [key]: week };
      saveCacheMap(weekCache.value);
    } catch (err: unknown) {
      const e = err as { message?: string };
      error.value = e?.message || '법원 경매 정보를 불러오지 못했습니다.';
    } finally {
      loading.value = false;
    }
  };

  const nextWeek = async () => {
    weekStart.value = addDaysIso(weekStart.value, 7);
    await loadWeek();
  };

  const prevWeek = async () => {
    weekStart.value = addDaysIso(weekStart.value, -7);
    await loadWeek();
  };

  const setCourt = async (code: string) => {
    selectedCourtCode.value = code;
    await loadWeek();
  };

  const goThisWeek = async () => {
    weekStart.value = getMondayIso();
    await loadWeek();
  };

  return {
    weekStart,
    selectedCourtCode,
    weekCache,
    offices,
    loading,
    error,
    currentWeek,
    loadOffices,
    loadWeek,
    nextWeek,
    prevWeek,
    setCourt,
    goThisWeek,
  };
});

export type { CourtDeptGroup, DayScheduleGroup, WeekSchedule };
