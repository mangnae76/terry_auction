// 웹이 앱과 함께 쓰는 로직 — 앱의 src/ 를 고치지 않고 그대로 가져다 한 파일(site/pdfparse.js)로 묶는다.
// 페이지에서는 window.TAPdf.<함수> 로 부른다. 앱 쪽 로직이 바뀌면 node web/build.mjs 만 다시 돌리면 된다.

// pdf.js 를 별도 워커 파일 없이 페이지 안(메인 스레드)에서 돌린다 — 한 장짜리 페이지라 워커 파일을 따로 두지 않는다
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
globalThis.pdfjsWorker = pdfjsWorker;

// PDF 읽기 — 앱 선정물건등록(PdfImportPage)과 같은 규칙
export { parsePdfBytes, parseAuctionPdfText } from '../../src/services/pdfAuctionImport';
// 구글드라이브 폴더 읽기 — claude.ai 바깥(우리 주소)에서 열렸을 때 앱과 같은 워커로 읽는다
export { listDrivePdfFiles, parseDrivePdfFile, downloadDrivePdfBytes } from '../../src/services/pdfAuctionImport';
// AI 자동 파싱 — 앱과 같은 Gemini 키 보관 · 키 확인 · 빈칸 채우기 (키는 이 기기 localStorage 'myturn.gemini.key')
export {
  getGeminiKey, setGeminiKey, clearGeminiKey, isGeminiOn, setGeminiOn, testGeminiKey, fillWithGemini, AI_FIELD_LABELS,
} from '../../src/services/geminiPdf';
// 기일내역에서 이번 회차 고르기
export { pickCurrentRound } from '../../src/utils/auctionSchedule';
// 주소 → 지번 · 건물명 · 동층호 토막
export { addressParts, addressWithName, hasBuildingName } from '../../src/utils/addressName';
// 물건 종류 이름·배지 글자
export { propTypeName, propTypeMark } from '../../src/utils/propertyType';
// 수익 셈(세율 구간 · 누진공제 · 세후 순이익) — 입찰가산정과 같은 셈
export { taxChainOf, taxRateOf, taxDeductOf, incomeTaxOf, localTaxOf, afterTaxProfitOf } from '../../src/services/profitMath';
