<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import FormattedNumberInput from '../components/FormattedNumberInput.vue';
import DateWheelPicker from '../components/DateWheelPicker.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { pickCurrentRound } from '../utils/auctionSchedule';
import type { AgencyRow, AuctionDetail, MarketSurveyRow } from '../types/auction';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import alertIcon from '../assets/icones/triangle-alert.png';
import fileTextIcon from '../assets/icones/file-text.png';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { fetchRealTradeAverage, type RealTradeMatchRow } from '../services/publicDataApi';
import { useAuthStore } from '../stores/authStore';
import { deleteSitePhoto, isPhotoId, loadSitePhoto, saveSitePhoto } from '../services/sitePhotoRepository';
import { fetchNearbyEnvironment, type NearbyEnvironment, type NearbyPlace } from '../services/kakaoNearby';
import { geocodeAddress } from '../services/routeOptimizer';

const props = defineProps<{
  mode?: 'create' | 'view' | 'edit';
  id?: string;
}>();

const router = useRouter();
const store = useAuctionStore();
const authStore = useAuthStore();

type TabKey = 'basic' | 'rights' | 'profit' | 'verify' | 'survey';
const activeTab = ref<TabKey>('basic');
// 입지정보 카드 — 전체 / 500m 이내
const areaView = ref<'all' | 'near'>('all');
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'basic', label: '물건정보' },
  { key: 'rights', label: '권리분석' },
  { key: 'survey', label: '손품+\u200B현장' },
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
  return m?.[1] ?? raw.split(/[·,/]/)[0].trim();
});
const jibunAddress = computed(() => auction.value?.address || '');
const fullAddress = computed(() => auction.value?.address || auction.value?.roadAddress || '');
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
const registryRows = computed(() => (auction.value?.registryRows ?? []).map((r) => ({
  ...r,
  desc: formatRegistryDesc(r.desc),
})));
const stripWarnMarkers = (text: string) =>
  text.replace(/^[\s*▶⚠!！·•]+/gm, '').trim();
const registryWarning = computed(() => stripWarnMarkers(auction.value?.registryWarnings || ''));
const tenantOtherNotes = computed(() => stripWarnMarkers(auction.value?.tenantOtherNotes || ''));
const tenantNotesOpen = ref(false);
const registryClaimAmount = computed(() => auction.value?.rights?.totalClaimAmount ?? 0);

const relatedCases = computed(() => auction.value?.relatedCaseRows ?? []);

