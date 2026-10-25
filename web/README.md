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

## 알아 둘 것

- 페이지 상태(즐겨찾기 폴더·테마·정렬 등)는 브라우저 localStorage 에만 둔다. 아직 Firebase 와 이어져 있지 않다.
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
  **지금은 쓰는 화면이 없다** — 선정물건등록은 탭 대신 상자 둘(구글드라이브 연동 | AI 자동 분석)을 나란히 둔다. 기능은 남겨 두었다가 다른 화면에 쓴다.
- UI 문구 규칙: 네 글자 문구는 띄어쓰기 없이 붙여 쓴다 (예: 선정물건, 폴더스캔).
