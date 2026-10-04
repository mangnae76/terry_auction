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
      path: '/bid-calendar',
      name: 'bid-calendar',
      component: () => import('../pages/BidCalendarPage.vue'),
    },
  ],
});

// 전역 인증 가드: ready 될 때까지 대기 후, 비공개 라우트는 미인증 시 /login으로
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
