import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// pdf.js 는 이 시험에서 쓰지 않는다(이미 뽑은 글로 시험) — 브라우저 전용 모듈을 비워 둔다
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => { throw new Error('unused'); } }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
const { parseAuctionPdfText } = await import('./pdfAuctionImport');

// 옥션원 인쇄본(2026타경503385)에서 뽑은 줄 글
const text = readFileSync(new URL('./__fixtures__/auction1-sample.txt', import.meta.url), 'utf8');
const r = parseAuctionPdfText(text, '2026타경503385_프리스틴.pdf');

describe('옥션원 PDF 읽기', () => {
  it('머리 · 주소 · 사건', () => {
    expect(r.caseNumber).toBe('2026타경503385');
    expect(r.courtName).toBe('인천지방법원');
    expect(r.courtDept).toBe('경매19계');
    expect(r.courtPhone).toBe('032-860-1619');
    expect(r.address).toBe('인천광역시 서구 검암동 678-8 프리스틴 106동 4층 402호');
    expect(r.roadAddress).toContain('도요지로 196');
    expect(r.auctionKind).toBe('강제');
    expect([r.ownerName, r.debtorName, r.creditorName]).toEqual(['김소유', '김소유', '주택도시보증공사']);
    expect(r.saleClassification).toBe('토지·건물 일괄매각');
  });
  it('기일 · 금액 — 매각기일 회차가 지금 회차', () => {
    expect(r.eventDate).toBe('2026-11-19');
    expect(r.auctionRound).toBe('3차');
    expect(r.appraisalValue).toBe(171000000);
    expect(r.minimumBidValue).toBe(83790000);
    expect(r.minimumBidRate).toBe(49);
    expect(r.depositValue).toBe(8379000);
    expect(r.auctionHistory.map((h) => h.result)).toEqual(['유찰', '유찰', '예정', '예정']);
  });
  it('면적 · 건물', () => {
    expect([r.landAreaM2, r.landAreaPyeong]).toEqual([29.58, 8.95]);
    expect([r.buildingAreaM2, r.commonAreaM2]).toEqual([49.74, 9.72]);
    expect(r.approvalDate).toBe('2014-04-10');
    expect(r.buildingHeader.mainUse).toBe('다세대주택');
    expect(r.buildingHeader.unitTotalParking).toBe('16대');
  });
  it('임차인 세 줄', () => {
    expect(r.tenantInfoRows.map((t) => `${t.name}${t.subName}`)).toEqual(['이임차', '박전입', '주택도시보증공사(임차인이임차)']);
    expect(r.tenantInfoRows[0]).toMatchObject({ moveIn: '2021-06-10', fixed: '2021-05-12', distribution: '2023-07-21', deposit: '162,000,000원', opposition: '포기' });
    expect(r.tenantInfoRows[1]).toMatchObject({ moveIn: '2025-08-05', fixed: '미상', deposit: '미상', opposition: '없음' });
  });
  it('등기부 다섯 줄 · 관련사건 · 매각사례', () => {
    expect(r.registryRows.map((x) => `${x.order} ${x.kind} ${x.holder} ${x.extinct}`)).toEqual([
      '갑(4) 소유권이전 김소유 ', '갑(5) 압류 국(인천지방검찰청) 소멸', '을(8) 주택임차권 이임차 소멸',
      '갑(6) 가압류 (주)대한채권관리대부 소멸', '갑(7) 강제경매 주택도시보증공사 소멸',
    ]);
    expect(r.rightsClaimAmount).toBe(170025139);
    expect(r.relatedCaseRows[0]).toMatchObject({ caseNumber: '2025차전144823', kind: '지급명령' });
    expect(r.nearBidRows).toHaveLength(4);
    expect(r.nearBidRows[0]).toMatchObject({ saleInfo: '최근12개월(273건)', rate: '64.88%', expectedWinning: '110,944,800' });
    expect(r.nearestStation).toContain('검바위 (695m)');
  });
});
