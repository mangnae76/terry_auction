import { createRouter, createWebHistory } from 'vue-router';
import AuctionDetailPage from '../pages/AuctionDetailPage.vue';
import AuctionDetailFormPage from '../pages/AuctionDetailFormPage.vue';
import AuctionListPage from '../pages/AuctionListPage.vue';
import WatchlistPage from '../pages/WatchlistPage.vue';
import FieldTripPlannerPage from '../pages/FieldTripPlannerPage.vue';
import PdfImportPage from '../pages/PdfImportPage.vue';
import TradeStatsPage from '../pages/TradeStatsPage.vue';
import LoginPage from '../pages/LoginPage.vue';
import SignupPage from '../pages/SignupPage.vue';
import { useAuthStore } from '../stores/authStore';

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
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { public: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPage,
      meta: { public: true },
    },
    {
      path: '/auctions/schedule',
      name: 'auction-list',
      component: AuctionListPage,
    },
    {
      path: '/auctions/watchlist',
      name: 'auction-watchlist',
      component: WatchlistPage,
    },
    {
      path: '/auctions/profit',
      name: 'auction-profit',
      component: AuctionListPage,
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
  ],
});

// 전역 인증 가드: ready 될 때까지 대기 후, 비공개 라우트는 미인증 시 /login으로
router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  // 초기 부트 시 onAuthStateChanged 첫 콜백을 기다림 (FOUC/잘못된 라우팅 방지)
  if (!authStore.ready) await authStore.waitUntilReady();
  const isPublic = !!to.meta.public;
  if (!authStore.isLoggedIn && !isPublic) {
    return { path: '/login', replace: true };
  }
  // 이미 로그인 상태에서 로그인/회원가입 페이지 진입 시 → 메인으로
  if (authStore.isLoggedIn && (to.path === '/login' || to.path === '/signup')) {
    return { path: '/auctions/watchlist', replace: true };
  }
  return true;
});

export default router;
