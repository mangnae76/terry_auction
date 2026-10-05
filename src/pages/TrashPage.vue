<script setup lang="ts">
// 보관함 — 선정물건에서 치운 물건을 카드로 펼쳐 본다.
// 목록 화면의 드롭다운은 주소 한 줄만 보여 줘서, 무엇을 지웠는지 알아보기 어려웠다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import { useAuctionStore } from '../stores/auctionStore';
import { AUCTION_STATUS_LABELS } from '../types/auction';
import type { AuctionDetail } from '../types/auction';
import calendarDaysIcon from '../assets/icones/calendar-days (1).png';

const store = useAuctionStore();
const router = useRouter();

const picked = ref<Record<string, boolean>>({});
const pickedIds = computed(() => Object.keys(picked.value).filter((id) => picked.value[id]));
const allPicked = computed(
  () => store.hiddenAuctions.length > 0 && pickedIds.value.length === store.hiddenAuctions.length,
);
const togglePick = (id: string) => {
  picked.value = { ...picked.value, [id]: !picked.value[id] };
};
const toggleAll = () => {
  if (allPicked.value) {
    picked.value = {};
    return;
  }
  const next: Record<string, boolean> = {};
  store.hiddenAuctions.forEach((item) => { next[item.id] = true; });
  picked.value = next;
};

const toastVisible = ref(false);
const toastText = ref('');
const toastTone = ref<'info' | 'success' | 'error'>('info');
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const showToast = (text: string, tone: 'info' | 'success' | 'error' = 'info') => {
  toastText.value = text;
  toastTone.value = tone;
  toastVisible.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastVisible.value = false; }, 1800);
};

const restore = async (ids: string[]) => {
  if (ids.length === 0) return;
  await store.restoreHiddenAuctions(ids);
  picked.value = {};
  showToast(`${ids.length}건을 되살렸습니다.`, 'success');
};
// 확인창은 선정물건과 같은 것을 쓴다 (AppConfirm)
const confirmBox = ref<ConfirmBox | null>(null);
const askConfirm = (box: ConfirmBox) => {
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};
/** 완전삭제는 되돌릴 수 없다 — 몇 건인지 적어 한 번 더 묻고, 건너뛰기도 내지 않는다 */
const purge = (ids: string[]) => {
  if (ids.length === 0) return;
  askConfirm({
    title: `${ids.length}건을 완전히 삭제할까요?`,
    desc: '삭제하면 되살릴 수 없습니다. 이 확인은 건너뛸 수 없습니다.',
    okLabel: '완전삭제',
    skipKey: '',
    run: async () => {
      await store.purgeAuctions(ids);
      picked.value = {};
      showToast(`${ids.length}건을 완전히 삭제했습니다.`, 'error');
    },
  });
};

const formatWon = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return Math.round(value).toLocaleString('ko-KR');
};
/** 목록과 같은 규칙 — '인천지방법원 부천지원'은 '부천법원'으로 짧게 */
const shortCourt = (raw?: string) => {
  const name = (raw ?? '').trim();
  if (!name) return '';
  const branch = name.match(/([가-힣]+)\s*지원\s*$/);
  if (branch) return `${branch[1]}법원`;
  const m = name.match(/^(.*?)(?:지방|가정|행정|회생)?법원/);
  return m?.[1] ? `${m[1]}법원` : name;
};
const PROP_TYPE_MARKS: Array<[RegExp, string]> = [
  [/아파트/, 'A'],
  [/도시형|도생/, '도'],
  [/다세대|빌라/, '다'],
  [/근린|상가|점포/, '상'],
  [/연립/, '연'],
  [/오피스텔/, '오'],
  [/단독|주택/, '단'],
];
const propTypeMark = (raw?: string) => {
  const t = raw ?? '';
  if (!t.trim()) return '';
  return PROP_TYPE_MARKS.find(([re]) => re.test(t))?.[1] ?? t.trim()[0];
};
/** 치우기 전의 단계를 그대로 보여 준다 — 되살리면 이 단계로 돌아간다 */
const stageLabel = (item: AuctionDetail) => {
  if (item.status === '입찰') {
    return (item.bidStatus ?? '').replace(/^입찰/, '') === '진행' ? '입찰진행' : '입찰산정';
  }
  return AUCTION_STATUS_LABELS[item.status] ?? String(item.status);
};
const stageTone = (item: AuctionDetail) => {
  if (item.status === '입찰' && (item.bidStatus ?? '').replace(/^입찰/, '') === '진행') return 'bidding';
  return 'normal';
};
</script>

