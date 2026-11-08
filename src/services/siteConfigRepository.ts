// 서비스 전체 스위치 — 점검 모드 · 시작 팝업. 운영 › 점검 모드 · 앱 시작 팝업에서 고치고(운영자만),
// 웹 · 앱이 열릴 때 components/SiteNotice 가 읽어 띄운다. 로그인 전에도 보여야 해서 누구나 읽는다(firestore.rules).
// 문서 하나(siteConfig/main)에 둘을 담는다 — 열 때 한 번만 읽으면 된다.
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';
import { nowLocal } from './boardRepository';

export interface Maintenance {
  on: boolean;
  /** 회원에게 보일 안내 — 비우면 기본 문구 */
  message: string;
  /** 끝날 것으로 보는 때(datetime-local 꼴, 비우면 안 적음) */
  until: string;
}

export interface StartPopup {
  on: boolean;
  title: string;
  body: string;
  /** '자세히보기' 단추가 여는 주소(비우면 단추 없음) */
  linkUrl: string;
  /** 띄울 기간(datetime-local 꼴, 비우면 바로 · 계속) */
  startAt: string;
  endAt: string;
  /** 고칠 때마다 바뀐다 — '오늘 하루 보지 않기'를 새 팝업에서 다시 풀려고 */
  version: number;
}

export interface SiteConfig {
  maintenance: Maintenance;
  popup: StartPopup;
  updatedAt: string;
  updatedBy: string;
}

export const emptySiteConfig = (): SiteConfig => ({
  maintenance: { on: false, message: '', until: '' },
  popup: { on: false, title: '', body: '', linkUrl: '', startAt: '', endAt: '', version: 0 },
  updatedAt: '',
  updatedBy: '',
});

const ref = () => (firestore ? doc(firestore, 'siteConfig', 'main') : null);

export const subscribeSiteConfig = (onData: (c: SiteConfig) => void, onError: (msg: string) => void = () => {}): (() => void) => {
  const r = ref();
  if (!r) { onError(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return () => {}; }
  return onSnapshot(
    r,
    (s) => {
      const d = (s.exists() ? s.data() : {}) as Partial<SiteConfig>;
      const e = emptySiteConfig();
      onData({ ...e, ...d, maintenance: { ...e.maintenance, ...(d.maintenance ?? {}) }, popup: { ...e.popup, ...(d.popup ?? {}) } });
    },
    (err) => { console.warn('[siteConfig] 읽기 실패', err); onError('설정을 불러오지 못했습니다. 새로고침해 주세요.'); },
  );
};

/** 저장(운영자) — 팝업 글이 바뀌면 version 을 올려 '오늘 하루 보지 않기'를 새로 묻는다 */
export const saveSiteConfig = async (next: SiteConfig, prev: SiteConfig | null, by: string): Promise<void> => {
  const r = ref();
  if (!r) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.');
  const p = next.popup;
  const changed = !prev || ['on', 'title', 'body', 'linkUrl', 'startAt', 'endAt'].some((k) => (p as unknown as Record<string, unknown>)[k] !== (prev.popup as unknown as Record<string, unknown>)[k]);
  await setDoc(r, {
    maintenance: { on: !!next.maintenance.on, message: next.maintenance.message.trim().slice(0, 500), until: next.maintenance.until || '' },
    popup: {
      on: !!p.on, title: p.title.trim().slice(0, 60), body: p.body.trim().slice(0, 500), linkUrl: p.linkUrl.trim().slice(0, 500),
      startAt: p.startAt || '', endAt: p.endAt || '', version: changed ? (Number(prev?.popup.version) || 0) + 1 : (Number(p.version) || 0),
    },
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  });
};

/** 지금 띄울 팝업인가 — 켜져 있고, 제목이나 내용이 있고, 기간 안 */
export const popupLive = (p: StartPopup, now = nowLocal()): boolean =>
  !!p.on && !!(p.title || p.body) && (!p.startAt || p.startAt <= now) && (!p.endAt || p.endAt > now);
