// FAQ · 약관을 DB 에 둔다 — 운영 › FAQ 관리 · 약관 관리에서 고치면 배포 없이 앱 · 웹에 바로 보인다.
//  - FAQ: contentDocs/faq { items }
//  - 약관 · 정책: legalDocs/{terms|privacy|refund|copyright|partner} { markup, html, effective }, 고칠 때마다 이전 판을 history 에 남긴다
// DB 에 아직 없으면 코드에 적힌 글(supportFaq · legalDocs)을 그대로 쓴다 — 저장하기 전까지는 아무것도 바뀌지 않는다.
// 운영자는 HTML 대신 '간단 표기'로 적는다(contentMarkup).
import { computed, reactive, ref } from 'vue';
import { addDoc, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from './firebase';
import type { FaqItem } from './supportFaq';
import { markupToHtml } from './contentMarkup';
export { boldToHtml, htmlToBold, htmlToMarkup, markupToHtml } from './contentMarkup';

export const LEGAL_KEYS = ['terms', 'privacy', 'refund', 'copyright', 'partner'] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

// === DB 와 맞추기 — 앱 · 웹이 한 번 켜 두면 화면들이 같은 값을 본다 ===
const faqDb = ref<FaqItem[] | null>(null);
const legalDb = reactive<Partial<Record<LegalKey, { html: string; markup: string; effective: string; updatedAt: string; updatedBy: string }>>>({});
let started = false;
export const startContentSync = () => {
  if (started || !firestore) return;
  started = true;
  onSnapshot(doc(firestore, 'contentDocs', 'faq'), (s) => {
    const items = s.exists() ? (s.data().items as FaqItem[] | undefined) : undefined;
    faqDb.value = Array.isArray(items) ? items : null;
  }, () => { faqDb.value = null; });
  onSnapshot(collection(firestore, 'legalDocs'), (snap) => {
    snap.docs.forEach((d) => { if ((LEGAL_KEYS as readonly string[]).includes(d.id)) legalDb[d.id as LegalKey] = d.data() as never; });
  }, () => { /* 코드 글 그대로 */ });
};
/** DB FAQ — 없으면 null(코드 글을 쓴다) */
export const faqFromDb = computed(() => faqDb.value);
/** DB 약관 HTML — 없으면 null(코드 글을 쓴다) */
export const legalFromDb = (key: string) => legalDb[key as LegalKey] ?? null;

// === 저장(운영자) ===
const need = () => { if (!firestore) throw new Error(firestoreDisabledReason || '저장소에 연결하지 못했습니다.'); return firestore; };
export const saveFaq = async (items: FaqItem[], by: string) => {
  await setDoc(doc(need(), 'contentDocs', 'faq'), {
    items: items.map((f) => ({ tag: f.tag, q: f.q.trim(), a: f.a.trim(), ...(f.points ? { points: true } : {}) })),
    updatedAt: new Date().toISOString(), updatedBy: by,
  });
};
/** 약관 저장 — 지금 판을 history 에 남기고 새 판을 적는다 */
export const saveLegal = async (key: LegalKey, markup: string, effective: string, by: string, prevHtml: string) => {
  const db = need();
  const now = new Date().toISOString();
  if (prevHtml) await addDoc(collection(db, 'legalDocs', key, 'history'), { html: prevHtml, effective: legalDb[key]?.effective ?? '', savedAt: now, by });
  await setDoc(doc(db, 'legalDocs', key), { markup, html: markupToHtml(markup), effective: effective.trim(), updatedAt: now, updatedBy: by });
};

/** 지난 판 — 새것이 위로(운영 › 약관 관리 '지난 판') */
export const loadLegalHistory = async (key: LegalKey): Promise<Array<{ id: string; html: string; effective: string; savedAt: string; by: string }>> => {
  const { getDocs } = await import('firebase/firestore');
  const snap = await getDocs(collection(need(), 'legalDocs', key, 'history'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as { html: string; effective: string; savedAt: string; by: string }) }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
};
