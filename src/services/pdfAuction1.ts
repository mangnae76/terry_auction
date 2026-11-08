// 옥션원(auction1.co.kr) 인쇄 PDF — 탱크옥션 양식에 맞춘 기본 규칙이 놓치는 칸을 옥션원 자리에서 다시 읽는다.
//
// 옥션원 인쇄본은
//  - 라벨 글자 사이를 띄운다('소 재 지', '채 권 자', '최 저 가')
//  - 매각기일이 머리 줄에 '매각기일 : 2026.11.19(木)' 로 있다
//  - 기일내역 · 표 칸이 옆 칸과 한 줄로 섞여 나온다(그래서 줄 단위로만 읽는다)
//  - 등기부 순위가 '1(갑4)', 임차인 칸은 여러 줄로 나뉜다
// 기본 규칙 결과(base)에서 옥션원에서 읽은 값으로 바꾸거나 빈칸을 채운다.
import type { AuctionHistoryRow, NearBidRow } from '../types/auction';
import type { ParsedPdfAuction } from './pdfAuctionImport';

/** 옥션원 인쇄본인가 */
export const isAuction1Pdf = (text: string): boolean => /옥션원|auction1\.co\.kr/.test(text);

const iso = (s: string): string => {
  const m = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};
const num = (s: string): number => Number(String(s).replace(/[^\d.]/g, '')) || 0;
const won = (n: number): string => n.toLocaleString('ko-KR');
/** 띄어 쓴 라벨 — '소 재 지' 도 '소재지' 도 맞게 */
const label = (word: string): string => word.split('').join('\\s*');
const pick = (text: string, re: RegExp): string => (re.exec(text)?.[1] ?? '').trim();
const between = (lines: string[], start: RegExp, end: RegExp): string[] => {
  const i = lines.findIndex((l) => start.test(l));
  if (i < 0) return [];
  const rest = lines.slice(i + 1);
  const j = rest.findIndex((l) => end.test(l));
  return j < 0 ? rest : rest.slice(0, j);
};
const isPageNoise = (l: string) => /auction1\.co\.kr|옥션원-법원경매정보|^\d+\/\d+$/.test(l);

const DATE_OR = '(\\d{4}[.\\-]\\d{2}[.\\-]\\d{2}|미상|없음)';

/** 임차인 현황 — '전입일자:' 줄마다 한 사람. 이름 · 점유는 그 사람 줄들의 앞머리에 나뉘어 있다 */
const parseTenants = (lines: string[]): ParsedPdfAuction['tenantInfoRows'] => {
  const block = between(lines, /^임차인\s+점유부분/, /^기타사항/).filter((l) => !isPageNoise(l));
  const groups: string[][] = [];
  for (const l of block) {
    if (/전입일자\s*:/.test(l) || !groups.length) groups.push([l]);
    else groups[groups.length - 1].push(l);
  }
  return groups
    .filter((g) => g.some((l) => /전입일자\s*:/.test(l)))
    .map((g) => {
      const all = g.join(' ');
      const nameParts: string[] = [];
      let occupation = '';
      let tail = '';
      const extra: string[] = [];
      for (const l of g) {
        const key = /(전입일자\s*:|확정일자\s*:|배당요구\s*:)/.exec(l);
        if (!key) { extra.push(l); continue; }
        const head = l.slice(0, key.index).trim();
        const occ = /(주거용|점포|사무실|영업용|공장|창고|전부|일부)/.exec(head);
        if (occ) {
          nameParts.push(head.slice(0, occ.index).trim());
          occupation = head.slice(occ.index).trim();
        } else if (head) nameParts.push(head);
        // 확정일자 줄 뒤 — 보증금 · 대항력 · 배당예상 · 기타
        if (/확정일자/.test(key[1])) tail = l.slice(key.index).replace(new RegExp(`^확정일자\\s*:\\s*${DATE_OR}`), '').trim();
      }
      const deposit = /^보\s*([\d,]+원)/.exec(tail)?.[1] ?? (/^미상/.test(tail) ? '미상' : '');
      tail = tail.replace(/^보\s*[\d,]+원(?:\s*\/?\s*월\s*[\d,]+원)?|^미상/, '').trim();
      const opposition = /^(있음|없음|포기|승계|미상|인수)/.exec(tail)?.[1] ?? '';
      tail = tail.replace(/^(있음|없음|포기|승계|미상|인수)/, '').trim();
      const analysisHead = /^(배당금\s*없음|예상배당표참조|전액\s*배당|일부\s*배당)/.exec(tail)?.[1] ?? '';
      const other = tail.replace(analysisHead, '').trim();
      const analysis = [analysisHead, ...extra.filter((e) => /배당|소멸|인수/.test(e) && !/^예상배당표참조$/.test(e) || (/^예상배당표참조$/.test(e) && !analysisHead))]
        .filter(Boolean).join(' · ');
      const nameFull = nameParts.join('');
      const sub = /(\(.*\)?)$/.exec(nameFull)?.[1] ?? '';
      return {
        name: sub ? nameFull.slice(0, nameFull.length - sub.length) : nameFull,
        subName: sub,
        occupationPeriod: occupation,
        moveIn: iso(pick(all, new RegExp(`전입일자\\s*:\\s*${DATE_OR}`))) || pick(all, new RegExp(`전입일자\\s*:\\s*${DATE_OR}`)),
        fixed: iso(pick(all, new RegExp(`확정일자\\s*:\\s*${DATE_OR}`))) || pick(all, new RegExp(`확정일자\\s*:\\s*${DATE_OR}`)),
        distribution: iso(pick(all, new RegExp(`배당요구\\s*:\\s*${DATE_OR}`))) || pick(all, new RegExp(`배당요구\\s*:\\s*${DATE_OR}`)),
        deposit,
        opposition,
        analysis,
        other,
      };
    });
};

