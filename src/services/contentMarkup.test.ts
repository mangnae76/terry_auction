import { describe, expect, it } from 'vitest';
import { boldToHtml, htmlToBold, markupToHtml } from './contentMarkup';

describe('간단 표기 → HTML', () => {
  it('제목 · 목록 · 굵게 · 문단', () => {
    expect(markupToHtml('# 제1장 총칙\n## 제1조 (목적)\n본 약관은 **서비스** 이용 조건입니다.\n\n1. 첫째\n2. 둘째\n- 점')).toBe(
      '<h3>제1장 총칙</h3><h4>제1조 (목적)</h4><p>본 약관은 <b>서비스</b> 이용 조건입니다.</p><ol><li>첫째</li><li>둘째</li></ol><ul><li>점</li></ul>');
  });
  it('< 로 시작하는 줄은 HTML 그대로, 그 밖의 < 는 글자로', () => {
    expect(markupToHtml('<div class="doc-contact">문의</div>\na < b')).toBe('<div class="doc-contact">문의</div><p>a &lt; b</p>');
  });
  it('FAQ 답 굵게 왕복', () => {
    const html = '선정 이후부터 <b>매도까지</b> 관리합니다.';
    expect(boldToHtml(htmlToBold(html))).toBe(html);
  });
});
