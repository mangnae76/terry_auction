# 개발 환경 안내 (마이턴 옥션)

이 저장소에서 한 파트를 맡아 개발할 분을 위한 문서입니다.
아래 순서대로 따라오면 기존 개발 환경과 같은 상태가 됩니다.

---

## 1. 한눈에

| 항목 | 값 |
|---|---|
| 프레임워크 | Vue 3.5 (`<script setup>` + TypeScript) |
| 빌드 도구 | Vite 8 (rolldown) |
| 상태 관리 | Pinia 3 |
| 라우터 | Vue Router 5 |
| 백엔드 | Firebase (Auth + Firestore + Hosting) |
| 앱 | Capacitor 8 (Android / iOS) |
| 지도 | Leaflet 1.9 |
| PDF 파싱 | pdfjs-dist 5 |
| 타입 검사 | TypeScript 6 + vue-tsc 3 |
| 저장소 | https://github.com/mangnae76/terry_auction |

테스트 러너·린터·포매터는 **쓰지 않습니다.** 품질 기준은 `npm run build`(타입 검사 포함)가 통과하는 것입니다.

---

## 2. 준비물

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | **22.12.0** | 그대로 맞추기를 권합니다 (nvm 사용 시 `nvm install 22.12.0`) |
| npm | **10.9.0** | Node 22.12 에 딸려 옵니다 |
| Git | 아무 최신 버전 | |
| Android Studio / Xcode | 앱 빌드할 때만 | 웹만 손본다면 필요 없습니다 |

---

## 3. 시작하기

```bash
git clone https://github.com/mangnae76/terry_auction.git
cd terry_auction
npm install
cp .env.example .env     # 키 값은 따로 전달받으세요
npm run dev              # http://localhost:5173
```

`.env` 는 **저장소에 올리지 않습니다.** 키는 담당자에게 따로 받으세요.