/** 등기부 현황 — '1(갑4) 2021.07.23 …' 줄이 한 권리. 여러 줄 칸은 그 줄 위아래로 갈라져 나온다 */
const parseRegistry = (lines: string[]): ParsedPdfAuction['registryRows'] => {
  const block = between(lines, /^No\s+접수\s+권리종류/, /^(관련정보|주의사항|건축물정보)/).filter((l) => !isPageNoise(l));
  const ROW = /^\d+\((갑|을)(\d+)\)\s+(\d{4}\.\d{2}\.\d{2})\s+(.*)$/;
  const idx = block.map((l, i) => (ROW.test(l) ? i : -1)).filter((i) => i >= 0);
  const claimed = new Set<number>();
  return idx.map((ri, k) => {
    const prevEnd = k > 0 ? idx[k - 1] : -1;
    const nextStart = k + 1 < idx.length ? idx[k + 1] : block.length;
    const before = Array.from({ length: ri - prevEnd - 1 }, (_, j) => prevEnd + 1 + j).filter((i) => !claimed.has(i));
    const after = Array.from({ length: nextStart - ri - 1 }, (_, j) => ri + 1 + j);
    const last = k === idx.length - 1;
    // 위 · 아래로 나뉜 칸 — 위에도 남은 줄이 있고 아래에도 있으면 둘 다 이 줄 것(마지막 줄은 아래만 있어도)
    const own = before.length && after.length ? [...before, ...after] : last ? after : [];
    own.forEach((i) => claimed.add(i));
    const ownBefore = own.filter((i) => i < ri).map((i) => block[i]);
    const ownAfter = own.filter((i) => i > ri).map((i) => block[i]);
    const m = ROW.exec(block[ri])!;
    let rest = m[4].trim();
    const extinct = /\s(소멸|인수)$/.exec(rest)?.[1] ?? '';
    if (extinct) rest = rest.replace(/\s(소멸|인수)$/, '').trim();
    const km = /^(\S+?)(?:\(([^)]*)\))?(?:\s+(.*))?$/.exec(rest) ?? [];
    const kind = km[1] ?? rest;
    const paren = km[2] ?? '';
    let remain = (km[3] ?? '').trim();
    let holder = '';
    const first = remain.split(/\s+/)[0] ?? '';
    if (first && !/^[\d,]+원?$|^\d{4}(?:타경|카단|카합|차전|가단)\d+|^거래가액|^말소기준|^청구/.test(first)) {
      holder = first;
      remain = remain.slice(first.length).trim();
    }
    let amount = /([\d,]{4,})원/.exec(remain)?.[1] ?? '';
    if (amount) remain = remain.replace(`${amount}원`, '').trim();
    const side = [...ownBefore, ...ownAfter].join(' ');
    if (!holder) {
      const h = /^([^\s\d(][^\s]*)/.exec(ownBefore.join(' '))?.[1] ?? '';
      if (h && !/청구금액|전입|확정/.test(h)) holder = h;
    }
    if (!amount) {
      const claim = /청구금액\s*:?\s*[^\d]*([\d,]{4,})원?/.exec(`${side}`)?.[1] ?? /([\d,]{4,})원/.exec(side)?.[1] ?? '';
      if (claim) amount = /청구금액/.test(side) ? `청구:${claim}` : claim;
    }
    const desc = [paren, remain, side.replace(holder, '').replace(/청구금액\s*:?/, '').replace(/[\d,]{4,}원/, '')]
      .map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    return { date: iso(m[3]), order: `${m[1]}(${m[2]})`, kind, holder, amount, desc, extinct };
  });
};

