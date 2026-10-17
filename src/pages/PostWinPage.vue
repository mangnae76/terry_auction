<script setup lang="ts">
// 낙찰 이후 — 명도와 매도까지의 일을 모아 둘 자리.
// 틀은 자금관리(.fin-shell)와 같은 짜임이다: 위는 붙박이(제목 + 탭), 아래만 구른다.
// 탭마다 무엇을 담을지는 사용자가 정해 준다 — 지금은 자리만 잡아 둔다.
import { computed, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { POST_WIN_DAY } from '../services/postWinChecklist';
import { bidStageOf } from '../utils/stageLabel';
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
/** 주소는 동부터 짧게 — 고르는 칸에 들어가야 한다 */
const shortAddr = (address?: string) => {
  const parts = String(address ?? '').trim().split(/\s+/).filter(Boolean);
  const dong = parts.findIndex((v) => /[동읍면리]\d*$/.test(v) && !/^\d/.test(v));
  return (dong >= 0 ? parts.slice(dong) : parts.slice(-2)).join(' ');
};

const isChecked = (id: string) => picked.value?.postWinChecks?.[id] === true;
const toggleCheck = async (id: string) => {
  const a = picked.value;
  if (!a) return;
  if (!a.postWinChecks) a.postWinChecks = {};
  a.postWinChecks[id] = !a.postWinChecks[id];
  await store.saveAuction(a);
};
/** 묶음마다 '몇 개 중 몇 개' */
const doneCount = (rows: Array<{ id: string }>) => rows.filter((r) => isChecked(r.id)).length;
const dayGroups = POST_WIN_DAY;
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
    </div>

    <div class="pw-body">
      <!-- 어느 물건의 일인지 먼저 고른다 — 체크는 그 물건에 남는다 -->
      <div v-if="activeTab === 'win'" class="pw-pick">
        <small>물건</small>
        <select v-model="pickedId" class="pw-select" :disabled="ownedAuctions.length === 0">
          <option v-if="ownedAuctions.length === 0" value="">낙찰한 물건이 없습니다</option>
          <option v-for="a in ownedAuctions" :key="a.id" :value="a.id">
            {{ shortAddr(a.address) || a.caseNumber }}
          </option>
        </select>
      </div>

      <template v-if="activeTab === 'win'">
        <section v-for="g in dayGroups" :key="g.key" class="pw-card">
          <header class="pw-card-head">
            <h2>{{ g.title }}</h2>
            <!-- 센 개수는 제목 줄 오른쪽에, 안내는 그 아래 줄에 -->
            <em class="pw-count">{{ doneCount(g.rows) }}/{{ g.rows.length }}</em>
            <small>{{ g.note }}</small>
          </header>
          <table class="pw-tbl">
            <colgroup>
              <col class="pw-col-label" />
              <col />
              <col class="pw-col-chk" />
            </colgroup>
            <tbody>
              <tr
                v-for="r in g.rows"
                :key="r.id"
                :class="['pw-row', `d${r.depth}`, { done: isChecked(r.id) }]"
                @click="toggleCheck(r.id)"
              >
                <!-- 이름이 있는 줄은 '이름 | 설명'으로 가른다 -->
                <td v-if="r.label" class="pw-label"><strong>{{ r.label }}</strong></td>
                <td :class="['pw-txt', { warn: r.warn }]" :colspan="r.label ? 1 : 2">{{ r.text }}</td>
                <td class="pw-chk">
                  <input type="checkbox" :checked="isChecked(r.id)" :disabled="!picked" @click.stop="toggleCheck(r.id)" />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>

      <section v-else class="pw-card">
        <header class="pw-card-head">
          <h2>{{ current().label }}</h2>
          <small>{{ current().desc }}</small>
        </header>
        <p class="pw-empty">아직 준비 중입니다.</p>
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
  background: #f5f7fb;
  overflow: hidden;
}
.pw-fixed-top { flex: 0 0 auto; background: #f5f7fb; }
.pw-body {
  flex: 1 1 auto; overflow-y: auto;
  padding: 12px 12px 96px;
  /* 카드 사이 틈은 권리분석(.adp-body)과 같이 8px */
  display: flex; flex-direction: column; gap: 8px;
  -webkit-overflow-scrolling: touch;
}

.pw-header { background: #fff; border-bottom: 1px solid #eef0f5; }
.pw-page-title {
  margin: 0; padding: 9px 14px 7px;
  font-size: 20px; font-weight: 800; color: #111827;
  border-bottom: 1px solid #e5e7eb;
}
.pw-tabs {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
  margin: 8px 14px 6px; padding: 3px;
  background: #e2e8f2; border-radius: 12px;
}
.pw-tab {
  border: 1px solid transparent; background: transparent;
  padding: 5px 2px; min-height: 36px; border-radius: 9px;
  font-size: 12.5px; font-weight: 700; line-height: 1.25; letter-spacing: -0.5px; color: #6b7280;
  text-align: center; white-space: normal; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-family: inherit;
}
.pw-tab.active {
  background: #fff; color: #111827;
  border-color: #e3e7ef; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.pw-card {
  /* 줄지 않는다 — 줄면 표가 잘린다 */
  flex: 0 0 auto;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden;
}
.pw-pick { flex: 0 0 auto; }
/* 제목 한 줄, 안내는 그 아래 한 줄 — 표의 글줄과 같은 자리에서 시작한다 */
.pw-card-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; padding: 14px 14px 11px; }
.pw-card-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
/* 안내 한 줄 — 제목 밑에 파란 상자로 둔다. 왜 하는 일인지가 중요해서다
   (권리분석의 .adp-rcase-banner 와 같은 꼴) */
.pw-card-head small {
  flex: 1 0 100%;
  box-sizing: border-box; margin-top: 2px; padding: 9px 11px;
  background: #eaf1ff; border-radius: 8px;
  font-size: 12.5px; font-weight: 700; color: #1d4ed8; line-height: 1.5;
}
/* 물건 고르기 */
.pw-pick { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
.pw-pick small { font-size: 11px; font-weight: 700; color: #6b7280; flex: 0 0 auto; }
.pw-select {
  flex: 1 1 auto; min-width: 0; height: 34px;
  border: 1px solid #dde3ee; border-radius: 9px; background: #fff;
  padding: 0 10px; font-family: inherit; font-size: 13px; color: #111827;
}
.pw-select:disabled { background: #f3f4f6; color: #9ca3af; }

/* 체크리스트 표 */
.pw-card-head .pw-count {
  margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 800; color: #2b6df3;
}
.pw-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
/* 이름 칸은 권리분석 표와 같은 꼴 — 분홍 바탕에 가운데 */
.pw-col-label { width: 0; }
.pw-tbl:has(.pw-label) .pw-col-label { width: 118px; }
.pw-col-chk { width: 34px; }
.pw-label {
  background: #fde7e7; text-align: center; color: #111827; font-weight: 700;
  padding: 9px 6px !important;
}
.pw-label strong { font-size: 12px; line-height: 1.35; }
.pw-row { cursor: pointer; }
.pw-row:hover { background: #f7f9fd; }
.pw-row td { border-top: 1px solid #f1f3f7; padding: 9px 6px; vertical-align: top; }
/* 오른쪽 — 했는지 */
.pw-chk { width: 34px; text-align: center; }
.pw-chk input { width: 16px; height: 16px; accent-color: #2b6df3; cursor: pointer; }
.pw-txt { font-size: 12.5px; font-weight: 600; color: #374151; line-height: 1.45; padding: 9px 10px 9px 14px !important; }
.pw-row.d0 .pw-txt { font-weight: 800; color: #111827; }
.pw-row.d1 .pw-txt { padding-left: 26px !important; }
.pw-row.d2 .pw-txt { padding-left: 38px !important; font-weight: 500; color: #4b5563; }
.pw-txt.warn { color: #e0574a; }
.pw-row.done .pw-txt { color: #9ca3af; text-decoration: line-through; }
/* 이름 칸이 선 줄은 설명을 굵게 쓰지 않는다 — 이름이 큰 항목 노릇을 한다 */
.pw-row td.pw-label + td.pw-txt { font-weight: 400; color: #374151; }
.pw-row.done td.pw-label + td.pw-txt { color: #9ca3af; }

.pw-empty {
  margin: 0; padding: 26px 16px 30px; text-align: center;
  font-size: 12.5px; color: #9ca3af; font-weight: 600;
  border-top: 1px solid #f1f3f7;
}
</style>
