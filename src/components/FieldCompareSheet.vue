<script setup lang="ts">
// 임장 비교 물건 — 임장경로 정류장의 「현장 기록」으로 연다. 목록 → 현장 카드(그 유사물건 주소로 길찾기 · 10초 체크).
// 목록 · 체크는 경로가 아니라 그 경매물건 문서(fieldCompare)에 둔다 — 임장경로 저장 · 순서 계산은 손대지 않는다.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { CompareItem } from '../types/auction';
import { useAuctionStore } from '../stores/auctionStore';
import { openNaverSpot } from '../services/naverListing';
import { geocodeAddress } from '../services/routeOptimizer';
import { Capacitor } from '@capacitor/core';

type Pt = { lat: number; lng: number; address: string };
/** navigate — 임장경로가 넘긴다: 위에서 고른 네비(네이버 · 티맵 · 카카오)와 이동수단 그대로 연다. 없으면 네이버 */
const props = defineProps<{ auctionId: string; navigate?: (start: Pt, end: Pt) => void; navName?: string }>();
const emit = defineEmits<{ close: [] }>();
const store = useAuctionStore();

const auction = computed(() => store.auctions.find((x) => x.id === props.auctionId) ?? null);
const items = ref<CompareItem[]>(JSON.parse(JSON.stringify(auction.value?.fieldCompare?.items ?? [])));
const cur = ref(-1);   // -1 = 목록, 그 밖 = 현장 카드
const doneCount = computed(() => items.value.filter((x) => x.check?.at).length);
const firstTodo = computed(() => Math.max(0, items.value.findIndex((x) => !x.check?.at)));
const eok = (w: number) => `${(w / 1e8).toFixed(2)}억`;
const card = computed(() => (cur.value >= 0 ? items.value[cur.value] : null));

type CheckKey = 'loc' | 'villa' | 'look' | 'park' | 'lift' | 'vs';
const ROWS: { key: CheckKey; label: string; opts: string[]; good: string[]; bad: string[] }[] = [
  { key: 'loc', label: '입지', opts: ['상', '중상', '중', '하'], good: ['상', '중상'], bad: ['하'] },
  { key: 'villa', label: '빌라', opts: ['상', '중상', '중', '하'], good: ['상', '중상'], bad: ['하'] },
  { key: 'look', label: '외관', opts: ['좋음', '보통', '나쁨'], good: ['좋음'], bad: ['나쁨'] },
  { key: 'park', label: '주차', opts: ['넉넉', '부족'], good: ['넉넉'], bad: ['부족'] },
  { key: 'lift', label: '엘베', opts: ['있음', '없음'], good: [], bad: [] },
  { key: 'vs', label: '비교', opts: ['우세', '비슷', '열세'], good: ['우세'], bad: ['열세'] },
];

// 고칠 때마다 0.8초 뒤 그 경매물건에 적는다. 최근 작성에는 마지막으로 고친 비교 물건 한 줄
let timer = 0;
let lastNote = '';
const noteOf = (c: CompareItem) => {
  const k = c.check ?? {};
  const bits = [k.loc && `입지 ${k.loc}`, k.villa && `빌라 ${k.villa}`, k.vs && `비교 ${k.vs}`, k.memo && '메모'].filter(Boolean);
  return `${c.no} ${c.name || c.jibun}${bits.length ? ` — ${bits.join(' · ')}` : ''}`;
};
const persist = () => {
  if (card.value) lastNote = noteOf(card.value);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const a = auction.value;
    if (!a) return;
    void store.saveAuction({ ...a, fieldCompare: { ...(a.fieldCompare ?? {}), savedAt: a.fieldCompare?.savedAt ?? Date.now(), items: items.value } }, { where: '임장경로 › 현장 기록', note: lastNote });
  }, 800);
};
const pick = (key: CheckKey, v: string) => {
  const c = card.value;
  if (!c) return;
  const was = c.check?.[key];
  c.check = { ...(c.check ?? {}), [key]: was === v ? undefined : v, at: Date.now() };
  persist();
};
const onMemo = (e: Event) => {
  const c = card.value;
  if (!c) return;
  c.check = { ...(c.check ?? {}), memo: (e.target as HTMLTextAreaElement).value, at: Date.now() };
  persist();
};
const next = () => {
  const c = card.value;
  if (c && !c.check?.at) { c.check = { ...(c.check ?? {}), at: Date.now() }; persist(); }
  if (cur.value + 1 < items.value.length) cur.value += 1;
  else emit('close');
};
const flush = () => { if (timer) { window.clearTimeout(timer); timer = 0; const a = auction.value; if (a) void store.saveAuction({ ...a, fieldCompare: { ...(a.fieldCompare ?? {}), savedAt: a.fieldCompare?.savedAt ?? Date.now(), items: items.value } }, { where: '임장경로 › 현장 기록', note: lastNote }); } };
onBeforeUnmount(flush);
watch(() => props.auctionId, () => { flush(); items.value = JSON.parse(JSON.stringify(auction.value?.fieldCompare?.items ?? [])); cur.value = -1; });

