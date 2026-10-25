// 웹이 앱과 함께 쓰는 로직 — 앱의 src/ 를 고치지 않고 그대로 가져다 한 파일(site/pdfparse.js)로 묶는다.
// 페이지에서는 window.TAPdf.<함수> 로 부른다. 앱 쪽 로직이 바뀌면 node web/build.mjs 만 다시 돌리면 된다.

// pdf.js 를 별도 워커 파일 없이 페이지 안(메인 스레드)에서 돌린다 — 한 장짜리 페이지라 워커 파일을 따로 두지 않는다
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
globalThis.pdfjsWorker = pdfjsWorker;

// PDF 읽기 — 앱 선정물건등록(PdfImportPage)과 같은 규칙
export { parsePdfBytes, parseAuctionPdfText } from '../../src/services/pdfAuctionImport';
// 구글드라이브 폴더 읽기 — claude.ai 바깥(우리 주소)에서 열렸을 때 앱과 같은 워커로 읽는다
export { listDrivePdfFiles, parseDrivePdfFile, downloadDrivePdfBytes } from '../../src/services/pdfAuctionImport';
// AI 자동 파싱 — 앱과 같은 Gemini 키 보관 · 키 확인 · 빈칸 채우기 (키는 이 기기 localStorage 'myturn.gemini.key')
export {
  getGeminiKey, setGeminiKey, clearGeminiKey, isGeminiOn, setGeminiOn, testGeminiKey, fillWithGemini, AI_FIELD_LABELS,
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
/** el 안에 앱 로그인 화면을 띄운다. 로그인이 끝나면(앱은 선정물건으로 넘어가는 자리) onDone('ok'), 회원가입은 onDone('signup') */
export const mountAppLogin = (el, onDone) => {
  const Empty = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: LoginPage }, { path: '/:rest(.*)*', component: Empty }],
  });
  router.afterEach((to) => {
    if (to.path === '/auctions/watchlist') onDone('ok');
    else if (to.path === '/signup') onDone('signup');
  });
  const app = createApp({ render: () => h(RouterView) });
  app.use(getActivePinia());
  app.use(router);
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
  void router.push({ path: `/auctions/${id}`, query: { tab } });
  app.mount(el);
  return () => app.unmount();
};
