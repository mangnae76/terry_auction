// AI 가 적어 준 답을 다듬는 자리 — 인수·말소를 앱이 다시 셈하는지 본다.
// (AI 는 볼 때마다 판단이 달라져 개수가 0·1·2 로 흔들렸다. 날짜만 읽혔으면 규칙은 하나다)
import { describe, it, expect } from 'vitest';
import { normalizeRightsAi, type RightsAi } from './geminiRights';

const row = (rank: string, kind: string, date: string, status: string, holder = '아무개') =>
  ({ rank, kind, date, holder, amount: '', status, note: '' });

/** 선순위 임차권 하나 · 말소기준(근저당) · 그 뒤 경매개시·압류 */
const RAW = {
  rows: [
    row('을구 9번', '주택임차권', '2022-06-07', '말소', '한국토지주택공사'),
    row('을구 1번', '근저당권', '2023-04-11', '인수', '국민은행'),
    row('갑구 6번', '강제경매개시결정', '2026-02-23', '인수', '서울보증보험 주식회사'),
    row('갑구 7번', '압류', '2026-03-18', '인수', '국민건강보험공단'),
  ],
} as unknown as Partial<RightsAi>;

describe('인수·말소는 앱이 다시 셈한다', () => {
  it('AI 가 뒤집어 적어 와도 말소기준 앞뒤로 다시 가른다', () => {
    const ai = normalizeRightsAi(RAW);
    expect(ai.takeover.count).toBe(1);
    expect(ai.takeover.items[0].kind).toBe('주택임차권');
    expect(ai.extinguish.count).toBe(3);
  });

  it('말소기준권리는 후보 가운데 가장 빠른 것 — 표에서 고른다', () => {
    const ai = normalizeRightsAi(RAW);
    expect(ai.baseRight.kind).toBe('근저당권');
    expect(ai.baseRight.rank).toBe('을구 1번');
    expect(ai.baseRight.date).toBe('2023-04-11');
  });

  it('같은 답을 여러 번 다듬어도 개수가 흔들리지 않는다', () => {
    const counts = [1, 2, 3].map(() => normalizeRightsAi(RAW).takeover.count);
    expect(new Set(counts).size).toBe(1);
  });

  it('날짜를 못 읽은 줄은 AI 판단을 그대로 둔다 — 멋대로 말소로 밀지 않는다', () => {
    const ai = normalizeRightsAi({
      rows: [...(RAW.rows ?? []), row('을구 3번', '전세권', '', '인수')],
    } as unknown as Partial<RightsAi>);
    expect(ai.takeover.count).toBe(2);
  });

  it('말소기준 후보가 하나도 없으면 AI 판단을 그대로 둔다', () => {
    const ai = normalizeRightsAi({
      rows: [row('을구 2번', '주택임차권', '2020-01-01', '인수')],
    } as unknown as Partial<RightsAi>);
    expect(ai.takeover.count).toBe(1);
  });

  it('난이도·결론이 정해진 값이 아니면 버린다', () => {
    const ai = normalizeRightsAi({
      evict: { level: '아주 높음', reason: '', strategy: '', advice: '' },
      conclusion: { verdict: '글쎄요', text: '' },
    } as unknown as Partial<RightsAi>);
    expect(ai.evict.level).toBe('');
    expect(ai.conclusion.verdict).toBe('');
  });

  it('권리가 없으면 요약을 비워 두지 않는다', () => {
    const ai = normalizeRightsAi({ rows: [] } as unknown as Partial<RightsAi>);
    expect(ai.takeover.summary).toBe('인수할 권리 없음');
    expect(ai.extinguish.summary).toBe('말소될 권리 없음');
  });
});
