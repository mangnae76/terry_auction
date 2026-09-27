import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreReady = Boolean(firestore);
export const firestoreDisabledReason = disabledReason;
