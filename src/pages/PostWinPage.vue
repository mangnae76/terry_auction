<script setup lang="ts">
// 낙찰 이후 — 명도와 매도까지의 일을 모아 둘 자리.
// 틀은 자금관리(.fin-shell)와 같은 짜임이다: 위는 붙박이(제목 + 탭 + 물건 카드),
// 아래만 구른다. 카드는 물건상세의 권리분석과 같은 꼴 — 제목줄을 누르면 접힌다.
import { computed, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import { useAuctionStore } from '../stores/auctionStore';
import { POST_WIN_DAY, groupRows, type CheckGroup } from '../services/postWinChecklist';
import { bidStageOf } from '../utils/stageLabel';
import { shortCourt } from '../utils/auctionSummary';
import type { AuctionDetail } from '../types/auction';

type TabKey = 'win' | 'balance' | 'evict' | 'repair' | 'sell';
const TABS: Array<{ key: TabKey; label: string; desc: string }> = [
  { key: 'win', label: '낙찰당일', desc: '낙찰가·경쟁 상황, 영수증과 서류 챙기기' },
  { key: 'balance', label: '잔금·등기', desc: '잔금 납부일, 등기 촉탁, 취득세' },
  { key: 'evict', label: '명도', desc: '점유자 확인, 인도명령·강제집행, 이사비 협의' },
  { key: 'repair', label: '수리·정비', desc: '수리 범위와 비용, 업체 일정' },
  { key: 'sell', label: '매도·임대', desc: '내놓은 가격, 중개업소, 계약 일정' },
];
const activeTab = ref<TabKey>('win');
const current = () => TABS.find((t) => t.key === activeTab.value) ?? TABS[0];

const store = useAuctionStore();
/** 낙찰 뒤의 물건만 고른다 — 낙찰·매도 단계 */
const ownedAuctions = computed(() => store.auctions.filter((a) => {
  const stage = bidStageOf(a);
  return stage === '낙찰' || stage === '매도';
}));
const pickedId = ref('');
/** 고른 물건이 사라지거나 아직 안 골랐으면 첫 물건을 든다 */
watch(ownedAuctions, (list) => {
  if (!list.some((a) => a.id === pickedId.value)) pickedId.value = list[0]?.id ?? '';
}, { immediate: true });
const picked = computed<AuctionDetail | null>(
  () => ownedAuctions.value.find((a) => a.id === pickedId.value) ?? null,
);
/** 고른 물건은 카드로 보이고, 누르면 목록이 펼쳐진다 */
const pickOpen = ref(false);
const pickAuction = (id: string) => {
  pickedId.value = id;
  pickOpen.value = false;
};

/** 주소는 동부터 짧게 — 카드 한 줄에 들어가야 한다 */
const shortAddr = (address?: string) => {
  const parts = String(address ?? '').trim().split(/\s+/).filter(Boolean);
  const dong = parts.findIndex((v) => /[동읍면리]\d*$/.test(v) && !/^\d/.test(v));
  return (dong >= 0 ? parts.slice(dong) : parts.slice(-2)).join(' ');
};
/** '2025-10-17' → '25. 10. 17' (자금관리 카드와 같은 꼴) */
const shortYmd = (d?: string) => (d && /^\d{4}[-./]/.test(d) ? d.slice(2).replace(/-/g, '. ') : '');

const isChecked = (id: string) => picked.value?.postWinChecks?.[id] === true;
const toggleCheck = async (id: string) => {
  const a = picked.value;
  if (!a) return;
  if (!a.postWinChecks) a.postWinChecks = {};
  a.postWinChecks[id] = !a.postWinChecks[id];
  await store.saveAuction(a);
};
/** 묶음마다 '몇 개 중 몇 개' */
const doneCount = (g: CheckGroup) => groupRows(g).filter((r) => isChecked(r.id)).length;
const rowCount = (g: CheckGroup) => groupRows(g).length;
const dayGroups = POST_WIN_DAY;

/** 카드 접기 — 물건상세와 같이 제목줄을 누르면 접힌다 */
const collapsed = ref<Record<string, boolean>>({});
const isCollapsed = (key: string) => !!collapsed.value[key];
const toggleSection = (key: string) => {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
};
</script>

<template>
  <section class="pw-shell">
    <div class="pw-fixed-top">
      <header class="pw-header">
        <h1 class="pw-page-title">낙찰이후</h1>
        <nav class="pw-tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            :class="['pw-tab', { active: activeTab === t.key }]"
            @click="activeTab = t.key"
          >{{ t.label }}</button>
        </nav>
      </header>

      <!-- 어느 물건의 일인지 — 탭 밑에 카드로 붙박아 둔다. 누르면 목록이 펼쳐진다 -->
      <div class="pw-objwrap">
        <article v-if="picked" class="pw-obj" @click="pickOpen = !pickOpen">
          <p class="top">
            <span class="pd"><em>낙찰일</em><b>{{ shortYmd(picked.wonDate) || '–' }}</b></span>
            <span class="court">{{ shortCourt(picked.courtName) }}</span>
            <img :src="chevronDownIcon" :class="['pw-obj-chev', { up: pickOpen }]" alt="" />
          </p>
          <p class="addr">{{ shortAddr(picked.address) || picked.caseNumber }}</p>
        </article>
        <p v-else class="pw-obj empty">낙찰한 물건이 없습니다</p>

        <template v-if="pickOpen">
          <div class="pw-objveil" @click="pickOpen = false" />
          <div class="pw-objlist">
            <article
              v-for="a in ownedAuctions"
              :key="a.id"
              :class="['pw-obj', 'row', { on: a.id === pickedId }]"
              @click="pickAuction(a.id)"
            >
              <p class="top">
                <span class="pd"><em>낙찰일</em><b>{{ shortYmd(a.wonDate) || '–' }}</b></span>
                <span class="court">{{ shortCourt(a.courtName) }}</span>
              </p>
              <p class="addr">{{ shortAddr(a.address) || a.caseNumber }}</p>
            </article>
          </div>
        </template>
      </div>
    </div>

    <div class="pw-body">
      <template v-if="activeTab === 'win'">
        <section v-for="g in dayGroups" :key="g.key" class="pw-card">
          <header class="pw-card-head" @click="toggleSection(g.key)">
            <h2>{{ g.title }}</h2>
            <em class="pw-count">{{ doneCount(g) }}/{{ rowCount(g) }}</em>
            <img :src="chevronDownIcon" :class="['pw-chev', { up: isCollapsed(g.key) }]" alt="" />
          </header>
          <div v-if="!isCollapsed(g.key)" class="pw-card-body">
            <p v-if="g.note" class="pw-note">{{ g.note }}</p>
            <table class="pw-tbl">
              <colgroup>
                <col class="pw-col-label" />
                <col />
                <col class="pw-col-chk" />
              </colgroup>
              <tbody>
                <!-- 왼쪽 이름 칸은 그 묶음의 줄 수만큼 세로로 합친다 -->
                <template v-for="sec in g.sections" :key="sec.label">
                  <tr
                    v-for="(r, ri) in sec.rows"
                    :key="r.id"
                    :class="['pw-row', `d${r.depth}`, { done: isChecked(r.id), first: ri === 0 }]"
                    @click="toggleCheck(r.id)"
                  >
                    <td v-if="ri === 0" class="pw-label" :rowspan="sec.rows.length">
                      <strong>{{ sec.label }}</strong>
                    </td>
                    <td :class="['pw-txt', { warn: r.warn }]">{{ r.text }}</td>
                    <td class="pw-chk">
                      <input type="checkbox" :checked="isChecked(r.id)" :disabled="!picked" @click.stop="toggleCheck(r.id)" />
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <section v-else class="pw-card">
        <header class="pw-card-head" @click="toggleSection(activeTab)">
          <h2>{{ current().label }}</h2>
          <img :src="chevronDownIcon" :class="['pw-chev', { up: isCollapsed(activeTab) }]" alt="" />
        </header>
        <div v-if="!isCollapsed(activeTab)" class="pw-card-body">
          <p class="pw-note">{{ current().desc }}</p>
          <p class="pw-empty">아직 준비 중입니다.</p>
        </div>
      </section>
    </div>

    <AppMobileBottomNav active="post-win" />
  </section>
</template>

<style scoped>
/* 위는 붙박이, 아래만 구른다 — 자금관리(.fin-shell)와 같은 짜임 */
.pw-shell {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  background: #dcdee3;
  overflow: hidden;
}
.pw-fixed-top { flex: 0 0 auto; position: relative; z-index: 20; background: #dcdee3; }
.pw-body {
  flex: 1 1 auto; overflow-y: auto;
  padding: 10px 12px 96px;
  /* 카드 사이 틈은 권리분석(.adp-body)과 같이 8px */
  display: flex; flex-direction: column; gap: 8px;
  -webkit-overflow-scrolling: touch;
}

/* 제목·탭 줄 — 물건상세의 고정줄(.adp-sticky-head)과 같은 꼴:
   흰 바탕에 그림자, 본문과는 진한 회색 6px 띠로 나뉜다 */
.pw-header {
  background: #fff;
  box-shadow: 0 2px 6px rgba(17, 24, 39, 0.06);
  border-bottom: 6px solid #dcdee3;
}
.pw-page-title {
  margin: 0; padding: 8px 12px 7px;
  font-size: 20px; font-weight: 800; color: #111827;
  border-bottom: 1px solid #e5e7eb;
}
.pw-tabs {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
}
.pw-tab {
  /* 다섯 탭 모두 한 줄로 — 글자를 줄이지 않고 자간을 좁힌다 */
  overflow: hidden; white-space: nowrap; line-height: 1.25;
  border: none; background: transparent;
  padding: 9px 0 14px; min-width: 0;
  font-family: inherit; font-size: 15.3px; font-weight: 700; color: #111827;
  letter-spacing: -0.8px; text-align: center; cursor: pointer;
  position: relative;
}
/* 선택 — 글자는 검정 그대로, 아래에 곧은 막대 하나 */
.pw-tab.active::after {
  content: '';
  position: absolute; left: 8%; right: 8%; bottom: 0;
  height: 3px; background: #2a5fbf; border-radius: 2px;
}

/* 물건 카드 — 자금관리의 낙찰·매도 카드와 같은 꼴. 돈 이야기는 넣지 않는다 */
.pw-objwrap { position: relative; padding: 8px 12px 9px; background: #dcdee3; }
.pw-obj {
  border: 1px solid #c9d3e3; border-radius: 10px; padding: 8px 10px 9px;
  background: #fff; cursor: pointer;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.05);
}
.pw-obj:active { background: #f7f9fd; }
.pw-obj.empty {
  margin: 0; text-align: center; color: #9ca3af; font-size: 12.5px; font-weight: 600; cursor: default;
}
.pw-obj .top { margin: 0; display: flex; align-items: center; gap: 10px; }
.pw-obj .pd { display: inline-flex; align-items: baseline; gap: 5px; flex: 0 0 auto; }
.pw-obj .pd em { font-style: normal; font-size: 10.5px; font-weight: 500; color: #9ca3af; }
.pw-obj .pd b { font-size: 12px; font-weight: 500; color: #111827; white-space: nowrap; }
.pw-obj .court { margin-left: auto; font-size: 11px; font-weight: 500; color: #6b7280; }
.pw-obj .addr {
  margin: 3px 0 0; font-size: 12.5px; font-weight: 600; color: #374151;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pw-obj-chev { width: 18px; height: 18px; object-fit: contain; transition: transform 0.2s; }
.pw-obj-chev.up { transform: rotate(180deg); }
/* 고른 물건을 바꿀 때만 펼친다 — 밑의 표를 밀지 않도록 떠 있게 둔다 */
.pw-objveil { position: fixed; inset: 0; z-index: 30; }
.pw-objlist {
  position: absolute; left: 12px; right: 12px; top: calc(100% - 4px); z-index: 31;
  max-height: 46vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
  padding: 6px; border-radius: 12px; background: #fff;
  border: 1px solid #dde3ee; box-shadow: 0 10px 24px rgba(17, 24, 39, 0.16);
}
.pw-obj.row.on { border-color: #2b6df3; background: #f5f8ff; }

/* 카드 — 물건상세(.adp-card)와 같은 꼴 */
.pw-card { flex: 0 0 auto; background: #fff; border-radius: 8px; padding: 0 8px 8px; }
.pw-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 4px 8px; min-height: 44px; box-sizing: border-box; cursor: pointer;
}
.pw-card-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
.pw-count { margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 800; color: #2b6df3; }
.pw-chev { width: 22px; height: 22px; object-fit: contain; transition: transform 0.2s; }
.pw-chev.up { transform: rotate(180deg); }
/* 안내 한 줄 — 파란 상자로 둔다. 왜 하는 일인지가 중요해서다
   (권리분석의 .adp-rcase-banner 와 같은 꼴) */
.pw-note {
  margin: 0 0 8px; padding: 9px 11px;
  background: #eaf1ff; border-radius: 8px;
  font-size: 12.5px; font-weight: 700; color: #1d4ed8; line-height: 1.5;
}

/* 체크리스트 표 */
.pw-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
.pw-col-label { width: 112px; }
.pw-col-chk { width: 34px; }
/* 이름 칸은 권리분석 표와 같은 꼴 — 분홍 바탕에 가운데 */
.pw-label {
  background: #fde7e7; text-align: center; vertical-align: middle;
  color: #111827; font-weight: 700;
  padding: 9px 6px !important;
}
.pw-label strong { font-size: 12px; line-height: 1.35; }
.pw-row { cursor: pointer; }
.pw-row:hover { background: #f7f9fd; }
.pw-row td { border-top: 1px solid #f1f3f7; padding: 9px 6px; vertical-align: top; }
.pw-chk { width: 34px; text-align: center; }
.pw-chk input { width: 16px; height: 16px; accent-color: #2b6df3; cursor: pointer; }
.pw-txt { font-size: 12.5px; line-height: 1.45; padding: 9px 10px 9px 12px !important; }
.pw-row td.pw-txt { font-weight: 400; color: #374151; }
/* 묶음 안에 딸린 말은 한 단 들여쓴다 */
.pw-row.d1 .pw-txt { padding-left: 24px !important; color: #4b5563; }
.pw-row td.pw-txt.warn { color: #e0574a; }
.pw-row.done .pw-txt { color: #9ca3af; text-decoration: line-through; }

.pw-empty {
  margin: 0; padding: 22px 16px 24px; text-align: center;
  font-size: 12.5px; color: #9ca3af; font-weight: 600;
}
</style>
