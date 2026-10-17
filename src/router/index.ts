import { createRouter, createWebHistory } from 'vue-router';
import AuctionDetailPage from '../pages/AuctionDetailPage.vue';
import AuctionDetailFormPage from '../pages/AuctionDetailFormPage.vue';
import WatchlistPage from '../pages/WatchlistPage.vue';
import FieldTripPlannerPage from '../pages/FieldTripPlannerPage.vue';
import PdfImportPage from '../pages/PdfImportPage.vue';
import TradeStatsPage from '../pages/TradeStatsPage.vue';
import LoginPage from '../pages/LoginPage.vue';
import SignupPage from '../pages/SignupPage.vue';
import { useAuthStore } from '../stores/authStore';
import { isAllowedEmail } from '../services/accessControl';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/auctions/watchlist',
    },
    {
      path: '/auctions',
      redirect: '/auctions/watchlist',
    },
    {
      // 옛 목록 화면 — 단계 규칙이 지금과 달라 떼어 냈다. 북마크로 들어와도 길을 잃지 않게 돌려보낸다
      path: '/auctions/schedule',
      redirect: '/auctions/watchlist',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { public: true },
    },
    {
      // 허용된 계정만 쓰는 앱이라 가입 창구는 닫아 둔다. 북마크로 들어와도 로그인으로 보낸다.
      path: '/signup',
      name: 'signup',
      component: SignupPage,
      meta: { public: true, closed: true },
    },
    {
      path: '/auctions/watchlist',
      name: 'auction-watchlist',
      component: WatchlistPage,
      meta: { public: true },
    },
    {
      // 옛 화면을 가리키던 경로 — 쓰이는 곳이 없어 선정물건으로 돌려보낸다
      path: '/auctions/profit',
      redirect: '/auctions/watchlist',
    },
    {
      path: '/auctions/new',
      name: 'auction-create',
      component: AuctionDetailFormPage,
      props: { mode: 'create' },
    },
    {
      path: '/auctions/import',
      name: 'auction-import',
      component: PdfImportPage,
    },
    {
      path: '/auctions/calendar',
      name: 'auction-calendar',
      component: () => import('../pages/AuctionSchedulePage.vue'),
    },
    {
      path: '/auctions/:id',
      name: 'auction-view',
      component: AuctionDetailPage,
      props: (route) => ({ mode: 'view', id: String(route.params.id) }),
    },
    {
      path: '/auctions/:id/edit',
      name: 'auction-edit',
      component: AuctionDetailFormPage,
      props: (route) => ({ mode: 'edit', id: String(route.params.id) }),
    },
    {
      path: '/field-trip',
      name: 'field-trip',
      component: FieldTripPlannerPage,
    },
    {
      path: '/trade-stats',
      name: 'trade-stats',
      component: TradeStatsPage,
    },
    {
      // 낙찰 이후 — 명도·매도 과정을 모을 자리
      path: '/post-win',
      name: 'post-win',
      component: () => import('../pages/PostWinPage.vue'),
    },
    {
      path: '/finance',
      name: 'finance',
      component: () => import('../pages/FinancePage.vue'),
    },
    {
      path: '/tax',
      name: 'tax',
      component: () => import('../pages/TaxPage.vue'),
    },
    {
      path: '/more',
      name: 'more',
      component: () => import('../pages/MorePage.vue'),
    },
    {
      path: '/trash',
      name: 'trash',
      component: () => import('../pages/TrashPage.vue'),
    },
    {
      // 보관함 — 휴지통과 같은 화면을 쓰되 '잠시 내려놓은 물건' 쪽을 펼친다
      path: '/archive',
      name: 'archive',
      component: () => import('../pages/TrashPage.vue'),
    },
    {
      path: '/bid-calendar',
      name: 'bid-calendar',
      component: () => import('../pages/BidCalendarPage.vue'),
    },
    {
      path: '/agencies',
      name: 'agencies',
      component: () => import('../pages/AgencyBookPage.vue'),
    },
    {
      // 관리자 도구 — 웹에서만 쓰는 화면이라 앱 메뉴에는 올리지 않는다
      path: '/admin',
      name: 'admin',
      component: () => import('../pages/AdminHomePage.vue'),
    },
    {
      // KB 주택가격지수 — 분석 도구의 '부동산 시장정보' 묶음
      path: '/admin/housing-index',
      name: 'admin-housing-index',
      component: () => import('../pages/HousingIndexPage.vue'),
    },
    {
      path: '/admin/region-demand',
      name: 'admin-region-demand',
      component: () => import('../pages/AdminRegionDemandPage.vue'),
    },
    {
      path: '/admin/dong-trades',
      name: 'admin-dong-trades',
      component: () => import('../pages/AdminDongTradePage.vue'),
    },
    {
      path: '/admin/case-trades',
      name: 'admin-case-trades',
      component: () => import('../pages/AdminCaseTradePage.vue'),
    },
  ],
});

// 전역 인증 가드: ready 될 때까지 대기 후, 비공개 라우트는 미인증 시 /login으로
// 새로 배포되면 옛 조각 파일(자금관리·세금관리처럼 늦게 불러오는 화면)이
// 서버에서 사라진다. 오래 열어 둔 화면에서 그 메뉴를 누르면 조각을 못 받아
// 아무 일도 일어나지 않는다. 그럴 때는 한 번만 새로 읽어 최신으로 갈아탄다.
// (정적으로 묶인 선정물건·임장경로는 멀쩡해서 더 헷갈린다)
const RELOAD_FLAG = 'chunk-reload-at';
const isStaleChunk = (err: unknown) => {
  const msg = String((err as Error)?.message ?? err);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i.test(msg);
};
const reloadOnce = () => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? '0');
    // 조금 전에 이미 새로 읽었다면 또 읽지 않는다 (무한 되풀이 막기)
    if (Date.now() - last < 20000) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch { /* 저장 못 해도 새로 읽는다 */ }
  window.location.reload();
};

router.onError((err) => { if (isStaleChunk(err)) reloadOnce(); });
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); reloadOnce(); });

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  // 초기 부트 시 onAuthStateChanged 첫 콜백을 기다림 (FOUC/잘못된 라우팅 방지)
  if (!authStore.ready) await authStore.waitUntilReady();
  const isPublic = !!to.meta.public;

  // 닫아 둔 페이지(회원가입)는 누구든 로그인으로 돌려보낸다
  if (to.meta.closed) {
    return { path: '/login', replace: true };
  }

  // 허용 목록에 없는 계정으로 들어왔으면 바로 내보낸다.
  // 화면만 막는 것이고 자료 차단은 firestore.rules가 한다.
  if (authStore.isLoggedIn && !isAllowedEmail(authStore.email)) {
    await authStore.logout();
    return { path: '/login', query: { denied: '1' }, replace: true };
  }

  if (!authStore.isLoggedIn && !isPublic) {
    return { path: '/login', replace: true };
  }
  // 이미 로그인 상태에서 로그인 페이지 진입 시 → 메인으로
  if (authStore.isLoggedIn && to.path === '/login') {
    return { path: '/auctions/watchlist', replace: true };
  }
  return true;
});

export default router;
