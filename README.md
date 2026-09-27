# Terry Auction Web + App

Vue 3 기반 경매 관리 서비스입니다. 웹(Vite)과 앱(Capacitor Android/iOS) 구조를 함께 제공합니다.

## 실행 방법

```bash
npm install
cp .env.example .env
npm run dev
```

## 앱 실행 방법 (Capacitor)

```bash
# 웹 번들 생성 후 네이티브 프로젝트 동기화
npm run cap:sync

# 안드로이드 스튜디오 열기
npm run cap:android

# Xcode 열기
npm run cap:ios
```

- Android: `android/` 프로젝트가 생성됩니다.
- iOS: `ios/` 프로젝트가 생성됩니다.
- 웹 코드 수정 후 앱 반영 시 `npm run cap:sync`를 다시 실행하세요.

## 환경 변수

- `VITE_PUBLIC_DATA_API_KEY`: 공공데이터포털 서비스키
- `VITE_ENABLE_LIVE_API`: `true`면 실 API 호출, `false`면 샘플 데이터만 사용
- `VITE_ENABLE_MOLIT_API`: 국토부 실거래가 API 사용 여부 (기본 `true`)
- `VITE_ENABLE_MOLIT_RENT_API`: 아파트 전월세 API 사용 여부
- `VITE_ENABLE_OFFICETEL_TRADE_API`: 오피스텔 매매 API 사용 여부
- `VITE_ENABLE_OFFICETEL_RENT_API`: 오피스텔 전월세 API 사용 여부
- `VITE_ENABLE_VILLA_TRADE_API`: 연립다세대 매매 API 사용 여부
- `VITE_ENABLE_VILLA_RENT_API`: 연립다세대 전월세 API 사용 여부
- `VITE_ENABLE_SINGLE_TRADE_API`: 단독다가구 매매 API 사용 여부
- `VITE_ENABLE_SINGLE_RENT_API`: 단독다가구 전월세 API 사용 여부
- `VITE_ENABLE_COMMERCIAL_TRADE_API`: 상업업무용 매매 API 사용 여부
- `VITE_ENABLE_ONBID_API`: 온비드 계열 API 사용 여부 (기본 `false`)
- `VITE_ENABLE_LAND_PRICE_API`: 국토부 표준지공시지가 API 사용 여부 (기본 `true`)
- `VITE_MOLIT_APT_API_PATH`: 아파트 실거래가 상세 API 경로
- `VITE_MOLIT_APT_RENT_API_PATH`: 아파트 전월세 API 경로
- `VITE_MOLIT_OFFICETEL_TRADE_API_PATH`: 오피스텔 매매 API 경로
- `VITE_MOLIT_OFFICETEL_RENT_API_PATH`: 오피스텔 전월세 API 경로
- `VITE_MOLIT_VILLA_TRADE_API_PATH`: 연립다세대 매매 API 경로
- `VITE_MOLIT_VILLA_RENT_API_PATH`: 연립다세대 전월세 API 경로
- `VITE_MOLIT_SINGLE_TRADE_API_PATH`: 단독다가구 매매 API 경로
- `VITE_MOLIT_SINGLE_RENT_API_PATH`: 단독다가구 전월세 API 경로
- `VITE_MOLIT_COMMERCIAL_TRADE_API_PATH`: 상업업무용 매매 API 경로
- `VITE_MOLIT_LAND_API_PATH`: 표준지공시지가 API 경로
- `VITE_GEOCODE_BASE_URL`: 임장 동선 지오코딩 프록시 경로 (`/api-geo`)
- `VITE_KAKAO_REST_API_KEY`: 카카오 로컬 API 키(입력 시 OSM 429 대체 지오코딩)
- `VITE_FIREBASE_API_KEY`: Firebase 웹 앱 API 키
- `VITE_FIREBASE_AUTH_DOMAIN`: Firebase Auth 도메인
- `VITE_FIREBASE_PROJECT_ID`: Firestore 프로젝트 ID
- `VITE_FIREBASE_STORAGE_BUCKET`: Firebase Storage 버킷
- `VITE_FIREBASE_MESSAGING_SENDER_ID`: Firebase Sender ID
- `VITE_FIREBASE_APP_ID`: Firebase 앱 ID

## Firestore 저장 구조

- 컬렉션: `auctions`
- 문서 ID: `auction.id` (UUID)
- 웹/앱 모두 Firestore `onSnapshot` 실시간 동기화 사용
- Firebase 설정이 없으면 로컬 샘플 모드로 자동 폴백

### Firestore 보안 규칙 예시 (2명 사용 초기)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /auctions/{document=**} {
      allow read, write: if true;
    }
  }
}
```

초기 테스트 후에는 반드시 인증 기반 규칙으로 바꾸는 것을 권장합니다.

## 구현 포인트

- 목록 화면: 검색(주소/사건번호), 상태 필터, 카드형 KPI/물건 리스트
- 상세 화면: 기본정보, 물건조사, 권리분석 섹션
- 상세 공용화: 생성(`/auctions/new`)과 수정(`/auctions/:id/edit`)에서 같은 화면 사용
- API 연결: 공공데이터 API 호출 후 화면 모델로 정규화(실패 시 샘플 데이터 유지)
- 데이터 저장: Firestore 실시간 동기화 기반 CRUD

## 주의 사항

공공데이터 OpenAPI는 서비스별로 CORS 정책/응답 포맷(XML/JSON)이 다릅니다. 개발 환경에서는 Vite 프록시(`/api-data`)를 통해 브라우저 CORS 오류를 줄였습니다.  
`403` 응답이 나오면 서비스키 문제보다 **해당 API 데이터셋 활용신청/승인 상태**가 원인인 경우가 많습니다.
