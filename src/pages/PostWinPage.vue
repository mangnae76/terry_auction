<script setup lang="ts">
// 낙찰 이후 — 명도와 매도까지의 일을 모아 둘 자리.
// 틀은 자금관리(.fin-shell)와 같은 짜임이다: 위는 붙박이(제목 + 탭 + 물건 카드),
// 아래만 구른다. 카드는 물건상세의 권리분석과 같은 꼴 — 제목줄을 누르면 접힌다.
import { computed, onMounted, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { groupRows, sectionView, type CheckGroup } from '../services/postWinChecklist';
import { POST_WIN_EDITABLE, defaultGroups, newRowId, usePostWinBook } from '../services/postWinBook';
import { bidStageOf } from '../utils/stageLabel';
import { courtInfoOf } from '../utils/auctionSummary';
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
const auth = useAuthStore();
const book = usePostWinBook();
onMounted(() => { void book.load(auth.uid); });
watch(() => auth.uid, (uid) => { void book.load(uid); });
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
/** 전화 걸기 — 숫자만 남긴다 */
const telHref = (phone: string) => {
  const d = String(phone ?? '').replace(/[^0-9+]/g, '');
  return d.length >= 8 ? `tel:${d}` : '';
};
/** '2025-10-17' → '25. 10. 17' (자금관리 카드와 같은 꼴) */
const shortYmd = (d?: string) => (d && /^\d{4}[-./]/.test(d) ? d.slice(2).replace(/-/g, '.') : '');

const isChecked = (id: string) => picked.value?.postWinChecks?.[id] === true;
const toggleCheck = async (id: string) => {
  const a = picked.value;
  if (!a) return;
  if (!a.postWinChecks) a.postWinChecks = {};
  a.postWinChecks[id] = !a.postWinChecks[id];
  await store.saveAuction(a);
};
/** 이름 칸을 세울 묶음인가 — 이름이 하나도 없으면 칸 없이 두 칸짜리 표로 둔다 */
const hasLabels = (g: CheckGroup) => g.sections.some((sec) => sectionView(sec).label.trim());
/** 묶음마다 '몇 개 중 몇 개' */
const doneCount = (g: CheckGroup) => groupRows(g).filter((r) => isChecked(r.id)).length;
const rowCount = (g: CheckGroup) => groupRows(g).length;
/** 화면에 보이는 표 — 편집 중에는 고치고 있는 사본을 보여 준다 */
const dayGroups = computed<CheckGroup[]>(() => (editing.value ? draft.value : book.groups.value));

// === 표 고치기 ===
// 글을 다 다듬고 나면 postWinBook.ts 의 POST_WIN_EDITABLE 만 false 로 두면
// 편집 단추가 사라진다. 적어 둔 내용은 그대로 보인다.
const canEdit = POST_WIN_EDITABLE;
const editing = ref(false);
const draft = ref<CheckGroup[]>([]);
const toastText = ref('');
const toast = (text: string) => {
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};
const startEdit = () => {
  draft.value = JSON.parse(JSON.stringify(book.groups.value)) as CheckGroup[];
  editing.value = true;
  collapsed.value = {};
};
const cancelEdit = () => { editing.value = false; draft.value = []; };
const saveEdit = async () => {
  // 빈 줄은 버린다 — 지우려고 글자를 지운 줄이 남지 않게
  const cleaned = draft.value.map((g) => ({
    ...g,
    title: g.title.trim() || '제목 없음',
    note: (g.note ?? '').trim(),
    sections: g.sections
      .map((sec) => ({ ...sec, label: sec.label.trim(), rows: sec.rows.filter((r) => r.text.trim()) }))
      .filter((sec) => sec.rows.length > 0),
  })).filter((g) => g.sections.length > 0);
  await book.save(auth.uid, cleaned);
  editing.value = false;
  draft.value = [];
  toast(auth.uid ? '표를 저장했습니다.' : '로그인한 뒤에 저장됩니다.');
};
const resetEdit = () => {
  draft.value = defaultGroups();
  toast('기본 글로 되돌렸습니다. 저장을 눌러야 굳습니다.');
};
const addRow = (gi: number, si: number) => {
  draft.value[gi].sections[si].rows.push({ id: newRowId(), depth: 0, text: '' });
};
const removeRow = (gi: number, si: number, ri: number) => {
  draft.value[gi].sections[si].rows.splice(ri, 1);
};
/** 줄 올리고 내리기 — 묶음 안에서 자리를 바꾼다 */
const moveRow = (gi: number, si: number, ri: number, step: number) => {
  const rows = draft.value[gi].sections[si].rows;
  const to = ri + step;
  if (to < 0 || to >= rows.length) return;
  const [row] = rows.splice(ri, 1);
  rows.splice(to, 0, row);
};
/** 묶음 자체도 올리고 내린다 */
const moveSection = (gi: number, si: number, step: number) => {
  const secs = draft.value[gi].sections;
  const to = si + step;
  if (to < 0 || to >= secs.length) return;
  const [sec] = secs.splice(si, 1);
  secs.splice(to, 0, sec);
};
/** 들여쓰기 한 단 — 묶음 안에 딸린 말로 내리거나 올린다 */
const bumpDepth = (gi: number, si: number, ri: number) => {
  const row = draft.value[gi].sections[si].rows[ri];
  row.depth = row.depth === 0 ? 1 : 0;
};
const addSection = (gi: number) => {
  draft.value[gi].sections.push({ label: '', rows: [{ id: newRowId(), depth: 0, text: '' }] });
};
const removeSection = (gi: number, si: number) => {
  draft.value[gi].sections.splice(si, 1);
};

/** 낙찰 뒤에 밟는 차례 — 제목 옆 ⓘ 를 누르면 펼친다 */
const FLOW_STEPS: Array<{ name: string; note: string }> = [
  { name: '낙찰', note: '매각허가결정 뒤 대금지급기한 통지를 받는다' },
  { name: '사업자\n등록', note: '매매사업자로 할 때 — 잔금 전에 내 둔다' },
  { name: '매매사업자\n대출', note: '잔금 치르기 전에 한도·금리를 확정한다' },
  { name: '잔금\n납부', note: '기한 안에 납부 — 이때 소유권이 넘어온다' },
  { name: '명도', note: '점유자 인도 — 협의가 막히면 인도명령' },
  { name: '매도', note: '중개 의뢰 · 계약 · 잔금' },
  { name: '예정\n신고', note: '양도일이 속한 달의 말일부터 2개월 안에' },
  { name: '확정\n신고', note: '이듬해 5월에 한 해 몫을 합쳐 신고' },
];
const flowOpen = ref(false);

/** 한 번에 다 접고 다 편다 — 물건상세의 전체 접기와 같다 */
const allCollapsed = computed(
  () => dayGroups.value.length > 0 && dayGroups.value.every((g) => isCollapsed(g.key)),
);
const toggleAll = () => {
  const fold = !allCollapsed.value;
  const next: Record<string, boolean> = {};
  dayGroups.value.forEach((g) => { next[g.key] = fold; });
  collapsed.value = next;
};
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
        <div class="pw-title-row">
          <h1 class="pw-page-title">낙찰이후</h1>
          <!-- 낙찰 뒤에 밟는 차례 -->
          <button type="button" class="pw-info" aria-label="낙찰 후 진행 순서" @click="flowOpen = !flowOpen">i</button>
          <!-- 표 고치기 — 다 다듬고 나면 POST_WIN_EDITABLE 로 잠근다 -->
          <template v-if="canEdit && activeTab === 'win'">
            <template v-if="editing">
              <button type="button" class="pw-ebtn" @click="resetEdit">기본글</button>
              <button type="button" class="pw-ebtn" @click="cancelEdit">취소</button>
              <button type="button" class="pw-ebtn on" @click="saveEdit">저장</button>
            </template>
            <button v-else type="button" class="pw-ebtn" @click="startEdit">✎ 편집</button>
          </template>
        </div>
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

      <!-- 낙찰 후 진행 순서 — 제목 옆 ⓘ 로 연다 -->
      <template v-if="flowOpen">
        <div class="pw-flowveil" @click="flowOpen = false" />
        <section class="pw-flow" @click.stop>
          <header class="pw-flow-head">
            <strong>낙찰 후 진행 순서</strong>
            <button type="button" class="pw-flow-close" aria-label="닫기" @click="flowOpen = false">×</button>
          </header>
          <div class="pw-flow-map">
            <span v-for="(st, i) in FLOW_STEPS" :key="st.name" :class="['pw-flow-box', { last: i === FLOW_STEPS.length - 1 }]">{{ st.name }}</span>
          </div>
          <ol class="pw-flow-list">
            <li v-for="st in FLOW_STEPS" :key="`n-${st.name}`">
              <b>{{ st.name.replace('\n', '') }}</b><span>{{ st.note }}</span>
            </li>
          </ol>
        </section>
      </template>

      <!-- 어느 물건의 일인지 — 탭 밑에 카드로 붙박아 둔다. 누르면 목록이 펼쳐진다 -->
      <div class="pw-objwrap">
        <article v-if="picked" class="pw-obj">
          <!-- 첫 줄: 사건번호 | 관할법원 · 경매계 · 전화 (정보요약에 적어 둔 값) -->
          <p class="top">
            <span class="case lead">{{ picked.caseNumber }}</span>
            <i class="bar" />
            <span class="court">{{ courtInfoOf(picked).name || '–' }}</span>
            <span v-if="courtInfoOf(picked).dept" class="dept">{{ courtInfoOf(picked).dept }}</span>
            <a
              v-if="telHref(courtInfoOf(picked).phone)"
              class="tel"
              :href="telHref(courtInfoOf(picked).phone)"
              @click.stop
            >{{ courtInfoOf(picked).phone }}</a>
          </p>
          <!-- 둘째 줄: 낙찰일 | 주소 -->
          <p class="addrline">
            <span class="pd lead"><em>낙찰일</em><b>{{ shortYmd(picked.wonDate) || '–' }}</b></span>
            <i class="bar" />
            <span class="addr">{{ shortAddr(picked.address) || picked.caseNumber }}</span>
          </p>
        </article>
        <p v-else class="pw-obj empty">낙찰한 물건이 없습니다</p>
        <!-- 띠 오른쪽 끝 — 낙찰목록과 전체 접기를 나란히 둔다 -->
        <div class="pw-objctrl">
          <button type="button" class="pw-objpick" @click.stop="pickOpen = !pickOpen">
            낙찰목록<img :src="chevronDownIcon" :class="['pw-obj-chev', { up: pickOpen }]" alt="" />
          </button>
          <button
            v-if="activeTab === 'win' && !editing"
            type="button"
            class="pw-foldall"
            :aria-label="allCollapsed ? '전체 펼치기' : '전체 접기'"
            :title="allCollapsed ? '전체 펼치기' : '전체 접기'"
            @click="toggleAll"
          >
            <img :src="chevronDownIcon" :class="['pw-chev', { up: allCollapsed }]" alt="" />
          </button>
        </div>

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
                <span class="case lead">{{ a.caseNumber }}</span>
                <i class="bar" />
                <span class="court">{{ courtInfoOf(a).name }}</span>
                <span v-if="courtInfoOf(a).dept" class="dept">{{ courtInfoOf(a).dept }}</span>
              </p>
              <p class="addrline">
                <span class="pd lead"><em>낙찰일</em><b>{{ shortYmd(a.wonDate) || '–' }}</b></span>
                <i class="bar" />
                <span class="addr">{{ shortAddr(a.address) || a.caseNumber }}</span>
              </p>
            </article>
          </div>
        </template>
      </div>
    </div>

    <div class="pw-body">
      <template v-if="activeTab === 'win'">
        <section v-for="(g, gi) in dayGroups" :key="g.key" class="pw-card">
          <header class="pw-card-head" @click="editing || toggleSection(g.key)">
            <input v-if="editing" v-model="g.title" class="pw-einput ttl" placeholder="제목" />
            <h2 v-else>
              <!-- 제목 앞 아이콘 — 서류 열람은 문서, 첫통화·방문은 전화 -->
              <svg v-if="g.key === 'file'" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
              <svg v-else-if="g.key === 'rule'" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <svg v-else-if="g.key === 'visit'" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
              {{ g.title }}
            </h2>
            <em v-if="!editing" class="pw-count">{{ doneCount(g) }}/{{ rowCount(g) }}</em>
            <img v-if="!editing" :src="chevronDownIcon" :class="['pw-chev', { up: isCollapsed(g.key) }]" alt="" />
          </header>
          <div v-if="editing || !isCollapsed(g.key)" class="pw-card-body">
            <textarea v-if="editing" v-model="g.note" class="pw-earea note" rows="2" placeholder="안내 한 줄" />
            <p v-else-if="g.note" class="pw-note">{{ g.note }}</p>
            <table :class="['pw-tbl', { edit: editing }]">
              <colgroup>
                <col v-if="editing || hasLabels(g)" class="pw-col-label" />
                <col />
                <col class="pw-col-chk" />
              </colgroup>
              <tbody>
                <!-- 왼쪽 이름 칸은 그 묶음의 줄 수만큼 세로로 합친다 -->
                <template v-for="(sec, si) in g.sections" :key="si">
                  <tr
                    v-for="(r, ri) in sec.rows"
                    :key="r.id"
                    :class="['pw-row', `d${r.depth}`, { done: !editing && isChecked(r.id), first: ri === 0 }]"
                    @click="editing || toggleCheck(r.id)"
                  >
                    <td v-if="ri === 0 && (editing || hasLabels(g))" class="pw-label" :rowspan="sec.rows.length">
                      <template v-if="editing">
                        <input v-model="sec.label" class="pw-einput lbl" placeholder="이름" />
                        <span class="pw-secbtns">
                          <span class="pw-minirow">
                            <button type="button" class="pw-mini" title="묶음 올리기" @click.stop="moveSection(gi, si, -1)">↑</button>
                            <button type="button" class="pw-mini" title="묶음 내리기" @click.stop="moveSection(gi, si, 1)">↓</button>
                          </span>
                          <button type="button" class="pw-mini" @click.stop="addRow(gi, si)">＋줄</button>
                          <button type="button" class="pw-mini del" @click.stop="removeSection(gi, si)">묶음 빼기</button>
                        </span>
                      </template>
                      <!-- 갈 곳이 있는 이름은 링크로 — 누르면 그 자리로 간다 -->
                      <a
                        v-else-if="sectionView(sec).href"
                        class="pw-labellink"
                        :href="sectionView(sec).href"
                        target="_blank"
                        rel="noopener"
                        @click.stop
                      ><strong>{{ sectionView(sec).label }}</strong><span class="pw-ext">↗</span></a>
                      <strong v-else>{{ sectionView(sec).label }}</strong>
                    </td>
                    <td v-if="editing" class="pw-txt edit">
                      <textarea v-model="r.text" class="pw-earea" rows="2" placeholder="할 일" />
                      <label class="pw-warnchk"><input type="checkbox" v-model="r.warn" /> 빨강</label>
                    </td>
                    <td v-else :class="['pw-txt', { warn: r.warn }]">{{ r.text }}</td>
                    <td class="pw-chk">
                      <template v-if="editing">
                        <button type="button" class="pw-mini" title="줄 올리기" @click.stop="moveRow(gi, si, ri, -1)">↑</button>
                        <button type="button" class="pw-mini" title="줄 내리기" @click.stop="moveRow(gi, si, ri, 1)">↓</button>
                        <button type="button" class="pw-mini" :title="r.depth === 0 ? '한 단 들여쓰기' : '내어쓰기'" @click.stop="bumpDepth(gi, si, ri)">{{ r.depth === 0 ? '→' : '←' }}</button>
                        <button type="button" class="pw-mini del" title="줄 빼기" @click.stop="removeRow(gi, si, ri)">×</button>
                      </template>
                      <input v-else type="checkbox" :checked="isChecked(r.id)" :disabled="!picked" @click.stop="toggleCheck(r.id)" />
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <button v-if="editing" type="button" class="pw-addsec" @click="addSection(gi)">＋ 묶음 추가</button>
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
    <AppToast :visible="!!toastText" :text="toastText" tone="success" />
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
.pw-fixed-top {
  flex: 0 0 auto; position: relative; z-index: 20; background: #dcdee3;
  box-shadow: 0 2px 6px rgba(17, 24, 39, 0.06);
}
.pw-body {
  flex: 1 1 auto; overflow-y: auto;
  /* 좌우 여백은 물건상세(.adp-body)와 같은 5px — 카드가 화면을 넓게 쓴다 */
  padding: 10px 5px 96px;
  /* 카드 사이 틈은 권리분석(.adp-body)과 같이 8px */
  display: flex; flex-direction: column; gap: 8px;
  -webkit-overflow-scrolling: touch;
}

/* 제목·탭 줄 — 물건상세의 고정줄(.adp-sticky-head)과 같은 꼴:
   흰 바탕(제목·탭) → 블루그레이 띠(물건 카드) → 진한 회색 6px → 본문 */
.pw-header { background: #fff; }
/* 제목 — 자금관리·물건상세와 같은 크기·같은 여백 */
.pw-page-title {
  margin: 0; padding: 9px 14px 7px;
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
/* 고정 박스 — 물건상세의 주소줄(.adp-prop-head)처럼 한 가지 블루그레이 띠다.
   카드와 둘레가 같은 색이라 색이 끊기는 자투리가 없다.
   오른쪽 끝에는 전체 접기 단추가 선다 */
.pw-objwrap {
  position: relative; padding: 7px 8px 8px;
  background: #f1f3f7; border-bottom: 6px solid #dcdee3;
  /* 접기 단추는 둘째 줄(주소 줄) 오른쪽에 선다 — 물건상세와 같은 자리 */
  display: flex; align-items: flex-end; gap: 6px;
}
.pw-objwrap > .pw-obj { flex: 1 1 auto; min-width: 0; }
.pw-obj {
  border: none; border-radius: 10px; padding: 2px 2px 3px;
  background: transparent;
}
.pw-obj:active { background: #e7ebf2; border-radius: 8px; }
.pw-obj.empty {
  margin: 0; text-align: center; color: #9ca3af; font-size: 12.5px; font-weight: 600; cursor: default;
}
/* 카드 안의 글자는 한 크기로 쓴다 */
.pw-obj .top,
.pw-obj .addrline { font-size: 12.5px; }
.pw-obj .top { margin: 0; display: flex; align-items: center; gap: 7px; }
/* 낙찰목록 단추 — 이것만 목록을 편다 */
.pw-objctrl { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }
.pw-objpick {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 1px;
  height: 26px; padding: 0 5px 0 8px;
  border: 1px solid #c7d0de; border-radius: 7px; background: #fff;
  font-family: inherit; font-size: 11px; font-weight: 700; color: #475467; cursor: pointer;
}
.pw-objpick:active { background: #eef2f8; }
.pw-obj .pd { display: inline-flex; align-items: baseline; gap: 5px; }
.pw-obj .pd em { font-style: normal; font-size: 12.5px; font-weight: 500; color: #111827; }
.pw-obj .pd b { font-size: 12.5px; font-weight: 500; color: #111827; white-space: nowrap; }
.pw-obj .case { font-size: 12.5px; font-weight: 600; color: #2b6df3; white-space: nowrap; }
.pw-obj .court { font-size: 12.5px; font-weight: 500; color: #374151; white-space: nowrap; }
.pw-obj .dept { font-size: 12.5px; font-weight: 500; color: #6b7280; white-space: nowrap; }
.pw-obj .tel { font-size: 12.5px; font-weight: 600; color: #2b6df3; text-decoration: none; white-space: nowrap; }
/* 두 줄의 막대기가 같은 세로선에 서도록 앞 칸의 폭을 못 박는다 */
/* 두 줄의 막대기가 같은 세로선에 서도록 앞 칸의 폭을 못 박는다.
   주소가 길어질 수 있어 될 수 있는 대로 좁게 잡는다 */
.pw-obj .lead { flex: 0 0 94px; min-width: 0; }
/* 칸을 가르는 세로 막대기 */
.pw-obj .bar {
  flex: 0 0 auto; width: 1px; height: 11px; background: #d4dae4; margin: 0 1px;
}
/* 둘째 줄 — 낙찰일 | 주소 */
.pw-obj .addrline {
  margin: 4px 0 0; display: flex; align-items: center; gap: 7px; min-width: 0;
}
.pw-obj .addr {
  min-width: 0; font-size: 12.5px; font-weight: 600; color: #374151;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pw-obj-chev { width: 18px; height: 18px; object-fit: contain; transition: transform 0.2s; }
.pw-obj-chev.up { transform: rotate(180deg); }
/* 고른 물건을 바꿀 때만 펼친다 — 밑의 표를 밀지 않도록 떠 있게 둔다 */
.pw-objveil { position: fixed; inset: 0; z-index: 30; }
.pw-objlist {
  position: absolute; left: 8px; right: 8px; top: calc(100% - 4px); z-index: 31;
  max-height: 46vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
  padding: 6px; border-radius: 12px; background: #fff;
  border: 1px solid #dde3ee; box-shadow: 0 10px 24px rgba(17, 24, 39, 0.16);
}
.pw-objlist .pw-obj {
  border: 1px solid #dde3ee; background: #fff; padding: 7px 9px 8px; cursor: pointer;
}
.pw-obj.row.on { border-color: #2b6df3; background: #f5f8ff; }

/* 카드 — 물건상세(.adp-card)와 같은 꼴 */
.pw-card { flex: 0 0 auto; background: #fff; border-radius: 8px; padding: 0 8px 7px; }
/* 제목줄 — 표와의 사이를 너무 빡빡하지 않게 한 뼘 줄인다 (글자 크기는 그대로) */
.pw-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 4px 5px; min-height: 34px; box-sizing: border-box; cursor: pointer;
}
.pw-card-head h2 {
  margin: 0; font-size: 15.3px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 5px; min-width: 0;
}
.pw-h2-ico { flex: 0 0 auto; color: #2a5fbf; }
.pw-count { margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 800; color: #2b6df3; }
.pw-chev { width: 22px; height: 22px; object-fit: contain; transition: transform 0.2s; }
.pw-chev.up { transform: rotate(180deg); }
/* 안내 한 줄 — 파란 상자로 둔다. 왜 하는 일인지가 중요해서다
   (권리분석의 .adp-rcase-banner 와 같은 꼴) */
.pw-note {
  margin: 0 0 6px; padding: 7px 10px;
  background: #eaf1ff; border-radius: 8px;
  font-size: 12.5px; font-weight: 700; color: #1d4ed8; line-height: 1.5;
}

/* 체크리스트 표 — 테두리와 모서리는 물건상세의 표(.adp-table)와 같다.
   radius 가 먹으려면 border-collapse 가 separate 여야 한다 */
.pw-tbl {
  width: 100%; table-layout: fixed;
  border-collapse: separate; border-spacing: 0;
  background: #fff;
  /* 분홍 칸 위에서도 선이 보이게 한 단 진한 회색을 쓴다 */
  border: 1px solid #d0d5dd; border-radius: 8px;
}
.pw-tbl > tbody > tr > td { border-bottom: 1px solid #d0d5dd; }
.pw-tbl > tbody > tr:last-child > td { border-bottom: 0; }
/* 네 모서리 — 배경이 모서리를 따라 깎이게 한다 */
.pw-tbl > tbody:first-of-type > tr:first-child > :first-child { border-top-left-radius: 8px; }
.pw-tbl > tbody:first-of-type > tr:first-child > :last-child { border-top-right-radius: 8px; }
.pw-tbl > tbody:last-of-type > tr:last-child > :first-child { border-bottom-left-radius: 8px; }
.pw-tbl > tbody:last-of-type > tr:last-child > :last-child { border-bottom-right-radius: 8px; }
/* 이름 칸 — 글자 크기는 그대로 두고 폭만 좁게 */
.pw-col-label { width: 96px; }
.pw-col-chk { width: 34px; }
.pw-tbl.edit .pw-col-chk { width: 44px; }
.pw-minirow { display: flex; gap: 3px; }
.pw-minirow .pw-mini { flex: 1 1 0; }
/* 이름 칸은 권리분석 표와 같은 꼴 — 분홍 바탕에 가운데, 오른쪽에 가름선 */
.pw-row td.pw-label,
.pw-label {
  background: #fde7e7; text-align: center; vertical-align: middle;
  color: #111827; font-weight: 700;
  border-right: 1px solid #d0d5dd;
  padding: 9px 6px !important;
}
/* 이름에 넣은 줄 내림은 그대로 보이고, 낱말 가운데서는 끊기지 않는다 */
.pw-label strong { font-size: 12px; line-height: 1.35; white-space: pre-line; word-break: keep-all; }
/* 갈 곳이 있는 이름 — 파랗게, 뒤에 작은 화살표 */
/* 줄 내림이 있는 이름이라 inline 으로 둔다 — ↗ 가 마지막 글자 뒤에 붙는다 */
.pw-labellink { color: #2b6df3; text-decoration: none; display: inline; }
.pw-labellink strong { font-size: 12px; line-height: 1.35; white-space: pre-line; word-break: keep-all; text-decoration: underline; }
.pw-ext { font-size: 9.5px; margin-left: 2px; }
.pw-row { cursor: pointer; }
.pw-row:hover { background: #f7f9fd; }
.pw-row td { padding: 9px 6px; vertical-align: top; }
.pw-chk { width: 34px; text-align: center; }
.pw-chk input { width: 16px; height: 16px; accent-color: #2b6df3; cursor: pointer; }
/* 편집에서 넣은 줄 내림이 그대로 보이게 한다 */
.pw-txt { font-size: 12.5px; line-height: 1.45; white-space: pre-line; padding: 9px 10px 9px 12px !important; }
.pw-row td.pw-txt { font-weight: 400; color: #374151; }
/* 묶음 안에 딸린 말은 한 단 들여쓴다 */
.pw-row.d1 .pw-txt { padding-left: 24px !important; color: #4b5563; }
.pw-row td.pw-txt.warn { color: #e0574a; }
.pw-row.done .pw-txt { color: #9ca3af; text-decoration: line-through; }

/* 제목 옆 ⓘ 와 낙찰 후 진행 순서 */
.pw-info {
  flex: 0 0 auto; margin-right: auto; margin-left: 3px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 19px; height: 19px; padding: 0;
  border: none; border-radius: 50%; background: #2b6df3;
  font-family: inherit; font-size: 12.5px; font-weight: 800; font-style: italic;
  color: #fff; line-height: 1; cursor: pointer;
}
.pw-info:active { background: #1d4ed8; }
.pw-flowveil { position: fixed; inset: 0; z-index: 40; background: rgba(17, 24, 39, 0.3); }
.pw-flow {
  position: absolute; left: 8px; right: 8px; top: 46px; z-index: 41;
  max-height: 74vh; overflow-y: auto;
  border: 1px solid #dde3ee; border-radius: 12px; background: #fff;
  box-shadow: 0 12px 28px rgba(17, 24, 39, 0.18);
  padding: 10px 12px 12px;
}
.pw-flow-head { display: flex; align-items: center; margin-bottom: 9px; }
.pw-flow-head strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.pw-flow-close {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-size: 18px; line-height: 1; color: #9ca3af; padding: 0 2px;
}
/* 차례 그림 — 한 줄에 넷씩, 네모는 모두 같은 크기 */
.pw-flow-map {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 14px;
  padding: 8px 2px 12px; border-bottom: 1px solid #eef1f6;
}
.pw-flow-box {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  min-height: 46px; padding: 5px 4px;
  border: 1.5px solid #2b6df3; border-radius: 8px; background: #f4f7ff;
  font-size: 11.5px; font-weight: 700; line-height: 1.25; color: #1d3d75;
  text-align: center; white-space: pre-line; word-break: keep-all;
}
/* 네모 사이 화살표 — 줄 끝과 마지막 네모 뒤에는 두지 않는다 */
.pw-flow-box:not(:nth-child(4n)):not(.last)::after {
  content: '▶';
  position: absolute; right: -12px; top: 50%; transform: translateY(-50%);
  font-size: 9px; color: #9aa6bb;
}
/* 한 줄 설명 — 이름 칸은 '매매사업자대출'이 한 줄로 들어갈 만큼 */
.pw-flow-list { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.pw-flow-list li { display: flex; gap: 8px; align-items: baseline; font-size: 12px; line-height: 1.45; }
.pw-flow-list b {
  flex: 0 0 96px; color: #1d4ed8; font-weight: 800;
  white-space: nowrap; word-break: keep-all;
}
.pw-flow-list span { flex: 1 1 auto; min-width: 0; color: #374151; }

/* 표 고치기 */
/* ⓘ 는 제목에 바짝 붙이고, 나머지 단추는 오른쪽 끝에 */
.pw-title-row { display: flex; align-items: center; gap: 0; padding-right: 14px; border-bottom: 1px solid #e5e7eb; }
.pw-title-row .pw-foldall,
.pw-title-row .pw-ebtn { margin-left: 6px; }
/* 제목 바로 옆에 ⓘ 가 붙고, 나머지 단추는 오른쪽 끝으로 밀린다 */
.pw-title-row .pw-page-title { flex: 0 0 auto; padding-right: 0; border-bottom: none; }
/* 전체 접기 — 물건상세의 전체 접기(.adp-fold-all)와 같은 네모 상자에 꺾쇠 */
.pw-foldall {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 26px; padding: 0;
  border: 1px solid #e3e8f0; border-radius: 8px; background: #fff; cursor: pointer;
}
.pw-foldall:active { background: #f2f6ff; }
.pw-foldall .pw-chev { width: 16px; height: 16px; }
.pw-ebtn {
  flex: 0 0 auto; height: 26px; padding: 0 10px;
  border: 1px solid #c7d7f8; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.pw-ebtn.on { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.pw-einput {
  width: 100%; box-sizing: border-box; height: 28px;
  border: 1px solid #dde3ee; border-radius: 6px; background: #fff;
  padding: 2px 7px; font-family: inherit; font-size: 12px; color: #111827;
}
.pw-einput.ttl { max-width: 60%; font-size: 15px; font-weight: 800; height: 32px; }
.pw-einput.lbl { text-align: center; font-weight: 700; }
.pw-earea {
  width: 100%; box-sizing: border-box; resize: vertical;
  border: 1px solid #dde3ee; border-radius: 6px; background: #fff;
  padding: 5px 7px; font-family: inherit; font-size: 12.5px; line-height: 1.45; color: #374151;
}
.pw-earea.note { margin-bottom: 8px; background: #eaf1ff; border-color: #c7d7f8; color: #1d4ed8; font-weight: 700; }
.pw-txt.edit { padding: 6px 8px !important; }
.pw-warnchk {
  display: inline-flex; align-items: center; gap: 3px; margin-top: 3px;
  font-size: 10.5px; font-weight: 700; color: #e0574a; cursor: pointer;
}
.pw-warnchk input { width: 13px; height: 13px; accent-color: #e0574a; }
.pw-secbtns { display: flex; flex-direction: column; gap: 3px; margin-top: 5px; }
.pw-mini {
  border: 1px solid #dde3ee; border-radius: 6px; background: #fff;
  padding: 2px 5px; font-family: inherit; font-size: 10.5px; font-weight: 700;
  color: #2b6df3; cursor: pointer; line-height: 1.4;
}
.pw-mini.del { border-color: #f0d4d0; background: #fdecea; color: #e0574a; }
.pw-chk .pw-mini + .pw-mini { margin-top: 3px; }
.pw-addsec {
  width: 100%; margin-top: 8px; padding: 8px 0;
  border: 1px dashed #c7d2e3; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #2b6df3; cursor: pointer;
}

.pw-empty {
  margin: 0; padding: 22px 16px 24px; text-align: center;
  font-size: 12.5px; color: #9ca3af; font-weight: 600;
}
</style>
