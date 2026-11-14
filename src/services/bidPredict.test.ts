import { describe, expect, it } from 'vitest';
import { caseKey, fitRoundModel, fitViewModel, parseViewLines, predictRound, readDayRows, roundOfRatio, roundsOf, viewBands, type HitLike, type Round } from './bidPredict';

describe('bidPredict', () => {
  it('사건번호 두 꼴을 같게', () => {
    expect(caseKey('2026타경501308')).toBe('2026-501308');
    expect(caseKey('2026-501308')).toBe('2026-501308');
    expect(caseKey('2024-5754(1)')).toBe('2024-5754(1)');
    expect(caseKey('2024타경5754(2)')).toBe('2024-5754(2)');
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
  it('사건 차트 → 회차표: 매각 전날까지만 세고, 유찰 회차는 0명', () => {
    const days = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-10-11', '2026-10-12', '2026-10-13'];
    const h: HitLike = { key: '2026-501308', addr: '인천 서구 검암동 493-4 2층201호', kind: '다세대주택', area: 55.14, appr: 152_000_000, sold: 102_270_000, bids: 15, second: 101_000_999, fails: 2, next: '2026-11-13',
      ev: [{ d: '2026-08-18', l: '경매공고일' }, { d: '2026-09-01', l: '1차 매각기일' }, { d: '2026-10-12', l: '2차 매각기일' }, { d: '2026-11-13', l: '3차 매각기일' }, { d: '2026-11-13', l: '매각' }],
      hd: [...days, '2026-11-12', '2026-11-13', '2026-11-14'], hc: [2, 3, 50, 4, 60, 7, 47, 41, 13], he: [1, 1, 9, 1, 9, 1, 21, 9, 1], asOf: '2026-11-13' };
    const r = roundsOf(h);
    expect(r.map((x) => [x.date, x.round, x.views, x.result, x.min])).toEqual([
      ['2026-09-01', 0, 5, 'fail', 152_000_000], ['2026-10-12', 1, 59, 'fail', 106_400_000], ['2026-11-13', 2, 173, 'sold', 74_480_000]]);
    expect(r[2].upTo).toBe('2026-11-12');   // 매각 당일(41) · 그 뒤(13)는 안 센다
    expect(r[2].bids).toBe(15);
  });
  it('회차 규칙 — 그날 이전만 배우고, 조회수가 많으면 팔릴 확률 · 인원이 크다', () => {
    const rs: Round[] = Array.from({ length: 80 }, (_, i) => {
      const views = 10 + i * 6; const sold = i % 2 === 0 && views > 150;
      return { key: String(i), addr: '', kind: '', area: 50, appr: 1e8, min: 7e7, date: `2026-0${1 + (i % 8)}-10`, round: 1, views, eff: 0, last7: views / 10, upTo: '', complete: true, result: sold ? 'sold' : 'fail', sold: sold ? 8e7 : 0, bids: sold ? Math.round(views / 60) : 0, second: 0 } as Round;
    });
    expect(fitRoundModel(rs, '2026-01-01')).toBeNull();   // 그날 이전 회차가 없다
    const m = fitRoundModel(rs, '2026-12-31')!;
    const lo = predictRound(m, { views: 40, last7: 4, round: 1 }); const hi = predictRound(m, { views: 480, last7: 48, round: 1 });
    expect(hi.pSold).toBeGreaterThan(lo.pSold);
    expect(hi.expBids).toBeGreaterThan(lo.expBids);
  });
});
