# 데이터 구조 (Firestore)

이 앱이 쓰는 모든 컬렉션과 그 안에 담기는 값입니다.
개발 전에 이 문서와 `src/types/auction.ts`, `src/types/finance.ts` 를 먼저 보세요.

- Firebase 프로젝트: `terryauction-6b374`
- 접근 규칙: `firestore.rules`
- **서브컬렉션은 쓰지 않습니다.** 모두 최상위 컬렉션이고, 문서마다 `uid` 로 주인을 가립니다.

---

## 1. 접근 규칙 (먼저 읽기)

규칙은 두 가지 꼴뿐입니다.

```js
// (가) 본인 것만 — 문서의 uid 가 로그인한 사람과 같아야 한다
allow read, update, delete: if isAllowedUser() && resource.data.uid == request.auth.uid;
allow create:              if isAllowedUser() && request.resource.data.uid == request.auth.uid;

// (나) 문서 ID 가 곧 uid 인 것 (users, userPrefs, photoUsage)
allow read, write: if isAllowedUser() && request.auth.uid == uid;
```

`isAllowedUser()` 는 **허용 이메일 목록**을 확인합니다 — `src/services/accessControl.ts` 의 `ALLOWED_EMAILS` 와 **항상 같이** 고쳐야 합니다.

> 새 컬렉션을 만들면 `firestore.rules` 에 블록을 추가하고 배포해야 합니다.
> 규칙에 없는 컬렉션은 **기본 거부**라 읽기·쓰기가 전부 막힙니다.
> `npx -y firebase-tools@latest deploy --only firestore:rules`

---

## 2. 컬렉션 한눈에

| 컬렉션 | 문서 ID | 담는 것 | 규칙 |
|---|---|---|---|
| `users` | uid | 계정 프로필·연락처 | (나) |
| `userPrefs` | uid | 사용자별 앱 설정 | (나) |
| `auctions` | 자동 | **물건 (이 앱의 중심)** | (가) |
| `auctionPhotos` | 자동 | 현장사진 (장당 1문서) | (가) |
| `photoUsage` | uid | 사진 용량 누계 | (나) |
| `fieldTrips` | 자동 | 임장 동선 | (가) |
| `financeCashFlows` | 자동 | 자금관리 — 입출금 | (가) |
| `financeBusinessExpenses` | 자동 | 자금관리 — 사업지출 | (가) |
| `financeFuelMeal` | 자동 | 자금관리 — 유류·식대 | (가) |
| `financeItemPurchases` | 자동 | 자금관리 — 물품구매 | (가) |
| `interiorExpenses` | 자동 | 낙찰이후 — 인테리어 | (가) |
| `adminSnapshots` | 자동 | 분석 도구 — 지번 분석 박제 | (가) |
| `cacheDongTrades` 외 4개 | 자동 | 공공데이터 캐시 | **공용** (로그인만 하면 모두 읽고 씀) |

---

## 3. 컬렉션별 상세

### `users/{uid}` — 계정

세 벌의 값이 한 문서에 겹쳐 쌓입니다 (`setDoc(..., { merge: true })`).

| 필드 | 타입 | 어디서 쓰는지 |
|---|---|---|
| `uid` `email` `nickname` `createdAt` | string | 로그인 기본 (`authRepository.UserProfile`) |
| `realName` `phone` `region` `joinPath` `joinPathDetail` `smsOptIn` `agreedAt` | | 회원가입에서 받는 값 (`SignupExtra`) |
| `emailId` `emailDomain` `emailOptIn` `phone1~3` `address1` `address2` | | 내 정보 수정 (`AccountDetail`) |

### `userPrefs/{uid}` — 앱 설정

`src/services/userPrefsRepository.ts` 의 `UserPrefs` 가 전부입니다. 주요 칸:

| 필드 | 담는 것 |
|---|---|
| `agencies` | 자주 쓰는 중개업소 목록 |
| `alertPrefs` | 알림 켜고 끈 값 (`services/alerts.ts` 의 `AlertKey`) |
| `postWinDay` / `postWinBiz` / `postWinLoan` / `postWinEvict` | 낙찰이후 탭별로 **사용자가 고친 표** |
| `postWin*Version` / `postWin*Edited` | 기본 글의 판 번호 / 손으로 고쳤는지 |
| `fieldTripDraft` `fieldTripFavorites` | 임장경로 작업 중 상태·즐겨찾기 |
| `adminRegionManual` `adminDongFilter` | 분석 도구에 손으로 넣은 값·검색조건 |
| `pdfImport*` | PDF 불러오기 화면 상태 |

> **주의**: 낙찰이후 표는 "꼴(배치·링크·체크 유무)은 코드의 기본 글, 글자만 저장본"을 따릅니다.
> 저장본이 꼴까지 덮으면 화면이 깨집니다 — `services/postWinBook.ts` 의 `load()` 를 보세요.

### `auctions/{id}` — 물건

이 앱에서 가장 큰 문서입니다. 전체 정의는 **`src/types/auction.ts` 의 `AuctionDetail`**. 묶음별로:

