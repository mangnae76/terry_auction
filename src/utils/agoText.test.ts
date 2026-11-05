import { describe, it, expect } from 'vitest';
import { agoText } from './agoText';

describe('agoText — 마이페이지와 같은 말', () => {
  const now = new Date(2026, 10, 5, 15, 0).getTime();
  it('1분 안은 방금', () => { expect(agoText(now - 30_000, now)).toBe('방금'); });
  it('한 시간 안은 분', () => { expect(agoText(now - 5 * 60_000, now)).toBe('5분 전'); });
  it('같은 날은 시간', () => { expect(agoText(now - 3 * 3600_000, now)).toBe('3시간 전'); });
  it('잘못된 값은 빈 글', () => { expect(agoText('없음', now)).toBe(''); });
});
