// 카카오 / 네이버 OAuth access token → Firebase Custom Token
//
// 흐름:
//   1. App이 카카오/네이버에서 access token을 받아 Worker에 POST
//   2. Worker가 해당 access token으로 사용자 프로필 조회 (검증 겸 닉네임/이메일 가져옴)
//   3. Worker가 Firebase Custom Token (서비스 계정 JWT) 발급
//   4. App이 받은 token으로 `signInWithCustomToken()` 호출 → Firebase user 생성
//
// 필요한 Worker secrets:
//   FIREBASE_SERVICE_ACCOUNT_JSON  — Firebase Admin 서비스 계정 JSON 전체 문자열
//                                    (Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성)
//
// 설정 예시 (CLI):
//   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON < path/to/service-account.json

interface SocialEnv {
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri: string;
}

interface KakaoUser {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: { nickname?: string; profile_image_url?: string };
  };
  properties?: { nickname?: string; profile_image?: string };
}

interface NaverUser {
  resultcode: string;
  message: string;
  response?: {
    id: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
  };
}

interface SocialProfile {
  providerId: 'kakao' | 'naver';
  externalUid: string;
  email: string;
  nickname: string;
  photoURL: string;
}

const fetchKakaoProfile = async (accessToken: string): Promise<SocialProfile> => {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`카카오 토큰 검증 실패 (${res.status})`);
  }
  const user = (await res.json()) as KakaoUser;
  if (!user.id) throw new Error('카카오 사용자 정보가 비어있습니다.');
  const nickname =
    user.kakao_account?.profile?.nickname ?? user.properties?.nickname ?? `카카오${user.id}`;
  return {
    providerId: 'kakao',
    externalUid: String(user.id),
    email: user.kakao_account?.email ?? '',
    nickname,
    photoURL: user.kakao_account?.profile?.profile_image_url ?? user.properties?.profile_image ?? '',
  };
};

const fetchNaverProfile = async (accessToken: string): Promise<SocialProfile> => {
  const res = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`네이버 토큰 검증 실패 (${res.status})`);
  }
  const user = (await res.json()) as NaverUser;
  if (user.resultcode !== '00' || !user.response?.id) {
    throw new Error(`네이버 응답 오류: ${user.message ?? user.resultcode}`);
  }
  return {
    providerId: 'naver',
    externalUid: user.response.id,
    email: user.response.email ?? '',
    nickname: user.response.nickname ?? user.response.name ?? `네이버${user.response.id.slice(0, 6)}`,
    photoURL: user.response.profile_image ?? '',
  };
};

// PEM 문자열 → CryptoKey (Web Crypto). Firebase 서비스 계정의 private_key는 PKCS#8 PEM.
const importServiceAccountKey = async (pem: string): Promise<CryptoKey> => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
};

const base64UrlEncode = (input: string | Uint8Array): string => {
  const str =
    typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode(...input));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Firebase Custom Token (RS256 JWT). audience는 identitytoolkit 고정.
const mintFirebaseCustomToken = async (
  sa: ServiceAccount,
  uid: string,
  claims: Record<string, unknown>,
): Promise<string> => {
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importServiceAccountKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
};

const jsonResponse = (body: unknown, status: number, extraHeaders: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });

export const handleSocialLogin = async (
  request: Request,
  env: SocialEnv,
  corsHeaders: Record<string, string>,
  provider: 'kakao' | 'naver',
): Promise<Response> => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405, corsHeaders);
  }

  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse(
      { error: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' },
      500,
      corsHeaders,
    );
  }

  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400, corsHeaders);
  }
  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return jsonResponse({ error: 'accessToken required' }, 400, corsHeaders);
  }

  try {
    const profile =
      provider === 'kakao'
        ? await fetchKakaoProfile(accessToken)
        : await fetchNaverProfile(accessToken);

    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
    // Firebase UID는 128자 제한. provider prefix로 충돌 방지.
    const firebaseUid = `${profile.providerId}_${profile.externalUid}`;
    const customToken = await mintFirebaseCustomToken(sa, firebaseUid, {
      provider: profile.providerId,
      email: profile.email,
      nickname: profile.nickname,
    });

    return jsonResponse(
      {
        customToken,
        profile: {
          uid: firebaseUid,
          email: profile.email,
          nickname: profile.nickname,
          photoURL: profile.photoURL,
          provider: profile.providerId,
        },
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'social login failed';
    return jsonResponse({ error: msg }, 401, corsHeaders);
  }
};