<template>
  <section class="trs-shell">
    <header class="trs-header">
      <button type="button" class="trs-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="trs-title">보관함</h1>
      <span class="trs-eyebrow">× {{ store.hiddenCount }}건</span>
    </header>

    <div v-if="store.hiddenAuctions.length > 0" class="trs-bar">
      <button type="button" class="trs-bar-btn" @click="toggleAll">
        {{ allPicked ? '전체해제' : '전체선택' }}
      </button>
      <button
        type="button"
        class="trs-bar-btn restore"
        :disabled="pickedIds.length === 0"
        @click="restore(pickedIds)"
      >복원{{ pickedIds.length > 0 ? ` (${pickedIds.length})` : '' }}</button>
      <button
        type="button"
        class="trs-bar-btn purge"
        :disabled="pickedIds.length === 0"
        @click="purge(pickedIds)"
      >완전삭제</button>
    </div>

    <p v-if="store.hiddenAuctions.length > 0" class="trs-note">
      복원하면 <strong>손품조사</strong> 단계로 돌아갑니다. 아래 태그는 치울 때의 단계입니다.
    </p>

    <p v-if="store.hiddenAuctions.length === 0" class="trs-empty">
      보관함이 비어 있습니다.<br />
      <small>선정물건에서 치운 물건이 여기에 모입니다.</small>
    </p>

    <div class="trs-list">
      <article
        v-for="item in store.hiddenAuctions"
        :key="item.id"
        :class="['trs-card', { on: picked[item.id] === true }]"
        @click="togglePick(item.id)"
      >
        <div class="trs-card-top">
          <input
            type="checkbox"
            class="trs-check"
            :checked="picked[item.id] === true"
            @click.stop="togglePick(item.id)"
          />
          <span class="trs-meta">
            <img :src="calendarDaysIcon" alt="" class="trs-meta-ico" />
            {{ item.eventDate || '입찰일 미정' }}
            <i>·</i>{{ shortCourt(item.courtName) }}
            <i>·</i>{{ item.caseNumber }}
          </span>
          <span :class="['trs-stage', `tone-${stageTone(item)}`]">{{ stageLabel(item) }}</span>
        </div>

        <h3 class="trs-addr">
          <span v-if="propTypeMark(item.propertyType)" class="trs-type-mark">{{ propTypeMark(item.propertyType) }}</span>{{ item.address }}
        </h3>

        <div class="trs-price-row">
          <div class="trs-price-box">
            <small>감정가</small>
            <strong>{{ formatWon(item.metrics.appraisalValue) }}<em>원</em></strong>
          </div>
          <div class="trs-price-box">
            <small>{{ item.auctionRound || '최저' }}</small>
            <strong>{{ formatWon(item.metrics.minimumBidValue) }}<em>원</em></strong>
          </div>
        </div>

        <div class="trs-card-actions">
          <button type="button" class="trs-act restore" @click.stop="restore([item.id])">복원</button>
          <button type="button" class="trs-act purge" @click.stop="purge([item.id])">완전삭제</button>
        </div>
      </article>
    </div>

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />

    <AppMobileBottomNav active="more" />
    <AppToast :visible="toastVisible" :text="toastText" :tone="toastTone" />
  </section>
</template>