// 길찾기 — 임장경로와 같은 네이버 길찾기. 출발지: 1번은 선정물건(차 댄 곳), 2번부터는 바로 앞 비교 물건.
// 1km 안은 도보, 넘으면 자동차. 앱에서는 네이버 지도 앱(nmap://)으로, 없으면 웹으로
const originOf = async (): Promise<Pt | null> => {
  const o = auction.value?.fieldCompare?.origin;
  if (o) return o;
  const addr = auction.value?.address ?? '';
  const p = addr ? await geocodeAddress(addr).catch(() => null) : null;
  return p ? { lat: p.lat, lng: p.lng, address: addr } : null;
};
const route = async (c: CompareItem) => {
  const i = items.value.indexOf(c);
  const prev = i > 0 ? items.value[i - 1] : null;
  const start: Pt | null = prev ? { lat: prev.lat, lng: prev.lng, address: prev.name || prev.address } : await originOf();
  const end: Pt = { lat: c.lat, lng: c.lng, address: c.name || c.address };
  if (start && props.navigate) { props.navigate(start, end); return; }
  const walk = !start || c.dist <= 1000;
  const web = 'https://m.map.naver.com/route.nhn?menu=route'
    + (start ? `&sname=${encodeURIComponent(start.address)}&sx=${start.lng}&sy=${start.lat}` : '')
    + `&ename=${encodeURIComponent(end.address)}&ex=${end.lng}&ey=${end.lat}&pathType=${walk ? 2 : 0}&showMap=true`;
  if (!Capacitor.isNativePlatform()) { window.open(web, '_blank'); return; }
  const q = [
    ...(start ? [`slat=${start.lat}`, `slng=${start.lng}`, `sname=${encodeURIComponent(start.address)}`] : []),
    `dlat=${end.lat}`, `dlng=${end.lng}`, `dname=${encodeURIComponent(end.address)}`, 'appname=com.terry.auction',
  ];
  let left = false;
  const onHide = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', onHide);
  try { window.location.href = `nmap://route/${walk ? 'walk' : 'car'}?${q.join('&')}`; } catch { /* 아래에서 웹으로 */ }
  window.setTimeout(() => { document.removeEventListener('visibilitychange', onHide); if (!left && !document.hidden) window.open(web, '_blank'); }, 1500);
};
// 출발지(1번은 선정물건, 그 뒤는 앞 번호)는 길찾기에 이미 들어가 글로 적지 않는다
const routeLabel = computed(() => `${props.navName ?? '네이버'} 길찾기`);
const naver = (c: CompareItem) => { void openNaverSpot(c.address); };
const stName = (c: CompareItem) => (c.check?.vs ? `✓ ${c.check.vs}` : c.check?.at ? '✓ 봄' : '현장 전');
</script>

