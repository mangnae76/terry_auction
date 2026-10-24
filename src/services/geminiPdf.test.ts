// AI 가 낸 값이 PDF 에 정말 있는지 — 지어낸 값을 거르는 마지막 문.
import { describe, it, expect } from 'vitest';
import { foundInText } from './geminiPdf';

// PDF 에서 뽑은 글은 띄어쓰기·쉼표가 흔들린다 — 비교는 그것들을 걷어 낸 꼴로 한다
const raw = '을(7) 2022-03-31 근저당권설정 와이즈에셋대부(주) 3,000,000,000 말소기준등기 소멸 감정가 147,000,000원'
  .replace(/\s+/g, '').replace(/,/g, '');

describe('근거 확인', () => {
  it('근거 글귀가 원문에 있으면 받는다', () => {
    expect(foundInText(raw, '2022-03-31', '을(7) 2022-03-31 근저당권설정')).toBe(true);
  });
  it('띄어쓰기·쉼표가 달라도 받는다', () => {
    expect(foundInText(raw, '147000000', '감정가 147,000,000 원')).toBe(true);
  });
  it('근거가 엉뚱해도 값이 원문에 있으면 받는다', () => {
    expect(foundInText(raw, '2022-03-31', '말소기준 일자는 이렇다')).toBe(true);
  });
  it('날짜는 점·슬래시 꼴도 같은 날로 본다', () => {
    const dotted = '말소기준2022.03.31'.replace(/\s+/g, '');
    expect(foundInText(dotted, '2022-03-31', '')).toBe(true);
  });
  it('원문 어디에도 없는 값은 버린다 — 지어낸 값', () => {
    expect(foundInText(raw, '2021-11-02', '근저당 2021-11-02')).toBe(false);
    expect(foundInText(raw, '150000000', '감정가 1억5천')).toBe(false);
  });
  it('원문 글이 비어 있으면(스캔 PDF) 아무것도 받지 않는다', () => {
    expect(foundInText('', '2022-03-31', '2022-03-31')).toBe(false);
  });
});
