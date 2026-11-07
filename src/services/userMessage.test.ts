import { describe, expect, it, vi } from 'vitest';
import { aiErrorText, isOurText, userMessage } from './userMessage';

vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('userMessage — 오류 원문은 화면에 내보내지 않는다', () => {
  it('우리 한국어 문장은 그대로', () => {
    expect(userMessage(new Error('PDF를 열지 못했습니다.'), '기본')).toBe('PDF를 열지 못했습니다.');
    expect(isOurText('AI 분석 실패 — AI 서버가 붐빕니다. 잠시 뒤 다시 해 주세요.')).toBe(true);
  });
  it('영어 · 코드가 섞이면 기본 문장', () => {
    expect(userMessage(new Error('Failed to fetch'), '기본')).toBe('기본');
    expect(userMessage(new Error('Firestore 동기화 실패: permission-denied'), '기본')).toBe('기본');
    expect(userMessage(new Error('조회 실패 {"code":500}'), '기본')).toBe('기본');
    expect(userMessage(new Error('Gemini 서버가 붐빕니다'), '기본')).toBe('기본');
    expect(userMessage(null, '기본')).toBe('기본');
  });
});

describe('aiErrorText — 구글 AI 오류를 원인별 한국어로', () => {
  it('붐빔 · 한도 · 용량 · 키 · 연결', () => {
    expect(aiErrorText('The model is overloaded. Please try again later.')).toBe('AI 서버가 붐빕니다. 잠시 뒤 다시 해 주세요.');
    expect(aiErrorText('Resource has been exhausted (e.g. check quota).')).toBe('AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 해 주세요.');
    expect(aiErrorText('Request payload size exceeds the limit')).toBe('서류가 너무 큽니다. 장 수를 줄여 다시 해 주세요.');
    expect(aiErrorText('API key not valid. Please pass a valid API key.')).toBe('AI 키를 확인해 주세요.');
    expect(aiErrorText('Failed to fetch')).toBe('인터넷 연결을 확인해 주세요.');
    expect(aiErrorText('', 503)).toBe('AI 서버가 붐빕니다. 잠시 뒤 다시 해 주세요.');
    expect(aiErrorText('Internal error encountered.')).toBe('AI 분석을 하지 못했습니다. 잠시 뒤 다시 해 주세요.');
  });
});