/** 매각사례분석 — '최근1년간(273건) ￦… ￦… 64.88% 1.84회 4.97명 ￦…' */
const parseNearBids = (text: string): NearBidRow[] =>
  [...text.matchAll(/(최근\s*1년간|\d+개월간)\((\d+)건\)\s+[￦₩]?([\d,]+)\s+[￦₩]?([\d,]+)\s+([\d.]+%)\s+[\d.]+회\s+([\d.]+명)\s+[￦₩]?([\d,]+)/g)]
    .map((m) => ({
      saleInfo: `${/1년/.test(m[1]) ? '최근12개월' : `최근${m[1].replace('간', '')}`}(${m[2]}건)`,
      appraisal: m[3],
      minimum: m[4],
      winning: m[6],
      rate: m[5],
      expectedWinning: m[7],
    }));

/** 옥션원 자리에서 다시 읽어 base 를 고친다 — 읽은 값만 바꾸고 못 읽은 칸은 base 그대로 */
export const applyAuction1 = (text: string, base: ParsedPdfAuction): ParsedPdfAuction => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const r: ParsedPdfAuction = { ...base, buildingHeader: { ...base.buildingHeader } };
  const set = <K extends keyof ParsedPdfAuction>(k: K, v: ParsedPdfAuction[K] | '' | 0 | undefined) => {
    if (v === undefined || v === '' || v === 0 || (Array.isArray(v) && !v.length)) return;
    r[k] = v as ParsedPdfAuction[K];
  };

  // 머리 줄 — '인천지방법원 본원 19계(032-860-1619) / 매각기일 : 2026.11.19(木) (10:00)'
  const head = lines.find((l) => /계\s*\(\d{2,4}-\d{3,4}-\d{4}\)/.test(l)) ?? '';
  set('courtName', pick(head, /^(\S+법원)/));
  const dept = pick(head, /(\d+)계\s*\(/);
  set('courtDept', dept ? `경매${dept}계` : '');
  set('courtPhone', pick(head, /계\s*\((\d{2,4}-\d{3,4}-\d{4})\)/));
  const eventDate = iso(pick(text, /매각기일\s*:\s*(\d{4}\.\d{2}\.\d{2})/));
  set('eventDate', eventDate);

  const addr = pick(text, new RegExp(`${label('소재지')}\\s+([^\\n]+)`));
  set('address', addr.replace(/,\s*/g, ' ').replace(/\s+/g, ' '));
  set('roadAddress', pick(text, new RegExp(`${label('새주소')}\\s+([^\\n]+)`)).replace(/,\s*/g, ' '));
  const kindText = pick(text, new RegExp(`${label('사건명')}\\s+(\\S+)`));
  if (/강제/.test(kindText)) r.auctionKind = '강제';
  else if (/임의/.test(kindText)) r.auctionKind = '임의';
  set('ownerName', pick(text, new RegExp(`${label('소유자')}\\s+([^\\n]+?)\\s*$`, 'm')));
  set('debtorName', pick(text, new RegExp(`${label('채무자')}\\s+([^\\n]+?)\\s*$`, 'm')));
  set('creditorName', pick(text, new RegExp(`${label('채권자')}\\s+([^\\n]+?)\\s*$`, 'm')));
  set('saleClassification', pick(text, /^매각물건\s+(.+?매각)(?:\s|$)/m));

  // 기일내역 — 한 줄에 '3차 2026-11-19 83,790,000원 [결과]' (결과는 같은 줄에서만)
  const history: AuctionHistoryRow[] = [...text.matchAll(/(신건|\d+차)\s+(\d{4}-\d{2}-\d{2})\s+([\d,]{5,})원(?:[ \t]+(유찰|매각|낙찰|변경|취하|기각|정지|연기|불허|허가|납부|취소))?/g)]
    .map((m) => ({ round: m[1], date: m[2], minPrice: num(m[3]), result: m[4] ?? (eventDate && m[2] >= eventDate ? '예정' : '') }));
  if (history.length) {
    r.auctionHistory = history;
    const cur = history.find((h) => h.date === eventDate) ?? history.find((h) => h.result === '예정');
    if (cur) {
      r.auctionRound = cur.round;
      r.minimumBidValue = cur.minPrice;
      if (r.appraisalValue > 0) r.minimumBidRate = Math.round((cur.minPrice / r.appraisalValue) * 100);
    }
  }
  const rate = pick(text, new RegExp(`${label('최저가')}[^\\n]*?\\((\\d+)%\\)`)) || pick(text, /\((\d+)%\)\s*[\d,]+원/);
  if (rate && r.minimumBidValue === history.find((h) => h.date === eventDate)?.minPrice) set('minimumBidRate', num(rate));

  // 면적 — '대 지 권 29.58㎡(8.95평)' · '건물면적 49.74㎡(15.05평)'
  const land = new RegExp(`${label('대지권')}\\s+([\\d.]+)㎡\\(([\\d.]+)평\\)`).exec(text);
  if (land) { r.landAreaM2 = num(land[1]); r.landAreaPyeong = num(land[2]); }
  const bld = /건물면적\s+([\d.]+)㎡\(([\d.]+)평\)/.exec(text);
  if (bld) { r.buildingAreaM2 = num(bld[1]); r.buildingAreaPyeong = num(bld[2]); }

  // 건축물정보(공공데이터) — 총괄표제부 · 전유부
  const unit = /전유\/주\s+(\S+)\s+(\S+구조)\s+(\S+)\s+([\d.]+)\s*㎡/.exec(text);
  const common = /공용\/주\s+\S+\s+\S+구조\s+(\S+)\s+([\d.]+)\s*㎡/.exec(text);
  if (common) { r.commonAreaM2 = num(common[2]); r.commonAreaPyeong = Math.round(num(common[2]) * 0.3025 * 100) / 100; }
  if (unit) set('structureType', unit[2]);
  const approval = iso(pick(text, /사용승인일\s+(\d{4}\.\d{2}\.\d{2})/));
  set('approvalDate', approval);
  const bh = r.buildingHeader;
  const hh = /호수\/가구수\/세대수\s+(\d+)\/(\d+)\/(\d+)/.exec(text);
  if (hh) { bh.households = `${hh[1]} / ${hh[3]} / ${hh[2]}`; bh.unitHouseholds = bh.households; }
  const g = (re: RegExp) => pick(text, re);
  bh.landAreaTotal ||= g(/대지면적\s+([\d.]+\s*㎡)/).replace(/\s/g, '');
  bh.buildingCoverage ||= g(/건폐율\s+([\d.]+\s*%)/).replace(/\s/g, '');
  bh.floorAreaRatio ||= g(/용적률\s+([\d.]+\s*%)/).replace(/\s/g, '');
  bh.buildingAreaTotal ||= g(/건축면적\s+([\d.]+\s*㎡)/).replace(/\s/g, '');
  bh.totalFloorArea ||= g(/연면적\s+([\d.]+\s*㎡)/).replace(/\s/g, '');
  bh.permitDate ||= iso(g(/허가일자\s+(\d{4}\.\d{2}\.\d{2})/));
  bh.startDate ||= iso(g(/착공일자\s+(\d{4}\.\d{2}\.\d{2})/));
  bh.approvalDate ||= approval;
  // 용도 칸은 줄이 갈라져 '다세대주택(도시형' 이 윗줄로 떨어진다 — 그 줄에서, 없으면 전유부 용도
  const use = pick(text, /^(\S+?)\(도시형/m) || pick(text, /용도\s+([가-힣]+(?:주택|시설|아파트|오피스텔|상가))/) || (unit ? unit[3] : '');
  bh.mainUse ||= use;
  const parking = g(/총주차대수\s+(\d+)\s*대/);
  if (parking) { bh.parking ||= `${parking}대`; bh.unitTotalParking ||= `${parking}대`; }
  const fl = /(\d+)층중\s*(\d+)층/.exec(text);
  if (fl) bh.floors ||= `0층 / ${fl[1]}층`;
  bh.unitLocation ||= r.address;
  if (r.buildingAreaM2) bh.unitExclusiveArea ||= `${r.buildingAreaM2}㎡ (${r.buildingAreaPyeong}평)`;
  if (r.commonAreaM2) bh.unitCommonArea ||= `${r.commonAreaM2}㎡ (${r.commonAreaPyeong}평)`;
  if (unit) { bh.unitFloor ||= unit[1].replace('/', ' '); bh.unitStructure ||= unit[2]; }
  if (common) bh.commonUse ||= common[1];

  // 임차인 · 등기부 · 관련사건 · 주의사항
  const tenants = parseTenants(lines);
  set('tenantInfoRows', tenants);
  const registry = parseRegistry(lines);
  set('registryRows', registry);
  set('rightsClaimAmount', num(pick(text, /채권액합계\s*:\s*([\d,]+)원/)));
  const rel = /\[관련사건\]\s*(?:\S+-)?(\S+법원)\s+(\d{4}[가-힣]+\d+)\s+(\S+)/.exec(text);
  if (rel) r.relatedCaseRows = [{ court: rel[1], caseNumber: rel[2], kind: rel[3], result: '' }];
  const warn = between(lines, /^주의사항/, /^(건축물정보|국토교통부|지자체)/);
  const warnHead = pick(text, /^주의사항\s+(.+)$/m);
  r.registryWarnings = [warnHead, ...warn.filter((l) => /^▶/.test(l))].filter(Boolean).join('\n');

  // 인근역 · 주민센터
  const stations = [...text.matchAll(/\*\s*(\S+선)\s+(\S+?)역?\s+([\d.]+k?m)/g)].map((m) => `${m[1]} ${m[2].replace(/역$/, '')} (${m[3]})`);
  set('nearestStation', stations.join(', '));
  const office = /^(\S+\s*(?:주민센터|행정복지센터))\s+\[(\d{5})\]\s+([^/]+?)\s*\/\s*전화\s*:\s*([\d-]+)(?:\s*\/\s*팩스\s*:\s*([\d-]+))?/m.exec(text);
  if (office) {
    r.adminAgencyItems = [{ name: office[1], type: '주민센터', zip: office[2], address: office[3].trim(), phone: office[4], fax: office[5] ?? '', area: '' }];
    r.adminAgencies = office[1];
  }

  // 매각사례분석
  const near = parseNearBids(text);
  if (near.length) {
    r.nearBidRows = near;
    r.nearBidSaleInfo = near.map((x) => x.saleInfo).join('\n');
    r.nearBidAppraisal = near.map((x) => x.appraisal).join('\n');
    r.nearBidMinimum = near.map((x) => x.minimum).join('\n');
    r.nearBidWinning = near.map((x) => x.winning).join('\n');
    r.nearBidRate = near.map((x) => x.rate).join('\n');
    r.nearBidExpectedWinning = near.map((x) => x.expectedWinning).join('\n');
  }

  // 요약 글 — 기본 규칙과 같은 꼴로 다시 엮는다
  if (tenants.length) {
    r.occupancySummary = tenants
      .map((t) => [`${t.name}${t.subName}`, t.occupationPeriod, t.moveIn ? `전입 ${t.moveIn}` : '', t.fixed ? `확정 ${t.fixed}` : '',
        t.deposit ? `보 ${t.deposit}` : '', t.opposition, t.analysis].filter(Boolean).join(' / '))
      .join(' | ').slice(0, 320);
  }
  r.rightsSummary = [r.rightsBaseDate ? `말소기준일 ${r.rightsBaseDate}` : '', r.rightsClaimAmount ? `채권합계 ${won(r.rightsClaimAmount)}원` : '']
    .filter(Boolean).join(' / ');
  r.notes = [r.roadAddress ? `도로명주소 ${r.roadAddress}` : '', r.creditorName ? `채권자 ${r.creditorName}` : '',
    r.nearestStation ? `인근역 ${r.nearestStation}` : '', r.registryWarnings.replace(/\n/g, ' ')].filter(Boolean).join(' / ').slice(0, 700);
  return r;
};