| 묶음 | 대표 필드 |
|---|---|
| 신원 | `uid` `caseNumber` `courtName` `courtDept` `courtPhone` `eventDate` `propertyNumber` |
| 단계 | `status`(손품·임장예정·임장완료·입찰) `bidStatus`(낙찰·유찰·취소·매도) `priority` `hidden` `archived` |
| 물건 | `address` `roadAddress` `propertyType` `buildingAreaM2` `landAreaM2` `approvalDate` `floorInfo` |
| 금액 | `metrics`(감정가·최저가·내 입찰가·보증금) `expectedSaleValue` `expectedProfitRate` |
| 산정 | `bidCost`(비용·세율) `bidScenarios`(B·C안) |
| 분석 | `rights`(권리분석) `excelAnalysis` `marketDemand` `fieldSurvey` |
| PDF 유래 | `registryRows` `tenantInfoRows` `occupancyRows` `auctionHistory` `buildingHeader` `aptComplexInfo` `pdfNearbyEnv` `importMeta` |
| 사진 | `sitePhotos` `floorPlanUrls` `exteriorUrls` `rankPhotoUrls` `extraPhotos` … (**사진 ID 목록**, 실제 이미지는 `auctionPhotos` 에) |
| 낙찰이후 | `wonDate` `sellDate` `balanceDueDate` `postWinChecks` `sellAgencyRows` `directSellRows` |

### `auctionPhotos/{photoId}` — 현장사진

| 필드 | 타입 |
|---|---|
| `uid` | string |
| `auctionId` | string |
| `dataUrl` | string (압축된 base64, **장당 900KB 이하**) |
| `bytes` | number |
| `createdAt` | number (epoch ms) |

- 장당 1문서입니다. 목록을 읽을 때 `dataUrl` 까지 받지 않도록 **물건 문서에는 ID만** 둡니다.
- 사진 몫 예산은 **900MiB** (`PHOTO_BUDGET_BYTES`). 넘으면 **오래된 사진부터 자동 삭제**합니다.

### `photoUsage/{uid}` — 용량 누계

`totalBytes`(number), `updatedAt`(number). 총량을 알려고 사진을 전부 읽지 않기 위한 문서입니다.

### `fieldTrips/{planId}` — 임장 동선

`uid` `title` `startAddress` `endAddress` `totalDistanceKm` `driveMinutes` `stayMinutes` `totalMinutes` `stopCount` `stops[]` `createdAt`

### 자금관리 4종 + 인테리어

공통 뼈대 (`FinanceBase`): `id` `uid` `createdAt` `updatedAt`

| 컬렉션 | 고유 필드 |
|---|---|
| `financeCashFlows` | `ownerName` `flowType`(입금·출금) `amount` `date` `note` |
| `financeBusinessExpenses` | `auctionId` `auctionLabel` `profitCategory` `memo` `detail` `amountWithVat` `date` `note` |
| `financeFuelMeal` | `region` `store` `category` `amount` `card` `users[]` `date` `note` |
| `financeItemPurchases` | `auctionId` `category` `description` `quantity` `unitPrice` `subtotal` `totalWithVat` `vendor` `card` `user` `shippingFee` `date` |
| `interiorExpenses` | `auctionId` `kind`(**bid**=업체비딩 / **cost**=인테리어확정) `work` `status` `startDate` `endDate` `amountWithVat` `vendor` `phone` `note` |

> 인테리어는 자금관리와 **자리를 따로 둡니다.** 한쪽에 적은 것이 다른 쪽에 보이지 않습니다.

### `adminSnapshots/{id}` — 지번 분석 박제

`uid` `label` `memo` `savedAt` `address` `kind` `years` `spot` `baseAreaM2` `price` `rate` `sale` `jeonse`
(그때 본 숫자를 그대로 박제합니다. 거래 표 전체는 담지 않습니다.)

### 캐시 5종 — **공용**

`cacheDongTrades` `cachePlaceHistory` `cacheDongUnits` `cacheTradeMonth` `cacheAptPrice`

지역·단지·달 단위라 누가 먼저 열든 값이 같습니다. 그래서 **uid 를 가리지 않고** 로그인한 사람이면 모두 읽고 씁니다. 공공데이터 API 호출 횟수를 아끼려는 자리입니다.

---

## 4. 쿼리 규칙 — 복합 색인을 만들지 않습니다

`where` 와 `orderBy` 를 같이 쓰면 Firestore 가 복합 색인을 요구합니다. 이 저장소는 색인을 만들지 않고 이렇게 피합니다.

```ts
// uid 로만 물어보고, 차례는 받아온 뒤 코드에서 매긴다
const q = query(collection(firestore, COLLECTION), where('uid', '==', uid));
```

새 조회를 붙일 때도 같은 방식을 따르세요.

---

## 5. 자료를 다룰 때

- 읽기·쓰기는 **반드시 `services/*Repository.ts` 를 거칩니다.** 화면에서 Firestore 를 직접 부르지 않습니다
- 실시간 반영이 필요한 곳은 `subscribe*` (onSnapshot), 한 번만 읽으면 되는 곳은 `load*` 를 씁니다
- 문서를 새로 만들 때 `uid` 를 빠뜨리면 **규칙에 막혀 저장되지 않습니다**
- 타입을 고치면 `src/types/` 와 이 문서를 같이 고쳐 주세요
