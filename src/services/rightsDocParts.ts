/* AI 권리분석에 보낼 서류 — 물건의 서류 칸(건물등기 · 매물명세 · 현황조사 · 세대열람 · 송달내역) 맨 앞 한 장씩을 Gemini 가 받는 꼴로.
 * 물건상세 'AI 분석 요청'과 관심물건 자동분석이 같이 쓴다(2026-11-20, 한 곳) */
import { DOC_LABELS, type RightsDocPart } from './geminiRights';
import { isPdfEntry, isPhotoId, loadSitePdf, loadSitePhoto } from './sitePhotoRepository';

/** 서류 칸 열쇠 — 화면 칸 순서와 같다 */
export const RIGHTS_DOC_KEYS = Object.keys(DOC_LABELS);

/** 서류 하나 꺼내 오는 데 오래 걸리면 그 서류는 건너뛴다 — 끊긴 링크 하나에 전체가 멎지 않게 */
const withTimeout = <T,>(job: Promise<T>, ms: number, fallback: T) =>
  Promise.race([job, new Promise<T>((done) => { setTimeout(() => done(fallback), ms); })]);
/** data URL 을 Gemini 가 받는 꼴로 쪼갠다 */
const splitDataUrl = (url: string): { mimeType: string; base64: string } | null => {
  const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(url);
  return m ? { mimeType: m[1], base64: m[2] } : null;
};
export const blobToBase64 = (blob: Blob) => new Promise<string>((done, fail) => {
  const r = new FileReader();
  r.onload = () => done(String(r.result).split(',')[1] ?? '');
  r.onerror = () => fail(new Error('read'));
  r.readAsDataURL(blob);
});

export const collectRightsParts = async (extraPhotos: Record<string, string[]> | undefined | null): Promise<RightsDocPart[]> => {
  const out: RightsDocPart[] = [];
  for (const key of RIGHTS_DOC_KEYS) {
    const entry = extraPhotos?.[key]?.[0];
    if (!entry) continue;
    const label = DOC_LABELS[key];
    if (isPdfEntry(entry)) {
      const blob = await withTimeout(loadSitePdf(entry).catch(() => null), 20_000, null);
      if (blob) out.push({ label, mimeType: 'application/pdf', base64: await blobToBase64(blob) });
      continue;
    }
    // 올려 둔 그림 — 저장소에 담긴 것이면 꺼내 오고, data URL 이면 그대로 쓴다
    const url = isPhotoId(entry) ? await withTimeout(loadSitePhoto(entry).catch(() => ''), 20_000, '') : entry;
    const part = splitDataUrl(url);
    if (part) out.push({ label, ...part });
  }
  return out;
};
