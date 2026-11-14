// 웹이 앱과 함께 쓰는 로직 — 앱의 src/ 를 고치지 않고 그대로 가져다 한 파일(site/pdfparse.js)로 묶는다.
// 페이지에서는 window.TAPdf.<함수> 로 부른다. 앱 쪽 로직이 바뀌면 node web/build.mjs 만 다시 돌리면 된다.

// pdf.js 를 별도 워커 파일 없이 페이지 안(메인 스레드)에서 돌린다 — 한 장짜리 페이지라 워커 파일을 따로 두지 않는다
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
globalThis.pdfjsWorker = pdfjsWorker;

// PDF 읽기 — 앱 선정물건등록(PdfImportPage)과 같은 규칙
export { parsePdfBytes, parseAuctionPdfText, buildLineText } from '../../src/services/pdfAuctionImport';
// 구글드라이브 폴더 읽기 — claude.ai 바깥(우리 주소)에서 열렸을 때 앱과 같은 워커로 읽는다
export { listDrivePdfFiles, parseDrivePdfFile, downloadDrivePdfBytes } from '../../src/services/pdfAuctionImport';
// AI 자동 파싱 — 앱과 같은 Gemini 키 보관 · 키 확인 · 빈칸 채우기 (키는 로그인 계정마다 userPrefs/{uid}.geminiKey)
export {
  getGeminiKey, setGeminiKey, clearGeminiKey, isGeminiOn, setGeminiOn, loadGeminiPrefs, testGeminiKey, fillWithGemini, AI_FIELD_LABELS,
} from '../../src/services/geminiPdf';
// 계정 설정(userPrefs) — 물건등록 폴더 즐겨찾기 · 고른 폴더(앱과 같은 칸) · 마지막 결과 목록(webImportList)
export { loadUserPrefs, saveUserPrefs } from '../../src/services/userPrefsRepository';
// 기일내역에서 이번 회차 고르기
export { pickCurrentRound } from '../../src/utils/auctionSchedule';
// 수익분석에서 확정한 입찰안 — 목록 카드의 입찰가 · 매도가가 이 안의 값을 쓴다
export { withConfirmedPlan, confirmedPlanOf, confirmedMarkOf } from '../../src/services/confirmedPlan';
// 주소 → 지번 · 건물명 · 동층호 토막
export { addressParts, addressWithName, hasBuildingName } from '../../src/utils/addressName';
// 물건 종류 이름·배지 글자
export { propTypeName, propTypeMark } from '../../src/utils/propertyType';
// 수익 셈(세율 구간 · 누진공제 · 세후 순이익) — 입찰가산정과 같은 셈
export { taxChainOf, taxRateOf, taxDeductOf, incomeTaxOf, localTaxOf, afterTaxProfitOf, planSummaryOf } from '../../src/services/profitMath';
// 약관 글 — 바닥 링크 · 고객센터의 이용약관 · 개인정보처리방침 · 환불정책 창이 앱과 같은 글을 쓴다
export { TERMS_CHAPTERS, TERMS_EFFECTIVE, PRIVACY_SECTIONS, PRIVACY_OFFICER, PRIVACY_CHILD, PRIVACY_EFFECTIVE } from '../../src/services/legalTerms';
/* 약관 · 정책 창 글 — 대문(intro.html)과 웹이 같이 쓴다 */
export { legalDoc } from '../../src/services/legalDocs';
export { startContentSync } from '../../src/services/contentRepository';   /* FAQ · 약관 DB 판 — 껍데기가 켜 둔다 */
export { POINT_CAUTIONS } from '../../src/services/pointPolicy';
export { rightsCheckText } from '../../src/services/rightsCheckText';   /* 권리분석 주의 항목 글 — 앱 RightsPanel 과 같게 */
// 새 공지 · 이벤트 · 업데이트가 있는지(앱 공지 탭의 빨간 점과 같은 셈) — 머리띠 '공지' 옆 점
export { useBoardNew, useBoardFeed } from '../../src/services/boardFeed';   /* useBoardFeed — 웹 홈 공지사항 */

