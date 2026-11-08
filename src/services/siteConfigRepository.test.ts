import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ firestore: null, firestoreDisabledReason: 'test' }));
const { popupLive, emptySiteConfig } = await import('./siteConfigRepository');

describe('popupLive — 시작 팝업을 지금 띄우나', () => {
  const p = { ...emptySiteConfig().popup, on: true, title: '안내' };
  it('켜져 있고 기간이 비면 띄운다', () => { expect(popupLive(p, '2026-11-08T10:00')).toBe(true); });
  it('꺼져 있거나 글이 없으면 안 띄운다', () => {
    expect(popupLive({ ...p, on: false }, '2026-11-08T10:00')).toBe(false);
    expect(popupLive({ ...p, title: '', body: '' }, '2026-11-08T10:00')).toBe(false);
  });
  it('기간 앞 · 뒤면 안 띄운다', () => {
    expect(popupLive({ ...p, startAt: '2026-11-09T00:00' }, '2026-11-08T10:00')).toBe(false);
    expect(popupLive({ ...p, endAt: '2026-11-08T09:00' }, '2026-11-08T10:00')).toBe(false);
    expect(popupLive({ ...p, startAt: '2026-11-08T09:00', endAt: '2026-11-08T11:00' }, '2026-11-08T10:00')).toBe(true);
  });
});
