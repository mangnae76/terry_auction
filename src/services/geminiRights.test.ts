// AI 가 적어 준 답을 다듬는 자리 — 인수·말소를 앱이 다시 셈하는지 본다.
// (AI 는 볼 때마다 판단이 달라져 개수가 0·1·2 로 흔들렸다. 날짜만 읽혔으면 규칙은 하나다)
import { describe, it, expect } from 'vitest';
import { normalizeRightsAi, type RightsAi } from './geminiRights';

const row = (rank: string, kind: string, date: string, status: string, holder = '아무개') =>
  ({ rank, kind, date, holder, amount: '', status, note: '' });

/** 선순위 임차권 하나 · 말소기준(근저당) · 그 뒤 경매개시·압류 */
const RAW = {
  rows: [
    row('을구 9번', '주택임차권', '2022-06-07', '소멸', '한국토지주택공사'),
    row('을구 1번', '근저당권', '2023-04-11', '인수', '국민은행'),
    row('갑구 6번', '강제경매개시결정', '2026-02-23', '인수', '서울보증보험 주식회사'),
    row('갑구 7번', '압류', '2026-03-18', '인수', '국민건강보험공단'),
  ],
} as unknown as Partial<RightsAi>;

describe('인수·소멸은 AI 가 가르고, 앱은 세기만 한다', () => {
  it('AI 가 적어 준 그대로 센다 — 판단을 뒤집지 않는다', () => {
    const ai = normalizeRightsAi(RAW);
    expect(ai.takeover.count).toBe(3);
    expect(ai.extinguish.count).toBe(1);
    expect(ai.rows.find((r) => r.kind === '주택임차권')?.status).toBe('소멸');
  });

  it('말소기준권리는 AI 가 적어 준 것을 쓴다', () => {
    const ai = normalizeRightsAi({
      ...RAW,
      baseRight: { rank: '갑구 6번', kind: '강제경매개시결정', date: '2026-02-23', holder: '서울보증보험', evidence: '' },
    } as unknown as Partial<RightsAi>);
    expect(ai.baseRight.kind).toBe('강제경매개시결정');
    expect(ai.baseRight.rank).toBe('갑구 6번');
  });

  it('말소기준권리를 안 적어 왔으면 표에서 가장 빠른 후보를 고른다', () => {
    const ai = normalizeRightsAi(RAW);
    expect(ai.baseRight.kind).toBe('근저당권');
    expect(ai.baseRight.date).toBe('2023-04-11');
  });

  it('난이도·결론이 정해진 값이 아니면 버린다', () => {
    const ai = normalizeRightsAi({
      evict: { level: '아주 높음', reason: '', strategy: '', advice: '' },
      conclusion: { verdict: '글쎄요', text: '' },
    } as unknown as Partial<RightsAi>);
    expect(ai.evict.level).toBe('');
    expect(ai.conclusion.verdict).toBe('');
  });

  it('개수와 아래 한 줄이 어긋나면 표에서 만든 글로 바꾼다', () => {
    const ai = normalizeRightsAi({
      rows: RAW.rows,
      takeoverSummary: '인수할 권리 없음',   // 인수가 3건인데 없다고 적어 왔다
    } as unknown as Partial<RightsAi>);
    expect(ai.takeover.count).toBe(3);
    expect(ai.takeover.summary).not.toContain('없음');
  });

  it('개수와 맞는 한 줄이면 AI 가 쓴 글을 그대로 쓴다', () => {
    const ai = normalizeRightsAi({
      rows: RAW.rows,
      takeoverSummary: '선순위 주택임차권 (인수 주의)',
    } as unknown as Partial<RightsAi>);
    expect(ai.takeover.summary).toBe('선순위 주택임차권 (인수 주의)');
  });

  it('권리가 없으면 요약을 비워 두지 않는다', () => {
    const ai = normalizeRightsAi({ rows: [] } as unknown as Partial<RightsAi>);
    expect(ai.takeover.summary).toBe('인수할 권리 없음');
    expect(ai.extinguish.summary).toBe('소멸될 권리 없음');
  });
});
