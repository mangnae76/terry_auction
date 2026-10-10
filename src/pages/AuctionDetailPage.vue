<script lang="ts">
// 단지 전체 실거래 메모 — 목록↔상세를 오갈 때마다 다시 거르지 않게 모듈에 둔다.
// <script setup> 안에 두면 컴포넌트가 새로 뜰 때마다 비워져서 매번 '조회중…'이 보였다.
export type PlaceRow = {
  kind: '매매' | '직거래' | '전세' | '월세';
  contractDate: string;
  amount: string;      // 보여 줄 금액 글자
  /** 전월세 보증금 (원) — 보여 주는 글자에서 되짚으면 단위를 틀리기 쉬워 숫자로 따로 들고 있는다 */
  deposit?: number;
  areaM2: number;
  floor: string;
};
const PLACE_MEMO_MAX = 30;   // 물건을 많이 열어도 메모리가 늘지 않게 오래된 것부터 버린다
const samePlaceCache = new Map<string, PlaceRow[]>();
const rememberPlaceRows = (id: string, rows: PlaceRow[]) => {
  samePlaceCache.set(id, rows);
  while (samePlaceCache.size > PLACE_MEMO_MAX) {
    const oldest = samePlaceCache.keys().next().value;
    if (oldest === undefined) break;
    samePlaceCache.delete(oldest);
  }
};
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import AppConfirm from '../components/AppConfirm.vue';
import AgencyTable from '../components/AgencyTable.vue';
import PhotoCountMark from '../components/PhotoCountMark.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import FormattedNumberInput from '../components/FormattedNumberInput.vue';
import DateWheelPicker from '../components/DateWheelPicker.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { pickCurrentRound } from '../utils/auctionSchedule';
import { AUCTION_STATUS_LABELS, AUCTION_STATUS_ORDER, type AgencyRow, type AuctionDetail, type AuctionStatus, type BidCostAnalysis, type MarketSurveyRow } from '../types/auction';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import alertIcon from '../assets/icones/triangle-alert.png';
import fileTextIcon from '../assets/icones/file-text.png';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { fetchRealTradeAverage, fetchPlaceHistory, fetchDongHouseholds, PLACE_HISTORY_YEARS, type RealTradeMatchRow } from '../services/publicDataApi';
import { cached, cachedEntry, cacheKey, readCache, writeCache, CACHE_TTL } from '../services/marketCache';
import { fetchApartHousingPrice, VWORLD_KEY_EXPIRES } from '../services/vworldApi';
import { updateStamp } from '../services/updateStamp';
import { addressWithName, hasBuildingName, isUnitToken } from '../utils/addressName';
import { useAuthStore } from '../stores/authStore';
import { deleteSitePhoto, isPhotoId, loadSitePhoto, saveSitePhoto } from '../services/sitePhotoRepository';
import { fetchNearbyEnvironment, type NearbyEnvironment, type NearbyPlace } from '../services/kakaoNearby';
import { geocodeAddress } from '../services/routeOptimizer';

const props = defineProps<{
  mode?: 'create' | 'view' | 'edit';
  id?: string;
}>();

const router = useRouter();
const route = useRoute();
const store = useAuctionStore();
const authStore = useAuthStore();

type TabKey = 'basic' | 'rights' | 'profit' | 'verify' | 'survey';
const TAB_KEYS: TabKey[] = ['basic', 'rights', 'profit', 'verify', 'survey'];
// 다른 화면에서 ?tab=survey 로 들어오면 그 탭을 바로 연다
const initialTab = (): TabKey => {
  const wanted = String(route.query.tab ?? '');
  return (TAB_KEYS as string[]).includes(wanted) ? (wanted as TabKey) : 'basic';
};
const activeTab = ref<TabKey>(initialTab());
// 입지정보 카드 — 전체 / 500m 이내
const areaView = ref<'all' | 'near'>('all');
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'basic', label: '물건정보' },
  { key: 'rights', label: '권리분석' },
  { key: 'survey', label: '손품+현장' },
  { key: 'verify', label: '가격정보' },
  { key: 'profit', label: '입찰가산정' },
];

const auction = computed<AuctionDetail | null>(() => {
  if (!props.id) return null;
  return store.auctions.find((item) => item.id === props.id) ?? null;
});

const formatMoney = (n: number | undefined | null) => {
  if (!n || !Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString('ko-KR');
};
const formatPct = (n: number | undefined | null) => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  return `${n.toFixed(2)}%`;
};

// 물건종류 배지 — PDF 표기가 '다세대(빌라)', '도시형생활주택' 처럼 제각각이라 패턴으로 줄인다.
// 도시형생활주택이 '(다세대)'를 달고 오는 경우가 있어 먼저 검사한다.
const PROP_TYPE_RULES: Array<[RegExp, string]> = [
  [/아파트/, '아파트'],
  [/도시형|도생/, '도생'],
  [/다세대/, '다세대'],
  [/연립/, '연립'],
  [/오피스텔/, '오피스텔'],
  [/근린|상가|점포/, '상가'],
  [/단독/, '단독'],
];
const propTypeLabel = computed(() => {
  const t = auction.value?.propertyType || '다세대';
  return PROP_TYPE_RULES.find(([re]) => re.test(t))?.[1] ?? t;
});
const isApartment = computed(() => /아파트/.test(auction.value?.propertyType ?? ''));
const caseLabel = computed(() => auction.value?.caseNumber || '');
const saleKind = computed(() => {
  const raw = auction.value?.saleClassification || '토지건물 일괄매각';
  const m = raw.match(/(토지[·.]?\s*건물\s*일괄매각)/);
  // 한 줄에 년식까지 담아야 해서 '토지·건물 일괄매각' 을 '토건일괄매각' 으로 줄인다.
  // 띄어쓰기도 뺀다 — 좁은 화면에서 '16년차' 가 잘려 나갔다.
  return (m?.[1] ?? raw.split(/[·,/]/)[0])
    .replace(/토지[·.]?\s*건물\s*일괄매각/, '토건일괄매각')
    .replace(/\s+/g, '')
    .trim();
});
// 상단바 단계 드롭다운 — 관심/임장/입찰/낙찰/탈락. 목록으로 돌아가지 않고 여기서 바꾼다.
// 쓰레기통 아이콘 — 번들 PNG가 흰색 단색이라 보이지 않아 데이터 URI SVG를 직접 쓴다
const TRASH_ICON = 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%236b7280%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M3%206h18%27%2F%3E%3Cpath%20d%3D%27M8%206V4a1%201%200%200%201%201-1h6a1%201%200%200%201%201%201v2%27%2F%3E%3Cpath%20d%3D%27M19%206v14a2%202%200%200%201-2%202H7a2%202%200%200%201-2-2V6%27%2F%3E%3Cpath%20d%3D%27M10%2011v6%27%2F%3E%3Cpath%20d%3D%27M14%2011v6%27%2F%3E%3C%2Fsvg%3E';
const stageOpen = ref(false);
/** 단계 목록 — 마지막 '입찰진행'은 단계가 아니라 입찰상태라 따로 넣는다 */
const STAGE_BID_RUNNING = '__bid_running__';
const stageOptions = computed(() => [
  ...AUCTION_STATUS_ORDER.map((st) => ({ key: st as string, label: AUCTION_STATUS_LABELS[st] })),
  { key: STAGE_BID_RUNNING, label: '입찰진행' },
]);
/** 단계 이름이 '입찰진행'으로 바뀌는 조건 — 단계가 '입찰'이고 입찰상태도 '진행'일 때만.
 *  예상수익분석의 진행상황 박스는 단계를 건드리지 않으므로, 임장 중인 물건을
 *  '입찰'로 표시해 둬도 상단바의 단계 이름은 그대로 '임장'이다. */
const stageBidRunning = computed(() => (
  auction.value?.status === '입찰'
  && (auction.value?.bidStatus ?? '').replace(/^입찰/, '') === '진행'
));
const stageLabel = computed(() => {
  if (stageBidRunning.value) return '입찰진행';
  const st = auction.value?.status;
  return st ? AUCTION_STATUS_LABELS[st] ?? String(st) : '단계';
});
const stageIsOn = (key: string) => {
  const running = stageBidRunning.value;
  if (key === STAGE_BID_RUNNING) return running;
  return !running && auction.value?.status === key;
};
const pickStage = async (key: string) => {
  stageOpen.value = false;
  const target = auction.value;
  if (!target) return;
  if (key === STAGE_BID_RUNNING) {
    target.bidStatus = '진행';
    if (target.status !== '입찰') target.status = '입찰';
    await store.saveAuction(target);
    flashToast("'입찰진행'으로 바꿨습니다.", 'success');
    return;
  }
  const st = key as AuctionStatus;
  if (target.status === st && !target.bidStatus) return;
  // 입찰진행 해제는 스토어의 setStatus 가 함께 처리한다
  await store.setStatus(target.id, st);
  flashToast(`단계를 '${AUCTION_STATUS_LABELS[st]}'으로 바꿨습니다.`, 'success');
};

// 숨기기 — 삭제가 아니라 '숨김'이다. 선정물건의 '숨긴 N건'에서 되살릴 수 있다.
// 확인창은 앱 전체가 같은 것을 쓴다 (AppConfirm)
const confirmBox = ref<ConfirmBox | null>(null);
const askConfirm = (box: ConfirmBox) => {
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};
const hideThisAuction = () => {
  const target = auction.value;
  if (!target) return;
  askConfirm({
    title: '목록에서 지우겠습니까?',
    desc: '보관함에서 복원할 수 있습니다. 단, 단계는 손품조사로 돌아갑니다.',
    okLabel: '삭제',
    skipKey: 'wlp.skip.removeOne',
    run: async () => {
      await store.deleteAuction(target.id);
      router.replace('/auctions/watchlist');
    },
  });
};

const jibunAddress = computed(() => auction.value?.address || '');
const fullAddress = computed(() => auction.value?.address || auction.value?.roadAddress || '');
/** 동 + 번지 + 건물명 — '검암동 493-4 정성드림빌'.
 *  시·도와 구는 뗀다. 지금 보고 있는 물건의 바로 그 번지이니 거기까지 다시
 *  적을 까닭이 없고, 줄만 길어져 제목이 두 줄로 내려갔다.
 *  건물명까지 남기는 것은 같은 번지에 동이 여럿일 때 가려내기 위해서다. */
const lotWithBuildingAddress = computed(() => {
  const parts = jibunAddress.value.split(/\s+/).filter(Boolean);
  let last = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) last = i; });
  if (last < 0) return jibunAddress.value;
  // 번지 바로 앞의 '○○동'부터 — 그 앞(시·구)은 버린다
  let head = last;
  while (head > 0 && !/[동리가]$/.test(parts[head - 1])) head -= 1;
  const out = parts.slice(Math.max(0, head - 1), last + 1);
  for (let i = last + 1; i < parts.length; i += 1) {
    if (isUnitToken(parts[i])) break;
    out.push(parts[i]);
  }
  return out.join(' ');
});
/** 저가매물 주소에 자동으로 붙일 건물 이름 — '뉴월드빌4차'.
 *  매물호가는 네이버에서 찾는 '같은 빌라의 다른 집'이라, 이름만 같고
 *  동·층·호는 줄마다 다르다. 그래서 이름까지만 붙이고 동부터는 손으로 적는다.
 *  주소에 이름이 없는 빌라는 정보요약에 적어 둔 건물명을 쓴다. */
const subjectBuildingLabel = computed(() => {
  const parts = jibunAddress.value.split(/\s+/).filter(Boolean);
  let last = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) last = i; });
  const out: string[] = [];
  for (let i = last + 1; last >= 0 && i < parts.length; i += 1) {
    const t = parts[i];
    // '101동'은 건물이 아니라 그 안의 한 동이다 — 매물마다 다르니 붙이지 않는다
    if (/^제?\d+동$/.test(t) || isUnitToken(t)) break;
    out.push(t);
  }
  return out.join(' ') || String(auction.value?.basicSummary?.['sum.buildingName'] ?? '').trim();
});
/** 이 빌라에 '동'이 있는가 — 손으로 적을 안내문구에 '동'을 넣을지 가른다 */
const subjectHasDong = computed(() => /(^|\s)제?\d+동(\s|$)/.test(jibunAddress.value));
/** 상단 고정줄에 보여 줄 주소 — 주소에 건물명이 없는 물건은 정보요약에 적어 둔
 *  건물명을 지번 바로 뒤에 끼워 넣는다. 적어 두지 않았으면 주소 그대로다.
 *  (저장된 주소 자체는 건드리지 않는다 — 지역·실거래 조회가 그 값을 쓴다) */
const addrHasBuildingName = computed(() => hasBuildingName(jibunAddress.value));
/** 상단 고정줄에 보여 줄 주소 — 정보요약에 적어 둔 건물명을 지번 뒤에 끼운다 */
/** 상단 카드 주소 — '3층302호' 처럼 층과 호가 붙어 오면 층은 뗀다.
 *  층은 바로 아래 정보요약에 따로 있고, 여기서는 호수 끝이 잘리는 쪽이 더 아깝다. */
const dropFloorInUnit = (addr: string) => addr.replace(/(^|\s)(지하\s*)?\d+층\s*(\d+호)/g, '$1$3');
const headAddress = computed(() => dropFloorInUnit(
  addressWithName(jibunAddress.value, auction.value?.basicSummary?.['sum.buildingName']),
));
// 건물명·동호수를 떼고 번지까지만 남긴 주소 (동일지번 검색 안내문구용)
const lotOnlyAddress = computed(() => {
  const parts = jibunAddress.value.split(/\s+/).filter(Boolean);
  let last = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) last = i; });
  return last >= 0 ? parts.slice(0, last + 1).join(' ') : jibunAddress.value;
});

// 회차 비율의 기준값 = 감정가. 1차 최저매각가격은 감정가와 같으므로,
// 감정가가 비어 있는 예전 임포트 데이터도 기일내역 1차 금액으로 비율을 낼 수 있다.
const bidBaseValue = computed(() => {
  const a = auction.value;
  if (!a) return 0;
  return a.metrics.appraisalValue || a.auctionHistory?.[0]?.minPrice || 0;
});

// 이번 회차 최저매각가격 — 저장된 값이 비면 기일내역에서 찾는다 (구 파서 임포트 데이터 대비)
const currentMinBid = computed(() => {
  const a = auction.value;
  if (!a) return 0;
  if (a.metrics.minimumBidValue) return a.metrics.minimumBidValue;
  return pickCurrentRound(a.auctionHistory ?? [], a.eventDate)?.minPrice || bidBaseValue.value;
});
// PDF에 적힌 보증금이 있으면 그대로, 없으면 이번 회차 최저가의 10%
const depositAmount = computed(
  () => auction.value?.metrics.depositValue || Math.round(currentMinBid.value * 0.1),
);

const formatRegistryDesc = (desc: string) => {
  if (!desc) return '';
  return desc
    .replace(/\s+(거래가액:)/g, '\n$1')
    .replace(/\s+(범위:)/g, '\n$1')
    .replace(/\s+(전입:)/g, '\n$1')
    .replace(/\s+(확정:)/g, '\n$1')
    .replace(/\s+(말소기준등기)/g, '\n$1')
    .replace(/\s+(\d{4}카[임단]\d+)/g, '\n$1')
    .replace(/\s+(\d{4}타경\d+)/g, ' / $1')
    .trim();
};
/** 설명글을 '말소기준등기' 앞뒤로 쪼갠다 — 그 네 글자만 빨갛게 칠하려는 것이다.
 *  글 전체를 한 덩어리로 뿌리면 글자 하나만 골라 칠할 방법이 없다. */
const REGISTRY_BASE_NOTE = '말소기준등기';
const splitRegistryDesc = (desc: string) => desc
  .split(REGISTRY_BASE_NOTE)
  .flatMap((part, i) => (i === 0
    ? [{ text: part, base: false }]
    : [{ text: REGISTRY_BASE_NOTE, base: true }, { text: part, base: false }]))
  .filter((pt) => pt.text !== '');
const registryRows = computed(() => (auction.value?.registryRows ?? []).map((r) => {
  const desc = formatRegistryDesc(r.desc);
  return { ...r, desc, descParts: splitRegistryDesc(desc) };
}));
const stripWarnMarkers = (text: string) =>
  text.replace(/^[\s*▶⚠!！·•]+/gm, '').trim();
const registryWarning = computed(() => stripWarnMarkers(auction.value?.registryWarnings || ''));
const tenantOtherNotes = computed(() => stripWarnMarkers(auction.value?.tenantOtherNotes || ''));
const tenantNotesOpen = ref(false);
const registryClaimAmount = computed(() => auction.value?.rights?.totalClaimAmount ?? 0);


// 말소기준이 PDF에서 안 읽혔으면 등기 목록에서 직접 구한다.
// 말소기준권리는 근저당·가압류·압류·담보가등기·경매개시결정 중 가장 빠른 것이다.
const BASE_RIGHT_KINDS = /근저당|저당권|가압류|압류|담보가등기|경매개시|강제경매|임의경매/;
const baseDateFromRegistry = computed(() => {
  const rows = auction.value?.registryRows ?? [];
  const dates = rows
    .filter((r) => BASE_RIGHT_KINDS.test(r.kind ?? ''))
    .map((r) => (r.date ?? '').replace(/[./]/g, '-').trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return dates[0] ?? '';
});
// PDF에 날짜가 없으면 '-' 대신 '미상' — 임차인 칸의 다른 빈값과 같은 말을 쓴다
const tenantBaseDate = computed(
  () => auction.value?.cancellationBaseDate || baseDateFromRegistry.value || '미상',
);
const tenantDistDate = computed(() => auction.value?.distributionRequestDate || '미상');
const tenantSmallDate = computed(() => auction.value?.smallAmountBaseDate || '미상');

// 이미지 붙여넣기 업로드 중 표시 (본건사진 카드 공용)
const floorPlanUploading = ref(false);
const floorPlanErrMsg = ref('');
const exteriorInput = ref('');
const exteriorErrMsg = ref('');
// 로드 실패한 URL만 표시해 준다 (링크 하나가 깨져도 나머지는 그대로 보이게)
const brokenImages = ref<Record<string, boolean>>({});

// 예전에는 평면도가 단일 필드(floorPlanUrl)였다. 기존 데이터를 목록 앞에 붙여 그대로 보여준다.
const floorPlanList = computed<string[]>(() => {
  const legacy = auction.value?.floorPlanUrl ? [auction.value.floorPlanUrl] : [];
  // 최신이 위로 오므로 가장 오래된 레거시 값은 맨 뒤에 둔다
  return [...(auction.value?.floorPlanUrls ?? []), ...legacy];
});
const exteriorList = computed<string[]>(() => auction.value?.exteriorUrls ?? []);

// 본건사진 = 전경 + 평면도를 한 목록으로. 입력칸은 하나이고 새 사진은 전경 목록에 쌓인다.
// 평면도로 따로 등록해 둔 기존 사진도 같이 보여줘야 해서 두 목록을 이어 붙인다.
type PropertyPhoto = { url: string; kind: 'exterior' | 'floorPlan' };
const propertyPhotos = computed<PropertyPhoto[]>(() => [
  ...exteriorList.value.map((url) => ({ url, kind: 'exterior' as const })),
  ...floorPlanList.value.map((url) => ({ url, kind: 'floorPlan' as const })),
]);
const removePropertyPhoto = async (photo: PropertyPhoto) => {
  if (photo.kind === 'exterior') {
    await removeExteriorAt(exteriorList.value.indexOf(photo.url));
  } else {
    await removeFloorPlanAt(floorPlanList.value.indexOf(photo.url));
  }
};

// 단일 필드에 남아 있던 값을 목록으로 옮긴다 (한 번만 일어남)
const migrateLegacyFloorPlan = (a: AuctionDetail) => {
  if (!a.floorPlanUrl) return;
  a.floorPlanUrls = [...(a.floorPlanUrls ?? []), a.floorPlanUrl];
  a.floorPlanUrl = '';
};

const removeFloorPlanAt = async (idx: number) => {
  if (!auction.value) return;
  migrateLegacyFloorPlan(auction.value);
  const [removed] = auction.value.floorPlanUrls?.splice(idx, 1) ?? [];
  await store.saveAuction(auction.value);
  await discardPastedImage(removed);
};

const addExteriorUrl = async () => {
  if (!auction.value) return;
  const url = exteriorInput.value.trim();
  if (!url) return;
  exteriorErrMsg.value = '';
  if (!auction.value.exteriorUrls) auction.value.exteriorUrls = [];
  if (auction.value.exteriorUrls.includes(url)) {
    exteriorErrMsg.value = '이미 추가된 링크입니다.';
    return;
  }
  auction.value.exteriorUrls.unshift(url);
  exteriorInput.value = '';
  await store.saveAuction(auction.value);
};

const removeExteriorAt = async (idx: number) => {
  if (!auction.value) return;
  const [removed] = auction.value.exteriorUrls?.splice(idx, 1) ?? [];
  await store.saveAuction(auction.value);
  await discardPastedImage(removed);
};

// 붙여넣어 저장된 이미지는 목록에서 빼면 Firestore에서도 지운다 (용량이 남지 않게)
const discardPastedImage = async (entry: string | undefined) => {
  if (!entry || !isPhotoId(entry)) return;
  delete photoData.value[entry];
  await deleteSitePhoto(entry, authStore.uid).catch(() => undefined);
};

const onImageError = (url: string) => { brokenImages.value[url] = true; };

// 이미지 자체를 복사해 붙여넣기(Ctrl+V)하면 Firestore에 저장하고 목록에 넣는다.
// 클립보드에 이미지가 없으면 막지 않고 기본 동작(URL 텍스트 붙여넣기)에 맡긴다.
const pasteImageInto = async (e: ClipboardEvent, target: 'floorPlan' | 'exterior' | 'rightsDoc' | 'tradePhoto' | 'listPhoto' | `x:${string}`) => {
  const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
  if (!item) return;
  const file = item.getAsFile();
  if (!file || !auction.value) return;
  e.preventDefault();

  // 'x:<키>' 형태는 입지조사처럼 항목별로 따로 모으는 사진 목록이다
  if (target.startsWith('x:')) {
    const key = target.slice(2);
    extraErr.value = { ...extraErr.value, [key]: '' };
    try {
      const { photoId, dataUrl } = await saveSitePhoto(auction.value.id, authStore.uid, file);
      photoData.value[photoId] = dataUrl;
      if (!auction.value.extraPhotos) auction.value.extraPhotos = {};
      auction.value.extraPhotos[key] = [photoId, ...(auction.value.extraPhotos[key] ?? [])];
      await store.saveAuction(auction.value);
    } catch (err) {
      extraErr.value = { ...extraErr.value, [key]: err instanceof Error ? err.message : '이미지 붙여넣기에 실패했습니다.' };
    }
    return;
  }

  const errRef =
    target === 'floorPlan' ? floorPlanErrMsg
      : target === 'rightsDoc' ? rightsDocErrMsg
        : target === 'tradePhoto' ? tradePhotoErrMsg
          : target === 'listPhoto' ? listPhotoErrMsg
            : exteriorErrMsg;
  errRef.value = '';
  try {
    const { photoId, dataUrl } = await saveSitePhoto(auction.value.id, authStore.uid, file);
    photoData.value[photoId] = dataUrl;
    if (target === 'floorPlan') {
      migrateLegacyFloorPlan(auction.value);
      if (!auction.value.floorPlanUrls) auction.value.floorPlanUrls = [];
      auction.value.floorPlanUrls.unshift(photoId);
    } else if (target === 'rightsDoc') {
      if (!auction.value.rightsDocUrls) auction.value.rightsDocUrls = [];
      auction.value.rightsDocUrls.unshift(photoId);
    } else if (target === 'tradePhoto') {
      if (!auction.value.tradePhotoUrls) auction.value.tradePhotoUrls = [];
      auction.value.tradePhotoUrls.unshift(photoId);
    } else if (target === 'listPhoto') {
      if (!auction.value.listPhotoUrls) auction.value.listPhotoUrls = [];
      auction.value.listPhotoUrls.unshift(photoId);
    } else {
      if (!auction.value.exteriorUrls) auction.value.exteriorUrls = [];
      auction.value.exteriorUrls.unshift(photoId);
    }
    await store.saveAuction(auction.value);
  } catch (err) {
    errRef.value = err instanceof Error ? err.message : '이미지 붙여넣기에 실패했습니다.';
  }
};

const cameraInputRef = ref<HTMLInputElement | null>(null);
const galleryInputRef = ref<HTMLInputElement | null>(null);

const photoUploading = ref(false);
const photoError = ref('');

// photoId → dataURL 캐시. sitePhotos에는 ID만 들어 있으므로 표시용으로 따로 읽어 둔다.
// 레거시 항목(Storage https URL, 예전 base64 data:)은 그대로 쓸 수 있어 조회하지 않는다.
const photoData = ref<Record<string, string>>({});

const photoSrc = (entry: string): string => (isPhotoId(entry) ? photoData.value[entry] ?? '' : entry);

const syncPhotoData = async (entries: string[] | undefined) => {
  const missing = (entries ?? []).filter((e) => isPhotoId(e) && photoData.value[e] === undefined);
  if (missing.length === 0) return;
  await Promise.all(
    missing.map(async (id) => {
      // 실패해도 빈 문자열로 확정해 같은 문서를 반복 조회하지 않는다
      photoData.value[id] = await loadSitePhoto(id).catch(() => '');
    }),
  );
};

// 현장사진·평면도·본건전경·서류사진 모두 같은 캐시를 쓴다 (붙여넣은 이미지는 photoId로 들어온다).
// 여기 빠진 목록은 photoId가 이미지로 복원되지 않아 '이미지 로드 실패'로 보인다.
// rightsDocUrls는 아래에서 선언되는 computed 대신 원본을 직접 읽는다 (immediate 실행 시 TDZ 회피).
watch(
  () => [
    ...(auction.value?.sitePhotos ?? []),
    ...floorPlanList.value,
    ...exteriorList.value,
    ...(auction.value?.rightsDocUrls ?? []),
    ...(auction.value?.rankPhotoUrls ?? []),
    ...(auction.value?.tradePhotoUrls ?? []),
    ...(auction.value?.listPhotoUrls ?? []),
    ...Object.values(auction.value?.extraPhotos ?? {}).flat(),
  ],
  (entries) => { void syncPhotoData(entries); },
  { immediate: true },
);

const lightboxUrl = ref('');
// 크게 보기 — 손가락 두 개로 확대, 확대한 뒤에는 끌어서 이동, 두 번 톡 치면 확대/원래대로
const lbScale = ref(1);
const lbX = ref(0);
const lbY = ref(0);
const LB_MAX = 6;
const lbPointers = new Map<number, { x: number; y: number }>();
let lbPinchStart = 0;
let lbScaleStart = 1;
let lbPanStart: { x: number; y: number; ox: number; oy: number } | null = null;
let lbLastTap = 0;
// 확대·이동 제스처 직후의 click으로 창이 닫히는 것을 막는다
let lbGesture = false;
const clampScale = (n: number) => Math.min(LB_MAX, Math.max(1, n));
const resetLightboxZoom = () => { lbScale.value = 1; lbX.value = 0; lbY.value = 0; };
const snapBackIfUnzoomed = () => { if (lbScale.value <= 1) { lbX.value = 0; lbY.value = 0; } };
const openLightbox = (url: string) => { lightboxUrl.value = url; resetLightboxZoom(); };
const closeLightbox = () => { lightboxUrl.value = ''; resetLightboxZoom(); };
const lbDown = (e: PointerEvent) => {
  lbGesture = false;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  lbPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (lbPointers.size === 2) {
    const [a, b] = [...lbPointers.values()];
    lbPinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    lbScaleStart = lbScale.value;
    lbPanStart = null;
    return;
  }
  lbPanStart = { x: e.clientX, y: e.clientY, ox: lbX.value, oy: lbY.value };
  const now = Date.now();
  if (now - lbLastTap < 300) {
    lbScale.value = lbScale.value > 1 ? 1 : 2.5;
    snapBackIfUnzoomed();
    lbLastTap = 0;
  } else {
    lbLastTap = now;
  }
};
const lbMove = (e: PointerEvent) => {
  if (!lbPointers.has(e.pointerId)) return;
  lbPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (lbPointers.size >= 2) {
    const [a, b] = [...lbPointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (lbPinchStart > 0) lbScale.value = clampScale((lbScaleStart * dist) / lbPinchStart);
    lbGesture = true;
    return;
  }
  if (lbPanStart && lbScale.value > 1) {
    lbGesture = true;
    lbX.value = lbPanStart.ox + (e.clientX - lbPanStart.x);
    lbY.value = lbPanStart.oy + (e.clientY - lbPanStart.y);
  }
};
const lbUp = (e: PointerEvent) => {
  lbPointers.delete(e.pointerId);
  if (lbPointers.size < 2) lbPinchStart = 0;
  if (lbPointers.size === 0) {
    lbPanStart = null;
    snapBackIfUnzoomed();
  }
};
const lbWheel = (e: WheelEvent) => {
  lbScale.value = clampScale(lbScale.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  snapBackIfUnzoomed();
};
// 배경을 가볍게 톡 쳤을 때만 닫는다 — 확대했거나 방금 조작한 뒤에는 유지
const lbStageClick = () => {
  if (lbGesture || lbScale.value > 1) return;
  closeLightbox();
};
const lbZoom = (dir: 1 | -1) => {
  lbScale.value = clampScale(lbScale.value * (dir > 0 ? 1.4 : 1 / 1.4));
  snapBackIfUnzoomed();
};

const MAX_SITE_PHOTOS = 6;

const addPhotos = async (files: File[]) => {
  if (!auction.value || files.length === 0) return;
  const existing = auction.value.sitePhotos?.length ?? 0;
  const remaining = MAX_SITE_PHOTOS - existing;
  if (remaining <= 0) {
    photoError.value = `현장사진은 최대 ${MAX_SITE_PHOTOS}장까지 등록 가능합니다.`;
    return;
  }
  const slice = files.slice(0, remaining);
  if (files.length > remaining) {
    photoError.value = `최대 ${MAX_SITE_PHOTOS}장 중 ${slice.length}장만 등록됩니다.`;
  }
  photoUploading.value = true;
  try {
    // 압축은 canvas를 쓰므로 순차 처리해 모바일에서 메모리가 튀지 않게 한다
    const ids: string[] = [];
    const evictedIds: string[] = [];
    for (const f of slice) {
      const { photoId, dataUrl, evicted } = await saveSitePhoto(auction.value.id, authStore.uid, f);
      photoData.value[photoId] = dataUrl;
      ids.push(photoId);
      evictedIds.push(...evicted.map((e) => e.photoId));
    }
    if (evictedIds.length > 0) {
      // 용량 확보로 지워진 사진의 참조를 메모리에서도 끊는다.
      // 특히 현재 물건의 배열을 비우지 않으면 바로 아래 saveAuction이 죽은 ID를 되살린다.
      const gone = new Set(evictedIds);
      store.auctions.forEach((item) => {
        if (item.sitePhotos?.some((p) => gone.has(p))) {
          item.sitePhotos = item.sitePhotos.filter((p) => !gone.has(p));
        }
      });
      evictedIds.forEach((id) => { delete photoData.value[id]; });
    }
    if (!auction.value.sitePhotos) auction.value.sitePhotos = [];
    auction.value.sitePhotos.push(...ids);
    await store.saveAuction(auction.value);
    if (evictedIds.length > 0) {
      photoError.value = `저장공간이 가득 차 오래된 사진 ${evictedIds.length}장을 삭제했습니다.`;
    }
  } catch (e) {
    photoError.value = e instanceof Error ? e.message : '사진 업로드 실패';
  } finally {
    photoUploading.value = false;
  }
};

const onCameraChange = async (e: Event) => {
  const t = e.target as HTMLInputElement;
  await addPhotos([...(t.files ?? [])]);
  t.value = '';
};
const onGalleryChange = async (e: Event) => {
  const t = e.target as HTMLInputElement;
  await addPhotos([...(t.files ?? [])]);
  t.value = '';
};
const removePhoto = async (idx: number) => {
  if (!auction.value?.sitePhotos) return;
  const removed = auction.value.sitePhotos[idx];
  auction.value.sitePhotos.splice(idx, 1);
  await store.saveAuction(auction.value);
  if (removed && isPhotoId(removed)) {
    delete photoData.value[removed];
    await deleteSitePhoto(removed, authStore.uid).catch(() => undefined);
  }
};



const nearStation = computed(() => auction.value?.nearbyStation || '');

const parseSchools = (raw: string | undefined) => {
  if (!raw) return [] as string[];
  const stripped = raw.replace(/^[가-힣]+\s*:\s*/, '');
  return stripped
    .split(/,\s*|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
};
const eduInfo = computed(() => ({
  elementary: parseSchools(auction.value?.marketDemand?.schoolInfoA),
  middle: parseSchools(auction.value?.marketDemand?.schoolInfoB),
  high: parseSchools(auction.value?.marketDemand?.schoolInfoC),
}));

// 매각사례 / 실거래가 — from PDF
// 매각사례는 최근1개월 → 12개월 순으로 표시 (PDF 원본은 12개월부터 시작)
const nearBidRows = computed(() => {
  const raw = auction.value?.excelAnalysis?.nearBidRows ?? [];
  const periodOrder: Record<string, number> = { '1개월': 1, '3개월': 3, '6개월': 6, '12개월': 12 };
  const orderOf = (label: string) => {
    for (const key of Object.keys(periodOrder)) {
      if (label.includes(key)) return periodOrder[key];
    }
    return 99;
  };
  return [...raw].sort((a, b) => orderOf(a.saleInfo) - orderOf(b.saleInfo));
});
const realTradeRows = computed(() => auction.value?.excelAnalysis?.realTradeRows ?? []);

// === 단지 전체 실거래 (국토부 API) ===
// PDF 표는 이 호실과 '같은 전용면적'만 싣는다. 국토부 화면처럼 단지 전체를 보려면 따로 받아야 한다.
const squash = (text: string) => String(text ?? '').replace(/\s+/g, '');
const samePlaceRows = ref<PlaceRow[]>([]);
const samePlaceLoading = ref(false);
const samePlaceDone = ref(false);
const samePlaceError = ref('');
/** 최근 2년(오늘 기준) 같은 단지의 매매·전세·월세를 평수 가리지 않고 모두 받아 온다 */
// 한 번 받은 결과는 들고 있는다 (samePlaceCache는 모듈에 있다 — 화면을 떠나도 남는다)
// 못 받은 달 수 — 0이 아니면 '다시 조회'를 권한다
const samePlaceMissed = ref(0);
const loadSamePlaceTrades = async (forceReload = false) => {
  if (!auction.value?.address || samePlaceLoading.value) return;
  const memoKey = auction.value.id;
  const memo = forceReload ? null : samePlaceCache.get(memoKey);
  if (memo) {
    samePlaceRows.value = memo;
    samePlaceDone.value = true;
    return;
  }
  samePlaceLoading.value = true;
  samePlaceError.value = '';
  try {
    const region = await resolveRegionFromAddress(auction.value.address);
    if (!region) { samePlaceError.value = '주소에서 지역을 찾지 못했습니다.'; return; }
    const here = squash(auction.value?.address ?? '');
    // 건물명으로 맞춘다 — 주소에 그 이름이 들어 있으면 이 단지 것이다
    const byName = (name?: string) => {
      const n = squash(name ?? '');
      return n.length > 1 && here.includes(n);
    };
    // 이름이 없는 물건('검암동 637-2 4층403호')은 이름으로 맞출 수가 없다.
    // 그때는 동+지번으로 맞춘다 — 같은 지번이면 곧 이 경매지번의 거래다.
    const lot = squash(lotOnlyAddress.value);
    const byLot = (umdNm?: string, jibun?: string) => {
      const d = squash(umdNm ?? '');
      const j = squash(jibun ?? '');
      return !!d && !!j && lot.endsWith(`${d}${j}`);
    };
    const mine = (name?: string, umdNm?: string, jibun?: string) => byName(name) || byLot(umdNm, jibun);
    // 받은 건 무조건 저장한다. 한 달이라도 실패하면 저장을 건너뛰게 해 뒀더니
    // 매번 처음부터 다시 받고 있었다. 모자란 건 '다시 조회'로 메운다.
    const placeKey = cacheKey(region.lawdCd5, publicTradeType.value, `y${PLACE_HISTORY_YEARS}`);
    type PlacePayload = Awaited<ReturnType<typeof fetchPlaceHistory>>;
    let data = forceReload
      ? null
      : await readCache<PlacePayload>('cachePlaceHistory', placeKey, CACHE_TTL.place);
    if (!data) {
      data = await fetchPlaceHistory({
        lawdCd5: region.lawdCd5,
        propertyType: publicTradeType.value,
      });
      if (data.trades.length > 0 || data.rents.length > 0) {
        void writeCache('cachePlaceHistory', placeKey, data);
      }
    }
    const { trades, rents, missedMonths } = data;
    const rows: PlaceRow[] = [
      ...trades.filter((r) => mine(r.apartmentName, r.umdNm, r.jibun)).map((r) => ({
        kind: (/직거래/.test(r.dealType ?? '') ? '직거래' : '매매') as PlaceRow['kind'],
        contractDate: r.contractDate,
        amount: formatWonSimple(r.price),
        areaM2: r.areaM2,
        floor: r.floor,
      })),
      // 전월세는 국토부가 '만원'으로 준다 — 매매(원)와 한 칸에 서니 원으로 맞춰 적는다
      ...rents.filter((r) => mine(r.apartmentName, r.umdNm, r.jibun)).map((r) => ({
        kind: r.kind as PlaceRow['kind'],
        contractDate: r.contractDate,
        amount: r.monthlyRent > 0
          ? `보 ${formatWonSimple(r.deposit * 10000)} / 월 ${formatWonSimple(r.monthlyRent * 10000)}`
          : `보 ${formatWonSimple(r.deposit * 10000)}`,
        deposit: r.deposit * 10000,
        areaM2: r.areaM2,
        floor: r.floor,
      })),
    ].sort((a, b) => b.contractDate.localeCompare(a.contractDate));
    samePlaceRows.value = rows;
    samePlaceDone.value = true;
    rememberPlaceRows(memoKey, rows);
    samePlaceMissed.value = missedMonths;
    if (rows.length === 0 && !samePlaceError.value) samePlaceError.value = '같은 단지의 실거래가 없습니다.';
  } catch {
    samePlaceError.value = '조회에 실패했습니다.';
  } finally {
    samePlaceLoading.value = false;
  }
};
// 물건을 바꾸면 결과를 비운다 (앞 물건의 거래가 남지 않게).
// 전에 본 물건이면 메모에서 바로 되살린다 — 뒤의 조회들을 기다리느라 '조회중…'이 뜨지 않게.
watch(() => auction.value?.id, (id) => {
  const memo = id ? samePlaceCache.get(id) : undefined;
  samePlaceRows.value = memo ?? [];
  samePlaceDone.value = !!memo;
  samePlaceError.value = '';
  samePlaceMissed.value = 0;
}, { immediate: true });

const tradeFilter = ref<'all' | '매매' | '전세' | '월세'>('매매');
const tradeAreaFilter = ref('');
const tradeYearFilter = ref('');

// 해당물건 실거래가 — PDF 자료를 화면에 올린 시각
const caseTradeUpdatedAt = ref('');
const stampCaseTradeUpdate = () => {
  const d = new Date();
  caseTradeUpdatedAt.value = updateStamp(d);
};
watch(() => realTradeRows.value.length, () => stampCaseTradeUpdate(), { immediate: true });
// 필터를 모두 풀고 저장된 자료를 처음부터 다시 읽는다
const refreshCaseTrades = () => {
  tradeAreaFilter.value = '';
  tradeYearFilter.value = '';
  stampCaseTradeUpdate();
};

// PDF 단지 자체 실거래가
const tradeAreaOptions = computed(() => {
  const set = new Set<string>();
  mergedTradeRows.value.forEach((r) => { if (r.areaM2 > 0) set.add(String(r.areaM2)); });
  return [...set].sort((a, b) => Number(a) - Number(b));
});
const tradeYearOptions = computed(() => {
  const set = new Set<string>();
  mergedTradeRows.value.forEach((r) => {
    const y = r.contractDate.slice(0, 4);
    if (y) set.add(y);
  });
  return [...set].sort().reverse();
});
// 면적·연도만 걸러 둔 목록 — 탭별 건수를 세는 데 쓴다
/** 표에 쓰는 줄 — 국토부 자료만 쓴다 (PDF 표는 쓰지 않는다) */
const mergedTradeRows = computed<PlaceRow[]>(() => samePlaceRows.value);
/** 매매는 있는데 전세만 없나 — 전세가율을 못 내니 찾아 헤매기 전에 알려 준다.
 *  거래가 아예 없을 때는 적지 않는다. 아래 '같은 단지의 실거래가 없습니다' 와 두 번 말하게 된다. */
/** 지금 고른 탭에 거래가 없을 때 띄울 말 — '전세 데이터 없음' 처럼 탭 이름을 그대로 쓴다.
 *  거래가 아예 없을 때는 적지 않는다. 아래 '같은 단지의 실거래가 없습니다' 와 두 번 말하게 된다. */
const emptyTabNote = computed(() => {
  if (!samePlaceDone.value || samePlaceLoading.value) return '';
  if (mergedTradeRows.value.length === 0) return '';
  if (tradeFilter.value === 'all') return '';
  return shownTradeRows.value.length === 0 ? `${tradeFilter.value} 데이터 없음` : '';
});
/** 면적·연도만 거른 줄 — 탭(매매/전세/월세)과 상관없이 쓴다.
 *  위쪽 요약 박스가 이걸 보고, 표는 여기에 탭을 한 번 더 얹는다. */
const tradeRowsByAreaYear = computed(() => mergedTradeRows.value.filter((r) => {
  if (tradeAreaFilter.value && !String(r.areaM2).startsWith(tradeAreaFilter.value)) return false;
  if (tradeYearFilter.value && r.contractDate.slice(0, 4) !== tradeYearFilter.value) return false;
  return true;
}));
/** 표에 그리는 줄 — 위에 탭 거르기까지 얹는다 */
const shownTradeRows = computed(() => tradeRowsByAreaYear.value.filter((r) => (
  tradeFilter.value === 'all' || r.kind === tradeFilter.value || (tradeFilter.value === '매매' && r.kind === '직거래')
)));
const mergedCounts = computed(() => {
  const rows = tradeRowsByAreaYear.value;
  const by = (t: string) => rows.filter((r) => r.kind === t || (t === '매매' && r.kind === '직거래')).length;
  return { all: rows.length, 매매: by('매매'), 전세: by('전세'), 월세: by('월세') };
});
// 선택한 탭에 맞춰 건수 박스의 제목과 숫자를 바꾼다 — 탭에 적힌 수와 같아야 한다
const tradeCountLabel = computed(() => (tradeFilter.value === 'all' ? '전체' : tradeFilter.value));
const tradeCountValue = computed(() =>
  tradeFilter.value === 'all' ? mergedCounts.value.all : mergedCounts.value[tradeFilter.value],
);
// 해당 물건의 층 — 정보요약과 같은 값을 쓴다
const tradeTypeClass = (t: string) =>
  t === '전세' ? 'tt-jeon' : t === '월세' ? 'tt-wol' : 'tt-buy';

const parsePriceNumber = (s: string | undefined | null) => {
  if (!s) return NaN;
  const n = Number(String(s).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
// 최근 실거래가 — 아래 표와 같은 줄에서 뽑는다.
// 예전에는 PDF 표에서 뽑느라 표에는 2025년 매매가 있는데 박스는 2022년을 가리켰다.
const recentSaleTrade = computed(() => {
  const dateKey = (r: PlaceRow) => r.contractDate.replace(/\D/g, '');
  const sales = tradeRowsByAreaYear.value
    .filter((r) => (r.kind === '매매' || r.kind === '직거래') && parsePriceNumber(r.amount) > 0);
  if (sales.length === 0) return null;
  return sales.reduce((best, r) => (dateKey(r) > dateKey(best) ? r : best), sales[0]);
});
const recentSaleTradePrice = computed(() => parsePriceNumber(recentSaleTrade.value?.amount));
/** ② 를 채울 때 쓰는 '가장 최근' 거래 — 표의 면적·연도 거르기와 상관없이 전체에서 고른다.
 *  거르기는 눈으로 볼 때의 조건이지, 이 물건의 실거래가가 바뀌는 건 아니다. */
const newestOf = (pick: (r: PlaceRow) => boolean) => {
  const key = (r: PlaceRow) => r.contractDate.replace(/\D/g, '');
  const rows = mergedTradeRows.value.filter(pick);
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (key(r) > key(best) ? r : best), rows[0]);
};
const newestSaleRow = computed(() => newestOf((r) => (
  (r.kind === '매매' || r.kind === '직거래') && parsePriceNumber(r.amount) > 0
)));
const newestJeonseRow = computed(() => newestOf((r) => r.kind === '전세' && (r.deposit ?? 0) > 0));
/** 그 거래가 언제였나 — 연도만으로는 어느 달인지 알 수 없어 월까지 적는다 ('2025-06') */
const recentSaleTradeYm = computed(() => {
  const d = (recentSaleTrade.value?.contractDate ?? '').replace(/\D/g, '');
  return d.length >= 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}` : '-';
});
// 평당가 — 그 거래의 전용면적 기준, 줄에 면적이 없으면 물건 전용면적으로 대신한다
const recentSaleTradePyeong = computed(() => {
  const price = recentSaleTradePrice.value;
  if (!Number.isFinite(price) || price <= 0) return NaN;
  const fromRow = recentSaleTrade.value?.areaM2 ?? 0;
  const m2 = fromRow > 0 ? fromRow : Number(auction.value?.buildingAreaM2) || 0;
  if (m2 <= 0) return NaN;
  return Math.round(price / (m2 / 3.305785));
});


// 입지조사 '실거래가' 초기값 — 해당단지 매매 평균 (필터 무관)
const pdfMaeMaeAvg = computed(() => {
  const nums = realTradeRows.value
    .filter((r) => r.type === '매매')
    .map((r) => parsePriceNumber(r.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return NaN;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
});

// 주변 실거래가 (공공데이터 API)
const publicRealTradeRows = ref<RealTradeMatchRow[]>([]);
const publicRealTradeDong = ref('');
const publicRealTradeSigungu = ref('');
const fetchingPublicTrade = ref(false);
const publicStartDate = ref('');
const publicEndDate = ref('');
const publicMinArea = ref('');
const publicMaxArea = ref('');
const publicMinBuildYear = ref('');
const publicMaxBuildYear = ref('');

const parseContractToDate = (s: string | undefined | null): Date | null => {
  if (!s) return null;
  const m = s.match(/(\d{4})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1));
};

// 조건식 패널의 면적·건축연도는 손으로 적는다.
// 사다리(10·15·20평…)로 고르게 했더니 칸이 너무 넓어 원하는 구간을 집을 수 없었다.
const THIS_YEAR = new Date().getFullYear();
/** '16년차' — 건축연도 아래에 연차를 같이 적는다 */
const buildYearAge = (y: number | undefined | null) => {
  if (!y || y < 1800) return '';
  return `${Math.max(0, THIS_YEAR - y)}년차`;
};
// 옵션 목록 (드롭다운용)

// 컬럼별 체크박스 필터
type PubCol = 'contractDate' | 'price' | 'areaM2' | 'buildYear' | 'floor' | 'address';
const PUB_COLS: PubCol[] = ['contractDate', 'price', 'areaM2', 'buildYear', 'floor', 'address'];
const PUB_COL_LABELS: Record<PubCol, string> = {
  contractDate: '계약일',
  price: '거래금액',
  areaM2: '전용㎡/평',
  buildYear: '건축',
  floor: '층',
  address: '주소',
};
const emptyPubColSets = (): Record<PubCol, Set<string>> => ({
  contractDate: new Set(),
  price: new Set(),
  areaM2: new Set(),
  buildYear: new Set(),
  floor: new Set(),
  address: new Set(),
});
const publicColFilters = ref<Record<PubCol, Set<string>>>(emptyPubColSets());
// Draft state edited inside the open dropdown — only commits to publicColFilters on apply / outside-click
const pubColDraft = ref<Record<PubCol, Set<string>>>(emptyPubColSets());
const activePubCol = ref<PubCol | null>(null);

// 주소 = 도로명 + 건물명 (둘 다 없으면 법정동)
/** 표의 주소는 칸이 좁아 잘린다. 눌러서 전문을 보여 준다 —
 *  브라우저 기본 말풍선(title)은 흰색인 데다 폰에서는 아예 뜨지 않는다. */
const addrTip = ref('');
const addrTipTop = ref(0);
const placeAddrTip = (text: string, evt: Event) => {
  const el = evt.currentTarget as HTMLElement | null;
  if (el) addrTipTop.value = Math.round(el.getBoundingClientRect().bottom + 6);
  addrTip.value = text;
};
/** 마우스가 있는 환경(PC)에서는 올려놓기만 해도 뜬다 — 다른 설명들과 같은 규칙 */
const addrEnter = (text: string, evt: Event) => { if (hasHover) placeAddrTip(text, evt); };
const addrLeave = () => { if (hasHover) addrTip.value = ''; };
/** 폰에서는 눌러야 뜬다 — 올려놓는 동작이 없다 */
const toggleAddrTip = (text: string, evt: Event) => {
  if (addrTip.value === text) { addrTip.value = ''; return; }
  placeAddrTip(text, evt);
};
const rowAddress = (r: RealTradeMatchRow) => {
  // 도로명(+건물명) 우선, 자료에 도로명이 없으면 법정동+지번으로 대체
  const base = r.roadName || [r.umdNm, r.jibun].filter(Boolean).join(' ');
  return [base, r.apartmentName].filter(Boolean).join(' ') || '-';
};
const rowValue = (r: RealTradeMatchRow, col: PubCol): string => {
  if (col === 'contractDate') return r.contractDate || '-';
  if (col === 'price') return r.price > 0 ? r.price.toLocaleString('ko-KR') : '-';
  if (col === 'areaM2') return r.areaM2 ? String(r.areaM2) : '-';
  if (col === 'floor') return r.floor || '-';
  if (col === 'buildYear') return r.buildYear ? `${r.buildYear}` : '-';
  if (col === 'address') return rowAddress(r);
  return '';
};
const pubColUniqueValues = computed(() => {
  const result: Record<PubCol, string[]> = {
    contractDate: [], price: [], areaM2: [], buildYear: [], floor: [], address: [],
  };
  // 목록은 늘 전부 보여 준다 (무엇이 있었는지 알 수 있게)
  PUB_COLS.forEach((col) => {
    const set = new Set<string>();
    publicRealTradeRows.value.forEach((r) => set.add(rowValue(r, col)));
    result[col] = [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  });
  return result;
});
/** 다른 칸의 거르기까지 적용했을 때 그 칸에 실제로 남아 있는 값들.
 *  따로 고른 게 없으면 이 값들만 체크된 것으로 보여 준다 — 목록은 전부 보이되
 *  지금 쓸 수 있는 값이 무엇인지 체크로 드러난다. */
const pubColAvailable = computed(() => {
  const result: Record<PubCol, Set<string>> = {
    contractDate: new Set(), price: new Set(), areaM2: new Set(),
    buildYear: new Set(), floor: new Set(), address: new Set(),
  };
  PUB_COLS.forEach((col) => {
    applyColFilters(pubRangeRows.value, col).forEach((r) => result[col].add(rowValue(r, col)));
  });
  return result;
});
const isPubColChecked = (col: PubCol, val: string) => (
  pubColDraft.value[col].size === 0
    ? pubColAvailable.value[col].has(val)
    : pubColDraft.value[col].has(val)
);
const commitPubColDraft = (col: PubCol) => {
  publicColFilters.value = { ...publicColFilters.value, [col]: new Set(pubColDraft.value[col]) };
};
const togglePubColMenu = (col: PubCol, e: MouseEvent) => {
  e.stopPropagation();
  if (activePubCol.value === col) {
    // Closing the open menu — commit pending draft
    commitPubColDraft(col);
    activePubCol.value = null;
    return;
  }
  // If another menu was open, commit it first
  if (activePubCol.value) commitPubColDraft(activePubCol.value);
  // Snapshot current live filter into draft for the newly opened column
  pubColDraft.value = {
    ...pubColDraft.value,
    [col]: new Set(publicColFilters.value[col]),
  };
  activePubCol.value = col;
};
const togglePubColValue = (col: PubCol, val: string) => {
  const all = pubColUniqueValues.value[col];
  let set = new Set(pubColDraft.value[col]);
  if (set.size === 0) {
    // 아무것도 안 고른 상태 = '지금 남아 있는 값 전부'에서 하나를 뺀다
    set = new Set(pubColAvailable.value[col]);
    set.delete(val);
  } else if (set.has(val)) {
    set.delete(val);
  } else {
    set.add(val);
  }
  if (set.size === all.length) set.clear();
  pubColDraft.value = { ...pubColDraft.value, [col]: set };
};
const selectAllPubCol = (col: PubCol) => {
  pubColDraft.value = { ...pubColDraft.value, [col]: new Set() };
};
const clearAllPubCol = (col: PubCol) => {
  pubColDraft.value = { ...pubColDraft.value, [col]: new Set(['__none__']) };
};
const applyPubColFilter = (col: PubCol) => {
  commitPubColDraft(col);
  activePubCol.value = null;
};
const isPubColActive = (col: PubCol) => publicColFilters.value[col].size > 0;
const closePubColMenu = () => {
  if (activePubCol.value) commitPubColDraft(activePubCol.value);
  activePubCol.value = null;
};
const handleDocClickForPubMenu = (e: MouseEvent) => {
  if (!activePubCol.value) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  // Ignore clicks inside the open dropdown or on the column toggle button
  if (target.closest('.adp-pub-dd') || target.closest('.adp-pub-th-btn')) return;
  closePubColMenu();
};
const handleDocClickForSurveyMulti = (e: MouseEvent) => {
  if (!surveyReportOpen.value) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  // Stay open while clicking the trigger or inside the dropdown panel
  if (target.closest('.adp-multi-wrap')) return;
  surveyReportOpen.value = false;
};
onMounted(() => {
  document.addEventListener('click', handleDocClickForPubMenu);
  document.addEventListener('click', handleDocClickForSurveyMulti);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClickForPubMenu);
  document.removeEventListener('click', handleDocClickForSurveyMulti);
});

// 'YYYY-MM-DD'를 new Date()에 그대로 넣으면 UTC 자정으로 읽혀, 거래일(로컬 자정)과
// 9시간 어긋난다. 그 바람에 시작일 당일 거래가 통째로 빠지곤 했다 — 로컬 날짜로 직접 만든다.
const parseYmdLocal = (ymd: string, endOfDay = false) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return endOfDay
    ? new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999)
    : new Date(Number(y), Number(mo) - 1, Number(d));
};

// ===== 조건식 패널 위 '분포 내비게이터' =====
// 받아 온 자료를 평형·층·연식 구간으로 묶어 건수를 보여 주고, 누르면 그 구간으로 걸러 준다.
// 주의: 거래가 많은 구간 = 선호도가 높은 구간이 아니다(물량이 많아서일 수 있다).
//      그래서 '선호'가 아니라 건수와 비중만 적는다.
type NavBucket = { key: string; label: string; count: number };

/** 기간만 적용한 행 — 구간을 눌러도 다른 구간 숫자가 흔들리지 않게 한다 */
const navBaseRows = computed(() => publicRealTradeRows.value.filter((r) => {
  const d = parseContractToDate(r.contractDate);
  if (!d) return true;
  const start = publicStartDate.value ? parseYmdLocal(publicStartDate.value) : null;
  const end = publicEndDate.value ? parseYmdLocal(publicEndDate.value, true) : null;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}));

/** 평형 구간 — 사다리(10/15/20/25/30평)와 같은 경계를 쓴다 */
const NAV_PYEONG_BANDS: Array<{ key: string; label: string; min: number | null; max: number | null }> = [
  // 10평 미만은 빌라에서 손에 꼽을 만큼이라 아래 칸에 합쳤다
  { key: 'p1', label: '~15평', min: null, max: 15 },
  { key: 'p2', label: '15~20평', min: 15, max: 20 },
  { key: 'p3', label: '20~25평', min: 20, max: 25 },
  // 30평 이상은 빌라에서 거의 없어 따로 칸을 두지 않는다.
  // 대신 마지막 칸을 열어 둬서 그 거래도 빠지지 않게 한다 (칸 수는 층·연식과 같은 4개).
  { key: 'p4', label: '25평~', min: 25, max: null },
];
const navPyeongBuckets = computed<NavBucket[]>(() =>
  NAV_PYEONG_BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    count: navBaseRows.value.filter((r) => {
      const py = r.areaM2 / 3.305785;
      if (py <= 0) return false;
      if (b.min !== null && py < b.min) return false;
      if (b.max !== null && py >= b.max) return false;
      return true;
    }).length,
  })),
);

/** 층 구간 — 2~4층은 그대로, 5층 이상은 묶는다.
 *  1층은 빼 뒀다 — 빌라는 1층을 주차장으로 쓰는 집이 많아 거래가 거의 없다. */
const floorNumOf = (r: RealTradeMatchRow) => {
  const n = Number(String(r.floor ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const NAV_FLOOR_BANDS = [2, 3, 4];
const navFloorBuckets = computed<NavBucket[]>(() => {
  const list: NavBucket[] = NAV_FLOOR_BANDS.map((f) => ({
    key: `f${f}`,
    label: `${f}층`,
    count: navBaseRows.value.filter((r) => floorNumOf(r) === f).length,
  }));
  list.push({
    key: 'f5',
    label: '5층↑',
    count: navBaseRows.value.filter((r) => floorNumOf(r) >= 5).length,
  });
  return list;
});

/** 연식 구간 — 건축년도 사다리와 같은 5년 단위 */
// 연도보다 '몇 년차'가 직관적이라 연차로 적는다 (내부 비교는 건축연도로 한다)
const NAV_YEAR_BANDS: Array<{ key: string; label: string; min: number | null; max: number | null }> = [
  // 5년 미만은 빌라 거래가 드물어 아래 칸에 합쳤다
  { key: 'y1', label: '~10년', min: THIS_YEAR - 10, max: null },
  { key: 'y2', label: '10~15년', min: THIS_YEAR - 15, max: THIS_YEAR - 11 },
  { key: 'y3', label: '15~20년', min: THIS_YEAR - 20, max: THIS_YEAR - 16 },
  { key: 'y4', label: '20년↑', min: null, max: THIS_YEAR - 21 },
];
const navYearBuckets = computed<NavBucket[]>(() =>
  NAV_YEAR_BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    count: navBaseRows.value.filter((r) => {
      const y = r.buildYear ?? 0;
      if (!y) return false;
      if (b.min !== null && y < b.min) return false;
      if (b.max !== null && y > b.max) return false;
      return true;
    }).length,
  })),
);

/** 국토부 houseType 정리 — '연립다세대'처럼 섞여 들어오는 값을 둘로 모은다 */
const normalizeHouseType = (raw: string | undefined | null) => {
  const v = String(raw ?? '').replace(/\s/g, '');
  if (!v) return '';
  if (v.startsWith('연립')) return '연립';
  if (v.includes('다세대')) return '다세대';
  if (v.includes('연립')) return '연립';
  return '';
};
/** 각 줄에서 가장 많은 구간 — 파랗게 강조한다 */
const topKeyOf = (buckets: NavBucket[]) => {
  let best = '';
  let max = 0;
  buckets.forEach((b) => { if (b.count > max) { max = b.count; best = b.key; } });
  return best;
};
const navPyeongTop = computed(() => topKeyOf(navPyeongBuckets.value));
const navFloorTop = computed(() => topKeyOf(navFloorBuckets.value));
const navYearTop = computed(() => topKeyOf(navYearBuckets.value));

const navActive = ref({ pyeong: '', floor: '', year: '' });
const m2Of = (pyeong: number) => (pyeong * 3.305785).toFixed(2);

/** 평형 구간을 누르면 최소/최대 면적을 그 구간으로 채운다 (다시 누르면 전체) */
const pickNavPyeong = (key: string) => {
  const band = NAV_PYEONG_BANDS.find((b) => b.key === key);
  if (!band) return;
  if (navActive.value.pyeong === key) {
    navActive.value.pyeong = '';
    publicMinArea.value = '';
    publicMaxArea.value = '';
    return;
  }
  navActive.value.pyeong = key;
  publicMinArea.value = band.min === null ? '' : m2Of(band.min);
  publicMaxArea.value = band.max === null ? '' : m2Of(band.max);
};

/** 연식 구간을 누르면 건축년도 범위를 채운다 */
const pickNavYear = (key: string) => {
  const band = NAV_YEAR_BANDS.find((b) => b.key === key);
  if (!band) return;
  if (navActive.value.year === key) {
    navActive.value.year = '';
    publicMinBuildYear.value = '';
    publicMaxBuildYear.value = '';
    return;
  }
  navActive.value.year = key;
  publicMinBuildYear.value = band.min === null ? '' : String(band.min);
  publicMaxBuildYear.value = band.max === null ? '' : String(band.max);
};

/** 층 구간은 표 머리글의 층 필터(실제 값 체크박스)를 대신 채워 준다 */
const pickNavFloor = (key: string) => {
  if (navActive.value.floor === key) {
    navActive.value.floor = '';
    publicColFilters.value = { ...publicColFilters.value, floor: new Set<string>() };
    return;
  }
  navActive.value.floor = key;
  const want = (r: RealTradeMatchRow) =>
    key === 'f5' ? floorNumOf(r) >= 5 : floorNumOf(r) === Number(key.slice(1));
  const set = new Set<string>();
  navBaseRows.value.forEach((r) => { if (want(r)) set.add(rowValue(r, 'floor')); });
  publicColFilters.value = { ...publicColFilters.value, floor: set };
};

/** 위쪽 조건(기간·면적·건축연도)만 적용한 줄 — 머리글 거르기는 아직 안 건 상태 */
const pubRangeRows = computed(() => publicRealTradeRows.value.filter((r) => {
  const d = parseContractToDate(r.contractDate);
  if (publicStartDate.value && d) {
    const start = parseYmdLocal(publicStartDate.value);
    if (start && d < start) return false;
  }
  if (publicEndDate.value && d) {
    const end = parseYmdLocal(publicEndDate.value, true);
    if (end && d > end) return false;
  }
  const minA = parseFloat(publicMinArea.value);
  const maxA = parseFloat(publicMaxArea.value);
  if (Number.isFinite(minA) && minA > 0 && r.areaM2 < minA) return false;
  if (Number.isFinite(maxA) && maxA > 0 && r.areaM2 > maxA) return false;
  const minY = parseInt(publicMinBuildYear.value, 10);
  const maxY = parseInt(publicMaxBuildYear.value, 10);
  if (Number.isFinite(minY) && minY > 0 && (r.buildYear ?? 0) < minY) return false;
  if (Number.isFinite(maxY) && maxY > 0 && (r.buildYear ?? 9999) > maxY) return false;
  return true;
}));
/** 머리글 거르기를 건다. except 로 지정한 칸은 빼고 건다(그 칸의 보기 목록을 만들 때 쓴다) */
const applyColFilters = (rows: RealTradeMatchRow[], except?: PubCol) => rows.filter(
  (r) => PUB_COLS.every((col) => {
    if (col === except) return true;
    const sel = publicColFilters.value[col];
    if (sel.size === 0) return true;
    return sel.has(rowValue(r, col));
  }),
);
const filteredPublicTradeRows = computed(() => applyColFilters(pubRangeRows.value));


// 데이터 로드 후 자동 범위 채우기
const populatePublicRangeDefaults = (months = 12) => {
  const rows = publicRealTradeRows.value;
  if (rows.length === 0) {
    publicStartDate.value = '';
    publicEndDate.value = '';
    publicMinArea.value = '';
    publicMaxArea.value = '';
    publicMinBuildYear.value = '';
    publicMaxBuildYear.value = '';
    return;
  }
  const saved = savedPubFilter.value;
  if (saved) { applyPubFilter(saved); return; }
  // 첫 화면의 기간 창을 '기간선택 N개월' 버튼과 똑같이 맞춘다.
  // 예전에는 받아 온 자료의 최소·최대 날짜를 썼기 때문에, 버튼을 누르면 창이 달라져
  // 평균·평당가가 바뀌어 보였다.
  setPubMonths(months);
  // 면적·건축연도는 비워 둬서 '전체'로 시작한다
  publicMinArea.value = '';
  publicMaxArea.value = '';
  publicMinBuildYear.value = '';
  publicMaxBuildYear.value = '';
};
// 건수 박스 앞 — 기간선택 버튼을 눌렀으면 개월수를, 날짜를 직접 고쳤으면 그 기간을 보여준다
/** 소수점 두 자리에서 '자른다'(반올림하지 않는다). 자릿수는 항상 두 자리로 채워 줄을 맞춘다 */
const trunc2 = (v: number) => {
  // v * 100 은 부동소수 오차가 나서(66.1 → 6609.99…) 자릿수를 문자열에서 자른다
  const [whole, frac = ''] = v.toFixed(4).split('.');
  return `${whole}.${(frac + '00').slice(0, 2)}`;
};
/** 표 칸용 — '66.11 / 20.0' (단위는 머리글 '전용면적(㎡/평)'에 적어 폭을 아낀다) */
const areaWithPyeong = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '-';
  return `${trunc2(v)} / ${(v / 3.305785).toFixed(1)}`;
};
/** 문자열로 들어온 면적('38.28', '38.28㎡', '38.28 (11.58)')도 같은 형태로 */
const areaTextWithPyeong = (raw: string | undefined | null) => {
  // 괄호 안에 평수가 같이 적힌 자료가 있어 '첫 번째 숫자'만 집는다
  const first = /\d+(?:\.\d+)?/.exec(String(raw ?? ''));
  const n = first ? Number(first[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? areaWithPyeong(n) : (raw || '-');
};

// 연·월까지만 — 2025-09-27 → 25.09
const shortDate = (v: string) => (v ? v.slice(2, 7).replace(/-/g, '.') : '');
const publicRangeNote = computed(() => {
  if (pubMonthPreset.value) return `${pubMonthPreset.value}M`;
  const start = shortDate(publicStartDate.value);
  const end = shortDate(publicEndDate.value);
  if (start && end) return `${start}~${end}`;
  return start ? `${start}~` : end ? `~${end}` : '';
});

const publicTradeAvg = computed(() => {
  const nums = filteredPublicTradeRows.value.map((r) => r.price).filter((n) => n > 0);
  if (nums.length === 0) return NaN;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
});

/** 걸러진 거래의 평균 전용면적 (㎡) — 평균가와 짝지어야 평당가를 낼 수 있다 */
const publicAreaAvg = computed(() => {
  const list = filteredPublicTradeRows.value.map((r) => Number(r.areaM2) || 0).filter((v) => v > 0);
  return list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;
});
// 평균 평당가 — 금액 합계 ÷ 전용면적 합계(평). 면적이 큰 거래에 치우치지 않게 합계로 나눈다
const publicTradePyeongAvg = computed(() => {
  const rows = filteredPublicTradeRows.value.filter((r) => r.price > 0 && r.areaM2 > 0);
  if (rows.length === 0) return NaN;
  const priceSum = rows.reduce((sum, r) => sum + r.price, 0);
  const pyeongSum = rows.reduce((sum, r) => sum + r.areaM2 / 3.305785, 0);
  if (pyeongSum <= 0) return NaN;
  return Math.round(priceSum / pyeongSum);
});


// 가격정보 탭에서 늘 보이는 기준값 — 조건식 분석의 숫자를 견주어 읽을 때 쓴다.
// 사용승인은 날짜 전체 대신 '08년(18년차)'로 줄여 한 줄에 담는다.
/** 사건번호 줄에 붙는 한 줄 기준값 — '66.11㎡ · 2008년' */
const headMetaLine = computed(() => {
  const m2 = Number(auction.value?.buildingAreaM2) || 0;
  const area = m2 > 0 ? `${trunc2(m2)}㎡/${(m2 / 3.305785).toFixed(1)}평` : '';
  const raw = String(auction.value?.buildingHeader?.approvalDate || auction.value?.approvalDate || '').trim();
  const ym = raw.match(/(\d{4})\D?(\d{2})?/);
  const y = Number(ym?.[1] ?? 0);
  // 연도만 쓰면 같은 해 물건끼리 구분이 안 된다 — 월까지 적는다 ('2015-08')
  const head = ym?.[2] ? `${y}-${ym[2]}` : String(y);
  const year = y && y >= 1800 ? `${head}(${Math.max(0, THIS_YEAR - y)}년차)` : '';
  return [area, year].filter(Boolean).join(' · ');
});

const formatWonSimple = (n: number) =>
  Number.isFinite(n) && n > 0 ? n.toLocaleString('ko-KR') : '-';

// 실거래 비교 대상 종류 — 물건이 다세대/연립이면 연립다세대 자료만 본다.
// 국토부 실거래가 공개시스템도 연립다세대를 한 묶음으로 제공한다(도시형생활주택 포함).
const publicTradeType = computed<'apt' | 'villa' | 'officetel'>(() => {
  const t = (auction.value?.propertyType ?? '').replace(/\s/g, '');
  if (/아파트/.test(t)) return 'apt';
  if (/오피스텔/.test(t)) return 'officetel';
  return 'villa';
});

/** 국토부 API에 넘기는 종류를 사람이 읽는 말로 */
const publicTradeTypeLabel = computed(() => (
  { apt: '아파트', villa: '연립다세대', officetel: '오피스텔' }[publicTradeType.value]
));

const fetchPublicTradeRows = async (opts?: { months?: number; keepFilters?: boolean }) => {
  if (!auction.value || fetchingPublicTrade.value) return;
  fetchingPublicTrade.value = true;
  try {
    const region = await resolveRegionFromAddress(auction.value.address);
    if (!region) return;
    publicRealTradeSigungu.value = region.sigungu ?? '';
    publicRealTradeDong.value = region.dong ?? '';
    const months = opts?.months ?? 12;
    // 같은 동·같은 종류·같은 기간이면 누가 열든 결과가 같다 — 하루 동안 모아 둔 값을 쓴다
    const result = await cached(
      'cacheDongTrades',
      cacheKey(region.lawdCd5, region.dong, publicTradeType.value, months, DONG_TRADE_CACHE_VER),
      CACHE_TTL.trades,
      () => fetchRealTradeAverage({
        lawdCd5: region.lawdCd5,
        dong: region.dong,
        // 면적으로 미리 거르지 않는다 — 패널 안에 면적 필터가 따로 있고 기본은 '전체'다.
        propertyType: publicTradeType.value,
        months,
      }),
      (r) => Number.isFinite(r.average) && (r.matchedRows?.length ?? 0) > 0,
    );
    if (Number.isFinite(result.average)) {
      publicRealTradeRows.value = result.matchedRows ?? [];
      publicRealTradeDong.value = result.dongLabel ?? region.dong ?? '';
      publicTradeWarning.value = result.error ?? '';
      pubDirectCount.value = result.directCount ?? 0;
      pubDirectRows.value = result.directRows ?? [];
      pubCancelledRows.value = result.cancelledRows ?? [];
      if (!opts?.keepFilters) populatePublicRangeDefaults(opts?.months ?? 12);
      stampPublicTradeUpdate();
    } else {
      publicTradeWarning.value = result.error ?? '';
    }
  } catch (err) {
    // 조용히 삼키면 '조회 중…'만 사라지고 왜 비었는지 알 수 없다
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    publicTradeWarning.value = aborted
      ? '국토부 응답이 없어 끊었습니다 — 잠시 뒤 다시 조회해 주세요.'
      : `조회에 실패했습니다 — ${err instanceof Error ? err.message : '알 수 없는 오류'}`;
  } finally {
    fetchingPublicTrade.value = false;
  }
};

// 조건식 패널의 '검색' — 고른 기간으로 다시 조회하되 면적·연도 선택은 그대로 둔다
// 수요공급의 12개월 거래량 — 동 전체 다세대·연립 1년치 건수를 따로 센다.
// 가격정보 rows는 면적(±10%)으로 걸러져 있어 그대로 쓰면 적게 나온다.
const fetchDeal12mCount = async () => {
  const target = auction.value;
  if (!target?.address) return;
  try {
    const region = await resolveRegionFromAddress(target.address);
    if (!region) return;
    const entry = await cachedEntry(
      'cacheDongTrades',
      cacheKey(region.lawdCd5, region.dong, publicTradeType.value, 12, DONG_TRADE_CACHE_VER),
      CACHE_TTL.trades,
      () => fetchRealTradeAverage({
        lawdCd5: region.lawdCd5,
        dong: region.dong,
        propertyType: publicTradeType.value,
        months: 12,
      }),
      (r) => Number.isFinite(r.average) && (r.matchedRows?.length ?? 0) > 0,
    );
    const result = entry.value;
    // 이 숫자가 언제 받아 온 것인지 말풍선에 적는다 — 캐시를 읽었으면 '그때 받은 시각'이다
    deal12mUpdatedAt.value = updateStamp(entry.savedAt);
    // 동으로 못 좁히고 시군구 전체로 넓어졌으면 그 동의 수가 아니다 — 자동 입력하지 않는다
    deal12mAuto.value = result.fallbackUsed ? 0 : (result.matchedRows?.length ?? 0);
    // 뺀 건수도 적어 둔다 — 가격정보 탭의 숫자와 맞춰 보면 검증이 된다
    deal12mDirect.value = result.fallbackUsed ? 0 : (result.directCount ?? 0);
    deal12mCancelled.value = result.fallbackUsed ? 0 : (result.cancelledCount ?? 0);
  } catch {
    deal12mAuto.value = 0;
    deal12mDirect.value = 0;
    deal12mCancelled.value = 0;
    deal12mUpdatedAt.value = '';
  }
};

/** 조회 조건을 처음 상태로 — 기간 12개월, 면적·건축년도 전체.
 *  내비게이터로 걸어 둔 구간(평형·층·연식)도 같이 푼다. 그 칸들이
 *  아래 조건을 채운 장본인이라, 조건만 비우면 칸만 눌린 채로 남는다. */
const resetPublicFilters = () => {
  // 적어 둔 조건도 같이 지운다 — 남겨 두면 다음에 열 때 되살아나 되돌린 뜻이 없어진다
  setMktVal(PUB_FILTER_KEY, '');
  pubFilterApplied.value = true;
  void persistSurvey();
  populatePublicRangeDefaults(12);
  navActive.value = { pyeong: '', floor: '', year: '' };
  publicColFilters.value = { ...publicColFilters.value, floor: new Set<string>() };
  // 표 안에서 찾던 말도 같이 지운다 — 조건은 처음인데 줄만 줄어 있으면 비어 보인다
  pubSearch.value = '';
};

const searchPublicTrades = async () => {
  await fetchPublicTradeRows({ months: pubMonthPreset.value || 12, keepFilters: true });
  // 검색을 누른 사람은 결과를 보려는 것이다 — 정상거래 목록을 펴 둔다
  pubTableCollapsed.value = false;
  pubDirectCollapsed.value = true;
  pubCancelledCollapsed.value = true;
};

// 낙찰일·매도일 — 편집 모드와 상관없이 바로 적는다
// 중요도 별 — 선정물건 목록의 별과 같은 priority 값. 1→2→3→빈 별 순으로 돈다
const priority = computed(() => auction.value?.priority ?? 0);
const cyclePriority = async () => {
  if (!auction.value) return;
  auction.value.priority = (priority.value + 1) % 4;
  await store.saveAuction(auction.value);
};
const setProfitDate = async (key: 'wonDate' | 'sellDate', value: string) => {
  if (!auction.value) return;
  auction.value[key] = value;
  await store.saveAuction(auction.value);
};
const profitDateTarget = ref<'' | 'wonDate' | 'sellDate'>('');
const profitDateValue = computed<string>({
  get: () => {
    const key = profitDateTarget.value;
    if (!key || !auction.value) return '';
    return auction.value[key] ?? '';
  },
  set: (value) => {
    const key = profitDateTarget.value;
    if (key) void setProfitDate(key, value);
  },
});

// 값 복사 (앱에서는 Capacitor 클립보드)
const copiedMsg = ref('');
const copiedTone = ref<'info' | 'success' | 'error'>('success');
/** 짧은 알림 — 앱 공통 토스트로 띄운다 */
const flashToast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  copiedTone.value = tone;
  copiedMsg.value = text;
  window.setTimeout(() => { copiedMsg.value = ''; }, 1600);
};
/** 입찰 진행상황 — 단계(관심·임장·입찰·낙찰)와는 별개다.
 *  산정까지 끝낸 물건이 아직 대기인지, 입찰에 들어갔는지만 적어 둔다.
 *  저장은 예전부터 있던 bidStatus 한 칸을 그대로 쓴다 ('진행'이 곧 입찰). */
const BID_PROGRESS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '대기', label: '대기' },
  { value: '진행', label: '입찰' },
];
/** 적어 둔 값이 없으면 '대기' — 아직 입찰에 안 들어갔다는 뜻이라 그게 기본이다 */
const bidProgress = computed(() => (
  (auction.value?.bidStatus ?? '').replace(/^입찰/, '') === '진행' ? '진행' : '대기'
));
const setBidProgress = async (value: string) => {
  if (!auction.value) return;
  const next = value === '진행' ? '진행' : '대기';
  auction.value.bidStatus = next;
  await store.saveAuction(auction.value);
  flashToast(`진행상황을 '${next === '진행' ? '입찰' : '대기'}'로 바꿨습니다.`, 'success');
};

/** 주소 복사 — 표에서는 주소가 잘려 보이므로 복사한 전체 주소를 토스트 윗줄에 같이 보여 준다 */
const copyAddressText = async (address: string) => {
  const value = String(address ?? '').trim();
  if (!value) return;
  try {
    if (Capacitor.isNativePlatform()) await Clipboard.write({ string: value });
    else await navigator.clipboard.writeText(value);
    flashToast(`${value}\n복사되었습니다.`, 'success');
  } catch {
    flashToast('복사에 실패했습니다.', 'error');
  }
};

const copyText = async (text: string) => {
  const value = String(text ?? '').trim();
  if (!value) return;
  try {
    if (Capacitor.isNativePlatform()) await Clipboard.write({ string: value });
    else await navigator.clipboard.writeText(value);
    flashToast('복사되었습니다.', 'success');
  } catch {
    flashToast('복사에 실패했습니다.', 'error');
  }
};

// 기간 필터 — 3/6/12개월 버튼과 휠 달력
const pubMonthPreset = ref(12); // 기본 12개월
const pubDateTarget = ref<'' | 'start' | 'end'>('');
const pubDateValue = computed({
  get: () => (pubDateTarget.value === 'start' ? publicStartDate.value : pubDateTarget.value === 'end' ? publicEndDate.value : ''),
  set: (value: string) => {
    if (pubDateTarget.value === 'start') publicStartDate.value = value;
    if (pubDateTarget.value === 'end') publicEndDate.value = value;
    pubMonthPreset.value = 0;
  },
});
const setPubMonths = (months: number) => {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  publicStartDate.value = fmt(start);
  publicEndDate.value = fmt(end);
  pubMonthPreset.value = months;
};

/** 조회 창을 '오늘 기준 12개월' 로 바로잡았다. 캐시에 남은 옛 숫자(한 달 모자란 값)가
 *  하루 동안 그대로 보이지 않도록 열쇠에 표를 달아 둔다. 창을 또 손보면 이 수를 올린다. */
const DONG_TRADE_CACHE_VER = 'w2';

// 국토부 실거래가 — 마지막으로 불러오거나 검색 조건을 바꾼 시각
const publicTradeUpdatedAt = ref('');
// 일부 월 조회가 실패하면 건수가 조용히 적게 나온다 — 숨기지 말고 알린다
const publicTradeWarning = ref('');
// 검색 결과 표 — 머리줄(구분)만 남기고 접어 둔다. 기본은 접힘.
// 정상거래는 들어오자마자 보여 준다 — 매번 눌러 펴야 했다
const pubTableCollapsed = ref(false);
// 집계에서 뺀 직거래 건수 — 몇 건을 뺐는지 눈에 보이게 한다
const pubDirectCount = ref(0);
const pubDirectRows = ref<RealTradeMatchRow[]>([]);
const filteredDirectRows = computed(() => pubDirectRows.value);
// 집계에서 뺀 계약해제 건 — 직거래와 같은 방식으로 따로 펼쳐 본다
const pubCancelledRows = ref<RealTradeMatchRow[]>([]);
const filteredCancelledRows = computed(() => pubCancelledRows.value);
const pubCancelledCollapsed = ref(true);
const pubDirectCollapsed = ref(true);

// === 검색리스트 안에서 찾기 ===
// 선정물건리스트의 검색창과 같은 방식 — 한 칸에 적으면 줄 전체를 훑는다.
// 머리글 ▼ 거르기와는 역할이 다르다. 거르기는 '조건'이라 평균·③ 조건분석까지
// 바뀌지만, 이 검색은 '찾기'라 보이는 줄만 줄인다. 찾다가 결론이 흔들리면 안 된다.
const pubSearch = ref('');
/** 띄어쓰기·대소문자는 무시한다 — '검암동 493' 과 '검암동493' 이 같이 걸리게 */
const squish = (v: string) => v.replace(/\s+/g, '').toLowerCase();
/** 한 줄에서 찾을 수 있는 글자 모음. 화면에 보이는 모양과 날 값을 둘 다 담는다 —
 *  '146,000,000' 으로도 '146000000' 으로도 찾을 수 있어야 한다. */
const pubRowHaystack = (r: RealTradeMatchRow) => squish([
  r.contractDate ?? '',
  formatWonSimple(r.price), String(r.price ?? ''),
  areaWithPyeong(r.areaM2), String(r.areaM2 ?? ''),
  normalizeHouseType(r.houseType),
  r.buildYear ? String(r.buildYear) : '', buildYearAge(r.buildYear),
  r.floor ?? '',
  rowAddress(r),
].join(' '));
/** 적은 말과, 쉼표를 뺀 말 — 둘 중 하나만 걸려도 찾은 것으로 본다 */
const pubSearchKeys = computed(() => {
  const q = squish(pubSearch.value);
  if (!q) return [];
  const bare = q.replace(/,/g, '');
  return bare === q ? [q] : [q, bare];
});
const pubSearchHit = (r: RealTradeMatchRow) => {
  const keys = pubSearchKeys.value;
  if (keys.length === 0) return true;
  const hay = pubRowHaystack(r);
  return keys.some((k) => hay.includes(k));
};
const shownPubRows = computed(() => filteredPublicTradeRows.value.filter(pubSearchHit));
const shownDirectRows = computed(() => filteredDirectRows.value.filter(pubSearchHit));
const shownCancelledRows = computed(() => filteredCancelledRows.value.filter(pubSearchHit));
/** 세 표를 통틀어 몇 줄이 걸렸나 — 지금 접혀 있는 표에서 걸린 것도 세어 준다 */
const pubSearchCount = computed(() => (
  shownPubRows.value.length + shownDirectRows.value.length + shownCancelledRows.value.length
));
// 둘을 동시에 펼치면 서로 가려 눌러도 반응이 없는 것처럼 보인다 — 하나만 열리게 한다
// 셋 중 하나만 펼친다 — 두 표가 겹쳐 뜨면 어느 쪽 숫자인지 헷갈린다
const toggleTradeList = () => {
  pubTableCollapsed.value = !pubTableCollapsed.value;
  if (!pubTableCollapsed.value) { pubDirectCollapsed.value = true; pubCancelledCollapsed.value = true; }
};
const toggleDirectList = () => {
  pubDirectCollapsed.value = !pubDirectCollapsed.value;
  if (!pubDirectCollapsed.value) { pubTableCollapsed.value = true; pubCancelledCollapsed.value = true; }
};
const toggleCancelledList = () => {
  pubCancelledCollapsed.value = !pubCancelledCollapsed.value;
  if (!pubCancelledCollapsed.value) { pubTableCollapsed.value = true; pubDirectCollapsed.value = true; }
};
const stampPublicTradeUpdate = () => {
  const d = new Date();
  publicTradeUpdatedAt.value = updateStamp(d);
};

// 검색 조건을 바꾸면 UPDATE 시각을 다시 찍는다
watch(
  [publicStartDate, publicEndDate, publicMinArea, publicMaxArea, publicMinBuildYear, publicMaxBuildYear, publicColFilters],
  () => { if (publicTradeUpdatedAt.value) stampPublicTradeUpdate(); },
  { deep: true },
);

const fetchedAuctionId = ref<string | null>(null);
watch(
  () => auction.value?.id,
  (id) => {
    if (!id || fetchedAuctionId.value === id) return;
    fetchedAuctionId.value = id;
    // 급한 것부터 — 단지 전체(2년치 × 매매/전월세 = 50번 호출)를 먼저 던지면 이 둘이 밀려서 실패한다
    void (async () => {
      await fetchPublicTradeRows();
      await fetchDeal12mCount();
      await fetchDongUnits();
      void fetchOfficialPrice();
      // 입지등수 자동값이 주변환경(도보 거리)을 쓴다 — 가장 뒤에서 조용히 받아 둔다
      void fetchNearbyForAuction();
      void loadSamePlaceTrades();
    })();
  },
  { immediate: true },
);


// === 주변환경 (Kakao Local API) ===
const nearbyEnv = ref<NearbyEnvironment | null>(null);
const fetchingNearby = ref(false);

const nearbyDisplay = computed(() => {
  const env = nearbyEnv.value;
  if (!env) return [] as Array<{ label: string; total: number; items: NearbyPlace[] }>;
  return [
    { label: '버스정류장', total: env.busStop.length, items: env.busStop.slice(0, 4) },
    { label: '지하철', total: env.subway.length, items: env.subway.slice(0, 4) },
    { label: '종합병원', total: env.hospital.length, items: env.hospital.slice(0, 4) },
    { label: '의원', total: env.clinic.length, items: env.clinic.slice(0, 4) },
    { label: '약국', total: env.pharmacy.length, items: env.pharmacy.slice(0, 4) },
    { label: '대형마트', total: env.mart.length, items: env.mart.slice(0, 4) },
    { label: '편의점', total: env.convStore.length, items: env.convStore.slice(0, 4) },
    { label: '행정복지센터', total: env.publicCenter.length, items: env.publicCenter.slice(0, 4) },
    { label: '공원', total: env.park.length, items: env.park.slice(0, 4) },
    { label: '공인중개사', total: env.realtor.length, items: env.realtor.slice(0, 4) },
    { label: '학원', total: env.academy.length, items: env.academy.slice(0, 4) },
    { label: '어린이집', total: env.daycare.length, items: env.daycare.slice(0, 4) },
    { label: '초등학교', total: env.school.length, items: env.school.slice(0, 4) },
  ];
});

const nearbyView = ref<'pdf' | 'kakao'>('pdf');

const PDF_NEARBY_LABELS: Array<{ key: keyof NonNullable<AuctionDetail['pdfNearbyEnv']>; label: string }> = [
  { key: 'busStop', label: '버스정류장' },
  { key: 'subway', label: '지하철' },
  { key: 'hospital', label: '종합병원' },
  { key: 'clinic', label: '의원' },
  { key: 'pharmacy', label: '약국' },
  { key: 'mart', label: '대형마트' },
  { key: 'convStore', label: '편의점' },
  { key: 'publicCenter', label: '행정복지센터' },
  { key: 'park', label: '공원' },
  { key: 'realtor', label: '공인중개사' },
  { key: 'academy', label: '학원' },
  { key: 'daycare', label: '어린이집' },
];

const pdfNearbyDisplay = computed(() => {
  const env = auction.value?.pdfNearbyEnv;
  if (!env) return [] as Array<{ label: string; total: number; items: Array<{ name: string; distance: string }> }>;
  return PDF_NEARBY_LABELS
    .filter((g) => env[g.key])
    .map((g) => ({
      label: g.label,
      total: env[g.key]!.total,
      items: env[g.key]!.items.slice(0, 4),
    }));
});

// 탭을 누르면 바로 카카오 지도에서 조회한다 (이미 받아둔 결과가 있으면 재조회하지 않음)
const openKakaoNearby = (force = false) => {
  nearbyView.value = 'kakao';
  if (force || !nearbyEnv.value) void fetchNearbyForAuction();
};
const onKakaoSearchClick = () => openKakaoNearby(true);

// PDF '주변환경' 섹션 = 등기소·세무서·행정복지센터 목록
const agencyItems = computed(() => auction.value?.adminAgencyItems ?? []);

const naverMapUrl = (name: string) => `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
// "이름(거리)" / "이름 (336m)" 같은 텍스트에서 거리 부분과 prefix를 제거해 검색용 이름만 추출
const stripDistanceFromName = (raw: string) =>
  raw
    .replace(/\s*\([^()]*?(?:km|m)\)\s*$/i, '')
    .replace(/^[가-힣]+\s*:\s*/, '')
    .trim();

// Kakao 키워드 검색으로 장소명 → 좌표 변환 (Naver Map 길찾기 dlat/dlng 채우기 위함)
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
const KAKAO_BASE = (import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL as string | undefined)
  ?? (import.meta.env.DEV ? '/api-kakao' : 'https://dapi.kakao.com');
const findPlaceCoords = async (
  keyword: string,
  anchor?: { lat: number; lng: number },
): Promise<{ lat: number; lng: number; placeName: string } | null> => {
  if (!keyword) return null;
  const params = new URLSearchParams({ query: keyword.trim(), size: '1' });
  if (anchor) {
    params.set('x', String(anchor.lng));
    params.set('y', String(anchor.lat));
    params.set('radius', '20000');
    params.set('sort', 'distance');
  }
  try {
    const res = await fetch(`${KAKAO_BASE}/v2/local/search/keyword.json?${params.toString()}`, {
      headers: !import.meta.env.DEV && KAKAO_REST_API_KEY
        ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
        : undefined,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { documents?: Array<{ x: string; y: string; place_name: string }> };
    const first = json.documents?.[0];
    if (!first) return null;
    return { lng: Number(first.x), lat: Number(first.y), placeName: first.place_name };
  } catch {
    return null;
  }
};

// nmap:// scheme을 시도하고 실패 시 웹 fallback (FieldTripPlannerPage 패턴 동일)
const launchNativeScheme = (scheme: string, webFallback: string) => {
  if (!Capacitor.isNativePlatform()) {
    window.open(webFallback, '_blank');
    return;
  }
  let leftApp = false;
  const onVisibility = () => { if (document.hidden) leftApp = true; };
  document.addEventListener('visibilitychange', onVisibility);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = scheme;
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    document.removeEventListener('visibilitychange', onVisibility);
    if (!leftApp && !document.hidden) {
      void Browser.open({ url: webFallback });
    }
  }, 1500);
};

const openNaverDirections = async (raw: string, e?: Event) => {
  if (e) e.preventDefault();
  const name = stripDistanceFromName(raw || '');
  if (!name) return;
  // Disambiguate common school/agency names by anchoring around the auction address (geocoded on demand).
  let anchor: { lat: number; lng: number } | undefined;
  const addr = auction.value?.roadAddress || auction.value?.address || '';
  if (addr) {
    try {
      const p = await geocodeAddress(addr);
      if (p) anchor = { lat: p.lat, lng: p.lng };
    } catch {
      /* ignore — search without anchor */
    }
  }
  const place = await findPlaceCoords(name, anchor);
  const encoded = encodeURIComponent(name);
  if (place) {
    const dname = encodeURIComponent(place.placeName || name);
    // Naver Map app: dlat/dlng required for destination field to populate; current GPS becomes origin.
    // 자동차(car) 모드: 도보(walk)는 50km 제한이 있어 멀리 있는 목적지에서 막힘.
    const appUrl =
      `nmap://route/car?dlat=${place.lat}&dlng=${place.lng}&dname=${dname}&appname=com.terry.auction`;
    // Web fallback: directions URL with end coords (PLACE_POI marker).
    const webUrl =
      `https://map.naver.com/p/directions/-/-/-/-/${place.lng},${place.lat},${dname},,PLACE_POI/-/car?c=15.00,0,0,0,dh`;
    launchNativeScheme(appUrl, webUrl);
    return;
  }
  // Could not resolve coords — fall back to a place search page (one tap to 길찾기 inside Naver).
  const fallback = `https://map.naver.com/p/search/${encoded}`;
  if (Capacitor.isNativePlatform()) {
    void Browser.open({ url: fallback });
  } else {
    window.open(fallback, '_blank');
  }
};

const fetchNearbyForAuction = async () => {
  console.log('[Nearby] called');
  const a = auction.value;
  if (!a) { console.log('[Nearby] no auction'); return; }
  if (fetchingNearby.value) { console.log('[Nearby] already fetching'); return; }
  const addr = a.roadAddress || a.address;
  if (!addr) {
    console.log('[Nearby] no address');
    return;
  }
  fetchingNearby.value = true;
  try {
    console.log('[Nearby] geocoding:', addr);
    const point = await geocodeAddress(addr);
    console.log('[Nearby] geocode result:', point ? `${point.lat},${point.lng}` : 'NULL');
    if (!point) return;
    console.log('[Nearby] fetching env at', point.lat, point.lng);
    const result = await fetchNearbyEnvironment(point.lat, point.lng, 1000);
    const counts = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, (v as unknown[]).length]));
    console.log('[Nearby] counts:', JSON.stringify(counts));
    nearbyEnv.value = result;
  } catch (e) {
    console.log('[Nearby] error:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  } finally {
    fetchingNearby.value = false;
  }
};

const editingProfit = ref(false);

const apprValue = computed(() => auction.value?.metrics.appraisalValue ?? 0);
// 입찰보증금 — PDF 값이 있으면 그걸, 없으면 최저가의 10%
const bidDeposit = computed(
  () => auction.value?.metrics?.depositValue || Math.round((auction.value?.metrics?.minimumBidValue ?? 0) * 0.1),
);

// === 산정표 ===
// 'B안이면 얼마' 를 보려면 표가 한 벌 더 있어야 한다. A안은 물건에 바로 붙어 있는
// 값을 쓰고, 더 만든 표는 auction.bidScenarios 에 한 벌씩 들어간다.
// 감정가·최저가·보증금은 물건의 사실이라 모든 표가 같이 쓴다 — 표마다 다른 건
// 입찰가·비용·매도가다. 계산은 전부 '표 한 벌(sc)'을 받아서 한다. 표가 늘어도 식은 하나다.
type ProfitScenario = {
  label: string;
  /** 입찰가를 담은 그릇 — A안은 물건의 metrics 그대로다 */
  bid: { myBidValue: number };
  sale: { expectedSaleValue: number; expectedSaleValue2?: string };
  cost: BidCostAnalysis;
  /** 더 만든 표인가 — A안은 지울 수 없다 */
  extra: boolean;
};
const PROFIT_LABELS = ['A안', 'B안', 'C안', 'D안'];
const PROFIT_MAX = PROFIT_LABELS.length;
const profitScenarios = computed<ProfitScenario[]>(() => {
  const a = auction.value;
  if (!a) return [];
  const list: ProfitScenario[] = [
    { label: PROFIT_LABELS[0], bid: a.metrics, sale: a, cost: a.bidCost, extra: false },
  ];
  (a.bidScenarios ?? []).forEach((s, i) => {
    list.push({ label: PROFIT_LABELS[i + 1] ?? `${i + 2}안`, bid: s, sale: s, cost: s.bidCost, extra: true });
  });
  return list;
});

const scBid = (sc: ProfitScenario) => sc.bid.myBidValue || auction.value?.metrics.minimumBidValue || 0;
/** 입찰가 비중 — 감정가 대비 내 입찰가 */
const scBidPct = (sc: ProfitScenario) => (apprValue.value > 0 ? (scBid(sc) / apprValue.value) * 100 : 0);
// 광고비의 3.3%는 원천징수라 떼서 세무서에 내는 돈 — 지출 총액은 그대로다
const scAdvertising = (sc: ProfitScenario) => sc.cost?.advertisingCost ?? 0;
// 필요경비합계: 대출 제외, 취득세/법무비/이자/중도상환/매도중개료/미납관리비/수리비/명도비/광고비 합산
const scTotalCosts = (sc: ProfitScenario) => {
  const c = sc.cost;
  if (!c) return 0;
  return (c.acquisitionTaxAmount ?? 0)
    + (c.legalCostAmount ?? 0)
    + (c.interestAmount ?? 0)
    + (c.midRepaymentAmount ?? 0)
    + (c.brokerageAmount ?? 0)
    + (c.arrearsFee ?? 0)
    + (c.repairCost ?? 0)
    + (c.evictionCost ?? 0)
    + scAdvertising(sc);
};
const scSale = (sc: ProfitScenario) => sc.sale.expectedSaleValue ?? 0;
/** 예비 매도가 — 적어 두기만 하는 값이다. 어떤 계산에도 쓰지 않는다 */
/** 매도가 옆 자유 입력칸. 예전에 숫자 칸이던 때의 0 은 빈칸으로 본다 */
const scSaleAlt = (sc: ProfitScenario) => {
  // 예전에 숫자 칸이던 때 저장된 0 도 들어올 수 있어 문자로 맞춰 본다
  const v = String(sc.sale.expectedSaleValue2 ?? '');
  return v === '0' ? '' : v;
};
const scSetSaleAlt = (sc: ProfitScenario, value: string) => { sc.sale.expectedSaleValue2 = value; };
const scGain = (sc: ProfitScenario) => scSale(sc) - scBid(sc) - scTotalCosts(sc);
const scLocalTaxRate = (sc: ProfitScenario) => sc.cost?.localTaxRate ?? 10;

// 사업소득 금액이 걸리는 누진세율 구간 — 표의 '과세표준' 옆에 같이 보여 준다
const taxRateOf = (L: number) => {
  if (L <= 0) return 0;
  if (L <= 14_000_000) return 6;
  if (L <= 50_000_000) return 15;
  if (L <= 88_000_000) return 24;
  if (L <= 150_000_000) return 35;
  if (L <= 300_000_000) return 38;
  if (L <= 500_000_000) return 40;
  if (L <= 1_000_000_000) return 42;
  return 45;
};
// 그 구간에서 빼 주는 누진공제 — 세액이 어떻게 나왔는지 눈으로 보려고 같이 띄운다
const taxDeductOf = (L: number) => {
  if (L <= 14_000_000) return 0;
  if (L <= 50_000_000) return 1_260_000;
  if (L <= 88_000_000) return 5_760_000;
  if (L <= 150_000_000) return 15_440_000;
  if (L <= 300_000_000) return 19_940_000;
  if (L <= 500_000_000) return 25_940_000;
  if (L <= 1_000_000_000) return 35_940_000;
  return 65_940_000;
};
/** 세율·누진공제는 사업소득금액이 걸리는 구간에서 저절로 서지만,
 *  구간을 달리 보거나 다른 소득과 합산할 때가 있어 손으로도 고칠 수 있게 둔다. */
// 0 은 '안 적었다' 로 본다 — 구간이 바뀌어도 0 이 남아 공제를 먹어 버리면
// 세금이 조용히 많아진다. 6% 구간의 공제는 어차피 0 이라 잃는 것도 없다.
const scTaxRate = (sc: ProfitScenario) => sc.cost?.incomeTaxRateManual || taxRateOf(scGain(sc));
const scTaxDeduct = (sc: ProfitScenario) => sc.cost?.incomeTaxDeduct || taxDeductOf(scGain(sc));
const scTransferTaxAuto = (sc: ProfitScenario) => {
  const L = scGain(sc);
  if (L <= 0) return 0;
  return Math.max(0, (L * scTaxRate(sc)) / 100 - scTaxDeduct(sc));
};
const scBracket = (sc: ProfitScenario) => (scGain(sc) <= 0 ? '-' : `${scTaxRate(sc)}%`);
const scDeductionText = (sc: ProfitScenario) => {
  const d = scTaxDeduct(sc);
  return d > 0 ? `${Math.round(d / 10_000).toLocaleString('ko-KR')}만` : '';
};
/** 세율이나 공제를 고치면 직접 적어 둔 세액은 풀고 다시 자동 계산으로 돌린다 */
const scSetTaxRate = (sc: ProfitScenario, raw: string) => {
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  sc.cost.incomeTaxRateManual = pct;
  sc.cost.incomeTaxAmount = undefined;
  sc.cost.localTaxAmount = undefined;
};
const scSetTaxDeduct = (sc: ProfitScenario, raw: string) => {
  const man = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(man)) return;
  // 0 은 비운 것으로 둔다 — 구간의 기본 공제로 돌아간다
  sc.cost.incomeTaxDeduct = man > 0 ? Math.round(man * 10_000) : undefined;
  sc.cost.incomeTaxAmount = undefined;
  sc.cost.localTaxAmount = undefined;
};
// 직접 넣은 금액이 있으면 그것을, 없으면 자동 계산값을 쓴다
const scTransferTax = (sc: ProfitScenario) => sc.cost?.incomeTaxAmount ?? scTransferTaxAuto(sc);
const scLocalTaxAuto = (sc: ProfitScenario) => scTransferTax(sc) * (scLocalTaxRate(sc) / 100);
const scLocalTax = (sc: ProfitScenario) => sc.cost?.localTaxAmount ?? scLocalTaxAuto(sc);
const scAfterTaxProfit = (sc: ProfitScenario) => scGain(sc) - scTransferTax(sc) - scLocalTax(sc);
const scNetInvestment = (sc: ProfitScenario) => scBid(sc) - (sc.cost?.loanAmount ?? 0) + scTotalCosts(sc);
const scTotalInvest = (sc: ProfitScenario) => scBid(sc) + scTotalCosts(sc);
const scAfterTaxRate = (sc: ProfitScenario) => (
  scNetInvestment(sc) > 0 ? (scAfterTaxProfit(sc) / scNetInvestment(sc)) * 100 : 0
);
/** 입찰가를 이만큼 썼다면 세후 순이익이 얼마가 되나 — 화면의 식을 그대로 옮긴 것이다.
 *  입찰가가 바뀔 때 따라 바뀌는 건 취득세뿐이고(비율로 묶여 있다), 대출·중도상환·이자·
 *  중개료는 대출금과 매도가에 묶여 있어 그대로다. */
const scProfitAtBid = (sc: ProfitScenario, bid: number) => {
  const c = sc.cost;
  if (!c) return 0;
  const acqRate = c.acquisitionTaxRate && c.acquisitionTaxRate > 0 ? c.acquisitionTaxRate : ACQ_TAX_DEFAULT_RATE;
  const costs = Math.round((bid * acqRate) / 100)
    + (c.legalCostAmount ?? 0)
    + (c.interestAmount ?? 0)
    + (c.midRepaymentAmount ?? 0)
    + (c.brokerageAmount ?? 0)
    + (c.arrearsFee ?? 0)
    + (c.repairCost ?? 0)
    + (c.evictionCost ?? 0)
    + (c.advertisingCost ?? 0);
  const gain = scSale(sc) - bid - costs;
  if (gain <= 0) return gain;
  const rate = c.incomeTaxRateManual || taxRateOf(gain);
  const deduct = c.incomeTaxDeduct || taxDeductOf(gain);
  const tax = Math.max(0, (gain * rate) / 100 - deduct);
  const local = tax * ((c.localTaxRate ?? 10) / 100);
  return gain - tax - local;
};
/** 세후 순이익을 적으면 그만큼 남기려면 입찰가를 얼마로 써야 하는지 거꾸로 푼다.
 *  입찰가가 오르면 순이익은 줄기만 해서(단조) 반씩 좁혀 가며 찾는다. */
const scSetAfterTaxProfit = (sc: ProfitScenario, value: number | string) => {
  const target = Number(String(value).replace(/[^\d.-]/g, '')) || 0;
  if (!sc.cost) return;
  let lo = 0;
  let hi = Math.max(scSale(sc), apprValue.value) * 2;
  if (hi <= 0) return;
  // 목표가 너무 커서 입찰가 0 으로도 못 미치면 더 줄일 방법이 없다
  if (scProfitAtBid(sc, 0) < target) { sc.bid.myBidValue = 0; return; }
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (scProfitAtBid(sc, mid) >= target) lo = mid; else hi = mid;
  }
  sc.bid.myBidValue = Math.round(lo);
  // 직접 적어 둔 세액이 있으면 새 입찰가와 어긋난다 — 풀어서 다시 자동 계산으로
  sc.cost.incomeTaxAmount = undefined;
  sc.cost.localTaxAmount = undefined;
};
const scPctOfBid = (sc: ProfitScenario, n: number | undefined | null) => (
  scBid(sc) > 0 && n ? (n / scBid(sc)) * 100 : 0
);

// 자동 계산값과 같은 값이 들어오면 '직접 입력'으로 보지 않는다.
// (입력칸이 포맷을 맞추며 같은 값을 다시 써 넣어도 자동 계산이 멈추지 않도록)
const scSetIncomeTax = (sc: ProfitScenario, value: number | string) => {
  const n = Number(value) || 0;
  sc.cost.incomeTaxAmount = Math.abs(n - Math.round(scTransferTaxAuto(sc))) < 1 ? undefined : n;
};
const scSetLocalTax = (sc: ProfitScenario, value: number | string) => {
  const n = Number(value) || 0;
  sc.cost.localTaxAmount = Math.abs(n - Math.round(scLocalTaxAuto(sc))) < 1 ? undefined : n;
};
// 지방세율을 고치면 직접 입력해 둔 금액은 풀고 다시 자동 계산으로 돌린다
const scSetLocalTaxRate = (sc: ProfitScenario, raw: string) => {
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  sc.cost.localTaxRate = pct;
  sc.cost.localTaxAmount = undefined;
};
// %는 소수점 둘째 자리까지만 받는다
const limitPct = (e: Event) => {
  const el = e.target as HTMLInputElement;
  const cleaned = el.value.replace(/[^\d.-]/g, '').replace(/(\..*)\./g, '$1');
  const m = cleaned.match(/^-?\d*(?:\.\d{0,2})?/);
  const next = m ? m[0] : '';
  if (el.value !== next) el.value = next;
};

type BidCostAmountKey =
  | 'loanAmount'
  | 'acquisitionTaxAmount'
  | 'legalCostAmount'
  | 'interestAmount'
  | 'midRepaymentAmount'
  | 'brokerageAmount'
  | 'arrearsFee'
  | 'repairCost'
  | 'evictionCost'
  | 'advertisingCost';

const scSetAmountByPct = (sc: ProfitScenario, key: BidCostAmountKey, raw: string | number) => {
  const pct = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  sc.cost[key] = Math.round((scBid(sc) * pct) / 100);
};
const scSetBidByApprPct = (sc: ProfitScenario, raw: string | number) => {
  const pct = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  sc.bid.myBidValue = Math.round((apprValue.value * pct) / 100);
};

// 취득세 — 기본 1.10%. 입찰가가 바뀌면 이 비율로 다시 계산하고,
// 금액을 직접 고치면 그 값이 비율로 저장돼 다음 계산에 쓰인다.
const ACQ_TAX_DEFAULT_RATE = 1.1;
const scSyncAcqRate = (sc: ProfitScenario) => {
  const c = sc.cost;
  const bid = scBid(sc);
  const amount = c?.acquisitionTaxAmount ?? 0;
  if (!c || !amount || bid <= 0) return;
  const rate = Number(((amount / bid) * 100).toFixed(2));
  if (Math.abs(rate - (c.acquisitionTaxRate ?? 0)) > 0.005) c.acquisitionTaxRate = rate;
};

// 중도상환: amount = loan × pct/100
// 기준 금액(대출금·매가)이 아직 0이면 %만 입력해도 금액이 0이라 값이 사라진 것처럼 보인다.
// 그래서 입력한 %는 비율 필드에 남겨 두고, 기준 금액이 생기면 그때 금액을 채운다.
type RateRow = {
  amountKey: BidCostAmountKey;
  rateKey: 'midRepaymentRate' | 'interestRate3m' | 'brokerageRate';
  base: (sc: ProfitScenario) => number;
  /** 연이율의 3개월분처럼 나눠 쓰는 경우 */
  divisor?: number;
};
const RATE_ROWS: RateRow[] = [
  { amountKey: 'midRepaymentAmount', rateKey: 'midRepaymentRate', base: (sc) => sc.cost?.loanAmount ?? 0 },
  { amountKey: 'interestAmount', rateKey: 'interestRate3m', base: (sc) => sc.cost?.loanAmount ?? 0, divisor: 4 },
  { amountKey: 'brokerageAmount', rateKey: 'brokerageRate', base: (sc) => scSale(sc) },
];
// 화면에 보여 줄 % — 기준 금액이 있으면 금액에서, 없으면 저장해 둔 비율에서
const scRowPct = (sc: ProfitScenario, row: RateRow) => {
  const c = sc.cost;
  if (!c) return 0;
  const base = row.base(sc);
  const amount = c[row.amountKey] ?? 0;
  if (base > 0 && amount) return ((amount * (row.divisor ?? 1)) / base) * 100;
  return c[row.rateKey] ?? 0;
};
const scSetRowPct = (sc: ProfitScenario, row: RateRow, raw: string) => {
  const c = sc.cost;
  if (!c) return;
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  c[row.rateKey] = pct;
  c[row.amountKey] = Math.round((row.base(sc) * pct) / 100 / (row.divisor ?? 1));
};
// 금액을 직접 고치면 비율도 같이 맞춰 둔다
const scSyncRowRate = (sc: ProfitScenario, row: RateRow) => {
  const c = sc.cost;
  if (!c) return;
  const base = row.base(sc);
  if (base <= 0) return;
  const rate = Number(((((c[row.amountKey] ?? 0) * (row.divisor ?? 1)) / base) * 100).toFixed(2));
  if (Math.abs(rate - (c[row.rateKey] ?? 0)) > 0.005) c[row.rateKey] = rate;
};

/** 비율로 묶인 금액을 다시 센다 — 표마다 따로 돈다.
 *  입찰가·대출·매도가가 바뀌면 그 표의 취득세·중도상환·이자·중개료가 따라간다. */
const profitSeeds = computed(() => profitScenarios.value.map((sc) => ({
  bid: scBid(sc),
  loan: sc.cost?.loanAmount ?? 0,
  sale: scSale(sc),
})));
watch(
  [() => auction.value?.id, profitSeeds],
  () => {
    profitScenarios.value.forEach((sc) => {
      const c = sc.cost;
      if (!c) return;
      if (!c.acquisitionTaxRate || c.acquisitionTaxRate <= 0) c.acquisitionTaxRate = ACQ_TAX_DEFAULT_RATE;
      const expected = Math.round((scBid(sc) * c.acquisitionTaxRate) / 100);
      if (c.acquisitionTaxAmount !== expected) c.acquisitionTaxAmount = expected;
      RATE_ROWS.forEach((row) => {
        const rate = c[row.rateKey] ?? 0;
        if (rate <= 0) return;
        const want = Math.round((row.base(sc) * rate) / 100 / (row.divisor ?? 1));
        if (c[row.amountKey] !== want) c[row.amountKey] = want;
      });
    });
  },
  { deep: true, immediate: true },
);

/** 표 한 벌을 더 만든다 — 지금 표를 베껴 간다. 대개 입찰가만 고쳐 보기 때문이다 */
const addProfitScenario = async () => {
  const a = auction.value;
  if (!a) return;
  if (!a.bidScenarios) a.bidScenarios = [];
  if (a.bidScenarios.length >= PROFIT_MAX - 1) return;
  a.bidScenarios.push({
    myBidValue: a.metrics.myBidValue ?? 0,
    expectedSaleValue: a.expectedSaleValue ?? 0,
    expectedSaleValue2: a.expectedSaleValue2 ?? '',
    bidCost: JSON.parse(JSON.stringify(a.bidCost)) as BidCostAnalysis,
  });
  await store.saveAuction(a);
};
/** 마지막 표를 지운다. A안은 지울 수 없다 */
const removeProfitScenario = () => {
  const a = auction.value;
  if (!a?.bidScenarios?.length) return;
  askConfirm({
    title: '마지막 산정표를 지울까요?',
    desc: '그 표에 적어 둔 값이 같이 사라집니다.',
    okLabel: '지우기',
    skipKey: 'adp.skip.removeProfitTable',
    run: async () => {
      a.bidScenarios?.pop();
      await store.saveAuction(a);
    },
  });
};

const startEditProfit = () => {
  editingProfit.value = true;
};
/** 비중 기본값 — services/auctionMapper 의 createBidCostDefaults 와 같은 값이다.
 *  (두 곳이 갈라지면 '기본값' 이 두 가지가 되므로 고칠 때 같이 고친다) */
const BID_COST_DEFAULT_RATES: Array<[BidCostAmountKey, number]> = [
  ['loanAmount', 80],
  ['acquisitionTaxAmount', 1.1],
  ['legalCostAmount', 0.5],
];
/** 손으로 고친 비중을 그 표만 기본값으로 되돌린다. 입찰가는 건드리지 않는다 —
 *  그건 사용자가 정하는 값이지 기본값이 있는 자리가 아니다.
 *  표가 여럿이면 A안을 되돌리다 B안까지 지워지면 안 되므로 표 단위로 건다. */
const resetScenarioRates = (sc: ProfitScenario) => {
  askConfirm({
    title: `${sc.label} 비중을 기본값으로 되돌릴까요?`,
    desc: '대출 80% · 취득세 1.10% · 법무비 0.50% 로 다시 계산합니다. 이 표만 바뀌고, 입찰가는 그대로 둡니다.',
    okLabel: '되돌리기',
    skipKey: 'adp.skip.resetBidCost',
    run: async () => {
      if (!auction.value || !sc.cost) return;
      BID_COST_DEFAULT_RATES.forEach(([key, pct]) => scSetAmountByPct(sc, key, pct));
      // 취득세는 비율을 따로 들고 있다 — 입찰가가 바뀔 때 이 비율로 다시 계산된다
      sc.cost.acquisitionTaxRate = 1.1;
      await store.saveAuction(auction.value);
      flashToast(`${sc.label} 비중을 기본값으로 되돌렸습니다.`, 'success');
    },
  });
};

const saveProfit = async () => {
  if (!auction.value) return;
  await store.saveAuction(auction.value);
  editingProfit.value = false;
};

/** 물건정보 탭의 기본 상태 — 정보요약·물건기본정보만 펴 두고 나머지는 접어 둔다.
 *  (처음 들어왔을 때 한 화면에서 핵심만 보이게) */
const collapsed = ref<Record<string, boolean>>({
  bld: true, status: true, apt: true, arrears: true, areaInfo: true,
  // 권리분석의 등기·임차인 표는 길다 — 접어 두고 볼 때만 편다
  registry: true, tenant: true,
  // 세율표는 가끔 들춰 보는 참고 자료다 — 산정표 아래를 길게 차지하지 않게 접어 둔다
  taxRef: true,
  // 현장에서만 쓰는 목록이라 평소에는 접어 둔다
  checklist: true,
});
const toggleSection = (key: string) => { collapsed.value[key] = !collapsed.value[key]; };
// 상세 화면의 모든 카드 키 — 전체 접기/펼치기에 쓴다
const ALL_SECTION_KEYS = [
  'summary', 'base', 'tenant', 'bld', 'status', 'registry', 'cases', 'apt', 'arrears',
  'areaInfo', 'photos', 'rightsPhotos', 'rightsCheck', 'sameLot', 'casePrice',
  'realUser', 'demand', 'survPrice', 'survField', 'trades', 'checklist', 'profit', 'taxRef',
];
const allCollapsed = computed(() => ALL_SECTION_KEYS.every((key) => collapsed.value[key]));
const toggleAllSections = () => {
  const next = !allCollapsed.value;
  const map: Record<string, boolean> = { ...collapsed.value };
  ALL_SECTION_KEYS.forEach((key) => { map[key] = next; });
  collapsed.value = map;
};
const isCollapsed = (key: string) => !!collapsed.value[key];


// === 손품조사 폼 ===
const defaultSurveyForm = () => ({
  fieldNote: '', surveyReport: [] as string[], oppositionStatus: '',
  arrearsTax: '', arrearsMaint: '', arrearsUtility: '',
  mailCheck: '' as '있음' | '없음' | '미확인' | '', occupancyDetail: '',
  sizeRange: '', layout: '', userType: '', locationConditions: '',
  regionGrade: '', complexGrade: '', pricePerPyeong: '', jeonsePrice: '',
  schoolNote: '', transportNote: '', jobNote: '', infraNote: '',
  realTradePrice: '', lowListPrice: '', urgentSalePrice: '',
  realTradeDate: '', realTradeBuilding: '', realTradeFloor: '',
  mktPubPrice: '', mktRegionArea: '', mktRegionJeonse: '', mktRegionReal: '',
  mktCaseArea: '', mktCaseJeonse: '', mktUnitArea: '', mktUnitPrice: '',
  mktLowListName: '', mktRows: [] as MarketSurveyRow[], mktValues: {} as Record<string, string>,
  agencyRows: [] as AgencyRow[], siteAgencyRows: [] as AgencyRow[],
  mktConcAvg: '', mktConcLow: '', mktConcPyeong: '', mktSimUnitPrice: '', mktSimPyeong: '',
  mktConcValues: {} as Record<string, string>, mktJeonseReset: false,
  fieldValues: {} as Record<string, string>,
  indivValues: {} as Record<string, string>, indivAvgPrice: '',
  hasUndergroundParking: false, brandTier: '',
  totalUnits: '', yearlyDeals: '', monthlyDeals: '', dealRate: '', dealRegion: '서울',
  listingUnits: '', listingCount: '', listingTarget: '', listingBacklog: '',
  saleDemandYn: '', saleDemandNote: '',
  buildYear: '', floorCurrent: '', floorTotal: '', floorPosition: '',
  structureType: '', hasElevator: false, slopeOk: false, noOdor: false,
  buildingState: '',
  direction: '', viewType: '', rooms: '', baths: '',
  households: '', parkingPerHouse: '', insideSurveyDone: false,
  repairState: '', insideNote: '',
  pdfAutoFilled: false,
});
const surveyForm = computed(() => {
  if (!auction.value) return defaultSurveyForm();
  if (!auction.value.surveyForm) auction.value.surveyForm = defaultSurveyForm();
  // Backward-compat: surveyReport was a single string previously
  const sf = auction.value.surveyForm as unknown as { surveyReport: string | string[] };
  if (typeof sf.surveyReport === 'string') {
    sf.surveyReport = sf.surveyReport ? [sf.surveyReport] : [];
  }
  return auction.value.surveyForm;
});
// 입지조사의 '실거래가'가 비어있을 때, 해당단지 매매 평균으로 자동 채움
watch(
  [() => auction.value?.id, pdfMaeMaeAvg],
  ([, avg]) => {
    const sf = surveyForm.value;
    if (!sf) return;
    if (sf.realTradePrice) return;
    if (!Number.isFinite(avg) || avg <= 0) return;
    sf.realTradePrice = String(avg);
  },
  { immediate: true },
);

// 개별성 분석 — PDF 건축물정보로 채울 수 있는 항목은 기본값으로 미리 넣어 둔다.
// (사용자가 고친 뒤 저장하면 pdfAutoFilled가 남아 다시 덮지 않는다)
const structureFromCommonUse = (commonUse: string | undefined) => {
  if (!commonUse) return '';
  if (/복도/.test(commonUse)) return '복도식';
  if (/계단/.test(commonUse)) return '계단식';
  return '';
};
// "0대 / 1대"(비상/승용) → 한 대라도 있으면 엘베 O
const elevatorFromPdf = (elevator: string | undefined) => {
  if (!elevator) return null;
  const counts = [...elevator.matchAll(/(\d+)\s*대/g)].map((m) => Number(m[1]));
  if (counts.length === 0) return null;
  return counts.some((n) => n > 0);
};

watch(
  () => auction.value?.id,
  () => {
    const a = auction.value;
    if (!a?.buildingHeader) return;
    const sf = surveyForm.value;
    if (!sf || sf.pdfAutoFilled) return;

    if (!sf.structureType) {
      sf.structureType = structureFromCommonUse(a.buildingHeader.commonUse);
    }
    const hasElevator = elevatorFromPdf(a.buildingHeader.elevator);
    if (hasElevator !== null) sf.hasElevator = hasElevator;
    if (!sf.floorTotal) sf.floorTotal = a.buildingHeader.floors ?? '';
    if (!sf.floorCurrent) sf.floorCurrent = a.buildingHeader.unitFloor ?? '';
    if (!sf.households) sf.households = a.buildingHeader.unitHouseholds || a.buildingHeader.households || '';
    if (!sf.buildYear) sf.buildYear = a.buildingHeader.approvalDate || a.approvalDate || '';
    if (!sf.parkingPerHouse) sf.parkingPerHouse = a.buildingHeader.unitTotalParking || a.buildingHeader.parking || '';
    sf.pdfAutoFilled = true;
  },
  { immediate: true },
);

// === 개별성 분석 — 구역내/단지내 항목표 ===
type IndivItem = {
  id: string;
  label: string;
  /** 초록 표시 — 직접 조사해야 하는 항목 */
  survey?: boolean;
  options?: string[];
  /** 선택이 아니라 직접 적는 항목 */
  text?: boolean;
  /** 입력칸 옆에 붙는 단위 (예: %) */
  suffix?: string;
  /** 입력칸을 칸의 절반만 쓰는 항목 (년식과 폭을 맞춘다) */
  half?: boolean;
  /** 년·월을 휠로 고르는 항목 (사용승인 연월) */
  yearMonth?: boolean;
  /** 목록에서 고르거나 직접 입력하는 항목 */
  combo?: boolean;
  /** 칸을 직접 꾸미는 항목 (세대수·주차수·동·층) */
  custom?: 'units' | 'dong' | 'floor';
  /** 기준 안내 문구 */
  note?: string;
  /** 가격율 */
  rate: string;
  /** 여러 개를 고를 수 있는 항목 */
  multi?: boolean;
  /** 한 줄에 선택칸이 두 개인 항목 (방/화장실) */
  sub?: { id: string; label: string; options: string[]; combo?: boolean };
};
type IndivGroup = { title: string; items: IndivItem[] };
const INDIV_GROUPS: IndivGroup[] = [
  {
    title: '경매빌라 개별성',
    items: [
      { id: 'ind.age', label: '년식', yearMonth: true, rate: '-15%' },
      { id: 'ind.parking', label: '주차수', text: true, half: true, rate: '5%' },
      { id: 'ind.slope', label: '경사', survey: true, options: ['O', 'X'], rate: '-5%' },
      { id: 'ind.elevator', label: '엘베', options: ['O', 'X'], rate: '10%' },
      { id: 'ind.odor', label: '혐오시설', survey: true, options: ['O', 'X'], rate: '-5%' },
      { id: 'ind.corridor', label: '현관구조', options: ['계단식', '복도식'], rate: '10%' },
      {
        id: 'ind.mgmt', label: '건물외부', survey: true, multi: true,
        options: ['좋음', '양호', '나쁨', '지정주차', '곰팡이', '누수', '결로'], rate: '-5%',
      },
      {
        id: 'ind.inside', label: '건물내부', survey: true, multi: true,
        options: ['좋음', '양호', '나쁨', '청결', '계단청소', '보안'], rate: '5%',
      },
    ],
  },
  {
    title: '경매호실 개별성',
    items: [
      { id: 'ind.floorNum', label: '층', custom: 'floor', rate: '3%' },
      { id: 'ind.direction', label: '향', multi: true, options: ['동', '서', '남', '북'], rate: '5%' },
      { id: 'ind.view', label: '뷰', options: ['뻥뷰', '단지뷰'], rate: '5%' },
      {
        id: 'ind.type', label: '타입', multi: true,
        options: ['판상형', '타워형', '복층형', '2베이', '3베이', '4베이', '다락'], rate: '5%',
      },
      { id: 'ind.sunlight', label: '일조량', survey: true, options: ['좋음', '보통', '나쁨'], rate: '5%' },
      {
        id: 'ind.rooms', label: '방/화장실', multi: true,
        options: ['1방', '2방', '3방', '4방', '1화', '2화', '3화'], rate: '5%',
      },
      { id: 'ind.repair', label: '수리유무', survey: true, options: ['부분수리', '올수리'], note: '올수리 1500 > 부분수리 500~1000 현금, 샷시 판단', rate: '10%' },
    ],
  },
];
const indivValue = (id: string) => surveyForm.value.indivValues?.[id] ?? '';
// 년식 — 사용승인 연월(YYYY-MM)을 휠로 고르고, 옆에 올해 기준 연차를 보여 준다
const indivAgeOpen = ref(false);
const indivAgeValue = computed({
  get: () => indivValue('ind.age'),
  set: (value: string) => setIndivValue('ind.age', value),
});
// 주차수 ÷ 세대수 → '1가구당 1.3대'
const indivParkingPerHome = computed(() => {
  const parking = Number(indivValue('ind.parking').replace(/[^\d.]/g, ''));
  const units = Number(sumVal('sum.units').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parking) || !Number.isFinite(units) || parking <= 0 || units <= 0) return '';
  return `1가구당 ${(parking / units).toFixed(1)}대`;
});
const indivAgeYears = computed(() => {
  const m = indivValue('ind.age').match(/^(\d{4})/);
  if (!m) return '';
  const years = new Date().getFullYear() - Number(m[1]) + 1;
  return years > 0 ? `${years}년차` : '';
});

// 세대수·층은 물건정보의 '정보요약'과 같은 값을 쓴다 (한쪽을 고치면 다른 쪽도 같이 바뀐다)
const indivUnitsText = computed(() => {
  const total = sumVal('sum.units');
  const area = sumVal('sum.areaUnits');
  if (!total && !area) return '-';
  const fmt = (v: string) => (v ? `${Number(v).toLocaleString('ko-KR')}세대` : '-');
  return `${fmt(total)} / ${fmt(area)}`;
});
const indivFloorText = computed(() => {
  const total = sumVal('sum.floorTotal');
  const cur = sumVal('sum.floorCurrent');
  const ho = sumVal('sum.ho');
  if (!total && !cur && !ho) return '-';
  const base = `${total || '-'}층 중 ${cur || '-'}층`;
  return ho ? `${base} / ${ho}호` : base;
});
const indivDongText = computed(() => {
  const total = indivValue('ind.dongTotal');
  const note = indivValue('ind.dongNote');
  const parts = [total ? `총 ${total}개동` : '', note ? `입지조건 ${note}` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '-';
});
const indivParkingText = computed(() => {
  const raw = indivValue('ind.parking');
  if (!raw) return '-';
  const count = Number(raw.replace(/[^\d.]/g, ''));
  const label = count > 0 ? count.toLocaleString('ko-KR') : raw;
  return indivParkingPerHome.value ? `${label} / ${indivParkingPerHome.value}` : label;
});

// 층 가격율 — 아파트/빌라와 층수에 따라 기본값이 달라진다
const indivFloorRate = () => {
  const kind = /아파트/.test(auction.value?.propertyType ?? '') ? '아파트' : '빌라';
  const floor = sumVal('sum.floorCurrent');
  const num = floor.match(/(\d+)/)?.[1];
  const isTop = Boolean(num) && num === sumVal('sum.floorTotal');
  if (kind === '아파트') {
    if (num === '1') return '-10';
    if (num === '2') return '-5';
    if (num === '3' || isTop) return '-3';
    return '';
  }
  if (kind === '빌라') {
    // 2·3층이 기준층, 그 위(또는 탑층)는 -10%
    if (num === '2' || num === '3') return '0';
    if (isTop || (num && Number(num) >= 4)) return '-10';
    return '';
  }
  return '';
};
// 가격율 — 저장·입력은 숫자만, 표시는 뒤에 %를 붙인다 (indivValues에 '<id>.rate'로 저장)
// 세대수·주차수처럼 숫자만 들어가는 값은 천단위 콤마로 보여 준다
const indivDisplay = (item: IndivItem) => {
  const raw = indivValue(item.id);
  if (!raw) return '-';
  if (item.suffix) {
    const num = raw.replace(/[^\d.]/g, '');
    return num ? `${num}${item.suffix}` : '-';
  }
  if (/^\d+$/.test(raw)) return Number(raw).toLocaleString('ko-KR');
  return raw;
};
// 가격율 기본값은 0 — 항목마다 정해 둔 비율은 참고용이고, 직접 적은 값만 쓴다.
// (층은 아파트/빌라 규칙으로 자동 계산되는 값이 있으면 그것을 쓴다)
const indivRateNum = (item: IndivItem) => {
  if (item.id === 'ind.floorNum') {
    const auto = indivFloorRate();
    if (auto) return auto;
  }
  return '0';
};
const indivRateOf = (item: IndivItem) => `${indivValue(`${item.id}.rate`) || indivRateNum(item)}%`;
// 가격율 합계와, 실거래평균가에 그 합계를 적용한 값
const indivRateTotal = computed(() => {
  let sum = 0;
  INDIV_GROUPS.forEach((g) => g.items.forEach((item) => {
    // 부호를 살려서 더한다 (−15 같은 유니코드 빼기도 -로 맞춘다)
    const raw = String(indivValue(`${item.id}.rate`) || indivRateNum(item)).replace(/[−–—]/g, '-');
    const m = raw.match(/-?\d+(\.\d+)?/);
    if (m) sum += Number(m[0]);
  }));
  return sum;
});
const indivAdjustedPrice = computed(() => {
  const base = mktSaleAvgValue.value;
  if (base <= 0) return '-';
  return Math.round(base * (1 + indivRateTotal.value / 100)).toLocaleString('ko-KR');
});
// 여러 개 고르는 항목 — 쉼표로 이어 붙인 한 문자열로 저장한다
const indivMultiOpen = ref('');
// 층처럼 '목록에서 고르거나 직접 입력'인 칸
const indivComboText = ref('');
const pickIndivCombo = (id: string, value: string) => {
  setIndivValue(id, value);
  indivMultiOpen.value = '';
  indivComboText.value = '';
};
const applyIndivCombo = (id: string) => {
  const text = indivComboText.value.trim();
  if (!text) return;
  pickIndivCombo(id, text);
};
const indivList = (id: string) => indivValue(id).split(',').map((v) => v.trim()).filter(Boolean);
const toggleIndivMulti = (id: string, opt: string) => {
  const picked = indivList(id);
  const idx = picked.indexOf(opt);
  if (idx >= 0) picked.splice(idx, 1);
  else picked.push(opt);
  setIndivValue(id, picked.join(', '));
};
const setIndivValue = (id: string, value: string) => {
  const sf = surveyForm.value;
  if (!sf.indivValues) sf.indivValues = {};
  sf.indivValues[id] = value;
};
// PDF에서 알 수 있는 항목은 빈 칸일 때만 기본 선택을 넣어 준다
watch(
  [() => auction.value?.id, () => surveyForm.value?.mktConcAvg],
  () => {
    const a = auction.value;
    const sf = surveyForm.value;
    if (!a || !sf) return;
    if (!sf.indivValues) sf.indivValues = {};
    const v = sf.indivValues;
    // 선택지가 바뀌기 전에 저장된 값은 지금 목록에 없으면 지운다 (여러 개 고르는 항목은 남은 것만 유지)
    INDIV_GROUPS.forEach((g) => g.items.forEach((item) => {
      const opts = item.options;
      if (!opts || item.combo) return;   // 콤보는 '직접 입력'도 허용하므로 건드리지 않는다
      const cur = v[item.id] ?? '';
      if (!cur) return;
      if (item.multi) {
        const picked = cur.split(',').map((x) => x.trim()).filter(Boolean);
        const kept = picked.filter((x) => opts.includes(x));
        if (kept.length !== picked.length) v[item.id] = kept.join(', ');
      } else if (!opts.includes(cur)) {
        v[item.id] = '';
      }
    }));
    // 예전에 '20년 이내'처럼 저장해 둔 값은 연월 형식으로 다시 채운다
    if (!/^\d{4}-\d{2}$/.test(v['ind.age'] ?? '')) {
      const m = (a.buildingHeader?.approvalDate || a.approvalDate || '').match(/(\d{4})[-./]?(\d{2})/);
      v['ind.age'] = m ? `${m[1]}-${m[2]}` : '';
    }
    const digits = (raw: string | undefined) => (raw ?? '').replace(/[^\d]/g, '');
    // '339대(자주식:511대, 기계식:949대)'처럼 숫자가 여러 개면 맨 앞 숫자만 쓴다
    const firstNum = (raw: string | undefined) => (raw ?? '').replace(/,/g, '').match(/\d+/)?.[0] ?? '';
    // 세대수 — 단지정보 세대수, 없으면 표제부 가구수
    if (!/^\d+$/.test(v['ind.units'] ?? '')) {
      const units = digits(a.aptComplexInfo?.households) || digits((a.buildingHeader?.households ?? '').split('/').pop());
      v['ind.units'] = units;
    }
    // 주차수 — 단지 총 주차대수, 없으면 표제부 주차 (숫자가 여러 개면 첫 숫자)
    const parkingNow = Number(v['ind.parking'] ?? '');
    if (!/^\d+$/.test(v['ind.parking'] ?? '') || parkingNow > 100000) {
      v['ind.parking'] = firstNum(a.aptComplexInfo?.parkingTotal) || firstNum(a.buildingHeader?.unitTotalParking) || firstNum(a.buildingHeader?.parking);
    }
    // 용적률 — 표제부 값 (숫자만)
    if (!v['ind.far'] || !/[\d]/.test(v['ind.far'])) {
      const far = (a.buildingHeader?.floorAreaRatio ?? '').match(/[\d.]+/);
      v['ind.far'] = far ? far[0] : '';
    }
    // 동 — 총 동수(단지정보)와 입지조건 기본 문구
    if (!v['ind.dongTotal']) v['ind.dongTotal'] = firstNum(a.aptComplexInfo?.buildings);
    if (!v['ind.dongNote']) v['ind.dongNote'] = '500m내';
    if (!v['ind.corridor']) v['ind.corridor'] = structureFromCommonUse(a.buildingHeader?.commonUse);
    if (!v['ind.elevator']) {
      const has = elevatorFromPdf(a.buildingHeader?.elevator);
      if (has !== null) v['ind.elevator'] = has ? 'O' : 'X';
    }
    if (!v['ind.floorNum'] && a.buildingHeader?.unitFloor) {
      const m = a.buildingHeader.unitFloor.match(/(\d+)/);
      if (m) v['ind.floorNum'] = `${m[1]}F`;
    }
  },
  { immediate: true },
);

// 카드마다·단락마다 따로 여닫는다. deal = 급매가의 1.실거래가 조사,
// listing = 2.저렴매물조사 (예전에는 둘이 location 하나를 같이 썼다)
const editingSurvey = ref({ field: false, deal: false, listing: false, individuality: false, realUser: false, demand: false });
const persistSurvey = async () => {
  if (!auction.value) return;
  await store.saveAuction(auction.value);
};
/** 글자를 칠 때마다 저장하면 한 글자에 한 번씩 서버로 간다.
 *  값은 바로 화면에 반영하고(저장은 메모리에 이미 끝나 있다), 손을 멈추면 그때 한 번 적는다.
 *  — 예전에는 엔터를 치거나 칸 밖을 눌러야(change) 값이 들어가서, 적고 바로 저장을 누르면
 *    방금 친 글자가 사라졌다. 이제 치는 즉시 들어간다. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const persistSoon = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; void persistSurvey(); }, 700);
};
onBeforeUnmount(() => { if (saveTimer) { clearTimeout(saveTimer); void persistSurvey(); } });
const saveSurveyAndClose = async (key: keyof typeof editingSurvey.value) => {
  if (!auction.value) return;
  await store.saveAuction(auction.value);
  editingSurvey.value[key] = false;
};

// === 현장조사 항목 ===
type FieldRow = {
  id: string;
  label: string;
  options?: string[];
  /** 여러 개 고를 수 있는 항목 */
  multi?: boolean;
  /** 선택 옆에 붙는 입력칸 */
  extra?: { id: string; placeholder: string; money?: boolean };
  /** 직접 적는 항목 */
  text?: boolean;
  placeholder?: string;
  suffix?: string;
  /** 줄 밑에 비고 한 칸을 더 낸다 — 고른 값만으로는 모자란 말을 적는 자리 */
  note?: boolean;
  /** 누구에게 들었나 — O/X 와는 따로 고른다 (들은 사람과 확인 여부는 다른 값이다) */
  who?: { id: string; options: string[] };
  /** 비고 자리를 글칸이 아니라 '고르는 칸'으로 — 여러 개 고를 수 있다.
   *  현장에서 자판을 두드리는 것보다 눌러 고르는 편이 빠른 항목들이다. */
  noteOptions?: string[];
};
/** 비고 값이 앉을 자리 — 항목 id 뒤에 붙인다 */
const fieldNoteId = (id: string) => `${id}.note`;
/** 열려 있는 '고르는 비고' — 한 번에 하나만 */
const fsPickOpen = ref('');
/** 골라 둔 것들 — 쉼표로 이어 한 칸에 담는다.
 *  고를 수 있는 것이 바뀌면 옛 값이 남는다('동·서' 가 '동향·서향' 이 된 뒤의 '서')
 *  — 지금 목록에 없는 값은 보여 주지 않고, 다음에 고를 때 같이 지워진다. */
const fieldPickList = (id: string, options?: string[]) => fieldVal(fieldNoteId(id))
  .split(',').map((v) => v.trim())
  .filter((v) => !!v && (!options || options.includes(v)));
/** '외벽크랙 O' 에서 'O' 를 뗀 이름 — 같은 항목의 O 와 X 를 가려내는 데 쓴다 */
const pickBase = (opt: string) => opt.replace(/\s[OX]$/, '');
const toggleFieldPick = (id: string, opt: string, options?: string[]) => {
  // 한 항목에 O 와 X 가 같이 남으면 말이 안 된다 — 같은 이름의 반대쪽은 지운다
  const picked = fieldPickList(id, options).filter((v) => v === opt || pickBase(v) !== pickBase(opt));
  const at = picked.indexOf(opt);
  if (at >= 0) picked.splice(at, 1);
  else picked.push(opt);
  setFieldValNow(fieldNoteId(id), picked.join(', '));
};
/** O/X 두 짝짜리 줄인가 — 그런 줄은 단추 둘 대신 체크 하나로 받는다.
 *  확인했으면 체크, 아니면 빈 칸. 'X' 를 따로 누를 까닭이 없다. */
const isOxRow = (item: FieldRow) => (item.options?.length === 2
  && item.options[0] === 'O' && item.options[1] === 'X');
/** 항목마다 O·X 를 짝지어 목록을 만든다 — '외벽크랙 O', '외벽크랙 X' … */
const oxPicks = (...names: string[]) => names.flatMap((n) => [`${n} O`, `${n} X`]);
/** 공과금 금액칸 — 숫자만 받던 칸이라 '미납 3개월' 같은 말을 적을 수가 없었다.
 *  글자를 그대로 받되, 숫자만 적은 경우에는 천 단위 쉼표를 붙여 준다. */
const setFieldMoneyText = (id: string, el: HTMLInputElement) => {
  const raw = el.value;
  const next = /^[\d,]*$/.test(raw)
    ? raw.replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : raw;
  setFieldValNow(id, next);
  // 쉼표를 다시 찍어 준 경우에는 칸도 맞춰 준다 (값이 그대로면 화면이 안 바뀐다)
  if (el.value !== next) el.value = next;
};
const FIELD_SECTIONS: Array<{ title: string; special?: 'report'; items: FieldRow[] }> = [
  {
    title: '① 탐문',
    // 빌라에 가서 움직이는 차례 그대로 세운다 — 멀리서 집을 올려다보며 확인하는
    // 향·뷰·외벽, 건물에 들어서며 보는 것, 계량기, 한 바퀴 돌며 보는 것,
    // 그다음 사람에게 묻는 것, 마지막으로 문 앞의 비번.
    items: [
      // 자판을 두드리는 대신 눌러 고른다 — 현장에서는 그편이 빠르다
      { id: 'fs.aspect', label: '향 / 뷰', options: ['O', 'X'], noteOptions: ['동향', '서향', '남향', '북향', '뻥뷰', '단지내뷰'] },
      { id: 'fs.exterior', label: '건물관리', options: ['O', 'X'], noteOptions: oxPicks('외벽크랙', '필로티천장누수') },
      { id: 'fs.trash', label: '분리수거', options: ['O', 'X'], noteOptions: oxPicks('분리수거') },
      { id: 'fs.mailbox', label: '우편함', options: ['O', 'X'], noteOptions: oxPicks('전기요금', '가스요금', '수도요금') },
      // '\n' 으로 줄을 나눈다 — 한 줄로 두면 '사용현황'이 어중간하게 끊긴다
      { id: 'fs.utility', label: '전기가스수도\n사용현황', options: ['O', 'X'], noteOptions: oxPicks('단전', '단수', '가스차단') },
      // 건물을 한 바퀴 돌며 보는 것
      { id: 'fs.cctv', label: 'CCTV 보안', options: ['O', 'X'], noteOptions: ['CCTV 있음', 'CCTV 없음'] },
      { id: 'fs.parkList', label: '주차장관리', options: ['O', 'X'], noteOptions: ['리스트 있음', '리스트 없음'] },
      { id: 'fs.bikeKeep', label: '자전거보관', options: ['O', 'X'], noteOptions: ['사용', '방치'] },
      { id: 'fs.cleanCo', label: '계단청소', options: ['O', 'X'], noteOptions: oxPicks('관리') },
      // 사람에게 묻는 것 — 금액·연락처가 따라붙는 줄들
      {
        id: 'fs.mailMaint', label: '미납관리비', options: ['O', 'X'],
        who: { id: 'fs.mailMaintWho', options: ['동대표'] },
        extra: { id: 'fs.mailMaintAmt', placeholder: '금액 및 기타 입력', money: true },
      },
      {
        id: 'fs.roofLeak', label: '누수', options: ['O', 'X'], note: true,
        who: { id: 'fs.roofLeakWho', options: ['임차인', '입주민', '동대표'] },
      },
      {
        id: 'fs.tenantContact', label: '임차인탐문', options: ['동대표', '차확인'],
        who: { id: 'fs.tenantWho', options: ['임차인', '입주민'] },
        extra: { id: 'fs.tenantPhone', placeholder: '연락처입력' },
      },
      {
        id: 'fs.tenantCar', label: '임차인차량', options: ['O', 'X'],
        extra: { id: 'fs.tenantCarInfo', placeholder: '임차인 연락처 및 차량번호' },
      },
      { id: 'fs.doorCode', label: '출입문비번', text: true, placeholder: '비밀번호입력' },
      { id: 'fs.entryCode', label: '현관비번', text: true, placeholder: '비밀번호입력' },
    ],
  },
  {
    // 현장에서는 집을 다 보고 난 뒤에 '누가 살고 있나'를 적게 된다 — 탐문 뒤로 둔다.
    // 내용은 템플릿에 따로 있어 여기서는 자리만 잡는다
    title: '② 입찰자 현황조사',
    special: 'report',
    items: [],
  },
  {
    title: '③ 수리상태',
    items: [
      { id: 'fs.door', label: '도어', options: ['O', 'X'], noteOptions: ['분양상태', '교체'] },
      { id: 'fs.doorLock', label: '도어락', options: ['O', 'X'], noteOptions: ['분양상태', '교체'] },
      { id: 'fs.window', label: '샷시', options: ['O', 'X'], noteOptions: ['분양상태', '교체'] },
    ],
  },
];
// 현장 체크리스트 — 항목명과 확인할 내용
const FIELD_CHECKLIST: Array<{ id: string; label: string; desc: string }> = [
  { id: 'cl.location', label: '입지', desc: '일자리, 교통, 유치원, 초교, 학원가, 인프라, 공원 등' },
  { id: 'cl.age', label: '연령대', desc: '주 연령층, 자녀 비율(인터뷰)' },
  { id: 'cl.school', label: '학교/학원', desc: '이용 초교 및 학원가 위치' },
  { id: 'cl.middle', label: '중학교', desc: '배정 방식, 초교 연계 여부' },
  { id: 'cl.stay', label: '거주 지속성', desc: '초~고교 장기 거주 성향' },
  { id: 'cl.price', label: '시세(부동산)', desc: '타입·동·층·수리별 시세' },
  { id: 'cl.demand', label: '매수 수요(부동산)', desc: '대기 수요 및 처분 가능 급매가' },
  { id: 'cl.room', label: '호실 상태(부동산)', desc: '수리 상태 및 히스토리' },
  { id: 'cl.season', label: '수요 시기(부동산)', desc: '매매 수요 증가 시기 파악' },
  { id: 'cl.individual', label: '개별조건', desc: '연식, 경사, 복도/계단식, 난방, 타입' },
  { id: 'cl.floor', label: '층수', desc: '뷰, 사생활 침해, 1·2층, 탑층 등' },
  { id: 'cl.dong', label: '동', desc: '뷰, 남향, 단지 내 위치, 주차 연결 등' },
  { id: 'cl.repair', label: '수리상태(경매)', desc: '샤시, 문, 도어락 등' },
  { id: 'cl.maintFee', label: '미납관리비(경매)', desc: '우편함, 관리사무소 파악' },
  { id: 'cl.occupant', label: '점유자(경매)', desc: '우편함, 관리사무소 거주자 파악' },
  { id: 'cl.parking', label: '주차장', desc: '경비원·주민 인터뷰' },
];
// 건물외부상태 — 항목명 없이 확인 내용만 체크한다
const FIELD_EXTERIOR_CHECKS: Array<{ id: string; desc: string }> = [
  { id: 'cx.alley', desc: '집 앞 골목까지 사람, 차에대한 불편함 상태' },
  { id: 'cx.entrance', desc: '최초 출입구(비번확인), 공용계단 상태' },
  { id: 'cx.mailbox', desc: '우편물과 우편함 상태' },
  { id: 'cx.cctv', desc: '주 출입구의 CCTV 보안시설 상태' },
  { id: 'cx.elevator', desc: '엘베여부, 엘베대수 및 상태' },
  { id: 'cx.parking', desc: '세대별주차대수, 주차상태, 시간대별 주차공간 상태' },
  { id: 'cx.water', desc: '수도계량기위치, 개별상태, 지역관할기관번호 확인' },
  { id: 'cx.power', desc: '전기계량기위치, 개별상태, 지역관할기관번호 확인' },
  { id: 'cx.gas', desc: '가스계량기위치, 개별상태, 지역관할기관번호 확인' },
  { id: 'cx.roof', desc: '옥상상태, 옥상 바닥상태(탑층, 빌라 경우)' },
  { id: 'cx.piloti', desc: '필로티 구조' },
];
// 건물내부상태
const FIELD_INTERIOR_CHECKS: Array<{ id: string; desc: string }> = [
  { id: 'ci.position', desc: '구조적 위치, 지하창고여부' },
  { id: 'ci.leak', desc: '각방, 거실, 발코니 등 내부전체 누수, 곰팡이, 결로 상태' },
  { id: 'ci.neighborLeak', desc: '윗집, 아랫집에 대한 누수 여부 상태' },
  { id: 'ci.wall', desc: '각방, 거실, 발코니 등 내부전체 벽, 바닥, 천장 상태' },
  { id: 'ci.paper', desc: '각방, 거실, 발코니 등 내부전체 도배, 장판 상태' },
  { id: 'ci.window', desc: '각방, 거실, 발코니 등 내부전체 창틀, 창호, 잠금장치, 코킹 상태' },
  { id: 'ci.light', desc: '각방, 거실, 발코니 등 내부전체 전등, 스위치 상태' },
  { id: 'ci.door', desc: '문짝문들, 현관문 상태' },
  { id: 'ci.noise', desc: '윗집, 아랫집 층간소음 및 발생 상태' },
  { id: 'ci.lock', desc: '현관문 잠금장치, 키폰 상태' },
  { id: 'ci.bath', desc: '화장실 바닥, 천장, 도기, 수납장, 타일, 냄새, 물 수압, 배수 상태' },
  { id: 'ci.sink', desc: '싱크대 상부장·하부장, 환기창, 냄새, 내부, 물 수압, 배수 상태' },
  { id: 'ci.gasRange', desc: '가스렌지연결, 전기인덕션 설치 및 작동 상태' },
  { id: 'ci.balcony', desc: '발코니 크기, 겨울동파여부, 물 수압 상태' },
  { id: 'ci.boiler', desc: '보일러 작동, 스위치 상태' },
  { id: 'ci.pipe', desc: '수도배관, 보일러배관 교체여부 상태' },
];
// 건물관리 운영
const FIELD_MANAGE_CHECKS: Array<{ id: string; desc: string }> = [
  { id: 'cm.office', desc: '관리사무소여부, 경비실여부, 전화번호 확보 상태, 동대표연락처' },
  { id: 'cm.fee', desc: '계절별 공과금, 관리비 요금수준 상태' },
  { id: 'cm.split', desc: '공과금과 관리비 분리상태' },
  { id: 'cm.arrears', desc: '공과금, 관리비 미납상태' },
  { id: 'cm.parking', desc: '시간대별 주차공간 지정, 시간 추가공간 상태' },
  { id: 'cm.trash', desc: '쓰레기 분리수거장 위치, 상태, 분리수거 날짜여부' },
  { id: 'cm.food', desc: '음식물 쓰레기 수거장 위치, 상태, 수거 날짜 여부' },
  { id: 'cm.resale', desc: '사용후 다시 집을 내놓았을때 팔릴 수 있을 것인가?' },
  { id: 'cm.etc', desc: '기타, 다른 장점, 문제, 특이사항, 최종 결론' },
];
// 안전과 주거환경
const FIELD_SAFETY_CHECKS: Array<{ id: string; desc: string }> = [
  { id: 'cs.jeonseRate', desc: '전세가율이 높은 지역인가?' },
  { id: 'cs.profit', desc: '수익률과 환금성이 있는가?' },
  { id: 'cs.region', desc: '서울, 경기 지역인가?' },
  { id: 'cs.industry', desc: '산업단지인가?' },
  { id: 'cs.station', desc: '역세권인가? 더블역세권?' },
  { id: 'cs.loan', desc: '대출이 많이 나오는 집인가?' },
  { id: 'cs.edu', desc: '집근처 자녀교육 가능시설? (어린이집, 유치원, 학교)' },
  { id: 'cs.mart', desc: '집근처 마트, 시장 쇼핑 가능 시설 있는가?' },
  { id: 'cs.infra', desc: '주변편의시설 병원, 대형마트 등?' },
  { id: 'cs.parking', desc: '주차장은 있는가? 실내인가? 실외인가?' },
  { id: 'cs.parkingArea', desc: '주차가능 면적은 세대수와 비교해 충분한가?' },
  { id: 'cs.hate', desc: '집 근처 혐오시설은 있는가? (쓰레기장, 고물상, 공장, 변전소 등)' },
  { id: 'cs.remote', desc: '외지거나 인적이 드물지 않은가?' },
  { id: 'cs.window', desc: '저층일 경우 방범창?' },
];
// 쾌적과 편의
const FIELD_COMFORT_CHECKS: Array<{ id: string; desc: string }> = [
  { id: 'cf.aging', desc: '건물전체 노후도' },
  { id: 'cf.view2', desc: '내부 위치마다 뷰, 채광 상태, 환기(창문형태) 외풍' },
  { id: 'cf.viewDir', desc: '전망(층/방향)' },
  { id: 'cf.fee', desc: '관리비' },
  { id: 'cf.screen', desc: '방충망, 샤시 여부' },
  { id: 'cf.heating', desc: '난방시설 노후도? 가스? 기름? LPG?' },
  { id: 'cf.leak', desc: '천장이나 벽 누수, 곰팡이, 결로 확인' },
  { id: 'cf.drain', desc: '싱크대, 화장실 배수, 수압' },
  { id: 'cf.laundry', desc: '세탁기 공간, 빨래 널 공간' },
  { id: 'cf.fridge', desc: '냉장고 공간' },
  { id: 'cf.kitchen', desc: '주방형태' },
  { id: 'cf.noise', desc: '층간 벽간소음' },
  { id: 'cf.storage', desc: '다용도실, 창고 공간, 수납공간' },
  { id: 'cf.option', desc: '옵션(살림)' },
  { id: 'cf.roomSize', desc: '가구를 놓을 수 있는 방 크기 (장/침대 등)' },
];
// 입지조사 — 항목마다 사진·링크와 비고를 둔다
// aptOnly — 아실·호갱노노 단지 기준이라 아파트에서만 쓴다
const AREA_SURVEY_ITEMS: Array<{ key: string; title: string; note?: string; aptOnly?: boolean }> = [
  // 제목은 '① 입지조사'가 대신하므로 비워 둔다
  { key: 'areaSurvey', title: '', note: '' },
  { key: 'zoneRank', title: '구역내(동네) 입지등수', note: '아실, 디스코 > 평단가 or 전세가 등수 확인', aptOnly: true },
  { key: 'resident', title: '호갱노노 주민이야기', note: '호재, 입지가치, 개별가치', aptOnly: true },
];
const setExtraNote = (key: string, value: string) => {
  setFieldVal(`fs.${key}.note`, value);
  persistSoon();
};

// === 매매수요 (빌라) — 동단위 수요·공급 지표 ===
// 주소는 시 > 구 > 동 순서로 받고, 시/도는 서울·경기·인천만 다룬다.
// 매매수요는 편집 버튼 없이 바로 고친다 — 적는 즉시 저장한다
const setDmVal = (id: string, value: string) => {
  setFieldVal(id, value);
  persistSoon();
};
/** 총 매물수는 네이버에서 사람이 세어 적는 값이라 받아 오는 시각이 없다.
 *  대신 '적은 시각'을 같이 남겨 말풍선의 갱신 줄에 쓴다. 비우면 시각도 지운다.
 *  (지우는 건 '' 로 해야 한다 — merge 저장이라 delete 로는 서버 값이 안 지워진다) */
const LISTINGS_AT_ID = 'fs.dm.listingsAt';
const setListingsVal = (value: string) => {
  setFieldVal('fs.dm.listings', value);
  setFieldVal(LISTINGS_AT_ID, value.replace(/[^\d.]/g, '') ? updateStamp() : '');
  persistSoon();
};
const dmNum = (id: string) => {
  const n = Number(fieldVal(id).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
// ① 동단위 거래회전율 = 거래량 ÷ 총세대수 × 100
// 조사 대상 동 이름 — 주소에서 '○○동/읍/면/리'를 뽑아 '검암동 거래회전율'처럼 쓴다.
// (아파트 동 번호인 '101동' 같은 건 숫자로 시작하므로 걸러 낸다)
const surveyDongName = computed(() => {
  const address = auction.value?.address || auction.value?.roadAddress || '';
  const hit = address
    .trim()
    .split(/\s+/)
    .find((token) => /^[가-힣]+[0-9]*(동|읍|면|리|가)$/.test(token) && !/^\d/.test(token));
  return hit ?? '';
});
/** 제목에 쓸 지역 이름 — 못 찾으면 예전처럼 '동단위' */
const surveyAreaLabel = computed(() => surveyDongName.value || '동단위');

// 다세대·연립 세대수는 자동으로 가져올 수 있는 무료 경로가 없다(공공데이터 키 발급 필요).
// 그래서 그 동의 주택 종류별 통계를 바로 띄워 주고, 숫자는 눈으로 보고 넣게 돕는다.
const openHouseholdLookup = () => {
  const dong = surveyDongName.value;
  if (!dong) {
    flashToast('주소에서 동 이름을 찾지 못했습니다.', 'error');
    return;
  }
  void copyText(dong);
  const query = encodeURIComponent(`${dong} 주택의 종류별 주택`);
  window.open(`https://kosis.kr/search/search.do?query=${query}`, '_blank');
};

/** 국토부 실거래가 공개시스템 — 거래량을 눈으로 확인하거나 더 캐 볼 때 */
const openMolitRtSite = () => {
  void copyText(surveyDongName.value || jibunAddress.value);
  window.open('https://rt.molit.go.kr/', '_blank');
};

/** 국토부 공동주택가격 열람 — 유사물건은 자동조회가 안 되니 직접 찾아 적어야 한다.
 *  주소를 복사해 두면 그 창에 붙여 넣기만 하면 된다. */
const openOfficialPriceSite = () => {
  void copyText(jibunAddress.value);
  window.open('https://www.realtyprice.kr/notice/town/nfSiteLink.htm', '_blank');
};

// 총 매물수도 자동으로 받을 길이 없다 — 네이버 부동산에서 그 동을 띄워 주고 눈으로 세어 넣게 돕는다
const openListingLookup = () => {
  const dong = surveyDongName.value;
  if (!dong) {
    flashToast('주소에서 동 이름을 찾지 못했습니다.', 'error');
    return;
  }
  // 네이버 부동산의 동 검색 주소는 지역에 따라 '없는 동'으로 떨어진다.
  // 그래서 첫 화면만 띄우고, 검색어는 클립보드에 넣어 바로 붙여넣게 한다.
  const area = (auction.value?.address ?? '').trim().split(/\s+/).slice(0, 2).join(' ');
  const query = [area, dong].filter(Boolean).join(' ').trim() || dong;
  void copyText(query);
  window.open('https://m.land.naver.com/', '_blank');
};

// 12개월 거래량 기본값 — 그 동의 다세대·연립 실거래 1년치 건수.
// 회전율 분모가 '동 전체 다세대·연립 세대수'라 면적 조건은 걸지 않는다.
const deal12mAuto = ref(0);
// 같은 조회에서 빠진 건수 — 툴팁에 적어 가격정보 탭과 대조할 수 있게 한다
const deal12mDirect = ref(0);
const deal12mCancelled = ref(0);
// 이 숫자를 언제 받아 온 것인지 — 말풍선 '갱신' 줄에 적는다 (UPDATE 표기와 같은 모양)
const deal12mUpdatedAt = ref('');
// 그 동의 다세대·연립 세대수 — 건축물대장에서 합산한다 (직접 입력이 있으면 그 값이 우선)
const unitsAuto = ref(0);
const unitsUpdatedAt = ref('');
/** 공동주택 공시가격 — 브이월드에서 그 호실의 최신 기준연도 값을 받아 온다.
 *  PDF 파싱값은 단위가 깨져 들어오는 일이 있어(1,228 처럼) 이쪽을 우선한다. */
const officialPriceAuto = ref(0);
const officialPriceYear = ref('');
/** 어느 호실 값인지 — 말풍선에 같이 적어 눈으로 검산할 수 있게 */
const officialPriceUnit = ref('');
const fetchOfficialPrice = async () => {
  const target = auction.value;
  if (!target?.address) return;
  try {
    const region = await resolveRegionFromAddress(target.address);
    if (!region?.bCode10) return;
    // '인천광역시 서구 검암동 670-4' 에서 지번만, 주소 끝의 '203호' 에서 호수만
    const lot = lotOnlyAddress.value.split(/\s+/).pop() ?? '';
    const ho = (target.address.match(/(\d+)\s*호/) ?? [])[1] ?? '';
    const hit = await fetchApartHousingPrice({
      bCode10: region.bCode10,
      lotText: lot,
      ho,
      areaM2: subjectAreaM2.value,
    });
    if (!hit) return;
    officialPriceAuto.value = hit.price;
    officialPriceYear.value = hit.year;
    officialPriceUnit.value = [hit.ho ? `${hit.ho}호` : '', hit.areaM2 > 0 ? `전용 ${hit.areaM2}㎡` : '']
      .filter(Boolean).join(' ');
  } catch {
    officialPriceAuto.value = 0;
  }
};
/** ⓘ 말풍선에 적을 내용 — 지표결과(dmTipData)와 같은 '라벨 + 사실' 꼴로 한곳에 모은다.
 *  여기 없는 키는 예전처럼 한 줄 글로 나간다. */
const noteTipRows = computed<Record<string, Array<[string, string]>>>(() => ({
  jeonseRate: [
    ['공식', `공동주택가 × ${mktJeonseRate.value}%`],
    ['의미', '허그 보증 126% 전세가 추정치'],
    ['수정', '편집해서 퍼센트 비율을 고칠 수 있음'],
  ],
  pubRatio: [
    ['공식', '실거래가 ÷ 공동주택가 × 100'],
    ['의미', '공시가격 대비 실거래가 수준'],
  ],
  pubPrice: officialPriceRows.value,
  loc: [
    ['조사', '지역 내 호재 · 공급 · 입지조건 (호갱, 네부)'],
    ['확인', '전세가 · 평당가로 등수 확인'],
  ],
  probe: [
    ['O', '확인'],
    ['X', '미확인'],
  ],
  jeonseRatio: [
    ['공식', '전세가 ÷ 매매가 × 100'],
    ['의미', '매매가에서 전세보증금이 차지하는 몫'],
    ['높으면', '적은 돈으로 사지만 역전세·깡통 위험이 커진다'],
    ['자료', '위 두 줄의 실제 거래값을 그대로 나눈다'],
  ],
  dong: [
    ['출처', 'PDF 주소'],
    ['주소', jibunAddress.value || '-'],
    ['쓰임', '거래량 조회 · 세대수/매물수 바로가기'],
  ],
  recv: [
    ['참조', '가격정보 → 경매지번 실거래가'],
    ['자료', `단지전체 (국토부) 최근 ${PLACE_HISTORY_YEARS}년`],
    ['들어옴', '거래일자 · 층 · 매매/전세 실거래가 — 비행기 선택, 없으면 가장 최근 거래'],
    ['전용면적', 'PDF 기본정보'],
    ['계산', '평단가 = 매매 실거래가 ÷ 전용면적(평)'],
  ],
  rank: [
    ['등수', '입지조건에 따라 등수화한다'],
    ['기준', '입지조건에 가까운 거리 — 5분(400m) 1등 · 10분(800m) 2등 · 그 밖 3등'],
    ['입력방법', '기본은 자동 입력 · 손으로 적으면 그 값이 파란 글씨로 선다'],
    ['교통', '지하철 우선 · 버스정류장'],
    // 조건을 한 줄씩 늘어놓으니 어디까지가 한 묶음인지 보이지 않았다.
    // '\n' 으로 줄을 나누면 말풍선이 값 칸 안에서 들여쓴 채 쌓아 준다
    ['입지조건', [
      '인프라 (대형마트, 대형병원, 상권)',
      '공원 (공원)',
      '학교 (초등학교, 어린이집)',
      '학원가 (학원)',
    ].join('\n')],
    ['룸수', '직접 고른다 — 세대구성·입지조건이 따라 바뀐다'],
    ['평균', '조건별 등수를 평균 내어 최종 등수'],
    ['수요', '세대구성 → 입지조건 → 수요자'],
  ],
}));
const noteRows = (key: string) => noteTipRows.value[key] ?? null;
/** 자동으로 채워도 되는 공동주택가 — 유사물건은 다른 집이라 이 물건의 공시가를 쓰면 안 된다.
 *  브이월드는 이 물건의 지번·호수로만 조회하므로 유사물건 값은 직접 찾아 적어야 한다. */
const officialPriceUsable = computed(() => (
  mktMode('d') === MKT_MODES[1] ? 0 : officialPriceAuto.value
));
/** 공동주택가 ⓘ — 어디서 온 값인지, 언제 기준인지 */
const officialPriceRows = computed<Array<[string, string]>>(() => {
  if (mktVal(mk('d', 'pub'))) return [['입력', '직접 입력 · 자동값보다 우선']];
  if (mktMode('d') === MKT_MODES[1]) {
    return [
      ['대상', '유사물건 — 다른 집이라 자동조회가 안 된다'],
      ['찾기!', '부동산공시가격알리미에서 그 집 공시가 확인'],
    ];
  }
  if (officialPriceAuto.value <= 0) return [['조회', '결과 없음 · 직접 입력']];
  const rows: Array<[string, string]> = [
    ['출처', '국토교통부 공시가격 API · 실시간'],
    ['기준', `${officialPriceYear.value}-01-01 · 연 1회 공시`],
  ];
  if (officialPriceUnit.value) rows.push(['대상', officialPriceUnit.value]);
  rows.push(['인증', `브이월드 개발키 · ${VWORLD_KEY_EXPIRES} 만료`]);
  return rows;
});
/** 화면에 쓸 공동주택가 — 손으로 적은 값이 있으면 그 값, 없으면 받아 온 값 */
const mktPubValue = computed(() => parseDigits(mktVal(mk('d', 'pub'))) || officialPriceUsable.value);
const mktPubText = computed(() => (mktPubValue.value > 0 ? mktPubValue.value.toLocaleString('ko-KR') : '-'));
const fetchDongUnits = async () => {
  const address = auction.value?.address;
  if (!address) return;
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10) return;
    const entry = await cachedEntry(
      'cacheDongUnits',
      cacheKey(region.bCode10),
      CACHE_TTL.units,
      () => fetchDongHouseholds(region.bCode10),
      (n) => n > 0,
    );
    unitsAuto.value = entry.value;
    unitsUpdatedAt.value = updateStamp(entry.savedAt);
  } catch {
    unitsAuto.value = 0;
    unitsUpdatedAt.value = '';
  }
};
// 기준수치 칸의 도움말 — 갖다 대면 까만 말풍선으로 띄운다.
// 브라우저 기본 툴팁(흰 네모)은 모양을 못 고쳐서 쓰지 않는다.
type DmTipKey = '' | 'deal' | 'units' | 'listings' | 'monthly'
  | 'turn' | 'burden' | 'clear' | 'absorb'
  | 'total' | 'gTurn' | 'gBurden' | 'gClear' | 'gAbsorb';
const dmTip = ref<DmTipKey>('');
/** 제목 옆 파란 안내글 → ⓘ 말풍선. PC는 오버, 폰은 눌러서 본다 */
const noteTip = ref('');
const noteEnter = (key: string, evt: Event) => {
  if (!hasHover) return;
  placeNote(evt);
  noteTip.value = key;
};
const noteLeave = () => { if (hasHover) noteTip.value = ''; };
// 말풍선은 한 번에 하나만 띄운다 — 폰은 마우스를 떼는 동작이 없어
// 다른 것을 누르면 앞의 것이 저절로 닫혀야 한다
watch(dmTip, (v) => { if (v) noteTip.value = ''; });
watch(noteTip, (v) => { if (v) dmTip.value = ''; });
// 말풍선은 화면에 붙어 뜨기 때문에, 화면을 움직이면 엉뚱한 자리를 가린다 — 그때는 닫는다
const closeTips = () => {
  dmTip.value = ''; noteTip.value = ''; addrTip.value = '';
  mktLitKey.value = ''; dmLitKey.value = '';
};
onMounted(() => window.addEventListener('scroll', closeTips, true));

// 상단 고정줄(탭·주소) 아래에 또 붙일 것이 있다 — 예상수익분석의 제목·날짜 줄.
// 그 높이는 주소가 한 줄이냐 두 줄이냐로 달라지므로 재서 CSS 로 흘려보낸다.
const stickyHead = ref<HTMLElement | null>(null);
let headObserver: ResizeObserver | null = null;
onMounted(() => {
  const el = stickyHead.value;
  if (!el) return;
  const apply = () => {
    const h = Math.round(el.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--adp-head-h', `${h}px`);
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') {
    headObserver = new ResizeObserver(apply);
    headObserver.observe(el);
  }
});
onBeforeUnmount(() => {
  headObserver?.disconnect();
  headObserver = null;
  document.documentElement.style.removeProperty('--adp-head-h');
});
onBeforeUnmount(() => window.removeEventListener('scroll', closeTips, true));
/** 말풍선 세로 위치 — 화면 기준(fixed)으로 띄워 가장자리에서 잘리지 않게 한다 */
const noteTop = ref(0);
const placeNote = (evt: Event) => {
  const el = evt.currentTarget as HTMLElement | null;
  if (!el) return;
  noteTop.value = Math.round(el.getBoundingClientRect().bottom + 6);
};
const toggleNote = (key: string, evt: Event) => {
  if (noteTip.value === key) { noteTip.value = ''; return; }
  placeNote(evt);
  noteTip.value = key;
};
/** 마우스가 있는 환경인가 — 폰에서는 오버가 없어 눌러야만 뜬다.
 *  오버 쪽을 켜 두면 손가락이 닿자마자 떴다 사라져 읽을 틈이 없다. */
const hasHover = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const tipEnter = (key: DmTipKey) => { if (hasHover) dmTip.value = key; };
const tipLeave = () => { if (hasHover) dmTip.value = ''; };
const DM_ROW1: DmTipKey[] = ['deal', 'units', 'listings', 'monthly'];
// ③ 블록을 ②로 합치면서 'total' 말풍선도 ② 줄에서 띄운다
const DM_ROW3: DmTipKey[] = ['gTurn', 'gBurden', 'gClear', 'gAbsorb'];
/** 칸마다 띄울 설명 — 꼬리 위치(arrow)는 그 칸이 선 자리에 맞춘다 */
/** 말풍선 라벨 끝의 '!' 는 '사용자가 직접 해야 하는 일' 표시 — 초록으로 보여 준다 */
const tipAct = (label: string) => label.endsWith('!');
const tipLabel = (label: string) => label.replace(/!$/, '');
const dmTipData = computed<Record<string, { arrow: string; rows: Array<[string, string]> }>>(() => ({
  deal: { arrow: '12%', rows: [
    ['출처', '국토부 실거래가 API · 자동 입력'],
    ['갱신', `24시간 후 업데이트${deal12mUpdatedAt.value ? ` (${deal12mUpdatedAt.value})` : ''}`],
    ['범위', `${surveyAreaLabel.value} · ${publicTradeTypeLabel.value} · 최근 12개월`],
    ['제외', `직거래 ${deal12mDirect.value}건 · 계약해제 ${deal12mCancelled.value}건 · 합계 ${deal12mDirect.value + deal12mCancelled.value}건`],
    ['표시', '1년 거래량 | 월평균 거래량'],
    ['수정', '직접 입력하면 그 값이 우선 · 비우면 자동값'],
  ] },
  units: { arrow: '37%', rows: [
    ['출처', '건축HUB(건축물대장) · 자동 입력'],
    ['갱신', `30일 후 업데이트${unitsUpdatedAt.value ? ` (${unitsUpdatedAt.value})` : ''}`],
    ['범위', `${surveyAreaLabel.value} 연립·다세대`],
    ['합산', '건물마다의 세대수를 모두 더한 값'],
    ['수정', '직접 입력하면 그 값이 우선'],
    ['이동!', 'KOSIS(주택의 종류별 주택 읍면동)'],
  ] },
  listings: { arrow: '62%', rows: [
    ['입력', '직접 입력'],
    ...(fieldVal(LISTINGS_AT_ID) ? [['갱신', `입력함 (${fieldVal(LISTINGS_AT_ID)})`] as [string, string]] : []),
    ['이동!', '네이버 부동산'],
    ['찾기!', `${surveyAreaLabel.value} 매물 수`],
  ] },
  monthly: { arrow: '87%', rows: [
    ['공식', '12개월 거래량 ÷ 12'],
    ['의미', '1년 거래량을 나눈 한 달 평균 거래 건수'],
  ] },
  turn: { arrow: '12%', rows: [
    ['공식', '12개월 거래량 ÷ 총 세대수 × 100'],
    ['의미', '연립·다세대 중 1년에 몇 %가 손바뀜되나'],
    ['기준', 'A 3%↑ · B 1.5~3% · C 1.5%↓'],
    ['적정', '3% 이상 ↑ (높을수록 좋다)'],
  ] },
  burden: { arrow: '37%', rows: [
    ['공식', '총 매물수 ÷ 총 세대수 × 100'],
    ['의미', '연립·다세대 중 몇 %가 매물로 나와 있나'],
    ['기준', 'A 3%↓ · B 3~5% · C 5%↑'],
    ['적정', '3% 이하 ↓ (낮을수록 좋다)'],
  ] },
  clear: { arrow: '62%', rows: [
    ['공식', '총 매물수 ÷ 연평균 거래량 (×12 = 달 수)'],
    ['의미', '총 누적 매물이 다 팔리는 데 걸리는 달 수'],
    ['기준', 'A 6M↓ · B 6~12M · C 12M↑'],
    ['적정', '6M 이하 ↓ (짧을수록 좋다)'],
  ] },
  total: { arrow: '72%', rows: [
    ['대상', '거래 회전율 · 매물 소화율 · 매물 부담률 · 매물 소진기간'],
    ['공식', '네 등급을 A 3 · B 2 · C 1로 바꿔 평균을 낸다'],
    ['기준', '평균 2.5↑ A · 1.5↑ B · 그 아래 C'],
    ['조건', '네 등급 중 셋 이상 매겨져야 종합등급이 나온다'],
  ] },
  gTurn: { arrow: '12%', rows: [
    ['기준', 'A 5%↑ · B 3~5% · C 1.5~3% · D 1.5%↓'],
    ['해석', '1%↓ 매우 적음 · 1~2% 낮음 · 2~3% 보통'],
    ['', '3~5% 비교적 활발 · 5%↑ 상당히 활발'],
  ] },
  gBurden: { arrow: '37%', rows: [
    ['기준', 'A 3%↓ · B 3~5% · C 5~10% · D 10%↑'],
    ['의미', '매물이 적을수록 경쟁이 덜하다'],
  ] },
  gClear: { arrow: '62%', rows: [
    ['기준', 'A 6개월↓ · B 6~12개월 · C 12개월↑'],
    ['의미', '짧을수록 빨리 팔린다'],
  ] },
  gAbsorb: { arrow: '87%', rows: [
    ['기준', 'A 180%↑ · B 120~180% · C 120%↓'],
    ['의미', '12개월 거래량 ÷ 총 매물수'],
  ] },
  absorb: { arrow: '87%', rows: [
    ['공식', '12개월 거래량 ÷ 총 매물수 × 100'],
    ['의미', '나와 있는 매물 중 한 해에 몇 %가 팔리나'],
    ['기준', 'A 180%↑ · B 120~180% · C 120%↓'],
    ['적정', '180% 이상 ↑ (높을수록 좋다)'],
  ] },
}));
/** 12개월 거래량 — 국토부 실거래에서 센 값이 기본이고, 손으로 적으면 그 값이 우선.
 *  (총 세대수와 같은 방식. 비워 두면 다시 자동값으로 돌아간다) */
const deal12mValue = computed(() => dmNum('fs.dm.deal12m') || deal12mAuto.value);
const dmUnits = computed(() => dmNum('fs.dm.units') || unitsAuto.value); // 직접 입력 우선, 없으면 건축물대장
const dmListings = computed(() => dmNum('fs.dm.listings'));  // 총 매물수 (네이버, 직접 입력)
const dmMonthly = computed(() => deal12mValue.value / 12);   // 월평균 거래량
// 연간 회전율 = 12개월 거래량 ÷ 총세대수 × 100
const dmTurnover = computed(() => (dmUnits.value > 0 ? (deal12mValue.value / dmUnits.value) * 100 : 0));
// 매물 부담률 = 총매물수 ÷ 총세대수 × 100 (내놓은 물건이 동네에서 차지하는 비중)
const dmBurden = computed(() => (dmUnits.value > 0 ? (dmListings.value / dmUnits.value) * 100 : 0));
// 매물 소진기간 = 총매물수 ÷ 거래량 (지금 매물이 다 팔리는 데 걸리는 시간).
// 월평균으로 나눠 '달 수'로 셈한다 — 연평균으로 나눈 '해 수'에 12를 곱한 것과 같은 값이다.
// 화면에는 둘 다 적는다 ('111M / 9Y 3M').
const dmClearMonths = computed(() => (dmMonthly.value > 0 ? dmListings.value / dmMonthly.value : 0));
// 연간 매물 소화율 = 12개월 거래량 ÷ 총 매물수 × 100
// (엑셀은 월 기준이었다. 한 해에 매물이 몇 번 소화되는지가 더 읽기 쉬워 연간으로 바꿨다)
const dmAbsorb = computed(() => (dmListings.value > 0 ? (deal12mValue.value / dmListings.value) * 100 : 0));

/** 등급 A~D. 값이 없으면 '-' */
const levelTone = (level: string) => (
  { A: 'good', B: 'ok2', C: 'ok' }[level] ?? 'none'
);
/** 엑셀 수식 그대로 — A·B·C 셋뿐이고, 기준 수치가 비면 빈칸('-') */
const gradeOf = (ready: boolean, value: number, a: number, b: number, higherIsBetter: boolean) => {
  if (!ready) return '-';
  if (higherIsBetter) return value >= a ? 'A' : value >= b ? 'B' : 'C';
  return value <= a ? 'A' : value <= b ? 'B' : 'C';
};
// I4 =IF(B4=0,"",IF(F4>=3%,"A",IF(F4>=1.5%,"B","C")))
const dmTurnGrade = computed(() => gradeOf(dmUnits.value > 0, dmTurnover.value, 3, 1.5, true));
// J4 =IF(B4=0,"",IF(G4<=3%,"A",IF(G4<=5%,"B","C")))
const dmBurdenGrade = computed(() => gradeOf(dmUnits.value > 0 && dmListings.value > 0, dmBurden.value, 3, 5, false));
// K4 =IF(B4=0,"",IF(H4<=6,"A",IF(H4<=12,"B","C")))
const dmClearGrade = computed(() => gradeOf(dmUnits.value > 0 && dmListings.value > 0, dmClearMonths.value, 6, 12, false));
// 월 기준 15%/10% 을 연 기준으로 환산 — 180%/120%
const dmAbsorbGrade = computed(() => gradeOf(dmListings.value > 0, dmAbsorb.value, 180, 120, true));

/** 종합등급 (엑셀 L4) — 네 등급에 A 3 · B 2 · C 1 점을 주고 평균.
 *  2.5 이상이면 A, 1.5 이상이면 B, 그 아래는 C. 등급이 셋 미만이면 빈칸. */
const DM_LEVEL_SCORE: Record<string, number> = { A: 3, B: 2, C: 1 };
/** 보기용 적합 표시 — A·B는 적합, C·D는 부적합 */
const dmFitText = (grade: string) => (grade === '-' ? '' : (grade === 'A' || grade === 'B' ? '적합' : '부적합'));
const dmCoreGrades = computed(() => [
  dmTurnGrade.value, dmBurdenGrade.value, dmClearGrade.value, dmAbsorbGrade.value,
]);
const dmTotalReady = computed(
  () => dmCoreGrades.value.filter((g) => g !== '-').length >= 3,
);
/** 매긴 등급들의 평균 점수 */
const dmTotalScore = computed(() => {
  const scored = dmCoreGrades.value.filter((g) => g !== '-').map((g) => DM_LEVEL_SCORE[g] ?? 0);
  if (scored.length === 0) return 0;
  return scored.reduce((a, b) => a + b, 0) / scored.length;
});
const dmTotalGrade = computed(() => {
  if (!dmTotalReady.value) return '-';
  const n = dmTotalScore.value;
  return n >= 2.5 ? 'A' : n >= 1.5 ? 'B' : 'C';
});
/** 소진기간 표시 — 12개월을 넘으면 해로 환산한다. 연은 Y, 달은 M (대문자) */
const dmClearParts = computed<Array<[string, string]>>(() => {
  const months = dmClearMonths.value;
  if (!(months > 0)) return [['-', '']];
  if (months < 12) return [[dmRateText(months), 'M']];
  let years = Math.floor(months / 12);
  let rest = Math.round(months - years * 12);
  if (rest === 12) { years += 1; rest = 0; }   // 11.7달이 반올림으로 12가 되는 경우
  // 개월 수 / 연·개월 — 총량과 체감 기간을 함께 보여 준다
  const head: Array<[string, string]> = [[String(Math.round(months)), 'M'], ['/', '']];
  return rest > 0
    ? [...head, [String(years), 'Y'], [String(rest), 'M']]
    : [...head, [String(years), 'Y']];
});
/** 숫자를 천 단위로, 없으면 '-' */
const dmIntText = (value: number) => (value > 0 ? Math.round(value).toLocaleString('ko-KR') : '-');
const dmRateText = (value: number) => (value > 0 ? value.toFixed(2) : '-');

// 본건사진 비고 — 입력하면 바로 저장한다
const setPhotoNote = (value: string) => {
  setFieldVal('fs.photoNote', value);
  persistSoon();
};
const isChecklistOn = (id: string) => fieldVal(id) === 'Y';
const toggleChecklist = async (id: string) => {
  setFieldVal(id, isChecklistOn(id) ? '' : 'Y');
  await persistSurvey();
};

const fieldVal = (id: string) => surveyForm.value.fieldValues?.[id] ?? '';
const setFieldVal = (id: string, value: string) => {
  const sf = surveyForm.value;
  if (!sf.fieldValues) sf.fieldValues = {};
  sf.fieldValues[id] = value;
};
// 현장조사는 편집 버튼 없이 바로 고친다 — 적는 즉시 저장한다
const setFieldValNow = (id: string, value: string) => {
  setFieldVal(id, value);
  persistSoon();
};

// === 현황조사서 멀티셀렉트 ===
/** 입찰자 현황조사 — 예전 '점유관계' 목록을 여기 합쳤다.
 *  둘 다 '누가 살고 있나'를 적는 자리라 칸을 둘로 둘 까닭이 없었다.
 *  겹치던 '점유자관계미상'은 '점유자미상' 하나만 남긴다. */
const SURVEY_REPORT_OPTIONS = [
  '폐문부재', '공실', '점유자미상',
  '임차인점유추정', '가장임차인점유', '진성임차인점유', '불법점유',
  '깔세 세입자', '전출',
];
const surveyReportOpen = ref(false);
const surveyReportCustom = ref('');
const toggleSurveyReportOption = (opt: string) => {
  const arr = surveyForm.value.surveyReport;
  const idx = arr.indexOf(opt);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(opt);
};
const addSurveyReportCustom = () => {
  const v = surveyReportCustom.value.trim();
  if (!v) return;
  if (!surveyForm.value.surveyReport.includes(v)) {
    surveyForm.value.surveyReport.push(v);
  }
  surveyReportCustom.value = '';
};
const removeSurveyReportChip = (opt: string) => {
  const arr = surveyForm.value.surveyReport;
  const idx = arr.indexOf(opt);
  if (idx >= 0) arr.splice(idx, 1);
};

const parseDigits = (v: string) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// === 거래율 카드 자동 계산 ===
const dealMonthlyComputed = computed(() => {
  const yearly = parseDigits(surveyForm.value.yearlyDeals);
  if (yearly <= 0) return '-';
  return (yearly / 12).toFixed(2);
});
const dealRateComputed = computed(() => {
  const yearly = parseDigits(surveyForm.value.yearlyDeals);
  const total = parseDigits(surveyForm.value.totalUnits);
  if (yearly <= 0 || total <= 0) return '-';
  return `${((yearly / total) * 100).toFixed(0)}%`;
});
// 거래율 기준선 — 서울 7%, 지방 4%. 기준을 넘으면 적정 거래율로 본다.
const DEAL_REGION_THRESHOLDS: Record<string, number> = { 서울: 7, 지방: 4 };
const setDealRegion = async (region: string) => {
  surveyForm.value.dealRegion = surveyForm.value.dealRegion === region ? '' : region;
  await persistSurvey();
};
// 선택한 지역 기준(서울 7% / 지방 4%) 이상이면 적합
const dealRateOk = computed(() => {
  const th = DEAL_REGION_THRESHOLDS[surveyForm.value.dealRegion ?? ''];
  if (!th) return null;
  const yearly = parseDigits(surveyForm.value.yearlyDeals);
  const total = parseDigits(surveyForm.value.totalUnits);
  if (yearly <= 0 || total <= 0) return null;
  return (yearly / total) * 100 >= th;
});
const dealRateJudge = computed(() => {
  if (dealRateOk.value === null) return '';
  return dealRateOk.value ? '적합' : '부적합';
});

// === 매물적체 카드 자동 계산 ===
const listingTargetComputed = computed(() => {
  const units = parseDigits(surveyForm.value.listingUnits);
  if (units <= 0) return '-';
  return Math.round(units * 0.05).toLocaleString('ko-KR');
});
const listingBacklogComputed = computed(() => {
  const count = parseDigits(surveyForm.value.listingCount);
  const units = parseDigits(surveyForm.value.listingUnits);
  if (count <= 0 || units <= 0) return '-';
  return `${((count / units) * 100).toFixed(0)}%`;
});

// === 입지조사 4개 항목 — 물건정보 탭의 입지 데이터에서 500m 이내 자동 집계 ===
const NEARBY_RADIUS_M = 500;
const parseDistanceMeters = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const m = raw.match(/([\d.]+)\s*(km|m)/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return m[2].toLowerCase() === 'km' ? v * 1000 : v;
};
// "이름(123m), 다른이름(1.2km)" 형식의 문자열에서 거리가 NEARBY_RADIUS_M 이하인 항목만 추출
const filterDistancedString = (str: string | undefined): string[] => {
  if (!str) return [];
  return str
    .replace(/^[가-힣]+\s*:\s*/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => {
      const d = parseDistanceMeters(s);
      return d !== null && d <= NEARBY_RADIUS_M;
    });
};

// === 입지조사 카드 — 500m 이내 데이터 (구조화된 리스트, 물건정보 탭 포맷 그대로 출력) ===
const eduInfoFiltered500m = computed(() => ({
  elementary: filterDistancedString(auction.value?.marketDemand?.schoolInfoA),
  middle: filterDistancedString(auction.value?.marketDemand?.schoolInfoB),
  high: filterDistancedString(auction.value?.marketDemand?.schoolInfoC),
}));
// "수도권 인천2호선 검바위 (58m), 수도권 공항철도 검암 (946m)" → [{name, distance}]
const parseStationList = (raw: string | undefined): Array<{ name: string; distance: string }> => {
  if (!raw) return [];
  return raw
    .replace(/^[가-힣]+\s*:\s*/, '')
    .split(',')
    .map((chunk) => chunk.trim().match(/^(.*?)\s*\(\s*([\d.]+\s*(?:km|m))\s*\)$/i))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ name: m[1].trim(), distance: m[2].replace(/\s+/g, '') }));
};

const withinRadius = (items: Array<{ name: string; distance: string }>) =>
  items.filter((it) => {
    const d = parseDistanceMeters(it.distance);
    return d !== null && d <= NEARBY_RADIUS_M;
  });

const stationItems500m = computed<Array<{ name: string; distance: string }>>(() => {
  // 최신 PDF에는 카테고리별 주변환경 표(pdfNearbyEnv)가 없고 '도시철도' 한 줄만 있다.
  // 물건정보 탭의 인근역세권이 쓰는 nearbyStation 문자열을 같은 소스로 사용한다.
  const fromTable = auction.value?.pdfNearbyEnv?.subway?.items ?? [];
  const items = fromTable.length > 0 ? fromTable : parseStationList(auction.value?.nearbyStation);
  // 버스정류장은 정류장 명칭이 인근 학교·단지명이라 "역세권" 카드와 어울리지 않아 지하철만 본다.
  return withinRadius(items);
});

// 주변환경 500m — PDF 카테고리 표가 있으면 그것, 없으면 카카오 지도 검색 결과로 채운다
const pdfNearbyFiltered500m = computed(() => {
  const env = auction.value?.pdfNearbyEnv;
  const fromPdf = env
    ? PDF_NEARBY_LABELS
        .filter((g) => env[g.key])
        .map((g) => {
          const items = withinRadius(env[g.key]!.items ?? []);
          return { label: g.label, total: items.length, items };
        })
        .filter((g) => g.items.length > 0)
    : [];
  if (fromPdf.length > 0) return fromPdf;

  return nearbyDisplay.value
    .map((g) => {
      const items = withinRadius(g.items);
      return { label: g.label, total: items.length, items };
    })
    .filter((g) => g.items.length > 0);
});

// === 시세조사 및 급매가 조사 표 ===
const AGENCY_ROW_MIN = 1;
// 금액 칸 — 값이 없으면 '-'
const mktNumText = (raw: string | undefined) => {
  const n = parseDigits(raw ?? '');
  return n > 0 ? Math.round(n).toLocaleString('ko-KR') : '-';
};
// === 시세조사 및 급매가 조사 — 항목값은 id별로 저장한다 ===
const mktVal = (id: string) => surveyForm.value.mktValues?.[id] ?? '';
const setMktVal = (id: string, value: string | number) => {
  const sf = surveyForm.value;
  if (!sf.mktValues) sf.mktValues = {};
  sf.mktValues[id] = String(value ?? '');
};
// 조회 조건 저장은 mktVal·setMktVal 아래에 둬야 한다 — watch 가 등록되는 순간
// 값을 한 번 읽는데, 위에 두면 그 둘이 아직 만들어지기 전이라 화면이 통째로 죽는다.
/** 조건분석에서 맞춰 놓은 조회 조건을 이 물건에 적어 둔다.
 *  조건분석은 값을 고쳐 가며 최종값을 만드는 곳이고, 그 최종값이 손품+현장 ③ 으로
 *  그대로 간다. 조건이 기본값으로 돌아가 버리면 ③ 의 숫자도 같이 달라진다. */
const PUB_FILTER_KEY = 'pub.filter';
interface PubFilter {
  months: number; start: string; end: string;
  minA: string; maxA: string; minY: string; maxY: string;
}
const savedPubFilter = computed<PubFilter | null>(() => {
  const raw = mktVal(PUB_FILTER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as PubFilter; } catch { return null; }
});
const applyPubFilter = (f: PubFilter) => {
  pubMonthPreset.value = Number(f.months) || 0;
  publicStartDate.value = f.start ?? '';
  publicEndDate.value = f.end ?? '';
  publicMinArea.value = f.minA ?? '';
  publicMaxArea.value = f.maxA ?? '';
  publicMinBuildYear.value = f.minY ?? '';
  publicMaxBuildYear.value = f.maxY ?? '';
};
const savePublicFilters = async () => {
  setMktVal(PUB_FILTER_KEY, JSON.stringify({
    months: pubMonthPreset.value,
    start: publicStartDate.value,
    end: publicEndDate.value,
    minA: publicMinArea.value,
    maxA: publicMaxArea.value,
    minY: publicMinBuildYear.value,
    maxY: publicMaxBuildYear.value,
  }));
  await persistSurvey();
  flashToast('조회 조건을 저장했습니다.', 'success');
};
/** 자료가 들어온 뒤 한 번만 — 저장해 둔 조건이 있으면 그 조건으로 세운다.
 *  물건을 열 때 조사자료와 실거래가 들어오는 차례가 때마다 달라, 한쪽만 보고 있으면 놓친다. */
const pubFilterApplied = ref(false);
watch(
  [savedPubFilter, () => publicRealTradeRows.value.length, () => auction.value?.id],
  ([filter, rowCount], [, , prevId]) => {
    if (auction.value?.id !== prevId) pubFilterApplied.value = false;
    if (pubFilterApplied.value || !filter || !rowCount) return;
    applyPubFilter(filter);
    pubFilterApplied.value = true;
  },
);
// 매매·직거래면 연식을 가리지 않고 모두 보내기 버튼을 둔다 — 오래된 거래도 손으로 골라 쓰는 일이 있다
const canSendTrade = (row: PlaceRow) =>
  (row.kind === '매매' || row.kind === '직거래') && parsePriceNumber(row.amount) > 0;
// 고른 거래 한 줄을 손품+현장 1.실거래가 조사에 통째로 옮긴다.
// ③ 실거래가 칸(전용면적·거래일자·실거래가)과 ② 평단가 칸(전용면적·평단가)을 함께 채운다.
// '전용면적 X 평단가'는 두 값에서 자동 계산되는 칸이라 따로 쓰지 않는다.
/** 전세는 보증금만 있는 줄만 보낸다 — 월세는 보증금·월세가 섞여 한 값으로 못 쓴다 */
const canSendJeonse = (row: PlaceRow) => row.kind === '전세' && (row.deposit ?? 0) > 0;
/** 고른 전세 한 줄을 ② 경매물건 실거래가의 전세 줄로 옮긴다 */
const sendJeonseToMarket = async (row: PlaceRow) => {
  const price = row.deposit ?? 0;
  if (!(price > 0)) return;
  setMktVal(mk('d', 'jReal'), String(Math.round(price)));
  if (row.contractDate) setMktVal(mk('d', 'jYear'), row.contractDate.slice(0, 10).replace(/\./g, '-'));
  if (String(row.floor ?? '').trim()) setMktVal(mk('d', 'jFloor'), String(row.floor).trim());
  await persistSurvey();
  flashToast('손품+현장 경매지번 전세 실거래가에 적용하였습니다.', 'success');
};
const sendTradePriceToMarket = async (row: PlaceRow) => {
  const price = parsePriceNumber(row.amount);
  if (!Number.isFinite(price) || price <= 0) return;
  setMktVal(mk('d', 'real'), String(Math.round(price)));
  if (row.contractDate) setMktVal(mk('d', 'year'), row.contractDate.slice(0, 10).replace(/\./g, '-'));
  if (String(row.floor ?? '').trim()) setMktVal(mk('d', 'floor'), String(row.floor).trim());
  // 전용면적은 건드리지 않는다 — 그 칸은 PDF 기본정보(이 호실의 면적)가 쓰는 자리다.
  // 평단가는 이 호실 면적으로 나눠야 '이 집 기준 평단가'가 된다.
  const areaM2 = Number(mktVal(mk('d', 'area'))) || Number(row.areaM2) || 0;
  if (areaM2 > 0) {
    const pyeong = Number((areaM2 / PYEONG_TO_M2).toFixed(2));
    if (pyeong > 0) setMktVal(mk('b', 'unit'), String(Math.round(price / pyeong)));
  }
  await persistSurvey();
  flashToast('손품+현장 경매지번 실거래가에 적용하였습니다.', 'success');
};
/** ② 경매지번 실거래가를 채운다 — 값은 가격정보의 '경매지번 실거래가' 표에서만 온다.
 *  비행기로 한 줄을 고르면 그 줄이 서고, 고르기 전에는 가장 최근 거래가 선다.
 *  표에 그런 거래가 없으면 빈칸으로 둔다 (PDF 평균으로 메우지 않는다 — 이 호실 값이 아니다). */
watch(
  [() => auction.value?.id, newestSaleRow, newestJeonseRow, samePlaceDone, samePlaceMissed],
  () => {
    const sf = surveyForm.value;
    if (!sf) return;
    // 다 받기 전에는 채우지 않는다 — 못 받은 달이 있으면 '가장 최근' 이 그때그때 달라진다
    if (!samePlaceDone.value || samePlaceMissed.value > 0) return;
    if (!sf.mktValues) sf.mktValues = {};
    const v = sf.mktValues;
    // 늘 경매물건 칸이다 — mk() 를 쓰면 켜 둔 모드에 따라 유사물건 칸으로 샌다
    const ymd = (raw: string) => raw.slice(0, 10).replace(/\./g, '-');
    let changed = false;
    const set = (id: string, value: string) => { if ((v[id] ?? '') !== value) { v[id] = value; changed = true; } };
    const put = (id: string, value: string) => { if (!v[id] && value) { v[id] = value; changed = true; } };
    // 비행기로 고른 줄은 날짜가 같이 들어온다 — 날짜가 있으면 사람이 고른 줄이니 그대로 둔다.
    // 날짜가 없는 금액은 표에서 온 값이 아니다(옛 PDF 평균). 표의 가장 최근 거래로 갈아 끼우고,
    // 표에 거래가 없으면 빈칸으로 둔다 — 이 칸은 표에서만 온다.
    const sale = newestSaleRow.value;
    if (!v['mkt.d.year']) {
      const price = sale ? Math.round(parsePriceNumber(sale.amount)) : 0;
      set('mkt.d.real', price > 0 ? String(price) : '');
      set('mkt.d.year', sale ? ymd(sale.contractDate) : '');
      set('mkt.d.floor', sale ? String(sale.floor ?? '').trim() : '');
    }
    if (sale && Number(sale.areaM2) > 0) {
      // 전용면적은 PDF 기본정보가 먼저다 — 비어 있을 때만 거래의 면적으로 채운다
      put('mkt.d.area', String(Number(sale.areaM2)));
      put('mkt.b.area', String(Number(sale.areaM2)));
    }
    const jeonse = newestJeonseRow.value;
    if (!v['mkt.d.jYear']) {
      set('mkt.d.jReal', jeonse ? String(Math.round(jeonse.deposit ?? 0)) : '');
      set('mkt.d.jYear', jeonse ? ymd(jeonse.contractDate) : '');
      set('mkt.d.jFloor', jeonse ? String(jeonse.floor ?? '').trim() : '');
    }
    // 전세 줄 전용면적도 이 호실의 면적을 쓴다 — 거래마다 면적이 달라도 집은 하나다
    if (v['mkt.d.area']) put('mkt.d.jArea', v['mkt.d.area']);
    else if (jeonse && Number(jeonse.areaM2) > 0) put('mkt.d.jArea', String(Number(jeonse.areaM2)));
    if (changed) void persistSurvey();
  },
  { immediate: true },
);

// 해당 경매물건 자료가 없으면 비슷한 물건으로 대신 조사한다.
// 모드를 바꾸면 저장 위치도 갈라져서 두 벌의 값을 따로 들고 있을 수 있다.
const MKT_MODES = ['경매물건', '유사물건'];
/** 화면에 보이는 이름. 저장값('경매물건/유사물건')은 그대로 두고 글자만 바꾼다.
 *  ②(실거래가)와 ①(저가매물)이 쓰는 말이 달라 쌍을 받아 쓴다. */
const mktModeLabel = (group: 'b' | 'c' | 'd', own: string, sim: string) =>
  (mktMode(group) === MKT_MODES[1] ? sim : own);

/** 계산 칸을 짚으면 그 값을 만든 칸이 같이 켜진다.
 *  '이 숫자가 어디서 나왔나'를 눈으로 따라가게 하려는 것이다 —
 *  말풍선을 열어 공식을 읽는 것보다 빠르다. */
const MKT_LIT_LINKS: Record<string, string[]> = {
  unit: ['unit', 'real', 'area'],                 // 평단가 = 매매 실거래가 ÷ 전용면적
  jeonse: ['jeonse', 'pub'],                      // 전세가 = 공동주택가 × 비율(같은 칸 안에 있다)
  pubRatio: ['pubRatio', 'real', 'pub'],          // 공시대비율 = 매매 ÷ 공동주택가
  saleRatio: ['saleRatio', 'jeonse', 'real'],     // 매매가율 = 전세가 ÷ 매매
  pub: ['pub', 'jeonse', 'pubRatio', 'saleRatio'], // 공동주택가는 거꾸로 — 이 값을 쓰는 칸들
  real: ['real', 'unit', 'pubRatio', 'saleRatio'],
};
/** 수요공급도 같은 규칙 — 지표를 짚으면 그 값을 만든 수치가 켜진다 */
const DM_LIT_LINKS: Record<string, string[]> = {
  turn: ['turn', 'deal', 'units'],        // 거래 회전율 = 거래량 ÷ 총세대수
  absorb: ['absorb', 'deal', 'listings'], // 매물 소화율 = 거래량 ÷ 총매물수
  burden: ['burden', 'listings', 'units'], // 매물 부담률 = 총매물수 ÷ 총세대수
  clear: ['clear', 'listings', 'deal'],   // 매물 소진기간 = 총매물수 ÷ 월평균 거래량
  // 수치 칸은 거꾸로 — 그 값을 쓰는 지표들이 켜진다
  deal: ['deal', 'turn', 'absorb', 'clear'],
  units: ['units', 'turn', 'burden'],
  listings: ['listings', 'absorb', 'burden', 'clear'],
};
const dmLitKey = ref('');
const dmLit = (id: string) => (DM_LIT_LINKS[dmLitKey.value] ?? []).includes(id);
const dmLitEnter = (id: string) => { if (hasHover) dmLitKey.value = id; };
const dmLitLeave = () => { if (hasHover) dmLitKey.value = ''; };
const dmLitTap = (id: string) => { dmLitKey.value = dmLitKey.value === id ? '' : id; };

const mktLitKey = ref('');
const mktLit = (id: string) => (MKT_LIT_LINKS[mktLitKey.value] ?? []).includes(id);
const litEnter = (id: string) => { if (hasHover) mktLitKey.value = id; };
const litLeave = () => { if (hasHover) mktLitKey.value = ''; };
/** 폰은 올려놓는 동작이 없다 — 눌러서 켜고 다시 눌러 끈다 */
const litTap = (id: string) => { mktLitKey.value = mktLitKey.value === id ? '' : id; };
/** 경매물건 칸은 손으로 적지 않는다.
 *  가격정보에서 비행기로 보낸 값·브이월드 공시가가 그대로 서는 자리다. 여기서 고치면
 *  어디서 온 숫자인지 알 수 없어진다. 손으로 적을 일은 유사물건 쪽에서 한다. */
const mktCaseLocked = computed(() => mktMode('d') === MKT_MODES[0]);
/** 그 칸을 지금 고칠 수 있나 */
const mktCaseEditable = computed(() => editingSurvey.value.deal && !mktCaseLocked.value);
/** 저가매물은 줄을 늘려 가며 적는다. 첫 줄은 예전 키(mkt.c.area)를 그대로 써 자료가 이어진다. */
const LOW_ROW_MAX = 10;
const lowRowCount = computed(() => {
  const n = Number(mktVal('mkt.c.rowCount')) || 1;
  return Math.min(LOW_ROW_MAX, Math.max(1, n));
});
const addLowRow = async () => {
  setMktVal('mkt.c.rowCount', String(Math.min(LOW_ROW_MAX, lowRowCount.value + 1)));
  await persistSurvey();
};
const LOW_ROW_FIELDS = ['area', 'addr', 'unit', 'saleAsk', 'note'];
/** 맨 마지막에 더한 줄부터 지운다. 적어 둔 값이 있으면 한 번 묻는다 */
const removeLowRow = () => {
  const last = lowRowCount.value - 1;
  if (last < 1) return;
  const drop = async () => {
    // 지운 줄의 값도 같이 비운다 — 다시 더했을 때 옛 값이 되살아나지 않게
    LOW_ROW_FIELDS.forEach((f) => { setMktVal(lowKey(last, f), ''); });
    setMktVal('mkt.c.rowCount', String(last));
    await persistSurvey();
  };
  const written = LOW_ROW_FIELDS.some((f) => mktVal(lowKey(last, f)).trim());
  if (!written) { void drop(); return; }
  askConfirm({
    title: '마지막 줄을 지울까요?',
    desc: '적어 둔 내용이 같이 사라집니다.',
    okLabel: '지우기',
    skipKey: 'skip-low-row-delete',
    run: drop,
  });
};
const mktMode = (group: 'b' | 'c' | 'd') => mktVal(`mkt.${group}.mode`) || MKT_MODES[0];
const toggleMktMode = async (group: 'b' | 'c' | 'd') => {
  const next = mktMode(group) === MKT_MODES[0] ? MKT_MODES[1] : MKT_MODES[0];
  setMktVal(`mkt.${group}.mode`, next);
  // ② 블록은 평단가(b)와 실거래가(d)를 한 줄에 쓰므로 모드가 따로 놀면 안 된다
  if (group === 'd') setMktVal('mkt.b.mode', next);
  await persistSurvey();
};
const lowKey = (index: number, field: string) => mk('c', index === 0 ? field : `${field}${index}`);
/** 그 줄의 평당가 = 매매호가 ÷ 전용면적(평). 면적을 아는데 손으로 또 적을 일이 아니다 */
const lowUnitAuto = (index: number) => {
  const price = parseDigits(mktVal(lowKey(index, 'saleAsk')));
  const py = (Number(mktAreaNum(lowKey(index, 'area'))) || 0) / PYEONG_TO_M2;
  return price > 0 && py > 0 ? Math.round(price / py) : 0;
};
/** 손으로 적었나 — 적은 값은 파랗게, 계산해 낸 값은 검게 보여 준다 */
const lowUnitTyped = (index: number) => parseDigits(mktVal(lowKey(index, 'unit'))) > 0;
const lowUnitText = (index: number) => {
  const typed = parseDigits(mktVal(lowKey(index, 'unit')));
  const n = typed > 0 ? typed : lowUnitAuto(index);
  return n > 0 ? n.toLocaleString('ko-KR') : '-';
};
/** 경매빌라 저가매물의 주소. 같은 건물이라 빌라명·동은 늘 같으니 자동으로 붙이고,
 *  줄마다 다른 층·호만 손으로 적게 한다. 유사빌라는 다른 건물이라 붙이지 않는다.
 *  이미 빌라명을 적어 둔 줄(예전에 전체 주소를 적어 둔 경우)은 그대로 둔다. */
const lowAddrAuto = computed(() => (mktMode('c') === MKT_MODES[0] ? subjectBuildingLabel.value : ''));
const lowAddrText = (index: number) => {
  const typed = mktVal(lowKey(index, 'addr')).trim();
  const head = lowAddrAuto.value;
  if (!head) return typed || '-';
  if (!typed) return head;
  const name = head.split(' ')[0];
  return name && typed.includes(name) ? typed : `${head} ${typed}`;
};
/** 손으로 적은 줄은 파랗게 — 평당가와 같은 규칙 */
const lowAddrTyped = (index: number) => !!mktVal(lowKey(index, 'addr')).trim();
const mk = (group: 'b' | 'c' | 'd', field: string) =>
  (mktMode(group) === '유사물건' ? `mkt.${group}.sim.${field}` : `mkt.${group}.${field}`);
// 출처 안내 — 아파트와 빌라가 보는 사이트가 다르다

const mktMoney = (id: string) => {
  const n = parseDigits(mktVal(id));
  return n > 0 ? n.toLocaleString('ko-KR') : '-';
};
// 평수는 숫자만 저장하고 보여 줄 때 '평'을 붙인다
const mktAreaNum = (id: string) => mktVal(id).replace(/[^\d.]/g, '');
const PYEONG_TO_M2 = 3.305785;
// 면적은 ㎡로 입력·저장하고, 보여 줄 때 평으로 환산한다
const mktAreaText = (id: string) => {
  const m2 = Number(mktAreaNum(id)) || 0;
  // 아무것도 없으면 '-' 다. 전세 내역이 없는 줄에 '0.00㎡ / 0.00평' 이 서 있으면
  // 0 평짜리 집을 조사한 것처럼 읽힌다 — 빈 칸은 빈 칸으로 보여야 한다.
  if (m2 <= 0) return '-';
  // 칸 하나에 한 줄로 — 글자는 .adp-mkt-area1 에서 줄여 맞춘다
  return `${m2.toFixed(2)}㎡ / ${(m2 / PYEONG_TO_M2).toFixed(2)}평`;
};
/** 면적 조건은 평으로 적고, 걸러낼 때 쓰는 값은 ㎡ 로 담는다.
 *  (목록·필터가 전부 ㎡ 기준이라 저장은 ㎡ 로 맞춰 둔다) */
const pyeongBox = (m2Ref: { value: string }) => computed({
  get: () => {
    const m2 = Number(String(m2Ref.value).replace(/[^\d.]/g, '')) || 0;
    return m2 > 0 ? String(Math.round((m2 / PYEONG_TO_M2) * 100) / 100) : '';
  },
  set: (raw: string) => {
    const py = Number(String(raw).replace(/[^\d.]/g, '')) || 0;
    m2Ref.value = py > 0 ? (py * PYEONG_TO_M2).toFixed(2) : '';
  },
});
const pubMinPyeong = pyeongBox(publicMinArea);
const pubMaxPyeong = pyeongBox(publicMaxArea);

/** 조건식이 담고 있는 범위 — 조회된 줄들에서 바로 구한다 */
const pubAreaRange = computed(() => {
  const list = filteredPublicTradeRows.value
    .map((r) => Number(r.areaM2) || 0)
    .filter((v) => v > 0);
  return list.length > 0 ? { min: Math.min(...list), max: Math.max(...list) } : null;
});
const pubYearRange = computed(() => {
  const list = filteredPublicTradeRows.value
    .map((r) => Number(r.buildYear) || 0)
    .filter((v) => v > 1800);
  return list.length > 0 ? { min: Math.min(...list), max: Math.max(...list) } : null;
});
/** 전용면적범위 — 시작 줄과 끝 줄, 각 줄에 ㎡ 와 평을 같이 */
const areaPairText = (m2: number) => (m2 > 0 ? `${m2.toFixed(2)}㎡ / ${(m2 / PYEONG_TO_M2).toFixed(2)}평` : '-');
// ③ 의 세 칸은 가격정보 '실거래가 조건식 분석'의 지금 결과를 그대로 비춘다.
// 거기서 기간·면적·건축년도를 고쳐 원하는 값을 만들고, 그 마지막 결과가 여기에 선다.
// 그래서 여기서는 따로 적지 않는다 — 적어 두면 조건을 고쳐도 옛 값이 남아 두 화면이 어긋난다.
const mktAreaStartM2 = computed(() => pubAreaRange.value?.min ?? 0);
const mktAreaEndM2 = computed(() => pubAreaRange.value?.max ?? 0);
const mktAreaRangeText = computed(() => `${areaPairText(mktAreaStartM2.value)} ~\n${areaPairText(mktAreaEndM2.value)}`);
/** 국토부 실거래 평균 — 가격정보 '실거래가 조건식 분석'의 지금 결과를 그대로 비춘다.
 *  거기서 기간·면적·건축년도를 고쳐 가며 값을 만들고, 그 마지막 값이 여기에 선다.
 *  예전에는 처음 한 번 찍어 두고 말아서, 조건을 고쳐도 옛 값이 남아 두 화면이 어긋났다. */
const mktSaleAvgValue = computed(() => (Number.isFinite(publicTradeAvg.value) ? publicTradeAvg.value : 0));
const mktSaleAvgText = computed(() => (mktSaleAvgValue.value > 0 ? mktSaleAvgValue.value.toLocaleString('ko-KR') : '-'));
/** 사진 블록 접기 — 사진이 있으면 접힌 상태가 기본. 손으로 펴면 그 선택을 기억한다 */
const photoFold = ref<Record<string, boolean>>({});
/** 접혀 있나? — 손으로 고친 적이 없으면 PHOTO_AREAS 의 공통 규칙(사진 있으면 접힘)을 따른다 */
const photoFolded = (key: string) => photoFold.value[key] ?? photoAreaCount(key) > 0;
const togglePhotoFold = (key: string) => {
  photoFold.value[key] = !photoFolded(key);
};
// 실거래가 거래일자 (YYYY-MM-DD)
// 매매·전세 두 칸이 같은 휠을 쓴다 — 어느 칸을 열었는지 키로 들고 있는다
const mktDealYmKey = ref('');
const mktDealYmValue = computed({
  get: () => (mktDealYmKey.value ? mktVal(mktDealYmKey.value) : ''),
  set: (value: string) => { if (mktDealYmKey.value) setMktVal(mktDealYmKey.value, value); },
});
// 전용면적 X 평단가
/** ② 경매물건 실거래가 — 평단가는 '실거래가 ÷ 면적(평)'.
 *  유사물건과 면적이 달라도 평단가로 맞춰 놓으면 바로 견줄 수 있다. */
const mktUnitFromReal = computed(() => {
  const price = parseDigits(mktVal(mk('d', 'real')));
  const py = (Number(mktAreaNum(mk('d', 'area'))) || 0) / PYEONG_TO_M2;
  return price > 0 && py > 0 ? Math.round(price / py) : 0;
});
const mktUnitFromRealText = computed(() => (mktUnitFromReal.value > 0 ? mktUnitFromReal.value.toLocaleString('ko-KR') : '-'));
// 결론표의 평단가도 같은 값을 쓰도록 저장해 둔다
watch(mktUnitFromReal, (n) => {
  const v = surveyForm.value?.mktValues;
  if (!v) return;
  const id = mk('b', 'unit');
  const next = n > 0 ? String(n) : '';
  if (next && (v[id] ?? '') !== next) v[id] = next;
}, { immediate: true });
/** 사용승인 — 손으로 적은 연월이 있으면 그 값, 없으면 조회된 건축연도 범위 */
/** 조회된 건축연도 범위 — 손으로 적지 않았을 때 쓰는 값 */
const mktApprovalAuto = computed(() => {
  const r = pubYearRange.value;
  if (!r) return '';
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  // 연도만 있는 자료라 범위의 양 끝을 그대로 쓴다 — 시작 해의 1월, 끝 해의 12월
  return `${yy(r.min)}.01~${yy(r.max)}.12`;
});
const mktApprovalText = computed(() => mktApprovalAuto.value || '-');
/** 거래기간 — 가격정보 탭에서 조회한 기간. 손으로 적으면 그 값이 이긴다 */
const pubPeriodText = computed(() => {
  const from = shortDate(publicStartDate.value);
  const to = shortDate(publicEndDate.value);
  return from && to ? `${from}~${to}` : publicRangeNote.value;
});
const mktPeriodText = computed(() => pubPeriodText.value || '-');
/** 이 물건의 층 — 정보요약에 적힌 값, 없으면 주소의 'N층'.
 *  거래 줄에서 못 받았을 때 쓴다 (이미 알고 있는 값이라 비워 둘 이유가 없다) */
const subjectFloor = computed(() => {
  const fromSummary = String(sumVal('sum.floorCurrent') ?? '').replace(/[^\d-]/g, '');
  if (fromSummary) return fromSummary;
  const m = (auction.value?.address ?? '').match(/(지하\s*)?(\d+)\s*층/);
  return m ? `${m[1] ? '-' : ''}${m[2]}` : '';
});
/** 화면에 쓸 층 — 손으로 적은 값이 있으면 그 값, 없으면 이 물건의 층 */
// 유사물건은 다른 집이라 이 물건의 층을 넣으면 안 된다 — 경매물건일 때만 자동으로 채운다
const mktFloorValue = computed(() => {
  const typed = mktVal(mk('d', 'floor')).trim();
  if (typed) return typed;
  // 거래가 들어온 줄에만 이 물건의 층을 대신 넣는다.
  // 빈 줄에 층만 떠 있으면 없는 거래가 있는 것처럼 보인다.
  const hasDeal = parseDigits(mktVal(mk('d', 'real'))) > 0;
  return hasDeal && mktMode('d') === MKT_MODES[0] ? subjectFloor.value : '';
});
/** 거래일자 아래에 층 — 보기 모드에서는 두 줄로 */
const dateFloorText = (dateKey: string, floor: string) => {
  const date = mktVal(dateKey) || '-';
  if (!floor) return date;
  // 한 줄에 담는다 — 칸이 좁아지는 만큼 글자는 .adp-mkt-area1 에서 줄인다
  return `${date} / ${/층$/.test(floor) ? floor : `${floor}층`}`;
};
const mktDealDateFloorText = computed(() => dateFloorText(mk('d', 'year'), mktFloorValue.value));

// 전세 줄 — 매매 줄과 같은 모양·같은 계산을 쓴다. 저장 키만 'j' 가 붙는다
const mktJeonseFloorValue = computed(() => {
  const typed = mktVal(mk('d', 'jFloor')).trim();
  if (typed) return typed;
  const hasDeal = parseDigits(mktVal(mk('d', 'jReal'))) > 0;
  return hasDeal && mktMode('d') === MKT_MODES[0] ? subjectFloor.value : '';
});
const mktJeonseDateFloorText = computed(() => dateFloorText(mk('d', 'jYear'), mktJeonseFloorValue.value));

// 전세가 = 공동주택가 × 비율(기본 127%)
const MKT_JEONSE_RATE = 127;
const mktJeonseRate = computed(() => {
  const r = Number(mktVal(mk('d', 'rate')).replace(/[^\d.]/g, ''));
  return Number.isFinite(r) && r > 0 ? r : MKT_JEONSE_RATE;
});
const mktJeonseFromPub = computed(() => {
  const pub = mktPubValue.value;
  return pub > 0 ? Math.round((pub * mktJeonseRate.value) / 100).toLocaleString('ko-KR') : '-';
});
/** 전세가율 / 갭 — '79% / 30,332,000' */
/** 전세가 ÷ 매매가 × 100 — 칸에 크게 서는 값 */
const mktJeonseToSale = computed(() => {
  const pub = mktPubValue.value;
  const jeonse = pub > 0 ? (pub * mktJeonseRate.value) / 100 : 0;
  const real = parseDigits(mktVal(mk('d', 'real')));
  return jeonse > 0 && real > 0 ? `${((jeonse / real) * 100).toFixed(0)}%` : '-';
});
/** 갭 = 매매가 − 전세가. 들고 들어가야 하는 돈이라 같이 적되,
 *  비율 옆에 작게 붙여 한 줄에 담는다 */
const mktGapText = computed(() => {
  const pub = mktPubValue.value;
  const jeonse = pub > 0 ? (pub * mktJeonseRate.value) / 100 : 0;
  const real = parseDigits(mktVal(mk('d', 'real')));
  return jeonse > 0 && real > 0 ? Math.round(real - jeonse).toLocaleString('ko-KR') : '';
});
// 공시대비율 = 실거래가 / 공동주택가
const mktCaseRatio = computed(() => {
  const pub = mktPubValue.value;
  const real = parseDigits(mktVal(mk('d', 'real')));
  return pub > 0 && real > 0 ? `${((real / pub) * 100).toFixed(0)}%` : '-';
});

// 시세조사·결론 기본값 — PDF와 다른 탭에서 끌어올 수 있는 값은 빈 칸일 때만 채운다.
const num = (v: number | undefined) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);
watch(
  [
    () => auction.value?.id,
    publicTradeAvg,
    pdfMaeMaeAvg,
    () => auction.value?.officialPriceValue,
    () => auction.value?.buildingAreaPyeong,
    () => surveyForm.value?.mktValues?.['mkt.c.saleAsk'],
  ],
  () => {
    const a = auction.value;
    const sf = surveyForm.value;
    if (!a || !sf) return;
    if (!sf.mktValues) sf.mktValues = {};
    const v = sf.mktValues;
    const fill = (id: string, value: string) => { if (!v[id] && value) v[id] = value; };

    // 면적을 평에서 ㎡로 바꾸면서, 예전에 평으로 저장해 둔 값은 한 번만 비운다
    // 예전 빌드가 자동 채움을 유사물건 칸으로 흘려보냈다. 그때 들어간 다섯 칸만
    // 한 번 비운다 — 사람이 적었거나 비행기로 보낸 다른 칸은 건드리지 않는다.
    if (!v['mkt.simSeedCleared']) {
      const strays = ['mkt.b.sim.area', 'mkt.b.sim.unit', 'mkt.d.sim.area', 'mkt.d.sim.real', 'mkt.d.sim.rate'];
      const had = strays.some((id) => !!v[id]);
      strays.forEach((id) => { v[id] = ''; });
      v['mkt.simSeedCleared'] = '1';
      if (had) void persistSurvey();
    }
    // mk() 를 쓰면 안 된다 — 지금 켜져 있는 모드에 따라 키가 'sim' 쪽으로 간다.
    // 여기서 채우는 건 '이 물건의 값' 이라 늘 경매물건 칸이어야 한다.
    // 유사물건 칸은 사람이 직접 적는 자리인데, 켜 둔 채로 물건을 열면 그리로 들어갔다.
    const areaIds = ['mkt.a.area', 'mkt.a.area2', 'mkt.b.area', 'mkt.c.area', 'mkt.d.area'];
    if (!v['mkt.areaInM2']) {
      areaIds.forEach((id) => { v[id] = ''; });
      v['mkt.areaInM2'] = '1';
    }
    const m2 = num(a.buildingAreaM2);
    // 조건식 칸(mkt.a.*)은 '조회 범위'라 이 물건의 면적을 넣으면 안 된다 — 블록 칸에만 채운다
    if (m2 > 0) areaIds.filter((id) => !id.startsWith('mkt.a.')).forEach((id) => fill(id, String(m2)));
    // 예전에 이 물건의 면적·사용승인이 들어가 있던 조건식 칸은 한 번만 비운다.
    // (칸의 뜻이 '이 물건의 값'에서 '조회 범위'로 바뀌었다)
    if (!v['mkt.condRange']) {
      ['mkt.a.area', 'mkt.a.area2', 'mkt.a.approval'].forEach((id) => { v[id] = ''; });
      v['mkt.condRange'] = '1';
    }
    const py = num(a.buildingAreaPyeong);
    if (py > 0 && !sf.mktConcPyeong) sf.mktConcPyeong = py.toFixed(2);
    // 결론표 면적칸의 ㎡ 쪽도 같이 채워 둔다 (평에서 거꾸로 환산하면 소수점이 한 끗 어긋난다)
    if (m2 > 0 && !(sf.mktConcValues?.['case.areaM2'])) {
      sf.mktConcValues = { ...(sf.mktConcValues ?? {}), 'case.areaM2': m2.toFixed(2) };
    }
    const around = num(publicTradeAvg.value);
    if (around > 0 && py > 0) fill('mkt.b.unit', String(Math.round(around / py)));
    fill('mkt.d.rate', String(MKT_JEONSE_RATE));

    // 결론 줄
    if (!sf.mktConcAvg && around > 0) sf.mktConcAvg = String(around);
    if (!sf.mktConcLow && v['mkt.c.saleAsk']) sf.mktConcLow = v['mkt.c.saleAsk'];
    if (!sf.mktUnitPrice && v['mkt.b.unit']) sf.mktUnitPrice = v['mkt.b.unit'];
  },
  { immediate: true },
);

/** 이 물건의 전용면적 (㎡) — 기본정보가 비어 있으면 표제부 전유면적, 그 다음 정보요약 값을 쓴다 */
const subjectAreaM2 = computed(() => {
  const a = auction.value;
  if (!a) return 0;
  const firstNum = (raw: unknown) => Number(String(raw ?? '').replace(/[^\d.]/g, '').match(/\d+(\.\d+)?/)?.[0]) || 0;
  return Number(a.buildingAreaM2) || firstNum(a.buildingHeader?.unitExclusiveArea) || firstNum(a.basicSummary?.['sum.exclusiveArea']);
});
/** 단지 목록에서 '같은 전용면적'의 가장 최근 매매 — 소수 둘째 자리까지 같으면 같은 면적으로 본다 */
const sameAreaLatestSale = computed(() => {
  const target = subjectAreaM2.value;
  if (!(target > 0)) return null;
  const hits = samePlaceRows.value.filter(
    (r) => r.kind === '매매'
      && Math.abs(r.areaM2 - target) < 0.05
      && parsePriceNumber(r.amount) > 0,
  );
  if (hits.length === 0) return null;
  return hits.reduce((best, r) => (r.contractDate > best.contractDate ? r : best), hits[0]);
});

// 같은 면적의 최근 매매가 있으면 '경매물건' 칸을 그 값으로 채운다.
// 없으면 채울 것이 없으니 '유사물건' 쪽으로 돌려 둔다 — 빈칸을 들여다보지 않게.
watch(
  [() => auction.value?.id, sameAreaLatestSale, () => samePlaceRows.value.length],
  () => {
    const sf = surveyForm.value;
    if (!sf) return;
    if (!sf.mktValues) sf.mktValues = {};
    const v = sf.mktValues;
    const hit = sameAreaLatestSale.value;
    if (!hit) {
      // 조회가 아직 안 끝났을 수도 있으니, 목록이 비어 있는 동안에는 건드리지 않는다
      if (samePlaceRows.value.length === 0) return;
      // 자동으로 손댄 적이 없을 때만 유사물건으로 돌린다 (손으로 고른 모드를 덮지 않게)
      if (!v['mkt.autoPlace']) {
        v['mkt.autoPlace'] = 'none';
        v['mkt.b.mode'] = MKT_MODES[1];
        v['mkt.d.mode'] = MKT_MODES[1];
      }
      return;
    }
    // 같은 줄을 이미 썼으면 손으로 고친 값은 그대로 두고, 빈 칸만 다시 메운다.
    // (면적 단위를 ㎡로 바꾸면서 한 번 비워진 칸이 영영 빈 채로 남던 걸 막는다)
    const sign = `${hit.contractDate}|${hit.areaM2}|${hit.amount}`;
    const sameRow = v['mkt.autoPlace'] === sign;
    // 0이나 '0원'처럼 숫자로 쳐서 0인 값도 빈 칸으로 본다 — 편집창을 열었다 닫으면 0이 눌러앉는다
    const blank = (id: string) => {
      const cur = v[id];
      return !cur || !(Number(String(cur).replace(/[^\d.]/g, '')) > 0);
    };
    const put = (id: string, value: string) => {
      if (!value) return;
      if (!sameRow || blank(id)) v[id] = value;
    };
    if (!sameRow) {
      v['mkt.autoPlace'] = sign;
      v['mkt.b.mode'] = MKT_MODES[0];
      v['mkt.d.mode'] = MKT_MODES[0];
    }
    const price = parsePriceNumber(hit.amount);
    const area = String(hit.areaM2);
    // ③ 경매물건 실거래가 — 전용면적 · 거래일자 · 실거래가
    put('mkt.d.area', area);
    put('mkt.d.year', hit.contractDate.slice(0, 10).replace(/\./g, '-'));
    put('mkt.d.floor', String(hit.floor ?? '').trim());
    put('mkt.d.real', price > 0 ? String(Math.round(price)) : '');
    // ② 경매물건 평단가 — 전용면적 · 평단가 (전용면적 X 평단가는 자동 계산)
    put('mkt.b.area', area);
    const pyeong = Number((hit.areaM2 / PYEONG_TO_M2).toFixed(2));
    put('mkt.b.unit', pyeong > 0 && price > 0 ? String(Math.round(price / pyeong)) : '');
  },
  { immediate: true },
);

/** 시세 및 급매가 결론 표 — 칸 5개 × 줄 3개(면적 / 평당가 / 가격).
 *  지금은 모두 손으로 적는다. 자동으로 채울 칸은 나중에 지정해 이 표에만 손대면 된다. */
type ConcCol = { key: string; label: string; note?: string; tone?: 'red' };
type ConcRow = { key: string; label: string; money: boolean; suffix?: string };
// 왼쪽부터 '이 물건 자체 → 비슷한 물건 → 동네 평균 → 시장에 나온 값 → 결론' 순으로
// 읽히게 세운다. 칸이 여섯이라 글자는 아래 .adp-conc-table 에서 줄여 뒀다.
// 한 표에 여섯 칸을 욱여넣으니 글자가 뭉개졌다 — 성격이 다른 둘로 가른다.
// '시세 결론'은 값을 모아 견주는 표, '급매가 결론'은 그걸 보고 적는 표.
const CONC_MEAN_SRC = ['case', 'sim', 'avg', 'low', 'lowSim'];
const MKT_CONC_COLS: ConcCol[] = [
  { key: 'case', label: '경매지번\n실거래가' },
  { key: 'sim', label: '유사물건\n실거래가' },
  { key: 'avg', label: '실거래가\n조건분석 평균' },
  { key: 'low', label: '경매빌라\n매물호가' },
  { key: 'lowSim', label: '유사빌라\n매물호가' },
  { key: 'mean', label: '평균' },
];
// 칸이 셋뿐이라 폭이 넉넉하다 — 이름을 한 줄로 쓴다
const MKT_URGENT_COLS: ConcCol[] = [
  { key: 'lot', label: '동일지번 매각물건' },
  { key: 'near', label: '인근 매각 평균' },
  { key: 'urgent', label: '급매가', tone: 'red' },
];
/** 두 표는 생김새가 같다 — 마크업을 한 벌만 두고 제목과 칸만 갈아 끼운다 */
const CONC_TABLES = [
  // boldPrice — 값을 모아 견주는 표라 마지막 '가격' 줄이 한눈에 들어와야 한다
  { title: '시세 결론', cols: MKT_CONC_COLS, note: false, boldPrice: true },
  { title: '급매가 결론', cols: MKT_URGENT_COLS, note: true, boldPrice: false },
];
const MKT_CONC_ROWS: ConcRow[] = [
  { key: 'area', label: '면적', money: false },
  { key: 'unit', label: '평당가', money: true },
  { key: 'price', label: '가격', money: true },
];
/** 예전부터 쓰던 칸은 그 필드를 그대로 쓴다 — 저장해 둔 값이 날아가지 않게 */
const MKT_CONC_LEGACY: Record<string, string> = {
  'avg.price': 'mktConcAvg',
  'low.price': 'mktConcLow',
  'case.area': 'mktConcPyeong',
  'case.unit': 'mktUnitPrice',
  'sim.area': 'mktSimPyeong',
  'sim.unit': 'mktSimUnitPrice',
  'urgent.price': 'urgentSalePrice',
};
/** 손으로 적는 칸 — 나머지는 다른 데서 만든 값을 그대로 비춘다 */
const CONC_MANUAL_COLS = ['lot', 'near', 'urgent'];
/** 결론표 네 칸의 출처.
 *  여기서 따로 적어 두면 원본이 바뀌어도 옛 값이 남아 둘이 어긋난다 —
 *  그래서 적어 두지 않고 만들어진 곳을 그때그때 읽는다.
 *  경매물건·유사물건은 ② 실거래가, 국토부는 ③ 조건분석, 네이버는 2.저렴매물조사. */
/** 그 줄의 평당가 = 가격 ÷ 면적(평). 적어 둔 값을 읽지 않는다 —
 *  예전에 찍힌 평당가가 남아 있으면 가격이 비어 있는데도 평당가만 떠 버린다. */
const concUnitFrom = (areaKey: string, priceKey: string): string => {
  const price = parseDigits(mktVal(priceKey));
  const py = (Number(mktAreaNum(areaKey)) || 0) / PYEONG_TO_M2;
  return price > 0 && py > 0 ? String(Math.round(price / py)) : '';
};
const concAuto = (col: string, row: string): string => {
  if (col === 'case') {
    if (row === 'areaM2') return mktVal('mkt.d.area');
    if (row === 'unit') return concUnitFrom('mkt.d.area', 'mkt.d.real');
    if (row === 'price') return mktVal('mkt.d.real');
  }
  if (col === 'sim') {
    if (row === 'areaM2') return mktVal('mkt.d.sim.area');
    if (row === 'unit') return concUnitFrom('mkt.d.sim.area', 'mkt.d.sim.real');
    if (row === 'price') return mktVal('mkt.d.sim.real');
  }
  // 저가매물은 경매빌라·유사빌라를 따로 적는다 (2.저렴매물조사의 모드 전환과 같은 자리)
  if (col === 'low' || col === 'lowSim') {
    const base = col === 'low' ? 'mkt.c' : 'mkt.c.sim';
    if (row === 'areaM2') return mktVal(`${base}.area`);
    // 평당가를 손으로 적었으면 그 값, 아니면 호가에서 낸다
    if (row === 'unit') return mktVal(`${base}.unit`) || concUnitFrom(`${base}.area`, `${base}.saleAsk`);
    if (row === 'price') return mktVal(`${base}.saleAsk`);
  }
  // 네 칸의 평균 — 빈 칸은 빼고 들어온 것만으로 낸다.
  // 면적은 평균을 내지 않는다 (범위·한 건이 섞여 있어 뜻이 안 선다)
  if (col === 'mean') {
    if (row !== 'unit' && row !== 'price') return '';
    const nums = CONC_MEAN_SRC
      .filter((k) => !concMeanOff(k))
      .map((k) => (row === 'unit' ? parseDigits(concVal(k, 'unit')) : concPriceValue(k)))
      .filter((n) => n > 0);
    if (nums.length === 0) return '';
    return String(Math.round(nums.reduce((a, b) => a + b, 0) / nums.length));
  }
  // 손으로 적는 칸도 평당가는 적을 일이 아니다 — 적어 둔 가격과 면적에서 낸다
  if (CONC_MANUAL_COLS.includes(col) && row === 'unit') {
    const price = parseDigits(concVal(col, 'price'));
    const py = concAreaPy(col);
    return price > 0 && py > 0 ? String(Math.round(price / py)) : '';
  }
  if (col === 'avg') {
    const m2 = publicAreaAvg.value;
    const price = mktSaleAvgValue.value;
    if (row === 'areaM2') return m2 > 0 ? m2.toFixed(2) : '';
    if (row === 'price') return price > 0 ? String(price) : '';
    // 평당가 — 평균가 ÷ 평균면적(평). 두 값이 같은 거래 묶음에서 나와야 뜻이 맞는다
    if (row === 'unit') {
      const py = m2 / PYEONG_TO_M2;
      return price > 0 && py > 0 ? String(Math.round(price / py)) : '';
    }
  }
  return '';
};
/** 시세 결론은 다른 데서 만든 값을 비추는 표지만, 비춘 값이 못 미더울 때는
 *  손으로 덮어쓸 수 있어야 한다. 자동으로 채워 두는 칸(case.areaM2 같은)과 섞이지 않게
 *  'fix:' 를 붙여 따로 담는다 — 지우면 다시 비추는 값으로 돌아간다. */
const CONC_FIX = 'fix:';
/** 평균에서 뺀 칸 — 체크를 풀면 그 칸은 평균 계산에 들어가지 않는다.
 *  값을 지우는 게 아니라 '이번 평균에는 넣지 말자' 는 표시라, 칸의 숫자는 그대로 남는다. */
const CONC_OFF = 'meanOff:';
const concMeanOff = (col: string): boolean => {
  const sf = surveyForm.value as unknown as Record<string, unknown>;
  return (sf?.mktConcValues as Record<string, string> | undefined)?.[`${CONC_OFF}${col}`] === '1';
};
const toggleConcMean = async (col: string) => {
  const sf = surveyForm.value as unknown as Record<string, unknown>;
  if (!sf) return;
  const cur = (sf.mktConcValues as Record<string, string> | undefined) ?? {};
  sf.mktConcValues = { ...cur, [`${CONC_OFF}${col}`]: concMeanOff(col) ? '' : '1' };
  await persistSurvey();
};
const concFix = (col: string, row: string): string => {
  const sf = surveyForm.value as unknown as Record<string, unknown>;
  return (sf?.mktConcValues as Record<string, string> | undefined)?.[`${CONC_FIX}${col}.${row}`] ?? '';
};
/** 급매가 결론처럼 '원래 손으로 적는 칸' 의 값 — 예전 필드를 그대로 쓴다 */
const concOwn = (col: string, row: string): string => {
  if (!CONC_MANUAL_COLS.includes(col)) return '';
  const sf = surveyForm.value as unknown as Record<string, unknown>;
  const legacy = MKT_CONC_LEGACY[`${col}.${row}`];
  return legacy
    ? String(sf[legacy] ?? '')
    : (sf.mktConcValues as Record<string, string> | undefined)?.[`${col}.${row}`] ?? '';
};
const concVal = (col: string, row: string): string => concOwn(col, row) || concFix(col, row) || concAuto(col, row);
/** 손으로 적은 값인가 — 적은 값은 파랗게 보여 준다 */
const concTyped = (col: string, row: string): boolean => !!concOwn(col, row) || !!concFix(col, row);
/** 그 칸을 손으로 적을 수 있나.
 *  조건분석 평균의 면적만 뺀다 — 한 값이 아니라 걸러 낸 범위라 한 칸에 적을 수가 없다. */
const concEditable = (col: string, row = '') => (
  editingSurvey.value.realUser && !(col === 'avg' && (row === 'area' || row === 'areaM2'))
);
const setConcVal = (col: string, row: string, value: string) => {
  const sf = surveyForm.value as unknown as Record<string, unknown>;
  const cur = (sf.mktConcValues as Record<string, string> | undefined) ?? {};
  if (!CONC_MANUAL_COLS.includes(col)) {
    sf.mktConcValues = { ...cur, [`${CONC_FIX}${col}.${row}`]: value };
    return;
  }
  const legacy = MKT_CONC_LEGACY[`${col}.${row}`];
  if (legacy) { sf[legacy] = value; return; }
  sf.mktConcValues = { ...cur, [`${col}.${row}`]: value };
};
/** 보기 모드 글자 — 면적은 적은 그대로, 돈은 천 단위 쉼표 */
const concText = (col: string, row: ConcRow) => {
  const raw = concVal(col, row.key);
  if (!raw) return '-';
  return row.money ? mktNumText(raw) : raw;
};
const concNum = (col: string, row: string) => Number(concVal(col, row).replace(/[^\d.]/g, '')) || 0;
/** 면적은 ㎡ 와 평 둘 다 담는다 — 한쪽을 적으면 다른 쪽이 따라 바뀐다 */
const setConcArea = (col: string, unit: 'm2' | 'py', raw: string) => {
  const n = Number(String(raw).replace(/[^\d.]/g, '')) || 0;
  if (unit === 'm2') {
    setConcVal(col, 'areaM2', raw);
    setConcVal(col, 'area', n > 0 ? (n / PYEONG_TO_M2).toFixed(2) : '');
  } else {
    setConcVal(col, 'area', raw);
    setConcVal(col, 'areaM2', n > 0 ? (n * PYEONG_TO_M2).toFixed(2) : '');
  }
};
// 한쪽만 저장돼 있던 예전 자료도 보이게 서로에게서 끌어온다
const concAreaPy = (col: string) => concNum(col, 'area') || concNum(col, 'areaM2') / PYEONG_TO_M2;
const concAreaM2 = (col: string) => concNum(col, 'areaM2') || concNum(col, 'area') * PYEONG_TO_M2;
/** 한 칸짜리 면적 글자 — '52.23 / 15.80평' */
const concAreaOne = (m2: number) => (m2 > 0 ? `${m2.toFixed(2)} / ${(m2 / PYEONG_TO_M2).toFixed(2)}평` : '');
const concAreaText = (col: string) => {
  // 조건분석 평균은 한 거래가 아니라 걸러 낸 묶음이다 — ③ 과 같은 범위로 적어야 뜻이 맞는다
  if (col === 'avg') {
    const lo = concAreaOne(mktAreaStartM2.value);
    const hi = concAreaOne(mktAreaEndM2.value);
    return lo && hi ? `${lo} ~\n${hi}` : (lo || hi || '-');
  }
  const m2 = concAreaM2(col);
  // 나머지 칸은 한 줄 — 글자는 .adp-conc-area 에서 줄여 맞춘다
  return m2 > 0 ? `${m2.toFixed(2)} / ${concAreaPy(col).toFixed(2)}평` : '-';
};
/** 가격 = 평당가 × 면적(평). 손으로 적은 값이 있으면 그 값이 이긴다 */
const concPriceAuto = (col: string) => {
  const unit = parseDigits(concVal(col, 'unit'));
  const py = concAreaPy(col);
  return unit > 0 && py > 0 ? Math.round(unit * py) : 0;
};
const concPriceHint = (col: string) => {
  const auto = concPriceAuto(col);
  return auto > 0 ? auto.toLocaleString('ko-KR') : '가격';
};
/** 그 칸에 실제로 서는 가격 — 손으로 적은 값이 있으면 그 값, 없으면 평당가 × 면적 */
const concPriceValue = (col: string) => {
  const manual = parseDigits(concVal(col, 'price'));
  return manual > 0 ? manual : concPriceAuto(col);
};
const concPriceText = (col: string) => {
  const manual = concVal(col, 'price');
  if (manual) return mktNumText(manual);
  const auto = concPriceAuto(col);
  return auto > 0 ? auto.toLocaleString('ko-KR') : '-';
};
// 부동산 정보 — 최소 3줄은 항상 보이게 채워 둔다 (computed 안에서 고치면 순환이 생겨 watch로 뺀다)
const emptyAgencyRow = (): AgencyRow => ({ name: '', phone: '', info: '', monthly: '', jeonse: '', real: '', urgent: '', note: '' });
watch(
  () => auction.value?.id,
  () => {
    const sf = surveyForm.value;
    if (!sf) return;
    if (!sf.agencyRows) sf.agencyRows = [];
    while (sf.agencyRows.length < AGENCY_ROW_MIN) sf.agencyRows.push(emptyAgencyRow());
    // 현장 상담표도 유선 상담표와 똑같이 빈 줄 하나를 깔아 둔다
    if (!sf.siteAgencyRows) sf.siteAgencyRows = [];
    while (sf.siteAgencyRows.length < AGENCY_ROW_MIN) sf.siteAgencyRows.push(emptyAgencyRow());
  },
  { immediate: true },
);
const agencyRows = computed<AgencyRow[]>(() => surveyForm.value.agencyRows ?? []);
// 4. 부동산 현장 상담 — 유선 정보와 별개로 현장에서 들은 내용을 적는다
const siteAgencyRows = computed<AgencyRow[]>(() => surveyForm.value.siteAgencyRows ?? []);
const addSiteAgencyRow = async () => {
  const sf = surveyForm.value;
  if (!sf.siteAgencyRows) sf.siteAgencyRows = [];
  sf.siteAgencyRows.push({ name: '', phone: '', info: '', monthly: '', jeonse: '', real: '', urgent: '', note: '' });
  await persistSurvey();
};
const removeSiteAgencyRow = async (idx: number) => {
  surveyForm.value.siteAgencyRows?.splice(idx, 1);
  await persistSurvey();
};
// 1. 입지확인 — 매매수요에서 낸 평균등수를 가져오고, 직접 고칠 수도 있다
const fieldRankAvg = computed(() => {
  const manual = fieldVal('fs.rankAvg').trim();
  if (manual) return manual;
  return realUserRankSummary.value.filled > 0 ? String(realUserRankSummary.value.avg) : '';
});
const addAgencyRow = () => {
  surveyForm.value.agencyRows?.push(emptyAgencyRow());
};
/** 상담표의 마지막 줄을 지운다 (저가매물과 같은 규칙) */
const agencyRowWritten = (row?: AgencyRow) =>
  !!row && Object.values(row).some((v) => String(v ?? '').trim());
const askRemoveLast = (
  rows: AgencyRow[],
  drop: () => Promise<void> | void,
  skipKey: string,
) => {
  if (rows.length <= AGENCY_ROW_MIN) return;
  if (!agencyRowWritten(rows[rows.length - 1])) { void drop(); return; }
  askConfirm({
    title: '마지막 줄을 지울까요?',
    desc: '적어 둔 내용이 같이 사라집니다.',
    okLabel: '지우기',
    skipKey,
    run: drop,
  });
};
const removeLastAgencyRow = () => {
  const rows = surveyForm.value.agencyRows;
  if (!rows) return;
  askRemoveLast(rows, async () => { rows.splice(rows.length - 1, 1); await persistSurvey(); }, 'skip-agency-row-delete');
};
const removeLastSiteAgencyRow = () => {
  const rows = surveyForm.value.siteAgencyRows;
  if (!rows) return;
  askRemoveLast(rows, async () => { rows.splice(rows.length - 1, 1); await persistSurvey(); }, 'skip-site-agency-row-delete');
};
const removeAgencyRow = (idx: number) => {
  const rows = surveyForm.value.agencyRows;
  if (!rows || rows.length <= AGENCY_ROW_MIN) return;
  rows.splice(idx, 1);
};

const RIGHTS_CHECK_ITEMS = [
  {
    id: 'distribution',
    label: '배당요구 종기일',
    desc: '대항력 임차인인 경우, 배당종기일 지난 후 배당요구 경우 있다.\n배당신청, 날짜까지 확인 필요. 이 경우 낙찰자 인수 이다.',
  },
  {
    id: 'landRegistry',
    label: '토지별도등기',
    desc: '토지만의 별도 등기가 있을 경우\n토지 별도등기자가 먼저 배당 받을 수 있음',
  },
  {
    id: 'wageClaim',
    label: '임금채권 및 최선순위 배당',
    desc: '선순위 임차인 있을 경우, 임금채권등 최선 순위이기 때문에 선순위 임차인 낙찰자 인수 가능성 있음\n법인의 경우 임금채권 의심/근로복지공단(체당금) 최우선 변제',
  },
  {
    id: 'taxDate',
    label: '당해세, 법정기일 금액, 법정기일',
    desc: '법정기일 빠른 세금이 있는 경우 확인 필요\n확정일자 보다 법정기일이 빠를 경우 선순위 이다. (당해세)\n이 경우에는 매각 불허가 처리도 가능',
  },
];

// === 권리분석 서류 첨부 (매각물건명세서 캡처 등) ===
const rightsDocInput = ref('');
const rightsDocErrMsg = ref('');
const rightsDocList = computed<string[]>(() => auction.value?.rightsDocUrls ?? []);

/** 사진이 들어가는 칸을 전부 여기 모아 둔다 — 새 칸이 생기면 이 표에 한 줄만 더하면 된다.
 *  공통 규칙: 사진이 한 장이라도 붙어 있으면 접은 채로 열고(아래 항목이 밀려 내려가지 않게),
 *  없으면 펴 둔다(바로 붙일 수 있게). 손으로 접거나 편 뒤에는 그 선택을 지킨다.
 *  scope 'card' 는 카드 통째(전체 접기/펼치기와 같이 움직임), 'block' 은 카드 안의 작은 칸. */
const PHOTO_AREAS: Array<{ key: string; scope: 'card' | 'block'; count: () => number }> = [
  { key: 'photos', scope: 'card', count: () => propertyPhotos.value.length },              // 손품조사 · 본건사진
  { key: 'rightsPhotos', scope: 'card', count: () => rightsDocList.value.length },         // 권리분석 · 사진/서류
  { key: 'site', scope: 'block', count: () => auction.value?.sitePhotos?.length ?? 0 },    // 손품+현장 · 현장사진
  { key: 'sameLot', scope: 'block', count: () => extraList('sameLot').length },            // 급매가 · 동일지번 매각물건
  { key: 'tradePhoto', scope: 'block', count: () => tradePhotoList.value.length },         // 급매가 · 평단가 비교 사진
  { key: 'listPhoto', scope: 'block', count: () => listPhotoList.value.length },           // 급매가 · 네이버부동산 매물 사진
  { key: 'areaSurvey', scope: 'block', count: () => extraList('areaSurvey').length },       // 매매수요 · 입지조사 사진
];
/** 그 칸에 붙어 있는 사진 장수 — 표에 없는 키는 0 */
const photoAreaCount = (key: string) => PHOTO_AREAS.find((a) => a.key === key)?.count() ?? 0;
const PHOTO_SECTIONS = PHOTO_AREAS.filter((a) => a.scope === 'card');
const photoCollapseSetFor = ref<string | null>(null);
watch(
  () => [auction.value?.id, ...PHOTO_SECTIONS.map((sec) => sec.count())] as const,
  () => {
    const id = auction.value?.id;
    if (!id || photoCollapseSetFor.value === id) return;
    photoCollapseSetFor.value = id;
    // 다른 물건으로 넘어왔다 — 앞 물건에서 손으로 펴 둔 기억은 버린다.
    // 안 그러면 사진이 있는데도 펴진 채로 열려 '사진 있으면 접힘' 규칙이 깨진다.
    photoFold.value = {};
    const next = { ...collapsed.value };
    PHOTO_SECTIONS.forEach((sec) => { next[sec.key] = sec.count() > 0; });
    collapsed.value = next;
  },
  { immediate: true },
);
const addRightsDocUrl = async () => {
  if (!auction.value) return;
  const url = rightsDocInput.value.trim();
  if (!url) return;
  rightsDocErrMsg.value = '';
  if (!auction.value.rightsDocUrls) auction.value.rightsDocUrls = [];
  if (auction.value.rightsDocUrls.includes(url)) {
    rightsDocErrMsg.value = '이미 추가된 링크입니다.';
    return;
  }
  auction.value.rightsDocUrls.unshift(url);
  rightsDocInput.value = '';
  await store.saveAuction(auction.value);
};
const removeRightsDocAt = async (idx: number) => {
  if (!auction.value) return;
  const [removed] = auction.value.rightsDocUrls?.splice(idx, 1) ?? [];
  await store.saveAuction(auction.value);
  await discardPastedImage(removed);
};

// === 항목별 사진·링크 모음 (입지조사 등) ===
const extraInput = ref<Record<string, string>>({});
const extraErr = ref<Record<string, string>>({});
const extraList = (key: string) => auction.value?.extraPhotos?.[key] ?? [];
const addExtraUrl = async (key: string) => {
  if (!auction.value) return;
  const url = (extraInput.value[key] ?? '').trim();
  if (!url) return;
  extraErr.value = { ...extraErr.value, [key]: '' };
  if (!auction.value.extraPhotos) auction.value.extraPhotos = {};
  const list = auction.value.extraPhotos[key] ?? [];
  if (list.includes(url)) {
    extraErr.value = { ...extraErr.value, [key]: '이미 추가된 링크입니다.' };
    return;
  }
  auction.value.extraPhotos[key] = [url, ...list];
  extraInput.value = { ...extraInput.value, [key]: '' };
  await store.saveAuction(auction.value);
};
const removeExtraAt = async (key: string, idx: number) => {
  if (!auction.value?.extraPhotos?.[key]) return;
  const [removed] = auction.value.extraPhotos[key].splice(idx, 1);
  await store.saveAuction(auction.value);
  await discardPastedImage(removed);
};

// === 실거래가 현황 사진 (아실·디스코) ===
const tradePhotoInput = ref('');
const tradePhotoErrMsg = ref('');
const tradePhotoList = computed<string[]>(() => auction.value?.tradePhotoUrls ?? []);
const addTradePhotoUrl = async () => {
  if (!auction.value) return;
  const url = tradePhotoInput.value.trim();
  if (!url) return;
  tradePhotoErrMsg.value = '';
  if (!auction.value.tradePhotoUrls) auction.value.tradePhotoUrls = [];
  if (auction.value.tradePhotoUrls.includes(url)) {
    tradePhotoErrMsg.value = '이미 추가된 링크입니다.';
    return;
  }
  auction.value.tradePhotoUrls.unshift(url);
  tradePhotoInput.value = '';
  await store.saveAuction(auction.value);
};
const removeTradePhotoAt = async (idx: number) => {
  if (!auction.value) return;
  const [removed] = auction.value.tradePhotoUrls?.splice(idx, 1) ?? [];
  await store.saveAuction(auction.value);
  await discardPastedImage(removed);
};

// === 네이버부동산 매물 사진 (최저가) ===
const listPhotoInput = ref('');
const listPhotoErrMsg = ref('');
const listPhotoList = computed<string[]>(() => auction.value?.listPhotoUrls ?? []);
const addListPhotoUrl = async () => {
  if (!auction.value) return;
  const url = listPhotoInput.value.trim();
  if (!url) return;
  listPhotoErrMsg.value = '';
  if (!auction.value.listPhotoUrls) auction.value.listPhotoUrls = [];
  if (auction.value.listPhotoUrls.includes(url)) {
    listPhotoErrMsg.value = '이미 추가된 링크입니다.';
    return;
  }
  auction.value.listPhotoUrls.unshift(url);
  listPhotoInput.value = '';
  await store.saveAuction(auction.value);
};
const removeListPhotoAt = async (idx: number) => {
  if (!auction.value) return;
  const [removed] = auction.value.listPhotoUrls?.splice(idx, 1) ?? [];
  await store.saveAuction(auction.value);
  await discardPastedImage(removed);
};

// === 서류 확인 체크 — 매각물건명세서 외 확인해야 할 공부들 ===
type RightsDocField = {
  id: string;
  placeholder: string;
  autoOccupancy?: boolean;
  /** 입력칸 대신 O/X를 번갈아 고르는 버튼 */
  toggleLabel?: string;
  /** 여러 개를 고르는 칸 */
  options?: string[];
};
type RightsDocItem = {
  id: string; label: string;
  task?: string;
  /** 비고 입력칸 없이 확인 문구만 두는 행 */
  noNote?: boolean;
  /** 확인 문구 옆에 작은 비고칸을 같이 두는 행 */
  inlineNote?: boolean;
  dateId?: string; datePlaceholder?: string;
  fields?: RightsDocField[];
  /** 같은 항목을 두 줄로 쓸 때의 둘째 줄 — 이름·체크는 하나로 묶인다 */
  line2?: { dateId: string; datePlaceholder: string; fields: RightsDocField[] };
  /** 줄 구성을 직접 적을 때 — 칸 종류와 순서를 마음대로 둔다 */
  lines?: RightsDocLine[];
};
// 한 줄 안의 칸 — 날짜 버튼 / 자유 입력 / 여러 개 고르기 / 하나 고르기
type RightsDocCell = {
  /** label — 적는 칸이 아니라 '무슨 날짜인지' 를 세워 두는 글자 칸 */
  kind: 'date' | 'text' | 'multi' | 'pick' | 'label';
  id: string; placeholder: string;
  options?: string[];
  autoOccupancy?: boolean;
  /** 아랫줄 마지막 칸 끝까지 늘려 쓰는 칸 */
  wide?: boolean;
};
type RightsDocLine = { cells: RightsDocCell[] };
// 현황조사일 줄 — 집행관이 문 앞에서 본 것만 고른다
const DOC_SURVEY_OPTIONS = ['임차인점유', '폐문부재', '점유미상', '세대열람 O', '세대열람 X'];
// 전입일자 줄 — 전입 기록에서 읽히는 것만 고른다 (폐문부재·점유관계미상은 조사일 쪽 말이다)
const DOC_MOVEIN_OPTIONS = ['임차인점유', '동거인O', '전출', '전입'];
const RIGHTS_DOC_ITEMS: RightsDocItem[] = [
  {
    // 줄마다 '무슨 날짜인지' 를 왼쪽에 세우고, 날짜칸은 가운데, 고르는 칸은 오른쪽.
    // 네 줄(현황조사·세대열람)이 같은 자리에 같은 종류의 칸을 두게 맞췄다.
    id: 'doc.survey', label: '집행관 현황조사',
    lines: [
      { cells: [
        { kind: 'label', id: 'doc.survey.dateLabel', placeholder: '조사일' },
        { kind: 'date', id: 'doc.survey.date', placeholder: '날짜입력' },
        { kind: 'multi', id: 'doc.survey.note', placeholder: '점유관계', options: DOC_SURVEY_OPTIONS, wide: true },
      ] },
      { cells: [
        { kind: 'label', id: 'doc.surveyTenant.dateLabel', placeholder: '전입일' },
        { kind: 'date', id: 'doc.surveyTenant.date', placeholder: '날짜입력' },
        { kind: 'multi', id: 'doc.surveyTenant.state', placeholder: '점유관계', options: DOC_MOVEIN_OPTIONS },
        { kind: 'text', id: 'doc.surveyTenant.extra', placeholder: '세대주 입력' },
      ] },
    ],
  },
  {
    id: 'doc.residents', label: '세대열람',
    lines: [
      { cells: [
        { kind: 'label', id: 'doc.residents.issueLabel', placeholder: '발급일' },
        { kind: 'date', id: 'doc.residents.issueDate', placeholder: '날짜입력' },
      ] },
      { cells: [
        { kind: 'label', id: 'doc.residents.dateLabel', placeholder: '전입일' },
        { kind: 'date', id: 'doc.residents.date', placeholder: '날짜입력' },
        { kind: 'multi', id: 'doc.residents.cohabit', placeholder: '점유관계', options: DOC_MOVEIN_OPTIONS },
        { kind: 'text', id: 'doc.residents.head', placeholder: '세대주 입력' },
      ] },
    ],
  },
  { id: 'doc.appraisal', label: '감정평가서', task: '감정평가요항표 : 4번 이용상태, 9번 공부와의 차이 확인', noNote: true },
  { id: 'doc.ledger', label: '건축물대장', task: '용도확인, 위반건축물확인', noNote: true },
  { id: 'doc.delivery', label: '문건송달 내역', task: 'LH, HUG 경매속행신청서 확인 (우선매수)', inlineNote: true },
];

// 날짜 칸이 여러 개라 '지금 고르는 칸 id'를 들고 하나의 휠 선택기를 돌려 쓴다.
// DateWheelPicker는 v-model을 쓰므로 rightsDocNotes와 이어 줄 중계 computed가 필요하다.
const docDatePickerId = ref('');
const docDateValue = computed({
  get: () => (docDatePickerId.value ? auction.value?.rightsDocNotes?.[docDatePickerId.value] ?? '' : ''),
  set: (value: string) => {
    if (docDatePickerId.value) void setRightsDocNote(docDatePickerId.value, value);
  },
});

// 날짜+입력칸 줄 — 둘째 줄이 있으면 같은 칸 안에 이어 그린다
const toDocCells = (dateId: string, datePlaceholder: string, fields: RightsDocField[]): RightsDocCell[] => [
  { kind: 'date', id: dateId, placeholder: datePlaceholder },
  ...fields.map((f): RightsDocCell => (f.options
    ? { kind: 'multi', id: f.id, placeholder: f.placeholder, options: f.options }
    : { kind: 'text', id: f.id, placeholder: f.placeholder, autoOccupancy: f.autoOccupancy })),
];
const docLines = (item: RightsDocItem): RightsDocLine[] => {
  if (item.lines) return item.lines;
  const first = { cells: toDocCells(item.dateId ?? '', item.datePlaceholder ?? '', item.fields ?? []) };
  if (!item.line2) return [first];
  return [first, { cells: toDocCells(item.line2.dateId, item.line2.datePlaceholder, item.line2.fields) }];
};
// 하나만 고르는 칸 — 고르면 바로 닫는다
const pickDocNoteOption = async (id: string, opt: string) => {
  docMultiOpen.value = '';
  await setRightsDocNote(id, opt);
};
/** 권리분석 정리의 비고가 앉을 자리. 다른 비고와 같은 칸(rightsDocNotes)에 담는다 —
 *  표 항목 id 와 겹치지 않도록 점을 찍은 이름을 쓴다. */
const RIGHTS_CONC_ID = 'rights.conclusion';
const rightsDocNote = (id: string) => auction.value?.rightsDocNotes?.[id] ?? '';
// 세대열람의 동거인 칸처럼 여러 개를 고르는 항목 — 쉼표로 이어 붙인 한 문자열로 저장
const docMultiOpen = ref('');
// 예전에 O/X 버튼으로 저장해 둔 값('O', 'X')을 지금 선택지 이름으로 바꾸고 중복을 없앤다
const DOC_LEGACY_LABELS: Record<string, string> = { O: '동거인O', '동거인 O': '동거인O', 점유자미상: '점유미상', 점유관계미상: '점유미상' };
const docNoteList = (id: string) => {
  const seen = new Set<string>();
  return rightsDocNote(id)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => DOC_LEGACY_LABELS[v] ?? v)
    .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
};
const toggleDocNoteOption = async (id: string, opt: string) => {
  const picked = docNoteList(id);
  const idx = picked.indexOf(opt);
  if (idx >= 0) picked.splice(idx, 1);
  else picked.push(opt);
  await setRightsDocNote(id, picked.join(', '));
};
const setRightsDocNote = (id: string, value: string) => {
  if (!auction.value) return;
  if (!auction.value.rightsDocNotes) auction.value.rightsDocNotes = {};
  auction.value.rightsDocNotes[id] = value;
  persistSoon();
};

// 자유 입력이던 칸이 선택칸으로 바뀌면서, 예전에 적어 둔 값이 목록에 없는데도 남아 있다.
// 물건을 열 때 지금 선택지에 있는 것만 남기고 정리한다.
watch(
  () => auction.value?.id,
  () => {
    const notes = auction.value?.rightsDocNotes;
    if (!notes) return;
    RIGHTS_DOC_ITEMS.forEach((item) => docLines(item).forEach((ln) => ln.cells.forEach((c) => {
      if (c.kind !== 'multi' && c.kind !== 'pick') return;
      const options = c.options;
      if (!options) return;
      const cur = notes[c.id] ?? '';
      if (!cur) return;
      const picked = cur
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => DOC_LEGACY_LABELS[v] ?? v);
      const kept = picked.filter((v) => options.includes(v));
      if (kept.length !== picked.length) void setRightsDocNote(c.id, kept.join(', '));
    })));
  },
  { immediate: true },
);

// 점유관계는 임차인 파싱 결과로 채워 둔다 — 임차인이 없으면 '미상'
const occupancyDefault = computed(() => {
  const names = tenantCards.value.map((t) => t.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : '미상';
});

const toggleRightsCheck = async (id: string, checked: boolean) => {
  if (!auction.value) return;
  if (!auction.value.rightsChecks) auction.value.rightsChecks = {};
  auction.value.rightsChecks[id] = checked;
  await store.saveAuction(auction.value);
};

// 권리분석 테이블 6개 케이스.
// summary는 선택 목록에 작게 붙는 요약, detail은 선택 후 아래에 크게 보여줄 설명이다.
const RIGHTS_CASES = [
  { id: '1', title: '권리분석 케이스1', summary: '특수물건 : 3자권리인수 있음, 가등기/가처분' },
  { id: '2', title: '권리분석 케이스2', summary: '기본물건 : 3자권리인수 없음, 임차인 없음' },
  { id: '3', title: '권리분석 케이스3', summary: '기본물건 : 3자권리인수 없음, 임차인 있음, 대항력 없음' },
  { id: '4', title: '권리분석 케이스4', summary: '기본물건 : 임차인 있음, 대항력 없음, 우선변제' },
  { id: '5', title: '권리분석 케이스5', summary: '대항력 물건 : 대항력 있음, 우선변제권 없음' },
  { id: '6', title: '권리분석 케이스6', summary: '미배당인수 : 대항력 있음, 우선변제권 있음' },
];

const selectedRightsCase = computed(() =>
  RIGHTS_CASES.find((c) => c.id === auction.value?.rightsCaseId) ?? null,
);

// 손품조사 매뉴얼의 실사용자 표. maxPyeong은 자동 판정 경계(전용 평수 기준).
const REAL_USER_BANDS = [
  {
    id: '12',
    title: '전용 12평',
    conditions: ['일자리', '교통', '인프라', '공원'],
    maxPyeong: 13.5,
  },
  {
    id: '15',
    title: '전용 15평',
    conditions: ['교통', '인프라', '유치원', '공원'],
    maxPyeong: 16.5,
  },
  {
    id: '18',
    title: '전용 18~25평',
    conditions: ['초등학교', '학원가', '인프라', '교통'],
    maxPyeong: Number.POSITIVE_INFINITY,
  },
];

// 평형대는 손으로 고른 것만 쓴다 — 세대구성·입지조건이 따라 바뀌므로
// 전용면적으로 미리 정해 두면 고르지도 않은 기준으로 등수를 적게 된다
const selectedRealUserBand = computed(
  () => REAL_USER_BANDS.find((b) => b.id === auction.value?.realUserBandId) ?? null,
);

// '12~14평' 같은 평형대를 ㎡로 바꿔 선택칸 아래에 같이 보여 준다
const selectedRealUserBandM2 = computed(() => {
  const nums = (selectedRealUserBand.value?.title ?? '').match(/[\d.]+/g);
  if (!nums || nums.length === 0) return '';
  const toM2 = (p: string) => (Number(p) * PYEONG_TO_M2).toFixed(1);
  return nums.length >= 2 ? `${toM2(nums[0])}~${toM2(nums[1])}㎡` : `${toM2(nums[0])}㎡`;
});

const bandOpen = ref(false);
/** 등수를 매길 입지조건 — 사는 가족(룸수)을 따라간다.
 *  룸수를 아직 안 골랐으면 예전처럼 평형대 기준을 그대로 쓴다. */
const rankConditions = computed(
  () => selectedRoomType.value?.conditions ?? selectedRealUserBand.value?.conditions ?? [],
);

// 룸수 — 전용면적에서 자동으로 뽑지 않고 직접 고른다.
// 같은 평수라도 방을 몇 개로 나눴느냐에 따라 들어와 사는 가족이 달라지기 때문이다.
// 오른쪽 세대구성은 여기서 고른 룸수를 그대로 따라간다.
// 입지조건도 여기에 둔다 — 혼자 사는 사람은 일자리·교통을 보고,
// 아이가 있는 집은 유치원·초등학교·학원가를 본다. 보는 것이 가족에 따라 달라진다.
const ROOM_TYPES = [
  {
    id: '1', label: '1룸',
    details: [{ who: '1인가구', kinds: [] }],
    conditions: ['일자리', '교통', '인프라', '공원'],
  },
  {
    id: '1.5', label: '1.5룸',
    details: [{ who: '1인가구', kinds: [] }, { who: '2인가구', kinds: ['신혼'] }],
    conditions: ['일자리', '교통', '인프라', '공원'],
  },
  {
    id: '2', label: '2룸',
    details: [{ who: '1인가구', kinds: [] }, { who: '2인가구', kinds: ['신혼', '중장년'] }],
    conditions: ['일자리', '교통', '인프라', '공원'],
  },
  {
    id: '2b', label: '큰 2룸',
    details: [{ who: '2인가구', kinds: ['신혼', '중장년'] }, { who: '3인가족', kinds: ['미취학'] }],
    conditions: ['교통', '인프라', '유치원', '공원'],
  },
  {
    id: '3', label: '3룸',
    details: [{ who: '3인가족', kinds: [] }, { who: '4인가족', kinds: [] }],
    conditions: ['초등학교', '학원가', '인프라', '교통'],
  },
  {
    id: '4', label: '4룸',
    details: [{ who: '4인가족', kinds: [] }, { who: '5인가족', kinds: [] }],
    conditions: ['초등학교', '학원가', '인프라', '교통'],
  },
];
const roomOpen = ref(false);
const selectedRoomType = computed(
  () => ROOM_TYPES.find((r) => r.id === auction.value?.realUserRoomId) ?? null,
);
const pickRoomType = async (id: string) => {
  roomOpen.value = false;
  if (!auction.value) return;
  auction.value.realUserRoomId = id;
  await store.saveAuction(auction.value);
};

// 입지조건별 등수.
// 평수마다 따로 보관한다 — 키를 조건명만으로 두면 평수를 바꿔도 겹치는 조건(교통·인프라 등)의
// 등수가 남아버린다. 다른 평수를 고르면 비어 있고, 원래 평수로 돌아오면 입력값이 살아난다.
const rankKey = (cond: string) => `${selectedRealUserBand.value?.id ?? ''}:${cond}`;
/** 입지조건별로 어느 주변시설을 보는지 — 여기 한 줄만 고치면 기준이 바뀐다.
 *  '일자리'만 뺀다 — 출퇴근 거리(수 km)라 반경 조회로 잴 수 있는 값이 아니다. */
const LOCATION_SOURCES: Record<string, Array<keyof NearbyEnvironment>> = {
  교통: ['subway', 'busStop'],
  인프라: ['mart', 'hospital', 'commerce', 'academy'],
  공원: ['park'],
  유치원: ['daycare'],
  초등학교: ['school'],
  학원가: ['academy'],
};
/** 도보 1분 ≈ 80m. 5분 안쪽 1등, 10분 안쪽 2등, 그 밖 3등 */
const WALK_M_PER_MIN = 80;
const rankFromMeters = (m: number) => (m <= WALK_M_PER_MIN * 5 ? 1 : m <= WALK_M_PER_MIN * 10 ? 2 : 3);
/** 그 조건에서 가장 가까운 한 곳까지의 거리 (m). 없으면 0 */
const nearestMeters = (cond: string) => {
  const env = nearbyEnv.value;
  const keys = LOCATION_SOURCES[cond];
  if (!env || !keys) return 0;
  const all = keys.flatMap((k) => env[k] ?? []).map((p) => Number(p.distanceMeters) || 0).filter((m) => m > 0);
  return all.length > 0 ? Math.min(...all) : 0;
};
/** 자동 등수 — 잴 수 없는 조건이거나 1km 안에 없으면 빈 값 */
const autoRankOf = (cond: string) => {
  const m = nearestMeters(cond);
  return m > 0 ? String(rankFromMeters(m)) : '';
};
/** 자동 등수의 근거 — '버스정류장 120m · 도보 2분' */
const autoRankNote = (cond: string) => {
  const m = nearestMeters(cond);
  if (!(m > 0)) return '';
  return `가장 가까운 곳 ${m}m · 도보 ${Math.max(1, Math.round(m / WALK_M_PER_MIN))}분`;
};
const rankOf = (cond: string) => auction.value?.realUserRanks?.[rankKey(cond)] ?? '';
/** 화면·평균에 쓸 등수 — 손으로 적은 값이 있으면 그 값, 없으면 자동 */
const rankValue = (cond: string) => rankOf(cond) || autoRankOf(cond);
/** 손으로 적어 둔 등수가 하나라도 있나 — 되돌릴 게 없으면 단추를 띄우지 않는다 */
const hasTypedRank = computed(() => rankConditions.value.some((c) => !!rankOf(c)));
/** 손으로 적은 등수를 지운다 — 비우면 거리로 매긴 자동값이 다시 선다.
 *  칸을 하나씩 지우는 길은 원래 있었지만, 폰에서 지우기가 까다로워 보이지 않았다. */
const resetRanks = async () => {
  if (!auction.value) return;
  const ranks = auction.value.realUserRanks;
  if (!ranks) return;
  // delete 로 지우면 안 된다 — 저장이 merge 라서 서버에 남은 값이 그대로 돌아온다.
  // 빈 값으로 덮어야 다음에 열었을 때도 자동값이 선다.
  rankConditions.value.forEach((c) => { ranks[rankKey(c)] = ''; });
  await store.saveAuction(auction.value);
  flashToast('자동 등수로 되돌렸습니다.', 'success');
};
const setRank = (cond: string, value: string) => {
  if (!auction.value) return;
  if (!auction.value.realUserRanks) auction.value.realUserRanks = {};
  auction.value.realUserRanks[rankKey(cond)] = value;
  persistSoon();
};
// 입지조건 등수 평균 — 낮을수록 좋은 등수. 입력한 항목만으로 평균을 낸다
const realUserRankSummary = computed(() => {
  const conditions = rankConditions.value;
  const values = conditions
    .map((c) => Number(rankValue(c)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const sum = values.reduce((acc, n) => acc + n, 0);
  return {
    filled: values.length,
    total: conditions.length,
    sum,
    avg: values.length > 0 ? Math.round((sum / values.length) * 10) / 10 : 0,
  };
});

const pickRealUserBand = async (id: string) => {
  bandOpen.value = false;
  if (!auction.value) return;
  // 빈 값이면 '면적 선택'으로 되돌린다
  auction.value.realUserBandId = id;
  await store.saveAuction(auction.value);
};

const caseOpen = ref(false);
const pickRightsCase = async (id: string) => {
  caseOpen.value = false;
  await setRightsCase(id);
};

const setRightsCase = async (id: string) => {
  if (!auction.value) return;
  auction.value.rightsCaseId = id;
  await store.saveAuction(auction.value);
};

// 지난 회차는 결과값으로, 이번 회차는 in_progress, 남은 회차는 pending
// 배지 색만 결정한다 — 문구는 PDF '결과' 칸 표기를 그대로 쓴다
const ROUND_STATUS_TONE: Record<string, string> = {
  진행: 'now', 유찰: 'failed', 매각: 'sold', 낙찰: 'sold',
};
const bidRounds = computed(() => {
  const a = auction.value;
  if (!a) return [] as Array<{ label: string; date: string; price: number; rate: string; status: string; current: boolean }>;
  const rows = (a.auctionHistory ?? []).length > 0
    ? a.auctionHistory
    : [{ round: a.auctionRound || '1차', date: a.eventDate, minPrice: currentMinBid.value, result: '' }];
  const current = pickCurrentRound(rows, a.eventDate);
  const currentIdx = current ? rows.indexOf(current) : -1;
  const base = bidBaseValue.value;
  return rows.map((row, i) => ({
    label: `${row.round || `${i + 1}차`} 최저가`,
    date: row.date,
    price: row.minPrice,
    rate: base > 0 && row.minPrice > 0 ? `${Math.round((row.minPrice / base) * 100)}%` : '',
    // PDF 결과 칸이 비어 있으면 진행 중인 회차는 '진행', 그 뒤는 '예정'
    status: row.result || (i === currentIdx ? '진행' : i > currentIdx ? '예정' : ''),
    current: i === currentIdx,
  }));
});

const roundTone = (status: string) => `st-${ROUND_STATUS_TONE[status] ?? 'plain'}`;

// 차수 배지 — '신건'(비율로 추정한 값) 대신 기일내역상 진행 중인 회차를 쓴다
const currentRoundLabel = computed(() => {
  const a = auction.value;
  if (!a) return '';
  const rows = a.auctionHistory ?? [];
  return pickCurrentRound(rows, a.eventDate)?.round || a.auctionRound || '1차';
});

// PDF는 승계인(HUG)과 원 임차인을 각각 한 줄씩 적는다 — 실제 점유자 이름으로 합쳐 한 명으로 보여준다.
const realTenantName = (row: { name: string; subName: string }) =>
  row.subName.match(/임차인\s*[:：]?\s*([가-힣]{2,4})/)?.[1] ??
  row.subName.match(/([가-힣]{2,4})\s*의\s*승계인/)?.[1] ??
  row.name;

type TenantCard = {
  name: string; agency: string; occupationPeriod: string;
  moveIn: string; fixed: string; distribution: string;
  deposit: string; opposition: string; analysis: string; other: string;
};

// Firestore는 undefined를 null로 저장한다. 예전에 저장된 임차인 행에는 null인 칸이 있을 수 있는데,
// 그대로 .match()/.includes()를 부르면 예외가 나서 임차인현황 카드가 통째로 안 그려진다.
const TENANT_TEXT_KEYS = [
  'name', 'subName', 'occupationPeriod', 'moveIn', 'fixed',
  'distribution', 'deposit', 'opposition', 'analysis', 'other',
] as const;
const normalizeTenantRow = (row: unknown) => {
  const source = (row ?? {}) as Record<string, unknown>;
  const out = {} as Record<(typeof TENANT_TEXT_KEYS)[number], string>;
  TENANT_TEXT_KEYS.forEach((key) => {
    const value = source[key];
    out[key] = typeof value === 'string' ? value : value == null ? '' : String(value);
  });
  return out;
};

const tenantCards = computed(() => {
  const merged = new Map<string, TenantCard>();
  (auction.value?.tenantInfoRows ?? []).map(normalizeTenantRow).forEach((row) => {
    const name = realTenantName(row);
    const agency = row.name === name ? '' : row.name;
    const prev = merged.get(name);
    if (!prev) {
      merged.set(name, { ...row, name, agency });
      return;
    }
    (['occupationPeriod', 'moveIn', 'fixed', 'distribution', 'deposit'] as const).forEach((key) => {
      if (!prev[key] && row[key]) prev[key] = row[key];
    });
    if (!prev.agency && agency) prev.agency = agency;
    // '없음'(대항력 없음)보다 '인수조건변경' 같은 실제 위험 표기를 우선한다
    if ((!prev.opposition || prev.opposition === '없음') && row.opposition && row.opposition !== '없음') {
      prev.opposition = row.opposition;
    }
    const mergeList = (a: string, b: string) =>
      [...new Set([...a.split(', '), ...b.split(', ')].filter(Boolean))].join(', ');
    prev.analysis = mergeList(prev.analysis, row.analysis);
    prev.other = mergeList(prev.other, row.other);
  });
  return [...merged.values()];
});

// 붉은 배너 — PDF 상단 배지를 그대로 인용한다.
// saleClassification = "토지·건물 일괄매각 임차권등기/공시가 1~2억/HUG 임차권 인수조건변경"
// === 정보요약 카드 ===
const editingSummary = ref(false);
const sumVal = (id: string) => auction.value?.basicSummary?.[id] ?? '';
const setSumVal = (id: string, value: string) => {
  if (!auction.value) return;
  if (!auction.value.basicSummary) auction.value.basicSummary = {};
  auction.value.basicSummary[id] = value;
};
const saveSummary = async () => {
  if (!auction.value) return;
  await store.saveAuction(auction.value);
  editingSummary.value = false;
};

/** '66.11 / 20.00' — 단위는 항목 이름에 적고 값에는 숫자만 둔다 */
const areaText = (raw: string) => {
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '-';
  return `${trunc2(n)}㎡ / ${(n / 3.305785).toFixed(2)}평`;
};
// 눈여겨볼 값(전용면적·호실·연차)은 파랗게 따로 뽑아 쓴다
const summaryApprovalDate = computed(() => sumVal('sum.approval') || '-');

// 관할법원 전화 — 다이얼러가 못 알아듣는 글자를 털어 내고 tel: 로 넘긴다
const courtTelDigits = computed(() => (sumVal('sum.courtPhone') || '').replace(/[^0-9+*#,;]/g, ''));
const canCallCourt = computed(() => courtTelDigits.value.replace(/\D/g, '').length >= 7);
const callCourt = () => {
  if (!canCallCourt.value) return;
  window.location.href = `tel:${courtTelDigits.value}`;
};
const summaryApprovalAge = computed(() => {
  const m = sumVal('sum.approval').match(/^(\d{4})/);
  if (!m) return '';
  const years = new Date().getFullYear() - Number(m[1]) + 1;
  return years > 0 ? `${years}년차` : '';
});
const summarySupplyArea = computed(() => areaText(sumVal('sum.supplyArea')));
const summaryExclusiveArea = computed(() => areaText(sumVal('sum.exclusiveArea')));
/** '주거용 전부 / 2021.05.25. ~ 2023.05.24.' — 옛 자료(슬래시 없음)도 같은 모양으로 맞춘다 */
const tenantUsagePeriod = (raw: string) => {
  const text = (raw ?? '').trim();
  if (!text) return '-';
  if (text.includes('/')) return text;
  const m = text.match(/^(.*?)\s*(\d{4}\.\d{1,2}\.\d{1,2}\.?.*)$/);
  return m && m[1].trim() ? `${m[1].trim()} / ${m[2].trim()}` : text;
};
/** 전입·확정·배당을 한 줄로 — 없는 값은 빼고 쉼표로 잇는다 */
const tenantDatesText = (t: { moveIn?: string; fixed?: string; distribution?: string }) =>
  [
    t.moveIn ? `전입: ${t.moveIn}` : '',
    t.fixed ? `확정: ${t.fixed}` : '',
    t.distribution ? `배당: ${t.distribution}` : '',
  ].filter(Boolean).join(', ') || '-';

// 동이 없는 빌라가 많다 — 그럴 때는 '-동'을 적지 않고 호수만 남긴다
const summaryDongText = computed(() => (sumVal('sum.dong') ? `${sumVal('sum.dong')}동` : ''));
const summaryHoText = computed(() => (sumVal('sum.ho') ? `${sumVal('sum.ho')}호` : '-호'));
// 편집 중에도 전환한 단위로 보여 주고, 저장은 항상 ㎡로 되돌린다
const summaryAreaInput = (id: string) => {
  const n = Number(sumVal(id).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n);
};
const setSummaryArea = (id: string, raw: string) => {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) { setSumVal(id, ''); return; }
  setSumVal(id, String(n));
};
// 앞이 해당 물건의 층, 뒤가 그 동의 전체 층수
const summaryFloorPair = computed(() => {
  const total = sumVal('sum.floorTotal');
  const cur = sumVal('sum.floorCurrent');
  if (!total && !cur) return '-';
  return `${cur || '-'}층 / ${total || '-'}층`;
});
// PDF에서 읽을 수 있는 값은 빈 칸일 때만 채운다
watch(
  () => auction.value?.id,
  () => {
    const a = auction.value;
    if (!a) return;
    if (!a.basicSummary) a.basicSummary = {};
    const v = a.basicSummary;
    const fill = (id: string, value: string) => { if (!v[id] && value) v[id] = value; };
    const num = (raw: string | undefined) => (raw ?? '').replace(/[^\d.]/g, '');

    const courtRaw = (a.courtName || '').trim();
    const courtParts = /^(.*?법원)\s*(.*)$/.exec(courtRaw);
    fill('sum.court', courtParts ? courtParts[1] : courtRaw);
    fill('sum.courtDept', a.courtDept || courtParts?.[2] || '');
    fill('sum.courtPhone', a.courtPhone || '');
    fill('sum.far', (a.buildingHeader?.floorAreaRatio ?? '').match(/[\d.]+/)?.[0] ?? '');
    fill('sum.landArea', a.landAreaM2 ? String(a.landAreaM2) : '');
    fill('sum.approval', a.buildingHeader?.approvalDate || a.approvalDate || '');
    // 세대수 — 단지정보 세대수가 우선, 없으면 표제부 '가구/세대/호'의 세대 칸
    const headerHouseholds = (raw: string | undefined) => {
      const parts = (raw ?? '').split('/').map((part) => Number(part.replace(/[^\d]/g, '')) || 0);
      if (parts.length >= 2 && parts[1] > 0) return String(parts[1]);
      const found = parts.find((n) => n > 0);
      return found ? String(found) : '';
    };
    const firstNumOf = (raw: string | undefined) => (raw ?? '').replace(/,/g, '').match(/\d+/)?.[0] ?? '';
    fill(
      'sum.units',
      firstNumOf(a.aptComplexInfo?.households)
        || headerHouseholds(a.buildingHeader?.unitHouseholds)
        || headerHouseholds(a.buildingHeader?.households),
    );
    fill('sum.exclusiveArea', a.buildingAreaM2 ? String(a.buildingAreaM2) : num(a.buildingHeader?.unitExclusiveArea));
    // 공급면적 = 전용 + 공용 (둘 다 읽혔을 때만)
    const ex = Number(num(a.buildingHeader?.unitExclusiveArea)) || Number(a.buildingAreaM2) || 0;
    const common = Number(num(a.buildingHeader?.unitCommonArea)) || 0;
    if (ex > 0 && common > 0) fill('sum.supplyArea', (ex + common).toFixed(2));
    // 전체 층수 — '0층 / 4층'처럼 지하/지상으로 오면 지상 층수를 쓴다
    fill('sum.floorTotal', num((a.buildingHeader?.floors ?? '').split('/').pop() ?? ''));
    // 해당 물건 층 — 전유부 층, 없으면 소재지의 'N층'
    const raw = a.buildingHeader?.unitLocation || a.address || '';
    const floorFromAddr = raw.match(/(\d+)\s*층/);
    fill('sum.floorCurrent', num(a.buildingHeader?.unitFloor) || (floorFromAddr ? floorFromAddr[1] : ''));
    // '101동'·'A동'·'가동'은 잡고 '검암동'·'역삼동' 같은 행정동은 거른다
    // (행정동은 동 앞 글자가 한글이라, 숫자이거나 '앞이 띄어쓰기인 한 글자'일 때만 본다)
    const pickDong = (text: string) =>
      text.match(/제?\s*(\d{1,4}[A-Za-z]?)\s*동(?![가-힣])/)?.[1]
      ?? text.match(/(?:^|[\s,·])([A-Za-z가-힣])\s*동(?![가-힣])/)?.[1]
      ?? '';
    const pickHo = (text: string) => text.match(/제?\s*(\d{1,5})\s*호(?![가-힣])/)?.[1] ?? '';
    // 전유부에 없으면 주소에서 찾는다 (한쪽만 보면 비는 경우가 생긴다)
    const dong = pickDong(a.buildingHeader?.unitLocation ?? '') || pickDong(a.address ?? '');
    const ho = pickHo(a.buildingHeader?.unitLocation ?? '') || pickHo(a.address ?? '');
    if (dong) fill('sum.dong', dong);
    if (ho) fill('sum.ho', ho);
  },
  { immediate: true },
);

// 앞의 매각구분은 상단 요약줄에 이미 있으므로 떼고 배지 부분만 쓴다.
const pdfBadgeNote = computed(() => {
  const raw = auction.value?.saleClassification ?? '';
  return raw.replace(/^\s*토지\s*[·.]?\s*건물\s*일괄매각\s*/, '').trim();
});

// 배지가 없는(옛 파서로 임포트한) 물건용 폴백 — 임차인표 칸을 조합해 만든다
const TENANT_RISK_KEYWORDS = ['미배당 보증금 매수인 인수', '순위배당 있음', '배당금 없음'];
const tenantFlags = computed(() => {
  const rows = tenantCards.value;
  if (rows.length === 0) return [] as string[];
  const isHug =
    rows.some((row) => (row.agency ?? '').includes('주택도시보증공사')) ||
    (auction.value?.creditorName ?? '').includes('주택도시보증공사');
  const hasRegistry = rows.some((row) => (row.other ?? '').includes('임차권등기자'));
  const opposition = rows.map((row) => row.opposition).find((value) => value && value !== '없음') ?? '';

  const flags: string[] = [];
  if (opposition) flags.push(isHug && hasRegistry ? `HUG 임차권 ${opposition}` : opposition);
  if (hasRegistry) flags.push('임차권등기');
  TENANT_RISK_KEYWORDS.forEach((keyword) => {
    if (rows.some((row) => (row.analysis ?? '').includes(keyword))) flags.push(keyword);
  });
  return flags;
});

const tenantWarnText = computed(() => {
  const badge = pdfBadgeNote.value;
  // 배지가 '공시가 1~2억'처럼 가격 구간뿐이면 경고가 아니므로 붉은 배너에 올리지 않는다
  const hasRisk = badge
    .split('/')
    .map((token) => token.trim())
    .some((token) => token && !/^공시가/.test(token));
  return hasRisk ? badge : tenantFlags.value.join(' / ');
});

// 원본 PDF(구글 드라이브) 열기 — 드라이브 뷰어로 바로 띄운다.
// downloadUrl은 Content-Disposition이 attachment라 열면 내려받기가 되므로 /view를 쓴다.
const pdfViewUrl = computed(() => {
  const meta = auction.value?.importMeta;
  if (meta?.pdfFileId) return `https://drive.google.com/file/d/${meta.pdfFileId}/view`;
  return meta?.pdfFolderUrl || '';
});
const pdfViewLabel = computed(() =>
  auction.value?.importMeta?.pdfFileId ? 'PDF' : '드라이브 폴더',
);
const openSourcePdf = async () => {
  const url = pdfViewUrl.value;
  if (!url) return;
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
};

const goBack = () => router.back();
</script>

<template>
  <section class="adp-shell">
    <!-- 상단바 + 탭 + 물건요약은 탭과 무관하게 스크롤해도 붙어 있는다 -->
    <div ref="stickyHead" class="adp-sticky-head">
      <header class="adp-topbar">
        <button class="adp-back" type="button" aria-label="뒤로" @click="goBack">‹</button>
        <h1 class="adp-page-title"><span class="adp-title-tag">경매</span>{{ caseLabel || '물건상세' }}</h1>
        <span class="adp-top-right">
          <button
            v-if="pdfViewUrl"
            type="button"
            class="adp-pdf-btn"
            :title="auction?.importMeta?.pdfFileName || pdfViewLabel"
            @click="openSourcePdf"
          >
            <img :src="fileTextIcon" alt="" />{{ pdfViewLabel }}
          </button>
          <!-- 물건의 '단계' (관심~탈락). 입찰가산정의 '입찰 상태'와는 다른 값이다 -->
          <span class="adp-stage-wrap">
            <button type="button" :class="['adp-stage-btn', { hot: stageLabel === '입찰진행' }]" @click.stop="stageOpen = !stageOpen">
              {{ stageLabel }}<img :src="chevronDownIcon" :class="['adp-chev sm', { up: !stageOpen }]" alt="" />
            </button>
            <template v-if="stageOpen">
              <div class="adp-stage-backdrop" @click="stageOpen = false" />
              <ul class="adp-stage-list" @click.stop>
                <li
                  v-for="opt in stageOptions"
                  :key="opt.key"
                  :class="['adp-stage-opt', { on: stageIsOn(opt.key), hot: opt.key === STAGE_BID_RUNNING }]"
                  @click="pickStage(opt.key)"
                >{{ opt.label }}</li>
              </ul>
            </template>
          </span>
          <button type="button" class="adp-hide-btn" aria-label="목록에서 숨기기" title="목록에서 숨기기" @click="hideThisAuction">
            <img :src="TRASH_ICON" alt="" class="adp-hide-ico" />
          </button>
        </span>
      </header>

      <nav class="adp-tabs">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          :class="['adp-tab', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </nav>

      <div class="adp-prop-head">
        <span class="adp-prop-kind">{{ propTypeLabel }}</span>
        <button
          type="button"
          class="adp-star-btn adp-prop-star"
          :aria-label="`중요도 ${priority}`"
          title="중요도 (1→2→3)"
          @click.stop="cyclePriority"
        >
          <svg
            v-for="n in 3"
            :key="n"
            viewBox="0 0 24 24"
            width="15"
            height="15"
            :fill="priority >= n ? '#facc15' : 'none'"
            :stroke="priority >= n ? '#eab308' : '#a8adb8'"
            stroke-width="2"
            stroke-linejoin="round"
          >
            <polygon points="12 2.6 15 9 22 9.8 17 14.5 18.3 21.4 12 18 5.7 21.4 7 14.5 2 9.8 9 9" />
          </svg>
        </button>
        <span class="adp-prop-line">
          <!-- 면적·연식을 매각구분과 한 줄로 이어 모든 탭에서 보여 준다.
               폭이 모자라면 뒤(매각구분)부터 말줄임된다 — 계속 참조하는 면적·연식이 남는다 -->
          <span class="adp-prop-sale">
            {{ saleKind }}<template v-if="headMetaLine"> · {{ headMetaLine }}</template>
          </span>
        </span>
        <button
          type="button"
          class="adp-prop-copy"
          aria-label="주소 복사"
          title="지번주소 복사"
          @click="copyText(jibunAddress)"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="8" width="13" height="13" rx="2" />
            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
          </svg>주소
        </button>
        <p class="adp-prop-addr">{{ headAddress }}</p>
        <button
          type="button"
          class="adp-fold-all"
          :aria-label="allCollapsed ? '전체 펼치기' : '전체 접기'"
          :title="allCollapsed ? '전체 펼치기' : '전체 접기'"
          @click="toggleAllSections"
        >
          <img :src="chevronDownIcon" :class="['adp-chev', { up: allCollapsed }]" alt="" />
        </button>
      </div>
    </div>

    <div class="adp-body">
      <template v-if="activeTab === 'basic'">
        <!-- 정보요약 — PDF 값으로 채우고 필요한 칸은 직접 고친다 -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head" @click="toggleSection('summary')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>정보요약</h2>
            <button v-if="!editingSummary" class="adp-edit-btn" type="button" @click.stop="editingSummary = true"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click.stop="saveSummary">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('summary') }]" alt="" />
          </header>
          <dl v-if="!isCollapsed('summary')" class="adp-base-rows adp-sum-rows">
            <div class="adp-base-row">
              <dt>관할법원</dt>
              <dd>
                <template v-if="editingSummary">
                  <input class="adp-sum-input" :value="sumVal('sum.court')" placeholder="법원명" @input="setSumVal('sum.court', ($event.target as HTMLInputElement).value)" />
                  <input class="adp-sum-input dept" :value="sumVal('sum.courtDept')" placeholder="경매○계" @input="setSumVal('sum.courtDept', ($event.target as HTMLInputElement).value)" />
                  <input class="adp-sum-input tel" :value="sumVal('sum.courtPhone')" placeholder="연락처입력" @input="setSumVal('sum.courtPhone', ($event.target as HTMLInputElement).value)" />
                </template>
                <template v-else>
                  {{ sumVal('sum.court') || '-' }}<span v-if="sumVal('sum.courtDept')" class="adp-sum-dept">{{ sumVal('sum.courtDept') }}</span><a
                    v-if="sumVal('sum.courtPhone')"
                    :href="canCallCourt ? `tel:${courtTelDigits}` : undefined"
                    class="adp-tel"
                    :title="canCallCourt ? '전화 걸기' : ''"
                    @click.prevent="callCourt"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                    </svg>{{ sumVal('sum.courtPhone') }}</a>
                </template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>사용승인</dt>
              <dd>
                <input v-if="editingSummary" class="adp-sum-input wide" :value="sumVal('sum.approval')" placeholder="YYYY-MM-DD" @input="setSumVal('sum.approval', ($event.target as HTMLInputElement).value)" />
                <template v-else><span class="adp-sum-hi">{{ summaryApprovalDate }}<template v-if="summaryApprovalAge"> / {{ summaryApprovalAge }}</template></span></template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>공급/전용면적(㎡/평)</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="decimal" :value="summaryAreaInput('sum.supplyArea')" placeholder="공급" @input="setSummaryArea('sum.supplyArea', ($event.target as HTMLInputElement).value)" />/
                  <input class="adp-sum-input" inputmode="decimal" :value="summaryAreaInput('sum.exclusiveArea')" placeholder="전용" @input="setSummaryArea('sum.exclusiveArea', ($event.target as HTMLInputElement).value)" />㎡
                </span>
                <template v-else>{{ summarySupplyArea }} / <span class="adp-sum-hi">{{ summaryExclusiveArea }}</span></template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>대지면적(㎡/평)</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input wide" inputmode="decimal" :value="summaryAreaInput('sum.landArea')" placeholder="0" @input="setSummaryArea('sum.landArea', ($event.target as HTMLInputElement).value)" />㎡
                </span>
                <template v-else>{{ areaText(sumVal('sum.landArea')) }}</template>
              </dd>
            </div>
            <!-- 주소에 건물명이 없는 물건만 — 손으로 적어 두면 상단 주소에 같이 선다.
                 주소에 이미 이름이 있으면 적을 일이 없어 줄을 내지 않는다 -->
            <div v-if="!addrHasBuildingName" class="adp-base-row">
              <dt>건물명</dt>
              <dd>
                <input v-if="editingSummary" class="adp-sum-input wide" :value="sumVal('sum.buildingName')" placeholder="빌라명 입력" @input="setSumVal('sum.buildingName', ($event.target as HTMLInputElement).value)" />
                <template v-else>{{ sumVal('sum.buildingName') || '-' }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>동/호</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.dong')" placeholder="동" @input="setSumVal('sum.dong', ($event.target as HTMLInputElement).value)" />동 /
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.ho')" placeholder="호" @input="setSumVal('sum.ho', ($event.target as HTMLInputElement).value)" />호
                </span>
                <template v-else><template v-if="summaryDongText">{{ summaryDongText }} / </template><span class="adp-sum-hi">{{ summaryHoText }}</span></template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>층</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.floorCurrent')" placeholder="해당" @input="setSumVal('sum.floorCurrent', ($event.target as HTMLInputElement).value)" />층 /
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.floorTotal')" placeholder="전체" @input="setSumVal('sum.floorTotal', ($event.target as HTMLInputElement).value)" />층
                </span>
                <template v-else>{{ summaryFloorPair }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>용적률</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="decimal" :value="sumVal('sum.far')" placeholder="0" @input="setSumVal('sum.far', ($event.target as HTMLInputElement).value)" />%
                </span>
                <template v-else>{{ sumVal('sum.far') ? `${sumVal('sum.far')}%` : '-' }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>세대수</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.units')" placeholder="0" @input="setSumVal('sum.units', ($event.target as HTMLInputElement).value)" />세대
                </span>
                <template v-else>{{ sumVal('sum.units') ? `${Number(sumVal('sum.units')).toLocaleString('ko-KR')}세대` : '-' }}</template>
              </dd>
            </div>
            <!-- 해당면적 세대수는 같은 평형이 여러 세대인 아파트에서만 쓴다 -->
            <div v-if="isApartment" class="adp-base-row">
              <dt>해당면적 세대수</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.areaUnits')" placeholder="0" @input="setSumVal('sum.areaUnits', ($event.target as HTMLInputElement).value)" />세대
                </span>
                <template v-else>{{ sumVal('sum.areaUnits') ? `${Number(sumVal('sum.areaUnits')).toLocaleString('ko-KR')}세대` : '-' }}</template>
              </dd>
            </div>
          </dl>
        </section>

        <!-- 물건 기본정보 — 입찰일정 + 임차인현황 통합 카드 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('base')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>기본정보</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('base') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('base')">
          <dl class="adp-base-rows">
            <div class="adp-base-row"><dt>소유자</dt><dd>{{ auction?.ownerName || '-' }}</dd></div>
            <div class="adp-base-row"><dt>채무자</dt><dd>{{ auction?.debtorName || '-' }}</dd></div>
            <div class="adp-base-row"><dt>채권자</dt><dd>{{ auction?.creditorName || '-' }}</dd></div>
            <div class="adp-base-row"><dt>차수</dt><dd><span class="adp-base-round">{{ currentRoundLabel }}</span></dd></div>
          </dl>

          <dl class="adp-base-rows">
            <div class="adp-base-row">
              <dt>감정가</dt>
              <dd class="amt">{{ formatMoney(bidBaseValue) }}원</dd>
            </div>
            <div v-for="row in bidRounds" :key="row.label + row.date" class="adp-base-row round">
              <dt class="adp-base-round-dt">
                <span>{{ row.label }}</span>
                <span v-if="row.rate" class="adp-base-chip pct">{{ row.rate }}</span>
                <span v-if="row.status" :class="['adp-base-chip', roundTone(row.status)]">{{ row.status }}</span>
                <span v-if="row.date" :class="['adp-base-date', { now: roundTone(row.status) === 'st-now' }]">{{ row.date }}</span>
              </dt>
              <dd :class="['amt', { now: row.current }]">{{ formatMoney(row.price) }}원</dd>
            </div>
            <div class="adp-base-row">
              <dt>보증금 (10%)</dt>
              <dd class="amt deposit">{{ formatMoney(depositAmount) }}원</dd>
            </div>
          </dl>

          </div>
        </section>

        <!-- 입지정보 — 인근역세권·교육환경·주변환경을 한 카드로 묶는다 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('areaInfo')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>입지정보</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('areaInfo') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('areaInfo')">
            <!-- 전체 / 500m 이내 전환 -->
            <div class="adp-trade-view-tabs">
              <button type="button" :class="['adp-trade-view-tab', { active: areaView === 'all' }]" @click="areaView = 'all'">
                전체
              </button>
              <button type="button" :class="['adp-trade-view-tab', { active: areaView === 'near' }]" @click="areaView = 'near'">
                500M 미만
              </button>
            </div>
            <div v-if="areaView === 'near'">
              <div class="adp-area-block">
                <div class="adp-area-head">
                  <h3>인근역세권</h3>
                </div>
                <table class="adp-table adp-kv-table">
                  <colgroup><col style="width: 96px" /><col /></colgroup>
                  <tbody>
                    <tr>
                      <th>지하철({{ stationItems500m.length }})</th>
                      <td class="adp-list-grid wrap2">
                        <a v-for="(p, i) in stationItems500m" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(p.name, $event)">{{ p.name }}({{ p.distance }})</a>
                        <span v-if="stationItems500m.length === 0" class="adp-na">-</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="adp-area-block">
                <div class="adp-area-head">
                  <h3>교육환경</h3>
                </div>
                <table class="adp-table adp-kv-table">
                  <colgroup><col style="width: 96px" /><col /></colgroup>
                  <tbody>
                    <tr>
                      <th>초등학교({{ eduInfoFiltered500m.elementary.length }})</th>
                      <td class="adp-list-grid">
                        <a v-for="(s2, i) in eduInfoFiltered500m.elementary" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(s2, $event)">{{ s2 }}</a>
                        <span v-if="eduInfoFiltered500m.elementary.length === 0" class="adp-na">-</span>
                      </td>
                    </tr>
                    <tr>
                      <th>중학교({{ eduInfoFiltered500m.middle.length }})</th>
                      <td class="adp-list-grid">
                        <a v-for="(s2, i) in eduInfoFiltered500m.middle" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(s2, $event)">{{ s2 }}</a>
                        <span v-if="eduInfoFiltered500m.middle.length === 0" class="adp-na">-</span>
                      </td>
                    </tr>
                    <tr>
                      <th>고등학교({{ eduInfoFiltered500m.high.length }})</th>
                      <td class="adp-list-grid">
                        <a v-for="(s2, i) in eduInfoFiltered500m.high" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(s2, $event)">{{ s2 }}</a>
                        <span v-if="eduInfoFiltered500m.high.length === 0" class="adp-na">-</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="adp-area-block">
                <div class="adp-area-head">
                  <h3>주변환경</h3>
                </div>
                <table v-if="pdfNearbyFiltered500m.length > 0" class="adp-table adp-kv-table">
                  <colgroup><col style="width: 96px" /><col /></colgroup>
                  <tbody>
                    <tr v-for="g in pdfNearbyFiltered500m" :key="g.label">
                      <th>{{ g.label }}({{ g.total }})</th>
                      <td class="adp-list-grid wrap2">
                        <a v-for="(p, i) in g.items" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(p.name, $event)">{{ p.name }}({{ p.distance }})</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-else-if="fetchingNearby" class="adp-empty">카카오 지도에서 조회 중…</p>
                <p v-else class="adp-empty">
                  500m 이내 주변환경 정보 없음
                  <button type="button" class="adp-loc2-fetch" @click="openKakaoNearby(true)">카카오 지도에서 불러오기</button>
                </p>
              </div>
            </div>
            <template v-else>
        <div class="adp-area-block">
          <div class="adp-area-head">
            <h3>인근역세권</h3>
          </div>
          <table class="adp-table adp-kv-table">
            <colgroup>
              <col style="width: 96px" />
              <col />
            </colgroup>
            <tbody><tr><th>인근역</th><td class="wrap"><a v-if="nearStation" href="#" class="adp-place-link" @click="openNaverDirections(nearStation, $event)">{{ nearStation }}</a><span v-else class="adp-na">-</span></td></tr></tbody>
          </table>
        </div>

        <div class="adp-area-block">
          <div class="adp-area-head">
            <h3>교육환경</h3>
          </div>
          <table class="adp-table adp-kv-table">
            <colgroup>
              <col style="width: 96px" />
              <col />
            </colgroup>
            <tbody>
              <tr><th>초등학교({{ eduInfo.elementary.length }})</th><td class="adp-list-grid"><a v-for="(s, i) in eduInfo.elementary" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(s, $event)">{{ s }}</a><span v-if="eduInfo.elementary.length === 0" class="adp-na">-</span></td></tr>
              <tr><th>중학교({{ eduInfo.middle.length }})</th><td class="adp-list-grid"><a v-for="(s, i) in eduInfo.middle" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(s, $event)">{{ s }}</a><span v-if="eduInfo.middle.length === 0" class="adp-na">-</span></td></tr>
              <tr><th>고등학교({{ eduInfo.high.length }})</th><td class="adp-list-grid"><a v-for="(s, i) in eduInfo.high" :key="i" href="#" class="adp-place-link" @click="openNaverDirections(s, $event)">{{ s }}</a><span v-if="eduInfo.high.length === 0" class="adp-na">-</span></td></tr>
            </tbody>
          </table>
        </div>

        <div class="adp-area-block">
          <div class="adp-area-head">
            <h3>주변환경</h3>
          </div>
          <div>
            <div class="adp-trade-view-tabs">
              <button :class="['adp-trade-view-tab', { active: nearbyView === 'pdf' }]" @click.stop="nearbyView = 'pdf'">
                PDF 주변환경
              </button>
              <button :class="['adp-trade-view-tab nearby-kakao-tab', { active: nearbyView === 'kakao' }]" @click.stop="openKakaoNearby()">
                <span class="adp-tab-dot" /> 카카오 지도 검색
                <span
                  class="adp-kakao-mini"
                  :class="{ active: nearbyView === 'kakao' && nearbyEnv }"
                  :title="'카카오 지도에서 검색'"
                  @click.stop="onKakaoSearchClick"
                >K</span>
              </button>
            </div>

            <table v-if="nearbyView === 'pdf' && pdfNearbyDisplay.length > 0" class="adp-table adp-kv-table">
              <colgroup>
                <col style="width: 96px" />
                <col />
              </colgroup>
              <tbody>
                <tr v-for="g in pdfNearbyDisplay" :key="g.label">
                  <th>{{ g.label }}({{ g.total }})</th>
                  <td class="adp-list-grid wrap2">
                    <a
                      v-for="(p, i) in g.items"
                      :key="i"
                      href="#"
                      class="adp-place-link"
                      @click="openNaverDirections(p.name, $event)"
                    >{{ p.name }}({{ p.distance }})</a>
                    <span v-if="g.items.length === 0" class="adp-na">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <ul v-if="nearbyView === 'pdf' && agencyItems.length > 0" class="adp-agency-list">
              <li v-for="(ag, i) in agencyItems" :key="i" class="adp-agency-item">
                <p class="adp-agency-name">
                  <a href="#" class="adp-place-link" @click="openNaverDirections(ag.name, $event)"><strong>{{ ag.name }}</strong></a>
                  <span v-if="ag.type" class="adp-agency-type">({{ ag.type }})</span>
                </p>
                <p v-if="ag.address" class="adp-agency-line">
                  <span v-if="ag.zip" class="adp-agency-zip">[{{ ag.zip }}]</span> {{ ag.address }}
                </p>
                <p v-if="ag.phone || ag.fax" class="adp-agency-line">
                  <a v-if="ag.phone" :href="`tel:${ag.phone.replace(/[^\d+]/g, '')}`" class="adp-agency-phone">전화: {{ ag.phone }}</a>
                  <span v-if="ag.phone && ag.fax"> / </span>
                  <span v-if="ag.fax">팩스: {{ ag.fax }}</span>
                </p>
                <p v-if="ag.area" class="adp-agency-area">관할구역 : {{ ag.area }}</p>
              </li>
            </ul>
            <p
              v-if="nearbyView === 'pdf' && pdfNearbyDisplay.length === 0 && agencyItems.length === 0"
              class="adp-empty"
            >PDF 주변환경 정보 없음</p>

            <template v-if="nearbyView === 'kakao'">
              <p v-if="fetchingNearby" class="adp-sub-note">카카오 지도에서 조회 중…</p>
              <p v-else-if="!nearbyEnv" class="adp-empty">카카오 지도 검색 결과를 불러오지 못했습니다. K 아이콘으로 다시 시도해 주세요.</p>
              <table v-if="nearbyDisplay.length > 0" class="adp-table adp-kv-table">
                <colgroup>
                  <col style="width: 96px" />
                  <col />
                </colgroup>
                <tbody>
                  <tr v-for="g in nearbyDisplay" :key="g.label">
                    <th>{{ g.label }}({{ g.total }})</th>
                    <td class="adp-list-grid wrap2">
                      <a
                        v-for="(p, i) in g.items"
                        :key="i"
                        :href="naverMapUrl(p.name)"
                        target="_blank"
                        rel="noopener"
                        class="adp-place-link"
                      >{{ p.name }}({{ p.distance }})</a>
                      <span v-if="g.items.length === 0" class="adp-na">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else-if="!fetchingNearby" class="adp-empty">카카오 검색 결과 없음</p>
            </template>
          </div>
        </div>
            </template>
          </div>
        </section>

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('bld')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M9 7h2M9 11h2M9 15h2M3 21h18M16 10h3a2 2 0 0 1 2 2v9"/></svg>건축물정보</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('bld') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('bld')">
            <!-- 표제부 — landAreaTotal/buildingAreaTotal/totalFloorArea 중 하나라도 있으면 표시 -->
            <template v-if="auction?.buildingHeader?.landAreaTotal || auction?.buildingHeader?.buildingAreaTotal || auction?.buildingHeader?.totalFloorArea">
              <div class="adp-subtab-row">
                <button class="adp-subtab dark active" type="button">표제부</button>
              </div>
              <table class="adp-table adp-kv-table">
                <colgroup>
                  <col style="width: 70px" />
                  <col />
                  <col style="width: 70px" />
                  <col />
                </colgroup>
                <tbody>
                  <tr><th>위치</th><td colspan="3">{{ auction?.buildingHeader?.locationDetail || fullAddress }}</td></tr>
                  <tr><th>가구</th><td>{{ auction?.buildingHeader?.households || '-' }}</td><th>전용</th><td>{{ auction?.buildingAreaM2 || 0 }}㎡ ({{ auction?.buildingAreaPyeong || 0 }}평)</td></tr>
                  <tr><th>대지</th><td>{{ auction?.buildingHeader?.landAreaTotal || '-' }}</td><th>건폐율</th><td>{{ auction?.buildingHeader?.buildingCoverage || '-' }}</td></tr>
                  <tr><th>건축</th><td>{{ auction?.buildingHeader?.buildingAreaTotal || '-' }}</td><th>용적률</th><td>{{ auction?.buildingHeader?.floorAreaRatio || '-' }}</td></tr>
                  <tr><th>연면적</th><td>{{ auction?.buildingHeader?.totalFloorArea || '-' }}</td><th>주용도</th><td>{{ auction?.buildingHeader?.mainUse || auction?.propertyType || '-' }}</td></tr>
                  <tr><th>허가일</th><td>{{ auction?.buildingHeader?.permitDate || '-' }}</td><th>착공일</th><td>{{ auction?.buildingHeader?.startDate || '-' }}</td></tr>
                  <tr><th>층수</th><td>{{ auction?.buildingHeader?.floors || '-' }}</td><th>승강기</th><td>{{ auction?.buildingHeader?.elevator || '-' }}</td></tr>
                  <tr><th>사용승인</th><td>{{ auction?.buildingHeader?.approvalDate || auction?.approvalDate || '-' }}</td><th>주차</th><td>{{ auction?.buildingHeader?.parking || '-' }}</td></tr>
                  <tr><th>구조</th><td colspan="3">{{ auction?.structureType || '-' }}</td></tr>
                </tbody>
              </table>
            </template>

            <!-- 전유부 — 호별 정보 (unitExclusiveArea 또는 unitLocation이 있을 때 표시) -->
            <template v-if="auction?.buildingHeader?.unitExclusiveArea || auction?.buildingHeader?.unitLocation">
              <div class="adp-subtab-row">
                <button class="adp-subtab dark active" type="button">전유부</button>
              </div>
              <table class="adp-table adp-kv-table">
                <colgroup>
                  <col style="width: 86px" />
                  <col />
                  <col style="width: 86px" />
                  <col />
                </colgroup>
                <tbody>
                  <tr><th>소재지</th><td colspan="3">{{ auction?.buildingHeader?.unitLocation || fullAddress }}</td></tr>
                  <tr v-if="auction?.buildingHeader?.unitHouseholds || auction?.buildingHeader?.households">
                    <th>총 가구/세대/호</th><td>{{ auction?.buildingHeader?.unitHouseholds || auction?.buildingHeader?.households || '-' }}</td>
                    <th>주용도</th><td>{{ auction?.buildingHeader?.mainUse || auction?.propertyType || '-' }}</td>
                  </tr>
                  <tr>
                    <th>전용면적</th><td>{{ auction?.buildingHeader?.unitExclusiveArea || (auction?.buildingAreaM2 ? `${auction.buildingAreaM2}㎡ (${auction.buildingAreaPyeong}평)` : '-') }}</td>
                    <th>공용면적</th><td>{{ auction?.buildingHeader?.unitCommonArea || '-' }}</td>
                  </tr>
                  <tr>
                    <th>층</th><td>{{ auction?.buildingHeader?.unitFloor || '-' }}</td>
                    <th>층수(지하/지상)</th><td>{{ auction?.buildingHeader?.floors || '-' }}</td>
                  </tr>
                  <tr>
                    <th>사용승인일자</th><td>{{ auction?.buildingHeader?.approvalDate || auction?.approvalDate || '-' }}</td>
                    <th>승강기(비상/승용)</th><td>{{ auction?.buildingHeader?.elevator || '-' }}</td>
                  </tr>
                  <tr>
                    <th>구조</th><td>{{ auction?.buildingHeader?.unitStructure || auction?.structureType || '-' }}</td>
                    <th>총 주차수</th><td>{{ auction?.buildingHeader?.unitTotalParking || auction?.buildingHeader?.parking || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 표제부도 전유부도 못 가져온 경우 — 가지고 있는 정보만이라도 표시 -->
            <table v-if="!(auction?.buildingHeader?.landAreaTotal || auction?.buildingHeader?.buildingAreaTotal || auction?.buildingHeader?.totalFloorArea) && !(auction?.buildingHeader?.unitExclusiveArea || auction?.buildingHeader?.unitLocation)" class="adp-table adp-kv-table">
              <colgroup>
                <col style="width: 70px" />
                <col />
                <col style="width: 70px" />
                <col />
              </colgroup>
              <tbody>
                <tr><th>위치</th><td colspan="3">{{ fullAddress }}</td></tr>
                <tr><th>전용면적</th><td>{{ auction?.buildingAreaM2 || 0 }}㎡ ({{ auction?.buildingAreaPyeong || 0 }}평)</td><th>사용승인</th><td>{{ auction?.approvalDate || '-' }}</td></tr>
                <tr><th>구조</th><td colspan="3">{{ auction?.structureType || '-' }}</td></tr>
              </tbody>
            </table>

            <table v-if="(auction?.buildingHeader?.exclusiveFloorRows ?? []).length > 0" class="adp-table adp-floor-table">
              <thead><tr><th>층</th><th>면적</th><th>구조</th><th>주용도</th><th>기타용도</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in auction?.buildingHeader?.exclusiveFloorRows ?? []" :key="i">
                  <td>{{ r.floor }}</td><td>{{ r.area }}</td><td>{{ r.structure }}</td><td>{{ r.mainUse }}</td><td>{{ r.otherUse }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('status')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 2h6v4H9zM9 12h6M9 16h4"/></svg>물건현황</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('status') }]" alt="" />
          </header>
          <table v-if="!isCollapsed('status')" class="adp-table adp-kv-table">
            <colgroup>
              <col style="width: 70px" />
              <col />
            </colgroup>
            <tbody>
              <tr><th rowspan="2">공시가격</th><td>{{ fullAddress }}</td></tr>
              <tr>
                <td v-if="auction?.officialPriceValue">공동주택공시가 : {{ formatMoney(auction?.officialPriceValue) }}원</td>
                <td v-else-if="auction?.officialPriceBand">공시가 구간 : {{ auction.officialPriceBand }} <span class="adp-na">(PDF에 공시가격 금액 없음)</span></td>
                <td v-else class="adp-na">공시가격 정보 없음</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="isApartment && auction?.aptComplexInfo" class="adp-card">
          <header class="adp-card-head" @click="toggleSection('apt')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M10 21v-5h4v5"/></svg>단지정보</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('apt') }]" alt="" />
          </header>
          <table v-if="!isCollapsed('apt')" class="adp-table adp-kv-table">
            <colgroup>
              <col style="width: 70px" />
              <col />
              <col style="width: 70px" />
              <col />
            </colgroup>
            <tbody>
              <tr><th>단지명</th><td colspan="3">{{ auction.aptComplexInfo.name || '-' }}</td></tr>
              <tr><th>세대수</th><td>{{ auction.aptComplexInfo.households || '-' }}</td><th>동 수</th><td>{{ auction.aptComplexInfo.buildings || '-' }}</td></tr>
              <tr><th>사용승인일</th><td>{{ auction.aptComplexInfo.approvalDate || '-' }}</td><th>시공사</th><td>{{ auction.aptComplexInfo.contractor || '-' }}</td></tr>
              <tr><th>주차 수</th><td>{{ auction.aptComplexInfo.parkingTotal || '-' }}</td><th>세대당 주차</th><td>{{ auction.aptComplexInfo.parkingPerHouse || '-' }}</td></tr>
              <tr><th>난방 방식</th><td>{{ auction.aptComplexInfo.heatingType || '-' }}</td><th>난방 연료</th><td>{{ auction.aptComplexInfo.heatingFuel || '-' }}</td></tr>
              <tr><th>용적률</th><td>{{ auction.aptComplexInfo.floorRatio || '-' }}</td><th>건폐율</th><td>{{ auction.aptComplexInfo.buildingCoverage || '-' }}</td></tr>
              <tr><th>최고층</th><td>{{ auction.aptComplexInfo.topFloor || '-' }}</td><th>최저층</th><td>{{ auction.aptComplexInfo.bottomFloor || '-' }}</td></tr>
              <tr><th>관리소</th><td colspan="3"><a v-if="auction.aptComplexInfo.managementPhone" :href="`tel:${auction.aptComplexInfo.managementPhone.replace(/[^\d+]/g, '')}`" class="adp-agency-phone">{{ auction.aptComplexInfo.managementPhone }}</a><span v-else>-</span></td></tr>
              <tr v-if="auction.aptComplexInfo.facilities"><th>편의시설</th><td colspan="3" class="wrap">{{ auction.aptComplexInfo.facilities }}</td></tr>
              <tr v-if="auction.aptComplexInfo.schools"><th>교육시설</th><td colspan="3" class="wrap">{{ auction.aptComplexInfo.schools }}</td></tr>
              <tr v-if="auction.aptComplexInfo.restPark"><th>휴식/공원</th><td colspan="3" class="wrap">{{ auction.aptComplexInfo.restPark }}</td></tr>
              <tr v-if="auction.aptComplexInfo.areaTypes"><th>면적 종류</th><td colspan="3" class="wrap">{{ auction.aptComplexInfo.areaTypes }}</td></tr>
              <tr v-if="auction.aptComplexInfo.evCharger"><th>전기차충전소</th><td colspan="3" class="wrap">{{ auction.aptComplexInfo.evCharger }}</td></tr>
            </tbody>
          </table>
        </section>

        <section v-if="isApartment && auction?.arrearsInfo" class="adp-card">
          <header class="adp-card-head" @click="toggleSection('arrears')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/></svg>체납내역</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('arrears') }]" alt="" />
          </header>
          <table v-if="!isCollapsed('arrears')" class="adp-table adp-kv-table">
            <colgroup>
              <col style="width: 70px" />
              <col />
              <col style="width: 70px" />
              <col />
            </colgroup>
            <tbody>
              <tr><th>조사일</th><td>{{ auction.arrearsInfo.surveyDate || '-' }}</td><th>체납금액</th><td>{{ auction.arrearsInfo.amount || '-' }}</td></tr>
              <tr v-if="auction.arrearsInfo.note"><th>비고</th><td colspan="3" class="wrap">{{ auction.arrearsInfo.note }}</td></tr>
            </tbody>
          </table>
        </section>
      </template>

      <template v-if="activeTab === 'profit' && auction">
        <section class="adp-card">
          <!-- 제목과 날짜 줄은 화면에 붙여 둔다 — 표를 한참 내려 보다가도
               어느 안(A·B)을 보고 있는지, 진행상황이 무엇인지 늘 보여야 한다 -->
          <div class="adp-profit-sticky">
          <header class="adp-card-head adp-profit-head" @click="toggleSection('profit')">
            <h2>
              <svg class="adp-profit-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 17 9.5 10.5l4 4L21 7" /><path d="M15 7h6v6" />
              </svg>
              예상수익분석
            </h2>
            <span class="adp-auto-chip">✦ 자동계산</span>
            <span class="adp-head-note">개인 매매 사업자 기준</span>
            <button v-if="!editingProfit" class="adp-edit-btn" type="button" @click.stop="startEditProfit"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click.stop="saveProfit">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('profit') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('profit')" class="adp-profit-dates">
            <button type="button" class="adp-pd-item" @click="profitDateTarget = 'wonDate'">
              <em>낙찰</em>
              <span class="adp-pd-box"><svg class="adp-pd-cal" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg><span>{{ auction.wonDate || '날짜입력' }}</span></span>
            </button>
            <button type="button" class="adp-pd-item" @click="profitDateTarget = 'sellDate'">
              <em>매도</em>
              <span class="adp-pd-box"><svg class="adp-pd-cal" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg><span>{{ auction.sellDate || '날짜입력' }}</span></span>
            </button>
            <!-- 표 스텝퍼와 별은 한 묶음 — 자리가 모자라 줄이 내려가도 둘이 같이 내려간다 -->
            <span class="adp-pd-tail">
            <!-- 진행상황 — 단계와 상관없이 '대기/입찰'만 표시한다 -->
            <select
              :class="['adp-bid-status', bidProgress === '진행' ? 'hot' : 'calm']"
              :value="bidProgress"
              aria-label="입찰 진행상황"
              @click.stop
              @change="setBidProgress(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in BID_PROGRESS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <span class="adp-mkt-step">
              <span class="lab">표</span>
              <button type="button" aria-label="산정표 삭제" :disabled="profitScenarios.length <= 1" @click.stop="removeProfitScenario">−</button>
              <button type="button" aria-label="산정표 추가" :disabled="profitScenarios.length >= PROFIT_MAX" @click.stop="addProfitScenario">＋</button>
            </span>
            </span>
          </div>
          </div>
          <!-- 산정표 — A안·B안… 생김새가 같아 한 벌만 그리고 값만 갈아 끼운다 -->
          <template v-for="(sc, si) in profitScenarios" :key="sc.label">
          <div v-if="!isCollapsed('profit')" class="adp-profit-head-row">
            <span v-if="profitScenarios.length > 1" class="adp-profit-label">{{ sc.label }}</span>
            <button type="button" class="adp-pd-reset" title="이 표의 대출·취득세·법무비 비중을 기본값으로" @click.stop="resetScenarioRates(sc)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v5h5" />
              </svg>초기화
            </button>
          </div>
          <table v-if="!isCollapsed('profit')" :class="['adp-table', 'adp-profit-table', 'v2', { alt: si > 0 }]">
            <thead>
              <tr><th>구분</th><th>상세</th><th class="r">비중 (%)</th><th class="r">금액</th></tr>
            </thead>
            <tbody>
              <tr>
                <td rowspan="3" class="adp-cat">입찰정보</td>
                <td>감정가</td>
                <td class="r"></td>
                <td class="r">{{ formatMoney(apprValue) }}</td>
              </tr>
              <tr>
                <td>{{ auction.auctionRound ? `${auction.auctionRound}(최저가)` : '최저가' }}</td>
                <td class="r">{{ apprValue > 0 ? formatPct((auction.metrics.minimumBidValue / apprValue) * 100) : '' }}</td>
                <td class="r">{{ formatMoney(auction.metrics.minimumBidValue) }}</td>
              </tr>
              <tr>
                <td>보증금</td>
                <td class="r blue">10%</td>
                <td class="r blue">{{ formatMoney(bidDeposit) }}</td>
              </tr>
              <tr class="hi">
                <td rowspan="2" class="adp-cat"></td>
                <td><strong>입찰가</strong></td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scBidPct(sc).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetBidByApprPct(sc, ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scBidPct(sc)) }}</template>
                </td>
                <td class="r emph">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.bid.myBidValue" class="adp-cell-input" live-group /><template v-else><strong>{{ formatMoney(scBid(sc)) }}</strong></template>
                </td>
              </tr>
              <tr>
                <td>대출(사업자)</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scPctOfBid(sc, sc.cost.loanAmount).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetAmountByPct(sc, 'loanAmount', ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scPctOfBid(sc, sc.cost.loanAmount)) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.loanAmount" class="adp-cell-input" live-group /><template v-else>{{ formatMoney(sc.cost.loanAmount) }}</template>
                </td>
              </tr>

              <tr>
                <td rowspan="10" class="adp-cat">비용</td>
                <td><span class="adp-cost-no">①</span>취득세</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scPctOfBid(sc, sc.cost.acquisitionTaxAmount).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetAmountByPct(sc, 'acquisitionTaxAmount', ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scPctOfBid(sc, sc.cost.acquisitionTaxAmount)) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.acquisitionTaxAmount" class="adp-cell-input" live-group @update:model-value="scSyncAcqRate(sc)" /><template v-else>{{ formatMoney(sc.cost.acquisitionTaxAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">②</span>법무비/채권</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scPctOfBid(sc, sc.cost.legalCostAmount).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetAmountByPct(sc, 'legalCostAmount', ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scPctOfBid(sc, sc.cost.legalCostAmount)) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.legalCostAmount" class="adp-cell-input" live-group /><template v-else>{{ formatMoney(sc.cost.legalCostAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">③</span>중도상환</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scRowPct(sc, RATE_ROWS[0]).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetRowPct(sc, RATE_ROWS[0], ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scRowPct(sc, RATE_ROWS[0])) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.midRepaymentAmount" class="adp-cell-input" live-group @update:model-value="scSyncRowRate(sc, RATE_ROWS[0])" /><template v-else>{{ formatMoney(sc.cost.midRepaymentAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">④</span>이자(3M)</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scRowPct(sc, RATE_ROWS[1]).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetRowPct(sc, RATE_ROWS[1], ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scRowPct(sc, RATE_ROWS[1])) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.interestAmount" class="adp-cell-input" live-group @update:model-value="scSyncRowRate(sc, RATE_ROWS[1])" /><template v-else>{{ formatMoney(sc.cost.interestAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">⑤</span>매도중개료</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="scRowPct(sc, RATE_ROWS[2]).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetRowPct(sc, RATE_ROWS[2], ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(scRowPct(sc, RATE_ROWS[2])) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.brokerageAmount" class="adp-cell-input" live-group @update:model-value="scSyncRowRate(sc, RATE_ROWS[2])" /><template v-else>{{ formatMoney(sc.cost.brokerageAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">⑥</span>미납관리비</td>
                <td class="r">-</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.arrearsFee" class="adp-cell-input" live-group /><template v-else>{{ sc.cost.arrearsFee > 0 ? formatMoney(sc.cost.arrearsFee) : '-' }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">⑦</span>수리비</td>
                <td class="r">-</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.repairCost" class="adp-cell-input" live-group /><template v-else>{{ sc.cost.repairCost > 0 ? formatMoney(sc.cost.repairCost) : '-' }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">⑧</span>명도비</td>
                <td class="r">-</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.evictionCost" class="adp-cell-input" live-group /><template v-else>{{ sc.cost.evictionCost > 0 ? formatMoney(sc.cost.evictionCost) : '-' }}</template>
                </td>
              </tr>
              <tr>
                <td><span class="adp-cost-no">⑨</span>광고비</td>
                <td class="r">3.3%</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.cost.advertisingCost" class="adp-cell-input" live-group /><template v-else>{{ scAdvertising(sc) > 0 ? formatMoney(scAdvertising(sc)) : '-' }}</template>
                </td>
              </tr>
              <tr class="hi">
                <td><strong>필요경비합계</strong></td>
                <td class="r adp-formula">①+②+③+④+⑤+⑥+⑦+⑧+⑨</td>
                <td class="r"><strong>{{ formatMoney(scTotalCosts(sc)) }}</strong></td>
              </tr>

              <tr class="pink">
                <td rowspan="8" class="adp-cat">수익</td>
                <td><strong>예상 매도가</strong></td>
                <!-- 예비 칸 — 'B안이면 얼마'를 옆에 적어 두는 자리. 계산에는 들어가지 않는다 -->
                <td class="r adp-sale-alt">
                  <input v-if="editingProfit" :value="scSaleAlt(sc)" class="adp-cell-input note" placeholder="입금가" @input="scSetSaleAlt(sc, ($event.target as HTMLInputElement).value)" /><template v-else>{{ scSaleAlt(sc) }}</template>
                </td>
                <td class="r emph">
                  <FormattedNumberInput v-if="editingProfit" v-model="sc.sale.expectedSaleValue" class="adp-cell-input" live-group /><template v-else><strong>{{ formatMoney(scSale(sc)) }}</strong></template>
                </td>
              </tr>
              <tr>
                <td>총투자금</td>
                <td class="r adp-formula">입찰가+비용</td>
                <td class="r">{{ formatMoney(scTotalInvest(sc)) }}</td>
              </tr>
              <tr>
                <td>실투자금</td>
                <td class="r adp-formula">입찰가-대출+비용</td>
                <td class="r">{{ formatMoney(scNetInvestment(sc)) }}</td>
              </tr>
              <tr>
                <td><strong>사업소득금액</strong></td>
                <td class="r adp-formula">매도가-입찰가-비용</td>
                <td class="r" :class="scGain(sc) < 0 ? 'neg' : ''"><strong>{{ formatMoney(scGain(sc)) }}</strong></td>
              </tr>
              <tr>
                <td><strong>사업소득세</strong></td>
                <td class="r adp-formula">
                  <template v-if="editingProfit">
                    <span class="adp-pct-wrap"><input :value="scTaxRate(sc)" inputmode="decimal" class="adp-cell-input xs" @input="limitPct($event); scSetTaxRate(sc, ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span>
                    −
                    <span class="adp-pct-wrap"><input :value="Math.round(scTaxDeduct(sc) / 10000)" inputmode="decimal" class="adp-cell-input xs" @input="scSetTaxDeduct(sc, ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">만</span></span>
                  </template>
                  <template v-else>과세표준 <span class="adp-bracket">{{ scBracket(sc) }}</span><span v-if="scDeductionText(sc)" class="adp-bracket"> − {{ scDeductionText(sc) }}</span></template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" :model-value="Math.round(scTransferTax(sc))" class="adp-cell-input" live-group @update:model-value="scSetIncomeTax(sc, $event)" /><template v-else><strong>{{ formatMoney(scTransferTax(sc)) }}</strong></template>
                </td>
              </tr>
              <tr>
                <td><strong>지방세</strong></td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="String(scLocalTaxRate(sc))" inputmode="decimal" class="adp-cell-input sm" @input="limitPct($event); scSetLocalTaxRate(sc, ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ scLocalTaxRate(sc) }}%</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" :model-value="Math.round(scLocalTax(sc))" class="adp-cell-input" live-group @update:model-value="scSetLocalTax(sc, $event)" /><template v-else><strong>{{ formatMoney(scLocalTax(sc)) }}</strong></template>
                </td>
              </tr>
              <tr class="hi">
                <td><strong>세후 순이익</strong></td>
                <!-- 여기에 목표 이익을 적으면 입찰가를 거꾸로 푼다 -->
                <td class="r adp-formula">매도가-총투자금-소득세</td>
                <td class="r emph">
                  <FormattedNumberInput v-if="editingProfit" :model-value="Math.round(scAfterTaxProfit(sc))" class="adp-cell-input" live-group @update:model-value="scSetAfterTaxProfit(sc, $event)" /><template v-else><strong :class="scAfterTaxProfit(sc) < 0 ? 'neg' : ''">{{ formatMoney(scAfterTaxProfit(sc)) }}</strong></template>
                </td>
              </tr>
              <tr class="hi">
                <td><strong>세후 수익률</strong></td>
                <td class="r adp-formula">세후이익/순투자금</td>
                <td class="r"><strong :class="scAfterTaxRate(sc) < 0 ? 'neg' : ''">{{ formatPct(scAfterTaxRate(sc)) }}</strong></td>
              </tr>
            </tbody>
          </table>
          </template>
        </section>

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('taxRef')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>개인소득세율 <span class="adp-head-note">종합소득세</span></h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('taxRef') }]" alt="" />
          </header>
          <table v-if="!isCollapsed('taxRef')" class="adp-table adp-tax-ref">
            <thead>
              <tr><th>과세표준</th><th class="r">세율</th><th class="r">누진공제</th></tr>
            </thead>
            <tbody>
              <tr><td>1,400만원 이하</td><td class="r">6%</td><td class="r">-</td></tr>
              <tr><td>5,000만원 이하</td><td class="r">15%</td><td class="r">126만원</td></tr>
              <tr><td>8,800만원 이하</td><td class="r">24%</td><td class="r">576만원</td></tr>
              <tr><td>1억5천만원 이하</td><td class="r">35%</td><td class="r">1,544만원</td></tr>
              <tr><td>3억원 이하</td><td class="r">38%</td><td class="r">1,994만원</td></tr>
              <tr><td>5억원 이하</td><td class="r">40%</td><td class="r">2,594만원</td></tr>
              <tr><td>10억원 이하</td><td class="r">42%</td><td class="r">3,594만원</td></tr>
              <tr><td>10억원 초과</td><td class="r">45%</td><td class="r">6,594만원</td></tr>
            </tbody>
          </table>
        </section>
      </template>

      <template v-if="activeTab === 'verify'">
        <!-- 경매사례 — 인근 매각사례. 동일지번은 손품+현장 급매가로 옮겼다 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('cases')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14M7 7l-4 7h8zM17 7l-4 7h8z"/></svg>경매사례</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('cases') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('cases')">
            <!-- 인근 매각사례 -->
            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">인근 매각사례 <span class="adp-head-note">{{ auction?.address?.split(' ').slice(0, 3).join(' ') || '' }} {{ auction?.propertyType || '' }}</span></span>
              </div>
              <table v-if="nearBidRows.length > 0" class="adp-table adp-cases-table">
                <colgroup>
                  <col style="width: 24%" />
                  <col />
                  <col style="width: 22%" />
                  <col style="width: 26%" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="c">구분</th>
                    <th class="c">평균감정가<br>평균매각가</th>
                    <th class="c">입찰인원<br>매각가율</th>
                    <th class="c">예상매각가</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in nearBidRows" :key="i">
                    <td class="c">{{ r.saleInfo }}</td>
                    <td class="c pre"><span>{{ r.appraisal }}</span><span v-if="r.minimum" class="adp-line2">{{ r.minimum }}</span></td>
                    <td class="c pre"><span>{{ r.winning }}</span><span v-if="r.rate" class="adp-line2 b-blue">{{ r.rate }}</span></td>
                    <td class="c"><strong>{{ r.expectedWinning }}</strong></td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="adp-empty">매각사례 데이터 없음</p>
            </div>

          </div>
        </section>

        <!-- 해당물건 실거래가 — PDF 분석 자료 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('casePrice')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/></svg>경매지번 실거래가</h2>
            <span v-if="caseTradeUpdatedAt" class="adp-update-time">UPDATE : {{ caseTradeUpdatedAt }}</span>
            <button
              type="button"
              class="adp-refresh-btn"
              aria-label="실거래가 다시 읽기"
              title="필터를 풀고 실거래가를 다시 읽는다"
              @click.stop="refreshCaseTrades"
            >⟳</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('casePrice') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('casePrice')">
            <div class="adp-trade-summary cols3">
              <div class="adp-trade-sum-card">
                <small><span class="adp-sum-key">{{ recentSaleTradeYm }}</span> 실거래가</small>
                <span class="adp-sum-value">
                  <strong>{{ formatWonSimple(recentSaleTradePrice) }}</strong>
                </span>
              </div>
              <div class="adp-trade-sum-card">
                <small>평당가</small>
                <span class="adp-sum-value">
                  <strong>{{ formatWonSimple(recentSaleTradePyeong) }}</strong>
                </span>
              </div>
              <div class="adp-trade-sum-card">
                <small>{{ tradeCountLabel }}</small>
                <span class="adp-sum-value"><strong>{{ tradeCountValue }}건</strong></span>
              </div>
            </div>

            <div class="adp-trade-filter-row">
              <div class="adp-trade-tabs">
                <button :class="['adp-trade-tab','t-all',  { active: tradeFilter === 'all' }]" @click="tradeFilter = 'all'">전체 ({{ mergedCounts.all }})</button>
                <button :class="['adp-trade-tab','t-buy',  { active: tradeFilter === '매매' }]" @click="tradeFilter = '매매'">매매 ({{ mergedCounts.매매 }})</button>
                <button :class="['adp-trade-tab','t-jeon', { active: tradeFilter === '전세' }]" @click="tradeFilter = '전세'">전세 ({{ mergedCounts.전세 }})</button>
                <button :class="['adp-trade-tab','t-wol',  { active: tradeFilter === '월세' }]" @click="tradeFilter = '월세'">월세 ({{ mergedCounts.월세 }})</button>
              </div>
            </div>
              <div class="adp-trade-selects">
                <select v-model="tradeAreaFilter" class="adp-select-sm">
                  <option value="">전체면적(㎡/평)</option>
                  <option v-for="opt in tradeAreaOptions" :key="opt" :value="opt">{{ areaTextWithPyeong(opt) }}</option>
                </select>
                <select v-model="tradeYearFilter" class="adp-select-sm">
                  <option value="">거래년도</option>
                  <option v-for="opt in tradeYearOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div class="adp-sp-bar">
                <span class="adp-sp-lab">단지전체 (국토부) <em>최근 {{ PLACE_HISTORY_YEARS }}년</em></span>
                <strong v-if="samePlaceLoading" class="adp-sp-cnt">조회중…</strong>
                <strong v-else-if="shownTradeRows.length > 0" class="adp-sp-cnt">{{ shownTradeRows.length }}건</strong>
                <span v-if="emptyTabNote" class="adp-sp-none">{{ emptyTabNote }}</span>
                <span class="adp-sp-fill" />
                <button
                  v-if="!samePlaceLoading && samePlaceMissed > 0"
                  type="button"
                  class="adp-sp-again"
                  :title="`${samePlaceMissed}개월치를 받지 못했습니다`"
                  @click="loadSamePlaceTrades(true)"
                >다시 조회</button>
              </div>
              <p v-if="samePlaceError" class="adp-sp-err">{{ samePlaceError }}</p>
              <table v-if="shownTradeRows.length > 0" class="adp-table adp-trade-table">
                <colgroup>
                  <col style="width: 21%" /><col style="width: 20%" /><col style="width: 24%" /><col style="width: 23%" /><col style="width: 12%" />
                </colgroup>
                <thead>
                  <tr><th class="adp-trade-kind">구분</th><th>계약일</th><th>거래금액</th><th>전용(㎡/평)</th><th class="adp-trade-floor">층</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in shownTradeRows" :key="`m${i}`">
                    <td :class="['adp-trade-type', tradeTypeClass(r.kind === '직거래' ? '매매' : r.kind), { 'adp-sp-direct': r.kind === '직거래' }]">
                      <button
                        v-if="canSendTrade(r)"
                        type="button"
                        class="adp-send-btn"
                        aria-label="매매 실거래가로 보내기"
                        @click.stop="sendTradePriceToMarket(r)"
                      >
                        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                          <path d="m3 11 18-8-8 18-2-7z" />
                        </svg>
                      </button>
                      <button
                        v-else-if="canSendJeonse(r)"
                        type="button"
                        class="adp-send-btn"
                        aria-label="전세 실거래가로 보내기"
                        @click.stop="sendJeonseToMarket(r)"
                      >
                        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                          <path d="m3 11 18-8-8 18-2-7z" />
                        </svg>
                      </button>
                      <span v-else class="adp-send-gap" />
                      {{ r.kind }}
                    </td>
                    <td>{{ r.contractDate || '-' }}</td>
                    <td>{{ r.amount }}</td>
                    <td>{{ areaWithPyeong(r.areaM2) }}</td>
                    <td class="adp-trade-floor">{{ r.floor || '-' }}층</td>
                  </tr>
                </tbody>
              </table>
          </div>
        </section>

        <!-- 실거래가 조건식 분석 — 국토부 API를 조건으로 걸러 본다 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('trades')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>실거래가 조건분석</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('trades') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('trades')">
            <div class="adp-trade-summary cols3">
              <div class="adp-trade-sum-card">
                <small>실거래가 평균</small>
                <span class="adp-sum-value">
                  <strong>{{ formatWonSimple(publicTradeAvg) }}</strong>
                </span>
              </div>
              <div class="adp-trade-sum-card">
                <small>평당가 평균</small>
                <span class="adp-sum-value">
                  <strong>{{ formatWonSimple(publicTradePyeongAvg) }}</strong>
                </span>
              </div>
              <div class="adp-trade-sum-card">
                <small><span v-if="publicRangeNote" class="adp-sum-key">{{ publicRangeNote }}</span> 총 거래건수</small>
                <span class="adp-sum-value"><strong>{{ filteredPublicTradeRows.length }}건</strong></span>
              </div>
            </div>

            <!-- 분포 내비게이터 — 누르면 아래 조건이 그 구간으로 채워진다 -->
            <div v-if="navBaseRows.length > 0" class="adp-nav-dist">
              <div class="adp-nav-line">
                <span class="adp-nav-key">평형</span>
                <button
                  v-for="b in navPyeongBuckets"
                  :key="b.key"
                  type="button"
                  :class="['adp-nav-chip', { top: b.key === navPyeongTop, on: navActive.pyeong === b.key }]"
                  @click="pickNavPyeong(b.key)"
                >
                  <small>{{ b.label }}</small>
                  <strong>{{ b.count }}<em>건</em></strong>
                </button>
              </div>
              <div class="adp-nav-line">
                <span class="adp-nav-key">층</span>
                <button
                  v-for="b in navFloorBuckets"
                  :key="b.key"
                  type="button"
                  :class="['adp-nav-chip', { top: b.key === navFloorTop, on: navActive.floor === b.key }]"
                  @click="pickNavFloor(b.key)"
                >
                  <small>{{ b.label }}</small>
                  <strong>{{ b.count }}<em>건</em></strong>
                </button>
              </div>
              <div class="adp-nav-line">
                <span class="adp-nav-key">연식</span>
                <button
                  v-for="b in navYearBuckets"
                  :key="b.key"
                  type="button"
                  :class="['adp-nav-chip', { top: b.key === navYearTop, on: navActive.year === b.key }]"
                  @click="pickNavYear(b.key)"
                >
                  <small>{{ b.label }}</small>
                  <strong>{{ b.count }}<em>건</em></strong>
                </button>
              </div>
            </div>

              <div class="adp-pub-filter">
                <div class="adp-pub-row">
                  <label class="adp-pub-cell span2">
                    <span>기간선택</span>
                    <span class="adp-pub-months">
                      <button
                        v-for="m in [1, 3, 6, 12]"
                        :key="m"
                        type="button"
                        :class="['adp-pub-month-btn', { on: pubMonthPreset === m }]"
                        @click="setPubMonths(m)"
                      >{{ m }}개월</button>
                    </span>
                  </label>
                </div>
                <div class="adp-pub-row">
                  <label class="adp-pub-cell">
                    <span>시작일자</span>
                    <button type="button" class="adp-pub-input adp-pub-date" @click="pubDateTarget = 'start'">
                      {{ publicStartDate || '선택' }}
                    </button>
                  </label>
                  <label class="adp-pub-cell">
                    <span>종료일자</span>
                    <button type="button" class="adp-pub-input adp-pub-date" @click="pubDateTarget = 'end'">
                      {{ publicEndDate || '선택' }}
                    </button>
                  </label>
                </div>
                <div class="adp-pub-row">
                  <label class="adp-pub-cell">
                    <span>최소면적</span>
                    <span class="adp-pub-unit">
                      <input v-model="pubMinPyeong" class="adp-pub-input" inputmode="decimal" placeholder="전체" /><em>평</em>
                    </span>
                  </label>
                  <label class="adp-pub-cell">
                    <span>최대면적</span>
                    <span class="adp-pub-unit">
                      <input v-model="pubMaxPyeong" class="adp-pub-input" inputmode="decimal" placeholder="전체" /><em>평</em>
                    </span>
                  </label>
                </div>
                <div class="adp-pub-row">
                  <label class="adp-pub-cell span2 years">
                    <span>건축년도</span>
                    <input v-model="publicMinBuildYear" class="adp-pub-input" inputmode="numeric" maxlength="4" placeholder="전체" />
                    <span class="adp-pub-tilde">~</span>
                    <input v-model="publicMaxBuildYear" class="adp-pub-input" inputmode="numeric" maxlength="4" placeholder="전체" />
                  </label>
                </div>
                <div class="adp-pub-row actions">
                  <button type="button" class="adp-pub-search" :disabled="fetchingPublicTrade" @click="searchPublicTrades">
                    <span class="adp-pub-search-main">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                      </svg><span>{{ fetchingPublicTrade ? '조회 중…' : '검색' }}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="adp-pub-reset save"
                    title="지금 조건을 이 물건에 적어 둔다"
                    @click="savePublicFilters"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" />
                    </svg>저장
                  </button>
                  <button
                    type="button"
                    class="adp-pub-reset"
                    title="기간·면적·건축년도를 처음 상태로. 적어 둔 조건도 지운다"
                    @click="resetPublicFilters"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v5h5" />
                    </svg>초기화
                  </button>
                </div>
              </div>
              <p v-if="publicTradeWarning" class="adp-pub-warn">일부 기간을 못 받아 건수가 실제보다 적을 수 있습니다 — {{ publicTradeWarning }}</p>
              <div v-if="publicRealTradeRows.length > 0" class="adp-pub-result">
                <div class="adp-pub-toggle-row">
                  <span class="adp-pub-result-title">
                    <strong>
                      검색리스트
                      <small v-if="publicTradeUpdatedAt" class="adp-pub-update">UPDATE : {{ publicTradeUpdatedAt }}</small>
                    </strong>
                  </span>
                  <button type="button" class="adp-pub-toggle" @click="toggleTradeList">
                    정상거래 <strong>{{ filteredPublicTradeRows.length }}</strong>건
                    <img :src="chevronDownIcon" :class="['adp-chev sm', { up: pubTableCollapsed }]" alt="" />
                  </button>
                  <button
                    type="button"
                    class="adp-pub-direct"
                    :disabled="filteredDirectRows.length === 0"
                    @click="toggleDirectList"
                  >
                    직거래 <strong>{{ filteredDirectRows.length }}</strong>건
                    <img :src="chevronDownIcon" :class="['adp-chev sm', { up: pubDirectCollapsed }]" alt="" />
                  </button>
                  <button
                    type="button"
                    class="adp-pub-direct"
                    :disabled="filteredCancelledRows.length === 0"
                    @click="toggleCancelledList"
                  >
                    계약해제 <strong>{{ filteredCancelledRows.length }}</strong>건
                    <img :src="chevronDownIcon" :class="['adp-chev sm', { up: pubCancelledCollapsed }]" alt="" />
                  </button>
                </div>
                <div class="adp-pub-find">
                  <svg class="adp-pub-find-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    v-model="pubSearch"
                    type="search"
                    class="adp-pub-find-input"
                    placeholder="계약일·금액·면적·건축년도·층·주소 검색..."
                    aria-label="검색리스트 안에서 찾기"
                  />
                  <small v-if="pubSearch.trim()" class="adp-pub-find-count">{{ pubSearchCount }}건</small>
                  <button v-if="pubSearch" type="button" class="adp-pub-find-x" aria-label="검색어 지우기" @click="pubSearch = ''">×</button>
                </div>
                <div v-if="!pubDirectCollapsed && filteredDirectRows.length > 0" class="adp-pub-direct-list">
                  <p class="adp-pub-direct-note">시세와 동떨어진 경우가 많아 집계에서 뺐습니다.</p>
                  <table class="adp-table adp-pub-table">
                    <colgroup>
                      <col style="width: 17%" />
                      <col style="width: 19%" />
                      <col style="width: 17%" />
                      <col style="width: 13%" />
                      <col style="width: 9%" />
                      <col style="width: 25%" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>계약일</th><th>거래금액</th><th>전용㎡/평</th><th>건축</th><th>층</th><th>주소</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(r, i) in shownDirectRows" :key="`d${i}`">
                        <td>{{ r.contractDate || '-' }}</td>
                        <td>{{ formatWonSimple(r.price) }}</td>
                        <td class="adp-area-cell">
                          <span>{{ areaWithPyeong(r.areaM2) }}</span>
                          <small v-if="normalizeHouseType(r.houseType)">{{ normalizeHouseType(r.houseType) }}</small>
                        </td>
                        <td class="adp-pub-year">
                          <span>{{ r.buildYear || '-' }}</span>
                          <small v-if="r.buildYear">{{ buildYearAge(r.buildYear) }}</small>
                        </td>
                        <td>{{ r.floor || '-' }}</td>
                        <td class="adp-pub-addr">
                          <div class="adp-pub-addr-in">
                            <span class="adp-pub-addr-txt" @mouseenter="addrEnter(rowAddress(r), $event)" @mouseleave="addrLeave()" @click.stop="toggleAddrTip(rowAddress(r), $event)">{{ rowAddress(r) }}</span>
                            <button type="button" class="adp-copy-btn" aria-label="주소 복사" @click.stop="copyAddressText(rowAddress(r))">
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="8" y="8" width="13" height="13" rx="2" />
                                <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr v-if="shownDirectRows.length === 0">
                        <td colspan="6" class="adp-pub-empty-row">검색어에 맞는 거래가 없습니다.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="!pubCancelledCollapsed && filteredCancelledRows.length > 0" class="adp-pub-direct-list">
                  <p class="adp-pub-direct-note">계약이 해제된 거래라 집계에서 뺐습니다.</p>
                  <table class="adp-table adp-pub-table">
                    <colgroup>
                      <col style="width: 17%" />
                      <col style="width: 19%" />
                      <col style="width: 17%" />
                      <col style="width: 13%" />
                      <col style="width: 9%" />
                      <col style="width: 25%" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>계약일</th><th>거래금액</th><th>전용㎡/평</th><th>건축</th><th>층</th><th>주소</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(r, i) in shownCancelledRows" :key="`c${i}`">
                        <td>{{ r.contractDate || '-' }}</td>
                        <td>{{ formatWonSimple(r.price) }}</td>
                        <td class="adp-area-cell">
                          <span>{{ areaWithPyeong(r.areaM2) }}</span>
                          <small v-if="normalizeHouseType(r.houseType)">{{ normalizeHouseType(r.houseType) }}</small>
                        </td>
                        <td class="adp-pub-year">
                          <span>{{ r.buildYear || '-' }}</span>
                          <small v-if="r.buildYear">{{ buildYearAge(r.buildYear) }}</small>
                        </td>
                        <td>{{ r.floor || '-' }}</td>
                        <td class="adp-pub-addr">
                          <div class="adp-pub-addr-in">
                            <span class="adp-pub-addr-txt" @mouseenter="addrEnter(rowAddress(r), $event)" @mouseleave="addrLeave()" @click.stop="toggleAddrTip(rowAddress(r), $event)">{{ rowAddress(r) }}</span>
                            <button type="button" class="adp-copy-btn" aria-label="주소 복사" @click.stop="copyAddressText(rowAddress(r))">
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="8" y="8" width="13" height="13" rx="2" />
                                <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr v-if="shownCancelledRows.length === 0">
                        <td colspan="6" class="adp-pub-empty-row">검색어에 맞는 거래가 없습니다.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div v-if="publicRealTradeRows.length > 0 && pubDirectCollapsed && pubCancelledCollapsed" :class="['adp-pub-table-wrap', { 'dd-open': !!activePubCol }]" @click.self="closePubColMenu">
                <table class="adp-table adp-pub-table">
                  <colgroup>
                    <col style="width: 17%" />
                    <col style="width: 19%" />
                    <col style="width: 17%" />
                    <col style="width: 13%" />
                    <col style="width: 9%" />
                    <col style="width: 25%" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th v-for="col in PUB_COLS" :key="col">
                        <div class="adp-pub-th">
                          <span>{{ PUB_COL_LABELS[col] }}</span>
                          <button type="button" :class="['adp-pub-th-btn', { active: isPubColActive(col) }]" @click="togglePubColMenu(col, $event)">▼</button>
                          <ul v-if="activePubCol === col" class="adp-pub-dd" @click.stop>
                            <li class="adp-pub-dd-actions">
                              <button type="button" @click="selectAllPubCol(col)">전체 선택</button>
                              <button type="button" @click="clearAllPubCol(col)">전체 해제</button>
                              <button type="button" class="adp-pub-dd-apply" @click="applyPubColFilter(col)">적용</button>
                            </li>
                            <li
                              v-for="v in pubColUniqueValues[col]"
                              :key="v"
                              class="adp-pub-dd-item"
                              @click="togglePubColValue(col, v)"
                            >
                              <input type="checkbox" :checked="isPubColChecked(col, v)" @click.stop="togglePubColValue(col, v)" />
                              <span>{{ v }}</span>
                            </li>
                          </ul>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody v-if="!pubTableCollapsed">
                    <tr v-for="(r, i) in shownPubRows" :key="i">
                      <td>{{ r.contractDate || '-' }}</td>
                      <td>{{ formatWonSimple(r.price) }}</td>
                      <td class="adp-area-cell">
                        <span>{{ areaWithPyeong(r.areaM2) }}</span>
                        <small v-if="normalizeHouseType(r.houseType)">{{ normalizeHouseType(r.houseType) }}</small>
                      </td>
                      <td class="adp-pub-year">
                        <span>{{ r.buildYear || '-' }}</span>
                        <small v-if="r.buildYear">{{ buildYearAge(r.buildYear) }}</small>
                      </td>
                      <td>{{ r.floor || '-' }}</td>
                      <td class="adp-pub-addr">
                        <div class="adp-pub-addr-in">
                        <span class="adp-pub-addr-txt" @mouseenter="addrEnter(rowAddress(r), $event)" @mouseleave="addrLeave()" @click.stop="toggleAddrTip(rowAddress(r), $event)">{{ rowAddress(r) }}</span>
                        <button type="button" class="adp-copy-btn" aria-label="주소 복사" @click.stop="copyAddressText(rowAddress(r))">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="8" y="8" width="13" height="13" rx="2" />
                            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                          </svg>
                        </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="shownPubRows.length === 0">
                      <td colspan="6" class="adp-pub-empty-row">{{ pubSearch.trim() ? '검색어에 맞는 거래가 없습니다.' : '필터 조건에 맞는 거래가 없습니다.' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <!-- '데이터 없음'은 자료가 정말 없을 때만 — 직거래를 펼쳐 표를 숨긴 경우와 섞이지 않게 조건을 따로 둔다 -->
              <p v-if="publicRealTradeRows.length === 0 && fetchingPublicTrade" class="adp-empty">주변 실거래가 조회 중…</p>
              <p v-else-if="publicRealTradeRows.length === 0" class="adp-empty">주변 실거래가 데이터 없음</p>
          </div>
        </section>
      </template>


      <template v-if="activeTab === 'rights'">
        <!-- 매각물건명세서 등 서류 캡처·링크 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('rightsPhotos')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>서류사진<PhotoCountMark :n="photoAreaCount('rightsPhotos')" /></h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('rightsPhotos') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('rightsPhotos')">
            <div class="adp-plan-row">
              <input
                v-model="rightsDocInput"
                placeholder="링크 또는 이미지 붙여넣기"
                class="adp-input"
                @keydown.enter.prevent="addRightsDocUrl"
                @paste="pasteImageInto($event, 'rightsDoc')"
              />
              <button type="button" class="adp-icn-btn" @click="addRightsDocUrl">+</button>
            </div>
            <p v-if="rightsDocErrMsg" class="adp-plan-err">{{ rightsDocErrMsg }}</p>
            <div v-for="(url, i) in rightsDocList" :key="url" class="adp-plan-preview">
              <img :src="photoSrc(url)" alt="서류사진" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
              <button type="button" class="adp-plan-del" aria-label="서류사진 삭제" @click="removeRightsDocAt(i)">×</button>
              <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
            </div>
          </div>
        </section>

        <!-- 임차인현황 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('registry')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M4 17h16"/></svg>건물등기</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('registry') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('registry')">
            <p v-if="registryClaimAmount > 0" class="adp-sub-note">(채권합계금액:{{ formatMoney(registryClaimAmount) }}원)</p>
            <table v-if="registryRows.length > 0" class="adp-table adp-registry-table">
              <colgroup>
                <col style="width: 22%" />
                <col />
                <col style="width: 24%" />
                <col style="width: 12%" />
              </colgroup>
              <thead><tr><th>접수/순서</th><th>종류</th><th>권리자</th><th>소멸</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in registryRows" :key="i" :class="r.extinct === '소멸' ? 'tone-red' : ''">
                  <td class="pre-line">{{ r.date.replace(/-/g, '.') }}<br>{{ r.order }}</td>
                  <td>
                    <strong>{{ r.kind }}</strong>
                    <span v-if="r.amount" class="b">{{ r.amount }}</span>
                    <span v-if="r.desc" class="adp-desc pre-line"><span v-for="(pt, pi) in r.descParts" :key="pi" :class="{ 'adp-reg-base': pt.base }">{{ pt.text }}</span></span>
                  </td>
                  <td>{{ r.holder }}</td>
                  <td>{{ r.extinct }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="adp-empty">건물등기 정보 없음</p>
            <p v-if="registryWarning" class="adp-warn-banner">{{ registryWarning }}</p>

          </div>
        </section>

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('tenant')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>임차인현황</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('tenant') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('tenant')">
          <p class="adp-base-note adp-tn-base">말소기준 : <b class="adp-tn-date">{{ tenantBaseDate }}</b> · 배당종기 : <b class="adp-tn-date">{{ tenantDistDate }}</b> · 소액기준 : <b class="adp-tn-date">{{ tenantSmallDate }}</b></p>

          <div class="adp-tn-box">
          <template v-if="tenantCards.length > 0">
            <dl v-for="(tenant, i) in tenantCards" :key="i" class="adp-base-rows adp-base-tenant">
              <div class="adp-base-row">
                <dt>임차인</dt>
                <dd><strong>{{ tenant.name }}</strong><span v-if="tenant.agency"> / {{ tenant.agency }}</span></dd>
              </div>
              <div class="adp-base-row">
                <dt>보증금</dt>
                <dd class="amt">{{ tenant.deposit || '-' }}</dd>
              </div>
              <div class="adp-base-row">
                <dt>점유/기간</dt>
                <dd class="adp-tn-dates">{{ tenantUsagePeriod(tenant.occupationPeriod) }}</dd>
              </div>
              <div class="adp-base-row">
                <dt>전입 확정 배당</dt>
                <dd class="adp-tn-dates">{{ tenantDatesText(tenant) }}</dd>
              </div>
            </dl>
          </template>
          <p v-else class="adp-empty">임차인 정보 없음</p>

          <p v-if="tenantWarnText" class="adp-base-warn">
            <img :src="alertIcon" alt="" class="adp-base-mini" />{{ tenantWarnText }}
          </p>

          <!-- PDF 임차인 현황의 '기타사항' 원문 -->
          <div v-if="tenantOtherNotes" class="adp-base-more">
            <button type="button" class="adp-note-toggle" @click="tenantNotesOpen = !tenantNotesOpen">
              <span>기타사항</span>
              <img :src="chevronDownIcon" :class="['adp-chev sm', { up: tenantNotesOpen }]" alt="" />
            </button>
            <p v-if="tenantNotesOpen" class="adp-base-note pre">{{ tenantOtherNotes }}</p>
          </div>
          </div>
          </div>
        </section>
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('rightsCheck')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 11 2 2 4-4"/></svg>권리분석</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('rightsCheck') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('rightsCheck')">
            <table class="adp-table adp-rcheck-table">
              <colgroup>
                <col style="width: 104px" />
                <col />
                <col style="width: 40px" />
              </colgroup>
              <tbody>
                <tr>
                  <td class="adp-rcheck-label"><strong>매각물건명세서</strong></td>
                  <td class="adp-rcheck-desc" colspan="2">
                    <!-- 기본 select는 펼친 목록과 닫힌 표시의 글자를 다르게 둘 수 없어 직접 만든다 -->
                    <div class="adp-rcase-dd">
                      <button type="button" :class="['adp-rcase-select', { picked: selectedRightsCase }]" @click="caseOpen = !caseOpen">
                        <span>{{ selectedRightsCase ? selectedRightsCase.title : '권리분석 케이스 선택' }}</span>
                        <span class="adp-rcase-caret">{{ caseOpen ? '▴' : '▾' }}</span>
                      </button>
                      <template v-if="caseOpen">
                        <div class="adp-rcase-backdrop" @click="caseOpen = false" />
                        <ul class="adp-rcase-list">
                          <li class="adp-rcase-item" @click="pickRightsCase('')">
                            <strong>권리분석 케이스 선택</strong>
                          </li>
                          <li
                            v-for="c in RIGHTS_CASES"
                            :key="c.id"
                            :class="['adp-rcase-item', { on: c.id === auction?.rightsCaseId }]"
                            @click="pickRightsCase(c.id)"
                          >
                            <strong>{{ c.title }}</strong>
                            <small>{{ c.summary }}</small>
                          </li>
                        </ul>
                      </template>
                    </div>
                    <p v-if="selectedRightsCase" class="adp-rcase-banner">{{ selectedRightsCase.summary }}</p>
                  </td>
                </tr>
                <tr v-for="item in RIGHTS_CHECK_ITEMS" :key="item.id">
                  <td class="adp-rcheck-label"><strong>{{ item.label }}</strong></td>
                  <td class="adp-rcheck-desc">{{ item.desc }}</td>
                  <td class="adp-rcheck-cell">
                    <input
                      type="checkbox"
                      class="adp-rcheck-box"
                      :checked="!!auction?.rightsChecks?.[item.id]"
                      @change="toggleRightsCheck(item.id, ($event.target as HTMLInputElement).checked)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <table class="adp-table adp-rcheck-table adp-rdoc-table">
              <colgroup>
                <col style="width: 104px" />
                <col style="width: 30%" />
                <col />
                <col style="width: 40px" />
              </colgroup>
              <tbody>
                <tr v-for="item in RIGHTS_DOC_ITEMS" :key="item.id">
                  <td class="adp-rcheck-label"><strong>{{ item.label }}</strong></td>
                  <template v-if="item.dateId || item.lines">
                    <td class="adp-rdoc-note-cell" colspan="2">
                      <div
                        v-for="(ln, li) in docLines(item)"
                        :key="li"
                        class="adp-rdoc-survey"
                        :style="{ gridTemplateColumns: ln.cells[0]?.kind === 'label' ? '30px 84px 1fr 1fr' : `repeat(${ln.cells.length}, minmax(0, 1fr))` }"
                      >
                        <template v-for="c in ln.cells" :key="c.id">
                          <span v-if="c.kind === 'label'" class="adp-rdoc-label">{{ c.placeholder }}</span>
                          <div v-else-if="c.wide && (c.kind === 'multi' || c.kind === 'pick')" class="adp-agency-multi adp-rdoc-multi wide">
                            <button
                              type="button"
                              class="adp-rdoc-input adp-agency-trigger"
                              @click="docMultiOpen = docMultiOpen === c.id ? '' : c.id"
                            >
                              <span :class="['txt', { ph: !rightsDocNote(c.id) }]">{{ docNoteList(c.id).join(', ') || c.placeholder }}</span>
                              <span class="caret">▾</span>
                            </button>
                            <template v-if="docMultiOpen === c.id">
                              <div class="adp-agency-backdrop" @click="docMultiOpen = ''" />
                              <ul class="adp-agency-options">
                                <li
                                  v-for="opt in c.options"
                                  :key="opt"
                                  :class="['adp-agency-option', { on: docNoteList(c.id).includes(opt) }]"
                                  @click="c.kind === 'pick' ? pickDocNoteOption(c.id, opt) : toggleDocNoteOption(c.id, opt)"
                                >
                                  <span>{{ opt }}</span>
                                  <span v-if="docNoteList(c.id).includes(opt)" class="ck">✓</span>
                                </li>
                              </ul>
                            </template>
                          </div>
                          <button
                            v-else-if="c.kind === 'date'"
                            type="button"
                            class="adp-rdoc-input adp-date-btn date"
                            @click="docDatePickerId = c.id"
                          >
                            <span :class="{ ph: !rightsDocNote(c.id) }">{{ rightsDocNote(c.id) || c.placeholder }}</span>
                            <span class="adp-date-caret">▾</span>
                          </button>
                          <div v-else-if="c.kind === 'multi' || c.kind === 'pick'" class="adp-agency-multi adp-rdoc-multi">
                            <button
                              type="button"
                              class="adp-rdoc-input adp-agency-trigger"
                              @click="docMultiOpen = docMultiOpen === c.id ? '' : c.id"
                            >
                              <span :class="['txt', { ph: !rightsDocNote(c.id) }]">{{ docNoteList(c.id).join(', ') || c.placeholder }}</span>
                              <span class="caret">▾</span>
                            </button>
                            <template v-if="docMultiOpen === c.id">
                              <div class="adp-agency-backdrop" @click="docMultiOpen = ''" />
                              <ul class="adp-agency-options">
                                <li
                                  v-for="opt in c.options"
                                  :key="opt"
                                  :class="['adp-agency-option', { on: docNoteList(c.id).includes(opt) }]"
                                  @click="c.kind === 'pick' ? pickDocNoteOption(c.id, opt) : toggleDocNoteOption(c.id, opt)"
                                >
                                  <span>{{ opt }}</span>
                                  <span v-if="docNoteList(c.id).includes(opt)" class="ck">✓</span>
                                </li>
                              </ul>
                            </template>
                          </div>
                          <input
                            v-else
                            class="adp-rdoc-input"
                            :placeholder="c.placeholder"
                            :value="rightsDocNote(c.id) || (c.autoOccupancy ? occupancyDefault : '')"
                            @input="setRightsDocNote(c.id, ($event.target as HTMLInputElement).value)"
                          />
                        </template>
                      </div>
                    </td>
                  </template>
                  <template v-else-if="item.noNote">
                    <td class="adp-rdoc-task-cell" colspan="2">
                      <span class="adp-rdoc-task">{{ item.task }}</span>
                    </td>
                  </template>
                  <template v-else-if="item.inlineNote">
                    <td class="adp-rdoc-note-cell" colspan="2">
                      <div class="adp-rdoc-survey">
                        <span class="adp-rdoc-task inline">{{ item.task }}</span>
                        <input
                          class="adp-rdoc-input"
                          placeholder="비고"
                          :value="rightsDocNote(item.id)"
                          @input="setRightsDocNote(item.id, ($event.target as HTMLInputElement).value)"
                        />
                      </div>
                    </td>
                  </template>
                  <template v-else>
                    <td class="adp-rdoc-task-cell">
                      <span class="adp-rdoc-task">{{ item.task }}</span>
                    </td>
                    <td class="adp-rdoc-note-cell">
                      <input
                        class="adp-rdoc-input"
                        placeholder="비고"
                        :value="rightsDocNote(item.id)"
                        @input="setRightsDocNote(item.id, ($event.target as HTMLInputElement).value)"
                      />
                    </td>
                  </template>
                  <td class="adp-rcheck-cell">
                    <input
                      type="checkbox"
                      class="adp-rcheck-box"
                      :checked="!!auction?.rightsChecks?.[item.id]"
                      @change="toggleRightsCheck(item.id, ($event.target as HTMLInputElement).checked)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 권리분석 정리 — 위의 표들을 보고 내린 판단을 한곳에 적어 둔다.
             표에 칸을 늘리는 대신 따로 둔 까닭은, 어느 한 항목이 아니라
             전부를 보고 쓰는 글이기 때문이다. -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('rightsConc')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 7-7" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></svg>권리분석 정리</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('rightsConc') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('rightsConc')" class="adp-rconc-body">
            <textarea
              class="adp-rconc-note"
              rows="4"
              placeholder="비고"
              :value="rightsDocNote(RIGHTS_CONC_ID)"
              @input="setRightsDocNote(RIGHTS_CONC_ID, ($event.target as HTMLTextAreaElement).value)"
            />
          </div>
        </section>

      </template>

      <template v-if="activeTab === 'survey' && auction">
        <!-- 본건사진 — 전경 + 평면도 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('photos')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h4l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/></svg>본건사진<PhotoCountMark :n="photoAreaCount('photos')" /> <span class="adp-survey-note-inline">전경 + 평면도</span></h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('photos') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('photos')">
            <div class="adp-plan-row">
              <input
                v-model="exteriorInput"
                placeholder="링크 또는 이미지 붙여넣기"
                class="adp-input"
                @keydown.enter.prevent="addExteriorUrl"
                @paste="pasteImageInto($event, 'exterior')"
              />
              <button type="button" class="adp-icn-btn" @click="addExteriorUrl">+</button>
            </div>
            <p v-if="floorPlanUploading" class="adp-sub-note">업로드 중…</p>
            <p v-if="exteriorErrMsg || floorPlanErrMsg" class="adp-plan-err">{{ exteriorErrMsg || floorPlanErrMsg }}</p>
            <div v-for="photo in propertyPhotos" :key="photo.url" class="adp-plan-preview">
              <img :src="photoSrc(photo.url)" alt="본건사진" class="adp-plan-img" @error="onImageError(photo.url)" @click="openLightbox(photoSrc(photo.url))" />
              <button type="button" class="adp-plan-del" aria-label="사진 삭제" @click="removePropertyPhoto(photo)">×</button>
              <p v-if="brokenImages[photo.url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
            </div>
            <div class="adp-photo-note">
              <input
                class="adp-fs-input"
                placeholder="비고"
                :value="fieldVal('fs.photoNote')"
                @input="setPhotoNote(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </section>




        <!-- 매매수요 — 동단위 수요·공급 (빌라) -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head" @click="toggleSection('demand')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V10M9 21V4M15 21v-7M21 21v-11"/></svg>매매수요</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('demand') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('demand')" class="adp-dm-body">
            <div class="adp-dm-head">
              <strong class="adp-dm-title">1. <span class="adp-dm-area">{{ surveyAreaLabel }}</span> 수요공급 <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="동 이름이 어디서 왔는지" @mouseenter="noteEnter('dong', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('dong', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'dong'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('dong')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span></strong>
              <button v-if="!editingSurvey.demand" class="adp-edit-btn" type="button" @click.stop="editingSurvey.demand = true"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
              <button v-else class="adp-edit-btn save" type="button" @click.stop="saveSurveyAndClose('demand')">💾 저장</button>
            </div>

            <!-- ① 기준수치 — 이름 칸에 대면 설명이 뜬다(칸이 작아 아이콘만으로는 누르기 어렵다) -->
            <div class="adp-dm-block">
              <div class="adp-dm-block-head">
                <span class="t">① 수치입력</span>
              </div>
              <div class="adp-dm-rowwrap">
              <div class="adp-mkt-cells c3 adp-dm-table">
                <div :class="['cell split', { lit: dmLit('deal') }]" @mouseenter="dmLitEnter('deal')" @mouseleave="dmLitLeave()" @click="dmLitTap('deal')">
                  <div class="cell-head">
                    <button type="button" class="adp-dm-link" @click.stop="openMolitRtSite">최근 12개월 거래량</button>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('deal')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'deal' ? '' : 'deal'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" />
                      </svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <span v-if="editingSurvey.demand" class="adp-dm-pair">
                      <input class="adp-mkt-input" inputmode="numeric" :value="fieldVal('fs.dm.deal12m')" :placeholder="deal12mAuto > 0 ? String(deal12mAuto) : '입력'" @input="setDmVal('fs.dm.deal12m', ($event.target as HTMLInputElement).value)" />
                    </span>
                    <strong v-else class="hi-blue adp-dm-two"><em class="adp-dm-pre">연</em><span class="num">{{ dmIntText(deal12mValue) }}</span><em class="adp-dm-bar">|</em><em class="adp-dm-pre">월</em><span class="num">{{ dmIntText(dmMonthly) }}</span></strong>
                  </div>
                </div>
                <div :class="['cell split', { lit: dmLit('units') }]" @mouseenter="dmLitEnter('units')" @mouseleave="dmLitLeave()" @click="dmLitTap('units')">
                  <div class="cell-head">
                    <button type="button" class="adp-dm-link" @click.stop="openHouseholdLookup">총 세대수</button>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('units')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'units' ? '' : 'units'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <span v-if="editingSurvey.demand" class="adp-dm-pair">
                      <input class="adp-mkt-input" inputmode="numeric" :value="fieldVal('fs.dm.units')" :placeholder="unitsAuto > 0 ? String(unitsAuto) : '입력'" @input="setDmVal('fs.dm.units', ($event.target as HTMLInputElement).value)" />
                    </span>
                    <strong v-else class="hi-blue"><span class="num">{{ dmIntText(dmUnits) }}</span></strong>
                  </div>
                </div>
                <div :class="['cell split', { lit: dmLit('listings') }]" @mouseenter="dmLitEnter('listings')" @mouseleave="dmLitLeave()" @click="dmLitTap('listings')">
                  <div class="cell-head">
                    <button type="button" class="adp-dm-link" @click.stop="openListingLookup">총 매물수</button>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('listings')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'listings' ? '' : 'listings'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <span v-if="editingSurvey.demand" class="adp-dm-pair">
                      <input class="adp-mkt-input" inputmode="numeric" :value="fieldVal('fs.dm.listings')" placeholder="입력" @input="setListingsVal(($event.target as HTMLInputElement).value)" />
                    </span>
                    <strong v-else class="hi-blue"><span class="num">{{ dmIntText(dmListings) }}</span></strong>
                  </div>
                </div>
              </div>
              <p v-if="dmTip && DM_ROW1.includes(dmTip)" class="adp-dm-bubble" :style="{ '--arrow': dmTipData[dmTip].arrow }" @click="dmTip = ''">
                <span v-for="(row, ri) in dmTipData[dmTip].rows" :key="ri" :class="{ good: row[0] === '적정' }"><b :class="{ act: tipAct(row[0]) }">{{ tipLabel(row[0]) }}</b>{{ row[1] }}</span>
              </p>
              </div>
            </div>

            <!-- ② 지표 — 이름 칸에 대면 계산식이 뜬다 -->
            <div class="adp-dm-block">
              <div class="adp-dm-block-head">
                <span class="t">② 지표결과</span>
                <div class="adp-dm-total">
                  <span class="lab">종합</span>
                  <button
                    type="button"
                    class="adp-dm-info"
                    aria-label="설명"
                    @mouseenter="tipEnter('total')"
                    @mouseleave="tipLeave()"
                    @click.stop="dmTip = dmTip === 'total' ? '' : 'total'"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" />
                    </svg>
                  </button>
                  <span class="adp-dm-arrow">›</span>
                  <strong :class="['adp-dm-grade', `g-${levelTone(dmTotalGrade)}`]">{{ dmTotalGrade }}</strong>
                  <span v-if="dmTotalGrade !== '-'" :class="['adp-dm-fit', { bad: dmTotalGrade === 'C' }]">/ {{ dmFitText(dmTotalGrade) }}</span>
                </div>
              </div>
              <div class="adp-dm-rowwrap">
              <div class="adp-mkt-cells c4 adp-dm-table">
                <div :class="['cell split calc', { lit: dmLit('turn') }]" @mouseenter="dmLitEnter('turn')" @mouseleave="dmLitLeave()" @click="dmLitTap('turn')">
                  <div class="cell-head">
                    <small>거래 회전율</small>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('turn')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'turn' ? '' : 'turn'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" />
                      </svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <strong class="hi-blue"><em class="adp-dm-pre">연</em><span class="num">{{ dmRateText(dmTurnover) }}</span><em>%</em></strong>
                  </div>
                  <div class="cell-grade">
                    <strong :class="['adp-dm-grade', `g-${levelTone(dmTurnGrade)}`]">{{ dmTurnGrade }}</strong>
                    <span v-if="dmTurnGrade !== '-'" :class="['adp-dm-fit', { bad: dmTurnGrade === 'C' }]">/ {{ dmFitText(dmTurnGrade) }}</span>
                  </div>
                </div>
                <div :class="['cell split calc', { lit: dmLit('absorb') }]" @mouseenter="dmLitEnter('absorb')" @mouseleave="dmLitLeave()" @click="dmLitTap('absorb')">
                  <div class="cell-head">
                    <small>매물 소화율</small>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('absorb')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'absorb' ? '' : 'absorb'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" />
                      </svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <strong class="hi-blue"><em class="adp-dm-pre">연</em><span class="num">{{ dmRateText(dmAbsorb) }}</span><em>%</em></strong>
                  </div>
                  <div class="cell-grade">
                    <strong :class="['adp-dm-grade', `g-${levelTone(dmAbsorbGrade)}`]">{{ dmAbsorbGrade }}</strong>
                    <span v-if="dmAbsorbGrade !== '-'" :class="['adp-dm-fit', { bad: dmAbsorbGrade === 'C' }]">/ {{ dmFitText(dmAbsorbGrade) }}</span>
                  </div>
                </div>
                <div :class="['cell split calc', { lit: dmLit('burden') }]" @mouseenter="dmLitEnter('burden')" @mouseleave="dmLitLeave()" @click="dmLitTap('burden')">
                  <div class="cell-head">
                    <small>매물 부담률</small>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('burden')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'burden' ? '' : 'burden'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" />
                      </svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <strong class="hi-blue"><span class="num">{{ dmRateText(dmBurden) }}</span><em>%</em></strong>
                  </div>
                  <div class="cell-grade">
                    <strong :class="['adp-dm-grade', `g-${levelTone(dmBurdenGrade)}`]">{{ dmBurdenGrade }}</strong>
                    <span v-if="dmBurdenGrade !== '-'" :class="['adp-dm-fit', { bad: dmBurdenGrade === 'C' }]">/ {{ dmFitText(dmBurdenGrade) }}</span>
                  </div>
                </div>
                <div :class="['cell split calc', { lit: dmLit('clear') }]" @mouseenter="dmLitEnter('clear')" @mouseleave="dmLitLeave()" @click="dmLitTap('clear')">
                  <div class="cell-head">
                    <small>매물 소진기간</small>
                    <button
                      type="button"
                      class="adp-dm-info"
                      aria-label="설명"
                      @mouseenter="tipEnter('clear')"
                      @mouseleave="tipLeave()"
                      @click.stop="dmTip = dmTip === 'clear' ? '' : 'clear'"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" />
                      </svg>
                    </button>
                  </div>
                  <div class="cell-body">
                    <strong class="hi-blue adp-dm-clear"><template v-for="(part, pi) in dmClearParts" :key="pi"><span :class="['num', { 'adp-dm-slash': part[0] === '/', 'adp-dm-gap': pi > 0 && part[0] !== '/' && !!dmClearParts[pi - 1][1] }]">{{ part[0] }}</span><em v-if="part[1]">{{ part[1] }}</em></template></strong>
                  </div>
                  <div class="cell-grade">
                    <strong :class="['adp-dm-grade', `g-${levelTone(dmClearGrade)}`]">{{ dmClearGrade }}</strong>
                    <span v-if="dmClearGrade !== '-'" :class="['adp-dm-fit', { bad: dmClearGrade === 'C' }]">/ {{ dmFitText(dmClearGrade) }}</span>
                  </div>
                </div>
              </div>
              <p v-if="dmTip && !DM_ROW1.includes(dmTip) && !DM_ROW3.includes(dmTip)" class="adp-dm-bubble" :style="{ '--arrow': dmTipData[dmTip].arrow }" @click="dmTip = ''">
                <span v-for="(row, ri) in dmTipData[dmTip].rows" :key="ri" :class="{ good: row[0] === '적정' }"><b :class="{ act: tipAct(row[0]) }">{{ tipLabel(row[0]) }}</b>{{ row[1] }}</span>
              </p>
              </div>
            </div>

            <div class="adp-dm-head sec2">
              <strong class="adp-dm-title">2. 입지/개별성<small>(구역내등수)</small></strong>
            </div>

            <!-- ① 입지조사 -->
            <div class="adp-dm-block boxed">
            <div class="adp-dm-sub">① 입지조사 사진<PhotoCountMark :n="photoAreaCount('areaSurvey')" /> <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('loc', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('loc', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'loc'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('loc')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span><button type="button" class="adp-photo-fold" :aria-label="photoFolded('areaSurvey') ? '펼치기' : '접기'" @click.stop="togglePhotoFold('areaSurvey')"><img :src="chevronDownIcon" :class="['adp-chev', { up: photoFolded('areaSurvey') }]" alt="" /></button></div>
            <div v-for="item in AREA_SURVEY_ITEMS.filter((i) => isApartment || !i.aptOnly)" v-show="!photoFolded('areaSurvey')" :key="item.key" class="adp-sub-block">
              <div v-if="item.title" class="adp-sub-head">
                <h3>{{ item.title }}<PhotoCountMark :n="extraList(item.key).length" /> <span v-if="item.note" class="adp-survey-note-inline">{{ item.note }}</span></h3>
              </div>
              <div class="adp-plan-row">
                <input
                  :value="extraInput[item.key] ?? ''"
                  placeholder="링크 또는 이미지 붙여넣기"
                  class="adp-input"
                  @input="extraInput = { ...extraInput, [item.key]: ($event.target as HTMLInputElement).value }"
                  @keydown.enter.prevent="addExtraUrl(item.key)"
                  @paste="pasteImageInto($event, `x:${item.key}`)"
                />
                <button type="button" class="adp-icn-btn" @click="addExtraUrl(item.key)">+</button>
              </div>
              <p v-if="extraErr[item.key]" class="adp-plan-err">{{ extraErr[item.key] }}</p>
              <div v-for="(url, i) in extraList(item.key)" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" :alt="item.title" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="사진 삭제" @click="removeExtraAt(item.key, i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
              <div class="adp-photo-note">
                <input
                  class="adp-fs-input"
                  placeholder="비고"
                  :value="fieldVal(`fs.${item.key}.note`)"
                  @input="setExtraNote(item.key, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            </div>

            <!-- ② 실사용자 + 입지등수 -->
            <div class="adp-dm-block boxed">
            <div class="adp-dm-sub">② 실사용자 + 입지등수 <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('rank', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('rank', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'rank'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('rank')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span><button type="button" :class="['adp-rank-reset', { off: !hasTypedRank }]" :disabled="!hasTypedRank" title="손으로 적은 등수를 지우고 자동값으로" @click.stop="resetRanks"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v5h5" /></svg>자동으로</button></div>
            <table class="adp-table adp-ruser-table">
              <colgroup>
              <col style="width: 33%" /><col style="width: 21%" /><col style="width: 18%" /><col style="width: 13%" /><col style="width: 15%" />
              </colgroup>
              <thead>
              <tr>
                <th>전용면적</th>
                <th>세대구성</th>
                <th>입지조건</th>
                <th>등수</th>
                <th>평균등수</th>
              </tr>
              </thead>
              <tbody>
              <tr>
                <td class="adp-ruser-cell vmid">
                <div class="adp-rcase-dd">
                  <button type="button" class="adp-rcase-select adp-ruser-select" @click="bandOpen = !bandOpen">
                    <span class="adp-ruser-pick">
                      <span class="band">{{ selectedRealUserBand ? selectedRealUserBand.title : '면적 선택' }}</span>
                      <span v-if="selectedRealUserBandM2" class="rooms">{{ selectedRealUserBandM2 }}</span>
                    </span>
                    <span class="adp-rcase-caret">{{ bandOpen ? '▴' : '▾' }}</span>
                  </button>
                  <template v-if="bandOpen">
                    <div class="adp-rcase-backdrop" @click="bandOpen = false" />
                    <ul class="adp-rcase-list adp-ruser-list">
                      <li
                        :class="['adp-rcase-item', { on: !selectedRealUserBand }]"
                        @click="pickRealUserBand('')"
                      >
                        <strong>면적 선택</strong>
                      </li>
                      <li
                        v-for="b in REAL_USER_BANDS"
                        :key="b.id"
                        :class="['adp-rcase-item', { on: b.id === selectedRealUserBand?.id }]"
                        @click="pickRealUserBand(b.id)"
                      >
                        <strong>{{ b.title }}</strong>
                      </li>
                    </ul>
                  </template>
                </div>
                <div class="adp-rcase-dd adp-ruser-room">
                  <button type="button" class="adp-rcase-select adp-ruser-select room" @click="roomOpen = !roomOpen">
                    <span class="adp-ruser-pick">
                      <span class="band">{{ selectedRoomType ? selectedRoomType.label : '룸수 선택' }}</span>
                    </span>
                    <span class="adp-rcase-caret">{{ roomOpen ? '▴' : '▾' }}</span>
                  </button>
                  <template v-if="roomOpen">
                    <div class="adp-rcase-backdrop" @click="roomOpen = false" />
                    <ul class="adp-rcase-list adp-ruser-list">
                      <li
                        :class="['adp-rcase-item', { on: !selectedRoomType }]"
                        @click="pickRoomType('')"
                      >
                        <strong>룸수 선택</strong>
                      </li>
                      <li
                        v-for="r in ROOM_TYPES"
                        :key="r.id"
                        :class="['adp-rcase-item', { on: r.id === selectedRoomType?.id }]"
                        @click="pickRoomType(r.id)"
                      >
                        <strong>{{ r.label }}</strong>
                        <small>{{ r.details.map((d) => d.who).join(' · ') }}</small>
                      </li>
                    </ul>
                  </template>
                </div>
                </td>
                <td class="adp-ruser-cell">
                <div v-for="d in selectedRoomType?.details ?? []" :key="d.who" class="adp-ruser-line">
                  <strong>{{ d.who }}</strong>
                  <span v-for="k in d.kinds" :key="k" class="kind">{{ k }}</span>
                </div>
                </td>
                <!-- 입지조건 이름과 등수 입력을 열로 나눠 줄을 맞춘다 -->
                <td class="adp-ruser-cell">
                <div v-for="c in rankConditions" :key="c" class="adp-ruser-cond-row">
                  <span class="adp-ruser-cond-name">{{ c }}</span>
                </div>
                </td>
                <td class="adp-ruser-cell center">
                <div v-for="c in rankConditions" :key="c" class="adp-ruser-cond-row center">
                  <input
                    :class="['adp-ruser-rank', { typed: !!rankOf(c) }]"
                    inputmode="numeric"
                    placeholder="입력"
                    :title="autoRankNote(c)"
                    :value="rankValue(c)"
                    @input="setRank(c, ($event.target as HTMLInputElement).value)"
                  />
                </div>
                </td>
                <td class="adp-ruser-cell center vmid">
                <template v-if="realUserRankSummary.filled > 0">
                  <strong class="adp-ruser-sum">{{ realUserRankSummary.avg }}</strong>
                </template>
                <span v-else class="adp-na">-</span>
                </td>
              </tr>
              </tbody>
            </table>

            </div>

            <!-- ③ 개별성 분석 -->
            <div class="adp-dm-block boxed">
            <div class="adp-dm-sub">
              ③ 개별성 분석 <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('indiv', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('indiv', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'indiv'" class="adp-note-bubble" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''">해당 경매물건 분석 → 유사 빌라 비교 (호갱, 네부, 감평서)</span></span>
              <button v-if="!editingSurvey.individuality" class="adp-edit-btn" type="button" @click.stop="editingSurvey.individuality = true"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
              <button v-else class="adp-edit-btn save" type="button" @click.stop="saveSurveyAndClose('individuality')">💾 저장</button>
            </div>
          <div class="adp-ind-body">
            <table class="adp-table adp-ind-table">
              <colgroup>
                <col style="width: 96px" /><col /><col style="width: 68px" />
              </colgroup>
              <tbody v-for="g in INDIV_GROUPS" :key="g.title">
                <tr class="adp-ind-group"><th colspan="3">{{ g.title }}</th></tr>
                <tr v-for="item in g.items" :key="item.id">
                  <th :class="['adp-ind-label', { survey: item.survey }]">{{ item.label }}</th>
                  <td class="adp-ind-ctl">
                    <div :class="['row', { left: editingSurvey.individuality && (item.yearMonth || item.half) }]">
                      <template v-if="item.yearMonth">
                        <button
                          v-if="editingSurvey.individuality"
                          type="button"
                          class="adp-ind-input adp-ind-year"
                          @click="indivAgeOpen = true"
                        >{{ indivValue('ind.age') || '연월 선택' }}</button>
                        <strong v-else>{{ indivValue('ind.age') || '-' }}</strong>
                        <span v-if="indivAgeYears" class="adp-ind-years">/ {{ indivAgeYears }}</span>
                      </template>
                      <template v-else-if="item.custom === 'units'">
                        <span v-if="editingSurvey.individuality" class="adp-sum-pair units">
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.units')" placeholder="세대수" @input="setSumVal('sum.units', ($event.target as HTMLInputElement).value)" />세대 /
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.areaUnits')" placeholder="해당면적" @input="setSumVal('sum.areaUnits', ($event.target as HTMLInputElement).value)" />세대
                        </span>
                        <strong v-else>{{ indivUnitsText }}</strong>
                      </template>
                      <template v-else-if="item.custom === 'dong'">
                        <span v-if="editingSurvey.individuality" class="adp-sum-pair">
                          총<input class="adp-ind-input" inputmode="numeric" :value="indivValue('ind.dongTotal')" placeholder="0" @input="setIndivValue('ind.dongTotal', ($event.target as HTMLInputElement).value)" />개동 /
                          입지조건<input class="adp-ind-input" :value="indivValue('ind.dongNote')" placeholder="500m내" @input="setIndivValue('ind.dongNote', ($event.target as HTMLInputElement).value)" />
                        </span>
                        <strong v-else>{{ indivDongText }}</strong>
                      </template>
                      <template v-else-if="item.custom === 'floor'">
                        <span v-if="editingSurvey.individuality" class="adp-sum-pair">
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.floorTotal')" placeholder="전체" @input="setSumVal('sum.floorTotal', ($event.target as HTMLInputElement).value)" />층 중
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.floorCurrent')" placeholder="해당" @input="setSumVal('sum.floorCurrent', ($event.target as HTMLInputElement).value)" />층 /
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.ho')" placeholder="호" @input="setSumVal('sum.ho', ($event.target as HTMLInputElement).value)" />호
                        </span>
                        <strong v-else>{{ indivFloorText }}</strong>
                      </template>
                      <template v-else-if="item.combo">
                        <strong v-if="!editingSurvey.individuality">{{ indivValue(item.id) || '-' }}</strong>
                        <div v-else class="adp-agency-multi adp-ind-multi">
                          <button
                            type="button"
                            class="adp-ind-input adp-agency-trigger"
                            @click="indivMultiOpen = indivMultiOpen === item.id ? '' : item.id"
                          >
                            <span :class="['txt', { ph: !indivValue(item.id) }]">{{ indivValue(item.id) || '선택' }}</span>
                            <span class="caret">▾</span>
                          </button>
                          <template v-if="indivMultiOpen === item.id">
                            <div class="adp-agency-backdrop" @click="indivMultiOpen = ''" />
                            <ul class="adp-agency-options">
                              <li
                                v-for="opt in item.options"
                                :key="opt"
                                :class="['adp-agency-option', { on: indivValue(item.id) === opt }]"
                                @click="pickIndivCombo(item.id, opt)"
                              >
                                <span>{{ opt }}</span>
                                <span v-if="indivValue(item.id) === opt" class="ck">✓</span>
                              </li>
                              <li class="adp-ind-combo-custom">
                                <input
                                  v-model="indivComboText"
                                  placeholder="직접 입력"
                                  @keydown.enter.prevent="applyIndivCombo(item.id)"
                                />
                                <button type="button" @click="applyIndivCombo(item.id)">확인</button>
                              </li>
                            </ul>
                          </template>
                        </div>
                      </template>
                      <template v-else-if="editingSurvey.individuality">
                        <span v-if="item.text && item.suffix" class="adp-ind-suffix">
                          <input
                            class="adp-ind-input"
                            inputmode="decimal"
                            :value="indivValue(item.id).replace(/[^\d.]/g, '')"
                            placeholder="0"
                            @input="setIndivValue(item.id, ($event.target as HTMLInputElement).value.replace(/[^\d.]/g, ''))"
                          />{{ item.suffix }}
                        </span>
                        <input
                          v-else-if="item.text"
                          :class="['adp-ind-input', { half: item.half }]"
                          :value="indivValue(item.id)"
                          placeholder="입력"
                          @input="setIndivValue(item.id, ($event.target as HTMLInputElement).value)"
                        />
                        <div v-else-if="item.multi" class="adp-agency-multi adp-ind-multi">
                          <button
                            type="button"
                            class="adp-ind-input adp-agency-trigger"
                            @click="indivMultiOpen = indivMultiOpen === item.id ? '' : item.id"
                          >
                            <span :class="['txt', { ph: !indivValue(item.id) }]">{{ indivValue(item.id) || '선택' }}</span>
                            <span class="caret">▾</span>
                          </button>
                          <template v-if="indivMultiOpen === item.id">
                            <div class="adp-agency-backdrop" @click="indivMultiOpen = ''" />
                            <ul class="adp-agency-options">
                              <li
                                v-for="opt in item.options"
                                :key="opt"
                                :class="['adp-agency-option', { on: indivList(item.id).includes(opt) }]"
                                @click="toggleIndivMulti(item.id, opt)"
                              >
                                <span>{{ opt }}</span>
                                <span v-if="indivList(item.id).includes(opt)" class="ck">✓</span>
                              </li>
                            </ul>
                          </template>
                        </div>
                        <!-- 선택지가 셋 이하면 콤보 대신 버튼으로 바로 고른다 (다시 누르면 해제) -->
                        <span v-else-if="(item.options?.length ?? 0) <= 3" class="adp-ind-toggles">
                          <button
                            v-for="opt in item.options"
                            :key="opt"
                            type="button"
                            :class="['adp-toggle-btn', { active: indivValue(item.id) === opt }]"
                            @click="setIndivValue(item.id, indivValue(item.id) === opt ? '' : opt)"
                          >{{ opt }}</button>
                        </span>
                        <select
                          v-else
                          class="adp-ind-input"
                          :value="indivValue(item.id)"
                          @input="setIndivValue(item.id, ($event.target as HTMLSelectElement).value)"
                        >
                          <option value="">선택</option>
                          <option v-for="opt in item.options" :key="opt" :value="opt">{{ opt }}</option>
                        </select>
                        <template v-if="item.sub">
                          <div v-if="item.sub.combo" class="adp-agency-multi adp-ind-multi">
                            <button
                              type="button"
                              class="adp-ind-input adp-agency-trigger"
                              @click="indivMultiOpen = indivMultiOpen === item.sub!.id ? '' : item.sub!.id"
                            >
                              <span :class="['txt', { ph: !indivValue(item.sub.id) }]">{{ indivValue(item.sub.id) || item.sub.label }}</span>
                              <span class="caret">▾</span>
                            </button>
                            <template v-if="indivMultiOpen === item.sub.id">
                              <div class="adp-agency-backdrop" @click="indivMultiOpen = ''" />
                              <ul class="adp-agency-options">
                                <li
                                  v-for="opt in item.sub.options"
                                  :key="opt"
                                  :class="['adp-agency-option', { on: indivValue(item.sub!.id) === opt }]"
                                  @click="pickIndivCombo(item.sub!.id, opt)"
                                >
                                  <span>{{ opt }}</span>
                                  <span v-if="indivValue(item.sub!.id) === opt" class="ck">✓</span>
                                </li>
                                <li class="adp-ind-combo-custom">
                                  <input
                                    v-model="indivComboText"
                                    placeholder="직접 입력"
                                    @keydown.enter.prevent="applyIndivCombo(item.sub!.id)"
                                  />
                                  <button type="button" @click="applyIndivCombo(item.sub!.id)">확인</button>
                                </li>
                              </ul>
                            </template>
                          </div>
                          <select
                            v-else
                            class="adp-ind-input"
                            :value="indivValue(item.sub.id)"
                            @input="setIndivValue(item.sub!.id, ($event.target as HTMLSelectElement).value)"
                          >
                            <option value="">{{ item.sub.label }}</option>
                            <option v-for="opt in item.sub.options" :key="opt" :value="opt">{{ opt }}</option>
                          </select>
                        </template>
                      </template>
                      <template v-else>
                        <strong v-if="item.id === 'ind.parking'">{{ indivParkingText }}</strong>
                        <template v-else>
                          <strong>{{ indivDisplay(item) }}</strong>
                          <strong v-if="item.sub">/ {{ indivValue(item.sub.id) || '-' }}</strong>
                        </template>
                      </template>
                      <span v-if="item.id === 'ind.parking' && editingSurvey.individuality && indivParkingPerHome" class="adp-ind-years">/ {{ indivParkingPerHome }}</span>
                    </div>
                  </td>
                  <td class="adp-ind-rate">
                    <span v-if="editingSurvey.individuality" class="adp-ind-rate-row">
                      <input
                        class="adp-ind-input rate"
                        :value="indivValue(`${item.id}.rate`)"
                        :placeholder="indivRateNum(item)"
                        @input="setIndivValue(`${item.id}.rate`, ($event.target as HTMLInputElement).value.replace('%', '').trim())"
                      />%
                    </span>
                    <span v-else>{{ indivRateOf(item) }}</span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th class="adp-ind-label">실거래가 조건분석 평균</th>
                  <!-- 가격정보 ③ 의 국토부 실거래 평균을 그대로 비춘다 — 손으로 적지 않는다.
                       조건(기간·면적·연식)을 바꾸면 여기와 손품결론이 같이 움직인다 -->
                  <td class="adp-ind-ctl">
                    <div class="row"><strong>{{ mktSaleAvgText }}</strong></div>
                  </td>
                  <td class="adp-ind-rate">{{ indivRateTotal }}%</td>
                </tr>
                <tr>
                  <th class="adp-ind-label">개별성 적용가</th>
                  <!-- 조건분석 평균과 같은 칸에 두어야 숫자 앞자리가 세로로 맞는다 -->
                  <td class="adp-ind-ctl">
                    <div class="row"><strong class="hi">{{ indivAdjustedPrice }}</strong></div>
                  </td>
                  <td class="adp-ind-rate" />
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
          </div>
        </section>

        <!-- 실거래가 조사 -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head" @click="toggleSection('survPrice')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/></svg>급매가</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('survPrice') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('survPrice')" class="adp-mkt-body">
            <div class="adp-dm-head">
              <strong class="adp-dm-title">1. 실거래가 조사 <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('deal', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('deal', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'deal'" class="adp-note-bubble" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''">유사 입지·개별성 필터 적용 (네부)</span></span></strong>
              <button v-if="!editingSurvey.deal" class="adp-edit-btn" type="button" @click.stop="editingSurvey.deal = true"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
              <button v-else class="adp-edit-btn save" type="button" @click.stop="saveSurveyAndClose('deal')">💾 저장</button>
            </div>

            <!-- ① 평단가 비교 사진 -->
            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">① 평단가 비교 사진<PhotoCountMark :n="photoAreaCount('tradePhoto')" /></span>
                <button type="button" class="adp-photo-fold" :aria-label="photoFolded('tradePhoto') ? '펼치기' : '접기'" @click.stop="togglePhotoFold('tradePhoto')"><img :src="chevronDownIcon" :class="['adp-chev', { up: photoFolded('tradePhoto') }]" alt="" /></button>
              </div>
              <div v-if="!photoFolded('tradePhoto')" class="adp-plan-row">
                <input
                  v-model="tradePhotoInput"
                  placeholder="링크 또는 이미지 붙여넣기"
                  class="adp-input"
                  @keydown.enter.prevent="addTradePhotoUrl"
                  @paste="pasteImageInto($event, 'tradePhoto')"
                />
                <button type="button" class="adp-icn-btn" @click="addTradePhotoUrl">+</button>
              </div>
              <p v-if="tradePhotoErrMsg && !photoFolded('tradePhoto')" class="adp-plan-err">{{ tradePhotoErrMsg }}</p>
              <div v-for="(url, i) in (photoFolded('tradePhoto') ? [] : tradePhotoList)" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" alt="실거래가 현황 사진" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="실거래가 현황 사진 삭제" @click="removeTradePhotoAt(i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
            </div>


            <!-- ② 실거래가 — 예전 '평단가' 블록을 이 줄에 합쳤다 (실거래가 옆이 평단가) -->
            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">② <span :class="['mode', { sim: mktMode('d') === '유사물건' }]">{{ mktModeLabel('d', '경매지번', '유사물건') }}</span> 실거래가<em class="adp-mkt-auto">(매매·전세)</em><span class="adp-note-wrap"><button type="button" class="adp-note-btn adp-send-mark" aria-label="이 값이 어디서 오는지" @mouseenter="noteEnter('recv', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('recv', $event)"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="m3 11 18-8-8 18-2-7z" /></svg></button><span v-if="noteTip === 'recv'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('recv')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span></span>
                <button
                  type="button"
                  :class="['adp-mkt-mode', { sim: mktMode('d') === '유사물건' }]"
                  title="누를 때마다 경매물건 ↔ 유사물건"
                  @click="toggleMktMode('d')"
                >{{ mktMode('d') }}</button>
              </div>
              <div class="adp-mkt-cells c4 adp-dm-table center-y">
                <div :class="['cell', { lit: mktLit('area') }]" @mouseenter="litEnter('area')" @mouseleave="litLeave()" @click="litTap('area')">
                  <small>전용면적</small>
                  <span v-if="mktCaseEditable" class="adp-mkt-unit">
                    <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum(mk('d', 'area'))" placeholder="0" @input="setMktVal(mk('d', 'area'), ($event.target as HTMLInputElement).value)" />㎡
                  </span>
                  <strong v-else class="adp-mkt-area1">{{ mktAreaText(mk('d', 'area')) }}</strong>
                </div>
                <div :class="['cell', { lit: mktLit('date') }]" @mouseenter="litEnter('date')" @mouseleave="litLeave()" @click="litTap('date')">
                  <small>거래일자 / 층</small>
                  <template v-if="mktCaseEditable">
                    <button
                      type="button"
                      class="adp-mkt-input adp-mkt-ym"
                      @click="mktDealYmKey = mk('d', 'year')"
                    >{{ mktVal(mk('d', 'year')) || '연월일' }}</button>
                    <input class="adp-mkt-input adp-mkt-floor" :value="mktVal(mk('d', 'floor'))" :placeholder="(mktMode('d') === MKT_MODES[0] ? subjectFloor : '') || '층'" @input="setMktVal(mk('d', 'floor'), ($event.target as HTMLInputElement).value)" />
                  </template>
                  <strong v-else class="adp-mkt-area1">{{ mktDealDateFloorText }}</strong>
                </div>
                <div :class="['cell', { lit: mktLit('real') }]" @mouseenter="litEnter('real')" @mouseleave="litLeave()" @click="litTap('real')">
                  <small>매매 실거래가</small>
                  <FormattedNumberInput v-if="mktCaseEditable" :model-value="mktVal(mk('d', 'real'))" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal(mk('d', 'real'), $event)" />
                  <strong v-else class="hi">{{ mktMoney(mk('d', 'real')) }}</strong>
                </div>
                <div :class="['cell calc', { lit: mktLit('unit') }]" @mouseenter="litEnter('unit')" @mouseleave="litLeave()" @click="litTap('unit')">
                  <small>평단가</small>
                  <strong class="hi">{{ mktUnitFromRealText }}</strong>
                </div>
              </div>
              <!-- 전세 줄 — 매매 줄과 같은 네 칸. 단지전체 표의 전세 옆 비행기가 여기로 들어온다 -->
              <div class="adp-mkt-cells c4 adp-dm-table center-y">
                <div :class="['cell', { lit: mktLit('jArea') }]" @mouseenter="litEnter('jArea')" @mouseleave="litLeave()" @click="litTap('jArea')">
                  <small>전용면적</small>
                  <span v-if="mktCaseEditable" class="adp-mkt-unit">
                    <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum(mk('d', 'jArea'))" placeholder="0" @input="setMktVal(mk('d', 'jArea'), ($event.target as HTMLInputElement).value)" />㎡
                  </span>
                  <strong v-else class="adp-mkt-area1">{{ mktAreaText(mk('d', 'jArea')) }}</strong>
                </div>
                <div :class="['cell', { lit: mktLit('jDate') }]" @mouseenter="litEnter('jDate')" @mouseleave="litLeave()" @click="litTap('jDate')">
                  <small>거래일자 / 층</small>
                  <template v-if="mktCaseEditable">
                    <button
                      type="button"
                      class="adp-mkt-input adp-mkt-ym"
                      @click="mktDealYmKey = mk('d', 'jYear')"
                    >{{ mktVal(mk('d', 'jYear')) || '연월일' }}</button>
                    <input class="adp-mkt-input adp-mkt-floor" :value="mktVal(mk('d', 'jFloor'))" :placeholder="(mktMode('d') === MKT_MODES[0] ? subjectFloor : '') || '층'" @input="setMktVal(mk('d', 'jFloor'), ($event.target as HTMLInputElement).value)" />
                  </template>
                  <strong v-else class="adp-mkt-area1">{{ mktJeonseDateFloorText }}</strong>
                </div>
                <div :class="['cell', { lit: mktLit('jReal') }]" @mouseenter="litEnter('jReal')" @mouseleave="litLeave()" @click="litTap('jReal')">
                  <small>전세 실거래가</small>
                  <FormattedNumberInput v-if="mktCaseEditable" :model-value="mktVal(mk('d', 'jReal'))" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal(mk('d', 'jReal'), $event)" />
                  <strong v-else class="hi">{{ mktMoney(mk('d', 'jReal')) }}</strong>
                </div>
                <!-- 전세가율은 세 번째 표로 옮겼다 — 자리는 비워 둔다 -->
                <div class="cell calc">
                  <small>&nbsp;</small>
                  <strong class="hi">&nbsp;</strong>
                </div>
              </div>
              <div class="adp-mkt-cells c4 adp-dm-table">
                <div :class="['cell', { lit: mktLit('pub') }]" @mouseenter="litEnter('pub')" @mouseleave="litLeave()" @click="litTap('pub')">
                  <small><button type="button" class="adp-dm-link" @click.stop="openOfficialPriceSite">공동주택가</button><span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('pubPrice', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('pubPrice', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'pubPrice'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('pubPrice')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span></small>
                  <FormattedNumberInput v-if="mktCaseEditable" :model-value="mktVal(mk('d', 'pub'))" mode="string" class="adp-mkt-input" :placeholder="officialPriceUsable > 0 ? officialPriceUsable.toLocaleString('ko-KR') : '0'" @update:model-value="setMktVal(mk('d', 'pub'), $event)" />
                  <strong v-else class="hi">{{ mktPubText }}</strong>
                </div>
                <div :class="['cell calc', { lit: mktLit('jeonse') }]" @mouseenter="litEnter('jeonse')" @mouseleave="litLeave()" @click="litTap('jeonse')">
                  <small class="adp-mkt-rate">
                    전세가
                    <template v-if="editingSurvey.deal">
                      <input class="adp-mkt-rate-input" inputmode="numeric" :value="mktVal(mk('d', 'rate'))" placeholder="127" @input="setMktVal(mk('d', 'rate'), ($event.target as HTMLInputElement).value)" />%
                    </template>
                    <template v-else>{{ mktJeonseRate }}%</template>
                    <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('jeonseRate', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('jeonseRate', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'jeonseRate'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('jeonseRate')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span>
                  </small>
                  <strong>{{ mktJeonseFromPub }}</strong>
                </div>
                <div :class="['cell calc', { lit: mktLit('saleRatio') }]" @mouseenter="litEnter('saleRatio')" @mouseleave="litLeave()" @click="litTap('saleRatio')">
                  <small>전세가율 / 갭<span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('jeonseRatio', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('jeonseRatio', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'jeonseRatio'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('jeonseRatio')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span></small>
                  <strong class="adp-mkt-gap-wrap">{{ mktJeonseToSale }}<em v-if="mktGapText" class="adp-mkt-gap"> / {{ mktGapText }}</em></strong>
                </div>
                <div :class="['cell calc', { lit: mktLit('pubRatio') }]" @mouseenter="litEnter('pubRatio')" @mouseleave="litLeave()" @click="litTap('pubRatio')">
                  <small>공시대비율<span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('pubRatio', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('pubRatio', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'pubRatio'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('pubRatio')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span></small>
                  <strong>{{ mktCaseRatio }}</strong>
                </div>
              </div>
            </div>

            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head wrapy">
                <span class="t">③ 실거래가 조건분석<em class="adp-mkt-auto">(자동입력)</em></span>
                <!-- 가격정보 탭에서 조회한 지역·건수와 조회 시각을 같이 보여 준다 -->
                <small class="adp-mkt-region">
                  <span class="adp-tab-dot" /> {{ publicRealTradeSigungu || '주변' }} {{ publicRealTradeDong || '실거래가' }} ({{ filteredPublicTradeRows.length }}건)
                </small>
              </div>
              <div class="adp-mkt-cells c3 adp-dm-table center-y">
                <div class="cell calc">
                  <small>전용면적범위</small>
                  <span class="adp-mkt-range2">{{ mktAreaRangeText }}</span>
                </div>
                <div class="cell calc">
                  <small>사용승인 / 거래기간</small>
                  <span class="adp-mkt-range2">{{ mktApprovalText }}<br />{{ mktPeriodText }}</span>
                </div>
                <div class="cell calc">
                  <small>국토부 실거래 평균</small>
                  <strong class="hi">{{ mktSaleAvgText }}</strong>
                </div>
              </div>
            </div>

            <div class="adp-dm-head sec2">
              <strong class="adp-dm-title">2. 네이버 매물조사 <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('cheap', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('cheap', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'cheap'" class="adp-note-bubble" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''">유사 입지·개별성 필터 적용 (네부)</span></span></strong>
              <button v-if="!editingSurvey.listing" class="adp-edit-btn" type="button" @click.stop="editingSurvey.listing = true"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
              <button v-else class="adp-edit-btn save" type="button" @click.stop="saveSurveyAndClose('listing')">💾 저장</button>
            </div>

            <!-- ① 해당 빌라 저가 매물 — 줄을 늘려 가며 적는다 -->
            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">① <span :class="['mode', { sim: mktMode('c') === '유사물건' }]">{{ mktModeLabel('c', '경매빌라', '유사빌라') }}</span> 매물호가</span>
                <span v-if="editingSurvey.listing" class="adp-mkt-step">
                  <span class="lab">행</span>
                  <button type="button" aria-label="행 삭제" :disabled="lowRowCount <= 1" @click="removeLowRow">−</button>
                  <button type="button" aria-label="행 추가" :disabled="lowRowCount >= LOW_ROW_MAX" @click="addLowRow">＋</button>
                </span>
                <button
                  type="button"
                  :class="['adp-mkt-mode', { sim: mktMode('c') === '유사물건' }]"
                  title="누를 때마다 경매물건 ↔ 유사물건"
                  @click="toggleMktMode('c')"
                >{{ mktMode('c') }}</button>
              </div>
              <template v-for="i in lowRowCount" :key="`low-${i}`">
                <div class="adp-mkt-cells c4 adp-dm-table">
                  <div class="cell">
                    <small>전용면적</small>
                    <span v-if="editingSurvey.listing" class="adp-mkt-unit">
                      <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum(lowKey(i - 1, 'area'))" placeholder="0" @input="setMktVal(lowKey(i - 1, 'area'), ($event.target as HTMLInputElement).value)" />㎡
                    </span>
                    <strong v-else class="adp-mkt-area1">{{ mktAreaText(lowKey(i - 1, 'area')) }}</strong>
                  </div>
                  <div class="cell">
                    <small>주소</small>
                    <input v-if="editingSurvey.listing" class="adp-mkt-input" :value="mktVal(lowKey(i - 1, 'addr'))" :placeholder="lowAddrAuto ? (subjectHasDong ? '동 · 층 · 호' : '층 · 호') : '빌라명 · 층 · 호'" @input="setMktVal(lowKey(i - 1, 'addr'), ($event.target as HTMLInputElement).value)" />
                    <strong v-else :class="['adp-mkt-area1', 'adp-mkt-addr2', { typed: lowAddrTyped(i - 1) }]">{{ lowAddrText(i - 1) }}</strong>
                  </div>
                  <div class="cell">
                    <small>평당가</small>
                    <FormattedNumberInput v-if="editingSurvey.listing" :model-value="mktVal(lowKey(i - 1, 'unit'))" mode="string" class="adp-mkt-input" :placeholder="lowUnitAuto(i - 1) > 0 ? lowUnitAuto(i - 1).toLocaleString('ko-KR') : '0'" @update:model-value="setMktVal(lowKey(i - 1, 'unit'), $event)" />
                    <strong v-else :class="{ typed: lowUnitTyped(i - 1) }">{{ lowUnitText(i - 1) }}</strong>
                  </div>
                  <div class="cell">
                    <small>매매호가 (저가)</small>
                    <FormattedNumberInput v-if="editingSurvey.listing" :model-value="mktVal(lowKey(i - 1, 'saleAsk'))" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal(lowKey(i - 1, 'saleAsk'), $event)" />
                    <strong v-else class="hi">{{ mktMoney(lowKey(i - 1, 'saleAsk')) }}</strong>
                  </div>
                  <div class="cell adp-mkt-wide">
                    <input v-if="editingSurvey.listing" class="adp-mkt-input" :value="mktVal(lowKey(i - 1, 'note'))" placeholder="비고" @input="setMktVal(lowKey(i - 1, 'note'), ($event.target as HTMLInputElement).value)" />
                    <strong v-else :class="{ filled: !!mktVal(lowKey(i - 1, 'note')) }">{{ mktVal(lowKey(i - 1, 'note')) || '비고' }}</strong>
                  </div>
                </div>
              </template>
            </div>

            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">② 네이버부동산 매물 사진(최저가)<PhotoCountMark :n="photoAreaCount('listPhoto')" /></span>
                <button type="button" class="adp-photo-fold" :aria-label="photoFolded('listPhoto') ? '펼치기' : '접기'" @click.stop="togglePhotoFold('listPhoto')"><img :src="chevronDownIcon" :class="['adp-chev', { up: photoFolded('listPhoto') }]" alt="" /></button>
              </div>
              <div v-if="!photoFolded('listPhoto')" class="adp-plan-row">
                <input
                  v-model="listPhotoInput"
                  placeholder="링크 또는 이미지 붙여넣기"
                  class="adp-input"
                  @keydown.enter.prevent="addListPhotoUrl"
                  @paste="pasteImageInto($event, 'listPhoto')"
                />
                <button type="button" class="adp-icn-btn" @click="addListPhotoUrl">+</button>
              </div>
              <p v-if="listPhotoErrMsg && !photoFolded('listPhoto')" class="adp-plan-err">{{ listPhotoErrMsg }}</p>
              <div v-for="(url, i) in (photoFolded('listPhoto') ? [] : listPhotoList)" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" alt="네이버부동산 매물 사진" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="네이버부동산 매물 사진 삭제" @click="removeListPhotoAt(i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
            </div>


            <!-- 3. 동일지번 매각물건 — 같은 번지에서 전에 팔린 물건. 값을 가늠하는 바로 옆 사례다 -->
            <div class="adp-dm-head sec2">
              <strong class="adp-dm-title">3. 동일지번 매각물건<PhotoCountMark :n="photoAreaCount('sameLot')" /> <span class="adp-dm-addr">{{ lotWithBuildingAddress }}</span></strong>
              <button type="button" class="adp-photo-fold" :aria-label="photoFolded('sameLot') ? '펼치기' : '접기'" @click.stop="togglePhotoFold('sameLot')"><img :src="chevronDownIcon" :class="['adp-chev', { up: photoFolded('sameLot') }]" alt="" /></button>
            </div>
            <div class="adp-sub-block noline">
              <div v-if="!photoFolded('sameLot')" class="adp-plan-row">
                <input
                  :value="extraInput.sameLot ?? ''"
                  placeholder="링크 또는 이미지 붙여넣기"
                  class="adp-input"
                  @input="extraInput = { ...extraInput, sameLot: ($event.target as HTMLInputElement).value }"
                  @keydown.enter.prevent="addExtraUrl('sameLot')"
                  @paste="pasteImageInto($event, 'x:sameLot')"
                />
                <button type="button" class="adp-icn-btn" @click="addExtraUrl('sameLot')">+</button>
              </div>
              <p v-if="extraErr.sameLot && !photoFolded('sameLot')" class="adp-plan-err">{{ extraErr.sameLot }}</p>
              <div v-for="(url, i) in (photoFolded('sameLot') ? [] : extraList('sameLot'))" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" alt="동일지번 매각물건" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="사진 삭제" @click="removeExtraAt('sameLot', i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
              <div v-if="!photoFolded('sameLot')" class="adp-photo-note">
                <input
                  class="adp-fs-input"
                  placeholder="비고"
                  :value="fieldVal('fs.sameLot.note')"
                  @input="setExtraNote('sameLot', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <!-- 4. 부동산 유선 상담 — 한 업체를 두 줄로 나눠 가로 스크롤 없이 담는다 -->
            <div class="adp-dm-head sec2">
              <strong class="adp-dm-title">4. 부동산 유선 상담</strong>
              <span class="adp-mkt-step">
                <span class="lab">행</span>
                <button type="button" aria-label="행 삭제" :disabled="agencyRows.length <= AGENCY_ROW_MIN" @click="removeLastAgencyRow">−</button>
                <button type="button" aria-label="행 추가" @click="addAgencyRow">＋</button>
              </span>
            </div>
            <div class="adp-sub-block noline">
              <AgencyTable :rows="agencyRows" :min-rows="AGENCY_ROW_MIN" @change="persistSoon" @remove="removeAgencyRow" />
            </div>
          </div>
        </section>

        <!-- 손품결론 — 매매수요조사(등수·거래율·적체)와 급매가 결론을 한 카드로 모은다 -->
        <section class="adp-card adp-conc-card">
          <header class="adp-card-head adp-survey-head" @click="toggleSection('realUser')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/></svg><span class="adp-head-red">손품결론</span></h2>
            <button v-if="!editingSurvey.realUser" class="adp-edit-btn" type="button" @click.stop="editingSurvey.realUser = true"><svg class="adp-edit-ico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click.stop="saveSurveyAndClose('realUser')">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('realUser') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('realUser')">
            <!-- 거래율 — 아실 거래량 기준이라 아파트일 때만 쓴다 -->
            <div v-if="isApartment" class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>
                  해당경매 물건지 거래율
                  <span class="adp-survey-note-inline">아실 &gt; 평형 (타입) &gt; 거래량 확인</span>
                  <span class="adp-region-pills below">
                    <button
                      v-for="reg in ['서울', '지방']"
                      :key="reg"
                      type="button"
                      :class="['adp-region-pill', { on: surveyForm.dealRegion === reg }]"
                      @click="setDealRegion(reg)"
                    >{{ reg }} {{ reg === '서울' ? '7%' : '4%' }}</button>
                  </span>
                </h3>
              </div>
              <div class="adp-deal-grid">
            <div class="cell">
              <small>세대수</small>
              <input v-if="editingSurvey.realUser" v-model="surveyForm.totalUnits" type="number" class="adp-survey-input" />
              <strong v-else>{{ surveyForm.totalUnits ? Number(surveyForm.totalUnits).toLocaleString('ko-KR') : '-' }}</strong>
            </div>
            <div class="cell">
              <small>연 거래건수</small>
              <input v-if="editingSurvey.realUser" v-model="surveyForm.yearlyDeals" type="number" class="adp-survey-input" />
              <strong v-else>{{ surveyForm.yearlyDeals ? Number(surveyForm.yearlyDeals).toLocaleString('ko-KR') : '-' }}</strong>
            </div>
            <div class="cell">
              <small>월 거래건수</small>
              <strong>{{ dealMonthlyComputed }}</strong>
            </div>
            <div class="cell">
              <small>거래율</small>
              <span class="adp-deal-rate-row">
                <strong :class="['hi-blue', { low: dealRateOk === false }]">{{ dealRateComputed }}</strong>
                <span v-if="dealRateJudge" :class="['adp-deal-judge', { bad: dealRateOk === false }]">{{ dealRateJudge }}</span>
              </span>
                </div>
              </div>
            </div>

            <!-- 매물적체 — 아파트일 때만 -->
            <div v-if="isApartment" class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>해당경매 물건지 매물적체율 <span class="adp-survey-note-inline">5% 초과시 과다</span></h3>
              </div>
              <div class="adp-deal-grid">
            <div class="cell">
              <small>세대수</small>
              <input v-if="editingSurvey.realUser" v-model="surveyForm.listingUnits" type="number" class="adp-survey-input" />
              <strong v-else>{{ surveyForm.listingUnits ? Number(surveyForm.listingUnits).toLocaleString('ko-KR') : '-' }}</strong>
            </div>
            <div class="cell">
              <small>매물수</small>
              <input v-if="editingSurvey.realUser" v-model="surveyForm.listingCount" type="number" class="adp-survey-input" />
              <strong v-else>{{ surveyForm.listingCount ? Number(surveyForm.listingCount).toLocaleString('ko-KR') : '-' }}</strong>
            </div>
            <div class="cell">
              <small>적정매물</small>
              <strong>{{ listingTargetComputed }}</strong>
            </div>
            <div class="cell">
              <small>적체율</small>
              <strong class="hi-blue">{{ listingBacklogComputed }}</strong>
                </div>
              </div>
              <!-- 거래율·매물적체 묶음의 비고 — 구분선 위, 같은 블록 안에 둔다 -->
              <div class="adp-photo-note">
                <input v-model="surveyForm.saleDemandNote" class="adp-fs-input" placeholder="비고" @input="persistSoon" />
              </div>
            </div>

            <!-- 시세 결론 / 급매가 결론 — 생김새가 같아 한 벌로 그린다 -->
            <div v-for="t in CONC_TABLES" :key="t.title" class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>{{ t.title }}<span v-if="t.boldPrice" class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('concMean', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('concMean', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'concMean'" class="adp-note-bubble" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''">체크를 풀면 평균값에서 제외</span></span></h3>
              </div>
              <table :class="['adp-table', 'adp-mkt-table', 'fit', 'adp-dm-tbl', 'adp-conc-table', { 'bold-price': t.boldPrice, 'conc-urgent': t.note }]">
                <thead>
                  <tr>
                    <th v-for="c in t.cols" :key="c.key" :class="[c.tone, { off: concMeanOff(c.key) }]">
                      <!-- 체크를 풀면 그 칸은 평균에서 빠진다. 값은 그대로 남는다 -->
                      <label v-if="CONC_MEAN_SRC.includes(c.key)" class="adp-conc-pick">
                        <input type="checkbox" :checked="!concMeanOff(c.key)" @change="toggleConcMean(c.key)" />
                      </label>
                      {{ c.label }}<small v-if="c.note">{{ c.note }}</small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in MKT_CONC_ROWS" :key="r.key">
                    <td v-for="c in t.cols" :key="c.key" :class="['num', { mean: c.key === 'mean', off: concMeanOff(c.key) }]">
                      <!-- 면적 — ㎡ 와 평을 같이 적는다. 한쪽만 적어도 나머지가 따라온다 -->
                      <template v-if="r.key === 'area'">
                        <template v-if="concEditable(c.key, 'area')">
                          <span class="adp-conc-unit"><input class="adp-mkt-input" inputmode="decimal" :value="concVal(c.key, 'areaM2')" placeholder="0" @input="setConcArea(c.key, 'm2', ($event.target as HTMLInputElement).value)" />㎡</span>
                          <span class="adp-conc-unit"><input class="adp-mkt-input" inputmode="decimal" :value="concVal(c.key, 'area')" placeholder="0" @input="setConcArea(c.key, 'py', ($event.target as HTMLInputElement).value)" />평</span>
                        </template>
                        <span v-else :class="['adp-conc-v', 'adp-conc-area', { typed: concTyped(c.key, 'areaM2') || concTyped(c.key, 'area') }]">{{ concAreaText(c.key) }}</span>
                      </template>
                      <!-- 가격 — 평당가 × 면적(평). 손으로 적으면 그 값이 이긴다 -->
                      <template v-else-if="r.key === 'price'">
                        <FormattedNumberInput
                          v-if="concEditable(c.key)"
                          :model-value="concVal(c.key, 'price')"
                          mode="string"
                          class="adp-mkt-input"
                          :placeholder="concPriceHint(c.key)"
                          @update:model-value="setConcVal(c.key, 'price', String($event ?? ''))"
                        />
                        <span v-else :class="['adp-conc-v', 'hi', { red: c.tone === 'red', typed: concTyped(c.key, 'price') }]">{{ concPriceText(c.key) }}</span>
                      </template>
                      <!-- 평단가 -->
                      <template v-else>
                        <FormattedNumberInput
                          v-if="concEditable(c.key)"
                          :model-value="concVal(c.key, r.key)"
                          mode="string"
                          class="adp-mkt-input"
                          :placeholder="r.label"
                          @update:model-value="setConcVal(c.key, r.key, String($event ?? ''))"
                        />
                        <span v-else :class="['adp-conc-v', { typed: concTyped(c.key, r.key) }]">
                          {{ concText(c.key, r) }}<small v-if="r.suffix && concVal(c.key, r.key)">{{ r.suffix }}</small>
                        </span>
                      </template>
                    </td>
                  </tr>
                  <!-- 비고는 급매가 결론 표에만 — 결론을 적는 자리다 -->
                  <tr v-if="t.note">
                    <td class="adp-conc-note" :colspan="t.cols.length">
                      <input
                        v-if="editingSurvey.realUser"
                        class="adp-mkt-input"
                        placeholder="비고"
                        :value="fieldVal('fs.urgentSale.note')"
                        @input="setExtraNote('urgentSale', ($event.target as HTMLInputElement).value)"
                      />
                      <span v-else :class="{ filled: !!fieldVal('fs.urgentSale.note') }">{{ fieldVal('fs.urgentSale.note') || '비고' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="adp-card">
          <header class="adp-card-head adp-survey-head" @click="toggleSection('survField')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20a1 1 0 0 0 1 1h5"/><circle cx="16.5" cy="16.5" r="3.5"/><path d="m21 21-2-2"/></svg><span class="adp-head-red">현장조사</span></h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('survField') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('survField')" class="adp-survey-body">
            <!-- 1. 입지확인 -->
            <div class="adp-dm-head tight">
              <strong class="adp-dm-title">1. 입지확인</strong>
              <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('fld1', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('fld1', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'fld1'" class="adp-note-bubble" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''">현장 조사 시 손품조사 업데이트 진행</span></span>
              <!-- 매매수요 '실사용자 + 입지등수'의 평균등수를 그대로 가져와 보여 준다 -->
              <strong class="adp-fs-rank">{{ fieldRankAvg || '-' }}</strong>
            </div>

            <!-- 2. 건물/호실 개별성 확인 -->
            <div class="adp-dm-head tight sec2">
              <strong class="adp-dm-title">2. 건물/호실 개별성 확인</strong>
              <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('fld2', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('fld2', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'fld2'" class="adp-note-bubble" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''">현장 조사 시 손품조사 업데이트 진행</span></span>
              <!-- 권리분석과 같은 빨간 체크 — 확인했는지 표시 -->
              <input
                type="checkbox"
                class="adp-rcheck-box adp-dm-check"
                :checked="fieldVal('fs.indivChecked') === 'Y'"
                @input="setFieldValNow('fs.indivChecked', ($event.target as HTMLInputElement).checked ? 'Y' : ''); persistSurvey()"
              />
            </div>

            <!-- 3. 탐문 -->
            <div class="adp-dm-head sec2">
              <strong class="adp-dm-title">3. 탐문 <span class="adp-note-wrap"><button type="button" class="adp-note-btn" aria-label="설명" @mouseenter="noteEnter('probe', $event)" @mouseleave="noteLeave()" @click.stop="toggleNote('probe', $event)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg></button><span v-if="noteTip === 'probe'" class="adp-note-bubble rows" :style="{ top: `${noteTop}px` }" @click.stop="noteTip = ''"><span v-for="(r, ri) in noteRows('probe')" :key="ri"><b :class="{ act: tipAct(r[0]) }">{{ tipLabel(r[0]) }}</b>{{ r[1] }}</span></span></span></strong>
            </div>
            <div v-for="sec in FIELD_SECTIONS" :key="sec.title" class="adp-fs-section">
              <div class="adp-fs-title">{{ sec.title }}</div>
              <!-- 입찰자 현황조사 — 고르는 칸 하나뿐이라 줄 틀을 쓰지 않는다 -->
              <template v-if="sec.special === 'report'">
            <div class="adp-survey-row">
              <span class="lbl">입찰자 현황조사</span>
              <div class="adp-multi-wrap">
                <button
                  type="button"
                  class="adp-multi-trigger"
                  @click="surveyReportOpen = !surveyReportOpen"
                >
                  <span v-if="surveyForm.surveyReport.length === 0" class="adp-multi-placeholder">선택</span>
                  <span
                    v-for="opt in surveyForm.surveyReport"
                    :key="opt"
                    class="adp-multi-chip"
                    @click.stop="removeSurveyReportChip(opt)"
                  >{{ opt }} <em>×</em></span>
                  <span class="adp-multi-caret">▾</span>
                </button>
                <div v-if="surveyReportOpen" class="adp-multi-panel" @click.stop>
                  <ul class="adp-multi-list">
                    <li
                      :class="['adp-multi-item', { selected: surveyForm.surveyReport.length === 0 }]"
                      @click="surveyForm.surveyReport.splice(0); persistSurvey()"
                    >
                      <span>선택</span>
                    </li>
                    <li
                      v-for="opt in SURVEY_REPORT_OPTIONS"
                      :key="opt"
                      :class="['adp-multi-item', { selected: surveyForm.surveyReport.includes(opt) }]"
                      @click="toggleSurveyReportOption(opt)"
                    >
                      <span>{{ opt }}</span>
                      <span v-if="surveyForm.surveyReport.includes(opt)" class="adp-multi-check">✓</span>
                    </li>
                  </ul>
                  <div class="adp-multi-custom">
                    <input
                      v-model="surveyReportCustom"
                      class="adp-multi-custom-input"
                      placeholder="직접 입력"
                      @keydown.enter.prevent="addSurveyReportCustom"
                    />
                    <button type="button" class="adp-multi-custom-btn" @click="addSurveyReportCustom">추가</button>
                  </div>
                </div>
              </div>
            </div>
              </template>
              <template v-for="item in sec.items" :key="item.id">
              <div class="adp-fs-row">
                <span :class="['lbl', { long: item.label.length > 7 }]">{{ item.label }}</span>
                <!-- 글로 적는 칸만 폭을 다 쓴다. 선택 버튼은 아래 CSS로 오른쪽 끝에 모은다 -->
                <span :class="['ctl', { wide: item.text }]">
                  <template v-if="item.text">
                    <span class="adp-fs-unit">
                      <input class="adp-fs-input" :placeholder="item.placeholder" :value="fieldVal(item.id)" @input="setFieldValNow(item.id, ($event.target as HTMLInputElement).value)" />{{ item.suffix }}
                    </span>
                  </template>
                  <template v-else>
                    <!-- 선택지가 셋 이하면 버튼으로 바로 고른다 (다시 누르면 해제) -->
                    <span v-if="(item.options?.length ?? 0) <= 3" class="adp-fs-toggles">
                      <!-- 누구에게 들었나 — 확인 여부(O/X)와는 따로 고른다 -->
                      <button
                        v-for="w in (item.who?.options ?? [])"
                        :key="w"
                        type="button"
                        :class="['adp-toggle-btn', 'who', { active: fieldVal(item.who!.id) === w }]"
                        @click="setFieldValNow(item.who!.id, fieldVal(item.who!.id) === w ? '' : w)"
                      >{{ w }}</button>
                      <!-- 확인했으면 체크 하나. 'X' 를 따로 누를 까닭이 없다 -->
                      <input
                        v-if="isOxRow(item)"
                        type="checkbox"
                        class="adp-fs-check"
                        :aria-label="`${item.label} 확인`"
                        :checked="fieldVal(item.id) === 'O'"
                        @change="setFieldValNow(item.id, ($event.target as HTMLInputElement).checked ? 'O' : '')"
                      />
                      <button
                        v-for="opt in (isOxRow(item) ? [] : (item.options ?? []))"
                        :key="opt"
                        type="button"
                        :class="['adp-toggle-btn', { active: fieldVal(item.id) === opt, one: opt.length === 1 }]"
                        @click="setFieldValNow(item.id, fieldVal(item.id) === opt ? '' : opt)"
                      >{{ opt }}</button>
                    </span>
                    <select
                      v-else
                      class="adp-fs-input"
                      :value="fieldVal(item.id)"
                      @input="setFieldValNow(item.id, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">선택</option>
                      <option v-for="opt in item.options" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                  </template>
                </span>
                <span v-if="item.extra" class="ext">
                  <!-- 금액칸도 글자를 받는다. 숫자만 적으면 쉼표가 붙고,
                       '미납 3개월' 처럼 적으면 적은 그대로 남는다 -->
                  <input
                    v-if="item.extra.money"
                    class="adp-fs-input"
                    :placeholder="item.extra.placeholder"
                    :value="fieldVal(item.extra.id)"
                    @input="setFieldMoneyText(item.extra!.id, $event.target as HTMLInputElement)"
                  />
                  <input
                    v-else
                    class="adp-fs-input"
                    :placeholder="item.extra.placeholder"
                    :value="fieldVal(item.extra.id)"
                    @input="setFieldValNow(item.extra!.id, ($event.target as HTMLInputElement).value)"
                  />
                </span>
                <!-- 비고 — 미납관리비의 연락처 칸과 같은 자리에 둬서 한 줄로 끝낸다 -->
                <span v-else-if="item.noteOptions" class="ext">
                  <div class="adp-agency-multi adp-fs-multi">
                    <button
                      type="button"
                      class="adp-fs-input note adp-agency-trigger"
                      @click.stop="fsPickOpen = fsPickOpen === item.id ? '' : item.id"
                    >
                      <span :class="['txt', { ph: fieldPickList(item.id, item.noteOptions).length === 0 }]">{{ fieldPickList(item.id, item.noteOptions).join(', ') || '비고' }}</span>
                      <span class="caret">▾</span>
                    </button>
                    <template v-if="fsPickOpen === item.id">
                      <div class="adp-agency-backdrop" @click="fsPickOpen = ''" />
                      <ul class="adp-agency-options">
                        <li
                          v-for="opt in item.noteOptions"
                          :key="opt"
                          :class="['adp-agency-option', { on: fieldPickList(item.id, item.noteOptions).includes(opt) }]"
                          @click="toggleFieldPick(item.id, opt, item.noteOptions)"
                        >
                          <span>{{ opt }}</span>
                          <span v-if="fieldPickList(item.id, item.noteOptions).includes(opt)" class="ck">✓</span>
                        </li>
                      </ul>
                    </template>
                  </div>
                </span>
                <span v-else-if="item.note" class="ext">
                  <input
                    class="adp-fs-input note"
                    placeholder="비고"
                    :value="fieldVal(fieldNoteId(item.id))"
                    @input="setFieldValNow(fieldNoteId(item.id), ($event.target as HTMLInputElement).value)"
                  />
                </span>
              </div>
              </template>
            </div>

            <!-- 4. 부동산 현장 상담 — 현장에서 들은 내용을 업체별로 적는다 -->
            <div class="adp-dm-head sec2">
              <strong class="adp-dm-title">4. 부동산 현장 상담</strong>
              <span class="adp-mkt-step">
                <span class="lab">행</span>
                <button type="button" aria-label="행 삭제" :disabled="siteAgencyRows.length <= AGENCY_ROW_MIN" @click="removeLastSiteAgencyRow">−</button>
                <button type="button" aria-label="행 추가" @click="addSiteAgencyRow">＋</button>
              </span>
            </div>
            <AgencyTable :rows="siteAgencyRows" @change="persistSoon" @remove="removeSiteAgencyRow" />
          </div>
        </section>

        <!-- 현장사진 — 현장조사 바로 아래. 사진이 들어오면 접힌 상태가 기본 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="togglePhotoFold('site')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h4l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/></svg>현장사진<PhotoCountMark :n="photoAreaCount('site')" /></h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: photoFolded('site') }]" alt="" />
          </header>
          <div v-if="!photoFolded('site')">
            <div class="adp-photo-actions two">
              <button type="button" class="adp-photo-btn red" @click="cameraInputRef?.click()">📷 카메라</button>
              <button type="button" class="adp-photo-btn blue" @click="galleryInputRef?.click()">🖼 사진추가</button>
            </div>
            <input ref="cameraInputRef" type="file" accept="image/*" capture="environment" class="adp-sr" @change="onCameraChange" />
            <input ref="galleryInputRef" type="file" accept="image/*" multiple class="adp-sr" @change="onGalleryChange" />
            <p v-if="photoUploading" class="adp-sub-note">사진 업로드 중…</p>
            <p v-if="photoError" class="adp-plan-err">{{ photoError }}</p>
            <div v-if="auction?.sitePhotos?.length" class="adp-photo-grid">
              <div v-for="(entry, i) in auction.sitePhotos" :key="entry" class="adp-photo-thumb">
                <img v-if="photoSrc(entry)" :src="photoSrc(entry)" alt="현장사진" @click="openLightbox(photoSrc(entry))" />
                <button type="button" class="adp-photo-del" aria-label="삭제" @click.stop="removePhoto(i)">×</button>
              </div>
            </div>
            <p v-else class="adp-empty one">현장사진을 등록하세요.</p>
          </div>
        </section>



        <!-- 현장 체크리스트 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('checklist')">
            <h2><svg class="adp-h2-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 8h8M13 18h8"/></svg>체크리스트</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('checklist') }]" alt="" />
          </header>
          <table v-if="!isCollapsed('checklist')" class="adp-table adp-rcheck-table adp-cl-table">
            <colgroup>
              <col style="width: 126px" />
              <col />
              <col style="width: 40px" />
            </colgroup>
            <tbody>
              <tr v-for="item in FIELD_CHECKLIST" :key="item.id">
                <td class="adp-rcheck-label"><strong>{{ item.label }}</strong></td>
                <td class="adp-rcheck-desc">{{ item.desc }}</td>
                <td class="adp-rcheck-cell">
                  <input
                    type="checkbox"
                    class="adp-rcheck-box"
                    :checked="isChecklistOn(item.id)"
                    @change="toggleChecklist(item.id)"
                  />
                </td>
              </tr>
              <tr class="adp-cl-sub"><th colspan="3">건물외부상태</th></tr>
              <tr v-for="item in FIELD_EXTERIOR_CHECKS" :key="item.id">
                <td class="adp-rcheck-desc" colspan="2">{{ item.desc }}</td>
                <td class="adp-rcheck-cell">
                  <input
                    type="checkbox"
                    class="adp-rcheck-box"
                    :checked="isChecklistOn(item.id)"
                    @change="toggleChecklist(item.id)"
                  />
                </td>
              </tr>
              <tr class="adp-cl-sub"><th colspan="3">건물내부상태</th></tr>
              <tr v-for="item in FIELD_INTERIOR_CHECKS" :key="item.id">
                <td class="adp-rcheck-desc" colspan="2">{{ item.desc }}</td>
                <td class="adp-rcheck-cell">
                  <input
                    type="checkbox"
                    class="adp-rcheck-box"
                    :checked="isChecklistOn(item.id)"
                    @change="toggleChecklist(item.id)"
                  />
                </td>
              </tr>
              <tr class="adp-cl-sub"><th colspan="3">건물관리 운영</th></tr>
              <tr v-for="item in FIELD_MANAGE_CHECKS" :key="item.id">
                <td class="adp-rcheck-desc" colspan="2">{{ item.desc }}</td>
                <td class="adp-rcheck-cell">
                  <input
                    type="checkbox"
                    class="adp-rcheck-box"
                    :checked="isChecklistOn(item.id)"
                    @change="toggleChecklist(item.id)"
                  />
                </td>
              </tr>
              <tr class="adp-cl-sub"><th colspan="3">안전과 주거환경</th></tr>
              <tr v-for="item in FIELD_SAFETY_CHECKS" :key="item.id">
                <td class="adp-rcheck-desc" colspan="2">{{ item.desc }}</td>
                <td class="adp-rcheck-cell">
                  <input
                    type="checkbox"
                    class="adp-rcheck-box"
                    :checked="isChecklistOn(item.id)"
                    @change="toggleChecklist(item.id)"
                  />
                </td>
              </tr>
              <tr class="adp-cl-sub"><th colspan="3">쾌적과 편의</th></tr>
              <tr v-for="item in FIELD_COMFORT_CHECKS" :key="item.id">
                <td class="adp-rcheck-desc" colspan="2">{{ item.desc }}</td>
                <td class="adp-rcheck-cell">
                  <input
                    type="checkbox"
                    class="adp-rcheck-box"
                    :checked="isChecklistOn(item.id)"
                    @change="toggleChecklist(item.id)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>


      </template>
    </div>

    <span v-if="addrTip" class="adp-note-bubble" :style="{ top: `${addrTipTop}px` }" @click.stop="addrTip = ''">{{ addrTip }}</span>

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />

    <AppMobileBottomNav active="watchlist" />
    <AppToast :visible="!!copiedMsg" :text="copiedMsg" :tone="copiedTone" />

    <DateWheelPicker
      v-model="mktDealYmValue"
      :open="mktDealYmKey !== ''"
      @close="mktDealYmKey = ''"
    />

    <DateWheelPicker
      v-model="profitDateValue"
      :open="profitDateTarget !== ''"
      @close="profitDateTarget = ''"
    />

    <DateWheelPicker
      v-model="pubDateValue"
      :open="pubDateTarget !== ''"
      @close="pubDateTarget = ''"
    />

    <DateWheelPicker
      v-model="indivAgeValue"
      month-only
      :open="indivAgeOpen"
      @close="indivAgeOpen = false"
    />

    <DateWheelPicker
      v-model="docDateValue"
      :open="!!docDatePickerId"
      @close="docDatePickerId = ''"
    />

    <div v-if="lightboxUrl" class="adp-lightbox">
      <button type="button" class="adp-lightbox-close" aria-label="닫기" @click="closeLightbox">×</button>
      <div
        class="adp-lightbox-stage"
        @click.self="lbStageClick"
        @pointerdown="lbDown"
        @pointermove="lbMove"
        @pointerup="lbUp"
        @pointercancel="lbUp"
        @wheel.prevent="lbWheel"
      >
        <img
          :src="lightboxUrl"
          alt="이미지"
          class="adp-lightbox-img"
          :style="{ transform: `translate(${lbX}px, ${lbY}px) scale(${lbScale})` }"
        />
      </div>
      <div class="adp-lightbox-tools">
        <button type="button" aria-label="축소" @click="lbZoom(-1)">−</button>
        <span>{{ Math.round(lbScale * 100) }}%</span>
        <button type="button" aria-label="확대" @click="lbZoom(1)">＋</button>
        <button type="button" class="reset" @click="resetLightboxZoom">원래대로</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.adp-loc2-fetch {
  display: inline-block; margin-left: 8px;
  border: 1px solid #d1d5db; background: #fff; border-radius: 6px;
  padding: 3px 9px; font-size: 11px; font-weight: 700; color: #374151; cursor: pointer;
}

.adp-shell {
  display: flex; flex-direction: column;
  min-height: 100vh; background: #dcdee3;
  padding-bottom: 76px;
}

/* 스크롤해도 고정 — 페이지 본문(.adp-body)이 이 아래로 지나간다.
   z-index는 표 안의 드롭다운(50)보다 위, 하단 내비(200)·라이트박스(1000)보다 아래. */
.adp-sticky-head {
  position: sticky; top: 0; z-index: 60;
  background: #fff;
  box-shadow: 0 2px 6px rgba(17, 24, 39, 0.06);
  /* 아래 본문과의 회색 틈을 고정줄이 직접 들고 있는다. 본문 쪽 여백으로 두면
     그 틈으로 표가 흘러 지나가 보인다 — 예상수익분석처럼 붙는 칸이 있을 때 */
  border-bottom: 6px solid #dcdee3;
}

.adp-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 4px 7px;
  background: #fff;
  /* 제목줄과 아래 탭을 구분하는 선 — 모든 탭에서 같이 보인다 */
  border-bottom: 1px solid #e5e7eb;
}
.adp-back {
  width: 32px; height: 32px;
  border: none; background: transparent; cursor: pointer;
  font-size: 24px; color: #111827; line-height: 1; padding: 0;
}
.adp-page-title {
  flex: 1 1 auto; min-width: 0; margin: 0;
  font-size: 20px; font-weight: 800; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 사건번호 앞 '경매' — 짙은 남색 계열 */
.adp-title-tag { color: #324f87; margin-right: 4px; }
/* 단계 변경·숨기기는 '이 물건 전체'에 대한 동작이라 상단바 오른쪽에 둔다 */
.adp-top-right { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.adp-stage-wrap { position: relative; }
/* 선정물건의 단계 알약(.wlp-phase.phase-active)과 같은 모양·색을 쓴다 */
.adp-stage-btn {
  display: inline-flex; align-items: center; gap: 2px;
  box-sizing: border-box; height: 26px; padding: 0 6px 0 14px;
  border: 1.5px solid #6b85f0; border-radius: 999px; background: #dce5ff;
  font-size: 11px; font-weight: 700; color: #3850c2; line-height: 1.4;
  white-space: nowrap; cursor: pointer;
}
.adp-stage-backdrop { position: fixed; inset: 0; z-index: 70; }
.adp-stage-list {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 80;
  list-style: none; margin: 0; padding: 4px; min-width: 92px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
}
.adp-stage-opt {
  padding: 8px 10px; border-radius: 7px; cursor: pointer;
  font-size: 12.5px; color: #374151; white-space: nowrap;
}
.adp-stage-opt.on { color: #3850c2; font-weight: 800; background: #f2f5ff; }
/* 입찰진행 — 마지막 단계라 빨간 글씨로 눈에 띄게 */
.adp-stage-opt.hot { color: #c22e2e; font-weight: 800; }
.adp-stage-opt.hot.on { background: #fdeeee; }
.adp-stage-btn.hot { border-color: #ef6b6b; background: #ffdede; color: #c22e2e; }
/* 숨기기 — 아이콘 PNG가 흰색 단색이라 보이지 않아 선 그림(SVG)으로 직접 그린다 */
.adp-hide-btn {
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; width: 30px; height: 26px;
  border: 1px solid #d5dbe6; border-radius: 8px; background: #fff;
  color: #6b7280; cursor: pointer;
}
.adp-hide-btn:active { background: #f3f4f6; }
.adp-hide-ico { width: 15px; height: 15px; display: block; object-fit: contain; }


.adp-tabs {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
}
.adp-tab {
  /* 다섯 탭 모두 한 줄로 — 접히지 않게 글자를 줄이고 자간을 좁힌다 */
  overflow: hidden; white-space: nowrap; line-height: 1.25;
  border: none; background: transparent; padding: 9px 0;
  font-size: 15.3px; font-weight: 700; color: #111827;
  cursor: pointer;
  /* 밑줄은 선택된 칸에만 — ::after 막대로 그려 끝이 꺾이지 않는다 */
  position: relative; border-bottom: none; padding-bottom: 14px;
  min-width: 0;
  letter-spacing: -0.8px;
  text-align: center;
}
/* 선택 — 글자는 검정 그대로, 아래에 곧은 막대 하나 */
.adp-tab.active { color: #111827; }
.adp-tab.active::after {
  content: '';
  position: absolute; left: 8%; right: 8%; bottom: 0;
  height: 3px; background: #2a5fbf; border-radius: 2px;
}
/* 입지정보 카드 안의 소분류 (인근역세권·교육환경·주변환경) */
.adp-area-block + .adp-area-block { margin-top: 10px; padding-top: 8px; border-top: 1px solid #eef1f6; }
.adp-area-head { padding: 10px 0 6px; }
.adp-area-block h3 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }
/* '손품+현장조사'가 가장 길다 — 좁은 화면에서 잘리지 않게 글자를 줄인다 */
@media (max-width: 360px) {
  .adp-tab { font-size: 14px; }
}

.adp-prop-head {
  background: #f1f3f7; padding: 7px 4px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 2px 8px;
  position: relative;
}
.adp-prop-kind {
  background: #e0eaff; color: #2b6df3;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px; font-weight: 800;
  /* 칩 + 주소가 윗줄, 면적·연식·매각구분이 아랫줄 */
  grid-column: 1; grid-row: 1; align-self: center;
}
.adp-prop-line {
  /* 윗줄 — 칩 옆에 매각구분·면적·연식 */
  grid-column: 2; grid-row: 1; min-width: 0;
  display: flex; align-items: baseline; gap: 8px; justify-content: space-between;
}
.adp-prop-case {
  font-size: 14px; font-weight: 800; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.adp-prop-sale {
  font-size: 13px; font-weight: 400; line-height: 1.25; color: #2b6df3; white-space: nowrap;
  min-width: 0; overflow: hidden; text-overflow: ellipsis;
}
/* 주소 복사 — 다세대 칩 바로 아래 빈칸. 주소와 줄을 나눠 둬야
   주소가 길어져도 서로 밀어내지 않는다 */
.adp-prop-copy {
  grid-column: 1; grid-row: 2; justify-self: center; align-self: center;
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid #c7d7f7; border-radius: 999px; background: #fff;
  padding: 2px 8px 2px 6px; font: inherit; font-size: 10.5px; font-weight: 700;
  color: #2b6df3; line-height: 1.4; cursor: pointer; white-space: nowrap;
}
.adp-prop-copy:active { background: #eaf1ff; }
/* 주소는 둘째 줄 — 오른쪽 PDF 버튼과 같은 줄에 놓는다 */
.adp-prop-addr {
  grid-column: 2; grid-row: 2; min-width: 0; margin: 0; font-size: 13px; font-weight: 400; color: #111827; line-height: 1.25;
  white-space: nowrap; letter-spacing: -0.4px; overflow: hidden; text-overflow: ellipsis;
}

.adp-pdf-btn {
  display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto;
  border: 1px solid #c7d7f7; border-radius: 8px;
  background: #fff; color: #2b6df3;
  box-sizing: border-box; height: 26px;
  padding: 0 7px; font-size: 10.5px; font-weight: 700; line-height: 1;
  white-space: nowrap; cursor: pointer;
}
.adp-pdf-btn img { width: 11px; height: 11px; object-fit: contain; }
.adp-pdf-btn:active { background: #f2f6ff; }
/* 중요도 별 — 접기 버튼과 같은 열(3)의 윗줄. 둘 다 오른쪽 끝에 붙어 끝선이 맞는다 */
.adp-prop-star {
  grid-column: 3; grid-row: 1; justify-self: end; align-self: center;
  margin-left: 0; height: 22px;
}
.adp-fold-all {
  grid-column: 3; grid-row: 2; justify-self: end; align-self: center;
  border: 1px solid #e3e8f0; background: #fff; border-radius: 8px;
  width: 34px; height: 26px; padding: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.adp-fold-all:active { background: #f2f6ff; }
.adp-fold-all .adp-chev { width: 16px; height: 16px; }
.adp-prop-road { display: block; font-size: 11.5px; color: #6b7280; margin-top: 2px; }

.adp-body { flex: 1 1 auto; padding: 0 5px 12px; display: flex; flex-direction: column; gap: 8px; }

/* 내용이 카드 좌우 끝에 붙지 않게 여백을 준다 */
/* 모서리를 둥글게 — overflow:hidden 은 쓰지 않는다(카드 밖으로 펼쳐지는
   드롭다운·날짜 휠피커가 잘려 버린다). 대신 아래쪽에 여백을 줘서
   내용이 둥근 모서리 바깥으로 삐져나오지 않게 한다 */
.adp-card { background: #fff; padding: 0 8px 6px; border-radius: 8px; }
/* ===== 물건 기본정보 카드 ===== */

.adp-base-rows { margin: 0; }
.adp-base-row {
  /* minmax(0,1fr) — 값이 길어도 칸 안에서 줄바꿈되게(1fr 단독이면 min-content 아래로 안 줄어듦) */
  display: grid; grid-template-columns: 84px minmax(0, 1fr);
  align-items: center; gap: 8px;
  /* 글자 크기는 그대로 두고 위아래 여백만 줄인다 — 한 화면에 더 담되
     줄끼리 붙어 보이지 않을 만큼은 남긴다 (7 → 6px, 최소높이 36 → 34px) */
  padding: 6px 0;
  border-bottom: 1px solid #f1f3f7;
  min-height: 34px;
}
.adp-base-rows > .adp-base-row:last-child { border-bottom: 0; }
.adp-base-row dt { margin: 0; font-size: 13.5px; color: #6b7280; font-weight: 600; }
.adp-base-row dd {
  margin: 0; min-width: 0;
  font-size: 14px; color: #111827; font-weight: 600;
  text-align: right; line-height: 1.35; word-break: break-word;
}
.adp-base-row dd.link { color: #2563eb; font-weight: 700; }
.adp-base-row dd.amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
/* 진행 중인 회차만 색으로 구분 — 크기·굵기는 다른 행과 같게 */
.adp-base-row dd.amt.now { color: #2563eb; }
/* 입찰 때 실제로 들고 가야 할 돈 — 눈에 띄게 */
.adp-base-row dd.amt.deposit { color: #dc2626; }
.adp-base-mini {
  width: 15px; height: 15px; object-fit: contain;
  display: inline-block; vertical-align: -3px; margin-right: 4px; opacity: 0.65;
}

/* 회차 행 — 라벨+배지가 왼쪽을 채우고 금액은 오른쪽에 붙는다 */
.adp-base-row.round { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.adp-base-row.round dt { flex: 1 1 auto; min-width: 0; }
.adp-base-row.round dd { flex: 0 0 auto; }

.adp-base-round {
  padding: 5px 14px; border-radius: 999px;
  background: #2563eb; color: #fff; font-size: 12.5px; font-weight: 800;
}

.adp-base-sub {
  margin: 0; padding: 16px 0 2px;
  font-size: 13px; font-weight: 800; color: #9ca3af;
  border-top: 1px solid #eef0f4;
}

.adp-base-round-dt { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
/* '1차'가 '2차'보다 미세하게 좁아 배지가 2px 어긋난다 — 라벨 폭도 고정 */
.adp-base-round-dt > span:first-child { min-width: 60px; }
.adp-base-chip {
  padding: 3px 9px; border-radius: 999px;
  background: #f3f4f6; color: #6b7280;
  font-size: 11px; font-weight: 700; letter-spacing: -0.2px;
  text-align: center;
}
/* '100%'가 '70%'보다 넓어 뒤따르는 배지·날짜가 행마다 어긋난다 — 폭을 고정해 세로로 맞춘다.
   좌우 여백을 줄여 '100%'도 고정폭 안에 들어오게 한다 (안 그러면 그 행만 다시 밀린다) */
.adp-base-chip.pct { min-width: 46px; padding-left: 5px; padding-right: 5px; }
.adp-base-row.round .adp-base-chip:not(.pct) { min-width: 38px; }
.adp-base-chip.st-now { background: #e0eaff; color: #2563eb; }
.adp-base-chip.st-failed { background: #fee2e2; color: #b91c1c; }
.adp-base-chip.st-sold { background: #dcfce7; color: #15803d; }
.adp-base-date { font-size: 11.5px; color: #9ca3af; font-weight: 600; }
/* '진행' 칩이 있는 줄은 날짜도 같은 파랑으로 */
.adp-base-date.now { color: #2563eb; }

.adp-base-note { margin: 6px 0 2px; font-size: 12px; color: #9ca3af; line-height: 1.55; }
.adp-base-note.pre { white-space: pre-line; color: #6b7280; }

/* 임차인 네 줄 + 경고 + 기타사항을 한 묶음으로 */
.adp-tn-box {
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 2px 10px 7px; margin-top: 5px; background: #fff;
}
.adp-tn-base { margin: 0 0 4px; }
.adp-base-tenant .adp-base-row { padding: 4px 0; min-height: 0; }
.adp-tn-box .adp-base-warn { margin: 5px 0 0; }
.adp-tn-box .adp-base-more { margin-top: 5px; }
.adp-tn-box .adp-note-toggle { padding-top: 4px; padding-bottom: 4px; }
.adp-tn-box > .adp-base-warn:last-child,
.adp-tn-box > .adp-base-more:last-child { margin-bottom: 0; }
.adp-base-tenant { border-top: 1px solid #f1f3f7; }
.adp-base-tenant:first-of-type { border-top: 0; }
.adp-case-table { table-layout: fixed; }
.adp-case-table td { vertical-align: middle; word-break: keep-all; }
.adp-case-table .adp-pill { display: inline-block; white-space: nowrap; }
.adp-base-row.quad {
  /* 4번째 칸은 "보: 159,000,000원" / "전입: 2021-05-25"이 한 줄에 들어가야 해 조금 넓게 */
  grid-template-columns: 52px minmax(0, 1fr) auto minmax(0, 1.3fr);
  gap: 6px; align-items: start;
}
.adp-base-row.quad dt { padding-top: 2px; font-size: 12.5px; white-space: nowrap; }
.adp-base-row .quad-l2 { padding-left: 8px; border-left: 1px solid #eef0f4; }
.adp-base-row .quad-v { font-size: 12.5px; line-height: 1.5; }
.adp-base-row .quad-v.nowrap { white-space: nowrap; }
.adp-base-row .quad-v strong { display: block; font-size: 14px; font-weight: 800; }
.adp-base-row .quad-v small { display: block; font-size: 11px; color: #9ca3af; font-weight: 600; margin-top: 1px; }
.adp-base-row .quad-v.stack span,
.adp-base-row dd.stack span { display: block; font-size: 12.5px; white-space: nowrap; }

.adp-base-warn {
  margin: 12px 0 0; padding: 12px 14px;
  background: #fef2f2; border-radius: 8px;
  font-size: 13px; font-weight: 700; color: #dc2626; line-height: 1.5;
}

.adp-base-more { margin-top: 10px; }
.adp-note-toggle {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  width: 100%; padding: 9px 0;
  border: 0; border-top: 1px solid #f1f3f7; background: transparent;
  font-size: 13px; font-weight: 700; color: #374151; cursor: pointer;
}
.adp-chev.sm { width: 16px; height: 16px; }
.adp-base-more-btn {
  border: 1px solid #e5e7eb; background: #fff; border-radius: 8px;
  padding: 7px 12px; font-size: 12px; font-weight: 700; color: #6b7280; cursor: pointer;
}

.adp-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 0 8px; cursor: pointer;
  /* 탭마다 머리줄 높이가 달라져 첫 카드가 위아래로 흔들리던 것을 막는다 */
  min-height: 44px; box-sizing: border-box;
}
.adp-card-head h2 {
  margin: 0; font-size: 15.3px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 5px; min-width: 0;
}
/* 카드 제목 앞 아이콘 */
/* 아이콘은 밝기를 한 단계 낮춘 파랑 — 제목 옆에서 튀지 않게 */
.adp-h2-ico { flex: 0 0 auto; color: #2a5fbf; }
.adp-chev { width: 22px; height: 22px; object-fit: contain; transition: transform 0.2s; }
.adp-chev.up { transform: rotate(180deg); }

/* 표 공통 — 카드와 같은 라운드(8px).
   overflow:hidden 은 쓰지 않는다(표 안에서 바깥으로 펼쳐지는 드롭다운이 잘린다).
   대신 네 모서리 칸에 각각 radius 를 줘서 배경이 모서리를 따라 깎이게 한다.
   radius 가 먹으려면 border-collapse 가 separate 여야 한다 — 칸에는 가로선만
   있어서(세로선 없음) 선이 겹쳐 두꺼워질 일은 없다. */
.adp-table {
  width: 100%;
  border-collapse: separate; border-spacing: 0;
  font-size: 12.5px;
  background: #fff;
  border: 1px solid #e5e7eb; border-radius: 8px;
}
/* 머리줄이 있으면 thead 첫 줄, 없으면 tbody 첫 줄이 위 모서리다.
   표 대부분이 <colgroup>으로 시작해서 :first-child 로는 tbody 를 못 잡는다 */
.adp-table > thead > tr:first-child > th:first-child { border-top-left-radius: 8px; }
.adp-table > thead > tr:first-child > th:last-child { border-top-right-radius: 8px; }
.adp-table:not(:has(> thead)) > tbody:first-of-type > tr:first-child > :first-child { border-top-left-radius: 8px; }
.adp-table:not(:has(> thead)) > tbody:first-of-type > tr:first-child > :last-child { border-top-right-radius: 8px; }
.adp-table > tbody:last-of-type > tr:last-child > :first-child { border-bottom-left-radius: 8px; }
.adp-table > tbody:last-of-type > tr:last-child > :last-child { border-bottom-right-radius: 8px; }
/* 마지막 줄 밑선은 표 테두리와 겹치니 지운다 */
.adp-table > tbody:last-of-type > tr:last-child > td,
.adp-table > tbody:last-of-type > tr:last-child > th { border-bottom: 0; }
.adp-table th, .adp-table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; color: #111827; }
.adp-table thead th { background: #f9fafb; font-weight: 700; color: #374151; border-bottom: 1px solid #d1d5db; }
.adp-table .r { text-align: right; }
.adp-table .pre { white-space: pre-line; }

.adp-schedule-table .deposit td { background: #fafafa; }
.adp-rate { color: #2b6df3; font-weight: 700; }
.adp-schedule-table strong { font-size: 16px; font-weight: 800; }

.adp-kv {
  display: grid; grid-template-columns: 80px 1fr 80px 1fr;
  margin: 0; padding: 4px 0; border-top: 1px solid #e5e7eb;
}
.adp-kv > div { display: contents; }
.adp-kv dt { padding: 9px 8px; background: #f3f4f6; font-size: 12px; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; }
.adp-kv dd { margin: 0; padding: 9px 8px; font-size: 12.5px; color: #111827; border-bottom: 1px solid #e5e7eb; }

.adp-info-table {
  width: 100%; border-collapse: collapse; margin-top: 8px;
  border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db;
  table-layout: fixed;
}
.adp-info-table th, .adp-info-table td {
  padding: 8px 8px; font-size: 11.5px; vertical-align: middle;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.3;
}
.adp-info-table tr:last-child th,
.adp-info-table tr:last-child td { border-bottom: none; }
.adp-info-table th {
  background: #f3f4f6; color: #1f2937; font-weight: 700;
  text-align: left; font-size: 11.5px;
}
.adp-info-table td { color: #111827; font-weight: 600; }
.adp-info-table strong { font-weight: 800; }

.adp-sub-note { margin: 4px 4px 8px; font-size: 12px; color: #6b7280; }

.adp-warn-banner { margin: 10px 0 0; padding: 10px 12px; background: #fef2f2; border-radius: 8px; font-size: 12px; color: #991b1b; line-height: 1.55; white-space: pre-line; }

.adp-table .tone-red td { background: #fef2f2; }
/* 말소기준등기 — 이 줄을 기준으로 인수와 소멸이 갈린다. 한눈에 찾게 새빨갛게 */
.adp-registry-table .adp-reg-base { color: #ff0000; font-weight: 800; }
.adp-table .tone-blue td { background: #eff6ff; }
.adp-table .b { display: block; font-size: 13px; font-weight: 800; color: #111827; }
.adp-table .pre-line { white-space: pre-line; }
.adp-registry-table { table-layout: fixed; }
.adp-registry-table th, .adp-registry-table td { font-size: 11px; padding: 8px 6px; word-break: keep-all; vertical-align: top; }
.adp-major-table { table-layout: fixed; }
.adp-major-table th, .adp-major-table td { font-size: 11.5px; padding: 8px 6px; vertical-align: top; }
.adp-major-table .nw { white-space: nowrap; }
.adp-table .adp-desc { display: block; margin-top: 2px; font-size: 11.5px; color: #6b7280; white-space: pre-line; }
.adp-table td.red, .adp-table td .red { color: #dc2626; font-weight: 700; }

.adp-pill { display: inline-block; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #111827; }

.adp-tenant-table { table-layout: fixed; }
.adp-tenant-table th, .adp-tenant-table td { font-size: 11px; padding: 8px 6px; word-break: keep-all; }
.adp-tenant-table .adp-sub-name { display: block; font-size: 10.5px; color: #6b7280; font-weight: 500; margin-top: 2px; }
.adp-tenant-dates { display: flex; flex-direction: column; gap: 2px; font-size: 10.5px; }
.adp-opp-cell { writing-mode: horizontal-tb; }
.adp-tenant-table .adp-opp-cell .red { color: #dc2626; font-weight: 700; line-height: 1.3; word-break: break-word; }
.adp-tenant-sub > th {
  background: #f9fafb; font-size: 11px; font-weight: 700; color: #374151;
  width: 26%;
}
.adp-tenant-sub-cell { font-size: 10.5px; color: #374151; line-height: 1.5; }
.adp-tenant-sub-cell span { display: block; }
.adp-tenant-sub-cell .red-strong { color: #dc2626; font-weight: 600; }

.adp-plan-row { display: flex; gap: 6px; padding: 4px 0 8px; }
.adp-plan-preview {
  position: relative; padding: 4px 0 8px;
  border-radius: 8px; background: #f9fafb;
}
.adp-plan-img {
  /* 큰 이미지를 붙여넣어도 미리보기가 화면을 점령하지 않게 높이를 제한한다.
     전체 크기는 눌러서 라이트박스로 본다. */
  width: 100%; max-width: 100%; height: auto;
  max-height: 420px; object-fit: contain;
  border-radius: 8px; display: block; background: #fff;
  border: 1px solid #e5e7eb;
  cursor: zoom-in;
}
.adp-photo-thumb img { cursor: zoom-in; }

.adp-lightbox {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.92);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.adp-lightbox-stage {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; touch-action: none;
}
.adp-lightbox-img {
  max-width: 100%; max-height: 100%; object-fit: contain;
  border-radius: 6px;
  transform-origin: center center; will-change: transform;
  user-select: none; -webkit-user-drag: none;
}
/* 확대/축소 도구 — 손가락이 안 되는 곳에서도 쓸 수 있게 */
.adp-lightbox-tools {
  position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 6px; z-index: 2;
  background: rgba(255, 255, 255, 0.14); border-radius: 999px; padding: 5px 8px;
}
.adp-lightbox-tools button {
  min-width: 34px; height: 30px; border-radius: 999px;
  border: none; background: rgba(255, 255, 255, 0.18); color: #fff;
  font-size: 16px; font-weight: 800; line-height: 1; cursor: pointer;
}
.adp-lightbox-tools button.reset { font-size: 12px; padding: 0 10px; }
.adp-lightbox-tools button:active { background: rgba(255, 255, 255, 0.34); }
.adp-lightbox-tools span { min-width: 46px; text-align: center; font-size: 12px; font-weight: 700; color: #fff; }
.adp-lightbox-close {
  position: absolute; top: 16px; right: 16px; z-index: 3;
  width: 40px; height: 40px; border-radius: 50%;
  border: none; background: rgba(255, 255, 255, 0.15); color: #fff;
  /* 글꼴 기준선 때문에 × 가 아래로 쏠려 보이던 것을 flex로 정확히 가운데 둔다 */
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; line-height: 1; padding: 0; cursor: pointer;
}
.adp-lightbox-close:hover { background: rgba(255, 255, 255, 0.3); }
.adp-plan-del {
  position: absolute; top: 10px; right: 10px; z-index: 2;
  width: 26px; height: 26px; border-radius: 50%;
  border: none; background: rgba(17, 24, 39, 0.7); color: #fff;
  font-size: 16px; line-height: 1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0;
}
.adp-plan-del:hover { background: #dc2626; }
.adp-plan-err {
  margin: 6px 4px 0; padding: 8px 12px;
  font-size: 11.5px; color: #dc2626;
  background: #fef2f2; border-radius: 6px;
}
.adp-input { flex: 1 1 auto; min-width: 0; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; background: #f9fafb; color: #111827; outline: none; }
.adp-input::placeholder { color: #b6bcc7; opacity: 1; }
.adp-icn-btn { flex: 0 0 auto; width: 40px; height: 40px; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; font-size: 18px; color: #6b7280; cursor: pointer; }

.adp-photo-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 4px 0 8px; }
.adp-photo-actions.two { grid-template-columns: 1fr 1fr; }
.adp-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.adp-photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 8px 0; }
.adp-photo-thumb { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #f3f4f6; }
.adp-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.adp-photo-del {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px; border-radius: 50%;
  border: none; background: rgba(17, 24, 39, 0.7); color: #fff;
  font-size: 14px; line-height: 1; cursor: pointer;
}
.adp-photo-del:hover { background: #dc2626; }
.adp-photo-btn { border: none; border-radius: 8px; padding: 12px 8px; color: #fff; font-size: 13px; font-weight: 800; cursor: pointer; }
.adp-photo-btn.red { background: #f87171; }
.adp-photo-btn.blue { background: #2b6df3; }
.adp-photo-btn.green { background: #14b8a6; }

.adp-subtab-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }
.adp-subtab { border: 1px solid #e5e7eb; background: #fff; color: #6b7280; padding: 10px 4px; font-size: 12.5px; font-weight: 700; cursor: pointer; border-radius: 8px 8px 0 0; border-bottom: none; }
.adp-subtab.active { color: #111827; }
.adp-subtab.dark.active { background: #111827; color: #fff; border-color: #111827; }
.adp-unit-pick { display: flex; justify-content: flex-end; padding: 6px 4px; }
.adp-select-sm { border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; font-size: 12px; background: #fff; }

.adp-kv-table { table-layout: fixed; }
.adp-kv-table th { background: #f3f4f6; font-weight: 700; color: #374151; white-space: nowrap; }
.adp-kv-table th, .adp-kv-table td { font-size: 11px; padding: 7px 6px; line-height: 1.3; }
.adp-kv-table td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adp-kv-table td.wrap { white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.45; }
.adp-list-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
.adp-list-grid span { font-size: 12px; color: #111827; }
.adp-list-grid.wrap2 span { white-space: normal; word-break: break-all; line-height: 1.4; }
.adp-place-link {
  font-size: 12px; color: #2b6df3; text-decoration: none;
  white-space: normal; word-break: break-all; line-height: 1.4;
}
.adp-place-link:active { color: #1e40af; }
.adp-refresh-btn {
  border: none; background: transparent; color: #9ca3af;
  width: 24px; height: 24px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; cursor: pointer;
  margin-right: 4px;
}
.adp-refresh-btn:active { color: #4b5563; }
.adp-refresh-btn:disabled { opacity: 0.5; }

.nearby-kakao-tab { display: inline-flex; align-items: center; gap: 4px; }
.adp-kakao-mini {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 4px;
  background: #FEE500; color: #181600;
  font-size: 11px; font-weight: 900; cursor: pointer;
  margin-left: 2px;
}
.adp-kakao-mini.active { background: #181600; color: #FEE500; }
.adp-kakao-mini:hover { transform: scale(1.05); }

.adp-profit-head { gap: 6px; cursor: pointer; }
.adp-profit-head h2 { display: inline-flex; align-items: center; gap: 5px; }
.adp-profit-ico { color: #2a5fbf; flex: 0 0 auto; }
.adp-auto-chip {
  flex: 0 0 auto;
  background: #f1f3f7; color: #4b5563;
  border-radius: 999px; padding: 3px 8px;
  font-size: 10px; font-weight: 700; white-space: nowrap;
}
.adp-profit-head .adp-head-note {
  margin-left: 0; font-size: 10.5px;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 수정 버튼 — 테두리만 있는 알약형 */
.adp-profit-head .adp-edit-btn { margin-left: auto; }
/* 낙찰일 · 매도일 */
/* 날짜 둘 + 진행상황 + 표 스텝퍼를 한 줄에 — 줄이 내려가면 그만큼 빈 자리가
   생겨 표가 한참 밀린다. 글자('낙찰'·'매도')와 칸을 줄여 한 줄에 맞춘다 */
.adp-profit-dates {
  display: flex; align-items: center; gap: 4px; flex-wrap: nowrap;
  padding: 8px 0 10px; border-bottom: 1px solid #eef1f6; margin-bottom: 10px;
}
/* 제목 + 날짜 줄을 통째로 화면에 붙인다. 붙는 자리는 상단 고정줄 바로 아래 —
   그 높이(--adp-head-h)는 주소가 한 줄이냐 두 줄이냐로 달라져 재서 받는다.
   카드의 좌우 여백(8px)을 뚫어야 흰 바탕이 끝까지 가서 표가 비쳐 보이지 않는다 */
.adp-profit-sticky {
  position: sticky; top: var(--adp-head-h, 162px); z-index: 30;
  background: #fff;
  /* 카드 좌우 안쪽 여백(8px)을 뚫어야 흰 바탕이 끝까지 가서 표가 비쳐 보이지 않는다 */
  margin: 0 -8px; padding: 0 8px;
}
/* 위쪽 회색 틈은 남겨 둔다 — 그래야 요약 카드와 경계가 보인다.
   그 6px 은 상단 고정줄이 제 아래 테두리로 들고 있으므로(.adp-sticky-head),
   카드는 제자리에서 시작하면서도 붙을 자리까지 올라갈 거리가 0 이 된다 */
/* 붙어 있는 동안에만 그림자 — 어디까지가 고정인지 눈에 보인다 */
.adp-profit-sticky::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -6px; height: 6px;
  background: linear-gradient(rgba(17, 24, 39, 0.05), rgba(17, 24, 39, 0));
  pointer-events: none;
}
.adp-pd-item {
  border: none; background: transparent; padding: 0; cursor: pointer;
  /* 글자는 칸 한가운데에 — baseline 으로 두니 '낙찰'이 칸보다 아래로 처졌다 */
  display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto;
}
.adp-pd-item em { font-style: normal; font-size: 12px; font-weight: 500; color: #111827; white-space: nowrap; }
.adp-pd-box {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 4px 8px; background: #fff;
  /* 값이 있든 없든 칸 크기가 흔들리지 않게 폭을 고정한다.
     날짜 둘·표 스텝퍼·별이 한 줄에 서야 해서 칸을 좁게 잡았다 */
  width: 74px; box-sizing: border-box; padding: 4px 3px; gap: 2px;
}
.adp-pd-box span { font-size: 11px; font-weight: 400; color: #111827; white-space: nowrap; }
.adp-pd-cal { color: #9ca3af; flex: 0 0 auto; }
/* 비중을 기본값으로 — 날짜 옆에 작게 */
.adp-pd-reset {
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid #d7dce6; border-radius: 999px; background: #fff;
  padding: 3px 9px 3px 7px; font-family: inherit; font-size: 10.5px; font-weight: 700;
  color: #4b5563; line-height: 1.3; cursor: pointer; white-space: nowrap; flex: 0 0 auto;
}
.adp-pd-reset:active { background: #f3f4f6; }
.adp-pd-sep { color: #d1d5db; }
/* 초기화와 별을 한 묶음으로 — 줄이 내려가도 둘이 같이 내려간다 */
.adp-pd-tail { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; margin-left: auto; }
.adp-profit-dates .adp-star-btn { margin-left: 0; }
/* 날짜 줄에 같이 서는 진행상황 박스 — 표 스텝퍼 바로 왼쪽에 붙는다
   (바깥 .adp-pd-tail 이 이미 오른쪽으로 밀어 두므로 여기서 또 밀면 안 된다) */
.adp-profit-dates .adp-bid-status { margin-left: 0; padding: 4px 4px 4px 6px; font-size: 11px; }
/* 중요도 별 — 선정물건 목록의 별과 같은 모양 */
/* 중요도 — 작은 별 3개를 순서대로 채운다 */
.adp-star-btn {
  margin-left: auto;
  flex: 0 0 auto;
  border: none; background: transparent; padding: 0; cursor: pointer;
  height: 30px;
  display: inline-flex; align-items: center; gap: 1px;
}
/* 입찰 상태 — 고른 값에 따라 색이 바뀌는 알약형 선택 */
.adp-bid-status {
  margin-left: auto;
  border: none; border-radius: 999px;
  padding: 6px 12px; font-family: inherit; font-size: 12px; font-weight: 800;
  cursor: pointer; outline: none;
  text-align: center; text-align-last: center;
  background: #f3f4f6; color: #111827;
}
.adp-bid-status.none { font-weight: 400; }
.adp-bid-status.hot { background: #fde2e2; color: #d23f3f; }
.adp-bid-status.calm { background: #eef0f4; color: #111827; }
.adp-pill-blue { background: #e0eaff; color: #2b6df3; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; }
/* 선정물건 리스트의 '숨긴 N건' 버튼과 같은 사각 형태 — 높이 26px, 라운드 8px */
.adp-edit-btn {
  box-sizing: border-box; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #fff; color: #2b6df3;
  border: 1px solid #c7d7f7; border-radius: 8px;
  gap: 4px;
  padding: 0 10px; font-size: 12px; font-weight: 700; line-height: 1;
  white-space: nowrap; cursor: pointer;
}
.adp-edit-ico { flex: 0 0 auto; }
.adp-edit-btn.save { background: #fff; color: #16a34a; border-color: #86efac; }
.adp-cell-input {
  width: 100%; max-width: 110px;
  border: 1px solid #cbd5e1; border-radius: 4px;
  padding: 4px 6px; font-size: 12px; text-align: right;
  background: #fff; color: #111827; outline: none;
}
.adp-cell-input.sm { max-width: 64px; }
/* 과세표준 줄에 세율·공제 둘이 같이 서야 해서 한 칸 더 좁은 입력칸 */
.adp-cell-input.xs { max-width: 44px; padding: 4px 4px; }
/* 매도가 옆 자유 입력칸 — 숫자가 아니라 메모라 왼쪽부터 쓴다 */
.adp-cell-input.note { text-align: left; }
.adp-cell-input::placeholder { color: #9ca3af; }
.adp-cell-input:focus { border-color: #2b6df3; }
/* %는 직접 숫자만 입력한다 — 스피너 화살표를 쓰지 않는다 */
.adp-cell-input::-webkit-outer-spin-button,
.adp-cell-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.adp-cell-input[type='number'] { -moz-appearance: textfield; appearance: textfield; }
.adp-pct-wrap { display: inline-flex; align-items: center; gap: 2px; }
.adp-pct-suf { font-size: 11px; color: #6b7280; }

.adp-profit-table thead th { background: #1f3a72; color: #fff; border-bottom: none; }
.adp-profit-table .adp-cat { background: #f3f4f6; font-weight: 700; color: #111827; text-align: center; vertical-align: middle; }
.adp-profit-table .hi td, .adp-profit-table .hi-cell { background: #fefae0; font-weight: 700; }
/* 구분 칸은 강조줄이라도 회색 그대로 */
.adp-profit-table .hi td.adp-cat { background: #f3f4f6; }
.adp-profit-table .hi td.adp-formula { font-weight: 500; }
/* 예상 매도가 줄 */
.adp-profit-table .pink td { background: #fdeef0; }
.adp-profit-table .pink td.adp-cat { background: #f3f4f6; }
.adp-profit-table.v2 tr.pink td.emph { background: #fdeef0; }
/* 입찰가에도 같은 빨간 테두리 — 다만 바탕은 그 줄(강조줄)의 노란색 그대로 둔다 */
.adp-profit-table.v2 tr.hi td.emph { background: #fefae0; }
/* 누진세율 구간 */
.adp-profit-table .adp-formula .adp-bracket { color: #111827; font-weight: 500; }
.adp-profit-table .neg { color: #dc2626; }
.adp-profit-table td.blue, .adp-profit-table td.blue strong { color: #2b6df3; font-weight: 800; }
.adp-cost-no { color: #6b7280; font-weight: 700; margin-right: 4px; }
.adp-profit-table .adp-formula { font-size: 11px; color: #64748b; font-weight: 500; }
.adp-profit-table.v2 td.emph { background: #fff9e6; border: 2px solid #ef4444; }
.adp-profit-table.v2 td { font-size: 12.5px; }
/* 칸마다 위아래 빈 자리가 넓어 표가 쓸데없이 길었다. 글자 크기는 그대로 두고
   여백만 줄인다. 좌우도 같이 줄여 '명도비' 같은 말이 두 줄로 꺾이지 않게 한다. */
.adp-profit-table th, .adp-profit-table td { padding: 7px 5px; }
.adp-profit-table .adp-cat { padding: 7px 2px; }
/* 상세 칸은 꺾지 않는다 — '매도중개료'가 두 줄로 갈라지면서 그 줄만 키가
   두 배가 됐다. 숫자·공식 칸(.r)은 그대로 둔다.
   구분 칸(.adp-cat)은 여러 줄을 묶는 칸이라 꺾여도 표가 길어지지 않는다 —
   여기서 폭을 양보해야 표가 화면 밖으로 밀려나지 않는다. */
.adp-profit-table td:not(.r):not(.adp-cat) { white-space: nowrap; }
/* 머리줄까지 꺾이면 표 위가 두 줄이 된다 — '구분' 두 글자는 붙여 둔다 */
.adp-profit-table thead th { white-space: nowrap; }
/* 바로 아래 개인소득세율 표도 같은 간격으로 — 두 표의 줄 높이가 다르면 따로 논다 */
.adp-tax-ref th, .adp-tax-ref td { padding: 7px 5px; }
/* 표에 테두리 1px 이 있어 width:100% 만으로는 머리줄보다 2px 넓게 선다.
   초기화 버튼의 끝점을 표 모서리에 맞추려면 테두리까지 폭에 넣어야 한다 */
.adp-profit-table { box-sizing: border-box; }
/* 표 머리줄 — 이름(A안·B안)은 왼쪽, 초기화는 오른쪽 끝.
   좌우 여백을 0으로 둬서 초기화의 끝점이 표의 오른쪽 모서리와 맞는다 */
.adp-profit-head-row {
  display: flex; align-items: center; gap: 8px;
  margin: 12px 0 4px; min-height: 24px;
}
.adp-profit-head-row .adp-pd-reset { margin-left: auto; }
/* 산정표가 둘 이상일 때만 붙는 이름(A안·B안) */
.adp-profit-label { font-size: 12.5px; font-weight: 800; color: #1f3a72; }
.adp-profit-table.alt { border-color: #d7def0; }
/* 예비 매도가 — 본 매도가 옆에 흐리게 선다. 계산에 안 들어가는 값이라 눈을 끌 필요가 없다 */
.adp-profit-table td.adp-sale-alt { color: #9ca3af; font-weight: 600; }
.adp-profit-table td.adp-sale-alt .adp-cell-input { color: #6b7280; }

.adp-tax-ref thead th { background: #1f3a72; color: #fff; }
.adp-tax-ref td:last-child { color: #374151; font-weight: 400; }

.adp-mini-summary .adp-table { border-top: none; }
.adp-mini-summary th { background: #f3f4f6; width: 70px; }

.adp-empty { margin: 12px 4px; padding: 24px 12px; text-align: center; color: #9ca3af; font-size: 12.5px; background: #fafafa; border: 1px dashed #e5e7eb; border-radius: 8px; }
.adp-empty.sm { padding: 12px 8px; font-size: 11.5px; margin: 6px 0; }
/* 한 줄짜리 — 아직 아무것도 없을 때 자리만 알려 준다 */
.adp-empty.one { padding: 9px 10px; margin: 6px 4px 10px; font-size: 11.5px; }

.adp-subblock-divider { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #e5e7eb; }
.adp-subblock-divider.first { margin-top: 4px; padding-top: 0; border-top: none; }
.adp-loc2-radius { font-size: 10.5px; color: #9ca3af; font-weight: 600; margin-left: 4px; }
.adp-subblock-title img.adp-loc2-info-icon { width: 16px; height: 16px; }
.adp-subblock-title {
  margin: 0 0 6px; font-size: 13px; font-weight: 800; color: #374151; letter-spacing: -0.2px;
}
.adp-table-sm th, .adp-table-sm td { font-size: 10.5px; padding: 6px 5px; line-height: 1.35; }
.adp-table-sm .adp-pill { font-size: 10px; padding: 2px 6px; }

/* 권리분석 케이스 선택 */
/* 실사용자 */

.adp-ruser-table { width: 100%; table-layout: fixed; }
.adp-ruser-table th {
  background: #1e3a5f; color: #fff; border-color: #1e3a5f;
  font-size: 12px; font-weight: 800; padding: 9px 4px; text-align: center;
  word-break: keep-all;
}
.adp-ruser-cell { padding: 8px 4px; vertical-align: middle; font-size: 12.5px; word-break: keep-all; }
.adp-ruser-cell.center { text-align: center; font-weight: 700; }
/* .adp-table td 의 vertical-align: top 을 덮어 모든 칸을 세로 가운데로 */
.adp-ruser-table td,
.adp-ruser-table th,
.adp-ruser-table td.vmid { vertical-align: middle; }
.adp-ruser-sum { display: block; font-size: 30px; font-weight: 800; color: #e0574a; line-height: 1.2; }
.adp-ruser-line { line-height: 1.5; text-align: center; }
.adp-ruser-line + .adp-ruser-line { margin-top: 6px; }
/* '전용 18~25평'이 가장 길다 — 캐럿까지 칸 안에 들어오도록 */
.adp-ruser-select { padding: 6px 3px; font-size: 10px; gap: 2px; min-height: 50px; }
/* 평형대와 룸 표시를 위아래 두 줄로 나눠 보여 준다 */
.adp-ruser-select > span:first-child {
  flex: 1 1 auto; min-width: 0; line-height: 1.25; text-align: center;
}
.adp-ruser-pick { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.adp-ruser-pick .band { font-size: 13.5px; font-weight: 800; color: #111827; white-space: nowrap; }
.adp-ruser-pick .rooms { font-size: 11.5px; font-weight: 700; color: #4b5563; white-space: nowrap; }
/* 평형대 칸 바로 아래에 룸수 고르는 칸 */
.adp-ruser-room { margin-top: 5px; }
.adp-ruser-select.room { min-height: 32px; }
.adp-ruser-select.room .band { font-size: 12.5px; }
.adp-ruser-select .adp-rcase-caret { flex: none; }
.adp-ruser-list { min-width: 190px; }
/* 평형대·룸 표시를 또렷한 검은 글씨로 */
.adp-ruser-list .adp-rcase-item strong,
.adp-ruser-list .adp-rcase-item small { color: #111827; }
/* 입지조건 한 줄 + 등수 입력 */
.adp-ruser-cond-row { display: flex; align-items: center; gap: 4px; height: 26px; }
.adp-ruser-cond-row.center { justify-content: center; }
.adp-ruser-cond-row + .adp-ruser-cond-row { margin-top: 6px; }
.adp-ruser-cond-name { flex: 1 1 auto; min-width: 0; font-weight: 700; color: #111827; font-size: 12.5px; white-space: nowrap; text-align: center; }
.adp-ruser-rank {
  flex: 0 0 28px; width: 28px; box-sizing: border-box; min-width: 0;
  border: 1px solid #d1d5db; border-radius: 6px;
  padding: 4px 2px; font-size: 12px; font-weight: 800; text-align: center;
  color: #111827; font-family: inherit; background: #fff;
}
/* 손으로 적은 등수는 파랗게 — 거리로 매긴 자동값(검정)과 한눈에 가른다 */
.adp-ruser-rank.typed { color: #2b6df3; border-color: #b9cdf7; }
/* 손으로 적은 값을 지우고 자동값으로 — 되돌릴 게 있을 때만 뜬다 */
/* 줄 오른쪽 끝 — 아래 평균등수 칸과 같은 쪽에 선다 */
.adp-rank-reset {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid #b9cdf7; border-radius: 999px; background: #fff;
  padding: 2px 8px 2px 6px; font-family: inherit; font-size: 10.5px; font-weight: 700;
  color: #2b6df3; line-height: 1.4; cursor: pointer; white-space: nowrap;
}
.adp-rank-reset:active { background: #eaf1ff; }
/* 되돌릴 게 없을 때 — 자리는 지키되 눌리지 않는다는 걸 회색으로 알린다 */
.adp-rank-reset.off { border-color: #e3e8f0; color: #9ca3af; cursor: default; }

/* 권리분석 탭 — 첨부 / 케이스 배너 / 서류 확인 */
.adp-rcase-banner {
  margin: 8px 0 0; padding: 10px 12px;
  background: #eaf1ff; border-radius: 8px;
  font-size: 12.5px; font-weight: 700; color: #1d4ed8; line-height: 1.5;
}
.adp-rdoc-task { display: block; font-weight: 700; color: #111827; font-size: 11.5px; line-height: 1.4; }
.adp-rdoc-task-cell, .adp-rdoc-note-cell { vertical-align: middle; padding: 8px 5px; }
.adp-rdoc-input {
  display: block; width: 100%;
  border: 1px solid #d1d5db; border-radius: 7px;
  padding: 6px 8px; font: inherit; font-size: 11.5px;
  color: #111827; background: #fff;
}
.adp-rdoc-input.adp-date-btn {
  display: flex; align-items: center; justify-content: space-between; gap: 4px;
  cursor: pointer; text-align: left;
}
.adp-rdoc-input .ph { color: #9ca3af; }
/* 적는 칸이 아니라 '무슨 날짜인지' 를 세워 두는 글자 칸 — 옆 칸과 높이만 맞춘다 */
.adp-rdoc-label {
  display: flex; align-items: center; height: 30px; padding: 0 1px;
  font-size: 10.5px; font-weight: 700; color: #4b5563; white-space: nowrap;
  letter-spacing: -0.5px;
}
/* 한 항목을 두 줄로 쓸 때 줄 사이 간격 */
.adp-rdoc-survey + .adp-rdoc-survey { margin-top: 4px; }
/* 현황조사서·세대열람·문건송달 행 — 세 칸을 정확히 3등분해 행마다 같은 자리에 오게 한다.
   (flex는 칸 종류에 따라 폭이 조금씩 달라져 그리드로 고정한다) */
.adp-rdoc-survey {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center; gap: 3px;
}
.adp-rdoc-survey > * { min-width: 0; }
.adp-rdoc-survey .adp-rdoc-input {
  width: 100%; height: 30px; padding: 0 4px; font-size: 10.5px;
  display: flex; align-items: center; line-height: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* input은 flex 정렬이 통하지 않아 줄 높이로 가운데를 맞춘다 */
.adp-rdoc-survey input.adp-rdoc-input { display: block; line-height: 28px; }
.adp-rdoc-survey .adp-date-btn > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-rdoc-survey .adp-date-caret { flex: 0 0 auto; }
/* 날짜칸은 글자 길이가 정해져 있다 — 안쪽 여백을 줄여 폭을 아끼고
   남는 자리를 옆의 고르는 칸·적는 칸에 넘긴다 */
.adp-rdoc-survey .adp-date-btn { padding: 0 2px; gap: 2px; font-size: 10.5px; letter-spacing: -0.3px; }
/* 세 박스의 글자는 한 크기로 — 칸마다 달라 보이면 같은 줄로 읽히지 않는다 */
.adp-rdoc-survey .adp-rdoc-input,
.adp-rdoc-survey .adp-agency-trigger .txt { font-size: 10.5px; }
/* 문건송달 내역 — 확인 문구를 한 줄 쓰고 비고는 그 아래 줄에 길게 둔다 */
.adp-rdoc-task.inline { grid-column: 1 / -1; min-width: 0; align-self: center; white-space: normal; }
.adp-rdoc-task.inline + .adp-rdoc-input { grid-column: 1 / -1; margin-top: 4px; }
.adp-rdoc-input:focus { border-color: #2b6df3; outline: none; }
/* 편집 중이 아닐 때는 입력칸을 눌러도 바뀌지 않게 하고 테두리만 옅게 둔다 */
.adp-rdoc-multi { min-width: 0; }
/* 아랫줄 마지막 칸 끝까지 늘려 쓰는 칸 */
.adp-rdoc-multi.wide { grid-column: 3 / -1; }
.adp-rdoc-multi .adp-agency-trigger { width: 100%; font-size: 10.5px; }
/* 화살표를 옆 날짜칸과 같은 크기로 */
.adp-rdoc-multi .adp-agency-trigger .caret { font-size: 15px; color: #6b7280; line-height: 1; }
.adp-rdoc-table .adp-rcheck-desc { vertical-align: top; }
/* 권리 케이스 표는 분홍, 서류 확인 표는 파랑으로 구분 — 둘 사이를 띄워 구분이 더 분명하게 */
.adp-rdoc-table { margin-top: 10px; }
.adp-rdoc-table .adp-rcheck-label { background: #e3edfb; }

.adp-rcase-dd { position: relative; }
.adp-rcase-select {
  width: 100%; box-sizing: border-box;
  border: 1px solid #d1d5db; border-radius: 8px;
  padding: 9px 10px; font-size: 12.5px; font-weight: 700; color: #111827;
  background: #fff; cursor: pointer; text-align: left;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
/* 케이스를 고르고 나면 붉게 — 펼친 목록의 글자는 검은색 그대로 */
.adp-rcase-select.picked { color: #e0574a; border-color: #f0d4d0; }
.adp-rcase-caret { color: #6b7280; font-size: 15px; line-height: 1; }
/* 목록 밖을 눌러 닫기 위한 투명 레이어 */
/* 권리분석 정리 — 한 줄짜리 비고와 달리 여러 줄을 적는 자리다 */
.adp-rconc-body { padding: 8px 10px 10px; }
.adp-rconc-note {
  display: block; width: 100%; box-sizing: border-box; resize: vertical; min-height: 72px;
  border: 1px solid #e3e8f0; border-radius: 8px; background: #fff;
  padding: 7px 9px; font-family: inherit; font-size: 12px; line-height: 1.6; color: #111827;
}
.adp-rconc-note:focus { outline: none; border-color: #2b6df3; }
.adp-rconc-note::placeholder { color: #9ca3af; }
.adp-rcase-backdrop { position: fixed; inset: 0; z-index: 40; }
.adp-rcase-list {
  position: absolute; z-index: 41; left: 0; right: 0; top: calc(100% + 4px);
  margin: 0; padding: 4px 0; list-style: none;
  background: #fff; border: 1px solid #d1d5db; border-radius: 8px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.16);
  max-height: 320px; overflow: auto;
}
.adp-rcase-item {
  padding: 9px 12px; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px;
}
.adp-rcase-item + .adp-rcase-item { border-top: 1px solid #f1f5f9; }
.adp-rcase-item strong { font-size: 12.5px; font-weight: 800; color: #111827; }
.adp-rcase-item small { font-size: 11px; color: #111827; line-height: 1.45; }
.adp-rcase-item.on { background: #eef4ff; }
.adp-rcase-item.on strong { color: #1d4ed8; }
.adp-rcase-item:active { background: #f3f4f6; }
.adp-rcase-summary {
  margin: 8px 0 0; padding: 8px 10px;
  background: #eef4ff; border: 1px solid #c7d7f7; border-radius: 8px;
  font-size: 13px; font-weight: 800; color: #1d4ed8; line-height: 1.5;
}

.adp-rcheck-table { table-layout: fixed; }
.adp-rcheck-table td { font-size: 11.5px; padding: 10px 8px; vertical-align: middle; line-height: 1.45; }
/* 현장 체크리스트 — 항목명을 한 줄로 두고 줄 높이를 낮춘다 */
.adp-cl-table td { padding: 6px 8px; line-height: 1.3; }
.adp-cl-table .adp-rcheck-label strong { white-space: nowrap; font-size: 12.5px; letter-spacing: -0.3px; }
.adp-cl-table .adp-rcheck-desc { font-size: 13px; }
.adp-cl-sub th {
  background: #eef2f7; font-size: 13px; font-weight: 800; color: #111827;
  text-align: left; padding: 7px 8px;
}
/* 임차인현황 머리줄 — 기준 이름은 회색, 날짜만 파랗게 */
.adp-base-note .adp-tn-date { font-weight: 400; color: #2b6df3; }
/* 네 항목을 한 줄씩, 다른 탭의 ①②③ 목차와 같은 모양으로 */
/* '전입 확정 배당'이 한 줄에 들어가게 이름 칸을 넓힌다 */
.adp-base-tenant .adp-base-row { grid-template-columns: 110px minmax(0, 1fr); }
.adp-base-tenant .adp-base-row dt { font-size: 12.5px; white-space: nowrap; letter-spacing: -0.2px; }
.adp-base-tenant .adp-base-row dd,
.adp-base-tenant .adp-base-row dd strong,
.adp-base-tenant .adp-base-row dd span { font-size: 12.5px; }
/* 임차인 이름도 아래 칸(보증금·점유/기간)과 같은 글자로 — 혼자 굵어 더 커 보였다 */
.adp-base-tenant .adp-base-row dd strong { font-weight: 600; }
.adp-base-row dd.adp-tn-dates { font-size: 12.5px; }
.adp-rcheck-label { background: #fde7e7; text-align: center; color: #111827; font-weight: 700; }
.adp-rcheck-label strong { font-size: 12px; }
.adp-rcheck-desc { color: #4b5563; white-space: pre-line; }
.adp-rcheck-cell { text-align: center; }
/* 체크 마킹 — 기본 체크박스를 직접 그려 모서리를 둥글게(4px) 만든다 */
.adp-rcheck-box {
  appearance: none; -webkit-appearance: none;
  box-sizing: border-box; position: relative; margin: 0;
  width: 22px; height: 22px; cursor: pointer;
  border: 2px solid #b6bcc7;
  border-radius: 4px;
  background: #fff;
  transition: background-color 0.12s, border-color 0.12s;
}
.adp-rcheck-box:checked { background: #dc2626; border-color: #dc2626; }
.adp-rcheck-box:checked::after {
  content: '';
  position: absolute; left: 6px; top: 2.5px;
  width: 5px; height: 10px;
  border: solid #fff; border-width: 0 2.5px 2.5px 0;
  transform: rotate(45deg);
}
.adp-rcheck-box:disabled { opacity: 0.45; cursor: default; }

/* 손품조사 */
.adp-survey-head { gap: 8px; }
/* 현장에서 적는 카드라 제목을 파랗게 구분한다 */
.adp-card-head h2.adp-head-blue { color: #2b6df3; }
.adp-card-head h2.adp-head-blue .adp-h2-ico { color: #2a5fbf; }
.adp-survey-head h2 { flex: 1 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 5px; }
/* 제목 옆 안내문구가 길면 다음 줄로 내린다 */
.adp-survey-head h2.adp-head-wrap { flex-wrap: wrap; row-gap: 2px; }
.adp-survey-note-inline.below { flex: 0 0 100%; margin-left: 0; }
.adp-survey-head .adp-edit-btn { flex: 0 0 auto; }
.adp-survey-head .adp-chev { flex: 0 0 auto; }
.adp-survey-head h2 .q { font-size: 11px; color: #9ca3af; border: 1px solid #d1d5db; border-radius: 50%; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
.adp-survey-note-inline { font-size: 11px; color: #2b6df3; font-weight: 500; margin-left: 6px; }
/* 세대 구성 — 인원은 굵게 한 줄, 유형은 그 아래로 한 줄씩 */
.adp-ruser-line { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.adp-ruser-line strong { font-weight: 800; color: #111827; font-size: 13px; }
.adp-ruser-line .kind { font-weight: 400; color: #4b5563; font-size: 12px; }
/* 제목 옆 안내 — 글자 대신 ⓘ 로 접어 둔다 (굵게 하지 않는다) */
.adp-note-wrap { position: static; display: inline-flex; align-items: center; margin-left: 4px; vertical-align: -2px; }
.adp-note-btn {
  border: none; background: transparent; padding: 0; cursor: pointer;
  color: #2b6df3; display: inline-flex; align-items: center;
}
/* 라벨 + 사실 꼴 말풍선 — 지표결과(.adp-dm-bubble)와 같은 모양 */
.adp-note-bubble.rows { text-align: left; }
/* flex 로 둬야 한 줄짜리 값이든 여러 줄짜리 값이든 값 칸에 맞춰 선다.
   inline-block 이면 둘째 줄이 이름 칸 밑으로 흘러내린다 */
.adp-note-bubble.rows span { display: flex; align-items: baseline; gap: 6px; }
.adp-note-bubble.rows b {
  flex: 0 0 52px;
  font-weight: 800; color: #9db9ef;
}
.adp-note-bubble {
  /* 화면 기준으로 좌우를 잡는다 — 가장자리 칸에서 글이 잘리던 것을 막는다 */
  position: fixed; left: 10px; right: 10px; width: auto; text-align: center;
  z-index: 60;
  background: rgba(17, 24, 39, 0.92); color: #fff; border-radius: 10px; padding: 7px 10px;
  font-size: 12px; font-weight: 400; line-height: 1.5; letter-spacing: 0; cursor: pointer;
  /* 공식과 뜻을 줄을 나눠 적는다 */
  white-space: pre-line;
}
/* 제목 옆 회색 안내 */
.adp-head-note { font-size: 11.5px; color: #111827; font-weight: 400; margin-left: 6px; }
.adp-region-pills { display: inline-flex; gap: 4px; margin-left: 6px; vertical-align: middle; }
.adp-region-pill {
  border: 1px solid #d5dbe6; background: #fff; color: #4b5563;
  border-radius: 999px; padding: 2px 9px; font-size: 10.5px; font-weight: 700; cursor: pointer;
}
.adp-region-pill.on { border-color: #2b6df3; background: #eaf1ff; color: #2b6df3; }
/* 지역 기준 버튼은 제목·안내문구 아랫줄에 놓는다 */
.adp-region-pills.below { flex: 0 0 100%; margin-left: 0; margin-top: 2px; }
/* 통합 카드 안의 하위 블록 (입지등수사진 / 거래율 / 매물적체 / 매매수요 결론) */
.adp-sub-block { border-top: 1px solid #eef1f6; margin-top: 12px; padding-top: 10px; }
/* 바로 위 제목에 이어지는 블록은 구분선을 빼 한 묶음으로 보이게 한다 */
.adp-sub-block.noline { border-top: none; margin-top: 0; padding-top: 0; }
.adp-sub-head { display: flex; align-items: center; gap: 8px; padding: 0 2px 2px; }
.adp-sub-head h3 {
  margin: 0; flex: 1 1 auto; min-width: 0; font-size: 15px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px;
}
.adp-sub-head .adp-edit-btn { flex: 0 0 auto; }
.adp-sub-head.first { padding-top: 2px; }
.adp-sub-head h3.red { color: #e0574a; }
/* 카드 제목만 붉게 — 그 안의 표 제목(시세 결론·급매가 결론)은 검은 글씨다 */
.adp-head-red { color: #e0574a; }
/* 결론표 비고 줄 — 칸 구분 없이 통으로 */
.adp-conc-table .adp-conc-note { text-align: left; padding: 4px 5px; }
.adp-conc-table .adp-conc-note > span { font-size: 11px; font-weight: 400; color: #9ca3af; }
.adp-conc-table .adp-conc-note > .adp-mkt-input { width: 100%; text-align: left; }
/* 손품결론 카드 — 빈 자리를 줄여 한 화면에 더 담는다 */
.adp-conc-card .adp-sub-block { margin-top: 7px; padding-top: 7px; }
.adp-conc-card .adp-sub-block:first-child { margin-top: 2px; padding-top: 2px; border-top: none; }
.adp-conc-card .adp-sub-head { padding-bottom: 1px; }
.adp-conc-card .adp-sub-head h3 { font-size: 14px; }
.adp-conc-card .adp-conc-table { margin-top: 2px; }
/* 손품결론 — 큰 묶음 제목과 그 아래 설명 한 줄 */
.adp-conc-title { font-size: 16.5px; }
.adp-conc-sub { margin: 0 0 4px; padding: 0 2px; font-size: 12.5px; color: #6b7280; font-weight: 600; }
.adp-conc-row { display: flex; align-items: center; gap: 8px; padding: 8px 0 4px; }
.adp-conc-label { flex: 0 0 auto; font-size: 13px; font-weight: 700; color: #374151; white-space: nowrap; }
.adp-conc-row .adp-fs-input { flex: 1 1 auto; height: 34px; }

/* 시세조사 및 급매가 조사 — 가로 스크롤 되는 표 3개 */
/* 개별성 분석 표 — 상세구분 / 현황 / 가격율 세 칸 */
/* 시세 및 급매가 결론 표 — 머리글 아래 면적 / 평당가 / 가격 세 줄 */
.adp-conc-table th { white-space: pre-line; }

.adp-conc-table th small { display: block; font-size: 9.5px; font-weight: 600; color: #6b7280; }
/* 손으로 적은 값은 파랗게 — 계산해 낸 값(검정)과 한눈에 가른다.
   .hi 가 색을 잡고 있어 선택자를 한 단계 좁혀야 이긴다 */
.adp-conc-table .adp-conc-v.typed,
.adp-conc-table .adp-conc-v.hi.typed { color: #2b6df3; }
/* 평균에서 뺀 칸 — 숫자는 남기되 흐리게 해서 '이건 안 셌다' 가 보이게 한다 */
.adp-conc-table th.off, .adp-conc-table td.off { opacity: 0.45; }
/* 머리줄의 체크 — 이름 왼쪽에 작게 */
.adp-conc-pick { display: block; line-height: 0; margin-bottom: 2px; }
.adp-conc-pick input { width: 13px; height: 13px; margin: 0; accent-color: #2b6df3; }
/* 평균 칸 — 여러 칸을 모아 낸 값이라 금액처럼 파랗게, 굵게 세운다 */
.adp-conc-table td.mean .adp-conc-v { color: #2b6df3; font-weight: 800; }
/* 시세 결론의 마지막 '가격' 줄 — 견주는 표의 결론이라 줄 전체를 굵게 */
.adp-conc-table.bold-price .adp-conc-v.hi { font-weight: 800; }
.adp-conc-table .adp-conc-v { font-size: 10.5px; font-weight: 400; color: #111827; white-space: nowrap; }
.adp-conc-table .adp-conc-v.red { color: #e0574a; }
.adp-conc-table .adp-conc-v small { font-size: 9.5px; font-weight: 600; color: #9ca3af; margin-left: 1px; }
.adp-conc-table .adp-mkt-input { width: 100%; }
.adp-conc-table .adp-conc-v.pre { white-space: pre-line; line-height: 1.3; }
/* 면적 칸 — ㎡ 줄과 평 줄 두 칸 */
.adp-conc-unit { display: flex; align-items: center; justify-content: flex-end; gap: 2px; font-size: 10px; color: #6b7280; }
.adp-conc-unit + .adp-conc-unit { margin-top: 3px; }
.adp-conc-unit .adp-mkt-input { width: auto; flex: 1 1 0; min-width: 0; }
.adp-ind-body { padding: 3px 0 10px; }
.adp-ind-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.adp-ind-table th, .adp-ind-table td {
  /* 줄이 많은 표다 — 글자는 그대로 두고 위아래 여백만 줄인다 (7 → 5px) */
  border: 1px solid #e5e7eb; padding: 5px 6px; font-size: 13px; color: #111827;
  text-align: center; vertical-align: middle; word-break: keep-all;
}
/* 그룹 머리줄 (구역내 / 단지내 개별성) */
.adp-ind-group th {
  background: #eef2f7; font-weight: 800; font-size: 12.5px; text-align: left;
  letter-spacing: -0.2px; padding: 5px 8px;
}
.adp-ind-label { background: #fafbfc; font-weight: 700; font-size: 12.5px; line-height: 1.25; }
.adp-ind-ctl .row { display: flex; align-items: center; justify-content: center; gap: 4px; }
/* '현황' 칸 글자는 한 가지 크기로 못 박는다 — 값도 꼬리말도 같은 13px (년식·주차수 기준) */
.adp-ind-ctl .row strong,
.adp-ind-ctl .row .adp-sum-pair,
.adp-ind-ctl .row > span { font-size: 13px; font-weight: 800; }
.adp-ind-ctl .row strong.hi { color: #2b6df3; }
.adp-ind-ctl .note {
  flex: 1 1 0; min-width: 0; text-align: left; font-size: 10.5px; color: #9ca3af; line-height: 1.2;
}
.adp-ind-input {
  flex: 1 1 0; min-width: 0; height: 26px; border: 1px solid #e3e8f0; border-radius: 6px;
  padding: 2px 4px; font-size: 12.5px; color: #111827; background: #fff; text-align: center;
}
.adp-ind-input:focus { outline: none; border-color: #2b6df3; }
.adp-ind-input.sm { flex: 0 0 auto; width: 110px; }
/* 년식·주차수 입력칸은 현황 칸의 절반만 쓰고 왼쪽에 붙인다 */
.adp-ind-ctl .row.left { justify-content: flex-start; }
.adp-ind-year, .adp-ind-input.half { flex: 0 0 50%; width: auto; min-width: 0; text-align: left; }
.adp-ind-year { cursor: pointer; justify-content: flex-start; font-size: 10.5px; }
.adp-ind-year:disabled { background: #fff; color: #111827; border-color: #eceff4; opacity: 1; cursor: default; }
.adp-ind-years { flex: 0 0 auto; font-size: 13px; font-weight: 800; color: #2b6df3; white-space: nowrap; }
/* 개별성 표의 입력칸·선택칸 글자는 모두 가운데로 */
.adp-ind-ctl .adp-ind-input,
.adp-ind-ctl .adp-ind-year,
.adp-ind-ctl .adp-ind-input.half { text-align: center; }
.adp-ind-ctl .adp-ind-year { justify-content: center; }
.adp-ind-ctl .adp-agency-trigger .txt { flex: 1 1 auto; min-width: 0; text-align: center; }
.adp-ind-ctl .adp-agency-trigger .caret { margin-left: 0; }
.adp-ind-rate { font-size: 12.5px; font-weight: 700; color: #4b5563; background: #fafbfc; padding: 4px 3px; }
.adp-ind-multi { flex: 1 1 auto; min-width: 0; }
/* 선택지 셋 이하 — 콤보 대신 알약 버튼으로 고른다 */
.adp-ind-toggles { display: flex; flex: 1 1 auto; flex-wrap: nowrap; gap: 4px; justify-content: center; min-width: 0; }
.adp-ind-toggles .adp-toggle-btn { padding: 4px 8px; font-size: 11px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.adp-ind-combo-custom { display: flex; gap: 4px; padding: 5px 4px 2px; border-top: 1px solid #eef1f6; margin-top: 3px; }
.adp-ind-combo-custom input {
  flex: 1 1 auto; min-width: 0; border: 1px solid #e3e8f0; border-radius: 6px;
  padding: 4px 5px; font-size: 10.5px; color: #111827; background: #fff;
}
.adp-ind-combo-custom input:focus { outline: none; border-color: #2b6df3; }
.adp-ind-combo-custom button {
  flex: 0 0 auto; border: 1px solid #d5dbe6; background: #fff; color: #4b5563;
  border-radius: 6px; padding: 2px 8px; font-size: 10.5px; font-weight: 700; cursor: pointer;
}
.adp-ind-multi .adp-agency-trigger { height: 26px; }
/* 다중 선택 칸의 화살표를 옆 select와 같은 꺾쇠 모양·크기로 맞춘다 */
.adp-ind-multi .adp-agency-trigger .caret {
  font-size: 0; width: 12px; height: 12px; flex: 0 0 12px;
  background: no-repeat center / 12px 12px
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
}
.adp-ind-rate-row { display: flex; align-items: center; justify-content: center; gap: 1px; font-size: 10px; font-weight: 700; }
.adp-ind-input.rate { flex: 1 1 auto; min-width: 0; height: 24px; padding: 2px 2px; font-size: 10px; font-weight: 700; }
.adp-ind-table tfoot th, .adp-ind-table tfoot td { background: #f7f9fc; }
/* 예상 매매가와 글자 크기를 맞춘다 */
.adp-ind-table tfoot .adp-ind-ctl strong.hi { color: #2b6df3; font-size: 13px; }
.adp-ind-ctl .row .sign { flex: 0 0 auto; font-size: 10px; color: #6b7280; font-weight: 700; }

.adp-mkt-body { padding: 2px 0 8px; }
/* 매매수요 — 동단위 수요·공급 */
.adp-dm-body { padding: 2px 0 8px; }
.adp-dm-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 1px 2px 5px; }
/* 블록끼리의 사이도 같은 눈금으로 */
.adp-mkt-block + .adp-mkt-block, .adp-dm-block + .adp-dm-block { margin-top: 8px; }
/* 카드 제목 > 큰 단락(1./3.) > 항목(①②③) 순으로 한 단계씩 작게 */
.adp-dm-title { font-size: 15px; font-weight: 800; color: #111827; }
.adp-dm-title small { font-size: 12px; font-weight: 700; color: #4b5563; }
/* 급매가의 ①②③ 블록처럼 네모로 묶는다 */
.adp-dm-block { border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; padding: 6px 10px 7px; }
/* 기간 표기만 파랗게 — 어느 기간 거래량인지 눈에 들어오게 */
.adp-dm-mon { color: #2b6df3; }
/* 수요공급 — 숫자 뒤 단위(건·%·개월)는 값보다 뒤로 물러나게 회색 */
.adp-dm-block .adp-mkt-cells .cell strong.hi-blue em { color: #6b7280; }
/* 자동으로 채워지는 값이라는 표시 */
.adp-dm-info {
  border: none; background: transparent; padding: 0; cursor: pointer;
  color: #2b6df3; display: inline-flex; align-items: center; vertical-align: -2px;
}
/* 말풍선 — 브라우저 기본 툴팁 대신 직접 그린다 (눌렀을 때만) */
.adp-dm-rowwrap { position: relative; }
.adp-dm-bubble {
  position: absolute; left: 2px; right: 2px; top: calc(100% + 6px); z-index: 40;
  margin: 0; padding: 8px 10px;
  background: rgba(17, 24, 39, 0.92); color: #fff; border-radius: 10px;
  font-size: 12px; font-weight: 400; line-height: 1.5; cursor: pointer;
}
/* 줄이 넘치면 둘째 줄도 값 칸에 맞춰 서야 한다 —
   inline-block 이면 이름 칸 밑으로 흘러내린다 */
.adp-dm-bubble span { display: flex; align-items: baseline; gap: 6px; }
/* 사용자가 직접 해야 하는 일(이동·찾기)은 초록 — '적합'과 같은 색 */
.adp-dm-bubble b.act, .adp-note-bubble.rows b.act { color: #4ade80; }
.adp-dm-bubble b {
  flex: 0 0 32px;
  font-weight: 800; color: #9db9ef;
}
/* '적정' 줄은 한눈에 찾을 수 있게 초록으로 */
.adp-dm-bubble span.good { color: #86efac; }
.adp-dm-bubble span.good b { color: #4ade80; }
.adp-dm-bubble::before {
  content: ''; position: absolute; top: -5px; left: var(--arrow, 12%);
  border-left: 6px solid transparent; border-right: 6px solid transparent;
  border-bottom: 6px solid rgba(17, 24, 39, 0.92);
}
/* 사진 카드 제목 옆 표시 — 접혀 있어도 사진이 몇 장 들어 있는지 보인다 */
.adp-photo-mark {
  display: inline-flex; align-items: center;
  margin-left: 5px; padding: 1px 7px; border-radius: 999px;
  background: #e4f6ea; color: #1f7a45;
  font-size: 10.5px; font-weight: 800; vertical-align: 1px;
}
/* 조사 대상 동 이름 — 제목 안에서 눈에 띄게 */
.adp-dm-area { color: #2b6df3; }
/* 제목 옆 주소 — 제목만큼 크면 어느 쪽이 제목인지 흐려진다.
   급매가 ① 블록 제목(13px)에 맞추고 굵기는 뺀다 */
.adp-dm-addr { font-size: 13px; font-weight: 500; color: #2b6df3; }
/* 세대수 조회 바로가기 — 라벨 옆 작은 돋보기 */
/* 누르면 밖으로 나가는 이름 — 밑줄 하나로 알린다.
   돋보기 한 단추가 설명과 이동을 겸하던 것을 갈랐다. 폰에는 '올려놓기'가 없어
   누르면 무조건 이동이라, 설명은 영영 볼 수 없었다. */
.adp-dm-link {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #6b7280;
  line-height: 1.2; text-align: center;
  text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px;
}
.adp-dm-link:active { color: #2b6df3; }
.adp-dm-block + .adp-dm-block { margin-top: 10px; }
.adp-dm-block.boxed + .adp-dm-block.boxed { margin-top: 10px; }
.adp-dm-head.sec2 { margin-top: 7px; padding-top: 6px; border-top: 1px solid #eef1f6; }
/* 단락 제목 줄의 버튼은 오른쪽 끝에 붙인다 */
.adp-dm-head .adp-mkt-addrow,
.adp-dm-head .adp-edit-btn { margin-left: auto; }
/* 수요공급 숫자 — 칸 가운데에 두되, 숫자 상자를 같은 폭으로 잡아 끝자리를 맞춘다 */
.adp-dm-block .adp-mkt-cells .cell strong { width: auto; text-align: center; }
/* 숫자 앞에 붙는 기간 표시 — 소진기간의 Y·M 과 같은 꼴, 색만 회색 */
.adp-mkt-cells .cell strong.hi-blue em.adp-dm-pre {
  color: #6b7280; font-size: 11px; margin: 0 3px 0 0;
}
/* 두 값을 한 칸에 담는 거래량 — 한 줄을 지키고, 숫자 최소폭 규칙을 푼다 */
.adp-mkt-cells .cell strong.adp-dm-two { white-space: nowrap; letter-spacing: -0.5px; }
/* 12개월 거래량 | 월평균 거래량 — 가운데 막대로 두 값을 가른다.
   앞선 규칙이 strong 안의 em 을 11px로 줄여 막대가 아래로 처져 보였다.
   숫자와 같은 크기로 돌려 밑줄이 맞게 한다 */
.adp-mkt-cells .cell strong.hi-blue em.adp-dm-bar,
.adp-dm-bar {
  font-style: normal; font-size: inherit; font-weight: 400;
  color: #c3cbd8; margin: 0 7px; line-height: 1;
}
.adp-dm-block .adp-mkt-cells .cell strong .num {
  display: inline-block; min-width: 56px; text-align: right;
}
/* 단위 글자 폭이 '개/세대/건'으로 달라 가운데 정렬하면 숫자 끝이 어긋난다.
   단위도 같은 폭으로 잡아 블록끼리 끝자리가 정확히 맞게 한다 */
.adp-dm-block .adp-mkt-cells .cell strong em {
  display: inline-block; min-width: 26px; text-align: left; margin-left: 2px;
}
/* 단위 폭 맞추기(26px)는 한 값짜리 칸을 위한 것 —
   거래량처럼 두 값을 담는 칸에서는 '연·월·막대'가 그만큼씩 벌어져 칸을 넘친다 */
.adp-dm-block .adp-mkt-cells .cell strong.adp-dm-two em { min-width: 0; }
/* 앞붙임(연·월)과 막대의 여백은 여기서 못 박는다 — 위 규칙에 지워지지 않게 */
.adp-dm-block .adp-mkt-cells .cell strong em.adp-dm-pre { margin: 0 3px 0 0; }
.adp-dm-block .adp-mkt-cells .cell strong em.adp-dm-bar { margin: 0 7px; }
.adp-dm-block .adp-mkt-cells .cell .adp-mkt-input { text-align: right; }
.adp-dm-block .adp-dm-result { width: 100%; justify-content: center; }
.adp-dm-block .adp-dm-result > em { display: inline-block; min-width: 14px; text-align: left; }
.adp-dm-block .adp-dm-judge { flex: 0 0 34px; text-align: right; }
.adp-dm-sub { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 3px 2px 2px; font-size: 13px; font-weight: 800; color: #111827; }
.adp-dm-sub .adp-edit-btn { margin-left: auto; }
.adp-dm-result em { font-size: 11px; font-style: normal; font-weight: 700; color: #4b5563; }
.adp-dm-block-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 5px; padding: 0 2px; }
/* 소제목 줄의 접기 화살표는 오른쪽 끝에 */
.adp-dm-sub > .adp-photo-fold { margin-left: auto; }
/* ① 입지조사와 같은 뎁스 — 크기·굵기를 맞춘다 */
.adp-dm-block-head .t { font-size: 13px; font-weight: 800; color: #111827; }
.adp-dm-block-head small { font-size: 11px; color: #2b6df3; font-weight: 500; }
.adp-dm-pair { display: flex; align-items: center; justify-content: center; gap: 3px; width: 100%; font-size: 11px; font-weight: 700; color: #4b5563; }
.adp-dm-pair .adp-mkt-input { flex: 1 1 0; min-width: 0; }
.adp-dm-std {
  width: 34px; border: 1px solid #e3e8f0; border-radius: 5px; background: #fff;
  padding: 1px 3px; font-size: 10px; font-weight: 700; color: #374151; text-align: center;
}
.adp-dm-std:focus { outline: none; border-color: #2b6df3; }
.adp-dm-result { display: flex; align-items: baseline; justify-content: center; gap: 4px; width: 100%; }
/* 값 글자를 블록 제목(13px)과 같은 크기로 — 18px 는 한 화면에 모이면 복잡하다 */
.adp-mkt-cells .cell strong.hi-blue { color: #2b6df3; font-size: 13px; }
.adp-mkt-cells .cell strong.hi-blue em { font-size: 11px; font-style: normal; font-weight: 700; color: #111827; margin-left: 3px; }
.adp-mkt-cells .cell strong.hi-blue small.sub { font-size: 10.5px; font-weight: 700; color: #6b7280; margin-left: 3px; }
.adp-dm-judge { font-size: 11px; font-weight: 800; color: #e0574a; white-space: nowrap; }
.adp-dm-judge.bad { color: #e0574a; }
.adp-mkt-body > .adp-sub-block:first-child { border-top: none; margin-top: 0; padding-top: 0; }
/* 시세조사 본문 — 표 대신 항목별 카드로 쪼개 가로 스크롤을 없앴다 */
/* 세로 간격 눈금: 블록 안쪽 8px · 줄 사이 7px · 묶음 사이 8px (화면 전체 공통) */
.adp-mkt-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; background: #fff; }
.adp-mkt-block + .adp-mkt-block { margin-top: 8px; }
.adp-mkt-block-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; min-width: 0; flex-wrap: nowrap; }
.adp-mkt-block-head .t { font-size: 13px; font-weight: 800; color: #111827; }
/* '(자동입력)' 은 제목이 아니라 덧말 — 굵기를 빼고 바로 붙여 쓴다 */
.adp-mkt-block-head .t .adp-mkt-auto { font-style: normal; font-weight: 400; color: #6b7280; }
.adp-mkt-block-head small { font-size: 11px; color: #2b6df3; font-weight: 500; }
.adp-mkt-region { display: inline-flex; align-items: center; gap: 4px; flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #16a085 !important; font-weight: 700 !important; }
.adp-mkt-block-head .adp-update-time { margin-left: auto; font-size: 10.5px; color: #6b7280; white-space: nowrap; }
/* 경매물건 / 유사물건 전환 */
/* 기본인 '경매물건'은 파란색, 대체 조사인 '유사물건'은 회색 */
.adp-mkt-mode {
  margin-left: auto; flex: 0 0 auto;
  border: 1px solid #2b6df3; background: #eaf1ff; color: #2b6df3;
  border-radius: 999px; padding: 2px 10px; font-size: 10.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.adp-mkt-mode.sim { border-color: #e0574a; background: #fdecea; color: #e0574a; }
/* 행 묶음 바로 뒤에 올 때는 붙여 둔다 (둘 다 auto 면 사이가 벌어진다) */
.adp-mkt-block-head .adp-mkt-step + .adp-mkt-mode { margin-left: 5px; }
/* 제목의 '경매물건/유사물건' 글자도 버튼 색과 맞춘다 */
.adp-mkt-block-head .t .mode { color: #2b6df3; }
.adp-mkt-block-head .t .mode.sim { color: #e0574a; }
.adp-mkt-mode:active { opacity: 0.7; }
.adp-mkt-block .adp-mkt-cells + .adp-mkt-cells { margin-top: 6px; }
/* 테두리 없이 쓸 때도 블록 안 제목과 같은 들여쓰기를 준다 */
.adp-mkt-block-head.bare { padding: 0 10px; }
.adp-mkt-block-head.wrapy { flex-wrap: wrap; }
/* 조건식 분석의 지역·건수는 줄 오른쪽 끝에 맞춘다 */
.adp-mkt-block-head.wrapy .adp-mkt-region { margin-left: auto; }
.adp-mkt-block-head.wrapy .adp-mkt-region { overflow: visible; }
.adp-mkt-cells { display: grid; gap: 6px; }
/* 한 블록에 줄이 두 개일 때 위아래 줄 사이를 띄운다 */
.adp-mkt-cells + .adp-mkt-cells { margin-top: 8px; }
.adp-mkt-cells.c1 { grid-template-columns: minmax(0, 1fr); }
.adp-mkt-cells.c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.adp-mkt-cells.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.adp-mkt-cells.c4 { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.adp-mkt-cells.c4 .cell small { letter-spacing: -0.4px; }
/* 이름 칸과 값 칸을 선으로 가른다 — 이름 칸 전체가 설명을 띄우는 영역 */
.adp-mkt-cells .cell.split { padding: 0; gap: 0; overflow: hidden; }
.adp-mkt-cells .cell.split .cell-head {
  width: 100%; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; gap: 3px;
  /* 라벨이 한 줄이든 두 줄이든 네 칸의 머리 높이를 같게 — 줄이 들쭉날쭉하지 않게 */
  min-height: 38px;
  padding: 5px 3px; border-bottom: 1px solid #e3e8f0;
}
.adp-mkt-cells .cell.split .cell-body {
  width: 100%; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  padding: 5px 3px;
}
.adp-mkt-cells .cell.split.calc .cell-head { border-bottom-color: #dcdfe5; }
.adp-dm-block .adp-mkt-cells.c4 .cell strong .num { min-width: 0; }
/* 자릿수 고정(min-width 56px)보다 뒤에 와야 이긴다 — 선택자를 한 단계 더 좁힌다 */
.adp-dm-block .adp-mkt-cells .cell strong.adp-dm-two span.num { min-width: 0; }

.adp-dm-block .adp-mkt-cells.c4 .cell strong em { min-width: 0; }
.adp-mkt-cells.c4 .adp-mkt-input { width: 100%; min-width: 0; }
/* 등급 뱃지 */
.adp-dm-grade {
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; line-height: 1;
  width: 22px; height: 22px; border-radius: 50%; padding: 0;
  font-size: 13px; font-weight: 800; color: #6b7280; background: #eef1f6;
}
/* 등급 옆 적합 여부 — 부적합만 빨갛게 */
.adp-dm-fit { margin-left: 3px; font-size: 12px; font-weight: 800; color: #1f7a45; white-space: nowrap; }
.adp-dm-fit.bad { color: #c22e2e; }
/* 종합등급 — ③ 제목줄 오른쪽, 아래 3·4번째 칸과 같은 자리에 선다
   (칸 폭 = (전체-12)/4, 두 칸 + 가운데 간격 = 50% - 2px) */
.adp-dm-arrow { color: #9ca3af; font-size: 15px; line-height: 1; }
/* 표를 지표결과와 같은 모양으로 — 머리줄만 색, 나머지는 흰색에 선만 */
.adp-table.adp-dm-tbl {
  border: 1px solid #e3e8f0; border-radius: 8px; overflow: hidden;
  border-collapse: separate; border-spacing: 0; background: #fff;
}
.adp-table.adp-dm-tbl th {
  background: #f3f6fb; border-bottom: 1px solid #e3e8f0; border-left: 1px solid #e3e8f0;
  font-size: 12px; font-weight: 700; color: #6b7280; padding: 6px 4px; text-align: center;
}
.adp-table.adp-dm-tbl td {
  background: #fff; border-left: 1px solid #e3e8f0; padding: 7px 4px; text-align: center;
}
.adp-table.adp-dm-tbl th:first-child,
.adp-table.adp-dm-tbl td:first-child { border-left: none; }
/* 사진 블록의 펼치기·접기 — 카드 머리의 화살표와 같은 모양 */
.adp-photo-fold { margin-left: auto; border: none; background: transparent; padding: 0 2px; cursor: pointer; display: inline-flex; }
.adp-photo-fold .adp-chev { width: 16px; height: 16px; }
/* 등급 동그라미 — 같은 칸의 'strong { width:auto }' 규칙에 눌려 타원이 되던 것을 못 박는다 */
.adp-dm-block .adp-mkt-cells .cell strong.adp-dm-grade {
  flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
  align-items: center; justify-content: center; text-align: center; line-height: 1;
}
/* 지표결과를 한 장의 표로 — 칸마다 상자를 두지 않고 선만 긋는다.
   첫 줄(이름)만 옅은 색을 깔아 머리줄로 읽히게 한다 */
.adp-mkt-cells.adp-dm-table {
  gap: 0; border: 1px solid #e3e8f0; border-radius: 8px; overflow: hidden; background: #fff;
}
.adp-mkt-cells.adp-dm-table .cell {
  background: transparent; border: none; border-left: 1px solid #e3e8f0; border-radius: 0;
}
.adp-mkt-cells.adp-dm-table .cell:first-child { border-left: none; }
/* 표 마지막 줄을 통으로 쓰는 칸 (저가매물 비고) */
.adp-mkt-cells .cell.adp-mkt-wide { grid-column: 1 / -1; border-left: none; }
.adp-mkt-cells.adp-dm-table .cell.adp-mkt-wide { border-top: 1px solid #e3e8f0; }
.adp-mkt-cells.adp-dm-table .cell.adp-mkt-wide > strong {
  color: #9ca3af; font-weight: 400; font-size: 11.5px; letter-spacing: -0.3px;
}
.adp-mkt-cells.adp-dm-table .cell.adp-mkt-wide > .adp-mkt-input { width: 100%; margin: 5px 6px; }
.adp-mkt-cells.adp-dm-table .cell .cell-head { background: #f3f6fb; }
/* 표의 둘째·셋째 줄은 흰색 — 색은 머리줄에만 */
.adp-mkt-cells.adp-dm-table .cell,
.adp-mkt-cells.adp-dm-table .cell .cell-body,
.adp-mkt-cells.adp-dm-table .cell .cell-grade { background: #fff; }
/* 머리칸이 따로 없는 칸(실거래가 조사 등) — small 을 머리줄로, strong 을 값줄로 */
.adp-mkt-cells.adp-dm-table .cell { padding: 0; gap: 0; }
.adp-mkt-cells.adp-dm-table .cell > small {
  width: 100%; box-sizing: border-box; padding: 6px 4px;
  background: #f3f6fb; border-bottom: 1px solid #e3e8f0;
}
.adp-mkt-cells.adp-dm-table .cell > strong,
.adp-mkt-cells.adp-dm-table .cell > span,
.adp-mkt-cells.adp-dm-table .cell > .adp-mkt-unit { padding: 7px 4px; }
.adp-mkt-cells.adp-dm-table .cell .cell-body { padding: 7px 3px; }
/* 면적은 ㎡ 와 평을 줄 나눠 적는다 */
.adp-mkt-cells .cell strong { white-space: pre-line; }
/* 칸 아래쪽 등급 줄 — 값 밑에 선을 긋고 등급·적합여부를 담는다 */
.adp-mkt-cells .cell.split .cell-grade {
  width: 100%; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  padding: 7px 3px; border-top: 1px solid #e3e8f0;
}
.adp-dm-total { margin-left: auto; }
.adp-dm-total .lab { font-size: 12px; font-weight: 800; color: #111827; }
/* ③ 제목줄 — 상자를 없애고 제목 옆에 바로 등급·적합여부를 붙인다 */
.adp-dm-total {
  display: flex; align-items: center; gap: 6px;
  background: transparent; border: none; padding: 0;
}
.adp-dm-total .lab {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 13px; font-weight: 800; color: #111827; flex: 0 0 auto;
}
/* 옛 상자 시절 규격(21×28)이 남아 동그라미를 찌그러뜨렸다 — 칸 안쪽 등급과 같은 정원으로 */
.adp-dm-total .adp-dm-grade { width: 22px; height: 22px; min-width: 0; border-radius: 50%; font-size: 13px; }
.adp-dm-total .adp-dm-fit { font-size: 12px; }
.adp-dm-grade.g-good { background: #fde2e2; color: #c22e2e; }   /* A */
.adp-dm-grade.g-ok2  { background: #cfdeff; color: #1d4ed8; }   /* B */
.adp-dm-grade.g-ok   { background: #e5e7eb; color: #111827; }   /* C */
.adp-dm-grade.g-warn { background: #e5e7eb; color: #111827; }

.adp-ind-suffix { display: inline-flex; align-items: center; gap: 2px; flex: 1 1 auto; min-width: 0; font-size: 11px; font-weight: 700; color: #4b5563; }
.adp-ind-suffix .adp-ind-input { flex: 1 1 auto; min-width: 0; }
/* 정보요약 — 항목명이 길어 라벨 칸을 조금 넓히고 한 줄로 고정한다 */
.adp-sum-rows .adp-base-row { grid-template-columns: 112px minmax(0, 1fr); }
.adp-sum-rows .adp-base-row dt { white-space: nowrap; font-size: 13px; }
/* 정보요약 — 기본정보와 같은 줄 모양을 쓰고 입력칸만 따로 둔다 */
.adp-sum-pair { display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px; }
/* 개별성 표의 여러 칸 입력줄 — inline-flex면 내용 폭만큼 커져 표 밖으로 넘친다.
   칸 폭에 맞춰 줄어들게 하고 뒤에 붙는 단위 글자가 잘리지 않게 한다 */
.adp-ind-ctl .adp-sum-pair {
  display: flex; flex: 1 1 0; width: 100%; min-width: 0;
  justify-content: flex-start; gap: 3px;
  font-size: 11px; font-weight: 700; color: #4b5563; white-space: nowrap;
}
.adp-ind-ctl .adp-sum-pair .adp-ind-input { flex: 1 1 0; min-width: 0; padding: 2px; font-size: 11.5px; }
.adp-ind-ctl .adp-sum-pair.units .adp-ind-input { max-width: 84px; }
.adp-sum-input {
  width: 74px; min-width: 0; height: 26px; border: 1px solid #e3e8f0; border-radius: 6px;
  padding: 0 6px; font-size: 11.5px; color: #111827; background: #fff; text-align: right;
}
.adp-sum-input.dept { max-width: 86px; }
/* 법원 전화번호 — 같은 줄 오른쪽 */
.adp-tel {
  margin-left: 6px; color: #2b6df3; font-weight: 700; text-decoration: none;
  display: inline-flex; align-items: center; gap: 3px; cursor: pointer;
}
.adp-sum-input.tel { max-width: 104px; }
/* 법원명 옆 담당계 */
.adp-sum-dept { margin-left: 5px; color: #4b5563; }
.adp-sum-input.wide { width: 120px; }
/* 정보요약에서 눈여겨볼 값 */
.adp-sum-hi { color: #2b6df3; font-weight: 800; }
.adp-sum-input:focus { outline: none; border-color: #2b6df3; }
/* 면적 단위 전환 — 편집 버튼과 같은 사각 형태·높이 */
.adp-mkt-unit-btn {
  margin-left: auto; box-sizing: border-box; height: 26px;
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  border: 1px solid #c7d7f7; background: #fff; color: #2b6df3;
  border-radius: 8px; padding: 0 9px; font-size: 11.5px; font-weight: 800;
  line-height: 1; white-space: nowrap; cursor: pointer;
}
.adp-mkt-unit-btn:active { background: #eaf1ff; }
.adp-mkt-ym { cursor: pointer; text-align: center; justify-content: center; }
.adp-mkt-ym:disabled { background: #fff; color: #111827; border-color: #e3e8f0; opacity: 1; cursor: default; }
.adp-mkt-unit { display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; font-size: 9.5px; font-weight: 700; color: #4b5563; }
.adp-mkt-unit .adp-mkt-input { flex: 1 1 auto; min-width: 0; }
.adp-mkt-cells .cell {
  display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0;
  background: #f7f9fc; border: 1px solid #eef1f6; border-radius: 8px; padding: 6px 4px;
}
.adp-mkt-cells .cell.calc { background: #f3f4f6; }
/* 거래일자 아래 층 입력 — 날짜 버튼과 폭을 맞춘다 */
.adp-mkt-cells .cell .adp-mkt-floor { width: 100%; }
/* 사용승인 / 거래기간 — 두 줄이라 글자를 줄이고 볼드를 뺀다 */
/* 공동주택가 머리글 옆 기준연도 — 칸이 좁아 줄이 넘어가지 않게 붙여 둔다 */
.adp-mkt-cells .cell small:has(.adp-pub-year),
.adp-mkt-cells .cell small.has-year { white-space: nowrap; letter-spacing: -0.4px; }
.adp-mkt-cells .cell small .adp-pub-year { font-style: normal; font-weight: 700; font-size: 0.92em; color: #2b6df3; }
/* 전용면적을 한 칸에 한 줄로 — 글자를 조금 줄이고 줄바꿈을 막는다 */
.adp-mkt-cells .cell strong.adp-mkt-area1 {
  font-size: 11.5px; white-space: nowrap; letter-spacing: -0.3px;
}
/* 저가매물 주소 — 빌라명이 길면 한 줄에 안 들어간다. 두 줄까지 내려 쓴다 */
.adp-mkt-cells .cell strong.adp-mkt-addr2 {
  white-space: normal; word-break: keep-all; overflow-wrap: anywhere;
  line-height: 1.25; text-align: center;
}
/* 매물 소진기간의 '/' — 앞뒤를 한 칸씩 띄운다 */
/* 매물 소진기간 — '91M / 7Y 7M'.
   숫자·단위는 붙이고, 슬래시 앞뒤와 '7Y' 다음에만 한 칸 띄운다 */
.adp-dm-block .adp-mkt-cells .cell strong .num.adp-dm-slash { min-width: 0; margin: 0 5px; }
.adp-dm-block .adp-mkt-cells .cell strong .num.adp-dm-gap { margin-left: 5px; }
.adp-dm-block .adp-mkt-cells .cell strong.adp-dm-clear .num { min-width: 0; }
.adp-dm-block .adp-mkt-cells .cell strong.adp-dm-clear em { min-width: 0; margin-left: 0; }
.adp-mkt-range2 {
  font-size: 12.6px; font-weight: 600; line-height: 1.35; color: #111827; text-align: center;
  white-space: pre-line; letter-spacing: -0.4px;
}
.adp-mkt-twoym { display: flex; gap: 3px; width: 100%; }
.adp-mkt-twoym .adp-mkt-ym { flex: 1 1 0; min-width: 0; font-size: 10px; }
.adp-mkt-cells .cell .adp-mkt-twoym + .adp-mkt-input { width: 100%; margin-top: 3px; font-size: 10.5px; }
/* 표로 묶인 줄에서는 계산 칸도 흰색 — 색은 머리줄에만 */
.adp-mkt-cells.adp-dm-table .cell.calc { background: #fff; }
/* 짚은 칸과 그 값을 만든 칸 — 칸을 통째로 묶어 보여 준다.
   색은 앱이 쓰는 붉은 계열(#e0574a)에 맞췄다.
   calc 칸과 머리글이 각자 바탕을 잡고 있어 선택자를 한 단계씩 좁혀야 이긴다 */
.adp-mkt-cells .cell.lit,
.adp-mkt-cells.adp-dm-table .cell.calc.lit { background: #fdecea; }
/* 머리줄·값줄이 각자 바탕을 잡고 있어 한 단계씩 좁혀 덮는다 */
.adp-mkt-cells.adp-dm-table .cell.lit > small,
.adp-mkt-cells.adp-dm-table .cell.lit .cell-head { background: #fbdcd8; }
.adp-mkt-cells.adp-dm-table .cell.lit .cell-body,
.adp-mkt-cells.adp-dm-table .cell.lit .cell-grade { background: #fdecea; }
/* 줄 수가 다른 칸이 섞여 있으면 값이 위로 붙는다 — 가로·세로 모두 가운데로 */
.adp-mkt-cells.center-y .cell > strong,
.adp-mkt-cells.center-y .cell > span { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; }
.adp-mkt-cells .cell small {
  font-size: 12px; color: #6b7280; font-weight: 700; text-align: center; line-height: 1.2;
  /* 두 줄이 될 때 글자 중간이 아니라 낱말 사이에서 끊기게 */
  word-break: keep-all; overflow-wrap: break-word;
}
.adp-mkt-cells .cell strong {
  font-size: 14px; font-weight: 800; color: #111827;
  /* 크기가 다른 글자(연·월·%·Y·M)가 숫자와 같은 밑줄에 서게 한다 */
  display: inline-flex; align-items: baseline; justify-content: center;
}
.adp-mkt-cells .cell strong.hi { color: #111827; }
/* 전세가율 옆 갭 — 줄이 내려가지 않게 작게 붙인다 */
.adp-mkt-gap-wrap { white-space: nowrap; }
.adp-mkt-gap { font-style: normal; font-size: 0.72em; font-weight: 700; color: #6b7280; letter-spacing: -0.4px; }
/* 손으로 적은 값은 파랗게 — 계산해 낸 값(검정)과 한눈에 가른다 */
.adp-mkt-cells .cell strong.typed { color: #2b6df3; }
.adp-mkt-cells .cell .adp-mkt-input { text-align: center; height: 26px; }
.adp-mkt-rate { display: inline-flex; align-items: center; justify-content: center; gap: 1px; }
.adp-mkt-rate-input {
  width: 34px; border: 1px solid #e3e8f0; border-radius: 5px; background: #fff;
  padding: 1px 3px; font-size: 10px; font-weight: 700; color: #374151; text-align: center;
}
.adp-mkt-rate-input:focus { outline: none; border-color: #2b6df3; }
.adp-mkt-table { width: 100%; border-collapse: collapse; }
/* 결론 표는 칸이 적어 스크롤 없이 화면 폭에 맞춘다 */
.adp-mkt-table.fit { min-width: 0; table-layout: fixed; }
.adp-mkt-table.fit th, .adp-mkt-table.fit td { padding: 6px 3px; font-size: 11px; }
.adp-mkt-table.fit .adp-mkt-input { min-width: 0; padding: 4px 3px; font-size: 11px; }
.adp-mkt-table th, .adp-mkt-table td {
  border: 1px solid #e5e7eb; padding: 6px 5px; font-size: 10.5px;
  color: #111827; text-align: center; vertical-align: middle; word-break: keep-all;
}
.adp-mkt-table thead th { background: #f3f4f6; font-weight: 700; line-height: 1.25; }
.adp-mkt-table th small { display: block; font-size: 9px; color: #6b7280; font-weight: 600; }
.adp-mkt-table th.rh { background: #f3f4f6; font-weight: 700; width: 92px; line-height: 1.25; }
.adp-mkt-table th.red, .adp-mkt-table td.red { color: #e0574a; font-weight: 800; }
.adp-mkt-table strong.red { color: #e0574a; font-weight: 800; }
.adp-mkt-table td.num { text-align: right; }
/* 결론표는 표이므로 값도 머리글처럼 가운데로 */
.adp-mkt-table.adp-conc-table td.num { text-align: center; }
/* 평당가와 가격은 자릿수를 눈으로 맞춰야 한다 — 끝자리를 오른쪽에 건다 */
.adp-mkt-table.adp-conc-table tbody tr:nth-child(2) td.num,
.adp-mkt-table.adp-conc-table tbody tr:nth-child(3) td.num { text-align: right; }
/* 면적은 한 줄로 — 칸이 좁으면 글자를 줄인다 */
/* 칸이 여섯이라 좁다 — 면적은 글자를 줄인다.
   조건분석 평균 칸만 범위라 두 줄이 되므로 '\n' 을 살린다 */
.adp-conc-table .adp-conc-area {
  font-size: 9.5px; letter-spacing: -0.6px;
  white-space: pre-line; line-height: 1.3;
}
/* 머리글의 줄바꿈(\n)을 그대로 살린다 */
.adp-mkt-table.adp-conc-table thead th { white-space: pre-line; font-size: 9.5px; letter-spacing: -0.4px; }
.adp-mkt-table.adp-conc-table td { padding: 6px 3px; }
.adp-mkt-table.adp-conc-table .adp-conc-unit { justify-content: center; }
.adp-mkt-table.adp-conc-table .adp-mkt-input { text-align: center; }
/* 비고만은 왼쪽에서 시작한다 — 위의 '가운데' 규칙에 끌려가 글이 한가운데
   떠 있었다. 숫자 칸과 달리 글을 적는 자리다 */
.adp-mkt-table.adp-conc-table .adp-conc-note,
.adp-mkt-table.adp-conc-table .adp-conc-note > .adp-mkt-input,
.adp-mkt-table.adp-conc-table .adp-conc-note > span { text-align: left; }
.adp-mkt-table.adp-conc-table .adp-conc-note { padding-left: 9px; }

/* 급매가 결론만 글자를 한 단 키운다 (약 30%).
   여기는 칸이 셋뿐이라 자리가 남고, 들여다보며 값을 정하는 표다.
   위의 시세 결론은 칸이 여섯이라 같이 키우면 숫자가 겹친다. */
.adp-conc-table.conc-urgent thead th { font-size: 12.5px; }
.adp-conc-table.conc-urgent th small { font-size: 12.5px; }
.adp-conc-table.conc-urgent .adp-conc-v { font-size: 13.5px; }
.adp-conc-table.conc-urgent .adp-conc-v small { font-size: 12.5px; }
.adp-conc-table.conc-urgent .adp-conc-area { font-size: 12.5px; }
.adp-conc-table.conc-urgent .adp-conc-unit { font-size: 13px; }
.adp-conc-table.conc-urgent .adp-mkt-input { font-size: 13.5px; }
.adp-conc-table.conc-urgent .adp-conc-note > span { font-size: 13.5px; }
.adp-mkt-table td.calc { background: #fafbfc; color: #6b7280; }
.adp-mkt-table td strong.hi { color: #2b6df3; font-weight: 800; }
.adp-mkt-input {
  width: 100%; min-width: 54px; border: 1px solid #e3e8f0; border-radius: 5px;
  padding: 4px 5px; font-size: 12.5px; text-align: right; color: #111827; background: #fff;
}
.adp-mkt-input:focus { outline: none; border-color: #2b6df3; }
.adp-mkt-stack { display: flex; flex-direction: column; gap: 1px; }
.adp-mkt-stack em { font-style: normal; }
/* 행 추가·삭제 — 한 묶음으로 붙여 둔다 */
.adp-mkt-step {
  display: inline-flex; align-items: center; gap: 2px; margin-left: auto;
  border: 1px solid #d5dbe6; border-radius: 999px; background: #fff; padding: 1px 4px 1px 7px;
}
.adp-mkt-step .lab { font-size: 11px; font-weight: 700; color: #6b7280; margin-right: 1px; }
.adp-mkt-step button {
  border: none; background: transparent; cursor: pointer;
  width: 20px; height: 20px; padding: 0; line-height: 1;
  font-size: 14px; font-weight: 800; color: #2b6df3;
}
.adp-mkt-step button:disabled { color: #d1d5db; cursor: default; }

.adp-mkt-addrow {
  flex: 0 0 auto; border: 1px solid #d5dbe6; background: #fff; color: #4b5563;
  border-radius: 6px; padding: 3px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
}
/* 부동산 정보 — 업체 1곳 = 두 줄 */
.adp-agency-list { display: flex; flex-direction: column; gap: 8px; }
.adp-agency-item { background: #f3f6fc; border: 1px solid #e0eaff; border-radius: 8px; padding: 8px 12px 10px; }
/* 상담표 — 파란 기운을 빼고 회색으로 */
.adp-agency-list.consult .adp-agency-item { background: #fafbfc; border-color: #e5e7eb; }
.adp-agency-list.consult .adp-agency-line + .adp-agency-line { border-top-color: #eef1f6; }
.adp-agency-line { display: flex; align-items: flex-end; gap: 6px; }
.adp-agency-line + .adp-agency-line { margin-top: 6px; padding-top: 6px; border-top: 1px solid #e3ecff; }
.adp-agency-fld { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1px; text-align: center; }
.adp-agency-fld small { font-size: 11.5px; color: #9ca3af; font-weight: 600; text-align: center; }
/* 상담표는 글자를 왼쪽에 건다 — 상호·연락처·금액이 같은 선에서 시작한다 */
.adp-agency-item .adp-agency-fld,
.adp-agency-item .adp-agency-fld > span { text-align: left; }
.adp-agency-fld > span {
  font-size: 13.5px; font-weight: 700; color: #111827; line-height: 26px; height: 26px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.adp-mkt-input.left { text-align: left; }
.adp-agency-item .adp-mkt-input { height: 26px; }
/* 본건사진 비고 */
.adp-photo-note { padding: 0 0 4px; }
/* 첨부 입력칸 바로 아래 오는 비고는 위 여백을 줄여 한 덩어리로 보이게 한다 */
.adp-plan-row + .adp-photo-note,
.adp-plan-preview + .adp-photo-note { margin-top: -6px; }
.adp-sub-head + .adp-photo-note { padding-top: 4px; }
/* 거래율·매물적체 칸과 좌우 폭을 맞추고 위 여백을 줄인다 */
.adp-deal-grid + .adp-photo-note { margin-top: -8px; padding: 0 12px 10px; }
.adp-photo-note .adp-fs-input { width: 100%; height: 34px; }
/* 손품+현장의 비고는 모두 빨갛게 — 숫자 사이에서 '내가 적어 둔 말'이 바로 집혀야 한다.
   색만으로 충분해서 굵게는 쓰지 않는다. 안내문구는 그대로 회색이다. */
.adp-photo-note .adp-fs-input { color: #e0574a; font-weight: 400; }
.adp-photo-note .adp-fs-input::placeholder { color: #9ca3af; font-weight: 400; }
.adp-mkt-cells.adp-dm-table .cell.adp-mkt-wide > .adp-mkt-input { color: #e0574a; font-weight: 400; }
.adp-mkt-cells.adp-dm-table .cell.adp-mkt-wide > .adp-mkt-input::placeholder { color: #9ca3af; font-weight: 400; }
.adp-mkt-cells.adp-dm-table .cell.adp-mkt-wide > strong.filled { color: #e0574a; font-weight: 400; }
.adp-conc-table .adp-conc-note > .adp-mkt-input { color: #e0574a; font-weight: 400; }
.adp-conc-table .adp-conc-note > .adp-mkt-input::placeholder { color: #9ca3af; font-weight: 400; }
.adp-conc-table .adp-conc-note > span.filled { color: #e0574a; font-weight: 400; }
/* 현장조사 항목 줄 */
.adp-fs-section { padding-top: 5px; margin-top: 5px; border-top: 1px solid #eef1f6; }
.adp-fs-title { font-size: 14px; font-weight: 800; color: #111827; margin-bottom: 6px; }
/* 매매수요 '1. 수요공급'과 같은 배치 — 단락 제목도, ①②③④ 항목도 왼쪽 2px에서 시작한다 */
.adp-survey-body .adp-agency-list { padding-left: 2px; padding-right: 2px; }
/* 항목 제목은 매매수요의 '① 동단위 거래회전율'과 같은 크기·간격 */
.adp-survey-body .adp-fs-title { font-size: 14px; font-weight: 800; color: #111827; margin-bottom: 2px; }
/* 급매가의 ①②③④ 블록처럼 네모로 묶는다 */
/* 현장조사는 단락이 많아 여백이 쌓이면 한 화면에 몇 줄 못 담는다.
   글자는 그대로 두고 테두리 안쪽과 단락 사이만 줄인다 */
.adp-survey-body .adp-fs-section {
  border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;
  padding: 5px 9px 5px; margin-top: 0;
}
/* 1·2번 줄 — 제목 · 설명 · 오른쪽 값(등수/체크)을 한 줄에 */
/* 제목·설명·값이 한 줄에 들어가도록 줄바꿈을 막는다 */
.adp-dm-head.tight { padding: 4px 2px 8px; flex-wrap: nowrap; }
.adp-dm-head.tight .adp-dm-memo { flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adp-fs-rank { margin-left: auto; font-size: 17px; font-weight: 800; color: #e0574a; line-height: 1.2; }
/* 두 줄의 설명 글자가 같은 자리에서 시작하도록 제목 칸 폭을 맞춘다 */
.adp-dm-head.tight .adp-dm-title { flex: 0 0 auto; white-space: nowrap; }
.adp-dm-memo { font-size: 11.5px; font-weight: 600; color: #9ca3af; }
.adp-dm-check { margin-left: auto; flex: 0 0 auto; }
.adp-fs-row {
  display: grid; grid-template-columns: 88px minmax(0, 1fr) auto;
  align-items: center; gap: 5px; padding: 2px 0;
}
/* 선택 버튼은 항상 맨 오른쪽 칸에 둬서 '건물/호실 개별성 확인'의 체크와 끝이 맞는다.
   옆칸 입력(연락처·금액)은 그 왼쪽으로 간다 */
/* 버튼이 3번 칸, 입력칸이 2번 칸인데 DOM 순서가 반대라 그대로 두면
   입력칸이 다음 줄로 밀린다. 둘 다 1행으로 못 박아 한 줄에 둔다 */
.adp-fs-row .ctl { grid-column: 3; grid-row: 1; }
.adp-fs-row .ext { grid-column: 2; grid-row: 1; }
.adp-fs-row .ctl.wide { grid-row: 1; }
.adp-fs-row .lbl { font-size: 13px; color: #6b7280; font-weight: 600; white-space: nowrap; }
/* 긴 이름은 두 줄로 내려 쓴다 — 한 줄로 두면 잘린다.
   pre-line 이라 이름에 넣어 둔 '\n' 자리에서 끊긴다 */
.adp-fs-row .lbl.long { white-space: pre-line; font-size: 12px; line-height: 1.25; word-break: keep-all; }

.adp-fs-row .ctl, .adp-fs-row .ext { min-width: 0; font-size: 13px; font-weight: 700; color: #111827; text-align: right; }
/* 옆칸이 없는 항목(기타·수리상태 등)은 남은 폭을 모두 쓴다 */
.adp-fs-row .ctl.wide { grid-column: 2 / -1; }
/* 옆칸에 붙는 비고 — 손품+현장의 다른 비고와 같은 규칙:
   적은 글씨만 빨갛고 안내문구는 회색 */
/* 글자 크기는 다른 칸(금액·연락처)과 같게 둔다 — 줄마다 들쭉날쭉해 보였다 */
.adp-fs-input.note { font-weight: 400; color: #e0574a; text-align: left; }
.adp-fs-input.note::placeholder { color: #9ca3af; font-weight: 400; }
.adp-fs-input {
  width: 100%; min-width: 0; height: 28px; border: 1px solid #e3e8f0; border-radius: 6px;
  padding: 0 6px; font-size: 12.5px; color: #111827; background: #fff;
}
.adp-fs-input:focus { outline: none; border-color: #2b6df3; }
/* 탐문·우편물 줄의 입력칸 글자는 모두 왼쪽 정렬로 통일 */
.adp-fs-row .adp-fs-input { text-align: left; padding-left: 8px; }
/* 빈칸 안내 글자는 '점유관계'의 '선택'과 같은 회색으로 */
.adp-survey-body input::placeholder,
.adp-survey-body textarea::placeholder { color: #9ca3af; opacity: 1; }
.adp-fs-unit { display: flex; align-items: center; justify-content: flex-end; gap: 3px; width: 100%; }
.adp-fs-unit .adp-fs-input { flex: 1 1 auto; min-width: 0; }
/* 선택 버튼은 줄바꿈 없이 한 줄에 둔다 */
/* 고르는 단추가 한 개인 줄(미납관리비)과 두 개인 줄(전기·수도·가스)이 섞여 있어
   옆 입력칸의 폭이 줄마다 달랐다 — 최소 폭을 맞춰 칸 끝을 나란히 세운다.
   셋인 줄(자전거상태·누수)은 이보다 넓어지므로 그대로 둔다 */
.adp-fs-toggles {
  display: flex; flex-wrap: nowrap; gap: 4px; justify-content: flex-end; min-width: 82px;
}
/* 'O'·'X'처럼 한 글자인 버튼이 납작해지지 않게 최소 크기를 준다 */
.adp-fs-toggles .adp-toggle-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 28px; height: 26px; padding: 0 9px; font-size: 10.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 고르는 비고 — 글칸과 같은 높이·글자로 맞춘다 */
.adp-fs-row .adp-fs-multi { width: 100%; }
.adp-fs-row .adp-fs-input.note.adp-agency-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 3px;
  height: 28px; cursor: pointer; text-align: left;
}
.adp-fs-row .adp-fs-input.note.adp-agency-trigger .txt {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.adp-fs-row .adp-fs-input.note.adp-agency-trigger .txt.ph { color: #9ca3af; }
.adp-fs-row .adp-fs-input.note.adp-agency-trigger .caret { flex: 0 0 auto; color: #9ca3af; font-size: 9px; }
/* 확인 체크 — 단추 자리에 들어가므로 높이를 맞춘다 */
.adp-fs-toggles .adp-fs-check {
  flex: 0 0 22px; width: 22px; height: 22px; margin: 2px 3px 2px 0;
  accent-color: #2b6df3; cursor: pointer;
}
/* 누구에게 들었나 — 한 줄에 단추가 넷이라 조금 작게 */
.adp-fs-toggles .adp-toggle-btn.who { padding: 0 6px; font-size: 10px; letter-spacing: -0.3px; }
/* 'O'·'X'처럼 한 글자인 단추는 정원으로 — 가로세로가 다르면 찌그러져 보인다.
   '교체'·'동대표'처럼 글자가 긴 단추는 알약 모양 그대로 둔다 */
.adp-fs-toggles .adp-toggle-btn.one {
  flex: 0 0 26px; width: 26px; min-width: 26px; height: 26px;
  padding: 0; border-radius: 50%;
}
.adp-fs-multi { flex: 1 1 auto; min-width: 0; }
.adp-fs-multi .adp-agency-trigger { height: 28px; }
.adp-agency-multi { position: relative; }
.adp-agency-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 3px;
  width: 100%; cursor: pointer; font-size: 11.5px;
}
.adp-agency-trigger .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-agency-trigger .txt.ph { color: #9ca3af; font-weight: 400; }
.adp-agency-trigger .caret { flex: 0 0 auto; color: #9ca3af; font-size: 9px; }
.adp-agency-backdrop { position: fixed; inset: 0; z-index: 30; }
.adp-agency-options {
  position: absolute; top: calc(100% + 3px); left: 0; right: 0; z-index: 31;
  margin: 0; padding: 4px; list-style: none; min-width: 92px;
  background: #fff; border: 1px solid #e3e8f0; border-radius: 8px; box-shadow: 0 6px 16px rgba(17, 24, 39, 0.12);
}
.adp-agency-option {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 6px 7px; border-radius: 6px; font-size: 11px; color: #374151; cursor: pointer;
}
.adp-agency-option.on { background: #eaf1ff; color: #2b6df3; font-weight: 700; }
.adp-agency-option .ck { font-size: 10px; }
.adp-agency-del {
  flex: 0 0 26px; align-self: flex-end; border: 1px solid #f0d4d0; background: #fdecea; color: #e0574a;
  border-radius: 6px; height: 26px; padding: 0; line-height: 24px; font-size: 14px; cursor: pointer;
}
.adp-demand-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px 14px; }
.adp-demand-btn {
  flex: 0 0 auto; border: 1px solid #d5dbe6; background: #fff; color: #6b7280;
  border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap;
}
.adp-demand-btn.yes { border-color: #2b6df3; background: #eaf1ff; color: #2b6df3; }
.adp-demand-btn.no { border-color: #e0574a; background: #fdecea; color: #e0574a; }
.adp-demand-note {
  flex: 1 1 auto; min-width: 0; border: 1px solid #e3e8f0; border-radius: 8px;
  padding: 7px 9px; font-size: 12px; color: #111827; background: #fff;
}
.adp-demand-note:focus { outline: none; border-color: #2b6df3; }
/* 좌우 여백은 매매수요·급매가 카드와 같게 0으로 두고, 안쪽 요소에서 2px만 준다 */
.adp-survey-body { padding: 4px 0 12px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #f1f5f9; }
/* 줄 사이 여백은 여기 한곳에서만 정한다 — 머리줄 margin 과 flex gap 이 겹쳐 쌓이지 않게 */
.adp-survey-body .adp-dm-head.tight { padding: 2px 2px 2px; }
.adp-survey-body .adp-dm-head.sec2 { margin-top: 2px; padding-top: 8px; padding-bottom: 4px; }
.adp-survey-body .adp-survey-row { padding: 5px 0; }
/* 현장조사 항목 줄(②탐문·③공과금·④수리상태) — 여기가 위의 .adp-fs-row 보다
   세서 실제로 쓰이는 값이다. 칸 높이 28 + 위아래 4 = 한 줄 36px */
.adp-survey-body .adp-fs-row { padding: 4px 0; }
.adp-survey-body .adp-survey-block { padding: 8px 10px; }
.adp-survey-body .adp-agency-item { padding: 6px 10px 8px; }
.adp-survey-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 9px; }
.adp-survey-block-head { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: #2b6df3; margin-bottom: 4px; }
.adp-survey-block-head .i { width: 16px; height: 16px; border-radius: 50%; background: #e0eaff; color: #2b6df3; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; }
.adp-survey-note { margin: 0; font-size: 12px; color: #6b7280; }
.adp-survey-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid #f1f5f9; }
.adp-survey-row.sub { padding: 4px 0; border-bottom-color: #f9fafb; }
.adp-survey-row .lbl { flex: 0 0 auto; font-size: 12px; color: #374151; font-weight: 600; min-width: 88px; }
.adp-survey-input {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; font-size: 12px;
  background: #fff; color: #111827; outline: none;
}
.adp-survey-input.flex { flex: 1 1 auto; }
.adp-survey-input.narrow { flex: 0 0 auto; max-width: 60px; text-align: center; }
/* 층수·세대/주차처럼 한 줄에 입력이 둘인 칸 */
.adp-survey-input.ind2.half { flex: 1 1 0; min-width: 0; max-width: 104px; }
.adp-survey-input:focus { border-color: #2b6df3; }
.adp-survey-area {
  width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 6px 9px; font-size: 12px; background: #fff; color: #111827; outline: none;
  font-family: inherit; resize: vertical;
}
.adp-survey-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #f3f4f6; font-size: 12px; font-weight: 700; color: #374151; }
.adp-survey-pill.orange { background: #fff7ed; color: #ea580c; }

.adp-multi-wrap { position: relative; flex: 1 1 auto; min-width: 0; }
.adp-multi-trigger {
  width: 100%; min-height: 36px; padding: 6px 28px 6px 8px;
  border: 1.5px solid #2b6df3; border-radius: 8px; background: #fff;
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  cursor: pointer; text-align: left; position: relative;
}
.adp-multi-placeholder { font-size: 12px; font-weight: 400; color: #9ca3af; }
/* 아직 고르지 않은 선택 상자의 '선택' 글자도 같은 회색으로 */
.adp-survey-body select.adp-fs-input.ph { color: #9ca3af; }
.adp-multi-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 999px; background: #f3f4f6;
  font-size: 11.5px; font-weight: 700; color: #374151;
}
.adp-multi-chip em { font-style: normal; color: #9ca3af; font-size: 12px; }
/* 현장조사의 기본 select를 '입찰자 현황조사서' 상자와 똑같이 맞춘다
   (크기·테두리·시작 위치·▾ 화살표) */
.adp-survey-body select.adp-fs-input {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2.5 4.5l3.5 3.5 3.5-3.5z' fill='%236b7280'/></svg>");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.adp-survey-row select.adp-fs-input {
  flex: 1 1 auto; min-width: 0;
  height: 36px; min-height: 36px;
  padding: 6px 28px 6px 8px;
  border: 1.5px solid #2b6df3; border-radius: 8px;
  font-size: 12px; color: #111827; background-color: #fff;
}
.adp-multi-caret {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-size: 14px; line-height: 1; color: #6b7280;
}
.adp-multi-view { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.adp-multi-panel {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px);
  z-index: 30;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  padding: 6px;
}
.adp-multi-list { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; }
.adp-multi-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  font-size: 13px; color: #111827;
}
.adp-multi-item:hover { background: #f3f4f6; }
.adp-multi-item.selected { background: #f9fafb; font-weight: 600; }
.adp-multi-check { color: #6b7280; font-size: 14px; }
.adp-multi-custom { display: flex; gap: 6px; padding: 6px 4px 4px; border-top: 1px solid #f1f5f9; margin-top: 4px; }
.adp-multi-custom-input {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px;
  font-size: 12px; outline: none;
}
.adp-multi-custom-input:focus { border-color: #2b6df3; }
.adp-multi-custom-btn {
  flex: 0 0 auto; border: none; background: #2b6df3; color: #fff;
  border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
}
.adp-survey-subblock { background: #f3f6fc; border: 1px solid #e0eaff; border-radius: 8px; padding: 10px 12px; }
.adp-subblock-head { font-size: 12.5px; color: #2b6df3; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.adp-arrears-total {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 999px;
  background: #fef2f2; color: #dc2626;
  font-size: 11px; font-weight: 800; letter-spacing: -0.2px;
}
.adp-arrears-total.none { background: #f3f4f6; color: #6b7280; }

.adp-toggle-group {
  display: inline-flex; gap: 6px; flex: 1 1 auto; min-width: 0; justify-content: flex-end;
}
.adp-toggle-btn {
  border: 1px solid #e5e7eb; background: #fff;
  border-radius: 999px; padding: 5px 12px;
  font-size: 12px; font-weight: 700; color: #374151; cursor: pointer;
  white-space: nowrap;
}
.adp-toggle-btn.active { background: #2b6df3; border-color: #2b6df3; color: #fff; }

.adp-loc-row1 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 8px; background: #f3f4f6; border-radius: 8px; }
.adp-loc-row1 .cell { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.adp-loc-row1 .cell small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adp-loc-row1 .cell strong { font-size: 12px; color: #111827; font-weight: 700; }
.adp-loc-row1 .cell .adp-survey-input { width: 100%; min-width: 0; padding: 6px 8px; font-size: 11.5px; }
.adp-loc-grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.adp-loc-grade .g-cell { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.adp-loc-grade .g-cell small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adp-loc-grade .g-cell strong { font-size: 18px; font-weight: 900; color: #111827; line-height: 1; }
.adp-loc-grade .g-cell strong em { font-size: 11px; font-style: normal; color: #6b7280; margin-left: 2px; }
.adp-info-banner { background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px; padding: 10px 12px; font-size: 11.5px; color: #1e40af; line-height: 1.5; }
.adp-info-banner strong { color: #2b6df3; }
.adp-loc-icon-row { display: flex; flex-direction: column; gap: 6px; }
.adp-loc-icon-row .ir { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; }
.adp-loc-icon-row .ir .ic { font-size: 14px; }
.adp-loc-icon-row .ir .lbl { color: #6b7280; min-width: 50px; }

.adp-deal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 12px 14px; }
.adp-deal-grid .cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; background: #eff6ff; border-radius: 8px;
  min-width: 0;
}
.adp-deal-grid .cell small { font-size: 12.5px; color: #6b7280; font-weight: 600; text-align: center; line-height: 1.2; }
.adp-deal-grid .cell strong { font-size: 15px; font-weight: 800; color: #111827; }
.adp-deal-grid .cell strong.hi-blue { color: #2b6df3; font-size: 16px; }
.adp-deal-grid .cell strong.hi-blue.low { color: #e0574a; }
.adp-deal-rate-row { display: flex; align-items: center; justify-content: center; gap: 4px; }
.adp-deal-judge { font-size: 11px; font-weight: 800; color: #2b6df3; white-space: nowrap; }
.adp-deal-judge.bad { color: #e0574a; }
.adp-deal-grid .cell .adp-survey-input {
  width: 100%; min-width: 0; padding: 5px 6px;
  font-size: 12px; text-align: center;
}

.adp-loc2-body { padding: 6px 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.adp-loc2-toprow {
  display: flex; align-items: flex-end; justify-content: space-between;
  border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;
}
.adp-loc2-target { display: flex; flex-direction: column; gap: 4px; flex: 1 1 auto; min-width: 0; }
.adp-loc2-target small { font-size: 11.5px; color: #6b7280; }
.adp-loc2-target strong { font-size: 16px; font-weight: 700; color: #111827; }
.adp-loc2-grade { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.adp-loc2-grade small { font-size: 11.5px; color: #6b7280; }
.adp-loc2-grade-pill {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 36px; padding: 3px 12px; border-radius: 999px;
  background: #fef3c7; color: #92400e; font-size: 13px; font-weight: 800;
}
.adp-loc2-input {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px;
  font-size: 13px; color: #111827; outline: none; background: #fff;
  width: 100%; min-width: 0;
}
.adp-loc2-input.grade { width: 80px; }
.adp-loc2-input:focus { border-color: #2b6df3; }

.adp-loc2-info-list { display: flex; flex-direction: column; gap: 8px; }
.adp-loc2-info {
  background: #f3f4f6; border-radius: 12px;
  padding: 10px 14px; display: flex; flex-direction: column; gap: 4px;
}
.adp-loc2-info-head { font-size: 13px; font-weight: 700; color: #111827; display: inline-flex; align-items: center; gap: 6px; }
.adp-loc2-info-icon { width: 18px; height: 18px; object-fit: contain; flex: 0 0 auto; filter: brightness(0) saturate(100%) invert(13%) sepia(8%) saturate(0%) hue-rotate(180deg) brightness(95%) contrast(95%); }
.adp-loc2-info-val { font-size: 12.5px; color: #6b7280; }
.adp-loc2-info-input {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px;
  font-size: 12.5px; outline: none; background: #fff; color: #111827;
}

.adp-loc2-num-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.adp-loc2-num { display: flex; flex-direction: column; gap: 4px; }
.adp-loc2-num small { font-size: 11.5px; color: #6b7280; }
.adp-loc2-num-row { display: inline-flex; align-items: center; gap: 4px; }
.adp-loc2-num-row .suf { font-size: 12px; color: #6b7280; flex: 0 0 auto; }

.adp-loc2-bar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.adp-loc2-bar-cell { display: flex; flex-direction: column; gap: 6px; }
.adp-loc2-bar-head { display: flex; align-items: baseline; justify-content: space-between; font-size: 12.5px; color: #6b7280; }
.adp-loc2-bar-head strong { font-size: 14px; font-weight: 800; }
.adp-loc2-bar-head strong.green { color: #16a34a; }
.adp-loc2-bar-head strong.red { color: #dc2626; }
.adp-loc2-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
.adp-loc2-bar-fill { display: block; height: 100%; border-radius: 999px; }
.adp-loc2-bar-fill.green { background: #16a34a; }
.adp-loc2-bar-fill.red { background: #dc2626; }
.adp-loc2-bar-foot { font-size: 11px; color: #9ca3af; }

.adp-loc2-price-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.adp-loc2-price-card {
  background: #f3f4f6; border-radius: 8px; padding: 10px 6px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.adp-loc2-price-card small { font-size: 11px; color: #6b7280; }
.adp-loc2-price-card strong { font-size: 14px; font-weight: 800; color: #111827; }
/* 실거래가 아래 거래일·건물명·층 */
.adp-trade-meta-view {
  font-size: 10.5px; color: #6b7280; line-height: 1.45; text-align: center;
  word-break: keep-all;
}
/* 실거래가 상세(거래일·건물명·층).
   .adp-trade-meta는 이미 다른 곳에서 쓰는 이름이라 별도 클래스를 쓴다.
   날짜는 네이티브 컨트롤이라 폭이 잘 늘지 않아 한 줄을 통째로 준다. */
.adp-rt-detail-grid {
  display: grid; grid-template-columns: 1fr 0.55fr; gap: 8px;
  margin-top: 8px;
}
.adp-trade-date { grid-column: 1 / -1; }
.adp-date-btn {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  text-align: left; cursor: pointer; font-family: inherit;
}
.adp-date-btn .ph { color: #9ca3af; }
.adp-date-caret { color: #6b7280; font-size: 15px; line-height: 1; }

.adp-ind2-body { padding: 4px 14px 14px; }
.adp-ind2-title {
  font-size: 14px; font-weight: 800; color: #2b6df3;
  padding: 8px 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 4px;
}
.adp-ind2-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 8px;
}
.adp-ind2-row:last-child { border-bottom: none; }
.adp-ind2-row > .lbl { flex: 0 0 auto; font-size: 13px; color: #374151; font-weight: 500; }
.adp-ind2-row > .ctl {
  display: inline-flex; align-items: center; gap: 6px;
  flex: 1 1 auto; min-width: 0; justify-content: flex-end; flex-wrap: wrap;
}
.adp-ind2-row > .ctl.chips { gap: 8px; }
.adp-ind2-row > .ctl > strong { font-size: 13px; font-weight: 700; color: #111827; }
.adp-ind2-row > .ctl > .suf { font-size: 12px; color: #6b7280; }
.adp-survey-input.ind2 {
  flex: 0 0 auto; width: 160px; min-width: 0;
}
.adp-survey-input.ind2-sm {
  flex: 0 0 auto; width: 120px; min-width: 0;
}
.adp-ind2-pill {
  border: 1px solid #e5e7eb; background: #f9fafb;
  border-radius: 999px; padding: 5px 12px;
  font-size: 11.5px; font-weight: 700; color: #6b7280; cursor: pointer;
  white-space: nowrap;
}
.adp-ind2-pill.active { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.adp-ind2-pill.done.active { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.adp-ind2-pill.done { background: #e5e7eb; color: #6b7280; }

.adp-dir-wrap { position: relative; display: inline-block; }
.adp-dir-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid #d1d5db; background: #fff;
  border-radius: 8px; padding: 6px 10px;
  font-size: 13px; color: #111827; cursor: pointer; min-width: 90px;
}
.adp-dir-value { flex: 1 1 auto; text-align: left; }
.adp-dir-value.placeholder { color: #9ca3af; }
.adp-dir-caret { font-size: 13px; line-height: 1; color: #6b7280; flex: 0 0 auto; }
.adp-dir-panel {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 30;
  list-style: none; margin: 0; padding: 4px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  min-width: 110px;
}
.adp-dir-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; cursor: pointer;
  font-size: 13px; color: #111827; border-radius: 6px;
}
.adp-dir-item:hover { background: #f3f4f6; }
.adp-dir-check {
  width: 18px; height: 18px; flex: 0 0 auto;
  border: 1.5px solid #d1d5db; border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #2b6df3; font-size: 12px; font-weight: 800;
}
.adp-dir-item.selected .adp-dir-check { background: #2b6df3; border-color: #2b6df3; color: #fff; }

.adp-ind-grid { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.adp-ind-section { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: stretch; }
.adp-ind-side {
  background: #f3f4f6; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #374151;
  text-align: center; line-height: 1.4;
}
.adp-ind-rows { display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
.adp-ind-rows .row { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
.adp-ind-rows .row:last-child { border-bottom: none; }
.adp-ind-rows .row .lbl { flex: 0 0 auto; font-size: 11.5px; color: #6b7280; min-width: 76px; }
.adp-ind-rows .row .suf { font-size: 11.5px; color: #6b7280; }
.adp-ind-rows .row strong { font-size: 12px; font-weight: 700; color: #111827; }

.adp-toggle { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.adp-toggle input { display: none; }
.adp-toggle .on { background: #e0eaff; color: #2b6df3; padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.adp-toggle .off { background: #f3f4f6; color: #6b7280; padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.adp-ind-btn {
  border: none; border-radius: 8px;
  padding: 6px 16px; font-size: 12px; font-weight: 700; color: #fff; cursor: pointer;
  background: #94a3b8;
}
.adp-ind-btn.on { background: #2b6df3; }
.adp-na { color: #9ca3af; font-size: 12px; }
.adp-admin-text { margin: 8px 4px; padding: 12px; font-size: 12px; color: #374151; line-height: 1.6; background: #f9fafb; border-radius: 8px; white-space: pre-line; }

.adp-agency-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.adp-agency-item { padding: 10px 4px; border-bottom: 1px solid #f1f5f9; }
.adp-agency-item:last-child { border-bottom: none; }
.adp-agency-name { margin: 0 0 4px; font-size: 13.5px; color: #111827; }
.adp-agency-name strong { font-weight: 800; }
.adp-agency-type { font-size: 12px; color: #6b7280; margin-left: 2px; font-weight: 600; }
.adp-agency-line { margin: 2px 0; font-size: 11.5px; color: #374151; line-height: 1.5; }
.adp-agency-zip { color: #6b7280; }
.adp-agency-phone { color: #2b6df3; text-decoration: none; font-weight: 700; }
.adp-agency-phone:active { color: #1e40af; }
.adp-agency-area { margin: 4px 0 0; font-size: 11px; color: #6b7280; line-height: 1.5; word-break: keep-all; }
.adp-table .b-blue { color: #2b6df3; font-weight: 700; }

.adp-table .c { text-align: center; }
.adp-cases-table { table-layout: fixed; }
.adp-cases-table th, .adp-cases-table td { font-size: 11px; padding: 8px 4px; vertical-align: middle; }
.adp-cases-table thead th { background: #f9fafb; font-weight: 700; line-height: 1.3; }
.adp-cases-table .pre { white-space: pre-line; line-height: 1.5; }
.adp-cases-table .pre span { display: block; }
.adp-cases-table .adp-line2 { margin-top: 2px; }

.adp-trade-filter-row {
  display: flex; align-items: center; gap: 8px;
  margin: 8px 0 6px;
}
.adp-trade-tabs { flex: 1 1 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.adp-trade-tab {
  border: none; border-radius: 6px;
  padding: 7px 6px; font-size: 12px; font-weight: 700; cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
/* 비활성 — 연한 배경 + 해당 색 글씨로 흐리게 */
.adp-trade-tab.t-all { background: #e4f4fd; color: #4bbbe8; }
.adp-trade-tab.t-buy { background: #e6ecfd; color: #6690f5; }
.adp-trade-tab.t-jeon { background: #e4f7ea; color: #4cc471; }
.adp-trade-tab.t-wol { background: #fdeee3; color: #f79351; }
/* 선택 — 진한 배경 + 흰 글씨 */
.adp-trade-tab.active { color: #fff; font-weight: 800; box-shadow: 0 1px 4px rgba(17, 24, 39, 0.22); }
.adp-trade-tab.t-all.active { background: #0284c7; }
.adp-trade-tab.t-buy.active { background: #1d4ed8; }
.adp-trade-tab.t-jeon.active { background: #15803d; }
.adp-trade-tab.t-wol.active { background: #c2410c; }
.adp-trade-refresh {
  flex: 0 0 auto; width: 38px; height: 32px;
  border: 1px solid #e5e7eb; background: #fff; border-radius: 6px;
  font-size: 16px; color: #2b6df3; cursor: pointer;
}

/* 단지 전체 조회 줄 — PDF 표와 섞이지 않게 위에 띄워 둔다 */
.adp-sp-bar {
  display: flex; align-items: center; gap: 6px;
  margin: 8px 0 6px; padding-top: 8px; border-top: 1px dashed #e3e8f0;
}
.adp-sp-lab { font-size: 12px; font-weight: 800; color: #111827; flex: 0 0 auto; }
.adp-sp-lab em { font-style: normal; font-size: 10.5px; font-weight: 400; color: #6b7280; margin-left: 3px; }
.adp-sp-lab i { font-style: normal; font-size: 10.5px; font-weight: 400; color: #9ca3af; margin-left: 2px; }
/* 건수는 '최근 2년' 바로 옆에 붙인다 — 오른쪽 끝에 떨어뜨리면 무엇의 수인지 멀어진다 */
.adp-sp-cnt { margin-left: 5px; font-size: 12px; font-weight: 800; color: #2b6df3; }
.adp-sp-fill { flex: 1 1 auto; }
/* 전세 거래가 아예 없는 단지 — 전세가율을 못 내니 찾아 헤매기 전에 알려 준다 */
.adp-sp-none { margin-left: 6px; font-size: 11px; font-weight: 700; color: #2b6df3; white-space: nowrap; }
.adp-sp-err { margin: 0 0 6px; font-size: 11px; color: #9a6400; }
.adp-sp-again {
  margin-left: 6px; border: 1px solid #c7d7f7; border-radius: 6px; background: #eef3fd;
  padding: 2px 8px; font-size: 10.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.adp-sp-direct { color: #c22e2e !important; }
/* 그 줄을 ② 경매물건 실거래가로 보낸다 — 구분(매매) 바로 옆,
   받는 쪽 제목에도 같은 초록 비행기를 달아 둘이 한 쌍임을 보인다 */
/* 구분 칸 맨 앞 — 매매든 전세든 같은 자리에서 누르게 하고, 글자는 오른쪽으로 민다 */
.adp-send-btn {
  border: none; background: transparent; padding: 0 4px 0 0; cursor: pointer;
  line-height: 0; vertical-align: -2px;
}
.adp-send-btn svg { fill: #16a34a; }
.adp-send-btn:active svg { fill: #0f7a33; }
.adp-send-mark { margin-left: 3px; padding: 0; line-height: 0; vertical-align: -2px; }
.adp-send-mark svg { fill: #16a34a; }
/* 층은 표 오른쪽 끝에 붙지 않게 안쪽으로 당겨 둔다 */
.adp-trade-table th.adp-trade-floor,
.adp-trade-table td.adp-trade-floor { text-align: center; padding-right: 0; }
.adp-trade-selects { display: flex; gap: 6px; margin-bottom: 4px; }
.adp-trade-selects .adp-select-sm { flex: 1 1 auto; padding: 6px 8px; }

.adp-trade-table { table-layout: fixed; }
.adp-trade-table th, .adp-trade-table td { font-size: 11.5px; padding: 8px 4px; }

.adp-trade-meta-row {
  /* 제목 · 전용면적 · 사용승인을 한 줄에 고르게 벌려 둔다 */
  display: flex; align-items: baseline; justify-content: space-between; gap: 6px;
  margin: 4px 0 8px; padding: 0 2px 8px;
  border-bottom: 1px solid #e5e7eb;
}
.adp-trade-meta {
  display: inline-flex; align-items: baseline; gap: 5px; min-width: 0;
  white-space: nowrap; overflow: hidden;
}
.adp-trade-meta small { font-size: 10px; color: #9ca3af; font-weight: 500; flex: 0 0 auto; }
.adp-trade-meta strong {
  font-size: 11px; font-weight: 800; color: #2b6df3; letter-spacing: -0.4px;
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
}

.adp-trade-summary {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  margin: 8px 0;
}
.adp-trade-summary.cols3 { grid-template-columns: repeat(3, 1fr); gap: 6px; }
.adp-trade-summary.cols3 .adp-trade-sum-card { padding: 9px 6px; }
.adp-trade-summary.cols3 .adp-trade-sum-card small { font-size: 11px; text-align: center; line-height: 1.3; }
.adp-trade-summary.cols3 .adp-trade-sum-card strong { font-size: 14.3px; }
.adp-trade-sum-card {
  background: #f3f6fc; border: 1px solid #e0eaff;
  border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px; align-items: center;
}
.adp-update-time { margin-left: auto; margin-right: 8px; font-size: 11px; color: #6b7280; }
.adp-sum-value { display: inline-flex; align-items: center; gap: 4px; }
.adp-trade-price { display: inline-flex; align-items: center; gap: 4px; }
.adp-copy-btn {
  border: none; background: transparent; color: #6b7280; padding: 2px; cursor: pointer;
  display: inline-flex; align-items: center; flex: 0 0 auto;
}
.adp-copy-btn:active { color: #2b6df3; }
/* td 에 직접 display:flex 를 주면 '표의 칸'이 아니게 돼 줄이 어긋난다 — 안쪽 div 에 준다 */
.adp-pub-addr-in { display: flex; align-items: center; gap: 3px; min-width: 0; }
.adp-pub-addr-in > span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-pub-addr-txt { cursor: pointer; }
.adp-pub-row { flex-wrap: nowrap; }
.adp-pub-cell.narrow { flex: 1 1 0; min-width: 0; }
.adp-pub-cell.narrow .adp-pub-input { min-width: 0; padding: 5px 2px; font-size: 10.5px; }
.adp-pub-date { cursor: pointer; text-align: center; font-weight: 400; }
.adp-pub-months { display: inline-flex; flex: 0 0 auto; gap: 3px; margin-left: 4px; align-self: flex-end; }
.adp-pub-month-btn {
  border: 1px solid #d5dbe6; background: #fff; color: #4b5563; white-space: nowrap;
  border-radius: 999px; padding: 4px 6px; font-size: 10px; font-weight: 700; cursor: pointer;
}
.adp-pub-month-btn.on { border-color: #2b6df3; background: #eaf1ff; color: #2b6df3; }
.adp-trade-meta-title { font-size: 11.5px; font-weight: 800; color: #111827; white-space: nowrap; }
.adp-trade-sum-card small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adp-trade-sum-card strong { font-size: 15px; font-weight: 800; color: #111827; }
.adp-sum-key { color: #2b6df3; font-weight: 800; }
/* 기간 선택 — 최소면적 입력 시작점부터 최대면적 끝까지 4등분 */
.adp-pub-cell.span2 { grid-column: 1 / -1; justify-content: flex-start; }
/* 라벨 폭을 최소면적과 똑같이 고정해야 버튼 시작점이 입력칸과 맞는다 */
.adp-pub-cell.span2 > span { flex: 0 0 50px; width: 50px; white-space: nowrap; font-size: 11px; }
.adp-pub-cell.span2 .adp-pub-months {
  margin-left: 0; align-self: center;
  flex: 1 1 auto; min-width: 0;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.adp-pub-cell.span2 .adp-pub-month-btn { padding: 6px 2px; text-align: center; }
/* 건축년도 — 두 드롭박스를 같은 폭으로 벌리고 물결을 그 사이 한가운데 둔다 */
.adp-pub-cell.span2.years .adp-pub-input { flex: 1 1 0; min-width: 0; }
.adp-pub-cell.span2.years > .adp-pub-tilde { flex: 0 0 auto; padding: 0; width: 20px; text-align: center; }
/* 검색이 주인공 — 초기화는 옆에 작게 붙인다 */
.adp-pub-row.actions { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; }
.adp-pub-reset.save { border-color: #c7d7f7; color: #2b6df3; }
.adp-pub-reset {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  box-sizing: border-box; padding: 0 11px;
  border: 1px solid #d7dce6; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #4b5563;
  white-space: nowrap; cursor: pointer;
}
.adp-pub-reset:active { background: #f3f4f6; }
/* 분포 내비게이터 — 평형·층·연식 분포를 보여 주고 누르면 그 구간으로 걸러 준다 */
.adp-nav-dist {
  margin: 8px 2px 2px; padding: 8px 8px 6px;
  background: #f7f9fc; border: 1px solid #eef1f6; border-radius: 8px;
  display: flex; flex-direction: column; gap: 5px;
}
.adp-nav-line { display: flex; align-items: center; gap: 3px; }
.adp-nav-key {
  flex: 0 0 24px; font-size: 10.5px; font-weight: 600; color: #374151; text-align: center;
}
/* 칸 생김새는 선정물건 상단 상태카드와 같은 규격을 쓴다 — 라벨 위, 숫자 아래 */
.adp-nav-chip {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  box-sizing: border-box; min-height: 38px; padding: 4px 2px;
  border: 1px solid #e8ebf1; border-radius: 8px; background: #fff;
  cursor: pointer; overflow: hidden;
}
/* 라벨 색·굵기는 조건식 패널의 '기간선택 / 시작일자' 라벨과 같은 값을 쓴다 */
.adp-nav-chip small {
  font-size: 9.5px; font-weight: 600; color: #374151;
  white-space: nowrap; line-height: 1;
}
.adp-nav-chip strong {
  font-size: 13px; font-weight: 800; color: #111827;
  white-space: nowrap; line-height: 1;
}
.adp-nav-chip strong em { font-style: normal; font-size: 9px; font-weight: 400; color: #6b7280; margin-left: 1px; }
/* 가장 많은 구간 — 박스는 다른 칸과 똑같이 두고 숫자 색으로만 표시한다.
   배경까지 칠하면 '선택된 칸'과 헷갈린다. */
.adp-nav-chip.top strong { color: #2b6df3; }
/* 지금 걸러 보는 구간 */
.adp-nav-chip.on { border-color: #2b6df3; background: #eaf1ff; box-shadow: 0 0 0 1.5px rgba(43, 109, 243, 0.2); }
.adp-nav-chip.on strong { color: #2b6df3; }

/* 건축연도 — 연도 아래에 연차를 작게 */
.adp-pub-year { line-height: 1.25; }
.adp-pub-year small { display: block; font-size: 9px; font-weight: 400; color: #2b6df3; }
/* 전용면적 칸 — 숫자 폭을 고정해 줄을 맞춘다 */
/* 전용면적 — 숫자 폭을 고정해 줄을 맞추고, 아래에 다세대/연립을 작게 */
.adp-area-cell { font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.25; }
.adp-area-cell small { display: block; font-size: 9px; font-weight: 400; color: #111827; }
.adp-pub-warn {
  margin: 6px 2px 0; padding: 7px 9px; border-radius: 8px;
  background: #fef2f2; border: 1px solid #fcdcdc;
  font-size: 11px; font-weight: 400; color: #b91c1c; line-height: 1.45;
}
/* 검색 버튼 — 돋보기+검색은 가운데, 안내는 그 아랫줄 가운데 */
/* '검색' 글자가 버튼 가운데에 오고 돋보기는 그 왼쪽에 매달린다 */
.adp-pub-search-main { position: relative; display: inline-block; line-height: 1.2; }
.adp-pub-search-main svg {
  position: absolute; right: calc(100% + 6px); top: 50%; transform: translateY(-50%);
}
.adp-pub-search-note {
  font-size: 9px; font-weight: 400; line-height: 1;
  color: rgba(255, 255, 255, 0.85); white-space: nowrap;
}
/* 결과 표 접기 줄 */
.adp-pub-result { margin: 12px 2px 8px; }
/* 좁은 화면에서는 제목이 한 줄을 다 쓰고 건수 칩들이 아랫줄로 내려간다 —
   한 줄에 욱여넣으면 '검색리스트'와 '정상거래'가 세로로 쪼개져 칩을 덮었다 */
.adp-pub-toggle-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.adp-pub-result-title {
  flex: 1 1 100%; min-width: 0; overflow: hidden;
  display: flex; flex-direction: column; gap: 2px;
}
.adp-pub-result-title > strong {
  font-size: 13px; font-weight: 800; color: #111827;
  display: flex; align-items: baseline; gap: 5px; min-width: 0; overflow: hidden;
  white-space: nowrap;
}
/* UPDATE 는 제목 줄의 오른쪽 끝 — 아래 계약해제 칸의 오른쪽 모서리와 맞는다 */
.adp-pub-update { flex: 0 1 auto; min-width: 0; margin-left: auto; padding-right: 2px; }
/* 표 안에서 찾기 — 선정물건리스트의 검색창과 같은 모양을 카드 폭에 맞춰 줄였다 */
.adp-pub-find {
  display: flex; align-items: center; gap: 6px;
  margin-top: 8px; padding: 0 9px;
  box-sizing: border-box; height: 30px;
  border: 1px solid #d5dbe6; border-radius: 8px; background: #fff;
}
.adp-pub-find-ico { width: 14px; height: 14px; flex: none; color: #9ca3af; }
.adp-pub-find-input {
  flex: 1 1 auto; min-width: 0;
  border: none; outline: none; background: transparent;
  font-size: 11.5px; font-weight: 400; color: #111827;
}
.adp-pub-find-input::placeholder { color: #aab2c0; }
/* 돋보기 검색칸의 기본 'x' 는 모양을 못 고쳐 지우고 우리 것을 쓴다 */
.adp-pub-find-input::-webkit-search-cancel-button { display: none; }
.adp-pub-find-count { flex: none; font-size: 10.5px; font-weight: 700; color: #2a5fbf; white-space: nowrap; }
.adp-pub-find-x {
  flex: none; width: 18px; height: 18px; padding: 0;
  border: none; border-radius: 50%; background: #eef1f6;
  font-size: 13px; line-height: 1; color: #6b7280; cursor: pointer;
}
/* 목록을 펼쳤을 때 표 위에 붙는 한 줄 안내 */
.adp-pub-list-note { margin: 0 2px 6px; font-size: 10.5px; font-weight: 400; color: #6b7280; }
/* 제외한 직거래 건수 — 실거래 박스와 같은 규격 */
.adp-pub-direct {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  flex: 1 1 auto; min-width: 0;
  box-sizing: border-box; height: 26px; padding: 0 10px;
  border: 1px solid #f0d2d2; border-radius: 8px; background: #fff;
  font-size: 11.5px; font-weight: 400; color: #b45309; line-height: 1; white-space: nowrap;
  cursor: pointer;
}
.adp-pub-direct strong { font-weight: 800; color: #b45309; }
.adp-pub-update { font-size: 9.5px; font-weight: 400; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 직거래 목록 */
.adp-pub-direct-list { margin-top: 8px; }
.adp-pub-direct-note { margin: 0 2px 6px; font-size: 10.5px; font-weight: 400; color: #b45309; }
.adp-pub-direct:disabled { opacity: 0.5; cursor: default; }
.adp-pub-toggle {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  flex: 1 1 auto; min-width: 0;
  box-sizing: border-box; height: 26px; padding: 0 10px;
  border: 1px solid #d5dbe6; border-radius: 8px; background: #f5f7fb;
  font-size: 11.5px; font-weight: 400; color: #4b5563; line-height: 1;
  white-space: nowrap; cursor: pointer;
}
.adp-pub-toggle strong { font-weight: 800; color: #111827; }
.adp-chev.sm { width: 15px; height: 15px; }
.adp-pub-search {
  border: none; border-radius: 8px; background: #1d4ed8; color: #fff;
  padding: 9px 10px; font-size: 14px; font-weight: 800; cursor: pointer;
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
}
.adp-pub-search:disabled { opacity: 0.6; }
.adp-pub-search:active { background: #1e40af; }

.adp-trade-head-meta {
  margin-left: auto; margin-right: 6px; min-width: 0;
  display: flex; flex-wrap: wrap; justify-content: flex-end;
  align-items: baseline; gap: 2px 7px;
  font-size: 10.5px; line-height: 1.35; text-align: right;
}
.adp-trade-head-meta.row {
  margin-left: 2px; margin-right: 0; justify-content: flex-start;
  text-align: left; font-size: 13.8px; padding: 3px 0 4px;
}
.adp-hm-pair { display: inline-flex; align-items: baseline; gap: 3px; white-space: nowrap; }
.adp-trade-head-meta small { color: #6b7280; font-weight: 400; }
.adp-trade-head-meta strong { color: #2b6df3; font-weight: 800; }
.adp-trade-type { font-weight: 500; }
/* 비행기가 붙는 줄과 안 붙는 줄(월세)의 글자가 같은 자리에 서게 — 빈 줄도 같은 폭을 비운다 */
.adp-send-gap { display: inline-block; width: 17px; padding-right: 4px; }
/* 머리줄 '구분'도 비행기 자리만큼 밀어 아래 매매·전세 글자와 한 줄로 세운다 */
.adp-trade-table th.adp-trade-kind { padding-left: 25px; }
.adp-trade-type.tt-buy { color: #2b6df3; }
.adp-trade-type.tt-jeon { color: #16a34a; }
.adp-trade-type.tt-wol { color: #ea580c; }

.adp-trade-view-tabs {
  display: flex; gap: 4px; margin: 6px 0 4px;
  border-bottom: 1px solid #e5e7eb;
}
.adp-trade-view-tab {
  flex: 1 1 auto; min-width: 0;
  border: none; background: transparent; cursor: pointer;
  padding: 8px 6px; font-size: 12px; font-weight: 700; color: #9ca3af;
  border-bottom: 2.5px solid transparent;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.adp-trade-view-tab.active { color: #111827; border-bottom-color: #111827; }
.adp-trade-view-tab .adp-tab-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: #22c55e; margin-right: 4px; vertical-align: middle;
}

.adp-pub-filter {
  background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px; margin: 6px 0 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.adp-pub-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center; }
.adp-pub-cell {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  font-size: 11.5px; color: #374151; font-weight: 600;
}
.adp-pub-cell.wide { grid-column: 1 / 2; }
.adp-pub-cell > span { flex: 0 0 auto; min-width: 50px; font-size: 11px; }
.adp-pub-input {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid #e5e7eb; border-radius: 999px;
  padding: 6px 10px; font-size: 12px; color: #111827;
  background: #fff; outline: none;
}
.adp-pub-input.small { flex: 0 0 auto; width: 84px; max-width: 84px; }
/* 면적 입력칸 옆 '평' — 칸 안에 붙여 둔다.
   '.adp-pub-cell > span' 보다 자세히 적어야 폭 규칙을 덮어쓸 수 있다 */
.adp-pub-cell > .adp-pub-unit {
  display: flex; align-items: center; gap: 3px;
  flex: 1 1 0; min-width: 0;
}
.adp-pub-unit .adp-pub-input { flex: 1 1 0; width: 100%; min-width: 0; }
.adp-pub-unit > em { flex: 0 0 auto; min-width: 0; font-style: normal; font-size: 11px; font-weight: 700; color: #6b7280; }
/* 최소/최대면적·건축년도 드롭다운 — 선택값을 칸 가운데에 */
select.adp-pub-input { text-align: center; text-align-last: center; }
select.adp-pub-input option { text-align: center; }
.adp-pub-cell.wide > .adp-pub-tilde { padding: 0 6px; }
.adp-pub-cell.wide { justify-content: flex-start; }
/* 시작일·종료일·기간 버튼은 한 줄에 */
.adp-pub-row.dates { display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; }
.adp-pub-row.dates .adp-pub-cell { flex: 1 1 0; min-width: 0; gap: 3px; }
.adp-pub-row.dates .adp-pub-cell > span { min-width: 0; font-size: 11px; }
.adp-pub-row.dates .adp-pub-input { min-width: 0; padding: 5px 2px; font-size: 10.5px; }
.adp-pub-input:focus { border-color: #2b6df3; }
.adp-pub-tilde { flex: 0 0 auto; padding: 0 4px; color: #6b7280; }
.adp-pub-reset {
  border: 1px solid #d1d5db; background: #fff;
  border-radius: 8px; padding: 6px 12px;
  font-size: 11.5px; font-weight: 700; color: #374151; cursor: pointer;
  white-space: nowrap;
}

.adp-pub-table-wrap { position: relative; }
/* 표를 접은 채 머리글 드롭다운을 열면 목록이 카드 밖으로 나가 잘려 보인다 — 열려 있는 동안만 자리를 만든다 */
.adp-pub-table-wrap.dd-open { min-height: 400px; }
.adp-pub-table { table-layout: fixed; }
.adp-pub-table th, .adp-pub-table td { font-size: 11px; padding: 8px 4px; vertical-align: middle; text-align: left; }
.adp-pub-table th { font-size: 10.5px; }
/* 머리글과 값은 칸마다 같은 들여쓰기를 쓴다 — 서로 다르면 줄이 어긋나 보인다 */
.adp-pub-table th:nth-child(4), .adp-pub-table td:nth-child(4) { padding-left: 9px; }
.adp-pub-table th:nth-child(5), .adp-pub-table td:nth-child(5) { padding-left: 3px; }
.adp-pub-table th:nth-child(6), .adp-pub-table td:nth-child(6) { padding-left: 12px; }
/* 머리글 글자만 자른다. th 를 자르면 드롭다운 목록까지 함께 잘려 안 보인다 */
.adp-pub-table th { overflow: visible; }
.adp-pub-th { max-width: 100%; min-width: 0; }
.adp-pub-th > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.adp-pub-th { position: relative; display: inline-flex; align-items: center; gap: 1px; white-space: nowrap; }
.adp-pub-th > span { white-space: nowrap; }
.adp-pub-th-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 8px; color: #9ca3af; padding: 1px 1px;
}
.adp-pub-th-btn.active { color: #2b6df3; }
.adp-pub-dd {
  position: absolute; top: 100%; left: 0;
  z-index: 50;
  list-style: none; margin: 4px 0 0; padding: 0;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  width: 100%; min-width: 200px; max-width: 90vw; max-height: 380px;
  overflow-y: auto;
}
/* For right-side columns, anchor the dropdown to the right edge so it stays inside the table */
.adp-pub-table th:nth-child(n+4) .adp-pub-dd { left: auto; right: 0; }
.adp-pub-dd-actions {
  position: sticky; top: 0;
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 6px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  z-index: 1;
}
.adp-pub-dd-actions button {
  flex: 1 1 auto;
  border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 6px;
  padding: 8px 6px; font-size: 12px; color: #374151; cursor: pointer;
  white-space: nowrap;
}
.adp-pub-dd-actions .adp-pub-dd-apply {
  background: #2b6df3; border-color: #2b6df3; color: #fff; font-weight: 700;
}
.adp-pub-dd-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; cursor: pointer;
  font-size: 11.5px; color: #111827;
}
.adp-pub-dd-item:hover { background: #f3f6fc; }
.adp-pub-dd-item input[type="checkbox"] { flex: 0 0 auto; }
.adp-pub-empty-row { text-align: center; color: #9ca3af; font-size: 12px; padding: 24px 8px; }
</style>
