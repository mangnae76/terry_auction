import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore, firestoreDisabledReason } from './firebase';
import {
  loginWithKakao as kakaoOAuthFlow,
  loginWithNaver as naverOAuthFlow,
  type SocialLoginResult,
} from './socialAuth';

export interface UserProfile {
  uid: string;
  email: string;
  nickname: string;
  createdAt: string;
}

const USERS_COLLECTION = 'users';

const assertReady = () => {
  if (!auth || !firestore) {
    throw new Error(firestoreDisabledReason ?? '인증 서비스가 초기화되지 않았습니다.');
  }
};

const profileFromUser = (user: User): UserProfile => ({
  uid: user.uid,
  email: user.email ?? '',
  nickname: user.displayName ?? (user.email ? user.email.split('@')[0] : '사용자'),
  createdAt: new Date().toISOString(),
});

const loadProfile = async (user: User): Promise<UserProfile> => {
  if (!auth || !firestore) return profileFromUser(user);
  const ref = doc(firestore, USERS_COLLECTION, user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Partial<UserProfile>;
      return {
        uid: user.uid,
        email: user.email ?? data.email ?? '',
        nickname: data.nickname ?? user.displayName ?? '',
        createdAt: data.createdAt ?? new Date().toISOString(),
      };
    }
  } catch (err) {
    // Firestore 규칙 미배포 등으로 읽기 실패 — Auth 자체는 성공했으므로 사용자 객체 기반 프로필 반환
    console.warn('[auth] users/{uid} 읽기 실패 (Firestore 규칙 확인):', err);
    return profileFromUser(user);
  }
  // 프로필 doc이 없으면 자동 생성 시도 — 실패해도 로그인은 진행
  const fallback = profileFromUser(user);
  try {
    await setDoc(ref, fallback, { merge: true });
  } catch (err) {
    console.warn('[auth] users/{uid} 생성 실패 (Firestore 규칙 확인):', err);
  }
  return fallback;
};

export const signupWithEmail = async (
  email: string,
  password: string,
  nickname: string,
): Promise<UserProfile> => {
  assertReady();
  const cred = await createUserWithEmailAndPassword(auth!, email.trim(), password);
  // displayName 동기화 (Auth 콘솔에서도 보임)
  try {
    await updateProfile(cred.user, { displayName: nickname });
  } catch {
    /* non-fatal */
  }
  const profile: UserProfile = {
    uid: cred.user.uid,
    email: cred.user.email ?? email.trim(),
    nickname: nickname.trim(),
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(firestore!, USERS_COLLECTION, cred.user.uid), profile, { merge: true });
  } catch (err) {
    // Firestore 규칙 미배포로 거부되면 Auth만 성공한 상태가 되므로 경고만 — 로그인 흐름은 진행
    console.warn('[auth] users/{uid} 프로필 저장 실패 (Firestore 규칙 확인):', err);
  }
  return profile;
};

export const loginWithEmail = async (email: string, password: string): Promise<UserProfile> => {
  assertReady();
  const cred = await signInWithEmailAndPassword(auth!, email.trim(), password);
  return loadProfile(cred.user);
};

// 소셜 로그인 공통 — Worker가 발급한 Custom Token으로 Firebase 로그인 후 프로필 doc 생성/갱신
const loginWithSocial = async (result: SocialLoginResult): Promise<UserProfile> => {
  assertReady();
  const cred = await signInWithCustomToken(auth!, result.customToken);
  // displayName 동기화 (Auth 콘솔에서도 보임)
  if (result.profile.nickname && cred.user.displayName !== result.profile.nickname) {
    try {
      await updateProfile(cred.user, { displayName: result.profile.nickname });
    } catch {
      /* non-fatal */
    }
  }
  const profile: UserProfile = {
    uid: cred.user.uid,
    email: result.profile.email || cred.user.email || '',
    nickname: result.profile.nickname || cred.user.displayName || '사용자',
    createdAt: new Date().toISOString(),
  };
  try {
    // 기존 가입자라면 createdAt 덮어쓰지 않도록 merge
    await setDoc(doc(firestore!, USERS_COLLECTION, cred.user.uid), profile, { merge: true });
  } catch (err) {
    console.warn('[auth] users/{uid} 소셜 프로필 저장 실패:', err);
  }
  return profile;
};

export const loginWithKakao = async (): Promise<UserProfile> => {
  const result = await kakaoOAuthFlow();
  return loginWithSocial(result);
};

export const loginWithNaver = async (): Promise<UserProfile> => {
  const result = await naverOAuthFlow();
  return loginWithSocial(result);
};

export const logout = async (): Promise<void> => {
  assertReady();
  await signOut(auth!);
};

export const onAuthChange = (
  cb: (profile: UserProfile | null) => void,
): Unsubscribe => {
  if (!auth) {
    cb(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      cb(null);
      return;
    }
    try {
      const profile = await loadProfile(user);
      cb(profile);
    } catch {
      cb({
        uid: user.uid,
        email: user.email ?? '',
        nickname: user.displayName ?? '',
        createdAt: '',
      });
    }
  });
};

// Firebase Auth 에러 코드 → 한국어
export const friendlyAuthError = (raw: unknown): string => {
  const code = (raw as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return '이미 가입된 이메일입니다.';
    case 'auth/invalid-email':
      return '이메일 형식이 올바르지 않습니다.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상이어야 합니다.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/too-many-requests':
      return '잠시 후 다시 시도해 주세요. (요청 한도 초과)';
    case 'auth/network-request-failed':
      return '네트워크 오류 — 연결을 확인해 주세요.';
    case 'auth/operation-not-allowed':
      return 'Firebase 콘솔에서 이메일/비밀번호 로그인 방식이 활성화되지 않았습니다.';
    default:
      return raw instanceof Error ? raw.message : '인증 처리 중 오류가 발생했습니다.';
  }
};