// === 앱 자료 연결 — 앱이 쓰는 로그인·물건 저장소(Pinia)를 그대로 쓴다 ===
// 웹(/web)은 앱과 같은 주소라, 같은 브라우저에서 앱에 로그인해 두었으면 그 로그인이 그대로 이어진다.
import { createPinia, setActivePinia } from 'pinia';
export { watch } from 'vue';
export { useAuthStore } from '../../src/stores/authStore';
export { useAuctionStore } from '../../src/stores/auctionStore';
export { isAllowedEmail, isAdminEmail } from '../../src/services/accessControl';
/* 집 PC 수집 도우미(관리자만) — 시장분석 › 경매사례에서 명령 · 상태 · 모은 매각물건 */
export {
  sendAgentCommand, sendAgentStop, agentHeartbeat, watchAgentStatus, watchAgentDatasetMeta, watchAgentCoverage, watchAgentQueue, saveAgentQueue, loadAgentDataset, agentOnline, migrateLegacyAgentData, saveSaleDataset,
} from '../../src/services/agentRemote';
/* 경매사례 — 엑셀 불러오기 · 백업 · 엑셀다운로드(PC 프로그램과 같은 양식). exceljs 는 단추를 누를 때 /vendor/ 에서 불러온다 */
export { readWorkbook as readSaleWorkbook, exportNear as exportSaleNear, exportData as exportSaleData } from '../../src/services/saleExcel';
export { mergeRecords as mergeSaleRecords, prepare as prepareSaleRows, normalizeRecords as normalizeSaleRecords } from '../../src/services/saleAnalysis';
export { updateStamp, UPDATE_PREFIX } from '../../src/services/updateStamp';
export { agoText } from '../../src/utils/agoText';   /* '방금 · ○분 전' — 웹 물건상세 저장 표시 */
export { editLogTag, editLogDesc } from '../../src/services/editLogText';
export { userMessage, aiErrorText } from '../../src/services/userMessage';   /* 화면 오류 문장 — 오류 원문(영어 · 코드)은 내보내지 않는다(앱과 같은 모듈) */   /* 최근 분석 · 최근 작성 한 줄 — 꼬리표 칩 · 설명(마이페이지와 같은 글) */
/* 주소 → 공동주택 공시가격 — 웹 물건현황(PDF에 금액이 없을 때). 손품조사 시세분석과 같은 조회 */
export { lookupAddress } from '../../src/services/addressLookup';
/* 단지명 · 총 주차수 · 내 평형 — 물건정보 단지정보 · 건축물정보에서 PDF 칸이 비었을 때(앱과 같은 규칙) */
export { complexNameOf, totalParkingOf } from '../../src/services/aptComplex';
/* 아파트 평형별 세대수 · 공급면적, 내 호실 공급면적 — 정보요약 · 단지정보 · 건축물정보(앱과 같은 모듈) */
export { getComplexAreas, myGroupOf, supplyRowsOf, areaUnitsOf } from '../../src/services/complexAreas';
/* 시도 · 시군구 표(법정동 코드) · 시군구의 동 이름(최근 실거래) — 경매사례 지역 고르기 · 도우미 동 추가 */
export { SIDO_NAMES, districtsOf, REGION_GROUPS } from '../../src/services/regionCodes';
export { resolveRegionFromAddress } from '../../src/services/regionResolver';   /* 주소 → 시군구 코드(손품조사 경매사례 탭이 물건 주소로 지역을 고른다) */
/* 건물 연차(햇수식 N년차) — 앱과 같은 셈 */
export { buildingAgeOf, buildingAgeText } from '../../src/utils/buildingAge';
/* 화면에 보일 사건번호 — 휴지통에서 되살린 같은 사건은 '(1)' */
export { caseLabelOf } from '../../src/utils/caseLabel';
export { fetchDongTradeStats, fetchDongTradeDetails } from '../../src/services/publicDataApi';
/* 대문의 가벼운 로그인 창이 '로그인'을 누를 때 쓴다 — 로그인 유지 방식 · 카카오 설정 여부 */
export { setLoginPersistence } from '../../src/services/authRepository';
export { isKakaoLoginConfigured } from '../../src/services/socialAuth';
export { stageDates, bidStageOf, stageLabelOf, shownWonDate, shownBalanceDueDate } from '../../src/utils/stageLabel';
export { shownAddressOf, shownPlaceOf } from '../../src/utils/addressName';   /* 홈 일정 · 최근 분석 — 주소에 건물명 끼우기(앱과 같은 규칙) */
// 입찰 기일 전엔 낙찰 · 유찰 · 취소 · 매도를 못 고른다 — 앱과 같은 규칙
export { stageBeforeSaleError, BALANCE_DUE_DAYS } from '../../src/utils/auctionDates';   /* BALANCE_DUE_DAYS — 웹 홈 일정(잔금기한 = 낙찰일 + 45일) */
// 물건상세 정보요약·기본정보 — 앱 물건상세와 같은 셈
export {
  saleKindOf, headMetaLineOf, summarySeedOf, summaryAreaText, summaryApprovalAgeOf, summaryFloorPairOf, exclusiveAreaText,
  bidBaseValueOf, currentMinBidOf, depositAmountOf, bidRoundsOf, roundToneOf, currentRoundLabelOf, trunc2,
} from '../../src/services/detailSummary';
/** 앱 저장소를 쓸 수 있게 Pinia 를 한 번 켠다 */
import { setDraftCostDefaults } from '../../src/stores/auctionStore';
// 웹에서 새로 만드는 물건은 명도비 0원으로 시작한다 — 명도비는 낙찰관리 명도분석에서 계산해 세금분석에 넣는다(앱은 그대로 100만원)
export const startStores = () => { setActivePinia(createPinia()); setDraftCostDefaults({ evictionCost: 0 }); enableEditDetail(); };   /* enableEditDetail — 최근 분석에 고친 칸 이름까지(웹만) */
import { enableEditDetail } from '../../src/services/editFieldLabels';
// 물건상세 입지정보 — 앱 물건상세와 같은 셈 · 카카오 주변환경 조회(앱과 같은 함수)
export {
  eduInfoOf, eduInfoFiltered500mOf, nearbyDisplayOf, pdfNearbyDisplayOf, pdfNearbyFiltered500mOf,
  stationItems500mOf, naverMapUrl, stripDistanceFromName,
} from '../../src/services/locationInfo';
export { fetchNearbyEnvironment } from '../../src/services/kakaoNearby';
export { geocodeAddress } from '../../src/services/routeOptimizer';
/* 경매사례 지도 — 손품조사 시세분석과 같은 지도 · 거리 · 엘베(건축물대장) */
export { createMapView } from '../../src/services/mapView';
/* 지도 공통 — 고른 건물(필지) 테두리 · 읍면동 점선 경계(손품조사 지도들과 같게, 2026-11-11) */
export { parcelShapeOf, dongShapeOf } from '../../src/services/zoning';
export { distM, simCond, simDefText, SIM_STEPS } from '../../src/services/priceAnalysis';
export { getBuildingFacts } from '../../src/services/buildingFacts';
/* 경매사례 지도 오른쪽 도구 막대 — 손품조사 시세분석과 같은 KakaoMapTools(로드뷰 · 지적도 · 재기 · 주변 생활시설 …)를 웹 칸에 띄운다 */
import { reactive as vueReactive } from 'vue';
import KakaoMapTools from '../../src/components/KakaoMapTools.vue';
export const mountKakaoTools = (el, k, map, near) => {
  const st = vueReactive({ near: near || null });
  const app = createApp({ render: () => h(KakaoMapTools, { k, map, near: st.near }) });
  app.mount(el);
  return { setNear: (p) => { st.near = p || null; }, unmount: () => app.unmount() };
};
/* 필터 기본 부품 세트(SearchFilterBar) — 매매수요 · 시세분석과 같은 필터를 웹 매각분석 칸에 띄운다(2026-11-12 사용자).
   props 는 부품 그대로(draft · rangeOptions …), on.change(v) · on.reset() · on.save() 로 웹 쪽 값을 바꾼다. set(p) 로 값만 새로 넘긴다 */
