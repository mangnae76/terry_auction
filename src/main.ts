import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './style.css';
// import { installFetchDebug } from './services/debugOverlay';

// installFetchDebug();

const app = createApp(App);

app.use(createPinia());
app.use(router);

// 라우터 가드가 동작하기 전에 Firebase Auth 상태 구독 시작 (첫 콜백 도착까지 router.beforeEach에서 대기).
// Pinia 활성화 이후, router.isReady 호출 전에 반드시 실행되어야 함.
import('./stores/authStore').then(({ useAuthStore }) => {
  useAuthStore().initialize();
});

app.mount('#app');

if (import.meta.env.DEV) {
  import('./stores/auctionStore').then(({ useAuctionStore }) => {
    const w = window as unknown as Record<string, unknown>;
    w.__auctionStore = useAuctionStore();
    w.__listAuctions = () => {
      const store = useAuctionStore();
      const db = store.auctions.filter((a) => !a.id.startsWith('onbid-'));
      console.table(db.map((a) => ({ id: a.id, caseNumber: a.caseNumber, address: a.address })));
      console.log(`DB 등록 ${db.length}건 / 전체 ${store.auctions.length}건`);
      return db;
    };
    w.__cleanupKeepCases = async (keep: string[]) => {
      const store = useAuctionStore();
      const norm = (s: string) => s.replace(/\s+/g, '').trim();
      const keepNorm = keep.map(norm);
      const all = store.auctions.filter((a) => !a.id.startsWith('onbid-'));
      const targets = all.filter((a) => !keepNorm.includes(norm(a.caseNumber)));
      const kept = all.filter((a) => keepNorm.includes(norm(a.caseNumber)));
      console.log(`[cleanup] DB 전체 ${all.length}건 / 보존 ${kept.length}건 / 삭제 대상 ${targets.length}건`);
      console.log('[cleanup] 보존:', kept.map((a) => `${a.caseNumber} | ${a.address}`));
      console.log('[cleanup] 삭제:', targets.map((a) => `${a.caseNumber} | ${a.address}`));
      for (const a of targets) {
        await store.deleteAuction(a.id);
        console.log(`  ✓ 삭제됨: ${a.caseNumber}`);
      }
      console.log(`[cleanup] 완료: ${targets.length}건 삭제`);
      return targets.length;
    };
    console.log('[DEV] __listAuctions() / __cleanupKeepCases([...caseNumbers]) 사용 가능');
  });
}
