// AI 가 적어 준 답을 다듬는 자리 — 인수·말소를 앱이 다시 셈하는지 본다.
// (AI 는 볼 때마다 판단이 달라져 개수가 0·1·2 로 흔들렸다. 날짜만 읽혔으면 규칙은 하나다)
import { describe, it, expect } from 'vitest';
import { docMismatchOf, lastFieldOf, normalizeRightsAi, readStreamText, RIGHTS_CHECK_ITEMS, type RightsAi } from './geminiRights';

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

describe('답을 조금씩 받기(스트리밍)', () => {
  const sse = (chunks: string[]) => new Response(new ReadableStream({
    start(c) { chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x))); c.close(); },
  }));
  const line = (text: string, thought = false) =>
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text, thought }] } }] })}\r\n\r\n`;

  it('조각을 이어 붙이고, 줄이 중간에 잘려 와도 맞게 읽는다', async () => {
    const all = line('{"a":') + line('생각 중', true) + line('1}');
    let n = 0;
    const text = await readStreamText(sse([all.slice(0, 17), all.slice(17, 60), all.slice(60)]), () => { n += 1; });
    expect(text).toBe('{"a":1}');
    expect(n).toBe(3);
  });

  it('도중에 오류 조각이 오면 까닭을 알린다', async () => {
    await expect(readStreamText(sse([line('{'), 'data: {"error":{"message":"끊김"}}\n\n'])))
      .rejects.toThrow('끊김');
  });
});


describe('서류가 이 물건 것인지 (docCheck)', () => {
  it('불일치와 까닭이 다 오면 까닭을 돌려준다', () => {
    const t = '{"docCheck":{"result":"불일치","reason":"매각물건명세서의 사건번호가 2025타경12345 라 이 물건 2026타경503385 와 다릅니다"},"baseRight":';
    expect(docMismatchOf(t)).toContain('2025타경12345');
  });
  it('까닭이 아직 덜 왔거나 일치 · 확인불가면 null', () => {
    expect(docMismatchOf('{"docCheck":{"result":"불일치","reason":"매각물건명세')).toBeNull();
    expect(docMismatchOf('{"docCheck":{"result":"일치","reason":""},"baseRight":{')).toBeNull();
    expect(docMismatchOf('{"docCheck":{"result":"확인불가","reason":"흐림"}')).toBeNull();
  });
  it('따옴표가 든 까닭도 읽는다', () => {
    expect(docMismatchOf('{"docCheck":{"result":"불일치","reason":"등기부 소재지 \\"검암동 1-1\\" 이 다릅니다"}')).toBe('등기부 소재지 "검암동 1-1" 이 다릅니다');
  });
});

describe('웹 결과 탭 칸(세입자 · 확인할 일 · 진행 단계)', () => {
  it('확인할 일은 여섯 항목을 늘 같은 순서로 — 빠진 것은 확인 필요', () => {
    const ai = normalizeRightsAi({ ...RAW, checks: [{ item: '토지별도등기', status: '서류상 해당 없음', text: '표제부에 없음' }] } as unknown as Partial<RightsAi>);
    expect(ai.checks?.map((c) => c.item)).toEqual([...RIGHTS_CHECK_ITEMS]);
    expect(ai.checks?.[1].status).toBe('서류상 해당 없음');
    expect(ai.checks?.[0].status).toBe('확인 필요');
  });
  it('예전 답(칸 없음)은 빈 목록 — 화면이 다시 분석을 권한다', () => {
    const ai = normalizeRightsAi(RAW);
    expect(ai.checks).toEqual([]);
    expect(ai.tenants).toEqual([]);
  });
  it('세입자 대항력은 정해진 말만 — 아니면 확인 필요', () => {
    const ai = normalizeRightsAi({ ...RAW, tenants: [{ name: '박○○', opposable: '있음', payBack: '0원', why: '', lines: [] }] } as unknown as Partial<RightsAi>);
    expect(ai.tenants?.[0].opposable).toBe('확인 필요');
  });
  it('받는 도중 마지막으로 열린 칸을 찾는다', () => {
    expect(lastFieldOf('{"docCheck":{"result":"일치"},"baseRight":{"kind":"근저당권"},"rows":[{"kind"')).toBe('rows');
    expect(lastFieldOf('{"doc')).toBeNull();
  });
});
