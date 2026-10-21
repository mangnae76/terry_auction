<script setup lang="ts">
// 낙찰 이후 — 명도와 매도까지의 일을 모아 둘 자리.
// 틀은 자금관리(.fin-shell)와 같은 짜임이다: 위는 붙박이(제목 + 탭 + 물건 카드),
// 아래만 구른다. 카드는 물건상세의 권리분석과 같은 꼴 — 제목줄을 누르면 접힌다.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { shortAddr } from '../utils/address';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import FormattedNumberInput from '../components/FormattedNumberInput.vue';
import SellStatusTable from '../components/SellStatusTable.vue';
import AgencyBookModal from '../components/AgencyBookModal.vue';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { groupRows, sectionView, type CheckGroup } from '../services/postWinChecklist';
import { POST_WIN_EDITABLE, defaultGroups, newRowId, usePostWinBook, type BookKey } from '../services/postWinBook';
import { useInteriorStore } from '../stores/interiorStore';
import type { InteriorExpenseRecord } from '../types/finance';
import { formatPhone } from '../utils/phone';
import { bidStageOf } from '../utils/stageLabel';
import { courtInfoOf } from '../utils/auctionSummary';
import type { AgencyRow, AuctionDetail } from '../types/auction';

type TabKey = 'win' | 'biz' | 'balance' | 'evict' | 'repair' | 'sell';
const TABS: Array<{ key: TabKey; label: string; desc: string }> = [
  { key: 'win', label: '낙찰당일', desc: '낙찰가·경쟁 상황, 영수증과 서류 챙기기' },
  { key: 'biz', label: '사업자등록', desc: '매매사업자 등록 · 사업용 계좌 · 사업용 카드' },
  { key: 'balance', label: '잔금·등기', desc: '잔금 납부일, 등기 촉탁, 취득세' },
  { key: 'evict', label: '명도', desc: '점유자 확인, 인도명령·강제집행, 이사비 협의' },
  { key: 'repair', label: '인테리어', desc: '수리 범위와 비용, 업체 일정' },
  { key: 'sell', label: '매도·임대', desc: '내놓은 가격, 중개업소, 계약 일정' },
];
const route = useRoute();
const router = useRouter();
const TAB_KEYS: TabKey[] = ['win', 'biz', 'balance', 'evict', 'repair', 'sell'];
/** 주소에 적힌 탭으로 연다 — '뒤로' 왔을 때 보던 자리를 지킨다 */
const initialTab = (): TabKey => {
  const wanted = String(route.query.tab ?? '');
  return (TAB_KEYS as string[]).includes(wanted) ? (wanted as TabKey) : 'win';
};
const activeTab = ref<TabKey>(initialTab());
/** 탭 옮기기 — 아래쪽을 보고 있었다면 탭 줄이 보이는 자리까지 부드럽게 올라간다 */
const goTab = (key: TabKey) => {
  activeTab.value = key;
  if (typeof window === 'undefined') return;
  const bar = document.querySelector('.pw-tabs');
  const top = bar ? bar.getBoundingClientRect().top + window.scrollY - 8 : 0;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
};
watch(activeTab, (tab) => {
  if (String(route.query.tab ?? '') === tab) return;
  void router.replace({ query: { ...route.query, tab } });
});
const current = () => TABS.find((t) => t.key === activeTab.value) ?? TABS[0];
/** 탭을 옮기면 고치던 것은 접어 둔다 — 다른 탭 글에 덮어쓰지 않게 */
watch(activeTab, () => { editing.value = false; draft.value = []; });

const store = useAuctionStore();
const auth = useAuthStore();
const dayBook = usePostWinBook('day');
const bizBook = usePostWinBook('biz');
const loanBook = usePostWinBook('loan');
const evictBook = usePostWinBook('evict');
/** 탭마다 보는 표가 다르다 */
const BOOK_OF: Partial<Record<TabKey, typeof dayBook>> = {
  win: dayBook, biz: bizBook, balance: loanBook, evict: evictBook,
};
const book = computed(() => BOOK_OF[activeTab.value] ?? dayBook);
const BOOK_KEY_OF: Partial<Record<TabKey, BookKey>> = { win: 'day', biz: 'biz', balance: 'loan', evict: 'evict' };
const bookKeyOf = (tab: TabKey): BookKey => BOOK_KEY_OF[tab] ?? 'day';
onMounted(() => {
  void dayBook.load(auth.uid); void bizBook.load(auth.uid);
  void loanBook.load(auth.uid); void evictBook.load(auth.uid);
});
watch(() => auth.uid, (uid) => {
  void dayBook.load(uid); void bizBook.load(uid);
  void loanBook.load(uid); void evictBook.load(uid);
});
/** 낙찰 뒤의 물건만 고른다 — 낙찰·매도 단계 */
const ownedAuctions = computed(() => store.auctions.filter((a) => {
  const stage = bidStageOf(a);
  return stage === '낙찰' || stage === '매도';
}));
const pickedId = ref(String(route.query.item ?? ''));
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
/** 고른 물건도 주소에 적어 둔다 */
watch(pickedId, (id) => {
  if (String(route.query.item ?? '') === id) return;
  void router.replace({ query: { ...route.query, item: id || undefined } });
});

/** 전화 걸기 — 숫자만 남긴다 */
const telHref = (phone: string) => {
  const d = String(phone ?? '').replace(/[^0-9+]/g, '');
  return d.length >= 8 ? `tel:${d}` : '';
};
/** '2025-10-17' → '25. 10. 17' (자금관리 카드와 같은 꼴) */
const shortYmd = (d?: string) => (d && /^\d{4}[-./]/.test(d) ? d.slice(2).replace(/-/g, '.') : '');

/** 비고 — 가운뎃점으로 이어 붙인 두 가지는 줄을 내려 적는다 (칸이 좁아 한 줄로는 꺾인다) */
const memoText = (memo?: string) => (memo ?? '')
  .replace(/\s*·\s*/g, '\n')
  // '동사무소 발급 유효기간 한 달' 처럼 두 가지가 한 줄에 붙어 있으면 뒤엣것을 내린다
  .replace(/(.+?)\s*(유효기간)/g, (_m, head: string, tail: string) => (
    head.trim() ? `${head.trim()}\n${tail}` : tail
  ));

const isChecked = (id: string) => picked.value?.postWinChecks?.[id] === true;
const toggleCheck = async (id: string) => {
  const a = picked.value;
  if (!a) return;
  if (!a.postWinChecks) a.postWinChecks = {};
  a.postWinChecks[id] = !a.postWinChecks[id];
  await store.saveAuction(a);
};
/** 띠에서 그 칸의 가운데가 가로로 몇 %인지 — 쪽지를 날짜 옆에 붙일 때 쓴다 */
const colCenter = (cols: string | undefined, n: number, idx: number): string => {
  const parts = (cols ?? '').trim()
    ? (cols as string).trim().split(/\s+/).map((v) => Number.parseFloat(v) || 1)
    : Array.from({ length: n }, () => 1);
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const before = parts.slice(0, idx).reduce((a, b) => a + b, 0);
  return `${((before + (parts[idx] ?? 1) / 2) / total) * 100}%`;
};

/** 큰 제목으로 묶인 덩어리들 — 잇달아 같은 제목을 단 상자끼리 한 울타리가 된다.
 *  제목이 없는 상자는 울타리 없이 홀로 선다. */
