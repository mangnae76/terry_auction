// 같은 사건 PDF를 다시 올렸을 때 — 사용자가 정리한 내용은 바꾸지 않는다(2026-11-07).
// 회차 · 최저가 · 매각기일(기일내역 · 최저가율 포함)만 새 PDF 값으로 바꾸고, 나머지는 비어 있는 칸만 PDF 값으로 채운다.
// 앱 · 웹 물건등록이 같이 쓴다(auctionStore.importParsedPdfAuctions)
import type { AuctionDetail } from '../types/auction';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
/** 비었다고 보는 값 — 없음 · 빈 글 · 0 · 빈 목록 · 빈 묶음 */
const isEmpty = (v: unknown): boolean =>
  v == null || v === '' || v === 0 || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);

/** 빈 칸만 채운다 — 묶음(metrics 등)은 한 단계 안쪽 칸까지 본다 */
const fillEmpty = (old: Obj, full: Obj): Obj => {
  const out: Obj = { ...old };
  Object.keys(full).forEach((k) => {
    const o = old[k]; const f = full[k];
    if (isEmpty(o)) { if (!isEmpty(f)) out[k] = f; return; }
    if (isObj(o) && isObj(f)) {
      const inner: Obj = { ...o };
      Object.keys(f).forEach((s) => { if (isEmpty(o[s]) && !isEmpty(f[s])) inner[s] = f[s]; });
      out[k] = inner;
    }
  });
  return out;
};

/** 이미 있는 물건(old) + 새 PDF로 다시 만든 물건(full) → 저장할 물건 */
/** 지난번 읽기가 실패한 물건 — 주소 자리에 파일 이름('2026타경503385_프리스틴' · '프린트')이 들어가 있다 */
export const isFailedRead = (a: Pick<AuctionDetail, 'address' | 'importMeta'>): boolean => {
  const addr = String(a.address ?? '').trim();
  const file = String(a.importMeta?.pdfFileName ?? '').replace(/\.pdf$/i, '').trim();
  return /^\d{4}타경\d+/.test(addr) || (!!file && addr === file);
};

export const mergeReimport = (old: AuctionDetail, full: AuctionDetail): AuctionDetail => {
  // 지난번 읽기가 실패했으면(옥션원 양식을 못 읽던 때 등) 새 PDF 값이 앞선다 — 사용자가 적은 칸(메모 · 사진 · 입찰가 등)은
  // 새 PDF 에 없으니 그대로 남는다. 아니면 빈칸만 채운다
  const failed = isFailedRead(old) && !isFailedRead(full);
  const next = (failed
    ? fillEmpty(full as unknown as Obj, old as unknown as Obj)
    : fillEmpty(old as unknown as Obj, full as unknown as Obj)) as unknown as AuctionDetail;
  if (failed && old.metrics?.myBidValue) next.metrics = { ...next.metrics, myBidValue: old.metrics.myBidValue };
  return {
    ...next,
    eventDate: full.eventDate || old.eventDate,
    auctionRound: full.auctionRound || old.auctionRound,
    auctionHistory: full.auctionHistory?.length ? full.auctionHistory : old.auctionHistory,
    metrics: {
      ...next.metrics,
      minimumBidValue: full.metrics?.minimumBidValue || old.metrics?.minimumBidValue,
      bidRate: full.metrics?.bidRate || old.metrics?.bidRate,
    },
    importMeta: full.importMeta ?? old.importMeta,   // 어느 파일에서 읽었는지는 사용자가 정리한 내용이 아니다
    // 단계 · 보관함 · 휴지통은 그대로
    status: old.status, archived: old.archived, hidden: old.hidden, isFieldTrip: old.isFieldTrip,
  };
};
