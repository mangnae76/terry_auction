import { describe, expect, it } from 'vitest';
import { isFailedRead, mergeReimport } from './pdfReimport';
import type { AuctionDetail } from '../types/auction';

const A = (o: Record<string, unknown>) => o as unknown as AuctionDetail;

describe('mergeReimport — 같은 사건 PDF 다시 올리기', () => {
  const old = A({
    id: 'x', caseNumber: '2026타경1', status: '임장', archived: true, hidden: false, isFieldTrip: true,
    eventDate: '2026-11-09', auctionRound: '2차', auctionHistory: [{ round: '1차' }, { round: '2차' }],
    address: '내가 고친 주소', ownerName: '', takeoverContent: 'X',
    metrics: { appraisalValue: 294000000, minimumBidValue: 205800000, myBidValue: 180000000, bidRate: 70, depositValue: 0 },
    fieldSurvey: { surveyMemo: '내 임장메모', occupantNote: '' },
  });
  const full = A({
    id: 'x', caseNumber: '2026타경1', status: '손품', archived: false, hidden: false, isFieldTrip: false,
    eventDate: '2026-12-14', auctionRound: '3차', auctionHistory: [{ round: '1차' }, { round: '2차' }, { round: '3차' }],
    address: 'PDF 주소', ownerName: '홍길동', takeoverContent: 'O',
    metrics: { appraisalValue: 294000000, minimumBidValue: 144060000, myBidValue: 144060000, bidRate: 49, depositValue: 14406000 },
    fieldSurvey: { surveyMemo: 'PDF 비고', occupantNote: 'PDF 점유' },
    importMeta: { source: 'pdf', pdfFileName: 'new.pdf' },
  });
  const m = mergeReimport(old, full);

  it('회차 · 최저가 · 매각기일은 새 PDF 값', () => {
    expect(m.eventDate).toBe('2026-12-14');
    expect(m.auctionRound).toBe('3차');
    expect(m.auctionHistory).toHaveLength(3);
    expect(m.metrics.minimumBidValue).toBe(144060000);
    expect(m.metrics.bidRate).toBe(49);
  });
  it('사용자가 정리한 내용은 그대로', () => {
    expect(m.address).toBe('내가 고친 주소');
    expect(m.metrics.myBidValue).toBe(180000000);
    expect(m.fieldSurvey.surveyMemo).toBe('내 임장메모');
    expect(m.takeoverContent).toBe('X');
  });
  it('빈 칸만 PDF 값으로 채운다', () => {
    expect(m.ownerName).toBe('홍길동');
    expect(m.metrics.depositValue).toBe(14406000);
    expect(m.fieldSurvey.occupantNote).toBe('PDF 점유');
  });
  it('단계 · 보관함 · 휴지통은 그대로', () => {
    expect(m.status).toBe('임장');
    expect(m.archived).toBe(true);
    expect(m.isFieldTrip).toBe(true);
  });
});

describe('mergeReimport — 지난번 읽기가 실패한 물건(주소 자리에 파일 이름)', () => {
  const old = A({
    id: 'y', caseNumber: '2026타경503385', status: '손품', archived: false, hidden: false, isFieldTrip: false,
    eventDate: '2026-11-08', auctionRound: '3차', auctionHistory: [], address: '2026타경503385_프리스틴', auctionKind: '임의', ownerName: '',
    courtPhone: '032-718-5560', metrics: { appraisalValue: 171000000, minimumBidValue: 83790000, myBidValue: 90000000, bidRate: 49, depositValue: 0 },
    fieldSurvey: { surveyMemo: '내 메모', occupantNote: '' },
  });
  const full = A({
    id: 'y', caseNumber: '2026타경503385', status: '손품', archived: false, hidden: false, isFieldTrip: false,
    eventDate: '2026-11-19', auctionRound: '3차', auctionHistory: [{ round: '3차' }], address: '인천광역시 서구 검암동 678-8', auctionKind: '강제', ownerName: '김소유',
    courtPhone: '032-860-1619', metrics: { appraisalValue: 171000000, minimumBidValue: 83790000, myBidValue: 83790000, bidRate: 49, depositValue: 8379000 },
    fieldSurvey: { surveyMemo: '', occupantNote: '' },
  });
  const m = mergeReimport(old, full);
  it('새 PDF 값이 앞선다', () => {
    expect(m.address).toBe('인천광역시 서구 검암동 678-8');
    expect(m.auctionKind).toBe('강제');
    expect(m.ownerName).toBe('김소유');
    expect((m as unknown as { courtPhone: string }).courtPhone).toBe('032-860-1619');
    expect(m.metrics.depositValue).toBe(8379000);
  });
  it('사용자가 적은 칸은 남는다', () => {
    expect(m.fieldSurvey.surveyMemo).toBe('내 메모');
    expect(m.metrics.myBidValue).toBe(90000000);
  });
});

describe('isFailedRead — 주소가 파일 이름이면 읽기 실패', () => {
  it('사건번호로 시작하거나 PDF 파일 이름과 같으면', () => {
    expect(isFailedRead(A({ address: '2026타경1_빌라' }))).toBe(true);
    expect(isFailedRead(A({ address: '프린트', importMeta: { source: 'pdf', pdfFieldKeys: [], pdfFileName: '프린트.pdf' } }))).toBe(true);
    expect(isFailedRead(A({ address: '인천광역시 서해구 검암동 644-1', importMeta: { source: 'pdf', pdfFieldKeys: [], pdfFileName: '프린트.pdf' } }))).toBe(false);
  });
});