### 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (외부 API 프록시 포함) |
| `npm run build` | **타입 검사 + 빌드.** 커밋 전에 반드시 통과시킬 것 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run cap:sync` | 빌드 후 네이티브 프로젝트 동기화 |
| `npm run cap:android` / `cap:ios` | 안드로이드 스튜디오 / Xcode 열기 |

---

## 4. 환경 변수 (`.env`)

`.env.example` 에 전체 목록과 설명이 있습니다. 묶음별로 보면:

| 묶음 | 키 | 없으면 |
|---|---|---|
| Firebase | `VITE_FIREBASE_*` (6개) | **로그인·저장 전부 불가.** 반드시 필요 |
| 공공데이터포털 | `VITE_PUBLIC_DATA_API_KEY` | 실거래가·건축물대장 조회 불가 |
| 카카오 | `VITE_KAKAO_REST_API_KEY` | 주소 검색·길찾기 불가 |
| 소셜 로그인 | `VITE_KAKAO_LOGIN_REST_API_KEY`, `VITE_NAVER_*` | 비워 두면 해당 버튼이 안 보입니다 (정상) |
| 기능 스위치 | `VITE_ENABLE_*` | `false` 면 샘플 데이터로 동작 |
| 프록시 | `VITE_API_BASE` | 운영/앱 빌드에서만 사용. 개발 중에는 비워 둡니다 |
| 한국은행 ECOS | `VITE_ECOS_API_KEY` | **현재 비어 있음** (주택가격지수 기능 보류 중) |

---

## 5. 폴더 구조

```
src/
├── pages/        화면 (38개) — 라우터가 가리키는 단위
├── components/   화면 사이에 공유하는 조각 (18개)
├── services/     글·규칙·외부 연동 (43개)  ← 로직은 되도록 여기
├── stores/       Pinia 스토어 (5개) — auction, finance, interior, auth, schedule
├── utils/        작은 순수 함수 (7개) — 주소·전화·단계 이름 등
├── types/        타입 정의 (auction, finance, courtAuction)
├── router/       라우트 목록
├── styles/       전역 토큰
└── assets/       이미지·아이콘
```

### 중요한 규칙 — **공통 로직은 `services/` 또는 `utils/` 로**

이 저장소에서 가장 자주 지적되는 부분입니다. 같은 글·같은 셈이 두 화면에 복사되면 반드시 어긋납니다.

- 화면에 보이는 **글(약관·도움말·안내 문구)** → `services/` 의 데이터 모듈 (`legalTerms.ts`, `supportFaq.ts`, `pointPolicy.ts`, `trialInfo.ts` …)
- **값·요율** → `services/billingPlans.ts` 처럼 한 곳에서 정의하고 화면은 가져다 씁니다
- **작은 변환 함수** → `utils/` (`address.ts`, `phone.ts`, `stageLabel.ts` …)
- 화면(`.vue`)은 **그리기만** 합니다

---

## 6. 코드 스타일

- `<script setup lang="ts">` + `<style scoped>`
- 주석은 **한국어로, 왜 그렇게 했는지**를 적습니다 (무엇을 하는지는 코드가 말합니다)
- 들여쓰기 2칸, 작은따옴표, 세미콜론 사용
- 전역 CSS 는 `src/style.css` — **모든 `button` 에 `border-radius: 8px` 과 테두리가 걸려 있습니다**

### 함정 하나 — 탭 밑줄

전역 `button` 규칙의 둥근 모서리 때문에, 탭의 선택 밑줄을 `border-bottom` 으로 그리면 **양끝이 말려 U 자**로 보입니다. 반드시 `::after` 막대로 그리세요.

```css
.tab { position: relative; border: none; border-radius: 0; padding-bottom: 12px; }
.tab.on::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 3px; background: #1f3a72; border-radius: 2px;
}
```

본보기: `AuctionDetailPage.vue` 의 `.adp-tab.active::after`, `PointsPage.vue` 의 `.pt-tab.on::after`

---

## 7. Firebase

- 프로젝트: `terryauction-6b374`
- 쓰는 것: **Auth**(이메일/비밀번호 + 카카오·네이버 커스텀 토큰), **Firestore**, **Hosting**
- 규칙 파일: `firestore.rules` — 컬렉션마다 `uid` 로 본인 것만 접근합니다

### 접근 제한 (중요)

현재 **허용된 이메일 3개만** 앱을 쓸 수 있습니다.

- 화면 차단: `src/services/accessControl.ts` 의 `ALLOWED_EMAILS`
- 실제 차단: `firestore.rules` 의 `isAllowedUser()`

**두 곳을 같이 고치고 규칙을 다시 배포해야** 합니다. 한쪽만 고치면 화면은 열리는데 자료를 못 읽습니다.

### 로그인 없이 열리는 화면

라우터에서 `meta: { public: true }` 는 **`/login` 과 `/signup` 둘뿐**입니다. 개발 중 다른 화면을 잠깐 열어 보려고 추가했다면 **반드시 되돌리세요.**

```bash
grep -c 'public: true' src/router/index.ts   # 항상 2 여야 합니다
```

### 데이터 구조

컬렉션과 필드는 **[docs/DB.md](./DB.md)** 에 따로 정리해 두었습니다. 개발 전에 꼭 읽으세요.

---

## 8. 외부 API 프록시

경매·실거래·지도 API 는 CORS 가 막혀 있어 **직접 호출하지 않습니다.**

- **개발 중**: `vite.config.ts` 의 프록시가 처리합니다 (`/api-data`, `/api-kakao`, `/api-court`, `/api-naver-land`, `/api-ecos`, `/api-geo`, `/api-vworld`, `/api-osrm`, `/api-onbid`, `/api-kakao-navi`)
- **운영·앱**: `worker/` 의 Cloudflare Worker 가 같은 일을 합니다. `VITE_API_BASE` 에 Worker 주소를 넣습니다

새 외부 API 를 붙인다면 **두 곳 모두**에 경로를 추가해야 운영에서도 동작합니다.

---

## 9. 배포

```bash
npm run build
npx -y firebase-tools@latest deploy --only hosting     # 화면
npx -y firebase-tools@latest deploy --only firestore:rules   # 규칙 고쳤을 때
```

- 운영 주소: https://terryauction-6b374.web.app
- `index.html` 은 캐시하지 않고(`no-store`), `/assets/**` 는 1년 캐시합니다 — 배포하면 바로 반영됩니다

---

## 10. 앱 (Capacitor)

- appId `com.terry.auction` / appName `마이턴옥션` / webDir `dist`
- 웹 코드를 고친 뒤에는 `npm run cap:sync` 를 다시 돌려야 앱에 반영됩니다
- 앱과 웹을 가르는 기준: `main.ts` 가 `<html>` 에 `is-app` / `is-web` 클래스를 붙입니다. **웹 전용 모양은 `.is-web` 아래에만** 적으세요

---

## 11. 작업 방식

- 기본 브랜치는 `main` 입니다 (현재 608 커밋)
- 커밋 전에 **`npm run build` 통과**를 확인합니다
- 커밋 메시지는 한국어로, **무엇을 왜 바꿨는지** 적습니다
- `.env`, 키 값, 실제 주소·전화번호 같은 개인 자료는 **커밋하지 않습니다**

---

## 12. 먼저 읽어 두면 좋은 파일

| 파일 | 왜 |
|---|---|
| `src/router/index.ts` | 화면 전체 지도 |
| `src/types/auction.ts` | 물건 데이터 모양 — 이 앱의 중심 |
| `src/services/alerts.ts` | 알림 규칙. "데이터 모듈 + 화면은 그리기만" 구조의 좋은 예 |
| `src/components/AppMobileHeader.vue` | 모든 화면 위에 올라가는 머리글 |
| `docs/DB.md` | **데이터 구조 (Firestore) — 개발 전에 꼭** |
| `docs/HANDOFF.md` | 이전 인수인계 문서 |
| `README.md` | 환경 변수 전체 설명 |