import SearchFilterBar from '../../src/components/SearchFilterBar.vue';
export const mountSearchFilter = (el, props, on) => {
  const st = vueReactive({ ...props });
  const app = createApp({ render: () => h(SearchFilterBar, { ...st, 'onUpdate:draft': (v) => on.change(v), onApply: () => {}, onReset: () => on.reset(), onSave: () => on.save() }) });
  app.mount(el);
  return { set: (p) => { Object.assign(st, p); }, unmount: () => app.unmount() };
};
// 매각기일 요일 — 앱 일정 저장소의 weekdayLabel 그대로
export { weekdayLabel } from '../../src/stores/scheduleStore';

// === 앱 로그인 창 그대로 — 앱의 LoginPage.vue 를 웹 창 안에 띄운다 ===
import { createApp, h } from 'vue';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { getActivePinia } from 'pinia';
import LoginPage from '../../src/pages/LoginPage.vue';
import SignupPage from '../../src/pages/SignupPage.vue';
/** el 안에 앱 로그인 화면을 띄운다. 로그인이 끝나면(앱은 선정물건으로 넘어가는 자리) onDone('ok'), 회원가입은 onDone('signup').
 *  open 을 주면('findId' · 'findPw' · 'trial') 그 안내 창만 바로 연다 — 로그인 카드는 부르는 쪽이 감추고, 창을 닫으면 onDone('close') */
