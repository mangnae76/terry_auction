// 웹이 앱과 함께 쓰는 로직 — 앱의 src/ 를 고치지 않고 그대로 가져다 한 파일(site/pdfparse.js)로 묶는다.
// 페이지에서는 window.TAPdf.<함수> 로 부른다. 앱 쪽 로직이 바뀌면 node web/build.mjs 만 다시 돌리면 된다.

// pdf.js 를 별도 워커 파일 없이 페이지 안(메인 스레드)에서 돌린다 — 한 장짜리 페이지라 워커 파일을 따로 두지 않는다
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
globalThis.pdfjsWorker = pdfjsWorker;

// PDF 읽기 — 앱 선정물건등록(PdfImportPage)과 같은 규칙
export { parsePdfBytes, parseAuctionPdfText } from '../../src/services/pdfAuctionImport';
// 구글드라이브 폴더 읽기 — claude.ai 바깥(우리 주소)에서 열렸을 때 앱과 같은 워커로 읽는다
export { listDrivePdfFiles, parseDrivePdfFile, downloadDrivePdfBytes } from '../../src/services/pdfAuctionImport';
// AI 자동 파싱 — 앱과 같은 Gemini 키 보관 · 키 확인 · 빈칸 채우기 (키는 로그인 계정마다 userPrefs/{uid}.geminiKey)
export {
  getGeminiKey, setGeminiKey, clearGeminiKey, isGeminiOn, setGeminiOn, loadGeminiPrefs, testGeminiKey, fillWithGemini, AI_FIELD_LABELS,
} from '../../src/services/geminiPdf';
// 기일내역에서 이번 회차 고르기
export { pickCurrentRound } from '../../src/utils/auctionSchedule';
// 주소 → 지번 · 건물명 · 동층호 토막
export { addressParts, addressWithName, hasBuildingName } from '../../src/utils/addressName';
// 물건 종류 이름·배지 글자
export { propTypeName, propTypeMark } from '../../src/utils/propertyType';
// 수익 셈(세율 구간 · 누진공제 · 세후 순이익) — 입찰가산정과 같은 셈
export { taxChainOf, taxRateOf, taxDeductOf, incomeTaxOf, localTaxOf, afterTaxProfitOf } from '../../src/services/profitMath';

// === 앱 자료 연결 — 앱이 쓰는 로그인·물건 저장소(Pinia)를 그대로 쓴다 ===
// 웹(/web)은 앱과 같은 주소라, 같은 브라우저에서 앱에 로그인해 두었으면 그 로그인이 그대로 이어진다.
import { createPinia, setActivePinia } from 'pinia';
export { watch } from 'vue';
export { useAuthStore } from '../../src/stores/authStore';
export { useAuctionStore } from '../../src/stores/auctionStore';
export { isAllowedEmail } from '../../src/services/accessControl';
/* 대문의 가벼운 로그인 창이 '로그인'을 누를 때 쓴다 — 로그인 유지 방식 · 카카오 설정 여부 */
export { setLoginPersistence } from '../../src/services/authRepository';
export { isKakaoLoginConfigured } from '../../src/services/socialAuth';
export { stageDates, bidStageOf, stageLabelOf } from '../../src/utils/stageLabel';
// 물건상세 정보요약·기본정보 — 앱 물건상세와 같은 셈
export {
  saleKindOf, headMetaLineOf, summarySeedOf, summaryAreaText, summaryApprovalAgeOf, summaryFloorPairOf,
  bidBaseValueOf, currentMinBidOf, depositAmountOf, bidRoundsOf, roundToneOf, currentRoundLabelOf, trunc2,
} from '../../src/services/detailSummary';
/** 앱 저장소를 쓸 수 있게 Pinia 를 한 번 켠다 */
export const startStores = () => { setActivePinia(createPinia()); };
// 물건상세 입지정보 — 앱 물건상세와 같은 셈 · 카카오 주변환경 조회(앱과 같은 함수)
export {
  eduInfoOf, eduInfoFiltered500mOf, nearbyDisplayOf, pdfNearbyDisplayOf, pdfNearbyFiltered500mOf,
  stationItems500mOf, naverMapUrl, stripDistanceFromName,
} from '../../src/services/locationInfo';
export { fetchNearbyEnvironment } from '../../src/services/kakaoNearby';
export { geocodeAddress } from '../../src/services/routeOptimizer';
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
const ADMIN_SCREENS = {
  ranking: ['/trade-stats', TradeStatsPage],
  kb: ['/admin/housing-index', HousingIndexPage],
  region: ['/admin/region-demand', AdminRegionDemandPage],
  dong: ['/admin/dong-trades', AdminDongTradePage],
  case: ['/admin/case-trades', AdminCaseTradePage],
};
export const hasAppAdminScreen = (key) => !!ADMIN_SCREENS[key];
export const mountAppAdmin = (el, key) => {
  const [path, component] = ADMIN_SCREENS[key];
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path, component }, { path: '/:rest(.*)*', component: Empty }],
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
  app.provide('webEmbed', true);
  void router.push(path);
  app.mount(el);
  return () => app.unmount();
};
export const mountAppRegion = (el) => mountAppAdmin(el, 'region');

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
const APP_PAGES = { postwin: '/post-win', finance: '/finance', more: '/more' };
const APP_PAGE_ROUTES = [
  { path: '/post-win', component: PostWinPage },
  { path: '/finance', component: FinancePage },
  { path: '/tax', redirect: { path: '/finance', query: { tab: 'tax' } } },
  { path: '/more', component: MorePage },
  { path: '/trash', component: () => import('../../src/pages/TrashPage.vue') },
  { path: '/archive', component: () => import('../../src/pages/TrashPage.vue') },
  { path: '/bid-calendar', component: () => import('../../src/pages/BidCalendarPage.vue') },
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
/** 하위 탭이 따로 쪽(경로)인 것 — 마이페이지 › 알림은 앱의 알림 화면(/notifications)을 그대로 띄운다 */
const TAB_PATHS = { more: { alerts: '/notifications' } };
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
    if (p === '/trade-stats') { nav('market'); return false; }
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
