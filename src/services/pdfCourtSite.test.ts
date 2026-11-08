import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// pdf.js 는 이 시험에서 쓰지 않는다(이미 뽑은 글로 시험) — 브라우저 전용 모듈을 비워 둔다
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => { throw new Error('unused'); } }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
const { parseAuctionPdfText } = await import('./pdfAuctionImport');

// 법원경매정보 물건상세검색 인쇄본(2026타경501227)에서 뽑은 줄 글 — 파일 이름은 '프린트.pdf'
const text = readFileSync(new URL('./__fixtures__/court-site-sample.txt', import.meta.url), 'utf8');
const r = parseAuctionPdfText(text, '프린트.pdf');

describe('법원경매정보 인쇄본 읽기', () => {
  it('소재지가 주소로(파일 이름이 아니라)', () => {
    expect(r.address).toBe('인천광역시 서해구 검암동 644-1 에스클래스 비동 2층202호');
    expect(r.caseNumber).toBe('2026타경501227');
    expect([r.courtName, r.courtDept]).toEqual(['인천지방법원', '경매19계']);
    expect(r.propertyType).toBe('다세대');
  });
  it('금액 · 기일', () => {
    expect(r.appraisalValue).toBe(142000000);
    expect(r.minimumBidValue).toBe(142000000);
    expect(r.depositValue).toBe(14200000);
    expect(r.eventDate).toBe('2026-11-19');
    expect(r.auctionHistory).toEqual([{ round: '1차', date: '2026-11-19', minPrice: 142000000, result: '예정' }]);
    expect(r.caseStartDate).toBe('2026-02-11');
    expect(r.distributionRequestDate).toBe('2026-04-20');
  });
  it('면적', () => {
    expect([r.buildingAreaM2, r.landAreaM2]).toEqual([37.83, 21.91]);
    expect(r.structureType).toBe('철근콘크리트구조');
  });
});
