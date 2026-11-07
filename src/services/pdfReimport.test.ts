import { describe, expect, it } from 'vitest';
import { mergeReimport } from './pdfReimport';
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
