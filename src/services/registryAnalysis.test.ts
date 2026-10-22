// 말소기준과 인수 판정이 맞는지 — 경매에서 가장 위험한 판단이다.
import { describe, it, expect } from 'vitest';
import { baseDateOf, isTakenOver, normalizeYmd } from './registryAnalysis';

const row = (kind: string, date: string, extinct = '') => ({ kind, date, extinct });

describe('날짜 다듬기', () => {
  it('점·슬래시로 온 날짜도 받는다', () => {
    expect(normalizeYmd('2023.05.11')).toBe('2023-05-11');
    expect(normalizeYmd('2023/05/11')).toBe('2023-05-11');
    expect(normalizeYmd('2023-05-11')).toBe('2023-05-11');
  });

  it('꼴이 안 맞으면 빈 글자다 — 억지로 읽지 않는다', () => {
    expect(normalizeYmd('2023-5-11')).toBe('');
    expect(normalizeYmd('미상')).toBe('');
    expect(normalizeYmd(undefined)).toBe('');
  });
});

describe('말소기준일', () => {
  it('말소기준이 될 수 있는 권리 가운데 가장 빠른 날이다', () => {
    expect(baseDateOf([
      row('소유권이전', '2019-03-02'),
      row('근저당권', '2021-07-14'),
      row('가압류', '2020-11-05'),
      row('임의경매', '2024-01-09'),
    ])).toBe('2020-11-05');
  });

  it('소유권은 말소기준이 되지 않는다', () => {
    expect(baseDateOf([
      row('소유권이전', '2015-01-01'),
      row('근저당권', '2022-02-02'),
    ])).toBe('2022-02-02');
  });

  it('가처분·주택임차권은 말소기준이 되지 않는다', () => {
    expect(baseDateOf([
      row('주택임차권', '2018-01-01'),
      row('가처분', '2019-01-01'),
      row('압류', '2023-03-03'),
    ])).toBe('2023-03-03');
  });

  it('날짜를 못 읽는 줄은 세지 않는다', () => {
    expect(baseDateOf([
      row('근저당권', '미상'),
      row('가압류', '2022-06-01'),
    ])).toBe('2022-06-01');
  });

  it('하나도 없으면 빈 글자다', () => {
    expect(baseDateOf([row('소유권이전', '2019-03-02')])).toBe('');
    expect(baseDateOf([])).toBe('');
  });
});

describe('인수 판정', () => {
  const BASE = '2021-07-14';

  it('말소기준보다 앞선 권리는 떠안는다', () => {
    expect(isTakenOver(row('주택임차권', '2019-05-02'), BASE)).toBe(true);
    expect(isTakenOver(row('가처분', '2020-01-01'), BASE)).toBe(true);
  });

  it('말소기준보다 뒤인 권리는 떠안지 않는다', () => {
    expect(isTakenOver(row('가압류', '2022-01-01'), BASE)).toBe(false);
  });

  it('말소기준 그 줄은 떠안지 않는다', () => {
    expect(isTakenOver(row('근저당권', BASE), BASE)).toBe(false);
  });

  it("PDF 가 '소멸' 이라 적어 준 줄은 그대로 믿는다", () => {
    expect(isTakenOver(row('전세권', '2018-01-01', '소멸'), BASE)).toBe(false);
  });

  it('소유권 줄은 따지지 않는다', () => {
    expect(isTakenOver(row('소유권이전', '2015-01-01'), BASE)).toBe(false);
    expect(isTakenOver(row('소유권보존', '2010-01-01'), BASE)).toBe(false);
    expect(isTakenOver(row('소유권이전등기', '2012-01-01'), BASE)).toBe(false);
  });

  it('소유권이전청구권가등기는 따진다 — 소유권 줄이 아니다', () => {
    expect(isTakenOver(row('가등기', '2019-01-01'), BASE)).toBe(true);
  });

  it('말소기준을 모르면 판단하지 않는다', () => {
    expect(isTakenOver(row('가처분', '2019-01-01'), '미상')).toBe(false);
    expect(isTakenOver(row('가처분', '2019-01-01'), '')).toBe(false);
  });

  it('날짜를 못 읽는 줄은 판단하지 않는다', () => {
    expect(isTakenOver(row('가처분', '미상'), BASE)).toBe(false);
  });

  it('점으로 온 날짜도 제대로 견준다', () => {
    expect(isTakenOver(row('가처분', '2019.01.01'), BASE)).toBe(true);
    expect(isTakenOver(row('가처분', '2022.01.01'), BASE)).toBe(false);
  });
});