export const mountAppLogin = (el, onDone, open = '') => {
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: LoginPage }, { path: '/:rest(.*)*', component: Empty }],
  });
  router.afterEach((to) => {
    if (to.path === '/auctions/watchlist') onDone('ok');
    else if (to.path === '/signup') onDone('signup');
    else if (to.path === '/closed') onDone('close');
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  app.provide('webEmbed', true);   // 웹 — 회원가입은 작은 줄로, 창은 촘촘히
  void router.push(open ? { path: '/', query: { open } } : '/');
  app.mount(el);
  return () => app.unmount();
};
/** el 안에 앱 회원가입 화면을 띄운다(카드만). 가입이 끝나면 onDone('ok'), 닫기 · '로그인' 은 onDone('login') */
export const mountAppSignup = (el, onDone) => {
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: SignupPage }, { path: '/:rest(.*)*', component: Empty }],
  });
  router.afterEach((to) => {
    if (to.path === '/auctions/watchlist') onDone('ok');
    else if (to.path === '/login') onDone('login');
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  app.provide('webEmbed', true);
  void router.push('/');
  app.mount(el);
  return () => app.unmount();
};

// === 앱 물건상세 그대로 — 권리분석 · 손품+현장 · 가격정보 · 입찰가산정 탭을 앱 화면(AuctionDetailPage.vue)으로 띄운다 ===
// 앱 화면이 ?tab= 으로 연 탭을 그리므로, 웹 하위 탭을 바꾸면 그 탭으로 다시 연다. 저장도 앱 화면이 하던 그대로(앱 저장소).
import AuctionDetailPage from '../../src/pages/AuctionDetailPage.vue';
export const mountAppDetail = (el, id, tab) => {
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/auctions/:id', component: AuctionDetailPage, props: (route) => ({ mode: 'view', id: String(route.params.id) }) }, { path: '/:rest(.*)*', component: Empty }], // 앱 라우터와 같게 id 를 props 로
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  app.provide('webEmbed', true); /* 앱 화면이 웹에 떴음을 안다 — 웹만 다른 모양을 쓸 때 */
  void router.push({ path: `/auctions/${id}`, query: { tab } });
  app.mount(el);
  return () => app.unmount();
};

// === 앱 임장경로 그대로 — 웹 '임장경로' 탭에서 앱 화면(FieldTripPlannerPage.vue)을 띄운다 ===
// 앱 화면이 제 머리(제목·뒤로가기)와 아래 메뉴를 함께 그리므로, 웹에서는 그 둘을 CSS 로 감춘다.
// 저장·계산은 앱이 하던 그대로다(같은 Firestore · 같은 경로 저장소).
// 지도 모양 — 앱은 main.ts 에서 싣는다. 웹 묶음에는 main.ts 가 없어 여기서 함께 싣는다
// (안 실으면 타일이 겹쳐 쌓이고 확대 단추가 풀려 지도가 깨져 보인다)
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import FieldTripPlannerPage from '../../src/pages/FieldTripPlannerPage.vue';

// 앱 화면은 지도를 만들기만 하고 치우지 않는다(map.remove() 가 없다).
// 손전화에서는 화면이 통째로 사라지니 문제가 없지만, 웹은 같은 칸(id=trip-map)에
// 지도를 다시 띄우므로 Leaflet 이 '이미 쓰인 칸'이라며 멎는다
// (동선최적화 때 뜨던 '실도로 경로 실패: Map container is already initialized').
// 그래서 ① 만든 지도를 칸마다 기억해 두고 ② 같은 칸에 또 만들려 하면 그 지도를 돌려주며
// ③ 화면을 걷을 때 웹이 대신 치운다. 앱 쪽은 한 줄도 고치지 않는다.
const mapByEl = new WeakMap();
const makeMap = L.map.bind(L);
L.map = (target, options) => {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (el && mapByEl.has(el)) return mapByEl.get(el);
  const made = makeMap(target, options);
  const box = made.getContainer();
  if (box) mapByEl.set(box, made);
  return made;
};
/** 칸에 붙어 있는 지도를 치운다 — 표식까지 지워 다음 지도가 그 칸을 쓸 수 있게 한다 */
const dropMap = (el) => {
  if (!el) return;
  const made = mapByEl.get(el);
  mapByEl.delete(el);
  try { if (made) made.remove(); } catch (e) { /* 이미 치워졌다 */ }
  try { delete el._leaflet_id; } catch (e) { /* 그만 */ }
};
/** el 안에 앱 임장경로를 띄운다.
 *  onDetail(id, tab) — 줄의 '물건상세 보기'(🔍)가 앱 라우터로 /auctions/{id} 를 부른다.
 *  웹에 띄운 앱은 /field-trip 하나만 아는 메모리 라우터라 그대로 두면 빈 화면으로 떨어진다 —
 *  그 길을 막고 웹에게 넘겨 웹 물건상세를 열게 한다. */
// === 시장분석 · 낙찰가율분석 — 분석 도구 화면을 하위 탭마다 그대로 띄운다 ===
// 계산·저장은 분석 도구와 똑같다. 각 화면의 '뒤로'(분석 도구 첫 화면으로)는 웹에서 CSS 로 감춘다.
// 아직 화면이 없는 탭(낙찰가율분석 둘)은 웹이 빈 카드로 그린다.
import TradeStatsPage from '../../src/pages/TradeStatsPage.vue';
import HousingIndexPage from '../../src/pages/HousingIndexPage.vue';
import AdminRegionDemandPage from '../../src/pages/AdminRegionDemandPage.vue';
import AdminDongTradePage from '../../src/pages/AdminDongTradePage.vue';
import AdminCaseTradePage from '../../src/pages/AdminCaseTradePage.vue';
import SonpumAnalysisPage from '../../src/pages/SonpumAnalysisPage.vue';
const ADMIN_SCREENS = {
  ranking: ['/trade-stats', TradeStatsPage],
  kb: ['/admin/housing-index', HousingIndexPage],
  region: ['/admin/region-demand', AdminRegionDemandPage],
  dong: ['/admin/dong-trades', AdminDongTradePage],
  /* 랭킹분석 — 지역분석과 같은 화면을 랭킹 탭(랭킹지도 · 거래랭킹)만으로 */
  rank: ['/admin/dong-rank', AdminDongTradePage, { rankMode: true }],
  case: ['/admin/case-trades', AdminCaseTradePage],
  /* 시장분석 › 손품조사 — 지역분석과 같은 화면(같은 검색창)을 수요분석 · 시세분석 탭만으로. 물건 없이 주소로 */
  son: ['/admin/dong-son', AdminDongTradePage, { sonMode: true }],
  /* 선정물건 › 손품조사 — 그 물건으로(사건 카드 · 수요분석 · 시세분석 · 손품결론) */
  sonItem: ['/admin/sonpum', SonpumAnalysisPage],
};
export const hasAppAdminScreen = (key) => !!ADMIN_SCREENS[key];
/* 시장분석 › 매각분석 › 낙찰가예측(운영) — 기일 목록 · 사건 차트 조회수로 사건마다 팔릴 확률 · 인원 · 낙찰가를 내고 채점(2026-11-14) */
import BidPredictTest from '../../src/components/BidPredictTest.vue';
export const mountBidPredict = (el) => {
  const app = createApp(BidPredictTest);
  app.use(getActivePinia());
  app.provide('webEmbed', true);
  app.mount(el);
  return () => app.unmount();
};
export const mountAppAdmin = (el, key, provides = {}) => {
  const [path, component, props] = ADMIN_SCREENS[key];
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path, component, props: props ?? false }, { path: '/:rest(.*)*', component: Empty }],
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  app.provide('webEmbed', true);
  Object.entries(provides).forEach(([k, v]) => app.provide(k, v));   /* 화면마다 웹이 따로 건네는 값(손품조사 경매사례 탭 등) */
  void router.push(path);
  app.mount(el);
  return () => app.unmount();
};
export const mountAppRegion = (el) => mountAppAdmin(el, 'region');
/* 콘텐츠 › 관리(운영자만) — 전자책 올리고 내리기. 회원 화면의 책 카드 · 받기는 웹이 subscribeEbooks · downloadEbook 으로 그린다 */
import EbookManage from '../../src/components/EbookManage.vue';
export const mountEbookManage = (el) => {
  const app = createApp(EbookManage);
  app.provide('webEmbed', true);
  app.mount(el);
  return () => app.unmount();
};
/* 홈 — 이벤트 · 공지사항 · 업데이트 세 상자(커뮤니티 › 공지와 같은 부품). 홈은 다시 그릴 때마다 칸을 새로 쓰므로 웹이 이 칸을 들고 있다가 자리에 다시 끼운다(2026-11-13) */
export const mountHomeNews = (el) => {
  const app = createApp(NewsBody);
  app.provide('webEmbed', true);
  app.mount(el);
  return () => app.unmount();
};
/* 점검 화면 · 시작 팝업 — 앱 AppShell 과 같은 부품(SiteNotice)을 웹 맨 위에 붙인다. 운영자 로그인은 'myturn:login' 으로 웹 로그인 창을 연다 */
import SiteNotice from '../../src/components/SiteNotice.vue';
export const mountSiteNotice = (el) => {
  const app = createApp(SiteNotice);
  app.use(getActivePinia());
  app.provide('webEmbed', true);
  app.mount(el);
  return () => app.unmount();
};
/* 콘텐츠 › 내콘텐츠 — 내가 받은 책(마이페이지 › 받은콘텐츠와 같은 화면) */
import MyContentsPage from '../../src/pages/MyContentsPage.vue';
export const mountMyContents = (el) => {
  const app = createApp(MyContentsPage);
  app.provide('webEmbed', true);
  app.mount(el);
  return () => app.unmount();
};
export { subscribeEbooks, downloadEbook, subscribeMyReceipts, ebookSummary, ebookBodyHtml, ebookReleaseText } from '../../src/services/ebookRepository';

