import { describe, expect, it } from 'vitest';
import { caseKey, fitViewModel, parseViewLines, readDayRows, roundOfRatio, viewBands } from './bidPredict';

describe('bidPredict', () => {
  it('사건번호 두 꼴을 같게', () => {
    expect(caseKey('2026타경501308')).toBe('2026-501308');
    expect(caseKey('2026-501308')).toBe('2026-501308');
  });
  it('최저가 비율 → 유찰 횟수', () => {
    expect(roundOfRatio(1)).toBe(0);
    expect(roundOfRatio(0.7)).toBe(1);
    expect(roundOfRatio(74_480_000 / 152_000_000)).toBe(2);
    expect(roundOfRatio(0.343)).toBe(3);
  });
  it('붙여넣은 줄 — 맨 끝 숫자가 조회수, 가운데가 주소', () => {
    const r = parseViewLines('2026타경501308\t인천 서구 검암동 493-4 정성드림빌 2층201호\t500\n2026-501055 120회\n제목 줄');
    expect(r).toEqual([
      { key: '2026-501308', addr: '인천 서구 검암동 493-4 정성드림빌 2층201호', views: 500 },
      { key: '2026-501055', addr: '', views: 120 },
    ]);
  });
  it('기일 목록 — 머리 줄을 찾아 읽는다', () => {
    const rows = [
      ['[탱크옥션] 생성기준일'],
      ['사건번호', '종별', '주소(시군구동)', '외 건수', '경매현황', '감정가', '최저가', '매각가', '차순위', '입찰자수', '진행상태', '입찰일자'],
      ['2026-501308', '다세대주택', '인천 서구 검암동 493-4 2층201호', '0 필지', '건물 55.14㎡(16.68평)', 152000000, 74480000, 102270000, 101000999, 15, '매각', '2026.11.13'],
    ];
    const [d] = readDayRows(rows);
    expect(d).toMatchObject({ key: '2026-501308', area: 55.14, sold: 102270000, second: 101000999, bids: 15, status: '매각', date: '2026-11-13' });
  });
  it('조회수가 많을수록 많은 인원 쪽으로', () => {
    const vm = fitViewModel([10, 20, 40, 80, 160, 320, 640].map((v, i) => ({ key: String(i), views: v, bids: Math.round(v / 40) })));
    expect(vm).not.toBeNull();
    const lo = viewBands(vm!, 20); const hi = viewBands(vm!, 600);
    expect(hi.pi[4]).toBeGreaterThan(lo.pi[4]);
    expect(hi.p0).toBeLessThan(lo.p0);
  });
});
