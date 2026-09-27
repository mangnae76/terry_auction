// 카카오 / 네이버 OAuth → Worker → Firebase Custom Token 흐름.
//
// Capacitor 환경 (Android): `@capacitor/browser`로 OAuth URL을 외부 브라우저로 열고,
// 인증 후 커스텀 스킴(`com.terry.auction://oauth/kakao` 등)으로 앱에 돌아옴.
// `App.addListener('appUrlOpen')`에서 콜백 URL의 `code`/`access_token`을 파싱.
//
// 웹 환경 (브라우저 dev): 동일 origin의 `/oauth/{provider}/callback` 경로로 리다이렉트.
//
// 필요한 사전 설정:
//   - VITE_KAKAO_REST_API_KEY    (카카오 REST API 키 — 토큰 교환용. 모바일 보안상 백엔드에서 교환하는 게 더 안전하지만,
//                                 카카오는 client_secret 없이도 동작 가능. 추후 백엔드 교환으로 리팩토링 가능)
//   - VITE_KAKAO_JAVASCRIPT_KEY  (카카오 JavaScript 키 — 웹 SDK 사용 시)
//   - VITE_NAVER_CLIENT_ID       (네이버 Client ID)
//   - VITE_NAVER_CLIENT_SECRET   (네이버 Client Secret — 토큰 교환용. 동일 보안 주의)
//
// 모두 비어있으면 소셜 로그인 버튼은 표시되지만 클릭 시 `소셜 로그인이 구성되지 않았습니다` 에러 발생.

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp, type URLOpenListenerEvent } from '@capacitor/app';
import { apiPath } from './apiBase';

export type SocialProvider = 'kakao' | 'naver';

export interface SocialLoginResult {
  customToken: string;
  profile: {
    uid: string;
    email: string;
    nickname: string;
    photoURL: string;
    provider: SocialProvider;
  };
}

// 카카오 Login 전용 키. 카카오 지도용 키(VITE_KAKAO_REST_API_KEY)와 같을 수 있지만,
// 별도 앱 키를 쓰고 싶을 때 분리되도록 LOGIN 전용 변수를 우선 사용.
const KAKAO_REST_API_KEY =
  import.meta.env.VITE_KAKAO_LOGIN_REST_API_KEY ?? import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID ?? '';
const NAVER_CLIENT_SECRET = import.meta.env.VITE_NAVER_CLIENT_SECRET ?? '';

const isNative = () => Capacitor.isNativePlatform();

// 모바일 콜백 URL — AndroidManifest의 intent-filter scheme와 일치해야 함
const NATIVE_REDIRECT = {
  kakao: 'com.terry.auction://oauth/kakao',
  naver: 'com.terry.auction://oauth/naver',
};

const webRedirect = (provider: SocialProvider): string =>
  `${window.location.origin}/oauth/${provider}/callback`;

const redirectUri = (provider: SocialProvider): string =>
  isNative() ? NATIVE_REDIRECT[provider] : webRedirect(provider);

const randomState = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

// 콜백 대기 — 모바일: appUrlOpen 이벤트, 웹: window 메시지(콜백 페이지에서 postMessage)
// 사용자가 브라우저(Custom Tab)를 닫으면 즉시 reject → "로그인 중..." 상태에서 벗어남
const awaitCallback = (provider: SocialProvider, state: string): Promise<URL> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('소셜 로그인 시간 초과 (60초)'));
    }, 60_000);

    let urlHandler: { remove: () => Promise<void> } | null = null;
    let closeHandler: { remove: () => Promise<void> } | null = null;
    let resolved = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (urlHandler) void urlHandler.remove();
      if (closeHandler) void closeHandler.remove();
      window.removeEventListener('message', onMessage);
    };

    const tryParse = (raw: string) => {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return;
      }
      // 카카오: 쿼리 string에 code, naver: 쿼리 string에 code + state
      if (!parsed.pathname.endsWith(`/oauth/${provider}`) && !parsed.pathname.endsWith(`/oauth/${provider}/callback`)) {
        return;
      }
      const returnedState = parsed.searchParams.get('state');
      if (provider === 'naver' && returnedState !== state) {
        resolved = true;
        cleanup();
        reject(new Error('네이버 로그인 state 불일치 (CSRF 의심)'));
        return;
      }
      resolved = true;
      cleanup();
      resolve(parsed);
    };

    const onMessage = (e: MessageEvent) => {
      if (typeof e.data === 'string' && e.data.startsWith('oauth-callback:')) {
        tryParse(e.data.slice('oauth-callback:'.length));
      }
    };

    if (isNative()) {
      CapacitorApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        tryParse(event.url);
        // 인증 후 브라우저 닫기
        void Browser.close();
      }).then((h) => {
        urlHandler = h;
      });
      // 사용자가 콜백 없이 브라우저를 닫은 경우 즉시 취소
      Browser.addListener('browserFinished', () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new Error('소셜 로그인이 취소되었습니다.'));
      }).then((h) => {
        closeHandler = h;
      });
    } else {
      window.addEventListener('message', onMessage);
    }
  });
};

