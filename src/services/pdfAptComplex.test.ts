// 탱크옥션 PDF 단지정보 — 한글로 시작하는 값 · 줄 끝 값 · 체납조사(본건) 꼴(2026-11-10)
import { describe, expect, it, vi } from 'vitest';
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => null }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
import { parseAuctionPdfText } from './pdfAuctionImport';

const text = [
  '단지정보',
  '단지명 안산파크푸르지오 세대수 1,129세대 동 수 8개동 사용승인일 2018-09-21',
  '시공사 (주)대우건설 주차 수 1,628대 세대당 주차 1.44대 난방 방식 지역난방',
  '난방 연료 열병합 용적율 258.00% 건폐율 14.00% 최고층 35층',
  '최저층 28층 관리소번호 031-000-0000',
  '체납조사(본건) 2026-10-01 체납금액 320,000원',
  '편의시설 대형상가(홈플러스)',
  '면적 종류 83㎡,\u0001102㎡,\u0001114D㎡',
  '전기차충전소 40대',
  '동호수/공시가격',
].join('\n');

describe('단지정보', () => {
  const r = parseAuctionPdfText(text, 'x.pdf');
  it('한글로 시작하는 값과 줄 끝 값도 읽는다', () => {
    expect(r.aptComplexInfo).toMatchObject({
      name: '안산파크푸르지오', approvalDate: '2018-09-21', contractor: '(주)대우건설', parkingTotal: '1,628대',
      heatingType: '지역난방', heatingFuel: '열병합', managementPhone: '031-000-0000',
      facilities: '대형상가(홈플러스)', areaTypes: '83㎡, 102㎡, 114D㎡', evCharger: '40대',
    });
  });
  it('체납조사(본건) · 체납금액', () => {
    expect(r.arrearsInfo).toMatchObject({ surveyDate: '2026-10-01', amount: '320,000원' });
  });
});
