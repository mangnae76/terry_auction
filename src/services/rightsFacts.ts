// AI 권리분석에 같이 보낼 '이미 읽어 둔 값' — 앱이 PDF 에서 읽어 둔 것을 글로 추린다.
//
// 왜 보내나 — 서류 사진만 주면 AI 가 매번 처음부터 다시 읽느라 근저당을 통째로
// 빠뜨리거나 말소기준권리가 볼 때마다 바뀌었다. 앱이 아는 것을 먼저 알려 주면
// AI 는 '읽는 일'보다 '판단하는 일'에 힘을 쓴다.
//
// 화면 카드와 같은 차례로 적는다 — 경매 기본정보 · 임차인 내역 · 등기부 정보.
import type { AuctionDetail } from '../types/auction';
import { weekdayLabel } from '../stores/scheduleStore';

const won = (n: number | undefined): string => (n && Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '');
const m2 = (n: number | undefined): string => {
  if (!n || !Number.isFinite(n)) return '';
  return `${n}㎡(${(n / 3.305785).toFixed(2)}평)`;
};
/** 평당 얼마인가 — 자료에 적어 두면 AI 가 값을 가늠할 때 쓴다 */
const perPyeong = (value: number | undefined, areaM2: number | undefined): string => {
  if (!value || !areaM2) return '';
  const py = areaM2 / 3.305785;
  if (py <= 0) return '';
  return `평당 ${Math.round(value / py / 10000).toLocaleString('ko-KR')}만원`;
};
/** 감정가 대비 몇 %인가 — 최저가·보증금에 붙인다 */
const pctOf = (value: number | undefined, base: number | undefined): string =>
  (value && base ? `(${Math.round((value / base) * 100)}%)` : '');

/** 값이 있는 줄만 남긴다 — 빈 칸을 보내면 AI 가 그 자리를 지어낸다 */
const lines = (rows: Array<[string, string | undefined]>): string[] =>
  rows.filter(([, v]) => (v ?? '').trim()).map(([k, v]) => `- ${k}: ${String(v).trim()}`);

/** 한 줄로 이어 붙이되 빈 토막은 버린다 */
const join = (parts: Array<string | undefined>, sep = ' / '): string =>
  parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);

/** 개시결정이 강제경매인지 임의경매인지 — 등기 줄에서 집어낸다 */
const startKindOf = (a: AuctionDetail): string => {
  const hit = (a.registryRows ?? []).find((r) => /강제경매|임의경매|경매개시/.test(r.kind ?? ''));
  return hit ? `(${hit.kind.trim()})` : '';
};

export const buildRightsFacts = (a: AuctionDetail | null | undefined): string => {
  if (!a) return '';
  const out: string[] = [];

  out.push('## 경매 기본정보');
  out.push(...lines([
    ['사건번호', a.caseNumber],
    ['법원', a.courtName],
    ['담당계', a.courtDept],
    ['물건종별', a.propertyType],
    ['매각구분·특별매각조건', a.saleClassification],
    ['매각기일', join([a.eventDate && `${a.eventDate}${weekdayLabel(a.eventDate) ? ` (${weekdayLabel(a.eventDate)})` : ''}`, a.auctionRound], ' · ')],
    ['소재지', a.address],
    ['도로명주소', a.roadAddress],
    ['전용면적', m2(a.buildingAreaM2)],
    ['대지권', m2(a.landAreaM2)],
    ['사용승인일', a.approvalDate],
    ['소유자', a.ownerName],
    ['채무자', a.debtorName],
    ['채권자', a.creditorName],
    ['감정가', join([won(a.metrics?.appraisalValue), perPyeong(a.metrics?.appraisalValue, a.buildingAreaM2)], ' · ')],
    ['최저매각가격', join([pctOf(a.metrics?.minimumBidValue, a.metrics?.appraisalValue), won(a.metrics?.minimumBidValue), perPyeong(a.metrics?.minimumBidValue, a.buildingAreaM2)], ' ').trim()],
    ['입찰보증금', join([pctOf(a.metrics?.depositValue, a.metrics?.minimumBidValue), won(a.metrics?.depositValue)], ' ').trim()],
    ['개시결정', join([a.caseStartDate, startKindOf(a)], ' ')],
  ]));

  const baseDates = lines([
    ['말소기준일', a.cancellationBaseDate],
    ['소액기준일', a.smallAmountBaseDate],
    ['배당요구종기일', a.distributionRequestDate],
  ]);
  const tenants = a.tenantInfoRows ?? [];
  if (baseDates.length || tenants.length || (a.tenantOtherNotes ?? '').trim()) {
    out.push('', '## 임차인 내역');
    out.push(...baseDates);
    tenants.forEach((t, i) => {
      out.push(`- 임차인 ${i + 1}: ${join([
        join([t.name, t.subName], ' '),
        t.occupationPeriod && `점유: ${t.occupationPeriod}`,
        t.moveIn && `전입: ${t.moveIn}`,
        t.fixed && `확정: ${t.fixed}`,
        t.distribution && `배당요구: ${t.distribution}`,
        t.deposit && `보증금: ${t.deposit}`,
        t.opposition && `대항력: ${t.opposition}`,
        t.analysis && `분석: ${t.analysis}`,
        t.other,
      ])}`);
    });
    // 보증금 합계 — 승계된 임차인이 겹쳐 적히는 일이 있어 같은 금액은 한 번만 센다
    const deposits = [...new Set(tenants.map((t) => (t.deposit ?? '').replace(/[^\d]/g, '')).filter(Boolean))]
      .map(Number).filter((n) => n > 0);
    if (deposits.length) {
      out.push(`- 계: 임차인 ${tenants.length}건 · 임차보증금합계 ${won(deposits.reduce((x, y) => x + y, 0))} (승계된 임차인이 겹쳐 적힐 수 있다)`);
    }
    const note = (a.tenantOtherNotes ?? '').trim();
    if (note) out.push(`- 기타사항: ${note.replace(/\s*\n\s*/g, ' / ')}`);
  }

  const regs = a.registryRows ?? [];
  if (regs.length || (a.registryWarnings ?? '').trim()) {
    out.push('', '## 등기부 정보 (건물등기)');
    const claim = a.rights?.totalClaimAmount ?? 0;
    if (claim > 0) out.push(`- 채권합계금액: ${won(claim)}`);
    regs.forEach((r) => {
      out.push(`- ${join([
        r.order && `순위: ${r.order}`,
        r.date && `접수: ${r.date}`,
        r.kind && `권리종류: ${r.kind}`,
        r.holder && `권리자: ${r.holder}`,
        r.amount && `채권금액: ${r.amount}`,
        r.extinct && `표기: ${r.extinct}`,
        r.desc && `비고: ${r.desc.replace(/\s*\n\s*/g, ' ')}`,
      ])}`);
    });
    const warn = (a.registryWarnings ?? '').trim();
    if (warn) out.push(`- 등기 주의사항: ${warn.replace(/\s*\n\s*/g, ' / ')}`);
  }

  // 머리글만 남고 값이 하나도 없으면 보내지 않는다
  return out.some((l) => l.startsWith('- ')) ? out.join('\n') : '';
};