<template>
  <div class="fcs-veil" @click.self="emit('close')">
    <section class="fcs" role="dialog" aria-label="임장 비교 물건 현장 기록">
      <!-- 목록 -->
      <template v-if="!card">
        <header class="fcs-h">
          <span class="fcs-grip" aria-hidden="true" />
          <div class="fcs-t">
            <b>{{ auction?.address?.split(' ').slice(-3).join(' ') || '선정물건' }}와 비교</b>
            <small>현장에서 가까운 순(시세분석 지도 번호) · {{ doneCount }} / {{ items.length }} 봄</small>
          </div>
          <button type="button" class="fcs-x" aria-label="닫기" @click="emit('close')">✕</button>
        </header>
        <p v-if="!items.length" class="fcs-empty">비교 물건이 없습니다. 손품조사 › 시세분석 지도에서 「임장경로에 추가」로 넣어 주세요.</p>
        <div class="fcs-list">
          <button v-for="(c, i) in items" :key="c.jibun" type="button" class="fcs-ci" @click="cur = i">
            <span :class="['fcs-n', { 'fcs-ok': c.check?.at }]">{{ c.no }}</span>
            <span class="fcs-t"><b>{{ c.name || c.jibun }}</b><small>{{ c.jibun }} · {{ c.dist }}m · {{ c.priceText }}</small></span>
            <span :class="['fcs-st', c.check?.at ? 'fcs-done' : 'fcs-todo']">{{ stName(c) }}</span>
          </button>
        </div>
        <button v-if="items.length" type="button" class="fcs-go" @click="cur = firstTodo">{{ doneCount ? `이어서 ${items[firstTodo]?.no}번부터 돌기` : '1번부터 돌기' }}</button>
      </template>

      <!-- 현장 카드 -->
      <template v-else>
        <header class="fcs-top">
          <span class="fcs-line"><button type="button" class="fcs-back" @click="cur = -1">‹ 비교 물건 목록</button><span class="fcs-k">{{ cur + 1 }} / {{ items.length }}</span></span>
          <span class="fcs-h"><span class="fcs-sn">{{ card.no }}</span>{{ card.name || card.jibun }}</span>
          <span class="fcs-a">{{ card.address }} · {{ card.dist }}m</span>
        </header>
        <div class="fcs-body">
          <div class="fcs-facts">
            <div><small>전용</small><b>{{ card.areaM2 ? `${card.areaM2.toFixed(2)}㎡` : '-' }}</b></div>
            <div><small>건축</small><b>{{ card.buildYear ? `${card.buildYear}년` : '-' }}</b></div>
            <div><small>엘베(대장)</small><b>{{ card.elev === null ? '-' : card.elev > 0 ? `${card.elev}대` : '없음' }}</b></div>
          </div>
          <div v-if="card.trades.length" class="fcs-mini-wrap"><table class="fcs-mini" aria-label="이 건물 실거래">
            <thead><tr><th>계약일</th><th>층</th><th>전용</th><th>실거래가</th></tr></thead>
            <tbody><tr v-for="(t, i) in card.trades" :key="i"><td>{{ t.date }}</td><td>{{ t.floor || '-' }}</td><td>{{ t.areaM2.toFixed(2) }}</td><td>{{ eok(t.price) }}</td></tr></tbody>
          </table></div>
          <div class="fcs-acts"><button type="button" class="fcs-p" @click="route(card)">{{ routeLabel }}</button><button type="button" @click="naver(card)">네이버 부동산</button></div>
          <div class="fcs-chk">
            <div v-for="r in ROWS" :key="r.key" class="fcs-row"><span>{{ r.label }}</span>
              <div class="fcs-seg">
                <button v-for="o in r.opts" :key="o" type="button" :class="{ 'fcs-on': card.check?.[r.key] === o, 'fcs-g': card.check?.[r.key] === o && r.good.includes(o), 'fcs-r': card.check?.[r.key] === o && r.bad.includes(o) }" @click="pick(r.key, o)">{{ o }}</button>
              </div>
            </div>
          </div>
          <textarea class="fcs-memo" aria-label="메모" placeholder="메모 한 줄 — 1층 상가, 주차 협소 …" :value="card.check?.memo ?? ''" @input="onMemo" />
          <button type="button" class="fcs-next" @click="next">{{ cur + 1 < items.length ? `완료 → ${items[cur + 1].no} ${items[cur + 1].name || items[cur + 1].jibun}` : '완료 → 목록 닫기' }}</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.fcs-veil { position: fixed; inset: 0; z-index: 3000; background: rgba(17, 24, 39, .38); display: flex; align-items: flex-end; justify-content: center; }
