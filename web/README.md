# 마이턴옥션 웹 (web/)

앱(`src/`)과 같은 저장소 안에서 따로 노는 **웹 버전**이다.
앱 화면(`src/pages/`)·앱 설정(`vite.config.ts`·`package.json`·`tsconfig*`)은 건드리지 않고,
**앱의 로직(`src/services`·`src/utils`)만 가져다 같이 쓴다.**

## 들어 있는 것

| 경로 | 무엇 |
| --- | --- |
| `pages/selected.src.html` | 선정물건 · 선정물건등록 페이지 원본 (한 파일. 로고 자리는 `{{LOGO_WHITE}}`) |
| `lib/shared.entry.js` | 웹이 앱과 같이 쓰는 로직 목록 — 앱 `src/` 를 그대로 import 한다 |
| `build.mjs` | 빌드 스크립트 — 아래 두 파일을 만든다 |
| `site/selected.html` | 바로 열리는 페이지 (로고가 들어간 완성본) |
| `site/pdfparse.js` | `lib/shared.entry.js` 를 묶은 파일 (pdf.js 포함, 전역 이름 `TAPdf`) |

## 같이 쓰는 앱 로직 (`window.TAPdf`)

| 함수 | 앱 원본 |
| --- | --- |
| `parsePdfBytes`, `parseAuctionPdfText` | `src/services/pdfAuctionImport.ts` — 선정물건등록 PDF 읽기 규칙 |
| `pickCurrentRound` | `src/utils/auctionSchedule.ts` — 기일내역에서 이번 회차 |
| `addressParts`, `addressWithName`, `hasBuildingName` | `src/utils/addressName.ts` — 주소 토막(지번·건물명·동층호) |
| `propTypeName`, `propTypeMark` | `src/utils/propertyType.ts` — 물건 종류 이름·배지 |
| `taxChainOf`, `taxRateOf`, `taxDeductOf`, `incomeTaxOf`, `localTaxOf`, `afterTaxProfitOf` | `src/services/profitMath.ts` — 세율 구간·누진공제·세후 순이익 |

앱 쪽 로직을 고치면 웹은 **다시 빌드만** 하면 같은 규칙을 쓴다.
더 같이 쓸 함수가 생기면 `lib/shared.entry.js` 에 한 줄 export 를 더한다.

## 빌드

저장소 맨 위(`terry_auction/`)에서:

```
node web/build.mjs
```

- 앱 빌드(`npm run build`)와 상관없다. 앱의 `vite.config.ts` 와 `.env` 는 읽지 않는다.
- 결과는 `web/site/` 에 생긴다. `site/selected.html` 을 브라우저로 열면 된다
  (`pdfparse.js` 는 같은 폴더에 있어야 PDF등록이 동작한다).
- 루트 `.gitignore` 가 `dist` 를 막고 있어서 결과 폴더 이름을 `site/` 로 했다.

## 앱 자료 연결

- 웹은 앱과 **같은 Firebase 프로젝트·같은 로그인**을 쓴다. 앱의 `authStore` · `auctionStore`(Pinia)를 `shared.entry.js` 로 그대로 가져와 쓴다.
  `/web` 은 앱과 같은 주소라, 같은 브라우저에서 앱에 로그인해 두었으면 웹도 저절로 로그인된다.
- 로그인 전에는 예시 물건을 보여 준다. 로그인하면 앱 Firestore 물건(`auctions`)으로 바뀐다.
- 웹에서 바꾼 중요도·단계·보관·휴지통·완전삭제·PDF 등록은 앱 저장소 함수(`saveAuction` · `setStatus` · `archiveAuctions` · `hideAuctions` · `restoreHiddenAuctions` · `purgeAuctions` · `importParsedPdfAuctions`)로 적는다.
- 물건상세 셈은 앱 물건상세에서 글자 그대로 옮겨 온 공통 파일을 앱과 웹이 같이 쓴다 — 정보요약·기본정보 `src/services/detailSummary.ts`, 입지정보 `src/services/locationInfo.ts`. 카카오 주변환경·좌표는 앱의 `kakaoNearby` · `routeOptimizer` 그대로.
- 빌드는 루트 `.env` 에서 `VITE_FIREBASE_*` 여섯 줄과 `VITE_KAKAO_REST_API_KEY`(앱 번들이 이미 싣는 키)만 읽는다. 다른 키는 읽지 않는다.

