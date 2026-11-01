import { describe, it, expect } from 'vitest';
import { caseLabelOf } from './caseLabel';

describe('화면 사건번호', () => {
  it('되살린 같은 사건은 띄어서 (1) — 진짜 번호는 그대로', () => {
    expect(caseLabelOf({ caseNumber: '2026타경503385', dupNo: 1 })).toBe('2026타경503385 (1)');
    expect(caseLabelOf({ caseNumber: '2026타경503385' })).toBe('2026타경503385');
    expect(caseLabelOf(null)).toBe('');
  });
});