@media (min-width: 720px) { .fcs-veil { align-items: center; } }
.fcs { width: min(440px, 100%); max-height: 88vh; overflow: auto; background: #fff; border-radius: 16px 16px 0 0; box-shadow: 0 -8px 24px rgba(17, 24, 39, .2); display: grid; gap: 10px; padding: 8px 14px calc(14px + env(safe-area-inset-bottom, 0px)); color: #111827; font-size: 13px; }
@media (min-width: 720px) { .fcs { border-radius: 16px; } }
.fcs button { font: inherit; cursor: pointer; }
.fcs-h { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; align-items: start; }
.fcs-grip { grid-column: 1 / -1; justify-self: center; width: 36px; height: 4px; border-radius: 2px; background: #d1d5db; margin-bottom: 4px; }
.fcs-t b { display: block; font-size: 15px; }
.fcs-t small { color: #6b7280; font-size: 12px; }
.fcs-x { border: 0; background: none; font-size: 16px; color: #6b7280; padding: 2px 4px; }
.fcs-empty { margin: 0; padding: 18px 6px; color: #6b7280; text-align: center; }
.fcs-list { display: grid; gap: 6px; }
.fcs-ci { display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 10px; background: #fff; text-align: left; width: 100%; }
.fcs-ci:hover { border-color: #2b6df3; }
.fcs-ci .fcs-n { width: 24px; height: 24px; border-radius: 50%; background: #2b4fd8; color: #fff; font-size: 12px; font-weight: 800; display: grid; place-items: center; flex: 0 0 auto; }
.fcs-ci .fcs-n.fcs-ok { background: #22a55a; }
.fcs-ci .fcs-t { min-width: 0; flex: 1; }
.fcs-ci .fcs-t b { display: block; font-size: 13.5px; }
.fcs-ci .fcs-t small { color: #6b7280; font-size: 12px; }
.fcs-st { font-size: 11px; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
.fcs-st.fcs-done { background: #e8f6ee; color: #22a55a; }
.fcs-st.fcs-todo { background: #f7f8fb; color: #6b7280; border: 1px solid #e5e7eb; }
.fcs-go, .fcs-next { height: 44px; border: 0; border-radius: 10px; background: #1f3a72; color: #fff; font-weight: 800; font-size: 14px; }
.fcs-top { margin: -8px -14px 0; background: #1f3a72; color: #fff; padding: 12px 16px; display: grid; gap: 3px; }
.fcs-back { justify-self: start; border: 0; background: none; color: rgba(255, 255, 255, .85); font-size: 12.5px; padding: 0; }
.fcs-top .fcs-k { font-size: 12px; opacity: .8; }
.fcs-line { display: flex; align-items: center; gap: 8px; }   /* 목록으로 · 몇 번째를 한 줄에 */
.fcs-top .fcs-h { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 800; }
.fcs-top .fcs-sn { min-width: 26px; height: 22px; border-radius: 11px; background: #fff; color: #1f3a72; font-size: 12px; display: grid; place-items: center; padding: 0 6px; }
.fcs-top .fcs-a { font-size: 12.5px; opacity: .9; }
.fcs-body { display: grid; gap: 10px; }
.fcs-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; text-align: center; }
.fcs-facts div { background: #f7f8fb; border-radius: 8px; padding: 7px 4px; }
.fcs-facts small { display: block; color: #6b7280; font-size: 11px; }
.fcs-mini-wrap { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }   /* 계약일 표 — 모서리 둥글게 */
.fcs-mini-wrap .fcs-mini tr:last-child td { border-bottom: 0; }
.fcs-mini { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.fcs-mini th, .fcs-mini td { padding: 5px 4px; border-bottom: 1px solid #e5e7eb; text-align: right; white-space: nowrap; }
.fcs-mini th { color: #6b7280; font-weight: 600; background: #f7f8fb; }
.fcs-mini th:first-child, .fcs-mini td:first-child { text-align: left; }
.fcs-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.fcs-acts button { height: 36px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; font-weight: 700; font-size: 13px; }
.fcs-acts button.fcs-p { background: #eef2ff; color: #2b4fd8; border-color: #d6defb; }
.fcs-chk { display: grid; gap: 8px; }
.fcs-chk .fcs-row { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 8px; align-items: center; }
.fcs-chk .fcs-row > span { font-size: 12.5px; font-weight: 700; color: #374151; background: none; padding: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fcs-chk .fcs-row { min-width: 0; }
.fcs-seg { min-width: 0; }
.fcs-seg button { min-width: 0; padding: 0 4px; white-space: nowrap; }
.fcs-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; background: #f3f5f9; border-radius: 8px; padding: 3px; }
.fcs-seg button { height: 32px; border: 0; border-radius: 6px; background: transparent; font-size: 13px; color: #6b7280; }
.fcs-seg button.fcs-on { background: #fff; color: #2b6df3; font-weight: 700; box-shadow: inset 0 0 0 1px #2b6df3; }
.fcs-seg button.fcs-on.fcs-g { color: #22a55a; box-shadow: inset 0 0 0 1px #22a55a; }
.fcs-seg button.fcs-on.fcs-r { color: #e03e3e; box-shadow: inset 0 0 0 1px #e03e3e; }
.fcs-memo { height: 60px; resize: none; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; background: #fff; color: #111827; }
</style>
