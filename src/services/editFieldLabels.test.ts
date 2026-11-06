import { describe, it, expect } from 'vitest';
import { changedLabels, labelsText } from './editFieldLabels';
import { editLogDesc } from './editLogText';

const j = (v: unknown) => JSON.stringify(v);

describe('고친 칸 이름', () => {
  it('안쪽 칸까지 — 감정가 · 취득세, 겹치는 이름은 하나', () => {
    const was = { metrics: j({ appraisalValue: 1, minimumBidValue: 2 }), bidCost: j({ acquisitionTaxRate: 1, acquisitionTaxAmount: 10 }) };
    const now = { metrics: j({ appraisalValue: 5, minimumBidValue: 2 }), bidCost: j({ acquisitionTaxRate: 2, acquisitionTaxAmount: 20 }) };
    expect(changedLabels(['metrics', 'bidCost'], was, now)).toEqual(['감정가', '취득세']);
  });
  it('B~D안은 안 이름을 붙인다', () => {
    const was = { bidScenarios: j([{ myBidValue: 1, bidCost: { repairCost: 0 } }]) };
    const now = { bidScenarios: j([{ myBidValue: 2, bidCost: { repairCost: 5 } }]) };
    expect(changedLabels(['bidScenarios'], was, now)).toEqual(['B안 입찰가', 'B안 수리비']);
  });
  it('사람이 고친 게 아닌 칸은 빼고, 모르는 칸은 그 밖의 내용', () => {
    expect(changedLabels(['(처음)', 'sonView', 'somethingNew'], {}, {})).toEqual(['그 밖의 내용']);
  });
  it('넷부터 외 N개 · 설명 글', () => {
    expect(labelsText(['a', 'b', 'c', 'd', 'e'])).toBe('a · b · c 외 2개');
    expect(editLogDesc('물건상세 › 수익분석', undefined, ['입찰가', '취득세'])).toBe('입찰가 · 취득세 수정');
  });
});
