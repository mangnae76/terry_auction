# 카카오 / 네이버 소셜 로그인 셋업 가이드

코드는 모두 준비되어 있고, 아래 외부 콘솔 등록 + 환경변수만 채우면 동작합니다.

## 전체 흐름

```
앱 → 카카오/네이버 OAuth (브라우저) → code/access_token 받음
  → 우리 Worker (/api-kakao-login | /api-naver-login)
  → Worker가 Firebase Custom Token 발급 (서비스 계정 JWT 서명)
  → 앱이 signInWithCustomToken() 호출 → Firebase 로그인 완료
```

## 1. Firebase 서비스 계정 키 발급 (공통)

소셜 로그인은 Firebase가 직접 지원 안 해서 Worker가 Custom Token을 발급해야 합니다.

1. https://console.firebase.google.com → `terryauction-6b374` 프로젝트
2. 톱니바퀴 → **프로젝트 설정** → **서비스 계정** 탭
3. **새 비공개 키 생성** 클릭 → JSON 파일 다운로드 (재발급 안 되니 안전한 곳에 보관)
4. 다운받은 JSON을 Worker에 등록:

```bash
cd worker
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON < ~/Downloads/your-project-firebase-adminsdk.json
```

## 2. 카카오 로그인 셋업

### 2-1. 카카오 개발자 앱 등록

1. https://developers.kakao.com → 로그인 → **내 애플리케이션** → **애플리케이션 추가하기**
2. 앱 이름: `마이턴옥션`, 사업자명 입력 → 저장
3. 좌측 **플랫폼** 메뉴:
   - **Android 등록**:
     - 패키지명: `com.terry.auction`
     - 마켓 URL: 비워두기 (Play Store 등록 후 채움)
     - 키 해시: 아래 명령어 결과 입력 (debug 키스토어 기준)
     ```bash
     keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | openssl sha1 -binary | openssl base64
     ```
4. 좌측 **카카오 로그인** 메뉴:
   - 활성화 설정: **ON**
   - **Redirect URI** 등록 (필수):
     - `com.terry.auction://oauth/kakao` (Android)
     - 웹에서도 테스트한다면 `http://localhost:5173/oauth/kakao/callback` 추가
5. 좌측 **동의항목** 메뉴:
   - 닉네임: **필수 동의**
   - 카카오계정(이메일): **선택 동의** (이메일 필요하면 필수로)
6. 좌측 **앱 설정 → 일반** → **REST API 키** 복사 (예: `abc123...`)

### 2-2. 환경변수 설정 (앱)

`.env` 파일에 추가:
```bash
VITE_KAKAO_LOGIN_REST_API_KEY=<2-1에서 복사한 REST API 키>
```

## 3. 네이버 로그인 셋업

### 3-1. 네이버 개발자 앱 등록

1. https://developers.naver.com → 로그인 → **Application** → **애플리케이션 등록**
2. 애플리케이션 이름: `마이턴옥션`
3. **사용 API**: **네이버 로그인** 선택
4. **제공 정보**: 이메일, 닉네임, 프로필 사진 체크 (필요한 것만)
5. **서비스 환경**:
   - **Android**:
     - 다운로드 URL: 비워두기
     - 패키지명: `com.terry.auction`
     - 마켓 URL: 비워두기
   - **PC 웹** (선택, 웹 테스트용):
     - 서비스 URL: `http://localhost:5173`
     - 네이버 로그인 Callback URL: `http://localhost:5173/oauth/naver/callback`
6. 등록 완료 → **내 애플리케이션 → 해당 앱** → **Client ID / Client Secret** 복사

### 3-2. 환경변수 설정 (앱)

`.env` 파일에 추가:
```bash
VITE_NAVER_CLIENT_ID=<3-1에서 복사한 Client ID>
VITE_NAVER_CLIENT_SECRET=<3-1에서 복사한 Client Secret>
```

⚠️ Client Secret을 클라이언트 코드에 두는 건 정석은 아닙니다. 추후 백엔드(Worker)에서 토큰 교환하도록 리팩토링 권장.

## 4. Worker 재배포

환경변수 설정 후:
```bash
cd worker
npx wrangler deploy
```

## 5. 앱 빌드 & 설치

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/GoldenBoyAuction-debug.apk
```

## 6. 테스트

1. 앱 실행 → 로그인 페이지에서 **카카오로 시작하기** / **네이버로 시작하기** 버튼 확인
2. 버튼 클릭 → 외부 브라우저 열림 → 카카오/네이버 로그인
3. 동의 → 자동으로 앱으로 돌아옴 (`com.terry.auction://oauth/...`)
4. Firebase에 자동 가입/로그인됨 → `/auctions/watchlist` 이동

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 버튼이 안 보임 | 환경변수 미설정 | `.env`의 `VITE_KAKAO_LOGIN_REST_API_KEY` 또는 `VITE_NAVER_CLIENT_ID` 확인 후 `npm run build` 재실행 |
| "FIREBASE_SERVICE_ACCOUNT_JSON not configured" | Worker secret 미등록 | `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON < ...json` 실행 후 redeploy |
| "카카오 토큰 검증 실패 (401)" | redirect_uri 불일치 | 카카오 콘솔에서 등록한 URI와 `com.terry.auction://oauth/kakao` 정확히 일치하는지 확인 |
| "네이버 state 불일치" | CSRF 보호 트리거 | 일반적으로 정상. 다시 시도. 자주 발생하면 OAuth 흐름이 중단되고 있는지 확인 |
| 브라우저는 열리는데 앱으로 안 돌아옴 | 커스텀 스킴 미등록 | `AndroidManifest.xml`의 `<data android:scheme="com.terry.auction" />` 인텐트 필터 확인 |
| "이미 사용 중인 UID" | 같은 카카오/네이버 계정 재시도 | 정상. 기존 Firebase 사용자에 매핑됨 |

## 보안 노트

- 네이버 Client Secret은 클라이언트 번들에 들어갑니다. 이상적으로는 Worker에 두고 토큰 교환을 위임해야 함 (추후 개선 가능).
- Firebase 서비스 계정 키는 절대 클라이언트 코드/Git에 커밋하지 말 것. Worker secret으로만 관리.
- `firestore.rules`의 `users/{uid}` 규칙은 소셜 로그인 사용자도 자동으로 자기 데이터에 격리됨 (uid 기반).