// 카카오: code → access_token 교환 (https://kauth.kakao.com/oauth/token)
const exchangeKakaoCode = async (code: string): Promise<string> => {
  if (!KAKAO_REST_API_KEY) {
    throw new Error('VITE_KAKAO_REST_API_KEY 가 설정되지 않았습니다.');
  }
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: redirectUri('kakao'),
    code,
  });
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`카카오 토큰 교환 실패 (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(data.error_description ?? '카카오 access_token 누락');
  }
  return data.access_token;
};

// 네이버: code → access_token 교환 (https://nid.naver.com/oauth2.0/token)
const exchangeNaverCode = async (code: string, state: string): Promise<string> => {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    throw new Error('VITE_NAVER_CLIENT_ID / VITE_NAVER_CLIENT_SECRET 가 설정되지 않았습니다.');
  }
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: NAVER_CLIENT_ID,
    client_secret: NAVER_CLIENT_SECRET,
    code,
    state,
  });
  const res = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`네이버 토큰 교환 실패 (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(data.error_description ?? '네이버 access_token 누락');
  }
  return data.access_token;
};

// Worker에 access token POST → Firebase Custom Token 받기
const swapForCustomToken = async (
  provider: SocialProvider,
  accessToken: string,
): Promise<SocialLoginResult> => {
  const res = await fetch(apiPath(`/api-${provider}-login`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `소셜 로그인 서버 오류 (${res.status})`);
  }
  return (await res.json()) as SocialLoginResult;
};

export const loginWithKakao = async (): Promise<SocialLoginResult> => {
  if (!KAKAO_REST_API_KEY) {
    throw new Error('카카오 로그인이 구성되지 않았습니다. (VITE_KAKAO_REST_API_KEY 누락)');
  }
  const state = randomState();
  const authUrl =
    `https://kauth.kakao.com/oauth/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: KAKAO_REST_API_KEY,
      redirect_uri: redirectUri('kakao'),
      state,
    }).toString();

  const callbackPromise = awaitCallback('kakao', state);
  if (isNative()) {
    await Browser.open({ url: authUrl, presentationStyle: 'fullscreen' });
  } else {
    window.location.href = authUrl;
    return Promise.reject(new Error('웹에서는 콜백 페이지로 리다이렉트됩니다.'));
  }

  const callbackUrl = await callbackPromise;
  const code = callbackUrl.searchParams.get('code');
  if (!code) throw new Error(callbackUrl.searchParams.get('error_description') ?? '카카오 code 누락');

  const accessToken = await exchangeKakaoCode(code);
  return swapForCustomToken('kakao', accessToken);
};

export const loginWithNaver = async (): Promise<SocialLoginResult> => {
  if (!NAVER_CLIENT_ID) {
    throw new Error('네이버 로그인이 구성되지 않았습니다. (VITE_NAVER_CLIENT_ID 누락)');
  }
  const state = randomState();
  const authUrl =
    `https://nid.naver.com/oauth2.0/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: NAVER_CLIENT_ID,
      redirect_uri: redirectUri('naver'),
      state,
    }).toString();

  const callbackPromise = awaitCallback('naver', state);
  if (isNative()) {
    await Browser.open({ url: authUrl, presentationStyle: 'fullscreen' });
  } else {
    window.location.href = authUrl;
    return Promise.reject(new Error('웹에서는 콜백 페이지로 리다이렉트됩니다.'));
  }

  const callbackUrl = await callbackPromise;
  const code = callbackUrl.searchParams.get('code');
  if (!code) throw new Error(callbackUrl.searchParams.get('error_description') ?? '네이버 code 누락');

  const accessToken = await exchangeNaverCode(code, state);
  return swapForCustomToken('naver', accessToken);
};

// LoginPage에서 환경 변수 확인용 (버튼 노출 여부 결정)
export const isKakaoLoginConfigured = (): boolean => !!KAKAO_REST_API_KEY;
export const isNaverLoginConfigured = (): boolean => !!NAVER_CLIENT_ID && !!NAVER_CLIENT_SECRET;
