// 화면 설정 동기화 — 이 브라우저(localStorage)에만 남던 사용자 설정을 내 설정 DB(userPrefs.ui)에도 둔다.
// 화면 코드는 그대로 localStorage 를 읽고 쓴다. 아래 키를 적는 순간(1.5초 모아) DB 에도 적고,
// 로그인하면 DB 값을 받아 localStorage 에 깔아 둔다 — 다른 기기 · 앱에서도 같은 정렬 · 읽음 표시 · 마지막 물건.
// 받은 뒤엔 'ui-prefs:loaded' 를 알린다(이미 그려진 화면이 다시 읽게).
// 기기마다 달라야 맞는 값(로그인 기억 · 테마 · 내 위치)과 캐시는 넣지 않는다.
import { loadUserPrefs, saveUserPrefs } from './userPrefsRepository';

export const SYNCED_UI_KEYS = [
  'wlp.sortMode',            // 선정물건 정렬(등록순 · 동선순)
  'wlp.web.sort',            // 웹 선정물건 정렬
  'wlp.web.layout',          // 웹 선정물건 보기(카드 · 표)
  'myturn.board.seen',       // 공지 · 게시판 읽음 표시
  'son.pick',                // 손품조사 — 마지막으로 본 물건
  'son.tab',                 // 손품조사 — 마지막 탭
  'caseTrade.view',          // 시장분석 · 시세조사 보기
  'adm.view.rank',           // 시장분석 보기(랭킹)
  'adm.view.son',            // 시장분석 보기(손품)
  'adm.view.dong',           // 시장분석 보기(동)
  'wlp.web.regMode',         // 웹 물건등록 자동 · 수동
  'myturn.import.tab',       // 앱 물건등록 자동 · 수동
  'wlp.web.storeTab2',       // 스토어 탭
  'ta.web.agent.fold',       // 수집 도우미 판 접힘(관리자)
  'ta.web.agent.reg',        // 수집 도우미 지역(관리자)
];
const SYNCED = new Set(SYNCED_UI_KEYS);

let uid = '';
let installed = false;
let applying = false;
let timer = 0;
const pending: Record<string, string> = {};

const flush = async () => {
  timer = 0;
  const u = uid;
  const ui = { ...pending };
  Object.keys(pending).forEach((k) => delete pending[k]);
  if (!u || !Object.keys(ui).length) return;
  await saveUserPrefs(u, { ui });
};
/** 지운 값은 빈 글('')로 적는다 — 받을 때 빈 글이면 지운다 */
const queue = (k: string, v: string | null) => {
  if (!uid) return;
  pending[k] = v ?? '';
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { void flush(); }, 1500);
};

// localStorage 에 적는 자리를 한 번 감싼다 — 위 키만 DB 로도 보낸다(sessionStorage · 다른 키는 그대로)
const install = () => {
  if (installed || typeof window === 'undefined' || typeof Storage === 'undefined') return;
  installed = true;
  const set = Storage.prototype.setItem;
  const rem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function setItem(this: Storage, k: string, v: string) {
    set.call(this, k, v);
    if (!applying && SYNCED.has(k) && this === window.localStorage) queue(k, String(v));
  };
  Storage.prototype.removeItem = function removeItem(this: Storage, k: string) {
    rem.call(this, k);
    if (!applying && SYNCED.has(k) && this === window.localStorage) queue(k, null);
  };
};

/** 로그인(계정이 바뀔 때)마다 — DB 값을 받아 깔고, DB 에 아직 없는 키는 이 브라우저 값으로 한 번 올린다 */
export const startUiPrefSync = async (nextUid: string): Promise<void> => {
  install();
  if (uid && uid !== nextUid) { window.clearTimeout(timer); Object.keys(pending).forEach((k) => delete pending[k]); }
  uid = nextUid;
  if (!nextUid) return;
  const ui = ((await loadUserPrefs(nextUid).catch(() => null))?.ui ?? {}) as Record<string, string>;
  if (uid !== nextUid) return;
  applying = true;
  try {
    Object.entries(ui).forEach(([k, v]) => {
      if (!SYNCED.has(k)) return;
      try { if (v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 그만 */ }
    });
  } finally {
    applying = false;
  }
  SYNCED_UI_KEYS.forEach((k) => {
    if (k in ui) return;
    let v: string | null = null;
    try { v = localStorage.getItem(k); } catch { /* 그만 */ }
    if (v != null) queue(k, v);
  });
  window.dispatchEvent(new CustomEvent('ui-prefs:loaded'));
};
