import { describe, expect, it } from 'vitest';
import { isAdminEmail, setExtraAdmins } from './accessControl';

describe('isAdminEmail — 기본 2계정 + DB 목록', () => {
  it('DB 문서가 없으면 예전 운영자도 인정', () => {
    setExtraAdmins(null);
    expect(isAdminEmail('mangnae760723@gmail.com')).toBe(true);
    expect(isAdminEmail('HANSUN440@gmail.com')).toBe(true);
    expect(isAdminEmail('new@gmail.com')).toBe(false);
  });
  it('DB 목록을 받으면 그 목록대로 — 기본 계정은 늘 운영자', () => {
    setExtraAdmins(['New@Gmail.com']);
    expect(isAdminEmail('new@gmail.com')).toBe(true);
    expect(isAdminEmail('hansun440@gmail.com')).toBe(false);
    setExtraAdmins([]);
    expect(isAdminEmail('dark_0417@nate.com')).toBe(true);
    expect(isAdminEmail('')).toBe(false);
  });
});