## 알아 둘 것

- 화면 설정(즐겨찾기 폴더·테마·정렬 등)은 브라우저 localStorage 에 둔다. 물건 자료는 위 '앱 자료 연결'대로 Firebase 를 쓴다.
- **구글드라이브 폴더스캔**은 어디서 열렸는지에 따라 길이 갈린다.
  - 우리 주소(`https://terryauction-6b374.web.app/web`)·내 컴퓨터: 앱과 같은 워커(`/api-drive-folder`, `/api-drive-download`)로 읽는다
    (`TAPdf.listDrivePdfFiles` · `parseDrivePdfFile`). 워커 주소는 `build.mjs` 의 `API_BASE`.
    **'링크가 있는 모든 사용자' 공유 폴더만** 읽히고, 하위 폴더는 내려가지 않는다 — PDF 가 바로 들어 있는 폴더를 등록한다.
  - claude.ai 아티팩트 안: 바깥 주소로 못 나가므로 보는 사람의 claude.ai Google Drive 연결로 읽는다.
- **AI 자동 파싱**: 앱과 같은 `geminiPdf` (키 확인 · 이 기기 저장 `myturn.gemini.key` · 빈칸만 채우기)를 쓴다. 앱과 같은 브라우저면 키도 같이 쓴다.
- **원칙: 웹은 앱을 따라간다.** 웹을 고칠 땐 앱의 같은 화면을 먼저 보고 같은 로직을 `shared.entry.js` 로 가져다 쓴다.
- 수익률 분석 카드의 셈은 페이지 안에 간이로 들어 있다. 앱과 똑같이 맞추려면 `TAPdf.taxChainOf` 로 바꾼다.
- 주소 등록 창: 추가·체크는 바로 반영, 삭제는 한 번 묻고 지운다, 수정은 줄의 저장을 눌러야 들어간다
  (claude.ai 에 마지막으로 올라간 판 기준).
- **머리 짜임**: 남색 머리띠(오른쪽 위 로그아웃 위에 공지·결제하기 | 알림·밤낮) → [하위 탭 줄] → 필터 상자 → 경로(홈 › …) → 본문.
  하위 탭은 `SUBTABS` 에 화면별로 적는다. **있는 화면만** 머리띠 아래 띠(바탕은 아래 띠와 같은 흐린 파랑 `--band`)를 한 단 두고 아래를 `#D8E0EE`(밤 화면 `#2a3650`) 선으로 나눈다.
  없는 화면은 그 줄 없이 필터 상자가 머리띠에 바로 붙는다. 하위 탭이 있으면 스크롤해도 탭 줄과 필터 상자가 함께 붙는다.
  지금 쓰는 화면: **물건상세**(`#/item/<id>`) — 물건정보 · 권리분석 · 손품+현장 · 가격정보 · 입찰가산정 (앱 AuctionDetailPage 의 TABS). 선정물건등록은 탭 대신 상자 둘을 나란히 둔다.
- **물건상세**: 선정물건 카드를 누르면 열린다. 필터 상자 자리에 앱의 고정 카드(경매·사건번호·단계·보관/휴지통 / 종류·중요도·매각구분·면적 / 주소)를 둔다.
  탭 카드는 앱과 같은 순서다. 웹 물건에 없는 자료(등기·임차인·현장조사·실거래·사진 등)는 지어내지 않고 빈 칸('웹에는 아직 연결되지 않은 자료')으로 둔다 — Firebase 연결 뒤 채운다.
- **틀 고정은 공통 모듈** (모든 화면): 남색 머리띠 → [하위 탭 줄] → 필터 상자를 한 덩어리로 위에 붙인다.
  새 화면은 필터·도구 상자를 `.toolbar-shell` 로 감싸기만 하면 된다. 높이는 CSS 변수 `--gnb-h`(66) · `--subtab-h`(45).
  붙었을 때 그림자(`.stuck`)도 같이 따라온다. **화면 폭과 상관없이** 고정한다 — 좁아서 머리띠가 두 줄이 되면 `syncStickTop()` 이 실제 높이로 맞춘다.
- UI 문구 규칙: 네 글자 문구는 띄어쓰기 없이 붙여 쓴다 (예: 선정물건, 폴더스캔).