export const mountAppFieldTrip = (el, onDetail) => {
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/field-trip', component: FieldTripPlannerPage }, { path: '/:rest(.*)*', component: Empty }],
  });
  router.beforeEach((to) => {
    const hit = /^\/auctions\/([\w-]+)/.exec(to.path || '');
    if (!hit) return true;
    if (onDetail) onDetail(hit[1], (to.query && to.query.tab) || '');
    return false; /* 임장경로 화면을 그대로 둔다 */
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  void router.push('/field-trip');
  app.mount(el);
  /* 앱 화면은 손전화에서 쪽을 넘기다 지도가 끌려가지 않게, 한 번 눌러야 지도가 움직이도록 잠가 둔다.
     웹은 지도가 화면을 통째로 쓰고 넘길 쪽도 없어 그 잠금이 거추장스럽다 —
     띄운 뒤 끌기를 풀고, 다시 잠그려는 길을 막는다(앱 화면은 한 줄도 고치지 않는다). */
  const freeDrag = () => {
    const box = el.querySelector('#trip-map');
    const made = box && mapByEl.get(box);
    if (!made || !made.dragging) return;
    made.dragging.enable();
    made.dragging.disable = () => {};
    if (made.scrollWheelZoom) { made.scrollWheelZoom.enable(); made.scrollWheelZoom.disable = () => {}; }
  };
  const freeTries = [0, 80, 300, 800, 1600].map((ms) => setTimeout(freeDrag, ms));
  return () => {
    freeTries.forEach(clearTimeout);
    dropMap(el.querySelector('#trip-map'));
    app.unmount();
  };
};

// === 낙찰이후 · 자금관리 · 더보기 — 앱 화면(PostWinPage · FinancePage · MorePage)을 그대로 띄운다 ===
// 웹 하위 탭은 ?tab= 으로 고른다(앱 화면이 주소의 탭을 따른다). 계산·저장은 앱이 하던 그대로다.
// 더보기 안에서 가는 앱 화면(포인트 · 결제관리 · 알림설정 …)도 같은 칸 안에서 앱 화면 그대로 연다 — '뒤로'로 돌아온다.
// 웹이 받아야 하는 길(물건상세 · 로그인 · 선정물건 · 임장경로 · 다른 메뉴)은 hooks.onNav(웹 열쇠, 값)로 넘긴다.
import PostWinPage from '../../src/pages/PostWinPage.vue';
import FinancePage from '../../src/pages/FinancePage.vue';
import MorePage from '../../src/pages/MorePage.vue';
import NewsBody from '../../src/components/NewsBody.vue';
import EventBanner from '../../src/components/EventBanner.vue';
import SupportBody from '../../src/components/SupportBody.vue';
import SuggestBoard from '../../src/components/SuggestBoard.vue';
import { useRoute, useRouter } from 'vue-router';
/** 커뮤니티(웹만) — 공지(이벤트 배너 + 공지사항 · 이벤트 · 업데이트, 예전 마이페이지 › 공지) · 오류및제안(회원 게시판) · FAQ(자주 찾는 도움말, 예전 고객센터 맨 위) */
const CommunityPage = {
  setup() {
    const route = useRoute();
    const router = useRouter();
    return () => h('div', { class: 'community-shell' }, route.query.tab === 'faq'
      ? [h(SupportBody, { only: 'faq' })]
      : route.query.tab === 'suggest' ? [h(SuggestBoard)]
      : [h(EventBanner, { onOpen: (id) => router.push(id ? `/post/${id}` : '/community') }), h(NewsBody, { noticeOnly: true })]);   /* 이벤트 배너는 공지사항 위에 다시(2026-11-08) · 웹은 이벤트 · 공지사항 · 업데이트 세 상자(2026-11-13) */
  },
};
/** 게시판(웹만) — 오류및제안 · 가입인사 · 사용후기. 같은 게시판 틀(SuggestBoard)에 board 만 다르다(2026-11-05) */
const BOARD_KEYS = ['suggest', 'review'];
const BoardPage = {
  setup() {
    const route = useRoute();
    return () => { const b = BOARD_KEYS.includes(String(route.query.tab)) ? String(route.query.tab) : 'suggest'; return h('div', { class: 'community-shell' }, [h(SuggestBoard, { key: b, board: b })]); };
  },
};
const APP_PAGES = { postwin: '/post-win', finance: '/finance', more: '/more', community: '/community', board: '/board' };
const APP_PAGE_ROUTES = [
  { path: '/post-win', component: PostWinPage },
  { path: '/finance', component: FinancePage },
  { path: '/tax', redirect: { path: '/finance', query: { tab: 'tax' } } },
  { path: '/more', component: MorePage },
  { path: '/community', component: CommunityPage },
  { path: '/board', component: BoardPage },
  { path: '/trash', component: () => import('../../src/pages/TrashPage.vue') },
  { path: '/archive', component: () => import('../../src/pages/TrashPage.vue') },
  { path: '/bid-calendar', component: () => import('../../src/pages/BidCalendarPage.vue') },
  { path: '/my-contents', component: () => import('../../src/pages/MyContentsPage.vue') },   /* 마이페이지 › 받은콘텐츠(웹만) */
  { path: '/terms', component: () => import('../../src/pages/TermsPage.vue') },
  { path: '/withdraw', component: () => import('../../src/pages/WithdrawPage.vue') },
  { path: '/point-history', component: () => import('../../src/pages/PointHistoryPage.vue') },
  { path: '/payments', component: () => import('../../src/pages/PaymentsPage.vue') },
  { path: '/trial', component: () => import('../../src/pages/TrialPage.vue') },
  { path: '/points', component: () => import('../../src/pages/PointsPage.vue') },
  { path: '/support', component: () => import('../../src/pages/SupportPage.vue') },
  { path: '/notifications', component: () => import('../../src/pages/NotificationsPage.vue') },
  { path: '/privacy', component: () => import('../../src/pages/PrivacyPage.vue') },
  { path: '/billing', component: () => import('../../src/pages/BillingPage.vue') },
  { path: '/profile', component: () => import('../../src/pages/ProfilePage.vue') },
  { path: '/agencies', component: () => import('../../src/pages/AgencyBookPage.vue') },
  { path: '/interior-vendors', component: () => import('../../src/pages/InteriorVendorsPage.vue') },
  { path: '/post/:id', component: () => import('../../src/pages/BoardPostPage.vue'), props: true },
];
const PAGE_OF_PATH = Object.fromEntries(Object.entries(APP_PAGES).map(([k, p]) => [p, k]));
export const hasAppPage = (key) => !!APP_PAGES[key];
/** el 안에 앱 화면(key)을 tab 탭으로 띄운다. 돌려주는 함수로 걷고, .setTab(tab) 으로 탭만 바꾼다 */
/** 하위 탭이 따로 쪽(경로)인 것 — 마이페이지 › 알림은 앱의 알림 화면(/notifications), 입찰 캘린더는 앱의 /bid-calendar 를 그대로 띄운다 */
const TAB_PATHS = { more: { alerts: '/notifications', calendar: '/bid-calendar', contents: '/my-contents' } };
export const mountAppPage = (el, key, tab, hooks = {}) => {
  const home = APP_PAGES[key];
  const tabPaths = TAB_PATHS[key] || {};
  const tabOfPath = Object.fromEntries(Object.entries(tabPaths).map(([t, p]) => [p, t]));
  const go = (t) => (tabPaths[t] ? { path: tabPaths[t] } : { path: home, query: t ? { tab: t } : {} });
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...APP_PAGE_ROUTES, { path: '/:rest(.*)*', component: Empty }],
  });
  const nav = (...a) => { if (hooks.onNav) setTimeout(() => hooks.onNav(...a), 0); };
  router.beforeEach((to) => {
    const p = to.path || '';
    const hit = /^\/auctions\/([\w-]+)$/.exec(p);
    if (p === '/auctions/new' || p === '/auctions/import') { nav('register'); return false; }
    if (hit && !['watchlist', 'schedule', 'profit', 'calendar'].includes(hit[1])) { nav('item', hit[1], (to.query && to.query.tab) || ''); return false; }
    if (p === '/login' || p === '/signup') { nav('login'); return false; }
    if (p === '/' || p.startsWith('/auctions')) { nav('list'); return false; }
    if (p === '/field-trip') { nav('trip'); return false; }
    if (p === '/web-ai') { nav('ai'); return false; }   // 더보기 › 계정관리의 AI 설정 카드 — 웹이 설정 창을 띄운다
    if (p === '/web-recent') { nav('recent'); return false; }   // 마이페이지 최근 작성 › 전체보기 — 웹이 홈과 같은 최근 분석 창을 띄운다
    if (p === '/trade-stats') { nav('market'); return false; }
    if (p === '/more' && to.query && to.query.tab === 'news') { nav('community', 'notice'); return false; }   /* 공지는 커뮤니티로 옮겼다(웹) */
    /* 낙찰이후 · 자금관리 · 더보기 사이를 오가면 웹 메뉴로 옮긴다(띄운 화면이 아니면) */
    const other = PAGE_OF_PATH[p];
    if (other && other !== key) { nav(other, String((to.query && to.query.tab) || '')); return false; }
    return true;
  });
  /* 앱 화면이 제 탭을 바꾸면(이름 눌러 마이페이지 등) 웹 하위 탭도 따라온다 */
  router.afterEach((to) => {
    if (!hooks.onTab) return;
    if (to.path === home) hooks.onTab(String((to.query && to.query.tab) || ''));
    else if (tabOfPath[to.path]) hooks.onTab(tabOfPath[to.path]);
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  app.provide('webEmbed', true);
  void router.push(go(tab));
  app.mount(el);
  const stop = () => app.unmount();
  stop.setTab = (t) => {
    if (tabPaths[t]) { if (router.currentRoute.value.path !== tabPaths[t]) void router.push(go(t)); return; }
    if (router.currentRoute.value.path !== home) { void router.push({ path: home, query: { tab: t } }); return; }
    if (String(router.currentRoute.value.query.tab || '') !== t) void router.replace({ path: home, query: { ...router.currentRoute.value.query, tab: t } });
  };
  return stop;
};

/* 아파트 면적 단위(㎡ · 평) — 고정카드 단추 하나로 모든 탭이 같이 바뀐다(2026-11-11) */
export { toggleAreaUnit, getAreaUnit, aptAreaText } from '../../src/services/areaUnit';
// 면적 · 건축 양끝 막대 범위 규칙 — 앱 시세분석 · 입지비교(DualRangeBar)와 한 곳(2026-11-12)
export { clampAroundBase } from '../../src/services/rangeClamp';
