import { describe, expect, it } from 'vitest';
import { signupAccountFields } from './authRepository';

describe('signupAccountFields — 가입 정보를 내 정보 칸으로', () => {
  it('메일 앞뒤 · 휴대폰 세 칸 · 이름 · 사업자 구분', () => {
    const f = signupAccountFields('kim@naver.com', {
      realName: '김철수', phone: '010-1234-5678', region: '인천', joinPath: '', joinPathDetail: '',
      bizType: 'biz', smsOptIn: true, agreedAt: '2026-11-02',
    });
    expect(f).toEqual({ nickname: '김철수', emailId: 'kim', emailDomain: 'naver.com', phone1: '010', phone2: '1234', phone3: '5678', smsOptIn: true, bizType: 'biz' });
  });
  it('사업자 구분을 안 골랐으면 칸을 넣지 않는다', () => {
    const f = signupAccountFields('a@b.co', { realName: 'a', phone: '010', region: '', joinPath: '', joinPathDetail: '', smsOptIn: false, agreedAt: '' });
    expect('bizType' in f).toBe(false);
  });
});