const tenantBaseDate = computed(() => auction.value?.cancellationBaseDate || '-');
const tenantDistDate = computed(() => auction.value?.distributionRequestDate || '-');
const tenantSmallDate = computed(() => auction.value?.smallAmountBaseDate || '-');

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
const clampScale = (n: number) => Math.min(LB_MAX, Math.max(1, n));
const resetLightboxZoom = () => { lbScale.value = 1; lbX.value = 0; lbY.value = 0; };
const snapBackIfUnzoomed = () => { if (lbScale.value <= 1) { lbX.value = 0; lbY.value = 0; } };
const openLightbox = (url: string) => { lightboxUrl.value = url; resetLightboxZoom(); };
const closeLightbox = () => { lightboxUrl.value = ''; resetLightboxZoom(); };
const lbDown = (e: PointerEvent) => {
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
    return;
  }
  if (lbPanStart && lbScale.value > 1) {
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

const tradeView = ref<'pdf' | 'public'>('pdf');
const tradeFilter = ref<'all' | '매매' | '전세' | '월세'>('all');
const tradeAreaFilter = ref('');
const tradeYearFilter = ref('');

// PDF 단지 자체 실거래가
const tradeAreaOptions = computed(() => {
  const set = new Set<string>();
  realTradeRows.value.forEach((r) => { if (r.area) set.add(r.area.split('(')[0].trim()); });
  return [...set];
});
const tradeYearOptions = computed(() => {
  const set = new Set<string>();
  realTradeRows.value.forEach((r) => {
    const y = r.contractDate?.match(/^(\d{2,4})/)?.[1];
    if (y) set.add(y.length === 4 ? y.slice(2) : y);
  });
  return [...set].sort().reverse();
});
const filteredPdfTradeRows = computed(() => realTradeRows.value.filter((r) => {
  if (tradeFilter.value !== 'all' && r.type !== tradeFilter.value) return false;
  if (tradeAreaFilter.value && !r.area?.startsWith(tradeAreaFilter.value)) return false;
  if (tradeYearFilter.value) {
    const y = r.contractDate?.match(/^(\d{2,4})/)?.[1] ?? '';
    const yShort = y.length === 4 ? y.slice(2) : y;
    if (yShort !== tradeYearFilter.value) return false;
  }
  return true;
}));

const parsePriceNumber = (s: string | undefined | null) => {
  if (!s) return NaN;
  const n = Number(String(s).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const pdfTradeAvg = computed(() => {
  const nums = filteredPdfTradeRows.value
    .filter((r) => r.type !== '월세')
    .map((r) => parsePriceNumber(r.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return NaN;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
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

// 옵션 목록 (드롭다운용)
const publicAreaUniqueValues = computed(() => {
  const set = new Set<number>();
  publicRealTradeRows.value.forEach((r) => { if (r.areaM2 > 0) set.add(r.areaM2); });
  return [...set].sort((a, b) => a - b);
});
const publicBuildYearUniqueValues = computed(() => {
  const set = new Set<number>();
  publicRealTradeRows.value.forEach((r) => { if (r.buildYear) set.add(r.buildYear); });
  return [...set].sort((a, b) => a - b);
});

// 컬럼별 체크박스 필터
type PubCol = 'contractDate' | 'price' | 'areaM2' | 'buildYear' | 'floor' | 'address';
const PUB_COLS: PubCol[] = ['contractDate', 'price', 'areaM2', 'buildYear', 'floor', 'address'];
const PUB_COL_LABELS: Record<PubCol, string> = {
  contractDate: '계약일',
  price: '거래금액',
  areaM2: '전용면적',
  buildYear: '건축연도',
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
  PUB_COLS.forEach((col) => {
    const set = new Set<string>();
    publicRealTradeRows.value.forEach((r) => set.add(rowValue(r, col)));
    result[col] = [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  });
  return result;
});
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
    set = new Set(all);
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

const filteredPublicTradeRows = computed(() => publicRealTradeRows.value.filter((r) => {
  const d = parseContractToDate(r.contractDate);
  if (publicStartDate.value && d) {
    const start = new Date(publicStartDate.value);
    if (d < start) return false;
  }
  if (publicEndDate.value && d) {
    const end = new Date(publicEndDate.value);
    if (d > end) return false;
  }
  const minA = parseFloat(publicMinArea.value);
  const maxA = parseFloat(publicMaxArea.value);
  if (Number.isFinite(minA) && minA > 0 && r.areaM2 < minA) return false;
  if (Number.isFinite(maxA) && maxA > 0 && r.areaM2 > maxA) return false;
  const minY = parseInt(publicMinBuildYear.value, 10);
  const maxY = parseInt(publicMaxBuildYear.value, 10);
  if (Number.isFinite(minY) && minY > 0 && (r.buildYear ?? 0) < minY) return false;
  if (Number.isFinite(maxY) && maxY > 0 && (r.buildYear ?? 9999) > maxY) return false;
  return PUB_COLS.every((col) => {
    const sel = publicColFilters.value[col];
    if (sel.size === 0) return true;
    return sel.has(rowValue(r, col));
  });
}));

const resetPublicFilters = () => {
  populatePublicRangeDefaults();
  PUB_COLS.forEach((col) => {
    publicColFilters.value[col].clear();
  });
  publicColFilters.value = { ...publicColFilters.value };
};

// 데이터 로드 후 자동 범위 채우기
const populatePublicRangeDefaults = () => {
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
  const dates = rows.map((r) => parseContractToDate(r.contractDate)).filter((d): d is Date => !!d).map((d) => d.getTime()).sort((a, b) => a - b);
  if (dates.length > 0) {
    const fmt = (t: number) => {
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    publicStartDate.value = fmt(dates[0]);
    publicEndDate.value = fmt(dates[dates.length - 1]);
  }
  const areas = publicAreaUniqueValues.value;
  if (areas.length > 0) {
    publicMinArea.value = String(areas[0]);
    publicMaxArea.value = String(areas[areas.length - 1]);
  }
  const years = publicBuildYearUniqueValues.value;
  if (years.length > 0) {
    publicMinBuildYear.value = String(years[0]);
    publicMaxBuildYear.value = String(years[years.length - 1]);
  }
};
const publicTradeAvg = computed(() => {
  const nums = filteredPublicTradeRows.value.map((r) => r.price).filter((n) => n > 0);
  if (nums.length === 0) return NaN;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
});

// 해당물건 정보의 전용면적 — '38.28㎡ / 11.58평'
const tradeMetaArea = computed(() => {
  const m2 = Number(auction.value?.buildingAreaM2) || 0;
  if (m2 <= 0) return '-';
  return `${m2}㎡ / ${(m2 / 3.305785).toFixed(2)}평`;
});

const formatWonSimple = (n: number) =>
  Number.isFinite(n) && n > 0 ? n.toLocaleString('ko-KR') : '-';

const fetchPublicTradeRows = async () => {
  if (!auction.value || fetchingPublicTrade.value) return;
  fetchingPublicTrade.value = true;
  try {
    const region = await resolveRegionFromAddress(auction.value.address);
    if (!region) return;
    publicRealTradeSigungu.value = region.sigungu ?? '';
    publicRealTradeDong.value = region.dong ?? '';
    const result = await fetchRealTradeAverage({
      lawdCd5: region.lawdCd5,
      dong: region.dong,
      areaM2: auction.value.buildingAreaM2 || undefined,
      propertyType: 'all',
      months: 6,
    });
    if (Number.isFinite(result.average)) {
      publicRealTradeRows.value = result.matchedRows ?? [];
      publicRealTradeDong.value = result.dongLabel ?? region.dong ?? '';
      populatePublicRangeDefaults();
      stampPublicTradeUpdate();
    }
  } catch {
    // ignore
  } finally {
    fetchingPublicTrade.value = false;
  }
};

// 값 복사 (앱에서는 Capacitor 클립보드)
const copiedMsg = ref('');
const copyText = async (text: string) => {
  const value = String(text ?? '').trim();
  if (!value) return;
  try {
    if (Capacitor.isNativePlatform()) await Clipboard.write({ string: value });
    else await navigator.clipboard.writeText(value);
    copiedMsg.value = '복사했습니다.';
    setTimeout(() => { copiedMsg.value = ''; }, 1500);
  } catch {
    copiedMsg.value = '복사에 실패했습니다.';
    setTimeout(() => { copiedMsg.value = ''; }, 1500);
  }
};

// 기간 필터 — 3/6/12개월 버튼과 휠 달력
const pubMonthPreset = ref(0);
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

// 국토부 실거래가 — 마지막으로 불러오거나 검색 조건을 바꾼 시각
const publicTradeUpdatedAt = ref('');
const stampPublicTradeUpdate = () => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  publicTradeUpdatedAt.value =
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
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
    void fetchPublicTradeRows();
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
const myBid = computed(() => auction.value?.metrics.myBidValue ?? auction.value?.metrics.minimumBidValue ?? 0);
// 입찰가 비중 — 감정가 대비 내 입찰가
const myBidPct = computed(() => apprValue.value > 0 ? (myBid.value / apprValue.value) * 100 : 0);

const bc = computed(() => auction.value?.bidCost);

// 필요비용 합계: 대출 제외, 취득세/법무비/이자/중도상환/매도중개료/미납관리비/수리비/명도비 합산
const totalCosts = computed(() => {
  const c = bc.value;
  if (!c) return 0;
  return (c.acquisitionTaxAmount ?? 0)
    + (c.legalCostAmount ?? 0)
    + (c.interestAmount ?? 0)
    + (c.midRepaymentAmount ?? 0)
    + (c.brokerageAmount ?? 0)
    + (c.arrearsFee ?? 0)
    + (c.repairCost ?? 0)
    + (c.evictionCost ?? 0);
});
const expectedSale = computed(() => auction.value?.expectedSaleValue ?? 0);
const capitalGain = computed(() => expectedSale.value - myBid.value - totalCosts.value);
const localTaxRate = computed(() => bc.value?.localTaxRate ?? 10);
// 종합소득세 누진세율 (양도차익 L 기준)
const transferTaxAuto = computed(() => {
  const L = capitalGain.value;
  if (L <= 0) return 0;
  if (L <= 14_000_000) return L * 0.06;
  if (L <= 50_000_000) return L * 0.15 - 1_260_000;
  if (L <= 88_000_000) return L * 0.24 - 5_760_000;
  if (L <= 150_000_000) return L * 0.35 - 15_440_000;
  if (L <= 300_000_000) return L * 0.38 - 19_940_000;
  if (L <= 500_000_000) return L * 0.4 - 25_940_000;
  if (L <= 1_000_000_000) return L * 0.42 - 35_940_000;
  return L * 0.45 - 65_940_000;
});
// 직접 넣은 금액이 있으면 그것을, 없으면 자동 계산값을 쓴다
const transferTax = computed(() => bc.value?.incomeTaxAmount ?? transferTaxAuto.value);
const localTaxAuto = computed(() => transferTax.value * (localTaxRate.value / 100));
const localTax = computed(() => bc.value?.localTaxAmount ?? localTaxAuto.value);
// 자동 계산값과 같은 값이 들어오면 '직접 입력'으로 보지 않는다.
// (입력칸이 포맷을 맞추며 같은 값을 다시 써 넣어도 자동 계산이 멈추지 않도록)
const incomeTaxInput = computed({
  get: () => Math.round(transferTax.value),
  set: (value: number | string) => {
    const c = auction.value?.bidCost;
    if (!c) return;
    const n = Number(value) || 0;
    c.incomeTaxAmount = Math.abs(n - Math.round(transferTaxAuto.value)) < 1 ? undefined : n;
  },
});
const localTaxInput = computed({
  get: () => Math.round(localTax.value),
  set: (value: number | string) => {
    const c = auction.value?.bidCost;
    if (!c) return;
    const n = Number(value) || 0;
    c.localTaxAmount = Math.abs(n - Math.round(localTaxAuto.value)) < 1 ? undefined : n;
  },
});
// 지방세율을 고치면 직접 입력해 둔 금액은 풀고 다시 자동 계산으로 돌린다
const setLocalTaxRate = (raw: string) => {
  const c = auction.value?.bidCost;
  if (!c) return;
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  c.localTaxRate = pct;
  c.localTaxAmount = undefined;
};
// %는 소수점 둘째 자리까지만 받는다
const limitPct = (e: Event) => {
  const el = e.target as HTMLInputElement;
  const cleaned = el.value.replace(/[^\d.-]/g, '').replace(/(\..*)\./g, '$1');
  const m = cleaned.match(/^-?\d*(?:\.\d{0,2})?/);
  const next = m ? m[0] : '';
  if (el.value !== next) el.value = next;
};
const afterTaxProfit = computed(() => capitalGain.value - transferTax.value - localTax.value);
const advertisingCost = computed(() => bc.value?.advertisingCost ?? 0);
const netAfterTaxProfit = computed(() => afterTaxProfit.value - advertisingCost.value);
const netInvestment = computed(() => myBid.value - (bc.value?.loanAmount ?? 0) + totalCosts.value);
const totalInvest = computed(() => myBid.value + totalCosts.value);
const afterTaxRate = computed(() => netInvestment.value > 0 ? (netAfterTaxProfit.value / netInvestment.value) * 100 : 0);
const pctOfBid = (n: number | undefined | null) => myBid.value > 0 && n ? (n / myBid.value) * 100 : 0;

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

const setAmountByPct = (key: BidCostAmountKey, raw: string | number) => {
  if (!auction.value?.bidCost) return;
  const pct = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  auction.value.bidCost[key] = Math.round((myBid.value * pct) / 100);
};

const setBidByApprPct = (raw: string | number) => {
  if (!auction.value?.metrics) return;
  const pct = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  auction.value.metrics.myBidValue = Math.round((apprValue.value * pct) / 100);
};

// 취득세 — 기본 1.10%. 입찰가가 바뀌면 이 비율로 다시 계산하고,
// 금액이나 %를 직접 고치면 그 값이 비율로 저장돼 다음 계산에 쓰인다.
const ACQ_TAX_DEFAULT_RATE = 1.1;
watch(
  [() => auction.value?.id, myBid],
  () => {
    const c = auction.value?.bidCost;
    if (!c) return;
    if (!c.acquisitionTaxRate || c.acquisitionTaxRate <= 0) c.acquisitionTaxRate = ACQ_TAX_DEFAULT_RATE;
    const expected = Math.round((myBid.value * c.acquisitionTaxRate) / 100);
    if (c.acquisitionTaxAmount !== expected) c.acquisitionTaxAmount = expected;
  },
  { immediate: true },
);
watch(
  () => auction.value?.bidCost?.acquisitionTaxAmount,
  (amount) => {
    const c = auction.value?.bidCost;
    if (!c || !amount || myBid.value <= 0) return;
    const rate = Number((((amount as number) / myBid.value) * 100).toFixed(2));
    if (Math.abs(rate - (c.acquisitionTaxRate ?? 0)) > 0.005) c.acquisitionTaxRate = rate;
  },
);

const loanAmt = computed(() => auction.value?.bidCost?.loanAmount ?? 0);

// 중도상환: amount = loan × pct/100
// 기준 금액(대출금·매가)이 아직 0이면 %만 입력해도 금액이 0이라 값이 사라진 것처럼 보인다.
// 그래서 입력한 %는 비율 필드에 남겨 두고, 기준 금액이 생기면 그때 금액을 채운다.
type RateRow = {
  amountKey: BidCostAmountKey;
  rateKey: 'midRepaymentRate' | 'interestRate3m' | 'brokerageRate';
  base: () => number;
  /** 연이율의 3개월분처럼 나눠 쓰는 경우 */
  divisor?: number;
};
const RATE_ROWS: RateRow[] = [
  { amountKey: 'midRepaymentAmount', rateKey: 'midRepaymentRate', base: () => loanAmt.value },
  { amountKey: 'interestAmount', rateKey: 'interestRate3m', base: () => loanAmt.value, divisor: 4 },
  { amountKey: 'brokerageAmount', rateKey: 'brokerageRate', base: () => expectedSale.value },
];
// 화면에 보여 줄 % — 기준 금액이 있으면 금액에서, 없으면 저장해 둔 비율에서
const rowPct = (row: RateRow) => {
  const c = bc.value;
  if (!c) return 0;
  const base = row.base();
  const amount = c[row.amountKey] ?? 0;
  if (base > 0 && amount) return ((amount * (row.divisor ?? 1)) / base) * 100;
  return c[row.rateKey] ?? 0;
};
const setRowPct = (row: RateRow, raw: string) => {
  const c = auction.value?.bidCost;
  if (!c) return;
  const pct = parseFloat(raw);
  if (!Number.isFinite(pct)) return;
  c[row.rateKey] = pct;
  c[row.amountKey] = Math.round((row.base() * pct) / 100 / (row.divisor ?? 1));
};
// 금액을 직접 고치면 비율도 같이 맞춰 둔다
const syncRowRate = (row: RateRow) => {
  const c = auction.value?.bidCost;
  if (!c) return;
  const base = row.base();
  if (base <= 0) return;
  const rate = Number(((((c[row.amountKey] ?? 0) * (row.divisor ?? 1)) / base) * 100).toFixed(2));
  if (Math.abs(rate - (c[row.rateKey] ?? 0)) > 0.005) c[row.rateKey] = rate;
};
watch(
  [loanAmt, expectedSale],
  () => {
    const c = auction.value?.bidCost;
    if (!c) return;
    RATE_ROWS.forEach((row) => {
      const rate = c[row.rateKey] ?? 0;
      if (rate <= 0) return;
      const expected = Math.round((row.base() * rate) / 100 / (row.divisor ?? 1));
      if (c[row.amountKey] !== expected) c[row.amountKey] = expected;
    });
  },
);

const startEditProfit = () => {
  editingProfit.value = true;
};
const saveProfit = async () => {
  if (!auction.value) return;
  await store.saveAuction(auction.value);
  editingProfit.value = false;
};

const collapsed = ref<Record<string, boolean>>({});
const toggleSection = (key: string) => { collapsed.value[key] = !collapsed.value[key]; };
// 상세 화면의 모든 카드 키 — 전체 접기/펼치기에 쓴다
const ALL_SECTION_KEYS = [
  'summary', 'base', 'tenant', 'bld', 'status', 'registry', 'cases', 'cases2', 'apt', 'arrears',
  'areaInfo', 'photo', 'photos', 'rightsPhotos', 'rightsCheck',
  'realUser', 'areaSurvey', 'survInd', 'survPrice', 'survField', 'trades', 'checklist',
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
  agencyRows: [] as AgencyRow[],
  mktConcAvg: '', mktConcLow: '', mktConcPyeong: '', mktJeonseReset: false,
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
    title: '구역내 개별성',
    items: [
      { id: 'ind.age', label: '년식', yearMonth: true, rate: '-15%' },
      { id: 'ind.units', label: '해당면적세대', custom: 'units', rate: '10%' },
      { id: 'ind.parking', label: '주차수', text: true, half: true, rate: '5%' },
      { id: 'ind.far', label: '용적률', text: true, suffix: '%', rate: '5%' },
      { id: 'ind.slope', label: '경사', survey: true, options: ['O', 'X'], rate: '-5%' },
      { id: 'ind.piloti', label: '필로티', survey: true, options: ['O', 'X'], rate: '5%' },
      { id: 'ind.elevator', label: '엘베', options: ['O', 'X'], rate: '10%' },
      { id: 'ind.parkLink', label: '지하주차장', survey: true, options: ['연결O', '연결X'], rate: '5%' },
      { id: 'ind.odor', label: '혐오시설', survey: true, options: ['O', 'X'], rate: '-5%' },
      { id: 'ind.corridor', label: '현관구조', options: ['계단식', '복도식'], rate: '10%' },
      {
        id: 'ind.mgmt', label: '건물관리', survey: true, multi: true,
        options: ['좋음', '양호', '나쁨', '지정주차', '곰팡이', '누수', '결로'], rate: '-5%',
      },
    ],
  },
  {
    title: '단지내 개별성',
    items: [
      { id: 'ind.dong', label: '동', custom: 'dong', rate: '5%' },
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
      {
        id: 'ind.inside', label: '건물내부', survey: true, multi: true,
        options: ['좋음', '양호', '나쁨', '청결', '계단청소', '보안'], rate: '5%',
      },
      {
        id: 'ind.home', label: '집내부', survey: true, multi: true,
        options: ['조사X', '좋음', '양호', '나쁨', '청결', '도배', '장판', '수도', '보일러'], rate: '5%',
      },
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
  const parts = [total ? `${total}개동` : '', note].filter(Boolean);
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
const indivRateNum = (item: IndivItem) => {
  if (item.id === 'ind.floorNum') {
    const auto = indivFloorRate();
    if (auto) return auto;
  }
  return item.rate.replace('%', '');
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
  const base = parseDigits(surveyForm.value.indivAvgPrice ?? '');
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
    if (!sf.indivAvgPrice && sf.mktConcAvg) sf.indivAvgPrice = sf.mktConcAvg;
  },
  { immediate: true },
);

const editingSurvey = ref({ field: false, location: false, deal: false, listing: false, individuality: false, realUser: false });
const persistSurvey = async () => {
  if (!auction.value) return;
  await store.saveAuction(auction.value);
};
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
};
const FIELD_SECTIONS: Array<{ title: string; items: FieldRow[] }> = [
  {
    title: '탐문 (윗집, 옆집, 아래집, 동대표 중)',
    items: [
      { id: 'fs.roofLeak', label: '옥상누수확인', options: ['O', 'X', '확인불가'] },
      {
        id: 'fs.maintFee', label: '미납 관리비', options: ['동대표', '관리소 연락처'],
        extra: { id: 'fs.maintPhone', placeholder: '연락처' },
      },
      {
        id: 'fs.tenantContact', label: '임차인연락처', options: ['동대표', '차량확인'],
        extra: { id: 'fs.tenantPhone', placeholder: '연락처' },
      },
      { id: 'fs.doorCode', label: '출입문 비번', text: true, placeholder: '비밀번호 입력' },
    ],
  },
  {
    title: '우편물 확인',
    items: [
      { id: 'fs.mailTax', label: '미납세금', options: ['O', 'X'], extra: { id: 'fs.mailTaxAmt', placeholder: '금액입력', money: true } },
      { id: 'fs.mailMaint', label: '미납관리비', options: ['O', 'X'], extra: { id: 'fs.mailMaintAmt', placeholder: '금액입력', money: true } },
      { id: 'fs.mailPower', label: '전기', options: ['O', 'X'], extra: { id: 'fs.mailPowerAmt', placeholder: '금액입력', money: true } },
      { id: 'fs.mailWater', label: '수도', options: ['O', 'X'], extra: { id: 'fs.mailWaterAmt', placeholder: '금액입력', money: true } },
      { id: 'fs.mailGas', label: '가스', options: ['O', 'X'], extra: { id: 'fs.mailGasAmt', placeholder: '금액입력', money: true } },
      { id: 'fs.mailEtc', label: '기타', text: true, placeholder: '법원송달서류등' },
    ],
  },
  {
    title: '수리상태',
    items: [
      { id: 'fs.door', label: '도어', options: ['교체상태', '미교체'] },
      { id: 'fs.doorLock', label: '도어락', options: ['교체상태', '미교체'] },
      { id: 'fs.window', label: '샷시', options: ['교체상태', '미교체'] },
    ],
  },
  {
    title: '주차장',
    items: [
      { id: 'fs.parkingCount', label: '주차대수', text: true, placeholder: '0', suffix: '대' },
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
  { key: 'areaSurvey', title: '지역조사', note: '호재, 공급' },
  { key: 'zoneRank', title: '구역내(동네) 입지등수', note: '아실, 디스코 > 평단가 or 전세가 등수 확인', aptOnly: true },
  { key: 'resident', title: '호갱노노 주민이야기', note: '호재, 입지가치, 개별가치', aptOnly: true },
];
const setExtraNote = async (key: string, value: string) => {
  setFieldVal(`fs.${key}.note`, value);
  await persistSurvey();
};

// 본건사진 비고 — 입력하면 바로 저장한다
const setPhotoNote = async (value: string) => {
  setFieldVal('fs.photoNote', value);
  await persistSurvey();
};
const isChecklistOn = (id: string) => fieldVal(id) === 'Y';
const toggleChecklist = async (id: string) => {
  setFieldVal(id, isChecklistOn(id) ? '' : 'Y');
  await persistSurvey();
};

const FIELD_OCCUPANCY_OPTIONS = ['공실', '점유자미상', '불법점유', '가장임차인점유', '진성임차인점유', '전출'];
const fieldVal = (id: string) => surveyForm.value.fieldValues?.[id] ?? '';
const setFieldVal = (id: string, value: string) => {
  const sf = surveyForm.value;
  if (!sf.fieldValues) sf.fieldValues = {};
  sf.fieldValues[id] = value;
};
const fieldMoneyText = (id: string) => {
  const n = Number(fieldVal(id).replace(/[^\d]/g, ''));
  return n > 0 ? n.toLocaleString('ko-KR') : '-';
};

// === 현황조사서 멀티셀렉트 ===
const SURVEY_REPORT_OPTIONS = ['임차인점유추정', '점유자관계미상', '폐문부재'];
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
const parseArea = (raw: string | undefined) => {
  const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
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
// 가격정보 표에서 '매매' 중 가장 최근 거래 — 그 줄 금액 옆에만 보내기 버튼을 둔다
const latestSaleTradeRow = computed(() => {
  const dateKey = (r: { contractDate?: string }) => (r.contractDate ?? '').replace(/\D/g, '');
  const sales = filteredPdfTradeRows.value.filter((r) => r.type === '매매' && parsePriceNumber(r.price) > 0);
  if (sales.length === 0) return null;
  return sales.reduce((best, r) => (dateKey(r) > dateKey(best) ? r : best), sales[0]);
});
// 그 금액을 손품+현장 > 해당경매물건 실거래가 > 실거래가 칸에 바로 넣는다
const sendTradePriceToMarket = async (row: { price?: string }) => {
  const n = parsePriceNumber(row.price);
  if (!Number.isFinite(n) || n <= 0) return;
  setMktVal('mkt.d.real', String(Math.round(n)));
  await persistSurvey();
  copiedMsg.value = '실거래가에 넣었습니다.';
  setTimeout(() => { copiedMsg.value = ''; }, 1500);
};
const mktMoney = (id: string) => {
  const n = parseDigits(mktVal(id));
  return n > 0 ? n.toLocaleString('ko-KR') : '-';
};
// 평수는 숫자만 저장하고 보여 줄 때 '평'을 붙인다
const mktAreaNum = (id: string) => mktVal(id).replace(/[^\d.]/g, '');
const PYEONG_TO_M2 = 3.305785;
// 면적은 ㎡로 입력·저장하고, 보여 줄 때 평으로 환산한다
const mktAreaText = (id: string) => {
  const v = mktAreaNum(id);
  if (!v) return '-';
  return `${v}㎡ / ${(Number(v) / PYEONG_TO_M2).toFixed(2)}평`;
};
// 국토부 실거래가 평균의 '사용승인' 연월 — PDF 사용승인일에서 가져오고 휠로 고친다
const mktYmOpen = ref(false);
const mktYmValue = computed({
  get: () => mktVal('mkt.a.approval'),
  set: (value: string) => setMktVal('mkt.a.approval', value),
});
// 실거래가 거래년월
const mktDealYmOpen = ref(false);
const mktDealYmValue = computed({
  get: () => mktVal('mkt.d.year'),
  set: (value: string) => setMktVal('mkt.d.year', value),
});
// 전용면적 X 평단가
const mktAreaXUnit = computed(() => {
  // 전용면적은 ㎡로 저장하고 평단가는 평 기준이라, 평으로 바꿔 곱한다.
  // 화면에 보이는 평수(소수 2자리)를 그대로 써야 눈으로 검산이 맞는다.
  const pyeong = Number((parseArea(mktVal('mkt.b.area')) / PYEONG_TO_M2).toFixed(2));
  const unit = parseDigits(mktVal('mkt.b.unit'));
  return pyeong > 0 && unit > 0 ? Math.round(pyeong * unit).toLocaleString('ko-KR') : '-';
});
// 전세가 = 공동주택가 × 비율(기본 127%)
const MKT_JEONSE_RATE = 127;
const mktJeonseRate = computed(() => {
  const r = Number(mktVal('mkt.d.rate').replace(/[^\d.]/g, ''));
  return Number.isFinite(r) && r > 0 ? r : MKT_JEONSE_RATE;
});
const mktJeonseFromPub = computed(() => {
  const pub = parseDigits(mktVal('mkt.d.pub'));
  return pub > 0 ? Math.round((pub * mktJeonseRate.value) / 100).toLocaleString('ko-KR') : '-';
});
// 비율 = 실거래가 / 공동주택가
const mktCaseRatio = computed(() => {
  const pub = parseDigits(mktVal('mkt.d.pub'));
  const real = parseDigits(mktVal('mkt.d.real'));
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
    const areaIds = ['mkt.a.area', 'mkt.a.area2', 'mkt.b.area', 'mkt.c.area', 'mkt.d.area'];
    if (!v['mkt.areaInM2']) {
      areaIds.forEach((id) => { v[id] = ''; });
      v['mkt.areaInM2'] = '1';
    }
    const m2 = num(a.buildingAreaM2);
    if (m2 > 0) areaIds.forEach((id) => fill(id, String(m2)));
    const py = num(a.buildingAreaPyeong);
    if (py > 0 && !sf.mktConcPyeong) sf.mktConcPyeong = py.toFixed(2);
    const around = num(publicTradeAvg.value);
    fill('mkt.a.sale', around > 0 ? String(around) : '');
    if (around > 0 && py > 0) fill('mkt.b.unit', String(Math.round(around / py)));
    fill('mkt.d.real', num(pdfMaeMaeAvg.value) > 0 ? String(Math.round(pdfMaeMaeAvg.value)) : '');
    fill('mkt.d.pub', num(a.officialPriceValue) > 0 ? String(a.officialPriceValue) : '');
    fill('mkt.d.rate', String(MKT_JEONSE_RATE));
    if (!/^\d{4}-\d{2}$/.test(v['mkt.a.approval'] ?? '')) {
      const am = (a.buildingHeader?.approvalDate || a.approvalDate || '').match(/(\d{4})[-./]?(\d{2})/);
      v['mkt.a.approval'] = am ? `${am[1]}-${am[2]}` : '';
    }

    // 결론 줄
    if (!sf.mktConcAvg && v['mkt.a.sale']) sf.mktConcAvg = v['mkt.a.sale'];
    if (!sf.mktConcLow && v['mkt.c.saleAsk']) sf.mktConcLow = v['mkt.c.saleAsk'];
    if (!sf.mktUnitPrice && v['mkt.b.unit']) sf.mktUnitPrice = v['mkt.b.unit'];
  },
  { immediate: true },
);

// 평단가 × 평수
const mktUnitTotalText = computed(() => {
  const unit = parseDigits(surveyForm.value.mktUnitPrice ?? '');
  const py = parseArea(surveyForm.value.mktConcPyeong);
  if (unit <= 0 || py <= 0) return '-';
  return Math.round(unit * py).toLocaleString('ko-KR');
});
// 부동산 정보 — 최소 3줄은 항상 보이게 채워 둔다 (computed 안에서 고치면 순환이 생겨 watch로 뺀다)
const AGENCY_INFO_OPTIONS = ['친절', '불친절', '적극', '비적극'];
// 정보는 여러 개 고를 수 있다 — 저장은 기존처럼 쉼표로 이어 붙인 한 문자열
const agencyInfoOpen = ref(-1);
const agencyInfoList = (row: AgencyRow) =>
  (row.info ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const toggleAgencyInfo = (row: AgencyRow, opt: string) => {
  const picked = agencyInfoList(row);
  const idx = picked.indexOf(opt);
  if (idx >= 0) picked.splice(idx, 1);
  else picked.push(opt);
  row.info = picked.join(', ');
};
const emptyAgencyRow = (): AgencyRow => ({ name: '', phone: '', info: '', monthly: '', jeonse: '', real: '', urgent: '' });
watch(
  () => auction.value?.id,
  () => {
    const sf = surveyForm.value;
    if (!sf) return;
    if (!sf.agencyRows) sf.agencyRows = [];
    while (sf.agencyRows.length < AGENCY_ROW_MIN) sf.agencyRows.push(emptyAgencyRow());
  },
  { immediate: true },
);
const agencyRows = computed<AgencyRow[]>(() => surveyForm.value.agencyRows ?? []);
const addAgencyRow = () => {
  surveyForm.value.agencyRows?.push(emptyAgencyRow());
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
    desc: '대항력 임차인인 경우, 배당 종기일이 지난 후 배당요구 경우 있다.\n배당신청 및 날짜까지 확인 필요하다. 이 경우 낙찰자 인수 이다.',
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
  kind: 'date' | 'text' | 'multi' | 'pick';
  id: string; placeholder: string;
  options?: string[];
  autoOccupancy?: boolean;
};
type RightsDocLine = { cells: RightsDocCell[] };
const RIGHTS_DOC_ITEMS: RightsDocItem[] = [
  {
    id: 'doc.survey', label: '현황조사서',
    dateId: 'doc.survey.date', datePlaceholder: '현황조사일',
    fields: [
      { id: 'doc.survey.occupancy', placeholder: '부동산 점유관계 입력', autoOccupancy: true },
      { id: 'doc.survey.note', placeholder: '기타사항입력', options: ['임차인점유', '폐문부재', '동거인O', '점유자미상'] },
    ],
    line2: {
      dateId: 'doc.surveyTenant.date', datePlaceholder: '전입일자',
      fields: [
        { id: 'doc.surveyTenant.name', placeholder: '임차인이름' },
        { id: 'doc.surveyTenant.state', placeholder: '기타사항입력', options: ['임차인점유', '폐문부재', '동거인O', '점유자미상'] },
      ],
    },
  },
  {
    id: 'doc.residents', label: '세대열람',
    lines: [
      { cells: [
        { kind: 'date', id: 'doc.residents.issueDate', placeholder: '발급일자' },
        { kind: 'text', id: 'doc.residents.note1', placeholder: '비고' },
        { kind: 'multi', id: 'doc.residents.note2', placeholder: '동거인', options: ['동거인 O', '동거인 X', '전출', '점유자미상'] },
      ] },
      { cells: [
        { kind: 'date', id: 'doc.residents.date', placeholder: '전입일자' },
        { kind: 'text', id: 'doc.residents.head', placeholder: '세대주 이름 입력' },
        { kind: 'multi', id: 'doc.residents.cohabit', placeholder: '동거인', options: ['동거인 O', '동거인 X', '전출', '점유자미상'] },
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
const rightsDocNote = (id: string) => auction.value?.rightsDocNotes?.[id] ?? '';
// 세대열람의 동거인 칸처럼 여러 개를 고르는 항목 — 쉼표로 이어 붙인 한 문자열로 저장
const docMultiOpen = ref('');
// 예전에 O/X 버튼으로 저장해 둔 값('O', 'X')을 지금 선택지 이름으로 바꾸고 중복을 없앤다
const DOC_LEGACY_LABELS: Record<string, string> = { O: '동거인 O', X: '동거인 X' };
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
const setRightsDocNote = async (id: string, value: string) => {
  if (!auction.value) return;
  if (!auction.value.rightsDocNotes) auction.value.rightsDocNotes = {};
  auction.value.rightsDocNotes[id] = value;
  await store.saveAuction(auction.value);
};

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
  { id: '3', title: '권리분석 케이스3', summary: '기본물건 : 임차인 있음, 대항력 없음' },
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
    title: '12~14평',
    rooms: '1.5룸~2룸',
    details: ['1인가구', '2인(신혼, 중장년)'],
    conditions: ['일자리', '교통', '인프라', '공원'],
    maxPyeong: 13.5,
  },
  {
    id: '15',
    title: '15~17평',
    rooms: '큰 2룸',
    details: ['2인(신혼, 중장년)', '3인(신혼, 중장년 미취학)'],
    conditions: ['일자리', '교통', '인프라', '유치원', '공원'],
    maxPyeong: 16.5,
  },
  {
    id: '18',
    title: '18~25평',
    rooms: '3룸',
    details: ['3인가족', '4인가족'],
    conditions: ['초등학교', '학원가', '인프라', '교통'],
    maxPyeong: Number.POSITIVE_INFINITY,
  },
];

const autoRealUserBand = computed(() => {
  const py = Number(auction.value?.buildingAreaPyeong) || 0;
  if (py <= 0) return null;
  return REAL_USER_BANDS.find((b) => py < b.maxPyeong) ?? REAL_USER_BANDS[REAL_USER_BANDS.length - 1];
});

// 보기 모드에서 쓸 값 — 직접 입력한 게 있으면 그것을, 없으면 자동 판정값을 쓴다
// 직접 고른 값이 있으면 그것을, 없으면 전용 평수로 자동 판정한 것을 쓴다
const selectedRealUserBand = computed(
  () => REAL_USER_BANDS.find((b) => b.id === auction.value?.realUserBandId) ?? autoRealUserBand.value,
);

const bandOpen = ref(false);

// 입지조건별 등수.
// 평수마다 따로 보관한다 — 키를 조건명만으로 두면 평수를 바꿔도 겹치는 조건(교통·인프라 등)의
// 등수가 남아버린다. 다른 평수를 고르면 비어 있고, 원래 평수로 돌아오면 입력값이 살아난다.
const rankKey = (cond: string) => `${selectedRealUserBand.value?.id ?? ''}:${cond}`;
const rankOf = (cond: string) => auction.value?.realUserRanks?.[rankKey(cond)] ?? '';
const setRank = async (cond: string, value: string) => {
  if (!auction.value || !editingSurvey.value.realUser) return;
  if (!auction.value.realUserRanks) auction.value.realUserRanks = {};
  auction.value.realUserRanks[rankKey(cond)] = value;
  await store.saveAuction(auction.value);
};
// 입지조건 등수 평균 — 낮을수록 좋은 등수. 입력한 항목만으로 평균을 낸다
const realUserRankSummary = computed(() => {
  const conditions = selectedRealUserBand.value?.conditions ?? [];
  const values = conditions
    .map((c) => Number(rankOf(c)))
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
// 면적 표시 단위 (㎡ ↔ 평)
const summaryUnit = ref<'㎡' | '평'>('㎡');
const toggleSummaryUnit = () => { summaryUnit.value = summaryUnit.value === '㎡' ? '평' : '㎡'; };
const areaText = (raw: string) => {
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '-';
  return summaryUnit.value === '평' ? `${(n / 3.305785).toFixed(2)}평` : `${n}㎡`;
};
const summaryApprovalPair = computed(() => {
  const raw = sumVal('sum.approval');
  if (!raw) return '-';
  const m = raw.match(/^(\d{4})/);
  if (!m) return raw;
  const years = new Date().getFullYear() - Number(m[1]) + 1;
  return years > 0 ? `${raw} / ${years}년차` : raw;
});
const summaryAreaPair = computed(() => `${areaText(sumVal('sum.supplyArea'))} / ${areaText(sumVal('sum.exclusiveArea'))}`);
// 편집 중에도 전환한 단위로 보여 주고, 저장은 항상 ㎡로 되돌린다
const summaryAreaInput = (id: string) => {
  const n = Number(sumVal(id).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return summaryUnit.value === '평' ? (n / 3.305785).toFixed(2) : String(n);
};
const setSummaryArea = (id: string, raw: string) => {
  const n = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) { setSumVal(id, ''); return; }
  setSumVal(id, summaryUnit.value === '평' ? (n * 3.305785).toFixed(2) : String(n));
};
// 앞이 해당 물건의 층, 뒤가 그 동의 전체 층수
const summaryFloorPair = computed(() => {
  const total = sumVal('sum.floorTotal');
  const cur = sumVal('sum.floorCurrent');
  if (!total && !cur) return '-';
  return `${cur || '-'}층 / ${total || '-'}층`;
});
const summaryUnitPair = computed(() => {
  const dong = sumVal('sum.dong');
  const ho = sumVal('sum.ho');
  if (!dong && !ho) return '-';
  return `${dong || '-'}동 / ${ho || '-'}호`;
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

    fill('sum.court', a.courtName || '');
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
    const dong = raw.match(/제?\s*(\d+)\s*동/);
    const ho = raw.match(/제?\s*(\d+)\s*호/);
    if (dong) fill('sum.dong', dong[1]);
    if (ho) fill('sum.ho', ho[1]);
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
    <div class="adp-sticky-head">
      <header class="adp-topbar">
        <button class="adp-back" type="button" aria-label="뒤로" @click="goBack">‹</button>
        <h1 class="adp-page-title">물건상세</h1>
        <span class="adp-spacer" />
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
        <span class="adp-prop-line">
          <strong class="adp-prop-case">{{ caseLabel }}</strong>
          <span class="adp-prop-sale">{{ saleKind }}</span>
        </span>
        <button
          v-if="pdfViewUrl"
          type="button"
          class="adp-pdf-btn"
          :title="auction?.importMeta?.pdfFileName || pdfViewLabel"
          @click="openSourcePdf"
        >
          <img :src="fileTextIcon" alt="" />{{ pdfViewLabel }}
        </button>
        <p class="adp-prop-addr">{{ jibunAddress }}</p>
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
          <header class="adp-card-head adp-survey-head">
            <h2>정보요약</h2>
            <button type="button" class="adp-mkt-unit-btn" aria-label="면적 단위 전환" @click="toggleSummaryUnit">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
              </svg>{{ summaryUnit === '㎡' ? '평' : '㎡' }}
            </button>
            <button v-if="!editingSummary" class="adp-edit-btn" type="button" @click="editingSummary = true">✎ 편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click="saveSummary">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('summary') }]" alt="" @click="toggleSection('summary')" />
          </header>
          <dl v-if="!isCollapsed('summary')" class="adp-base-rows adp-sum-rows">
            <div class="adp-base-row"><dt>매각</dt><dd>{{ saleKind || '-' }}</dd></div>
            <div class="adp-base-row">
              <dt>관할법원</dt>
              <dd>
                <input v-if="editingSummary" class="adp-sum-input wide" :value="sumVal('sum.court')" placeholder="법원명" @change="setSumVal('sum.court', ($event.target as HTMLInputElement).value)" />
                <template v-else>{{ sumVal('sum.court') || '-' }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>사용승인</dt>
              <dd>
                <input v-if="editingSummary" class="adp-sum-input wide" :value="sumVal('sum.approval')" placeholder="YYYY-MM-DD" @change="setSumVal('sum.approval', ($event.target as HTMLInputElement).value)" />
                <template v-else>{{ summaryApprovalPair }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>세대수</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.units')" placeholder="0" @change="setSumVal('sum.units', ($event.target as HTMLInputElement).value)" />세대
                </span>
                <template v-else>{{ sumVal('sum.units') ? `${Number(sumVal('sum.units')).toLocaleString('ko-KR')}세대` : '-' }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>해당면적 세대수</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.areaUnits')" placeholder="0" @change="setSumVal('sum.areaUnits', ($event.target as HTMLInputElement).value)" />세대
                </span>
                <template v-else>{{ sumVal('sum.areaUnits') ? `${Number(sumVal('sum.areaUnits')).toLocaleString('ko-KR')}세대` : '-' }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>공급/전용면적</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="decimal" :value="summaryAreaInput('sum.supplyArea')" placeholder="공급" @change="setSummaryArea('sum.supplyArea', ($event.target as HTMLInputElement).value)" />/
                  <input class="adp-sum-input" inputmode="decimal" :value="summaryAreaInput('sum.exclusiveArea')" placeholder="전용" @change="setSummaryArea('sum.exclusiveArea', ($event.target as HTMLInputElement).value)" />{{ summaryUnit }}
                </span>
                <template v-else>{{ summaryAreaPair }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>대지면적</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input wide" inputmode="decimal" :value="summaryAreaInput('sum.landArea')" placeholder="0" @change="setSummaryArea('sum.landArea', ($event.target as HTMLInputElement).value)" />{{ summaryUnit }}
                </span>
                <template v-else>{{ areaText(sumVal('sum.landArea')) }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>층</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.floorCurrent')" placeholder="해당" @change="setSumVal('sum.floorCurrent', ($event.target as HTMLInputElement).value)" />층 /
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.floorTotal')" placeholder="전체" @change="setSumVal('sum.floorTotal', ($event.target as HTMLInputElement).value)" />층
                </span>
                <template v-else>{{ summaryFloorPair }}</template>
              </dd>
            </div>
            <div class="adp-base-row">
              <dt>동/호</dt>
              <dd>
                <span v-if="editingSummary" class="adp-sum-pair">
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.dong')" placeholder="동" @change="setSumVal('sum.dong', ($event.target as HTMLInputElement).value)" />동 /
                  <input class="adp-sum-input" inputmode="numeric" :value="sumVal('sum.ho')" placeholder="호" @change="setSumVal('sum.ho', ($event.target as HTMLInputElement).value)" />호
                </span>
                <template v-else>{{ summaryUnitPair }}</template>
              </dd>
            </div>
          </dl>
        </section>

        <!-- 물건 기본정보 — 입찰일정 + 임차인현황 통합 카드 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('base')">
            <h2>기본정보</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('base') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('base')">
          <dl class="adp-base-rows">
            <div class="adp-base-row"><dt>소유자</dt><dd>{{ auction?.ownerName || '-' }}</dd></div>
            <div class="adp-base-row"><dt>채무자</dt><dd>{{ auction?.debtorName || '-' }}</dd></div>
            <div class="adp-base-row"><dt>채권자</dt><dd>{{ auction?.creditorName || '-' }}</dd></div>
            <div class="adp-base-row"><dt>차수</dt><dd><span class="adp-base-round">{{ currentRoundLabel }}</span></dd></div>
          </dl>

          <h3 class="adp-base-sub">감정평가 / 기일내역</h3>
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
                <span v-if="row.date" class="adp-base-date">{{ row.date }}</span>
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

        <!-- 임차인현황 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('tenant')">
            <h2>임차인현황</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('tenant') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('tenant')">
          <p class="adp-base-note">말소기준 : {{ tenantBaseDate }} · 소액기준 : {{ tenantSmallDate }} · 배당종기 : {{ tenantDistDate }}</p>

          <template v-if="tenantCards.length > 0">
            <dl v-for="(tenant, i) in tenantCards" :key="i" class="adp-base-rows adp-base-tenant">
              <div class="adp-base-row quad">
                <dt>임차인</dt>
                <dd class="quad-v">
                  <strong>{{ tenant.name }}</strong>
                  <small v-if="tenant.agency">{{ tenant.agency }}</small>
                </dd>
                <dt class="quad-l2">보증금</dt>
                <dd class="quad-v nowrap">{{ tenant.deposit ? `보: ${tenant.deposit}` : '-' }}</dd>
              </div>
              <div class="adp-base-row quad">
                <dt>점유기간</dt>
                <dd class="quad-v">{{ tenant.occupationPeriod || '-' }}</dd>
                <dt class="quad-l2">전/확/배</dt>
                <dd class="quad-v stack">
                  <span v-if="tenant.moveIn">전입: {{ tenant.moveIn }}</span>
                  <span v-if="tenant.fixed">확정: {{ tenant.fixed }}</span>
                  <span v-if="tenant.distribution">배당: {{ tenant.distribution }}</span>
                  <span v-if="!tenant.moveIn && !tenant.fixed && !tenant.distribution">-</span>
                </dd>
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
        </section>

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('bld')">
            <h2>건축물정보</h2>
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
            <h2>물건현황정보</h2>
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

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('registry')">
            <h2>건물등기</h2>
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
                    <span v-if="r.desc" class="adp-desc pre-line">{{ r.desc }}</span>
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

        <!-- 관련사건 — PDF '관련사건' 표에서 파싱 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('cases2')">
            <h2>관련사건</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('cases2') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('cases2')">
            <table v-if="relatedCases.length > 0" class="adp-table adp-table-sm adp-case-table">
              <colgroup>
                <col style="width: 28%" />
                <col />
                <col style="width: 22%" />
                <col style="width: 18%" />
              </colgroup>
              <thead>
                <tr><th>관련법원</th><th class="c">관련사건번호</th><th class="c">관련사건구분</th><th class="c">종국결과</th></tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in relatedCases" :key="i">
                  <td>{{ r.court || '-' }}</td>
                  <td class="c"><span class="adp-pill">{{ r.caseNumber || '-' }}</span></td>
                  <td class="c">{{ r.kind || '-' }}</td>
                  <td class="c">{{ r.result || '-' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="adp-empty">관련사건 없음</p>
          </div>
        </section>

        <section v-if="isApartment && auction?.aptComplexInfo" class="adp-card">
          <header class="adp-card-head" @click="toggleSection('apt')">
            <h2>단지정보</h2>
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
            <h2>체납내역</h2>
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



        <!-- 입지정보 — 인근역세권·교육환경·주변환경을 한 카드로 묶는다 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('areaInfo')">
            <h2>입지정보</h2>
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
      </template>

      <template v-if="activeTab === 'profit' && auction">
        <section class="adp-card">
          <header class="adp-card-head adp-profit-head">
            <h2>예상수익분석</h2>
            <button v-if="!editingProfit" class="adp-edit-btn" type="button" @click="startEditProfit">✎ 편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click="saveProfit">💾 저장</button>
          </header>
          <table class="adp-table adp-profit-table v2">
            <thead>
              <tr><th>구분</th><th>상세</th><th class="r">비중 (%)</th><th class="r">금액</th></tr>
            </thead>
            <tbody>
              <tr>
                <td rowspan="3" class="adp-cat">입찰가</td>
                <td>감정가</td>
                <td class="r"></td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.metrics.appraisalValue" class="adp-cell-input" /><template v-else>{{ formatMoney(apprValue) }}</template>
                </td>
              </tr>
              <tr class="hi">
                <td><strong>입찰가</strong></td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="myBidPct.toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setBidByApprPct(($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(myBidPct) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.metrics.myBidValue" class="adp-cell-input" /><template v-else><strong>{{ formatMoney(myBid) }}</strong></template>
                </td>
              </tr>
              <tr>
                <td>대출(사업자)</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="pctOfBid(auction.bidCost.loanAmount).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setAmountByPct('loanAmount', ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(pctOfBid(auction.bidCost.loanAmount)) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.loanAmount" class="adp-cell-input" /><template v-else>{{ formatMoney(auction.bidCost.loanAmount) }}</template>
                </td>
              </tr>

              <tr>
                <td rowspan="9" class="adp-cat">비용</td>
                <td>취득세</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="pctOfBid(auction.bidCost.acquisitionTaxAmount).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setAmountByPct('acquisitionTaxAmount', ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(pctOfBid(auction.bidCost.acquisitionTaxAmount)) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.acquisitionTaxAmount" class="adp-cell-input" /><template v-else>{{ formatMoney(auction.bidCost.acquisitionTaxAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td>법무비/채권</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="pctOfBid(auction.bidCost.legalCostAmount).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setAmountByPct('legalCostAmount', ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(pctOfBid(auction.bidCost.legalCostAmount)) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.legalCostAmount" class="adp-cell-input" /><template v-else>{{ formatMoney(auction.bidCost.legalCostAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td>중도상환</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="rowPct(RATE_ROWS[0]).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setRowPct(RATE_ROWS[0], ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(rowPct(RATE_ROWS[0])) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.midRepaymentAmount" class="adp-cell-input" @update:model-value="syncRowRate(RATE_ROWS[0])" /><template v-else>{{ formatMoney(auction.bidCost.midRepaymentAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td>이자(3M)</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="rowPct(RATE_ROWS[1]).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setRowPct(RATE_ROWS[1], ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(rowPct(RATE_ROWS[1])) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.interestAmount" class="adp-cell-input" @update:model-value="syncRowRate(RATE_ROWS[1])" /><template v-else>{{ formatMoney(auction.bidCost.interestAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td>매도중개료</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="rowPct(RATE_ROWS[2]).toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setRowPct(RATE_ROWS[2], ($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ formatPct(rowPct(RATE_ROWS[2])) }}</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.brokerageAmount" class="adp-cell-input" @update:model-value="syncRowRate(RATE_ROWS[2])" /><template v-else>{{ formatMoney(auction.bidCost.brokerageAmount) }}</template>
                </td>
              </tr>
              <tr>
                <td>미납관리비</td>
                <td class="r">-</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.arrearsFee" class="adp-cell-input" /><template v-else>{{ auction.bidCost.arrearsFee > 0 ? formatMoney(auction.bidCost.arrearsFee) : '-' }}</template>
                </td>
              </tr>
              <tr>
                <td>수리비</td>
                <td class="r">-</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.repairCost" class="adp-cell-input" /><template v-else>{{ auction.bidCost.repairCost > 0 ? formatMoney(auction.bidCost.repairCost) : '-' }}</template>
                </td>
              </tr>
              <tr>
                <td>명도비</td>
                <td class="r">-</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.bidCost.evictionCost" class="adp-cell-input" /><template v-else>{{ auction.bidCost.evictionCost > 0 ? formatMoney(auction.bidCost.evictionCost) : '-' }}</template>
                </td>
              </tr>
              <tr class="hi">
                <td><strong>비용</strong></td>
                <td class="r"></td>
                <td class="r"><strong>{{ formatMoney(totalCosts) }}</strong></td>
              </tr>

              <tr>
                <td rowspan="8" class="adp-cat">수익</td>
                <td><strong>매도가</strong></td>
                <td class="r"></td>
                <td class="r emph">
                  <FormattedNumberInput v-if="editingProfit" v-model="auction.expectedSaleValue" class="adp-cell-input" /><template v-else><strong>{{ formatMoney(expectedSale) }}</strong></template>
                </td>
              </tr>
              <tr>
                <td><strong>총투자금</strong></td>
                <td class="r adp-formula">(입찰가+비용)</td>
                <td class="r"><strong>{{ formatMoney(totalInvest) }}</strong></td>
              </tr>
              <tr>
                <td><strong>실투자금</strong></td>
                <td class="r adp-formula">(입찰가-대출+비용)</td>
                <td class="r"><strong>{{ formatMoney(netInvestment) }}</strong></td>
              </tr>
              <tr>
                <td><strong>양도차익</strong></td>
                <td class="r adp-formula">(매가-입찰가-비용)</td>
                <td class="r" :class="capitalGain < 0 ? 'neg' : ''"><strong>{{ formatMoney(capitalGain) }}</strong></td>
              </tr>
              <tr>
                <td>종합소득세</td>
                <td class="r adp-formula">누진세율</td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="incomeTaxInput" class="adp-cell-input" /><template v-else>{{ formatMoney(transferTax) }}</template>
                </td>
              </tr>
              <tr>
                <td>지방세</td>
                <td class="r">
                  <span v-if="editingProfit" class="adp-pct-wrap"><input :value="localTaxRate.toFixed(2)" inputmode="decimal" class="adp-cell-input sm" @input="limitPct" @change="setLocalTaxRate(($event.target as HTMLInputElement).value)" /><span class="adp-pct-suf">%</span></span><template v-else>{{ localTaxRate.toFixed(2) }}%</template>
                </td>
                <td class="r">
                  <FormattedNumberInput v-if="editingProfit" v-model="localTaxInput" class="adp-cell-input" /><template v-else>{{ formatMoney(localTax) }}</template>
                </td>
              </tr>
              <tr class="hi">
                <td><strong>세후이익</strong></td>
                <td class="r adp-formula">(매가-총투자금-소득세)</td>
                <td class="r"><strong :class="afterTaxProfit < 0 ? 'neg' : ''">{{ formatMoney(afterTaxProfit) }}</strong></td>
              </tr>
              <tr class="hi">
                <td><strong>순투자수익율</strong></td>
                <td class="r adp-formula">(세후이익/순투자금)</td>
                <td class="r"><strong :class="afterTaxRate < 0 ? 'neg' : ''">{{ formatPct(afterTaxRate) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="adp-card">
          <header class="adp-card-head"><h2>개인소득세율 (종합소득세)</h2></header>
          <table class="adp-table adp-tax-ref">
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
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('cases')">
            <h2>매각사례</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('cases') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('cases')">
            <p class="adp-sub-note">({{ auction?.address?.split(' ').slice(0, 3).join(' ') || '' }} {{ auction?.propertyType || '' }})</p>
            <table v-if="nearBidRows.length > 0" class="adp-table adp-cases-table">
              <colgroup>
                <col style="width: 24%" />
                <col />
                <col style="width: 22%" />
                <col style="width: 26%" />
              </colgroup>
              <thead>
                <tr>
                  <th>구분</th>
                  <th class="c">평균감정가<br>평균매각가</th>
                  <th class="c">입찰인원<br>매각가율</th>
                  <th class="c">매각사례에 의한<br>예상매각가</th>
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

            <!-- 경매 동일지번 매각물건 — 같은 지번의 다른 경매 결과를 캡처로 모은다 -->
            <div class="adp-sub-block">
              <div class="adp-mkt-block-head bare">
                <span class="t">경매 동일지번 매각물건</span>
                <small>({{ lotOnlyAddress }} / 종류:전체)</small>
              </div>
              <div class="adp-plan-row">
                <input
                  :value="extraInput.sameLot ?? ''"
                  placeholder="링크 주소 입력 또는 이미지 붙여넣기"
                  class="adp-input"
                  @input="extraInput = { ...extraInput, sameLot: ($event.target as HTMLInputElement).value }"
                  @keydown.enter.prevent="addExtraUrl('sameLot')"
                  @paste="pasteImageInto($event, 'x:sameLot')"
                />
                <button type="button" class="adp-icn-btn" @click="addExtraUrl('sameLot')">+</button>
              </div>
              <p v-if="extraErr.sameLot" class="adp-plan-err">{{ extraErr.sameLot }}</p>
              <div v-for="(url, i) in extraList('sameLot')" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" alt="동일지번 매각물건" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="사진 삭제" @click="removeExtraAt('sameLot', i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
              <div class="adp-photo-note">
                <input
                  class="adp-fs-input"
                  placeholder="비고"
                  :value="fieldVal('fs.sameLot.note')"
                  @change="setExtraNote('sameLot', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('trades')">
            <h2>국토부 실거래가</h2>
            <span v-if="publicTradeUpdatedAt" class="adp-update-time">UPDATE : {{ publicTradeUpdatedAt }}</span>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('trades') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('trades')">
            <div class="adp-trade-meta-row">
              <span class="adp-trade-meta-title">해당물건정보</span>
              <span class="adp-trade-meta">
                <small>전용면적</small>
                <strong>{{ tradeMetaArea }}</strong>
              </span>
              <span class="adp-trade-meta">
                <small>사용승인</small>
                <strong>{{ auction?.buildingHeader?.approvalDate || auction?.approvalDate || '-' }}</strong>
              </span>
            </div>

            <div class="adp-trade-summary">
              <div class="adp-trade-sum-card">
                <small>해당경매물건 실거래가 평균</small>
                <span class="adp-sum-value">
                  <strong>{{ formatWonSimple(pdfTradeAvg) }}</strong>
                  <button type="button" class="adp-copy-btn" aria-label="금액 복사" @click.stop="copyText(formatWonSimple(pdfTradeAvg))">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="8" y="8" width="13" height="13" rx="2" />
                      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                </span>
              </div>
              <div class="adp-trade-sum-card">
                <small>국토부 실거래가 평균</small>
                <span class="adp-sum-value">
                  <strong>{{ formatWonSimple(publicTradeAvg) }}</strong>
                  <button type="button" class="adp-copy-btn" aria-label="금액 복사" @click.stop="copyText(formatWonSimple(publicTradeAvg))">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="8" y="8" width="13" height="13" rx="2" />
                      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                </span>
              </div>
            </div>

            <div class="adp-trade-view-tabs">
              <button :class="['adp-trade-view-tab', { active: tradeView === 'pdf' }]" @click="tradeView = 'pdf'">
                해당경매물건 ({{ filteredPdfTradeRows.length }})
              </button>
              <button :class="['adp-trade-view-tab', { active: tradeView === 'public' }]" @click="tradeView = 'public'">
                <span class="adp-tab-dot" /> {{ publicRealTradeSigungu || '주변' }} {{ publicRealTradeDong || '실거래가' }} ({{ filteredPublicTradeRows.length }})
              </button>
            </div>

            <template v-if="tradeView === 'pdf'">
              <div class="adp-trade-filter-row">
                <div class="adp-trade-tabs">
                  <button :class="['adp-trade-tab','t-all',  { active: tradeFilter === 'all' }]" @click="tradeFilter = 'all'">전체</button>
                  <button :class="['adp-trade-tab','t-buy',  { active: tradeFilter === '매매' }]" @click="tradeFilter = '매매'">매매</button>
                  <button :class="['adp-trade-tab','t-jeon', { active: tradeFilter === '전세' }]" @click="tradeFilter = '전세'">전세</button>
                  <button :class="['adp-trade-tab','t-wol',  { active: tradeFilter === '월세' }]" @click="tradeFilter = '월세'">월세</button>
                </div>
              </div>
              <div class="adp-trade-selects">
                <select v-model="tradeAreaFilter" class="adp-select-sm">
                  <option value="">전체 면적</option>
                  <option v-for="opt in tradeAreaOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <select v-model="tradeYearFilter" class="adp-select-sm">
                  <option value="">거래년도</option>
                  <option v-for="opt in tradeYearOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <table v-if="filteredPdfTradeRows.length > 0" class="adp-table adp-trade-table">
                <colgroup>
                  <col style="width: 12%" />
                  <col style="width: 22%" />
                  <col style="width: 28%" />
                  <col style="width: 28%" />
                  <col style="width: 10%" />
                </colgroup>
                <thead>
                  <tr><th>구분</th><th>계약일</th><th>거래금액</th><th class="c">전용면적<br>㎡(평)</th><th class="r">층</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in filteredPdfTradeRows" :key="i">
                    <td>{{ r.type }}</td>
                    <td>{{ r.contractDate }}</td>
                    <td>
                      <span class="adp-trade-price">
                        <span>{{ r.price }}</span>
                        <button
                          v-if="r === latestSaleTradeRow"
                          type="button"
                          class="adp-copy-btn"
                          aria-label="실거래가에 넣기"
                          title="손품+현장 실거래가에 넣기"
                          @click.stop="sendTradePriceToMarket(r)"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
                          </svg>
                        </button>
                      </span>
                    </td>
                    <td class="c">{{ r.area }}</td>
                    <td class="r">{{ r.floor }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="adp-empty">실거래가 데이터 없음</p>
            </template>

            <template v-else>
              <div class="adp-pub-filter">
                <div class="adp-pub-row dates">
                  <label class="adp-pub-cell narrow">
                    <span>시작일</span>
                    <button type="button" class="adp-pub-input adp-pub-date" @click="pubDateTarget = 'start'">
                      {{ publicStartDate || '선택' }}
                    </button>
                  </label>
                  <label class="adp-pub-cell narrow">
                    <span>종료일</span>
                    <button type="button" class="adp-pub-input adp-pub-date" @click="pubDateTarget = 'end'">
                      {{ publicEndDate || '선택' }}
                    </button>
                  </label>
                  <span class="adp-pub-months">
                    <button
                      v-for="m in [3, 6, 12]"
                      :key="m"
                      type="button"
                      :class="['adp-pub-month-btn', { on: pubMonthPreset === m }]"
                      @click="setPubMonths(m)"
                    >{{ m }}M</button>
                  </span>
                </div>
                <div class="adp-pub-row">
                  <label class="adp-pub-cell">
                    <span>최소면적</span>
                    <select v-model="publicMinArea" class="adp-pub-input">
                      <option value="">전체</option>
                      <option v-for="a in publicAreaUniqueValues" :key="a" :value="String(a)">{{ a }}</option>
                    </select>
                  </label>
                  <label class="adp-pub-cell">
                    <span>최대면적</span>
                    <select v-model="publicMaxArea" class="adp-pub-input">
                      <option value="">전체</option>
                      <option v-for="a in publicAreaUniqueValues" :key="a" :value="String(a)">{{ a }}</option>
                    </select>
                  </label>
                </div>
                <div class="adp-pub-row">
                  <label class="adp-pub-cell wide">
                    <span>건축년도</span>
                    <select v-model="publicMinBuildYear" class="adp-pub-input small">
                      <option value="">전체</option>
                      <option v-for="y in publicBuildYearUniqueValues" :key="y" :value="String(y)">{{ y }}</option>
                    </select>
                    <span class="adp-pub-tilde">~</span>
                    <select v-model="publicMaxBuildYear" class="adp-pub-input small">
                      <option value="">전체</option>
                      <option v-for="y in publicBuildYearUniqueValues" :key="y" :value="String(y)">{{ y }}</option>
                    </select>
                  </label>
                  <button type="button" class="adp-pub-reset" @click="resetPublicFilters">초기화</button>
                </div>
              </div>
              <div v-if="publicRealTradeRows.length > 0" class="adp-pub-table-wrap" @click.self="closePubColMenu">
                <table class="adp-table adp-pub-table">
                  <colgroup>
                    <col style="width: 17%" />
                    <col style="width: 20%" />
                    <col style="width: 13%" />
                    <col style="width: 12%" />
                    <col style="width: 8%" />
                    <col style="width: 30%" />
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
                              <input type="checkbox" :checked="pubColDraft[col].size === 0 || pubColDraft[col].has(v)" @click.stop="togglePubColValue(col, v)" />
                              <span>{{ v }}</span>
                            </li>
                          </ul>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in filteredPublicTradeRows" :key="i">
                      <td>{{ r.contractDate || '-' }}</td>
                      <td>{{ formatWonSimple(r.price) }}</td>
                      <td class="c">{{ r.areaM2 || '-' }}</td>
                      <td class="c">{{ r.buildYear || '-' }}</td>
                      <td class="r">{{ r.floor || '-' }}</td>
                      <td class="adp-pub-addr">
                        <span>{{ rowAddress(r) }}</span>
                        <button type="button" class="adp-copy-btn" aria-label="주소 복사" @click.stop="copyText(rowAddress(r))">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="8" y="8" width="13" height="13" rx="2" />
                            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                    <tr v-if="filteredPublicTradeRows.length === 0">
                      <td colspan="6" class="adp-pub-empty-row">필터 조건에 맞는 거래가 없습니다.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else-if="fetchingPublicTrade" class="adp-empty">주변 실거래가 조회 중…</p>
              <p v-else class="adp-empty">주변 실거래가 데이터 없음</p>
            </template>
          </div>
        </section>
      </template>


      <template v-if="activeTab === 'rights'">
        <!-- 매각물건명세서 등 서류 캡처·링크 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('rightsPhotos')">
            <h2>서류사진</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('rightsPhotos') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('rightsPhotos')">
            <div class="adp-plan-row">
              <input
                v-model="rightsDocInput"
                placeholder="링크 주소 입력 또는 이미지 붙여넣기"
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

        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('rightsCheck')">
            <h2>권리 분석</h2>
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
                  <td class="adp-rcheck-label"><strong>매각물건명세서 권리 케이스</strong></td>
                  <td class="adp-rcheck-desc" colspan="2">
                    <!-- 기본 select는 펼친 목록과 닫힌 표시의 글자를 다르게 둘 수 없어 직접 만든다 -->
                    <div class="adp-rcase-dd">
                      <button type="button" class="adp-rcase-select" @click="caseOpen = !caseOpen">
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
                        :style="{ gridTemplateColumns: `repeat(${ln.cells.length}, minmax(0, 1fr))` }"
                      >
                        <template v-for="c in ln.cells" :key="c.id">
                          <button
                            v-if="c.kind === 'date'"
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
                            @change="setRightsDocNote(c.id, ($event.target as HTMLInputElement).value)"
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
                          @change="setRightsDocNote(item.id, ($event.target as HTMLInputElement).value)"
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
                        @change="setRightsDocNote(item.id, ($event.target as HTMLInputElement).value)"
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

      </template>

      <template v-if="activeTab === 'survey' && auction">
        <!-- 본건사진 — 전경 + 평면도 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('photos')">
            <h2>본건사진 <span class="adp-survey-note-inline">전경 + 평면도 추천</span></h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('photos') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('photos')">
            <div class="adp-plan-row">
              <input
                v-model="exteriorInput"
                placeholder="링크 주소 입력 또는 이미지 붙여넣기"
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
                @change="setPhotoNote(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </section>


        <!-- 입지조사 — 지역조사 / 구역내 입지등수 / 주민이야기 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('areaSurvey')">
            <h2>입지조사</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('areaSurvey') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('areaSurvey')">
            <div v-for="item in AREA_SURVEY_ITEMS.filter((i) => isApartment || !i.aptOnly)" :key="item.key" class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>{{ item.title }} <span v-if="item.note" class="adp-survey-note-inline">{{ item.note }}</span></h3>
              </div>
              <div class="adp-plan-row">
                <input
                  :value="extraInput[item.key] ?? ''"
                  placeholder="링크 주소 입력 또는 이미지 붙여넣기"
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
                  @change="setExtraNote(item.key, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- 5. 개별성 분석 -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head">
            <h2 class="adp-head-wrap">
              개별성 분석
              <span class="adp-survey-note-inline below">호갱노노, 네이버부동산 분석 (다른 동 대비 개별성 파악 중요!)</span>
            </h2>
            <button v-if="!editingSurvey.individuality" class="adp-edit-btn" type="button" @click="editingSurvey.individuality = true">✎ 편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click="saveSurveyAndClose('individuality')">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('survInd') }]" alt="" @click="toggleSection('survInd')" />
          </header>
          <div v-if="!isCollapsed('survInd')" class="adp-ind-body">
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
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.units')" placeholder="세대수" @change="setSumVal('sum.units', ($event.target as HTMLInputElement).value)" />세대 /
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.areaUnits')" placeholder="해당면적" @change="setSumVal('sum.areaUnits', ($event.target as HTMLInputElement).value)" />세대
                        </span>
                        <strong v-else>{{ indivUnitsText }}</strong>
                      </template>
                      <template v-else-if="item.custom === 'dong'">
                        <span v-if="editingSurvey.individuality" class="adp-sum-pair">
                          <input class="adp-ind-input" inputmode="numeric" :value="indivValue('ind.dongTotal')" placeholder="총동" @change="setIndivValue('ind.dongTotal', ($event.target as HTMLInputElement).value)" />/
                          <input class="adp-ind-input" :value="indivValue('ind.dongNote')" placeholder="입지조건" @change="setIndivValue('ind.dongNote', ($event.target as HTMLInputElement).value)" />
                        </span>
                        <strong v-else>{{ indivDongText }}</strong>
                      </template>
                      <template v-else-if="item.custom === 'floor'">
                        <span v-if="editingSurvey.individuality" class="adp-sum-pair">
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.floorTotal')" placeholder="전체" @change="setSumVal('sum.floorTotal', ($event.target as HTMLInputElement).value)" />층 중
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.floorCurrent')" placeholder="해당" @change="setSumVal('sum.floorCurrent', ($event.target as HTMLInputElement).value)" />층 /
                          <input class="adp-ind-input" inputmode="numeric" :value="sumVal('sum.ho')" placeholder="호" @change="setSumVal('sum.ho', ($event.target as HTMLInputElement).value)" />호
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
                          @change="setIndivValue(item.id, ($event.target as HTMLInputElement).value)"
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
                          @change="setIndivValue(item.id, ($event.target as HTMLSelectElement).value)"
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
                            @change="setIndivValue(item.sub!.id, ($event.target as HTMLSelectElement).value)"
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
                  <th class="adp-ind-label">예상 매매가</th>
                  <td class="adp-ind-ctl">
                    <div class="row">
                      <FormattedNumberInput v-if="editingSurvey.individuality" v-model="surveyForm.indivAvgPrice" mode="string" class="adp-ind-input sm" placeholder="0" />
                      <strong v-else>{{ mktNumText(surveyForm.indivAvgPrice) }}</strong>
                    </div>
                  </td>
                  <td class="adp-ind-rate">{{ indivRateTotal }}%</td>
                </tr>
                <tr>
                  <th class="adp-ind-label">개별성 적용가</th>
                  <td class="adp-ind-ctl" colspan="2">
                    <div class="row"><strong class="hi">{{ indivAdjustedPrice }}</strong></div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <!-- 실거래가 조사 -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head">
            <h2>실거래가 조사</h2>
            <button v-if="!editingSurvey.location" class="adp-edit-btn" type="button" @click="editingSurvey.location = true">✎ 편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click="saveSurveyAndClose('location')">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('survPrice') }]" alt="" @click="toggleSection('survPrice')" />
          </header>
          <div v-if="!isCollapsed('survPrice')" class="adp-mkt-body">
            <!-- 실거래가 현황 사진 -->
            <div class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>실거래가 현황 사진 <span class="adp-survey-note-inline">아실, 디스코</span></h3>
              </div>
              <div class="adp-plan-row">
                <input
                  v-model="tradePhotoInput"
                  placeholder="링크 주소 입력 또는 이미지 붙여넣기"
                  class="adp-input"
                  @keydown.enter.prevent="addTradePhotoUrl"
                  @paste="pasteImageInto($event, 'tradePhoto')"
                />
                <button type="button" class="adp-icn-btn" @click="addTradePhotoUrl">+</button>
              </div>
              <p v-if="tradePhotoErrMsg" class="adp-plan-err">{{ tradePhotoErrMsg }}</p>
              <div v-for="(url, i) in tradePhotoList" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" alt="실거래가 현황 사진" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="실거래가 현황 사진 삭제" @click="removeTradePhotoAt(i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
            </div>


            <!-- 본표 — 출처별 블록. 칸이 많아 2열로 접어 가로 스크롤을 없앴다 -->
            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">해당경매물건 실거래가</span>
                <small>아실/디스코, 부동산플래닛</small>
              </div>
              <div class="adp-mkt-cells c3">
                <div class="cell">
                  <small>전용면적</small>
                  <span v-if="editingSurvey.location" class="adp-mkt-unit">
                    <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum('mkt.d.area')" placeholder="0" @change="setMktVal('mkt.d.area', ($event.target as HTMLInputElement).value)" />㎡
                  </span>
                  <strong v-else>{{ mktAreaText('mkt.d.area') }}</strong>
                </div>
                <div class="cell">
                  <small>거래년도</small>
                  <button
                    v-if="editingSurvey.location"
                    type="button"
                    class="adp-mkt-input adp-mkt-ym"
                    @click="mktDealYmOpen = true"
                  >{{ mktVal('mkt.d.year') || '연월' }}</button>
                  <strong v-else>{{ mktVal('mkt.d.year') || '-' }}</strong>
                </div>
                <div class="cell">
                  <small>실거래가</small>
                  <FormattedNumberInput v-if="editingSurvey.location" :model-value="mktVal('mkt.d.real')" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal('mkt.d.real', $event)" />
                  <strong v-else class="hi">{{ mktMoney('mkt.d.real') }}</strong>
                </div>
              </div>
              <div class="adp-mkt-cells c3">
                <div class="cell">
                  <small>공동주택가</small>
                  <FormattedNumberInput v-if="editingSurvey.location" :model-value="mktVal('mkt.d.pub')" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal('mkt.d.pub', $event)" />
                  <strong v-else class="hi">{{ mktMoney('mkt.d.pub') }}</strong>
                </div>
                <div class="cell calc">
                  <small class="adp-mkt-rate">
                    전세가 (공주가 ×
                    <template v-if="editingSurvey.location">
                      <input class="adp-mkt-rate-input" inputmode="numeric" :value="mktVal('mkt.d.rate')" placeholder="127" @input="setMktVal('mkt.d.rate', ($event.target as HTMLInputElement).value)" />%)
                    </template>
                    <template v-else>{{ mktJeonseRate }}%)</template>
                  </small>
                  <strong>{{ mktJeonseFromPub }}</strong>
                </div>
                <div class="cell calc">
                  <small>비율 (실거래가/공주가)</small>
                  <strong>{{ mktCaseRatio }}</strong>
                </div>
              </div>
            </div>

            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">국토부 실거래가 평균</span>
                <small>국토교통부</small>
              </div>
              <div class="adp-mkt-cells c3">
                <div class="cell">
                  <small>전용면적범위</small>
                  <span v-if="editingSurvey.location" class="adp-mkt-unit">
                    <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum('mkt.a.area')" placeholder="0" @change="setMktVal('mkt.a.area', ($event.target as HTMLInputElement).value)" />㎡
                  </span>
                  <strong v-else>{{ mktAreaText('mkt.a.area') }}</strong>
                </div>
                <div class="cell">
                  <small>사용승인범위</small>
                  <button
                    v-if="editingSurvey.location"
                    type="button"
                    class="adp-mkt-input adp-mkt-ym"
                    @click="mktYmOpen = true"
                  >{{ mktVal('mkt.a.approval') || '연월' }}</button>
                  <strong v-else>{{ mktVal('mkt.a.approval') || '-' }}</strong>
                </div>
                <div class="cell">
                  <small>국토부 실거래 평균</small>
                  <FormattedNumberInput v-if="editingSurvey.location" :model-value="mktVal('mkt.a.sale')" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal('mkt.a.sale', $event)" />
                  <strong v-else class="hi">{{ mktMoney('mkt.a.sale') }}</strong>
                </div>
              </div>
            </div>

            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">해당경매물건 평단가</span>
                <small>아실/디스코, 부동산플래닛</small>
              </div>
              <div class="adp-mkt-cells c3">
                <div class="cell">
                  <small>전용면적</small>
                  <span v-if="editingSurvey.location" class="adp-mkt-unit">
                    <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum('mkt.b.area')" placeholder="0" @change="setMktVal('mkt.b.area', ($event.target as HTMLInputElement).value)" />㎡
                  </span>
                  <strong v-else>{{ mktAreaText('mkt.b.area') }}</strong>
                </div>
                <div class="cell">
                  <small>평단가</small>
                  <FormattedNumberInput v-if="editingSurvey.location" :model-value="mktVal('mkt.b.unit')" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal('mkt.b.unit', $event)" />
                  <strong v-else class="hi">{{ mktMoney('mkt.b.unit') }}</strong>
                </div>
                <div class="cell calc">
                  <small>전용면적 X 평단가</small>
                  <strong>{{ mktAreaXUnit }}</strong>
                </div>
              </div>
            </div>

            <!-- 네이버 매물 조사 -->
            <div class="adp-sub-block">
              <div class="adp-sub-head">
                <h3 class="adp-conc-title">네이버 매물 조사</h3>
              </div>
            </div>
            <div class="adp-sub-block noline">
              <div class="adp-mkt-block-head bare">
                <span class="t">네이버부동산 매물 사진(최저가)</span>
                <small>아실, 디스코</small>
              </div>
              <div class="adp-plan-row">
                <input
                  v-model="listPhotoInput"
                  placeholder="링크 주소 입력 또는 이미지 붙여넣기"
                  class="adp-input"
                  @keydown.enter.prevent="addListPhotoUrl"
                  @paste="pasteImageInto($event, 'listPhoto')"
                />
                <button type="button" class="adp-icn-btn" @click="addListPhotoUrl">+</button>
              </div>
              <p v-if="listPhotoErrMsg" class="adp-plan-err">{{ listPhotoErrMsg }}</p>
              <div v-for="(url, i) in listPhotoList" :key="url" class="adp-plan-preview">
                <img :src="photoSrc(url)" alt="네이버부동산 매물 사진" class="adp-plan-img" @error="onImageError(url)" @click="openLightbox(photoSrc(url))" />
                <button type="button" class="adp-plan-del" aria-label="네이버부동산 매물 사진 삭제" @click="removeListPhotoAt(i)">×</button>
                <p v-if="brokenImages[url]" class="adp-plan-err">이미지 로드 실패 — URL을 확인해 주세요.</p>
              </div>
            </div>

            <div class="adp-mkt-block">
              <div class="adp-mkt-block-head">
                <span class="t">해당단지 저가매물</span>
                <small>네이버부동산</small>
              </div>
              <div class="adp-mkt-cells c3">
                <div class="cell">
                  <small>전용면적</small>
                  <span v-if="editingSurvey.location" class="adp-mkt-unit">
                    <input class="adp-mkt-input" inputmode="decimal" :value="mktAreaNum('mkt.c.area')" placeholder="0" @change="setMktVal('mkt.c.area', ($event.target as HTMLInputElement).value)" />㎡
                  </span>
                  <strong v-else>{{ mktAreaText('mkt.c.area') }}</strong>
                </div>
                <div class="cell">
                  <small>비고</small>
                  <input
                    v-if="editingSurvey.location"
                    class="adp-mkt-input"
                    :value="mktVal('mkt.c.jeonseAsk')"
                    placeholder="비고"
                    @change="setMktVal('mkt.c.jeonseAsk', ($event.target as HTMLInputElement).value)"
                  />
                  <strong v-else>{{ mktVal('mkt.c.jeonseAsk') || '-' }}</strong>
                </div>
                <div class="cell">
                  <small>매매호가 (낮은금액)</small>
                  <FormattedNumberInput v-if="editingSurvey.location" :model-value="mktVal('mkt.c.saleAsk')" mode="string" class="adp-mkt-input" placeholder="0" @update:model-value="setMktVal('mkt.c.saleAsk', $event)" />
                  <strong v-else class="hi">{{ mktMoney('mkt.c.saleAsk') }}</strong>
                </div>
              </div>
            </div>


            <!-- 부동산 정보 — 한 업체를 두 줄로 나눠 가로 스크롤 없이 담는다 -->
            <div class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>부동산 정보</h3>
                <button v-if="editingSurvey.location" type="button" class="adp-mkt-addrow" @click="addAgencyRow">+ 행 추가</button>
              </div>
              <div class="adp-agency-list">
                <div v-for="(row, i) in agencyRows" :key="i" class="adp-agency-item">
                  <div class="adp-agency-line">
                    <label class="adp-agency-fld">
                      <small>상호</small>
                      <input v-if="editingSurvey.location" v-model="row.name" class="adp-mkt-input left" placeholder="상호입력" />
                      <span v-else>{{ row.name || '-' }}</span>
                    </label>
                    <label class="adp-agency-fld">
                      <small>연락처</small>
                      <input v-if="editingSurvey.location" v-model="row.phone" class="adp-mkt-input left" placeholder="연락처" />
                      <span v-else>{{ row.phone || '-' }}</span>
                    </label>
                    <div class="adp-agency-fld">
                      <small>정보</small>
                      <div v-if="editingSurvey.location" class="adp-agency-multi">
                        <button
                          type="button"
                          class="adp-mkt-input left adp-agency-trigger"
                          @click="agencyInfoOpen = agencyInfoOpen === i ? -1 : i"
                        >
                          <span :class="['txt', { ph: !row.info }]">{{ row.info || '선택' }}</span>
                          <span class="caret">▾</span>
                        </button>
                        <template v-if="agencyInfoOpen === i">
                          <div class="adp-agency-backdrop" @click="agencyInfoOpen = -1" />
                          <ul class="adp-agency-options">
                            <li
                              v-for="opt in AGENCY_INFO_OPTIONS"
                              :key="opt"
                              :class="['adp-agency-option', { on: agencyInfoList(row).includes(opt) }]"
                              @click="toggleAgencyInfo(row, opt)"
                            >
                              <span>{{ opt }}</span>
                              <span v-if="agencyInfoList(row).includes(opt)" class="ck">✓</span>
                            </li>
                          </ul>
                        </template>
                      </div>
                      <span v-else>{{ row.info || '-' }}</span>
                    </div>
                    <button
                      v-if="editingSurvey.location && agencyRows.length > 1"
                      type="button"
                      class="adp-agency-del"
                      aria-label="업체 삭제"
                      @click="removeAgencyRow(i)"
                    >×</button>
                  </div>
                  <div class="adp-agency-line">
                    <label class="adp-agency-fld">
                      <small>전세가</small>
                      <FormattedNumberInput v-if="editingSurvey.location" v-model="row.jeonse" mode="string" class="adp-mkt-input" placeholder="0" />
                      <span v-else>{{ mktNumText(row.jeonse) }}</span>
                    </label>
                    <label class="adp-agency-fld">
                      <small>실거래가</small>
                      <FormattedNumberInput v-if="editingSurvey.location" v-model="row.real" mode="string" class="adp-mkt-input" placeholder="0" />
                      <span v-else>{{ mktNumText(row.real) }}</span>
                    </label>
                    <label class="adp-agency-fld">
                      <small>급매가</small>
                      <FormattedNumberInput v-if="editingSurvey.location" v-model="row.urgent" mode="string" class="adp-mkt-input" placeholder="0" />
                      <span v-else>{{ mktNumText(row.urgent) }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 손품결론 — 매매수요조사(등수·거래율·적체)와 급매가 결론을 한 카드로 모은다 -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head">
            <h2>손품결론</h2>
            <button v-if="!editingSurvey.realUser" class="adp-edit-btn" type="button" @click="editingSurvey.realUser = true">✎ 편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click="saveSurveyAndClose('realUser')">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('realUser') }]" alt="" @click="toggleSection('realUser')" />
          </header>
          <div v-if="!isCollapsed('realUser')">
            <!-- 매매수요조사 — 실사용자 등수표 -->
            <div class="adp-sub-head first">
              <h3 class="adp-conc-title">매매수요조사</h3>
            </div>
            <p class="adp-conc-sub">실사용자 + 입지등수</p>
            <table class="adp-table adp-ruser-table">
              <colgroup>
              <col style="width: 17%" /><col style="width: 14%" /><col style="width: 24%" /><col style="width: 33%" /><col style="width: 12%" />
              </colgroup>
              <thead>
              <tr>
                <th>전용면적</th>
                <th>방</th>
                <th>세대구성</th>
                <th>입지조건 등수</th>
                <th>평균등수</th>
              </tr>
              </thead>
              <tbody>
              <tr>
                <td class="adp-ruser-cell vmid">
                <div class="adp-rcase-dd">
                  <button type="button" class="adp-rcase-select adp-ruser-select" @click="bandOpen = !bandOpen">
                    <span>{{ selectedRealUserBand ? selectedRealUserBand.title : '선택' }}</span>
                    <span class="adp-rcase-caret">{{ bandOpen ? '▴' : '▾' }}</span>
                  </button>
                  <template v-if="bandOpen">
                    <div class="adp-rcase-backdrop" @click="bandOpen = false" />
                    <ul class="adp-rcase-list adp-ruser-list">
                      <li
                        v-for="b in REAL_USER_BANDS"
                        :key="b.id"
                        :class="['adp-rcase-item', { on: b.id === selectedRealUserBand?.id }]"
                        @click="pickRealUserBand(b.id)"
                      >
                        <strong>{{ b.title }}</strong>
                        <small>{{ b.rooms }}</small>
                      </li>
                    </ul>
                  </template>
                </div>
                </td>
                <td class="adp-ruser-cell center">{{ selectedRealUserBand?.rooms ?? '-' }}</td>
                <td class="adp-ruser-cell">
                <div v-for="d in selectedRealUserBand?.details ?? []" :key="d" class="adp-ruser-line">{{ d }}</div>
                </td>
                <td class="adp-ruser-cell">
                <!-- 입지조건 한 줄에 하나씩, 옆에 등수 입력 -->
                <div v-for="c in selectedRealUserBand?.conditions ?? []" :key="c" class="adp-ruser-cond-row">
                  <span class="adp-ruser-cond-name">{{ c }}</span>
                  <input
                    class="adp-ruser-rank"
                    inputmode="numeric"
                    placeholder="등수"
                    :disabled="!editingSurvey.realUser"
                    :value="rankOf(c)"
                    @change="setRank(c, ($event.target as HTMLInputElement).value)"
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

            <!-- 구역내 개별성 결론 -->
            <div class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>구역내 개별성</h3>
              </div>
              <div class="adp-photo-note">
                <input
                  class="adp-fs-input"
                  placeholder="비고"
                  :value="fieldVal('fs.zoneIndiv.note')"
                  @change="setExtraNote('zoneIndiv', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <!-- 단지내 개별성 결론 -->
            <div class="adp-sub-block">
              <div class="adp-sub-head">
                <h3>단지내 개별성</h3>
              </div>
              <div class="adp-photo-note">
                <input
                  class="adp-fs-input"
                  placeholder="비고"
                  :value="fieldVal('fs.complexIndiv.note')"
                  @change="setExtraNote('complexIndiv', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

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
                <input v-model="surveyForm.saleDemandNote" class="adp-fs-input" placeholder="비고" @change="persistSurvey" />
              </div>
            </div>

            <!-- 급매가 -->
            <div class="adp-sub-head">
              <h3 class="adp-conc-title">급매가</h3>
            </div>
            <div class="adp-sub-block noline">
              <div class="adp-conc-row">
                <span class="adp-conc-label">경매호실 수리상태</span>
              </div>
              <div class="adp-photo-note">
                <input
                  class="adp-fs-input"
                  placeholder="비고"
                  :value="fieldVal('fs.urgentSale.note')"
                  @change="setExtraNote('urgentSale', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <!-- 시세 및 급매가 결론 -->
            <div class="adp-sub-block">
              <div class="adp-sub-head">
                <h3 class="red">시세 및 급매가 결론</h3>
              </div>
              <table class="adp-table adp-mkt-table fit">
                <thead>
                  <tr>
                    <th>실거래가 평균</th>
                    <th>네이버 매물 중 저가<small>(실거래가와 비교)</small></th>
                    <th>평단가</th>
                    <th>
                      <input v-if="editingSurvey.realUser" v-model="surveyForm.mktConcPyeong" class="adp-mkt-input" placeholder="0.00" />
                      <span v-else>{{ surveyForm.mktConcPyeong || '-' }}평</span>
                    </th>
                    <th class="red">급매가</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="num">
                      <FormattedNumberInput v-if="editingSurvey.realUser" v-model="surveyForm.mktConcAvg" mode="string" class="adp-mkt-input" placeholder="0" />
                      <strong v-else class="red">{{ mktNumText(surveyForm.mktConcAvg) }}</strong>
                    </td>
                    <td class="num">
                      <FormattedNumberInput v-if="editingSurvey.realUser" v-model="surveyForm.mktConcLow" mode="string" class="adp-mkt-input" placeholder="0" />
                      <span v-else>{{ mktNumText(surveyForm.mktConcLow) }}</span>
                    </td>
                    <td class="num">
                      <FormattedNumberInput v-if="editingSurvey.realUser" v-model="surveyForm.mktUnitPrice" mode="string" class="adp-mkt-input" placeholder="0" />
                      <span v-else>{{ mktNumText(surveyForm.mktUnitPrice) }}</span>
                    </td>
                    <td class="num calc">{{ mktUnitTotalText }}</td>
                    <td class="num">
                      <FormattedNumberInput v-if="editingSurvey.realUser" v-model="surveyForm.urgentSalePrice" mode="string" class="adp-mkt-input" placeholder="0" />
                      <strong v-else class="hi">{{ mktNumText(surveyForm.urgentSalePrice) }}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- 1. 현장조사 -->
        <section class="adp-card">
          <header class="adp-card-head adp-survey-head">
            <h2>현장조사</h2>
            <button v-if="!editingSurvey.field" class="adp-edit-btn" type="button" @click="editingSurvey.field = true">✎ 편집</button>
            <button v-else class="adp-edit-btn save" type="button" @click="saveSurveyAndClose('field')">💾 저장</button>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('survField') }]" alt="" @click="toggleSection('survField')" />
          </header>
          <div v-if="!isCollapsed('survField')" class="adp-survey-body">
            <div class="adp-survey-block">
              <div class="adp-survey-block-head"><span class="i">ⓘ</span><strong>현장 특이사항</strong></div>
              <textarea v-if="editingSurvey.field" v-model="surveyForm.fieldNote" class="adp-survey-area" rows="2" placeholder="현장 특이사항 입력" />
              <p v-else class="adp-survey-note">{{ surveyForm.fieldNote || '등록된 특이사항이 없습니다.' }}</p>
            </div>
            <div class="adp-survey-row">
              <span class="lbl">현황조사서</span>
              <div v-if="editingSurvey.field" class="adp-multi-wrap">
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
              <span v-else class="adp-multi-view">
                <template v-if="surveyForm.surveyReport.length > 0">
                  <span v-for="opt in surveyForm.surveyReport" :key="opt" class="adp-survey-pill">{{ opt }}</span>
                </template>
                <span v-else>-</span>
              </span>
            </div>
            <div class="adp-survey-row">
              <span class="lbl">점유관계</span>
              <select
                v-if="editingSurvey.field"
                class="adp-fs-input"
                :value="fieldVal('fs.occupancy')"
                @change="setFieldVal('fs.occupancy', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">선택</option>
                <option v-for="opt in FIELD_OCCUPANCY_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <span v-else>{{ fieldVal('fs.occupancy') || '-' }}</span>
            </div>
            <div class="adp-survey-row">
              <span class="lbl">대항력 여부</span>
              <div v-if="editingSurvey.field" class="adp-toggle-group">
                <button v-for="opt in ['있음','없음','미확인']" :key="opt" type="button" :class="['adp-toggle-btn', { active: surveyForm.oppositionStatus === opt }]" @click="surveyForm.oppositionStatus = opt">{{ opt }}</button>
              </div>
              <span v-else class="adp-survey-pill">{{ surveyForm.oppositionStatus || '-' }}</span>
            </div>
            <div v-for="sec in FIELD_SECTIONS" :key="sec.title" class="adp-fs-section">
              <div class="adp-fs-title">{{ sec.title }}</div>
              <div v-for="item in sec.items" :key="item.id" class="adp-fs-row">
                <span class="lbl">{{ item.label }}</span>
                <span :class="['ctl', { wide: !item.extra }]">
                  <template v-if="item.text">
                    <span v-if="editingSurvey.field" class="adp-fs-unit">
                      <input class="adp-fs-input" :placeholder="item.placeholder" :value="fieldVal(item.id)" @change="setFieldVal(item.id, ($event.target as HTMLInputElement).value)" />{{ item.suffix }}
                    </span>
                    <span v-else>{{ fieldVal(item.id) ? `${fieldVal(item.id)}${item.suffix ?? ''}` : '-' }}</span>
                  </template>
                  <template v-else>
                    <!-- 선택지가 셋 이하면 버튼으로 바로 고른다 (다시 누르면 해제) -->
                    <span v-if="editingSurvey.field && (item.options?.length ?? 0) <= 3" class="adp-fs-toggles">
                      <button
                        v-for="opt in item.options"
                        :key="opt"
                        type="button"
                        :class="['adp-toggle-btn', { active: fieldVal(item.id) === opt }]"
                        @click="setFieldVal(item.id, fieldVal(item.id) === opt ? '' : opt)"
                      >{{ opt }}</button>
                    </span>
                    <select
                      v-else-if="editingSurvey.field"
                      class="adp-fs-input"
                      :value="fieldVal(item.id)"
                      @change="setFieldVal(item.id, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">선택</option>
                      <option v-for="opt in item.options" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <span v-else>{{ fieldVal(item.id) || '-' }}</span>
                  </template>
                </span>
                <span v-if="item.extra" class="ext">
                  <template v-if="editingSurvey.field">
                    <FormattedNumberInput
                      v-if="item.extra.money"
                      :model-value="fieldVal(item.extra.id)"
                      mode="string"
                      class="adp-fs-input"
                      :placeholder="item.extra.placeholder"
                      @update:model-value="setFieldVal(item.extra!.id, String($event))"
                    />
                    <input
                      v-else
                      class="adp-fs-input"
                      :placeholder="item.extra.placeholder"
                      :value="fieldVal(item.extra.id)"
                      @change="setFieldVal(item.extra!.id, ($event.target as HTMLInputElement).value)"
                    />
                  </template>
                  <span v-else>{{ item.extra.money ? fieldMoneyText(item.extra.id) : (fieldVal(item.extra.id) || '-') }}</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 현장 체크리스트 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('checklist')">
            <h2>현장 체크리스트</h2>
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

        <!-- 1-1. 현장사진 -->
        <section class="adp-card">
          <header class="adp-card-head" @click="toggleSection('photo')">
            <h2>현장사진</h2>
            <img :src="chevronDownIcon" :class="['adp-chev', { up: isCollapsed('photo') }]" alt="" />
          </header>
          <div v-if="!isCollapsed('photo')">
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
            <p v-else class="adp-empty">아직 등록된 현장사진이 없습니다.</p>
          </div>
        </section>

      </template>
    </div>

    <AppMobileBottomNav active="watchlist" />

    <DateWheelPicker
      v-model="mktDealYmValue"
      month-only
      :open="mktDealYmOpen"
      @close="mktDealYmOpen = false"
    />

    <DateWheelPicker
      v-model="mktYmValue"
      month-only
      :open="mktYmOpen"
      @close="mktYmOpen = false"
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
        @click.self="closeLightbox"
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
  min-height: 100vh; background: #f3f4f6;
  padding-bottom: 76px;
}

/* 스크롤해도 고정 — 페이지 본문(.adp-body)이 이 아래로 지나간다.
   z-index는 표 안의 드롭다운(50)보다 위, 하단 내비(200)·라이트박스(1000)보다 아래. */
.adp-sticky-head {
  position: sticky; top: 0; z-index: 60;
  background: #fff;
  box-shadow: 0 2px 6px rgba(17, 24, 39, 0.06);
}

.adp-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 4px 0;
  background: #fff;
}
.adp-back {
  width: 32px; height: 32px;
  border: none; background: transparent; cursor: pointer;
  font-size: 24px; color: #111827; line-height: 1; padding: 0;
}
.adp-page-title { flex: 1 1 auto; margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.adp-spacer { width: 32px; }

.adp-tabs {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.adp-tab {
  /* '손품+현장조사'는 두 줄로 접힌다 — U+200B가 '+' 뒤에만 줄바꿈 지점을 만든다 */
  overflow: hidden; word-break: keep-all; line-height: 1.25;
  border: none; background: transparent; padding: 10px 0;
  font-size: 16px; font-weight: 700; color: #9ca3af;
  cursor: pointer;
  border-bottom: 2.5px solid transparent;
  min-width: 0;
  letter-spacing: -0.8px;
  text-align: center;
}
.adp-tab.active { color: #111827; border-bottom-color: #111827; }
/* 입지정보 카드 안의 소분류 (인근역세권·교육환경·주변환경) */
.adp-area-block + .adp-area-block { margin-top: 10px; padding-top: 8px; border-top: 1px solid #eef1f6; }
.adp-area-head { padding: 10px 0 6px; }
.adp-area-block h3 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }
/* '손품+현장조사'가 가장 길다 — 좁은 화면에서 잘리지 않게 글자를 줄인다 */
@media (max-width: 360px) {
  .adp-tab { font-size: 14px; }
}

.adp-prop-head {
  background: #f1f3f7; padding: 10px 4px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 4px 8px;
  position: relative;
}
.adp-prop-kind {
  background: #e0eaff; color: #2b6df3;
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 12px; font-weight: 800;
  grid-row: 1 / span 2;
}
.adp-prop-line {
  grid-column: 2; grid-row: 1; min-width: 0;
  display: flex; align-items: baseline; gap: 8px; justify-content: space-between;
}
.adp-prop-case { font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adp-prop-sale { font-size: 12px; font-weight: 700; color: #2b6df3; white-space: nowrap; }
/* 주소는 둘째 줄 — 오른쪽 PDF 버튼과 같은 줄에 놓는다 */
.adp-prop-addr {
  grid-column: 2; min-width: 0; margin: 0; font-size: 10.5px; font-weight: 500; color: #111827; line-height: 1.35;
  white-space: nowrap; letter-spacing: -0.4px; overflow: hidden; text-overflow: ellipsis;
}
.adp-pdf-btn {
  grid-column: 3; grid-row: 1; justify-self: end; align-self: center;
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid #c7d7f7; border-radius: 8px;
  background: #fff; color: #2b6df3;
  padding: 4px 7px; font-size: 10.5px; font-weight: 700;
  white-space: nowrap; cursor: pointer;
}
.adp-pdf-btn img { width: 11px; height: 11px; object-fit: contain; }
.adp-pdf-btn:active { background: #f2f6ff; }
.adp-fold-all {
  grid-column: 3; grid-row: 2; justify-self: end; align-self: center;
  border: 1px solid #e3e8f0; background: #fff; border-radius: 8px;
  width: 34px; height: 26px; padding: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.adp-fold-all:active { background: #f2f6ff; }
.adp-fold-all .adp-chev { width: 16px; height: 16px; }
.adp-prop-road { display: block; font-size: 11.5px; color: #6b7280; margin-top: 2px; }

.adp-body { flex: 1 1 auto; padding: 8px 3px 12px; display: flex; flex-direction: column; gap: 10px; }

/* 내용이 카드 좌우 끝에 붙지 않게 여백을 준다 */
.adp-card { background: #fff; padding: 0 4px; }
/* ===== 물건 기본정보 카드 ===== */

.adp-base-rows { margin: 0; }
.adp-base-row {
  /* minmax(0,1fr) — 값이 길어도 칸 안에서 줄바꿈되게(1fr 단독이면 min-content 아래로 안 줄어듦) */
  display: grid; grid-template-columns: 84px minmax(0, 1fr);
  align-items: center; gap: 8px;
  padding: 11px 0;
  border-bottom: 1px solid #f1f3f7;
  min-height: 44px;
}
.adp-base-rows > .adp-base-row:last-child { border-bottom: 0; }
.adp-base-row dt { margin: 0; font-size: 13.5px; color: #6b7280; font-weight: 600; }
.adp-base-row dd {
  margin: 0; min-width: 0;
  font-size: 14px; color: #111827; font-weight: 600;
  text-align: right; line-height: 1.45; word-break: break-word;
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

.adp-base-note { margin: 6px 0 2px; font-size: 12px; color: #9ca3af; line-height: 1.55; }
.adp-base-note.pre { white-space: pre-line; color: #6b7280; }

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
.adp-base-row .quad-v.stack span { display: block; font-size: 12.5px; white-space: nowrap; }

.adp-base-warn {
  margin: 12px 0 0; padding: 12px 14px;
  background: #fef2f2; border-radius: 10px;
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

.adp-card-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 10px; cursor: pointer; }
.adp-card-head h2 { margin: 0; font-size: 18px; font-weight: 800; color: #111827; }
.adp-chev { width: 22px; height: 22px; object-fit: contain; transition: transform 0.2s; }
.adp-chev.up { transform: rotate(180deg); }

.adp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; border-top: 1px solid #111827; }
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
  border-radius: 10px; background: #f9fafb;
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
  position: absolute; top: 16px; right: 16px;
  width: 40px; height: 40px; border-radius: 50%;
  border: none; background: rgba(255, 255, 255, 0.15); color: #fff;
  font-size: 24px; line-height: 1; cursor: pointer;
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
  border: 1px solid #e5e7eb; background: #fff; color: #2b6df3;
  width: 32px; height: 28px; border-radius: 6px;
  font-size: 14px; font-weight: 800; cursor: pointer;
  margin-right: 6px;
}
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

.adp-profit-head { gap: 8px; }
.adp-pill-blue { background: #e0eaff; color: #2b6df3; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; }
.adp-edit-btn { background: #2b6df3; color: #fff; border: none; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
.adp-edit-btn.save { background: #16a34a; }
.adp-cell-input {
  width: 100%; max-width: 110px;
  border: 1px solid #cbd5e1; border-radius: 4px;
  padding: 4px 6px; font-size: 12px; text-align: right;
  background: #fff; color: #111827; outline: none;
}
.adp-cell-input.sm { max-width: 64px; }
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
.adp-profit-table .neg { color: #dc2626; }
.adp-profit-table .adp-formula { font-size: 11px; color: #94a3b8; font-weight: 500; }
.adp-profit-table.v2 td.emph { background: #fff9e6; border: 2px solid #ef4444; }
.adp-profit-table.v2 td { font-size: 12.5px; }

.adp-tax-ref thead th { background: #1f3a72; color: #fff; }
.adp-tax-ref tbody tr:nth-child(even) td:last-child { background: #fffbe6; }
.adp-tax-ref td:last-child { color: #374151; font-weight: 600; }

.adp-mini-summary .adp-table { border-top: none; }
.adp-mini-summary th { background: #f3f4f6; width: 70px; }

.adp-empty { margin: 12px 4px; padding: 24px 12px; text-align: center; color: #9ca3af; font-size: 12.5px; background: #fafafa; border: 1px dashed #e5e7eb; border-radius: 10px; }
.adp-empty.sm { padding: 12px 8px; font-size: 11.5px; margin: 6px 0; }

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
  font-size: 10.5px; font-weight: 800; padding: 9px 4px; text-align: center;
  word-break: keep-all;
}
.adp-ruser-cell { padding: 8px 4px; vertical-align: middle; font-size: 11px; word-break: keep-all; }
.adp-ruser-cell.center { text-align: center; font-weight: 700; }
/* .adp-table td 의 vertical-align: top 을 덮어 세로 가운데 정렬 */
.adp-ruser-table td.vmid { vertical-align: middle; }
.adp-ruser-sum { display: block; font-size: 15px; font-weight: 800; color: #1d4ed8; line-height: 1.2; }
.adp-ruser-line { line-height: 1.5; }
.adp-ruser-line + .adp-ruser-line { margin-top: 6px; }
/* '전용 18~25평'이 가장 길다 — 캐럿까지 칸 안에 들어오도록 */
.adp-ruser-select { padding: 6px 4px; font-size: 10.5px; gap: 2px; min-height: 46px; }
/* '18~25평'처럼 긴 값은 두 줄로 접어 보여 준다 */
.adp-ruser-select > span:first-child {
  flex: 1 1 auto; min-width: 0; white-space: normal; word-break: keep-all;
  line-height: 1.25; text-align: center;
}
.adp-ruser-select .adp-rcase-caret { flex: none; }
.adp-ruser-list { min-width: 190px; }
/* 입지조건 한 줄 + 등수 입력 */
.adp-ruser-cond-row { display: flex; align-items: center; gap: 4px; }
.adp-ruser-cond-row + .adp-ruser-cond-row { margin-top: 6px; }
.adp-ruser-cond-name { flex: 1 1 auto; min-width: 0; font-weight: 700; color: #111827; font-size: 11px; white-space: nowrap; }
.adp-ruser-rank {
  flex: 0 0 28px; width: 28px; box-sizing: border-box; min-width: 0;
  border: 1px solid #d1d5db; border-radius: 6px;
  padding: 4px 2px; font-size: 10.5px; text-align: center;
  color: #111827; font-family: inherit; background: #fff;
}

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
/* 한 항목을 두 줄로 쓸 때 줄 사이 간격 */
.adp-rdoc-survey + .adp-rdoc-survey { margin-top: 4px; }
/* 현황조사서·세대열람·문건송달 행 — 세 칸을 정확히 3등분해 행마다 같은 자리에 오게 한다.
   (flex는 칸 종류에 따라 폭이 조금씩 달라져 그리드로 고정한다) */
.adp-rdoc-survey {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center; gap: 4px;
}
.adp-rdoc-survey > * { min-width: 0; }
.adp-rdoc-survey .adp-rdoc-input {
  width: 100%; height: 30px; padding: 0 6px; font-size: 10.5px;
  display: flex; align-items: center; line-height: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* input은 flex 정렬이 통하지 않아 줄 높이로 가운데를 맞춘다 */
.adp-rdoc-survey input.adp-rdoc-input { display: block; line-height: 28px; }
.adp-rdoc-survey .adp-date-btn > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-rdoc-survey .adp-date-caret { flex: 0 0 auto; }
/* 확인 문구는 앞 두 칸을 차지해 비고가 정확히 세 번째 자리에 온다 */
.adp-rdoc-task.inline { grid-column: span 2; min-width: 0; align-self: center; }
.adp-rdoc-input:focus { border-color: #2b6df3; outline: none; }
/* 편집 중이 아닐 때는 입력칸을 눌러도 바뀌지 않게 하고 테두리만 옅게 둔다 */
.adp-rdoc-multi { min-width: 0; }
.adp-rdoc-multi .adp-agency-trigger { width: 100%; font-size: 10.5px; }
/* 화살표를 옆 날짜칸과 같은 크기로 */
.adp-rdoc-multi .adp-agency-trigger .caret { font-size: 15px; color: #6b7280; line-height: 1; }
.adp-rdoc-table .adp-rcheck-desc { vertical-align: top; }
/* 권리 케이스 표는 분홍, 서류 확인 표는 파랑으로 구분 */
.adp-rdoc-table .adp-rcheck-label { background: #e3edfb; }

.adp-rcase-dd { position: relative; }
.adp-rcase-select {
  width: 100%; box-sizing: border-box;
  border: 1px solid #d1d5db; border-radius: 8px;
  padding: 9px 10px; font-size: 12.5px; font-weight: 700; color: #111827;
  background: #fff; cursor: pointer; text-align: left;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.adp-rcase-caret { color: #6b7280; font-size: 15px; line-height: 1; }
/* 목록 밖을 눌러 닫기 위한 투명 레이어 */
.adp-rcase-backdrop { position: fixed; inset: 0; z-index: 40; }
.adp-rcase-list {
  position: absolute; z-index: 41; left: 0; right: 0; top: calc(100% + 4px);
  margin: 0; padding: 4px 0; list-style: none;
  background: #fff; border: 1px solid #d1d5db; border-radius: 10px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.16);
  max-height: 320px; overflow: auto;
}
.adp-rcase-item {
  padding: 9px 12px; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px;
}
.adp-rcase-item + .adp-rcase-item { border-top: 1px solid #f1f5f9; }
.adp-rcase-item strong { font-size: 12.5px; font-weight: 800; color: #111827; }
.adp-rcase-item small { font-size: 11px; color: #9ca3af; line-height: 1.45; }
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
.adp-rcheck-label { background: #fde7e7; text-align: center; color: #111827; font-weight: 700; }
.adp-rcheck-label strong { font-size: 12px; }
.adp-rcheck-desc { color: #4b5563; white-space: pre-line; }
.adp-rcheck-cell { text-align: center; }
.adp-rcheck-box {
  width: 22px; height: 22px; cursor: pointer;
  accent-color: #dc2626;
}

/* 손품조사 */
.adp-survey-head { gap: 8px; }
.adp-survey-head h2 { flex: 1 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 4px; }
/* 제목 옆 안내문구가 길면 다음 줄로 내린다 */
.adp-survey-head h2.adp-head-wrap { flex-wrap: wrap; row-gap: 2px; }
.adp-survey-note-inline.below { flex: 0 0 100%; margin-left: 0; }
.adp-survey-head .adp-edit-btn { flex: 0 0 auto; }
.adp-survey-head .adp-chev { flex: 0 0 auto; }
.adp-survey-head h2 .q { font-size: 11px; color: #9ca3af; border: 1px solid #d1d5db; border-radius: 50%; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
.adp-survey-note-inline { font-size: 11px; color: #2b6df3; font-weight: 500; margin-left: 6px; }
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
/* 손품결론 — 큰 묶음 제목과 그 아래 설명 한 줄 */
.adp-conc-title { font-size: 16.5px; }
.adp-conc-sub { margin: 0 0 4px; padding: 0 2px; font-size: 12.5px; color: #6b7280; font-weight: 600; }
.adp-conc-row { display: flex; align-items: center; gap: 8px; padding: 8px 0 4px; }
.adp-conc-label { flex: 0 0 auto; font-size: 13px; font-weight: 700; color: #374151; white-space: nowrap; }
.adp-conc-row .adp-fs-input { flex: 1 1 auto; height: 34px; }

/* 시세조사 및 급매가 조사 — 가로 스크롤 되는 표 3개 */
/* 개별성 분석 표 — 상세구분 / 현황 / 가격율 세 칸 */
.adp-ind-body { padding: 4px 0 14px; }
.adp-ind-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.adp-ind-table th, .adp-ind-table td {
  border: 1px solid #e5e7eb; padding: 7px 6px; font-size: 13px; color: #111827;
  text-align: center; vertical-align: middle; word-break: keep-all;
}
/* 그룹 머리줄 (구역내 / 단지내 개별성) */
.adp-ind-group th {
  background: #eef2f7; font-weight: 800; font-size: 12.5px; text-align: left;
  letter-spacing: -0.2px; padding: 7px 8px;
}
.adp-ind-label { background: #fafbfc; font-weight: 700; font-size: 12.5px; line-height: 1.25; }
.adp-ind-ctl .row { display: flex; align-items: center; justify-content: center; gap: 4px; }
.adp-ind-ctl .row strong { font-size: 13.5px; font-weight: 800; }
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
.adp-ind-years { flex: 0 0 auto; font-size: 12px; font-weight: 800; color: #2b6df3; white-space: nowrap; }
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
.adp-ind-table tfoot .adp-ind-ctl strong.hi { color: #2b6df3; font-size: 12.5px; }
.adp-ind-ctl .row .sign { flex: 0 0 auto; font-size: 10px; color: #6b7280; font-weight: 700; }

.adp-mkt-body { padding: 4px 0 14px; }
.adp-mkt-body > .adp-sub-block:first-child { border-top: none; margin-top: 0; padding-top: 0; }
/* 시세조사 본문 — 표 대신 항목별 카드로 쪼개 가로 스크롤을 없앴다 */
.adp-mkt-block { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px 10px; background: #fff; }
.adp-mkt-block + .adp-mkt-block { margin-top: 8px; }
.adp-mkt-block-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; }
.adp-mkt-block-head .t { font-size: 14.5px; font-weight: 800; color: #111827; }
.adp-mkt-block-head small { font-size: 11px; color: #2b6df3; font-weight: 500; }
/* 테두리 없이 쓸 때도 블록 안 제목과 같은 들여쓰기를 준다 */
.adp-mkt-block-head.bare { padding: 0 10px; }
.adp-mkt-cells { display: grid; gap: 6px; }
/* 한 블록에 줄이 두 개일 때 위아래 줄 사이를 띄운다 */
.adp-mkt-cells + .adp-mkt-cells { margin-top: 10px; }
.adp-mkt-cells.c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.adp-mkt-cells.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
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
.adp-sum-input.wide { width: 120px; }
.adp-sum-input:focus { outline: none; border-color: #2b6df3; }
.adp-mkt-unit-btn {
  margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid #c7d7f7; background: #fff; color: #2b6df3;
  border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 800; cursor: pointer;
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
.adp-mkt-cells .cell small { font-size: 11.5px; color: #6b7280; font-weight: 700; text-align: center; line-height: 1.2; }
.adp-mkt-cells .cell strong { font-size: 14px; font-weight: 800; color: #111827; }
.adp-mkt-cells .cell strong.hi { color: #111827; }
.adp-mkt-cells .cell .adp-mkt-input { text-align: center; height: 26px; }
.adp-mkt-rate { display: inline-flex; align-items: center; gap: 1px; }
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
.adp-mkt-table td.calc { background: #fafbfc; color: #6b7280; }
.adp-mkt-table td strong.hi { color: #2b6df3; font-weight: 800; }
.adp-mkt-input {
  width: 100%; min-width: 54px; border: 1px solid #e3e8f0; border-radius: 5px;
  padding: 4px 5px; font-size: 12.5px; text-align: right; color: #111827; background: #fff;
}
.adp-mkt-input:focus { outline: none; border-color: #2b6df3; }
.adp-mkt-stack { display: flex; flex-direction: column; gap: 1px; }
.adp-mkt-stack em { font-style: normal; }
.adp-mkt-addrow {
  flex: 0 0 auto; border: 1px solid #d5dbe6; background: #fff; color: #4b5563;
  border-radius: 6px; padding: 3px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
}
/* 부동산 정보 — 업체 1곳 = 두 줄 */
.adp-agency-list { display: flex; flex-direction: column; gap: 8px; }
.adp-agency-item { background: #f3f6fc; border: 1px solid #e0eaff; border-radius: 10px; padding: 8px 12px 10px; }
.adp-agency-line { display: flex; align-items: flex-end; gap: 6px; }
.adp-agency-line + .adp-agency-line { margin-top: 6px; padding-top: 6px; border-top: 1px solid #e3ecff; }
.adp-agency-fld { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1px; text-align: left; }
.adp-agency-fld small { font-size: 11.5px; color: #9ca3af; font-weight: 600; }
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
/* 첨부 아래 비고는 눈에 띄게 — 적은 글씨는 빨간 굵은 글씨, 안내문구는 그대로 회색 */
.adp-plan-row + .adp-photo-note .adp-fs-input,
.adp-plan-preview + .adp-photo-note .adp-fs-input { color: #e0574a; font-weight: 800; }
.adp-plan-row + .adp-photo-note .adp-fs-input::placeholder,
.adp-plan-preview + .adp-photo-note .adp-fs-input::placeholder { color: #9ca3af; font-weight: 400; }
/* 현장조사 항목 줄 */
.adp-fs-section { padding-top: 10px; margin-top: 10px; border-top: 1px solid #eef1f6; }
.adp-fs-title { font-size: 14px; font-weight: 800; color: #111827; margin-bottom: 6px; }
.adp-fs-row {
  display: grid; grid-template-columns: 74px minmax(0, 1fr) 132px;
  align-items: center; gap: 5px; padding: 5px 0;
}
.adp-fs-row .lbl { font-size: 13px; color: #6b7280; font-weight: 600; }
.adp-fs-row .ctl, .adp-fs-row .ext { min-width: 0; font-size: 13px; font-weight: 700; color: #111827; text-align: right; }
/* 옆칸이 없는 항목(기타·수리상태 등)은 남은 폭을 모두 쓴다 */
.adp-fs-row .ctl.wide { grid-column: 2 / -1; }
.adp-fs-input {
  width: 100%; min-width: 0; height: 28px; border: 1px solid #e3e8f0; border-radius: 6px;
  padding: 0 6px; font-size: 12.5px; color: #111827; background: #fff;
}
.adp-fs-input:focus { outline: none; border-color: #2b6df3; }
.adp-fs-unit { display: flex; align-items: center; justify-content: flex-end; gap: 3px; width: 100%; }
.adp-fs-unit .adp-fs-input { flex: 1 1 auto; min-width: 0; }
/* 선택 버튼은 줄바꿈 없이 한 줄에 둔다 */
.adp-fs-toggles { display: flex; flex-wrap: nowrap; gap: 4px; justify-content: flex-end; min-width: 0; }
.adp-fs-toggles .adp-toggle-btn {
  padding: 5px 7px; font-size: 10.5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.adp-fs-multi { flex: 1 1 auto; min-width: 0; }
.adp-fs-multi .adp-agency-trigger { height: 28px; }
.adp-agency-multi { position: relative; }
.adp-agency-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 3px;
  width: 100%; cursor: pointer; font-size: 11.5px;
}
.adp-agency-trigger .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-agency-trigger .txt.ph { color: #9ca3af; }
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
.adp-survey-body { padding: 4px 12px 14px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid #f1f5f9; }
.adp-survey-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
.adp-survey-block-head { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: #2b6df3; margin-bottom: 6px; }
.adp-survey-block-head .i { width: 16px; height: 16px; border-radius: 50%; background: #e0eaff; color: #2b6df3; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; }
.adp-survey-note { margin: 0; font-size: 12px; color: #6b7280; }
.adp-survey-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.adp-survey-row.sub { padding: 6px 0; border-bottom-color: #f9fafb; }
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
  padding: 8px 10px; font-size: 12px; background: #fff; color: #111827; outline: none;
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
.adp-multi-placeholder { font-size: 12px; color: #9ca3af; }
.adp-multi-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 999px; background: #f3f4f6;
  font-size: 11.5px; font-weight: 700; color: #374151;
}
.adp-multi-chip em { font-style: normal; color: #9ca3af; font-size: 12px; }
.adp-multi-caret {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-size: 14px; line-height: 1; color: #6b7280;
}
.adp-multi-view { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.adp-multi-panel {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px);
  z-index: 30;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
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
.adp-survey-subblock { background: #f3f6fc; border: 1px solid #e0eaff; border-radius: 10px; padding: 10px 12px; }
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

.adp-loc-row1 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 8px; background: #f3f4f6; border-radius: 10px; }
.adp-loc-row1 .cell { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.adp-loc-row1 .cell small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adp-loc-row1 .cell strong { font-size: 12px; color: #111827; font-weight: 700; }
.adp-loc-row1 .cell .adp-survey-input { width: 100%; min-width: 0; padding: 6px 8px; font-size: 11.5px; }
.adp-loc-grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.adp-loc-grade .g-cell { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.adp-loc-grade .g-cell small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adp-loc-grade .g-cell strong { font-size: 18px; font-weight: 900; color: #111827; line-height: 1; }
.adp-loc-grade .g-cell strong em { font-size: 11px; font-style: normal; color: #6b7280; margin-left: 2px; }
.adp-info-banner { background: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 10px 12px; font-size: 11.5px; color: #1e40af; line-height: 1.5; }
.adp-info-banner strong { color: #2b6df3; }
.adp-loc-icon-row { display: flex; flex-direction: column; gap: 6px; }
.adp-loc-icon-row .ir { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; }
.adp-loc-icon-row .ir .ic { font-size: 14px; }
.adp-loc-icon-row .ir .lbl { color: #6b7280; min-width: 50px; }

.adp-deal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 12px 14px; }
.adp-deal-grid .cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; background: #eff6ff; border-radius: 10px;
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
  background: #f3f4f6; border-radius: 10px; padding: 10px 6px;
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
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
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
  background: #f3f4f6; border-radius: 10px;
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
  padding: 7px 6px; font-size: 12px; font-weight: 700; color: #fff; cursor: pointer;
  opacity: 0.55; transition: opacity 0.15s;
}
.adp-trade-tab.active { opacity: 1; }
.adp-trade-tab.t-all { background: #38bdf8; }
.adp-trade-tab.t-buy { background: #2b6df3; }
.adp-trade-tab.t-jeon { background: #22c55e; }
.adp-trade-tab.t-wol { background: #f97316; }
.adp-trade-refresh {
  flex: 0 0 auto; width: 38px; height: 32px;
  border: 1px solid #e5e7eb; background: #fff; border-radius: 6px;
  font-size: 16px; color: #2b6df3; cursor: pointer;
}

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
.adp-trade-sum-card {
  background: #f3f6fc; border: 1px solid #e0eaff;
  border-radius: 10px; padding: 10px 12px;
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
.adp-pub-addr { display: flex; align-items: center; gap: 3px; }
.adp-pub-addr > span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-pub-row { flex-wrap: nowrap; }
.adp-pub-cell.narrow { flex: 1 1 0; min-width: 0; }
.adp-pub-cell.narrow .adp-pub-input { min-width: 0; padding: 5px 2px; font-size: 10.5px; }
.adp-pub-date { cursor: pointer; text-align: center; }
.adp-pub-months { display: inline-flex; flex: 0 0 auto; gap: 3px; margin-left: 4px; align-self: flex-end; }
.adp-pub-month-btn {
  border: 1px solid #d5dbe6; background: #fff; color: #4b5563; white-space: nowrap;
  border-radius: 999px; padding: 4px 6px; font-size: 10px; font-weight: 700; cursor: pointer;
}
.adp-pub-month-btn.on { border-color: #2b6df3; background: #eaf1ff; color: #2b6df3; }
.adp-trade-meta-title { font-size: 11.5px; font-weight: 800; color: #111827; white-space: nowrap; }
.adp-trade-sum-card small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adp-trade-sum-card strong { font-size: 15px; font-weight: 800; color: #111827; }

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
  background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 10px; margin: 6px 0 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.adp-pub-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center; }
.adp-pub-cell {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: #374151; font-weight: 600;
}
.adp-pub-cell.wide { grid-column: 1 / 2; }
.adp-pub-cell > span { flex: 0 0 auto; min-width: 50px; }
.adp-pub-input {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid #e5e7eb; border-radius: 999px;
  padding: 6px 10px; font-size: 12px; color: #111827;
  background: #fff; outline: none;
}
.adp-pub-input.small { flex: 0 0 auto; width: 84px; max-width: 84px; }
.adp-pub-cell.wide > .adp-pub-tilde { padding: 0 6px; }
.adp-pub-cell.wide { justify-content: flex-start; }
/* 시작일·종료일·기간 버튼은 한 줄에 */
.adp-pub-row.dates { display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; }
.adp-pub-row.dates .adp-pub-cell { flex: 1 1 0; min-width: 0; gap: 3px; }
.adp-pub-row.dates .adp-pub-cell > span { min-width: 0; font-size: 10.5px; }
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
.adp-pub-table { table-layout: fixed; }
.adp-pub-table th, .adp-pub-table td { font-size: 11px; padding: 8px 4px; vertical-align: middle; }
.adp-pub-th { position: relative; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.adp-pub-th > span { white-space: nowrap; }
.adp-pub-th-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 8px; color: #9ca3af; padding: 1px 3px;
}
.adp-pub-th-btn.active { color: #2b6df3; }
.adp-pub-dd {
  position: absolute; top: 100%; left: 0;
  z-index: 50;
  list-style: none; margin: 4px 0 0; padding: 0;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  width: 100%; min-width: 200px; max-width: 90vw; max-height: 280px;
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