const blocks = computed(() => {
  const out: Array<{ super: string; groups: CheckGroup[]; at: number[] }> = [];
  dayGroups.value.forEach((g, i) => {
    const sup = (g.super ?? '').trim();
    const last = out[out.length - 1];
    if (last && last.super === sup && sup) {
      last.groups.push(g);
      last.at.push(i);
    } else {
      out.push({ super: sup, groups: [g], at: [i] });
    }
  });
  return out;
});
/** '부수' 칸을 세울 묶음인가 — 적어 둔 줄이 하나라도 있으면 세운다 */
const hasQty = (g: CheckGroup) => g.sections.some((sec) => sec.rows.some((r) => (r.qty ?? '').trim()));
/** '비고' 칸도 마찬가지 */
const hasMemo = (g: CheckGroup) => g.sections.some((sec) => sec.rows.some((r) => (r.memo ?? '').trim()));
/** 이름 칸을 세울 묶음인가 — 이름이 하나도 없으면 칸 없이 두 칸짜리 표로 둔다 */
const hasLabels = (g: CheckGroup) => g.sections.some((sec) => sectionView(sec).label.trim());
/** 묶음마다 '몇 개 중 몇 개' */
const doneCount = (g: CheckGroup) => groupRows(g).filter((r) => isChecked(r.id)).length;
const rowCount = (g: CheckGroup) => groupRows(g).length;
/** 화면에 보이는 표 — 편집 중에는 고치고 있는 사본을 보여 준다 */
const dayGroups = computed<CheckGroup[]>(
  () => (editing.value ? draft.value : book.value.groups.value),
);
/** 표가 있는 탭인가 */
const hasTable = computed(() => activeTab.value in BOOK_OF);
/** 체크 칸을 두는 탭인가 — 사업자등록은 한 번 해 두면 되는 일이라 체크가 없다 */
const checkable = computed(() => activeTab.value === 'win' || activeTab.value === 'balance' || activeTab.value === 'evict');

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
  draft.value = JSON.parse(JSON.stringify(book.value.groups.value)) as CheckGroup[];
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
  await book.value.save(auth.uid, cleaned);
  editing.value = false;
  draft.value = [];
  toast(auth.uid ? '표를 저장했습니다.' : '로그인한 뒤에 저장됩니다.');
};
const resetEdit = () => {
  draft.value = defaultGroups(bookKeyOf(activeTab.value));
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
/** 연 방법 — 마우스로 띄웠을 때는 뒤를 덮지 않는다 */
const flowByHover = ref(false);
/** 마우스가 있는 기기(PC)에서는 올려놓기만 해도 뜬다. 손가락은 눌러야 뜬다 */
const canHover = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let flowHideTimer = 0;
const flowHoverIn = () => {
  if (!canHover) return;
  window.clearTimeout(flowHideTimer);
  flowByHover.value = true;
  flowOpen.value = true;
};
const flowHoverOut = () => {
  if (!canHover || !flowByHover.value) return;
  // 단추에서 설명으로 마우스가 건너갈 틈을 준다
  flowHideTimer = window.setTimeout(() => { flowOpen.value = false; flowByHover.value = false; }, 180);
};
const flowClick = () => {
  window.clearTimeout(flowHideTimer);
  flowByHover.value = false;
  flowOpen.value = !flowOpen.value;
};

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
// === 인테리어 비용 ===
// 자금관리의 사업지출과 같은 꼴이되 자리는 따로다 — 여기 적은 것은 여기에만 남는다
const interior = useInteriorStore();
onMounted(() => interior.initialize());
/** 인테리어 탭의 두 표 — 꼴은 같고 자리만 다르다 */
const INT_CARDS: Array<{
  kind: 'bid' | 'cost'; title: string; file: string;
  /** 칸 이름 — 비딩은 견적·협의내용, 비용은 비용·현황 */
  amount: string; status: string;
}> = [
  // 업체비딩은 더보기 › 인테리어 업체 관리로 옮겼다 (물건과 묶지 않고 적는다)
  { kind: 'cost', title: '인테리어 현황', file: '인테리어현황.csv', amount: '비용', status: '현황' },
];
const cardOf = (kind: 'bid' | 'cost') => INT_CARDS.find((c) => c.kind === kind) ?? INT_CARDS[0];
/** 고른 물건의 것만 본다 — 물건은 위 카드에서 고르므로 적을 때 또 고르지 않는다 */
const rowsOf = (kind: 'bid' | 'cost') => interior.rows
  .filter((r) => r.auctionId === (picked.value?.id ?? '') && (r.kind ?? 'cost') === kind)
  .sort((a, b) => ((b.startDate || b.date || '')).localeCompare(a.startDate || a.date || ''));
const totalOf = (kind: 'bid' | 'cost') => rowsOf(kind)
  .reduce((sum, r) => sum + (r.amountWithVat || 0), 0);
const money = (n: number) => (n || 0).toLocaleString('ko-KR');
/** 표 안의 날짜 — '26.10.19' (엑셀에는 연-월-일 전부 적는다) */
const shortDate = (d: string) => (d && d.length >= 10 ? d.slice(2).replace(/-/g, '.') : (d || ''));

type IntDraft = Partial<InteriorExpenseRecord> & { id?: string };
const intOpen = ref(false);
const intDraft = ref<IntDraft>({});
const todayIso = () => new Date().toISOString().slice(0, 10);
const INT_STATUS = ['예정', '진행', '완료'];
const openIntAdd = (kind: 'bid' | 'cost') => {
  intDraft.value = {
    kind,
    status: kind === 'bid' ? '' : '예정',
    startDate: todayIso(),
    endDate: '',
    work: '',
    amountWithVat: 0,
    vendor: '',
    phone: '',
    note: '',
  };
  intOpen.value = true;
};
const openIntEdit = (row: InteriorExpenseRecord) => {
  intDraft.value = { ...row };
  intOpen.value = true;
};
const saveInt = async () => {
  const d = intDraft.value;
  const a = picked.value;
  await interior.save({
    ...d,
    // 물건은 늘 위에서 고른 그 물건이다
    auctionId: a?.id ?? '',
    auctionLabel: a ? (shortAddr(a.address) || a.caseNumber) : '',
    amountWithVat: Number(d.amountWithVat ?? 0),
  });
  intOpen.value = false;
  toast('저장했습니다.');
};
const removeInt = async () => {
  const id = intDraft.value.id;
  if (!id) { intOpen.value = false; return; }
  await interior.remove(id);
  intOpen.value = false;
  toast('지웠습니다.');
};
/** 엑셀(csv)로 내려받기 — 자금관리와 같은 방식 */
const exportInterior = (kind: 'bid' | 'cost', file: string) => {
  const esc = (v: string | number) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows: Array<Array<string | number>> = [
    ['시작', '완료', '작업내용', cardOf(kind).status, `${cardOf(kind).amount}(VAT포함)`, '업체명', '연락처', '비고'],
    ...rowsOf(kind).map((r) => [
      r.startDate || r.date || '', r.endDate, r.work, r.status,
      r.amountWithVat, r.vendor, r.phone, r.note,
    ]),
  ];
  const text = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  a.click();
  URL.revokeObjectURL(url);
};

// === 매도·임대 · 부동산 상담 ===
// 손품·현장의 '4. 부동산 현장 상담'과 같은 표를 쓴다 (components/AgencyTable).
// 적어 둔 줄은 그 물건에 붙어 저장된다.
const SELL_ROW_MIN = 1;
const emptyAgencyRow = (): AgencyRow => ({
  name: '', phone: '', info: '', monthly: '', jeonse: '', real: '', urgent: '', note: '',
  // 매수문의 자리는 미리 비워 둔다 — 나중에 더할 때 바로 담긴다
  buyers: [],
});
/** 매도·임대의 두 표 — 중개 의뢰 현황과 직거래 (꼴은 같고 자리만 다르다) */
type SellKey = 'sellAgencyRows' | 'directSellRows';
/** 중개업체 관리 팝업 — 상담표에서 바로 열어 업체를 더한다 */
const agencyBookOpen = ref(false);

const SELL_CARDS: Array<{
  key: SellKey; title: string; mode: 'agency' | 'direct';
  /** 제목줄 오른쪽 바로가기 (직거래 올리는 자리들) */
  links?: Array<{ label: string; url: string }>;
}> = [
  { key: 'sellAgencyRows', title: '중개 의뢰 현황', mode: 'agency' },
  {
    key: 'directSellRows',
    title: '직거래 등록',
    mode: 'direct',
    // 열어 보고 주소를 확인했다 (33m²는 봇 막음이 있어 실제 브라우저에서 열린다)
    links: [
      { label: '당근', url: 'https://realty.daangn.com/' },
      { label: '피터팬', url: 'https://www.peterpanz.com/' },
      { label: '33m²', url: 'https://33m2.co.kr/' },
    ],
  },
];
const sellRowsOf = (key: SellKey): AgencyRow[] => {
  const a = picked.value;
  if (!a) return [];
  if (!a[key]) a[key] = [emptyAgencyRow()];
  const rows = a[key] as AgencyRow[];
  while (rows.length < SELL_ROW_MIN) rows.push(emptyAgencyRow());
  return rows;
};
let sellSaveTimer = 0;
/** 적는 동안 줄줄이 저장하지 않는다 — 잠깐 멈추면 그때 한 번 담는다 */
const persistSell = () => {
  const a = picked.value;
  if (!a) return;
  window.clearTimeout(sellSaveTimer);
  sellSaveTimer = window.setTimeout(() => { void store.saveAuction(a); }, 700);
};
const addSellRow = (key: SellKey) => {
  const a = picked.value;
  if (!a) return;
  if (!a[key]) a[key] = [];
  (a[key] as AgencyRow[]).push(emptyAgencyRow());
  persistSell();
};
const removeSellRow = (key: SellKey, idx: number) => {
  const rows = picked.value?.[key] as AgencyRow[] | undefined;
  if (!rows) return;
  rows.splice(idx, 1);
  persistSell();
};
const removeLastSellRow = (key: SellKey) => {
  const rows = picked.value?.[key] as AgencyRow[] | undefined;
  if (!rows || rows.length <= SELL_ROW_MIN) return;
  rows.splice(rows.length - 1, 1);
  persistSell();
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
          <h1 class="pw-page-title">
            <button type="button" class="pg-back-shared" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
            낙찰이후
          </h1>
          <!-- 낙찰 뒤에 밟는 차례 -->
          <button
            type="button"
            class="pw-info"
            aria-label="낙찰 후 진행 순서"
            @click="flowClick"
            @mouseenter="flowHoverIn"
            @mouseleave="flowHoverOut"
          >i</button>
          <!-- 표 고치기 — 다 다듬고 나면 POST_WIN_EDITABLE 로 잠근다 -->
          <template v-if="canEdit && hasTable">
            <template v-if="editing">
              <button type="button" class="pw-ebtn" @click="resetEdit">기본글</button>
              <button type="button" class="pw-ebtn" @click="cancelEdit">취소</button>
              <button type="button" class="pw-ebtn on" @click="saveEdit">저장</button>
            </template>
            <button v-else type="button" class="pw-ebtn" @click="startEdit">✎ 편집</button>
          </template>
        </div>
        <!-- 체크는 '그 물건의 기록'이라 물건을 골라야 눌린다 — 까닭을 적어 둔다 -->
        <p v-if="checkable && !picked" class="pw-nopick">
          낙찰한 물건을 고르면 체크할 수 있습니다 — 선정물건에서 단계를 <b>낙찰</b>로 바꿔 주세요.
        </p>
        <nav class="pw-tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            :class="['pw-tab', { active: activeTab === t.key }]"
            @click="goTab(t.key)"
          >{{ t.label }}</button>
        </nav>
      </header>

      <!-- 낙찰 후 진행 순서 — 제목 옆 ⓘ 로 연다 -->
      <template v-if="flowOpen">
        <div v-if="!flowByHover" class="pw-flowveil" @click="flowOpen = false" />
        <section
          class="pw-flow"
          @click.stop
          @mouseenter="flowHoverIn"
          @mouseleave="flowHoverOut"
        >
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
            v-if="hasTable && !editing"
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

    <div :key="activeTab" class="pw-body">
      <template v-if="hasTable">
       <div v-for="(blk, bi) in blocks" :key="`blk-${bi}`" :class="['pw-wrap', { super: blk.super }]">
        <!-- 큰 제목 — 상자들을 한 울타리로 묶는다 -->
        <header v-if="blk.super" class="pw-super-head" @click="toggleSection(`__super-${bi}`)">
          <h2>
            <svg class="pw-h2-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"/></svg>
            {{ blk.super }}
          </h2>
          <img :src="chevronDownIcon" :class="['pw-chev', { up: isCollapsed(`__super-${bi}`) }]" alt="" />
        </header>
        <template v-if="!blk.super || !isCollapsed(`__super-${bi}`)">
        <section v-for="(g, ei) in blk.groups" :key="g.key" class="pw-card">
          <header class="pw-card-head" @click="editing || toggleSection(g.key)">
            <span v-if="editing" class="pw-ttlwrap">
              <input v-model="g.title" class="pw-einput ttl" placeholder="제목" />
              <input v-model="g.url" class="pw-einput link ttl-link" placeholder="제목 링크 (https://…)" />
            </span>
            <h2 v-else>
              <!-- 울타리 안에서는 아이콘 대신 번호를 단다 (손품·현장과 같은 규칙) -->
              <span v-if="blk.super" class="pw-no">{{ ei + 1 }}</span>
              <template v-else>
              <!-- 제목 앞 아이콘 — 서류 열람은 문서, 첫통화·방문은 전화 -->
              <svg v-if="g.key === 'file'" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
              <svg v-else-if="g.key === 'rule'" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
<svg v-else-if="g.key.startsWith('ev.')" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
<svg v-else-if="g.key.startsWith('loan.')" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"/></svg>
<svg v-else-if="g.key.startsWith('biz.')" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 12h20"/></svg>
              <svg v-else-if="g.key === 'visit'" class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
              </template>
              <a
                v-if="(g.url ?? '').trim()"
                class="pw-rowlink"
                :href="g.url"
                target="_blank"
                rel="noopener"
                @click.stop
              >{{ g.title }}<span class="pw-ext">↗</span></a>
              <template v-else>{{ g.title }}</template>
            </h2>
            <em v-if="!editing && checkable && !g.noCheck" class="pw-count">{{ doneCount(g) }}/{{ rowCount(g) }}</em>
            <!-- 바로가기 — 계산기 같은 자리를 제목줄 오른쪽에 둔다 -->
            <a
              v-for="lk in (editing ? [] : (g.links ?? []))"
              :key="lk.url"
              class="pw-golink"
              :href="lk.url"
              target="_blank"
              rel="noopener"
              :title="`${lk.label} 계산기 열기`"
              @click.stop
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M12 10h2M16 10h0M8 14h2M12 14h2M16 14h0M8 18h8"/></svg>{{ lk.label }}
            </a>
            <img v-if="!editing" :src="chevronDownIcon" :class="['pw-chev', { up: isCollapsed(g.key) }]" alt="" />
          </header>
          <div v-if="editing || !isCollapsed(g.key)" class="pw-card-body">
            <textarea v-if="editing" v-model="g.note" class="pw-earea note" rows="2" placeholder="안내 한 줄" />
            <p v-else-if="g.note" class="pw-note">{{ g.note }}</p>
            <!-- 가로 띠 그림 — 날짜를 찍어 가는 길 -->
            <div v-if="!editing && g.timeline" class="pw-tl">
              <span v-if="g.timeline.chip" class="pw-chip">{{ g.timeline.chip }}</span>
              <div
                class="pw-tl-grid"
                :style="{ '--n': g.timeline.points.length, gridTemplateColumns: g.timeline.cols }"
              >
                <!-- 길 위에 얹는 쪽지 -->
                <!-- 쪽지는 그 날짜 바로 오른쪽에 — 글자 하나쯤 띄운다 -->
                <span
                  v-if="g.timeline.span"
                  class="pw-tl-span"
                  :style="{ left: colCenter(g.timeline.cols, g.timeline.points.length, g.timeline.span.from) }"
                >{{ g.timeline.span.text }}</span>
                <span
                  v-for="(pt, pi) in g.timeline.points"
                  v-show="pt.day"
                  :key="`d-${pi}`"
                  class="pw-tl-day"
                  :style="{ gridColumn: pi + 1 }"
                >{{ pt.day }}</span>
                <span class="pw-tl-line" :style="{ gridColumn: `1 / ${g.timeline.points.length + 1}` }" />
                <span
                  v-for="pi in g.timeline.points.length"
                  :key="`o-${pi}`"
                  class="pw-tl-dot"
                  :style="{ gridColumn: pi }"
                />
                <span
                  v-for="(pt, pi) in g.timeline.points"
                  :key="`l-${pi}`"
                  class="pw-tl-label"
                  :style="{ gridColumn: pi + 1 }"
                >{{ pt.label }}</span>
              </div>
            </div>
            <!-- 나란히 선 상자와 그 밑의 점 목록 -->
            <div v-if="!editing && g.grid" class="pw-gr">
              <span v-if="g.grid.chip" class="pw-gr-chip">{{ g.grid.chip }}</span>
              <div class="pw-gr-row">
                <div v-for="(col, ci) in g.grid.cols" :key="`gc-${ci}`" class="pw-gr-col">
                  <span class="pw-gr-box">{{ col.title }}</span>
                  <ul class="pw-gr-list">
                    <li v-for="(it, ii) in col.items" :key="`gi-${ci}-${ii}`">{{ it }}</li>
                  </ul>
                </div>
              </div>
            </div>
            <!-- 위에서 아래로 쌓는 상자들 -->
            <div v-for="(sk, ski) in (editing ? [] : (g.stacks ?? []))" :key="`sk-${ski}`" class="pw-gr">
              <span v-if="sk.chip" class="pw-gr-chip">{{ sk.chip }}</span>
              <div class="pw-sk-col">
                <span v-for="(it, ii) in sk.items" :key="`si-${ski}-${ii}`" class="pw-sk-item">{{ it }}</span>
              </div>
            </div>
            <!-- 갈래 그림 — 번호 상자에서 할 일이 갈라진다 -->
            <div v-for="(br, bri) in (editing ? [] : (g.branches ?? []))" :key="`br-${bri}`" class="pw-br">
              <!-- 때(알약)와 그 한마디 -->
              <div v-if="br.pill" class="pw-br-head">
                <span class="pw-br-pill">{{ br.pill }}</span>
                <span v-if="br.head" class="pw-br-arrow" />
                <em v-if="br.head" class="pw-br-item">{{ br.head }}</em>
              </div>
              <div v-for="(stp, sti) in br.steps" :key="`st-${bri}-${sti}`" class="pw-br-step">
                <span class="pw-br-left">
                  <em class="pw-br-no">{{ stp.no }}</em>
                  <b>{{ stp.label }}</b>
                </span>
                <span class="pw-br-arrow">→</span>
                <span class="pw-br-items">
                  <em v-for="(it, iti) in stp.items" :key="`bi-${iti}`" class="pw-br-item">{{ it }}</em>
                </span>
              </div>
              <p v-for="(nt, nti) in (br.notes ?? [])" :key="`bn-${bri}-${nti}`" class="pw-br-note">{{ nt }}</p>
            </div>
            <!-- 나란히 세우는 네모들 -->
            <div v-if="!editing && g.boxes" class="pw-bx">
              <span v-if="g.boxes.chip" class="pw-chip">{{ g.boxes.chip }}</span>
              <div class="pw-bx-row">
                <template v-for="(bx, bxi) in g.boxes.items" :key="`bx-${bxi}`">
                  <span v-if="bxi > 0" class="pw-bx-arrow">▶</span>
                  <span class="pw-bx-item">{{ bx }}</span>
                </template>
              </div>
            </div>
            <!-- 차례 그림 — 네모와 화살표 (ⓘ 의 진행 순서와 같은 꼴) -->
            <div v-if="!editing && g.flow" class="pw-steps">
              <span
                v-for="(st, si2) in g.flow"
                :key="`st-${si2}`"
                :class="['pw-step', st.tone, { last: si2 === (g.flow?.length ?? 0) - 1 }]"
              >
                <em v-if="st.day">{{ st.day }}</em>{{ st.name }}
              </span>
            </div>
            <table v-if="editing || g.sections.length" :class="['pw-tbl', { edit: editing, biz: activeTab !== 'win' }]">
              <colgroup>
                <col v-if="editing || hasLabels(g)" class="pw-col-label" />
                <col />
                <col v-if="editing || hasQty(g)" class="pw-col-qty" />
                <col v-if="editing || hasMemo(g)" class="pw-col-memo" />
                <col v-if="editing || (checkable && !g.noCheck)" class="pw-col-chk" />
              </colgroup>
              <tbody>
                <!-- 왼쪽 이름 칸은 그 묶음의 줄 수만큼 세로로 합친다 -->
                <template v-for="(sec, si) in g.sections" :key="si">
                  <tr
                    v-for="(r, ri) in sec.rows"
                    :key="r.id"
                    :class="['pw-row', `d${r.depth}`, { done: !editing && checkable && !g.noCheck && isChecked(r.id), first: ri === 0, flat: !editing && (!checkable || g.noCheck) }]"
                    @click="editing || !checkable || g.noCheck || toggleCheck(r.id)"
                  >
                    <td v-if="ri === 0 && (editing || hasLabels(g))" class="pw-label" :rowspan="sec.rows.length">
                      <template v-if="editing">
                        <input v-model="sec.label" class="pw-einput lbl" placeholder="이름" />
                        <span class="pw-secbtns">
                          <span class="pw-minirow">
                            <button type="button" class="pw-mini" title="묶음 올리기" @click.stop="moveSection(blk.at[ei], si, -1)">↑</button>
                            <button type="button" class="pw-mini" title="묶음 내리기" @click.stop="moveSection(blk.at[ei], si, 1)">↓</button>
                          </span>
                          <button type="button" class="pw-mini" @click.stop="addRow(blk.at[ei], si)">＋줄</button>
                          <button type="button" class="pw-mini del" @click.stop="removeSection(blk.at[ei], si)">묶음 빼기</button>
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
                      <!-- 갈 곳 — 적어 두면 그 줄이 링크가 된다 -->
                      <input v-model="r.url" class="pw-einput link" placeholder="링크 (https://…)" />
                      <label class="pw-warnchk"><input type="checkbox" v-model="r.warn" /> 빨강</label>
                    </td>
                    <td v-else :class="['pw-txt', { warn: r.warn }]">
                      <a
                        v-if="(r.url ?? '').trim()"
                        class="pw-rowlink"
                        :href="r.url"
                        target="_blank"
                        rel="noopener"
                        @click.stop
                      >{{ r.text }}<span class="pw-ext">↗</span></a>
                      <template v-else>{{ r.text }}</template>
                    </td>
                    <!-- 부수 — 체크 왼쪽에 제 칸으로 -->
                    <td v-if="editing" class="pw-qty">
                      <input v-model="r.qty" class="pw-einput qty" placeholder="부수" />
                    </td>
                    <td v-else-if="hasQty(g)" class="pw-qty">{{ r.qty }}</td>
                    <!-- 비고 -->
                    <td v-if="editing" class="pw-memo">
                      <input v-model="r.memo" class="pw-einput qty" placeholder="비고" />
                    </td>
                    <td v-else-if="hasMemo(g)" class="pw-memo">{{ memoText(r.memo) }}</td>
                    <td v-if="editing || (checkable && !g.noCheck)" class="pw-chk">
                      <template v-if="editing">
                        <button type="button" class="pw-mini" title="줄 올리기" @click.stop="moveRow(blk.at[ei], si, ri, -1)">↑</button>
                        <button type="button" class="pw-mini" title="줄 내리기" @click.stop="moveRow(blk.at[ei], si, ri, 1)">↓</button>
                        <button type="button" class="pw-mini" :title="r.depth === 0 ? '한 단 들여쓰기' : '내어쓰기'" @click.stop="bumpDepth(blk.at[ei], si, ri)">{{ r.depth === 0 ? '→' : '←' }}</button>
                        <button type="button" class="pw-mini del" title="줄 빼기" @click.stop="removeRow(blk.at[ei], si, ri)">×</button>
                      </template>
                      <input v-else type="checkbox" :checked="isChecked(r.id)" :disabled="!picked" @click.stop="toggleCheck(r.id)" />
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <button v-if="editing" type="button" class="pw-addsec" @click="addSection(blk.at[ei])">＋ 묶음 추가</button>
          </div>
        </section>
        </template>
       </div>
      </template>

      <!-- 인테리어 — 업체 비딩과 인테리어 비용, 같은 꼴의 표 두 장 -->
      <template v-else-if="activeTab === 'repair'">
        <section v-for="card in INT_CARDS" :key="card.kind" class="pw-card">
          <header class="pw-card-head">
            <h2>
              <svg class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7l-1.5-1.5a3.5 3.5 0 0 0-5 5L3 15v6h6l4.5-4.5a3.5 3.5 0 0 0 5-5L17 10"/></svg>
              {{ card.title }}
            </h2>
          </header>
          <div class="pw-card-body">
            <div class="pw-int-tools">
              <!-- 합계는 단추와 같은 줄 왼쪽에 -->
              <span class="pw-int-sum">합계 <b>{{ money(totalOf(card.kind)) }}</b>원</span>
              <button type="button" class="pw-ebtn" @click="exportInterior(card.kind, card.file)">⬇ 엑셀저장</button>
              <button type="button" class="pw-ebtn on" :disabled="!picked" @click="openIntAdd(card.kind)">＋ 항목추가</button>
            </div>
            <table class="pw-int-tbl">
              <!-- 작업내용 칸을 넓게, 나머지는 조금씩 좁게 -->
              <!-- 차례는 시작·완료부터. 날짜·금액·업체 칸을 바짝 줄여
                   작업내용(23%)과 협의내용(14%)에 자리를 몰아준다 -->
              <!-- 작업내용은 여섯 글자, 협의내용은 열 글자가 한 줄에 들어가게 잡았다.
                   남는 자리를 날짜·금액·업체명에서 바짝 당겨 쓴다 -->
              <!-- 날짜를 바짝 줄여 작업내용을 완료 옆으로 당기고(다섯 글자 자리),
                   남는 몫은 협의내용에 더 준다. 넘치면 두 줄로 내려 적는다 -->
              <!-- 업체명과 연락처는 한 칸에 위아래로 — 둘 다 제 너비를 쓰려면 이 편이 낫다 -->
              <!-- 시작·완료는 '예상일정' 한 칸에 위아래로 적는다 (적을 때는 둘로 나눠 받는다) -->
              <colgroup>
                <col style="width: 15%" /><col style="width: 16%" />
                <col style="width: 28%" /><col style="width: 18%" /><col style="width: 23%" />
              </colgroup>
              <thead>
                <tr>
                  <th>예상일정</th><th>작업내용</th><th>{{ card.status }}</th>
                  <th>{{ card.amount }}{{ '\n' }}(VAT포함)</th><th>업체명{{ '\n' }}연락처</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rowsOf(card.kind)" :key="r.id" @click="openIntEdit(r)">
                  <td class="span">
                    <b>{{ shortDate(r.startDate || r.date || '') }}</b>
                    <small v-if="r.endDate">~ {{ shortDate(r.endDate) }}</small>
                  </td>
                  <td>{{ r.work }}</td>
                  <td>{{ r.status }}</td>
                  <td>{{ money(r.amountWithVat) }}</td>
                  <td class="vend">
                    <b>{{ r.vendor }}</b>
                    <small v-if="r.phone">{{ formatPhone(r.phone) }}</small>
                  </td>
                </tr>
                <tr v-if="rowsOf(card.kind).length === 0">
                  <td colspan="5" class="empty">
                    <template v-if="picked">적어 둔 줄이 없습니다. 위의 ＋ 항목추가를 누르세요.</template>
                    <template v-else>먼저 위에서 물건을 고르세요.</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <!-- 매도·임대 — 중개 의뢰 현황과 직거래, 같은 꼴의 표 두 장 -->
      <template v-else-if="activeTab === 'sell'">
        <section v-for="card in SELL_CARDS" :key="card.key" class="pw-card">
          <header class="pw-card-head">
            <h2>
              <svg class="pw-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></svg>
              {{ card.title }}
            </h2>
            <!-- 바로가기 -->
            <a
              v-for="lk in (card.links ?? [])"
              :key="lk.url"
              class="pw-golink"
              :href="lk.url"
              target="_blank"
              rel="noopener"
              :title="`${lk.label} 열기`"
              @click.stop
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>{{ lk.label }}
            </a>
            <!-- 업체 더하기 — 화면을 옮기지 않고 팝업으로 연다 -->
            <button
              v-if="card.mode === 'agency'"
              type="button"
              class="pw-golink"
              title="중개업체 관리"
              @click.stop="agencyBookOpen = true"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>업체
            </button>
            <span class="pw-rowstep">
              <span class="lab">행</span>
              <button type="button" aria-label="행 삭제" :disabled="!picked || sellRowsOf(card.key).length <= SELL_ROW_MIN" @click="removeLastSellRow(card.key)">−</button>
              <button type="button" aria-label="행 추가" :disabled="!picked" @click="addSellRow(card.key)">＋</button>
            </span>
          </header>
          <div class="pw-card-body">
            <p v-if="!picked" class="pw-empty">먼저 위에서 물건을 고르세요.</p>
            <SellStatusTable
              v-else
              :rows="sellRowsOf(card.key)"
              :mode="card.mode"
              :min-rows="SELL_ROW_MIN"
              @change="persistSell"
              @remove="(i: number) => removeSellRow(card.key, i)"
            />
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

    <!-- 인테리어 비용 적기 -->
    <template v-if="intOpen">
      <div class="pw-modal-veil" @click="intOpen = false" />
      <div class="pw-modal" @click.stop>
        <header class="pw-modal-head">
          <strong>항목 편집<em class="pw-modal-sub">{{ intDraft.kind === 'bid' ? '업체비딩' : '인테리어 현황' }}</em></strong>
          <button type="button" class="pw-flow-close" aria-label="닫기" @click="intOpen = false">×</button>
        </header>
        <!-- 적는 차례는 표의 칸 차례와 같다 -->
        <label class="pw-fld"><small>시작</small><input v-model="intDraft.startDate" type="date" class="pw-einput" /></label>
        <label class="pw-fld"><small>완료</small><input v-model="intDraft.endDate" type="date" class="pw-einput" /></label>
        <label class="pw-fld"><small>작업내용</small><input v-model="intDraft.work" class="pw-einput" placeholder="도배 · 바닥 · 싱크대 …" /></label>
        <!-- 비딩에서는 협의한 말을 그대로 적고, 비용에서는 현황을 고른다 -->
        <label v-if="intDraft.kind === 'bid'" class="pw-fld">
          <small>협의내용</small>
          <input v-model="intDraft.status" class="pw-einput" placeholder="협의한 내용" />
        </label>
        <label v-else class="pw-fld"><small>현황</small>
          <select v-model="intDraft.status" class="pw-einput">
            <option v-for="st in INT_STATUS" :key="st" :value="st">{{ st }}</option>
          </select>
        </label>
        <label class="pw-fld">
          <small>{{ intDraft.kind === 'bid' ? '견적' : '비용' }} (VAT 포함)</small>
          <!-- 적는 동안에도 천 단위 쉼표가 보인다 -->
          <FormattedNumberInput
            v-model="intDraft.amountWithVat"
            live-group
            align="left"
            placeholder="0"
            class="pw-einput"
          />
        </label>
        <label class="pw-fld"><small>업체명</small><input v-model="intDraft.vendor" class="pw-einput" placeholder="업체 이름" /></label>
        <!-- 하이픈은 적는 대로 저절로 끼워진다 -->
        <label class="pw-fld"><small>연락처</small>
          <input
            :value="intDraft.phone"
            class="pw-einput"
            inputmode="tel"
            placeholder="010-0000-0000"
            @input="intDraft.phone = formatPhone(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="pw-fld"><small>비고</small><input v-model="intDraft.note" class="pw-einput" /></label>
        <div class="pw-modal-foot">
          <button v-if="intDraft.id" type="button" class="pw-ebtn del" @click="removeInt">지우기</button>
          <button type="button" class="pw-ebtn" @click="intOpen = false">취소</button>
          <button type="button" class="pw-ebtn on" @click="saveInt">저장</button>
        </div>
      </div>
    </template>

    <AgencyBookModal :open="agencyBookOpen" @close="agencyBookOpen = false" />
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
/* 탭을 옮길 때 내용이 짧게 떠오르며 바뀐다 — 톡 끊기는 느낌을 없앤다 */
@keyframes pw-rise {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
.pw-body { animation: pw-rise .16s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .pw-body { animation: none; }
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
  display: flex; align-items: center; gap: 4px;
  font-size: 20px; font-weight: 800; color: #111827;
  border-bottom: 1px solid #e5e7eb;
}
.pw-nopick {
  margin: 0; padding: 7px 14px;
  background: #fff7ed; border-top: 1px solid #fde4c8; border-bottom: 1px solid #fde4c8;
  font-size: 11.5px; font-weight: 600; color: #b45309;
}
.pw-nopick b { font-weight: 800; }
.pw-tabs {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
  background: #fff;
}
.pw-tab {
  /* 다섯 탭 모두 한 줄로 — 글자를 줄이지 않고 자간을 좁힌다 */
  overflow: hidden; white-space: nowrap; line-height: 1.25;
  border: none; background: transparent;
  padding: 9px 0 14px; min-width: 0;
  font-family: inherit; font-size: 12.5px; font-weight: 700; color: #111827;
  letter-spacing: -0.7px; text-align: center; cursor: pointer;
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

/* 한 울타리 — 큰 제목 아래 상자들을 담는다. 묶을 제목이 없으면
   울타리는 없는 셈 치고(display: contents) 상자들이 그대로 선다.
   꼴은 손품·현장과 같다: 바깥은 흰 큰 상자, 안쪽 상자는 테두리로 가른다 */
.pw-wrap { display: contents; }
.pw-wrap.super {
  display: flex; flex-direction: column; gap: 8px;
  background: #fff; border-radius: 8px; padding: 0 8px 8px;
}
.pw-super-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 4px 8px; cursor: pointer;
}
.pw-super-head h2 {
  margin: 0 auto 0 0; font-size: 15.3px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 6px; min-width: 0;
}
/* 울타리 안 상자 제목 — 손품조사의 안쪽 상자와 같은 치수로 한 단 작게 */
.pw-wrap.super .pw-card-head h2 { font-size: 12.5px; font-weight: 700; }
.pw-wrap.super .pw-card-head { min-height: 28px; padding: 4px 4px 3px; }

/* 안쪽 상자 — 손품조사의 .adp-survey-block 과 같은 꼴 */
.pw-wrap.super .pw-card {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 0 8px 8px;
}

/* 카드 — 물건상세(.adp-card)와 같은 꼴 */
.pw-card { flex: 0 0 auto; background: #fff; border-radius: 8px; padding: 0 8px 7px; }
/* 제목줄 — 표와의 사이를 너무 빡빡하지 않게 한 뼘 줄인다 (글자 크기는 그대로) */
.pw-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 4px 5px; min-height: 34px; box-sizing: border-box; cursor: pointer;
}
.pw-card-head h2 {
  /* 제목이 왼쪽을 밀고, 센 개수와 접기 꺾쇠는 오른쪽 끝에 선다 */
  margin: 0 auto 0 0; font-size: 15.3px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 5px; min-width: 0;
}
.pw-h2-ico { flex: 0 0 auto; color: #2a5fbf; }
/* 울타리 안 상자의 번호 — 손품조사의 작은 동그라미와 같은 꼴 */
.pw-no {
  flex: 0 0 auto; width: 17px; height: 17px; border-radius: 50%;
  background: #e0eaff; color: #2b6df3;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10.5px; font-weight: 800;
}
/* 제목줄 바로가기 */
.pw-golink {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px;
  height: 22px; padding: 0 7px;
  border: 1px solid #c7d7f8; border-radius: 7px; background: #fff;
  font-size: 10.5px; font-weight: 700; color: #2b6df3; text-decoration: none; white-space: nowrap;
}
.pw-golink:active { background: #eef4ff; }
.pw-count { font-style: normal; font-size: 11.5px; font-weight: 800; color: #2b6df3; }
.pw-chev { width: 22px; height: 22px; object-fit: contain; transition: transform 0.2s; }
.pw-chev.up { transform: rotate(180deg); }
/* 안내 한 줄 — 파란 상자로 둔다. 왜 하는 일인지가 중요해서다
   (권리분석의 .adp-rcase-banner 와 같은 꼴) */
.pw-note {
  margin: 0 0 6px; padding: 7px 10px;
  background: #eaf1ff; border-radius: 8px;
  font-size: 12.5px; font-weight: 500; color: #1d4ed8; line-height: 1.5;
}

/* 가로 띠 그림 — 쪽지 · 날짜 · 길 · 이름 네 켜로 쌓는다 */
/* 쪽지 — 가로를 꽉 채우는 연파랑 막대 */
.pw-chip {
  display: block; margin: 2px 0 10px;
  border-radius: 8px; background: #eaf0ff;
  padding: 8px 12px; font-size: 12.5px; font-weight: 500; color: #3850c2;
  line-height: 1.4;
}
.pw-tl { margin-bottom: 4px; }
.pw-tl-grid {
  position: relative;
  display: grid; grid-template-columns: repeat(var(--n), 1fr);
  grid-template-rows: auto 16px auto;
  align-items: center; row-gap: 7px;
  padding: 2px 2px 8px;
}
/* 쪽지는 날짜와 같은 줄, 그 날짜 오른쪽에 글자 하나쯤 띄워 붙는다
   (left 는 그 칸의 가운데 — 거기서 날짜 반쪽과 틈만큼 더 민다) */
.pw-tl-span {
  position: absolute; top: 2px; transform: translateX(34px);
  background: #f7e8ec; border-radius: 5px; padding: 3px 9px;
  font-size: 11px; font-weight: 700; color: #6b4a55; white-space: nowrap;
}
.pw-tl-day {
  grid-row: 1; justify-self: center;
  background: #fff6a8; border-radius: 4px; padding: 2px 7px;
  font-size: 11.5px; font-weight: 800; color: #7a5f00; white-space: nowrap;
}
/* 길 — 가로줄 하나에 끝에 화살촉 */
.pw-tl-line {
  grid-row: 2; align-self: center; height: 2px; background: #c9d3e3; position: relative;
}
.pw-tl-line::after {
  content: ''; position: absolute; right: -1px; top: 50%; transform: translateY(-50%);
  border-left: 7px solid #c9d3e3; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
}
.pw-tl-dot {
  grid-row: 2; justify-self: center; align-self: center;
  width: 10px; height: 10px; border-radius: 50%; background: #9aa6bb; z-index: 1;
}
.pw-tl-label {
  grid-row: 3; justify-self: center; text-align: center;
  font-size: 12.5px; font-weight: 600; color: #1f2937; line-height: 1.35;
  white-space: pre-line; word-break: keep-all; padding: 0 2px;
}

/* 나란히 선 상자 — 분홍 머리 아래 세 칸 */
.pw-gr { margin-bottom: 10px; }
.pw-gr-chip {
  display: block; width: 62%; max-width: 230px; margin: 2px 0 10px;
  border: 1px solid #e2c3ca; border-radius: 4px; background: #f7e8ec;
  padding: 6px 10px; text-align: center;
  font-size: 12.5px; font-weight: 700; color: #1f2937;
}
.pw-gr-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; align-items: start; }
.pw-gr-col { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.pw-gr-box {
  display: flex; align-items: center; justify-content: center;
  min-height: 62px; padding: 8px 6px;
  border: 1px solid #c9d3e3; border-radius: 4px; background: #eef2fb;
  font-size: 12px; font-weight: 700; color: #1f2937; line-height: 1.35;
  text-align: center; white-space: pre-line; word-break: keep-all;
}
.pw-gr-list { margin: 0; padding: 0 0 0 14px; }
.pw-gr-list li {
  font-size: 11.5px; font-weight: 600; color: #374151; line-height: 1.5;
  word-break: keep-all;
}

/* 위에서 아래로 쌓는 상자들 */
.pw-sk-col { display: flex; flex-direction: column; gap: 7px; }
.pw-sk-item {
  display: flex; align-items: center; justify-content: center;
  min-height: 34px; padding: 7px 8px;
  border: 1px solid #c9d3e3; border-radius: 4px; background: #fff;
  font-size: 12px; font-weight: 600; color: #1f2937; line-height: 1.35;
  text-align: center; word-break: keep-all;
}

/* 갈래 그림 */
.pw-br { margin-bottom: 10px; }
/* 때 줄 — 알약과 한마디를 번호 상자와 같은 칸에 맞춰 세운다 */
.pw-br-head {
  display: grid; grid-template-columns: 124px 16px 1fr; gap: 6px;
  align-items: center; margin-bottom: 12px;
}
.pw-br-head .pw-br-item { align-self: stretch; display: flex; align-items: center; justify-content: center; }
/* 때 표시 — 둥근 알약이 아니라 네모 상자 */
.pw-br-pill {
  display: flex; align-items: center; justify-content: center; margin: 0;
  align-self: stretch; min-height: 34px;
  border: 1px solid #c9d3e3; border-radius: 4px; background: #eef2fb;
  padding: 5px 8px; text-align: center;
  font-size: 12.5px; font-weight: 700; color: #1f2937; word-break: keep-all;
}
.pw-br-step {
  display: grid; grid-template-columns: 124px 16px 1fr; gap: 6px;
  align-items: center; margin-bottom: 10px;
}
/* 번호는 글 왼쪽에 한 줄로 */
.pw-br-left {
  align-self: stretch;
  display: flex; align-items: center; gap: 6px;
  border: 1px solid #c9d3e3; border-radius: 4px; background: #f3f4f6;
  padding: 8px 8px; text-align: left;
}
.pw-br-left b {
  flex: 1 1 auto; min-width: 0;
  font-size: 11.5px; font-weight: 700; color: #1f2937; line-height: 1.35;
  white-space: pre-line; word-break: keep-all;
}
.pw-br-no {
  flex: 0 0 auto;
  font-style: normal; background: #fff6a8; border-radius: 3px;
  padding: 0 6px; font-size: 11px; font-weight: 800; color: #7a5f00;
}
.pw-br-arrow { justify-self: center; font-size: 13px; color: #9aa6bb; }
.pw-br-items { display: flex; flex-direction: column; gap: 6px; }
.pw-br-item {
  font-style: normal;
  border: 1px solid #c9d3e3; border-radius: 4px; background: #fff;
  padding: 7px 8px; text-align: center;
  font-size: 11.5px; font-weight: 600; color: #1f2937; line-height: 1.35; word-break: keep-all;
}
.pw-br-note {
  margin: 6px 0 0; padding: 8px 10px; text-align: center;
  border: 1px solid #bfe3c6; border-radius: 4px; background: #e7f6ea;
  font-size: 12px; font-weight: 700; color: #1f6b32; line-height: 1.4;
}

/* 나란히 세우는 네모 상자들 */
.pw-bx { margin-bottom: 8px; }
/* 셋으로 고르게 나눠 가로를 채우고, 사이에 화살표를 둔다 */
.pw-bx-row { display: flex; align-items: center; gap: 5px; }
.pw-bx-row .pw-bx-item { flex: 1 1 0; min-width: 0; }
.pw-bx-arrow { flex: 0 0 auto; font-size: 10px; color: #9aa6bb; }
.pw-bx-item {
  display: flex; align-items: center; justify-content: center;
  min-height: 34px; padding: 5px 8px;
  border: 1px solid #c9d3e3; border-radius: 4px; background: #eef2fb;
  font-size: 12px; font-weight: 700; color: #1f2937; line-height: 1.35;
  text-align: center; word-break: keep-all;
}

/* 차례 그림 — 한 줄에 셋씩, 네모는 모두 같은 크기 */
.pw-steps {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 14px;
  margin: 2px 0 10px;
}
.pw-step {
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 48px; padding: 5px 4px;
  border: 1.5px solid #2b6df3; border-radius: 8px; background: #f4f7ff;
  font-size: 11.5px; font-weight: 700; line-height: 1.25; color: #1d3d75;
  text-align: center; white-space: pre-line; word-break: keep-all;
}
.pw-step em {
  font-style: normal; font-size: 9.5px; font-weight: 800; color: #2b6df3; margin-bottom: 2px;
}
.pw-step.warn { border-color: #e0574a; background: #fdf1ef; color: #8c2f24; }
.pw-step.warn em { color: #e0574a; }
.pw-step.end { border-color: #12a471; background: #effaf5; color: #0f7a5c; }
/* 네모 사이 화살표 — 줄 끝과 마지막 네모 뒤에는 두지 않는다 */
.pw-step:not(:nth-child(3n)):not(.last)::after {
  content: '▶';
  position: absolute; right: -12px; top: 50%; transform: translateY(-50%);
  font-size: 9px; color: #9aa6bb;
}

/* 체크리스트 표 — 테두리와 모서리는 물건상세의 표(.adp-table)와 같다.
   radius 가 먹으려면 border-collapse 가 separate 여야 한다 */
.pw-tbl {
  width: 100%; table-layout: fixed;
  border-collapse: separate; border-spacing: 0;
  background: #fff;
  /* 분홍 칸 위에서도 선이 보이게 한 단 진한 회색을 쓴다 */
  border: 1px solid #d0d5dd; border-radius: 8px;
  /* 이름 칸이 여러 줄에 걸치면(rowspan) 마지막 줄의 첫 칸이 아니라서
     아래 모서리 규칙이 닿지 않는다 — 표 자체로 잘라내 네 모서리를 지킨다 */
  overflow: hidden;
}
.pw-tbl > tbody > tr > td { border-bottom: 1px solid #d0d5dd; }
.pw-tbl > tbody > tr:last-child > td { border-bottom: 0; }
/* 네 모서리 — 배경이 모서리를 따라 깎이게 한다 */
.pw-tbl > tbody:first-of-type > tr:first-child > :first-child { border-top-left-radius: 8px; }
.pw-tbl > tbody:first-of-type > tr:first-child > :last-child { border-top-right-radius: 8px; }
.pw-tbl > tbody:last-of-type > tr:last-child > :first-child { border-bottom-left-radius: 8px; }
.pw-tbl > tbody:last-of-type > tr:last-child > :last-child { border-bottom-right-radius: 8px; }
/* 이름 칸 — 글자 크기는 그대로 두고 폭만 좁게.
   좁혀야 오른쪽 글('매매사업자등록증명원' 같은 긴 이름)이 한 줄에 선다 */
.pw-col-label { width: 78px; }
/* 사업자등록 쪽은 이름이 짧아 한 뼘 더 좁게 */
.pw-tbl.biz .pw-col-label { width: 77px; }
/* 부수는 '각 1부' 까지라 좁혀도 되고, 비고는 '유효기간 한 달'(한글 일곱 자)이
   한 줄에 들어가야 해서 그만큼 넓힌다 */
.pw-col-qty { width: 34px; }
.pw-col-memo { width: 92px; }
.pw-col-chk { width: 34px; }
/* 부수 — 가운데로 맞춰 줄마다 눈이 멎는 자리를 같게 한다 */
.pw-qty {
  /* 칸 한가운데보다 한 글자쯤 왼쪽에 — 오른쪽 비고와 너무 붙어 보였다 */
  text-align: center; padding-right: 13px !important;
  font-size: 11.5px; font-weight: 600; color: #4b5563;
  white-space: nowrap;
}
/* 링크가 걸린 줄 */
.pw-rowlink { color: #2b6df3; text-decoration: underline; }
.pw-einput.link { height: 24px; margin-top: 3px; font-size: 11px; color: #2b6df3; }
/* 비고 — 부수 오른쪽, 작은 글씨로 */
.pw-memo { font-size: 11px; line-height: 1.35; color: #6b7280; white-space: pre-line; }
.pw-einput.qty { height: 24px; padding: 0 4px; font-size: 11px; text-align: center; }
.pw-tbl.edit .pw-col-chk { width: 44px; }
.pw-tbl.edit .pw-col-qty { width: 60px; }
.pw-tbl.edit .pw-col-memo { width: 96px; }
.pw-minirow { display: flex; gap: 3px; }
.pw-minirow .pw-mini { flex: 1 1 0; }
/* 이름 칸 — 분홍 바탕, 글은 가로·세로 모두 가운데 (설명 칸만 왼쪽) */
.pw-row td.pw-label,
.pw-label {
  background: #fde7e7; text-align: center; vertical-align: middle;
  color: #111827; font-weight: 700;
  border-right: 1px solid #d0d5dd;
  padding: 6px 6px !important;
}
/* 이름에 넣은 줄 내림은 그대로 보이고, 낱말 가운데서는 끊기지 않는다 */
.pw-label strong { font-size: 12px; line-height: 1.35; white-space: pre-line; word-break: keep-all; }
/* 갈 곳이 있는 이름 — 파랗게, 뒤에 작은 화살표 */
/* 줄 내림이 있는 이름이라 inline 으로 둔다 — ↗ 가 마지막 글자 뒤에 붙는다 */
.pw-labellink { color: #2b6df3; text-decoration: none; display: inline; }
.pw-labellink strong { font-size: 12px; line-height: 1.35; white-space: pre-line; word-break: keep-all; text-decoration: underline; }
.pw-ext { font-size: 9.5px; margin-left: 2px; }
.pw-row { cursor: pointer; }
.pw-row.flat { cursor: default; }
.pw-row.flat:hover { background: transparent; }
.pw-row:hover { background: #f7f9fd; }
/* 줄 높이 — 글자는 그대로 두고 위아래 여백만 줄인다.
   칸 안의 글은 세로 가운데에 앉는다 */
.pw-row td { padding: 6px 6px; vertical-align: middle; }
.pw-chk { width: 34px; text-align: center; }
.pw-chk input { width: 16px; height: 16px; accent-color: #2b6df3; cursor: pointer; }
.pw-chk input:disabled { cursor: not-allowed; opacity: 0.45; }
/* 편집에서 넣은 줄 내림이 그대로 보이게 한다 */
.pw-txt { font-size: 12.5px; line-height: 1.4; white-space: pre-line; padding: 6px 10px 6px 12px !important; }
.pw-row td.pw-txt { font-weight: 400; color: #374151; }
/* 묶음 안에 딸린 말은 한 단 들여쓴다 */
.pw-row.d1 .pw-txt { padding-left: 24px !important; color: #4b5563; }
.pw-row td.pw-txt.warn { color: #e0574a; }
.pw-row.done .pw-txt { color: #9ca3af; text-decoration: line-through; }

/* 제목 옆 ⓘ 와 낙찰 후 진행 순서 */
.pw-info {
  flex: 0 0 auto; margin-right: auto; margin-left: 3px;
  /* 글줄 한가운데에 — 글자의 가운데는 줄상자 가운데보다 1px 아래다 */
  position: relative; top: 1px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 19px; height: 19px; padding: 0;
  border: none; border-radius: 50%; background: #2b6df3;
  /* 기울이지 않는다 — 정자 i */
  font-family: inherit; font-size: 12.5px; font-weight: 800; font-style: normal;
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

/* 행 더하기·빼기 — 물건상세의 단계 단추와 같은 꼴 */
/* 행 더하기·빼기 — 물건상세(.adp-mkt-step)와 같은 알약 하나 */
.pw-rowstep {
  display: inline-flex; align-items: center; gap: 2px;
  border: 1px solid #d5dbe6; border-radius: 999px; background: #fff; padding: 1px 4px 1px 7px;
}
.pw-card-head .pw-golink + .pw-golink { margin-left: 4px; }
.pw-card-head .pw-golink:first-of-type { margin-left: auto; }
.pw-card-head .pw-golink + .pw-rowstep { margin-left: 6px; }
.pw-card-head h2 + .pw-rowstep { margin-left: auto; }
.pw-rowstep .lab { font-size: 11px; font-weight: 700; color: #6b7280; margin-right: 1px; }
.pw-rowstep button {
  border: none; background: transparent; cursor: pointer;
  width: 20px; height: 20px; padding: 0; line-height: 1;
  font-family: inherit; font-size: 14px; font-weight: 800; color: #2b6df3;
}
.pw-rowstep button:disabled { color: #d1d5db; cursor: default; }

/* 인테리어 비용 */
.pw-int-tools { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.pw-int-sum { margin-right: auto; font-size: 12px; font-weight: 600; color: #374151; }
.pw-int-sum b { font-size: 13px; font-weight: 800; color: #111827; }
.pw-int-tbl { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed;
  background: #fff; border: 1px solid #d0d5dd; border-radius: 8px; }
.pw-int-tbl th, .pw-int-tbl td {
  padding: 6px 2px; font-size: 10.5px; line-height: 1.35; color: #1f2937;
  border-bottom: 1px solid #e5e7eb; text-align: center; word-break: keep-all;
  /* 어떤 글도 칸 밖으로 나가지 않는다 */
  overflow: hidden;
}
/* 날짜·금액·연락처는 줄을 바꾸지 않는다 — 잘리거나 내려가던 자리다 */
/* 작업내용·협의내용 — 칸을 넘으면 줄을 내려 적는다 (긴 낱말도 끊어서) */
.pw-int-tbl tbody td:nth-child(2),
.pw-int-tbl tbody td:nth-child(3) {
  white-space: normal; word-break: break-word; overflow-wrap: anywhere;
  line-height: 1.35; overflow: visible;
}
/* 날짜·금액·연락처는 한 줄로, 글자를 바짝 줄여 자리를 적게 먹는다 */
/* 본문 글자는 모두 12px — 머리줄(구분)만 그대로 둔다 */
.pw-int-tbl tbody td { font-size: 12px; }
/* 예상일정 — 시작은 위, 완료는 '~'를 달아 아래에 */
.pw-int-tbl tbody td.span { white-space: nowrap; letter-spacing: -0.5px; padding-left: 1px; padding-right: 1px; }
.pw-int-tbl tbody td.span b { display: block; font-weight: 600; }
.pw-int-tbl tbody td.span small { display: block; margin-top: 1px; font-size: 11px; color: #6b7280; }
.pw-int-tbl tbody td:nth-child(4) { white-space: nowrap; letter-spacing: -0.4px; }
/* 업체 — 이름은 위, 번호는 아래 */
.pw-int-tbl tbody td.vend { padding: 5px 2px; }
.pw-int-tbl tbody td.vend b {
  display: block; font-size: 12px; font-weight: 600; letter-spacing: -0.3px;
  line-height: 1.25; word-break: keep-all;
}
/* 번호는 칸을 넘지 않게 — 자리에 맞춰 한 단 줄여 적는다 */
.pw-int-tbl tbody td.vend small {
  display: block; margin-top: 1px; font-size: 10.5px; letter-spacing: -0.5px;
  color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 머리줄은 다른 표와 같은 짙은 남색에 흰 글씨 — 위 두 모서리는 둥글게 */
.pw-int-tbl thead th {
  background: #1f3a72; font-weight: 700; color: #fff; border-bottom: none;
  white-space: pre-line; line-height: 1.25;
}
.pw-int-tbl thead tr:first-child th:first-child { border-top-left-radius: 8px; }
.pw-int-tbl thead tr:first-child th:last-child { border-top-right-radius: 8px; }
.pw-int-tbl .r { text-align: right; }
.pw-int-tbl tbody tr { cursor: pointer; }
.pw-int-tbl tbody tr:hover { background: #f7f9fd; }
.pw-int-tbl td small { color: #6b7280; }
.pw-int-tbl .empty { text-align: center; color: #9ca3af; padding: 20px 6px; }
.pw-int-tbl tbody tr:last-child td { border-bottom: none; }

/* 적는 창 */
.pw-modal-veil { position: fixed; inset: 0; z-index: 60; background: rgba(17, 24, 39, 0.35); }
.pw-modal {
  position: fixed; z-index: 61; left: 10px; right: 10px; top: 54px;
  max-height: calc(100vh - 110px); overflow-y: auto;
  background: #fff; border: 1px solid #dde3ee; border-radius: 12px;
  box-shadow: 0 12px 28px rgba(17, 24, 39, 0.18); padding: 10px 12px 12px;
}
.pw-modal-head { display: flex; align-items: center; margin-bottom: 8px; }
.pw-modal-head strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.pw-modal-sub { font-style: normal; font-size: 11.5px; font-weight: 600; color: #6b7280; margin-left: 6px; }
.pw-ebtn:disabled { opacity: 0.45; cursor: default; }
.pw-modal-head .pw-flow-close { margin-left: auto; }
.pw-fld { display: block; margin-bottom: 7px; }
.pw-fld small { display: block; font-size: 10.5px; font-weight: 700; color: #6b7280; margin-bottom: 2px; }
.pw-modal-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
.pw-ebtn.del { border-color: #f0d4d0; background: #fdecea; color: #e0574a; margin-right: auto; }

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
.pw-einput,
.pw-einput :deep(input) {
  width: 100%; box-sizing: border-box; height: 28px;
  border: 1px solid #dde3ee; border-radius: 6px; background: #fff;
  padding: 2px 7px; font-family: inherit; font-size: 12px; color: #111827;
}
.pw-ttlwrap { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; margin-right: auto; }
.pw-einput.ttl { font-size: 15px; font-weight: 800; height: 32px; }
.pw-einput.ttl-link { font-weight: 500; }
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
