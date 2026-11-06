import { beforeEach, describe, expect, it, vi } from 'vitest';

// 브라우저 저장소 흉내 — 테스트는 node 에서 돈다
class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const local = new FakeStorage();
const session = new FakeStorage();
const events: string[] = [];
Object.assign(globalThis, {
  Storage: FakeStorage,
  localStorage: local,
  CustomEvent: class { type: string; constructor(t: string) { this.type = t; } },
  window: { localStorage: local, sessionStorage: session, setTimeout: (f: () => void, ms: number) => globalThis.setTimeout(f, ms), clearTimeout: (t: number) => globalThis.clearTimeout(t), dispatchEvent: (e: { type: string }) => { events.push(e.type); return true; } },
});

const saved: Array<Record<string, unknown>> = [];
let dbUi: Record<string, string> = {};
vi.mock('./userPrefsRepository', () => ({
  loadUserPrefs: async () => ({ ui: dbUi }),
  saveUserPrefs: async (_uid: string, p: Record<string, unknown>) => { saved.push(p); return true; },
}));

const { startUiPrefSync } = await import('./uiPrefSync');

describe('uiPrefSync', () => {
  beforeEach(() => { saved.length = 0; events.length = 0; local.m.clear(); session.m.clear(); vi.useRealTimers(); });

  it('로그인하면 DB 값을 깔고, DB 에 없는 키는 이 브라우저 값으로 올린다', async () => {
    dbUi = { 'wlp.sortMode': 'route', 'son.tab': '' };
    local.setItem('son.tab', 'price');
    local.setItem('wlp.web.layout', '"table"');
    vi.useFakeTimers();
    await startUiPrefSync('u1');
    expect(local.getItem('wlp.sortMode')).toBe('route');
    expect(local.getItem('son.tab')).toBeNull();            // DB 에서 지운 값(빈 글)은 지운다
    expect(events).toContain('ui-prefs:loaded');
    await vi.advanceTimersByTimeAsync(1600);
    expect(saved).toEqual([{ ui: { 'wlp.web.layout': '"table"' } }]);   // DB 에 없던 키만 한 번
  });

  it('같이 맞추는 키만 모아 DB 에 적는다 — 다른 키 · sessionStorage 는 그대로', async () => {
    dbUi = {};
    vi.useFakeTimers();
    await startUiPrefSync('u1');
    await vi.advanceTimersByTimeAsync(1600);
    saved.length = 0;
    local.setItem('wlp.sortMode', 'reg');
    local.setItem('auction-theme-mode', 'dark');             // 테마 — 기기마다
    session.setItem('wlp.sortMode', 'route');                // 탭 값 — 보내지 않는다
    local.removeItem('son.pick');
    await vi.advanceTimersByTimeAsync(1600);
    expect(saved).toEqual([{ ui: { 'wlp.sortMode': 'reg', 'son.pick': '' } }]);
  });
});
