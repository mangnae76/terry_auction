import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

const requiredKeys = Object.entries(firebaseConfig);
const missingKeys = requiredKeys.filter(([, value]) => !value).map(([key]) => key);

const fireStoreEnabled = missingKeys.length === 0;
const disabledReason =
  missingKeys.length > 0
    ? `Firestore 환경 변수가 누락되었습니다: ${missingKeys.join(', ')}`
    : undefined;

const firebaseApp = fireStoreEnabled ? initializeApp(firebaseConfig) : null;
/** 받은 자료를 기기(IndexedDB)에 남겨 둔다 — 다시 열 때 저장해 둔 것을 곧바로 보여 주고 바뀐 것만 받는다.
 *  (안 남기면 새로고침마다 내 물건 전부를 서버에서 처음부터 받아 '불러오는 중'이 길었다)
 *  창 여러 개가 같이 써도 되게 하고, 기기 저장을 못 쓰는 곳이면 예전처럼 그때그때 받는다 */
const makeFirestore = (app: NonNullable<typeof firebaseApp>): Firestore => {
  if (import.meta.env.VITE_USE_EMULATOR === 'true' || typeof indexedDB === 'undefined') return getFirestore(app);
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
};
export const firestore = firebaseApp ? makeFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
if (import.meta.env.VITE_USE_EMULATOR === 'true' && auth && firestore) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, 'localhost', 8080);
}

export const firestoreReady = Boolean(firestore);
export const firestoreDisabledReason = disabledReason;