<style scoped>
.trs-shell { min-height: 100vh; background: #e9edf4; padding-bottom: 86px; }
.trs-header {
  padding: 14px 12px 8px;
  display: flex; align-items: baseline; gap: 8px;
}
.trs-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.trs-title { margin: 0; flex: 0 0 auto; font-size: 20px; font-weight: 800; color: #111827; }
.trs-eyebrow {
  min-width: 0; font-size: 10.5px; font-weight: 700; color: #2b6df3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.trs-bar { display: flex; gap: 6px; padding: 0 12px 8px; }
.trs-bar-btn {
  display: inline-flex; align-items: center; justify-content: center;
  font-family: inherit; line-height: 1; padding: 0 6px;
  flex: 1 1 0; min-width: 0; height: 30px;
  border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
  font-size: 12px; font-weight: 700; color: #475569; cursor: pointer;
}
.trs-bar-btn.restore { border-color: #6b85f0; color: #3850c2; }
.trs-bar-btn.purge { border-color: #ef6b6b; color: #c22e2e; }
.trs-bar-btn:disabled { opacity: 0.4; cursor: default; }

.trs-note {
  margin: 0 12px 8px; font-size: 10.5px; font-weight: 400; color: #6b7280; line-height: 1.5;
}
.trs-note strong { font-weight: 800; color: #3850c2; }
.trs-empty {
  margin: 48px 16px; text-align: center;
  font-size: 13px; font-weight: 700; color: #6b7280; line-height: 1.8;
}
.trs-empty small { font-size: 11px; font-weight: 400; color: #9ca3af; }

.trs-list { padding: 0 12px; display: flex; flex-direction: column; gap: 8px; }
.trs-card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 9px 11px 10px; cursor: pointer;
}
.trs-card.on { border-color: #6b85f0; box-shadow: 0 0 0 2px rgba(107, 133, 240, 0.18); }

.trs-card-top { display: flex; align-items: center; gap: 6px; }
.trs-check { width: 15px; height: 15px; flex: 0 0 auto; accent-color: #2b6df3; }
.trs-meta {
  flex: 1 1 auto; min-width: 0;
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; color: #6b7280; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.trs-meta i { font-style: normal; color: #cbd5e1; margin: 0 1px; }
.trs-meta-ico { width: 11px; height: 11px; object-fit: contain; flex: 0 0 auto; }
.trs-stage {
  flex: 0 0 auto;
  border: 1px solid #6b85f0; background: #dce5ff; color: #3850c2;
  border-radius: 5px; padding: 2px 7px;
  font-size: 9.5px; font-weight: 700; white-space: nowrap;
}
.trs-stage.tone-bidding { border-color: #ef6b6b; background: #ffdede; color: #c22e2e; font-weight: 800; }

.trs-addr {
  margin: 7px 0 0; font-size: 13px; font-weight: 400; color: #111827;
  line-height: 1.35; word-break: keep-all;
  /* 종류 표시가 주소 아래로 처지지 않게 — 첫 줄 옆에 붙여 세운다 */
  display: flex; align-items: flex-start; gap: 5px;
}
.trs-type-mark {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: 16px; height: 16px;
  /* 주소 첫 줄(13px × 1.35 = 17.6px) 가운데에 오게 한 픽셀만 내린다 */
  margin-top: 1px;
  border-radius: 50%; background: #eef3fd; color: #2b6df3;
  font-size: 9.5px; font-weight: 800;
}

.trs-price-row { display: flex; gap: 6px; margin-top: 8px; }
.trs-price-box {
  flex: 1 1 0; min-width: 0;
  background: #f6f8fc; border-radius: 6px; padding: 5px 8px;
  display: flex; flex-direction: column; gap: 1px;
}
.trs-price-box small { font-size: 9.5px; color: #6b7280; }
.trs-price-box strong {
  font-size: 13px; font-weight: 800; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trs-price-box em { font-style: normal; font-size: 10px; font-weight: 600; color: #6b7280; margin-left: 1px; }

.trs-card-actions { display: flex; gap: 6px; margin-top: 9px; }
.trs-act {
  display: inline-flex; align-items: center; justify-content: center;
  font-family: inherit; line-height: 1;
  flex: 1 1 0; height: 29px; border-radius: 7px; background: #fff;
  font-size: 11.6px; font-weight: 700; cursor: pointer;
}
.trs-act.restore { border: 1px solid #6b85f0; color: #3850c2; }
.trs-act.purge { border: 1px solid #f3c2c2; color: #c22e2e; }
.trs-act:active { opacity: 0.6; }
</style>
