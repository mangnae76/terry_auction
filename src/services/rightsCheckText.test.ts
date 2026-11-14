import { describe, expect, it } from 'vitest';
import { ILLEGAL_BLDG_TIP, rightsCheckText } from './rightsCheckText';

describe('rightsCheckText', () => {
  it('위반건축물 — 건축물대장 문장을 바꾼다', () => {
    expect(rightsCheckText('위반건축물 표시', '서류에 표시가 없습니다. 건축물대장(정부24)을 확인하세요.')).toBe(`서류에 표시가 없습니다. ${ILLEGAL_BLDG_TIP}`);
  });
  it('위반건축물 — 그런 문장이 없으면 붙인다', () => {
    expect(rightsCheckText('위반건축물 표시', '매각물건명세서에 위반건축물 기재 있음.')).toBe(`매각물건명세서에 위반건축물 기재 있음. ${ILLEGAL_BLDG_TIP}`);
  });
  it('다른 항목은 그대로', () => {
    expect(rightsCheckText('대지권 등기', '건축물대장을 보세요.')).toBe('건축물대장을 보세요.');
  });
});
