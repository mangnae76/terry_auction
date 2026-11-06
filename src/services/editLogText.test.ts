import { describe, it, expect } from 'vitest';
import { editLogDesc, editLogTag } from './editLogText';

describe('최근 분석 한 줄 글', () => {
  it('꼬리표 — 화면 이름만, 낙찰이후 · 자금관리는 묶음 이름까지', () => {
    expect(editLogTag('단계')).toBe('단계');
    expect(editLogTag('물건상세 › 입찰가산정')).toBe('수익분석');
    expect(editLogTag('임장경로 › 동선')).toBe('임장경로');
    expect(editLogTag('낙찰이후')).toBe('낙찰이후 · 진행절차');
    expect(editLogTag('자금관리 › 필요경비')).toBe('자금관리 · 필요경비');
  });
  it('설명 — 단계는 바꾼 내용 + 변경, 그 밖은 내용수정', () => {
    expect(editLogDesc('단계', '낙찰 → 임장예정')).toBe('낙찰 → 임장예정 변경');
    expect(editLogDesc('물건상세 › 수익분석')).toBe('내용수정');
  });
});
