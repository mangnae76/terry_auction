import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AuctionHistoryRow, NearBidRow, RealTradeRow } from '../types/auction';
import { formatNumber, parseKoreanPriceText } from '../utils/numberFormat';
import { pickCurrentRound } from '../utils/auctionSchedule';
import { apiPath } from './apiBase';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const KOREAN_REGION_REGEX =
  /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;

const FILE_NAME_CASE_REGEX = /(\d{4}타경\d+)/;
export interface ParsedPdfAuction {
  sourceName: string;
  sourceUrl?: string;
  sourceFolderUrl?: string;
  /** 구글 드라이브 파일 id — 원본 PDF를 다시 열 때 쓴다 */
  sourceFileId?: string;
  rawText: string;
  caseNumber: string;
  courtName: string;
  courtDept: string;
  courtPhone: string;
  address: string;
  roadAddress: string;
  propertyType: string;
  auctionKind: '임의' | '강제';
  auctionRound: string;
  eventDate: string;
  appraisalValue: number;
  minimumBidValue: number;
  minimumBidRate: number;
  depositValue: number;
  officialPriceValue: number;
  officialPriceBand: '1억 미만' | '1억 이상' | '';
  buildingAreaM2: number;
  buildingAreaPyeong: number;
  landAreaM2: number;
  landAreaPyeong: number;
  commonAreaM2: number;
  commonAreaPyeong: number;
  structureType: string;
  appraisalCompany: string;
  priceDate: string;
  preservationDate: string;
  caseStartDate: string;
  cancellationBaseDate: string;
  distributionRequestDate: string;
  smallAmountBaseDate: string;
  auctionHistory: AuctionHistoryRow[];
  approvalDate: string;
  ownerName: string;
  debtorName: string;
  creditorName: string;
  occupancyStatus: '점유O' | '점유X';
  oppositionStatus: '대항력O' | '대항력X';
  takeoverContent: 'O' | 'X';
  surveyStatus: string;
  delinquentCharges: string;
  rightsBaseDate: string;
  rightsClaimAmount: number;
  occupancySummary: string;
  rightsSummary: string;
  notes: string;
  nearestStation: string;
  elementarySchools: string;
  middleSchools: string;
  highSchools: string;
  adminAgencies: string;
  adminAgencyItems: Array<{ name: string; type: string; zip: string; address: string; phone: string; fax: string; area: string }>;
  pdfNearbyEnv: import('../types/auction').PdfNearbyEnv;
  aptComplexInfo: import('../types/auction').AptComplexInfo | null;
  arrearsInfo: import('../types/auction').ArrearsInfo | null;
  locationSummary: import('../types/auction').LocationSummary | null;
  tenantInfoRows: Array<{
    name: string;
    subName: string;
    occupationPeriod: string;
    moveIn: string;
    fixed: string;
    distribution: string;
    deposit: string;
    opposition: string;
    analysis: string;
    other: string;
  }>;
  realTradeRows: RealTradeRow[];
  nearBidRows: NearBidRow[];
  nearBidSaleInfo: string;
  nearBidAppraisal: string;
  nearBidMinimum: string;
  nearBidWinning: string;
  nearBidRate: string;
  nearBidExpectedWinning: string;
  saleClassification: string;
  progressNote: string;
  registryRows: Array<{ date: string; order: string; kind: string; holder: string; amount: string; desc: string; extinct: string }>;
  registryWarnings: string;
  relatedCaseRows: Array<{ court: string; caseNumber: string; kind: string; result: string }>;
  tenantOtherNotes: string;
  tenantTotalDeposit: string;
  buildingHeader: {
    locationDetail: string;
    households: string;
    landAreaTotal: string;
    buildingCoverage: string;
    permitDate: string;
    buildingAreaTotal: string;
    floorAreaRatio: string;
    startDate: string;
    totalFloorArea: string;
    mainUse: string;
    approvalDate: string;
    parking: string;
    floors: string;
    elevator: string;
    exclusiveFloorRows: Array<{ floor: string; area: string; structure: string; mainUse: string; otherUse: string }>;
    unitLocation: string;
    unitExclusiveArea: string;
    unitCommonArea: string;
    unitFloor: string;
    unitStructure: string;
    unitTotalParking: string;
    unitHouseholds: string;
    /** 주건축물 '공용' 행의 상세용도 — 계단실/복도 → 계단식/복도식 판정에 쓴다 */
    commonUse: string;
  };
}

export interface DrivePdfDescriptor {
  id: string;
  name: string;
  downloadUrl: string;
}

const normalizeText = (text: string) =>
  text
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const toNumber = (value: string | undefined, fallback = 0) => {
  if (!value) {
    return fallback;
  }
  const normalized = value.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoDate = (value: string | undefined, fallback = '') => {
  if (!value) {
    return fallback;
  }
  const normalized = value.replace(/[./\s]/g, '-').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return fallback;
};

const toPyeong = (m2: number) => Number((m2 / 3.3058).toFixed(2));

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
};

const firstMoney = (text: string, patterns: RegExp[]) => toNumber(firstMatch(text, patterns));

const cleanSummary = (value: string, maxLength = 800) =>
  value.replace(/\s+/g, ' ').replace(/\s([,.])/g, '$1').trim().slice(0, maxLength);

const inferPropertyType = (text: string) => {
  // The property-type label sits at the very top of the PDF (before "토지·건물 일괄매각").
  // Other types like "아파트" / "오피스텔" appear in nearby/site-info sections, so a plain
  // text.includes() over the whole doc misclassifies (e.g., 도시형생활주택 → 아파트).
  // Restrict to the head of the document and check more specific types first.
  const head = text.slice(0, 600);
  const checks: Array<[RegExp, string]> = [
    [/도시형생활주택/, '도시형생활주택'],
    [/다세대주택/, '다세대주택'],
    [/연립주택/, '연립주택'],
    [/단독주택/, '단독주택'],
    [/오피스텔/, '오피스텔'],
    [/아파트/, '아파트'],
    [/다세대/, '다세대'],
    [/연립/, '연립'],
    [/빌라/, '빌라'],
  ];
  for (const [re, label] of checks) {
    if (re.test(head)) return label;
  }
  // Fallback to whole-doc scan with same priority order
  for (const [re, label] of checks) {
    if (re.test(text)) return label;
  }
  return '주택';
};

const inferAuctionRound = (minimumBidRate: number) => {
  if (minimumBidRate >= 95) {
    return '신건';
  }
  if (minimumBidRate >= 68) {
    return '2차';
  }
  if (minimumBidRate >= 48) {
    return '3차';
  }
  return '신건';
};

const pickPrimaryAddress = (lines: string[]) => {
  const candidate = lines.find((line, index) => {
    if (index > 20 || !KOREAN_REGION_REGEX.test(line)) {
      return false;
    }
    if (
      line.includes('도로명주소') ||
      line.includes('전화') ||
      line.includes('관할구역') ||
      line.includes('행정복지센터') ||
      line.includes('세무서') ||
      line.includes('등기국') ||
      line.includes('경원대로')
    ) {
      return false;
    }
    return line.includes('동') || line.includes('호') || line.includes(',');
  });

  return candidate?.trim() ?? '';
};

const buildLineText = async (bytes: Uint8Array) => {
  const pdf = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    type Row = { text: string; x: number; y: number; width: number; height: number };
    const rows = content.items
      .map((item): Row | null => {
        if (!('str' in item)) return null;
        const raw = (item as { str: string }).str;
        if (!raw) return null;
        return {
          text: raw,
          x: item.transform[4],
          y: item.transform[5],
          width: 'width' in item ? (item as { width: number }).width : 0,
          height: 'height' in item ? (item as { height: number }).height : 0,
        };
      })
      .filter((row): row is Row => Boolean(row && row.text.trim()));

    rows.sort((a, b) => (Math.abs(b.y - a.y) < 2 ? a.x - b.x : b.y - a.y));

    const lines: Array<{ y: number; items: Row[] }> = [];
    rows.forEach((row) => {
      const current = lines[lines.length - 1];
      if (current && Math.abs(current.y - row.y) < 2) {
        current.items.push(row);
        return;
      }
      lines.push({ y: row.y, items: [row] });
    });

    const pageText = lines
      .map((line) => {
        const sorted = [...line.items].sort((a, b) => a.x - b.x);
        let out = '';
        for (let i = 0; i < sorted.length; i += 1) {
          const cur = sorted[i];
          const piece = cur.text;
          if (i === 0) {
            out = piece;
            continue;
          }
          const prev = sorted[i - 1];
          const prevEnd = prev.x + (prev.width || 0);
          const gap = cur.x - prevEnd;
          const charHeight = prev.height || cur.height || 8;
          // Tight gap = same word fragmented by extractor; no space.
          // Use the prev/cur boundary char info too: if either side already has whitespace, trust it.
          //
          // 임계값 주의: 탱크옥션 PDF는 공백 문자를 넣지 않고 좌표 간격으로만 띄어쓰기를 표현한다.
          // 실측하면 글자 내부 이음새는 gap/height ≈ 0.00, 실제 띄어쓰기는 ≈ 0.28로 뚜렷이 갈리고
          // 그 사이(0.05~0.25) 값은 나오지 않는다. 예전 값 0.3은 띄어쓰기까지 "붙은 것"으로 판정해
          // "인천광역시서해구검암동636-11풀하우스"처럼 한 덩어리로 만들어 버렸다.
          const prevHasTrailingSpace = /\s$/.test(prev.text);
          const curHasLeadingSpace = /^\s/.test(piece);
          const tight = gap < charHeight * 0.15;
          if (tight && !prevHasTrailingSpace && !curHasLeadingSpace) {
            out += piece;
          } else {
            out += ' ' + piece;
          }
        }
        return out.replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean)
      .join('\n');

    pages.push(pageText);
  }

  return normalizeText(pages.join('\n\n'));
};

const sliceSection = (text: string, startMarker: string, endMarkers: string[]) => {
  const startIndex = text.indexOf(startMarker);
  if (startIndex < 0) {
    return '';
  }

  const tail = text.slice(startIndex + startMarker.length);
  let endIndex = tail.length;
  endMarkers.forEach((marker) => {
    const markerIndex = tail.indexOf(marker);
    if (markerIndex >= 0 && markerIndex < endIndex) {
      endIndex = markerIndex;
    }
  });
  return tail.slice(0, endIndex).trim();
};

const parseAptComplexInfo = (text: string): import('../types/auction').AptComplexInfo | null => {
  const idx = text.indexOf('단지정보');
  if (idx < 0) return null;
  const endIdx = (() => {
    const candidates = ['체납내역', '건축물정보', '동호수/공시가격'];
    let min = text.length;
    for (const c of candidates) {
      const i = text.indexOf(c, idx + 4);
      if (i > 0 && i < min) min = i;
    }
    return min;
  })();
  const section = text.slice(idx + 4, endIdx).replace(/([가-힣])\s+(?=[가-힣])/g, '$1');
  const get = (label: string, end?: string[]): string => {
    const re = new RegExp(`${label}\\s+(.+?)\\s*(?=${(end ?? []).concat([
      '단지명', '세대수', '동\\s*수', '사용승인일', '시공사', '주차\\s*수', '세대당\\s*주차',
      '난방\\s*방식', '난방\\s*연료', '용적율', '용적률', '건폐율', '최고층', '최저층',
      '관리소번호', '편의시설', '교육시설', '휴식\\/공원', '면적\\s*종류', '전기차충전소', '$',
    ]).join('|')})`);
    const m = section.match(re);
    return m?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  };
  const info: import('../types/auction').AptComplexInfo = {
    name: get('단지명'),
    households: get('세대수'),
    buildings: get('동\\s*수'),
    approvalDate: get('사용승인일'),
    contractor: get('시공사'),
    parkingTotal: get('주차\\s*수'),
    parkingPerHouse: get('세대당\\s*주차'),
    heatingType: get('난방\\s*방식'),
    heatingFuel: get('난방\\s*연료'),
    floorRatio: get('용적율') || get('용적률'),
    buildingCoverage: get('건폐율'),
    topFloor: get('최고층'),
    bottomFloor: get('최저층'),
    managementPhone: get('관리소번호'),
    facilities: get('편의시설'),
    schools: get('교육시설'),
    restPark: get('휴식\\/공원'),
    areaTypes: get('면적\\s*종류'),
    evCharger: get('전기차충전소'),
  };
  // Returns null if nothing useful was extracted
  if (!info.name && !info.households && !info.buildings) return null;
  return info;
};

const parseArrearsInfo = (text: string): import('../types/auction').ArrearsInfo | null => {
  const idx = text.indexOf('체납내역');
  if (idx < 0) return null;
  const endIdx = (() => {
    const candidates = ['건축물정보', '인근역세권', '행정기관'];
    let min = text.length;
    for (const c of candidates) {
      const i = text.indexOf(c, idx + 4);
      if (i > 0 && i < min) min = i;
    }
    return min;
  })();
  const section = text.slice(idx + 4, endIdx);
  const surveyDateMatch = section.match(/조사일\s+(\d{4}-\d{2}-\d{2})/);
  const amountMatch = section.match(/체납금액\s+([^\n비]+)/);
  const noteMatch = section.match(/비고\s*([\s\S]+?)(?=$|건축물정보|인근역세권)/);
  const note = noteMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  if (!surveyDateMatch && !amountMatch && !note) return null;
  return {
    surveyDate: surveyDateMatch?.[1] ?? '',
    amount: amountMatch?.[1]?.trim() ?? '',
    note,
  };
};

const PDF_NEARBY_LABEL_MAP: Record<string, keyof import('../types/auction').PdfNearbyEnv> = {
  '버스정류장': 'busStop',
  '종합병원': 'hospital',
  '편의점': 'convStore',
  '공원': 'park',
  '행정복지센터': 'publicCenter',
  '공인중개사': 'realtor',
  '지하철': 'subway',
  '학원': 'academy',
  '어린이집': 'daycare',
  '약국': 'pharmacy',
  '대형마트': 'mart',
  '의원': 'clinic',
};

const parsePdfNearbyEnv = (text: string) => {
  // PDF 텍스트 추출 시 한글 사이에 공백이 들어가는 경우가 있음 (예: "행 정 복 지 센 터")
  // 카테고리 라벨이 안 잡히는 문제를 해결하기 위해 한글 사이 single space를 제거.
  const normalized = text.replace(/([가-힣])\s+(?=[가-힣])/g, '$1');
  const labelRe = /(버스정류장|종합병원|편의점|공원|행정복지센터|공인중개사|지하철|학원|어린이집|약국|대형마트|의원)\s*\((\d+)\)/g;
  const allMatches = [...normalized.matchAll(labelRe)];
  const result: import('../types/auction').PdfNearbyEnv = {};

  if (typeof console !== 'undefined') {
    console.log('[NearbyParse] total label matches:', allMatches.length, 'samples:', allMatches.slice(0, 3).map((m) => m[0]));
  }

  if (allMatches.length === 0) return result;

  // 카테고리별로 다음 카테고리 직전까지의 body를 추출
  allMatches.forEach((match, idx) => {
    const label = match[1];
    const total = Number(match[2]);
    const key = PDF_NEARBY_LABEL_MAP[label];
    if (!key) return;
    const start = (match.index ?? 0) + match[0].length;
    const end = idx + 1 < allMatches.length ? (allMatches[idx + 1].index ?? normalized.length) : Math.min(normalized.length, start + 800);
    const body = normalized.slice(start, end);
    const itemRe = /([가-힣A-Za-z0-9() ·.\-]+?)\s*\(([\d.]+\s*(?:km|m))\)/g;
    const items: Array<{ name: string; distance: string }> = [];
    let im: RegExpExecArray | null;
    while ((im = itemRe.exec(body)) !== null) {
      const name = im[1].trim();
      const distance = im[2].replace(/\s+/g, '');
      // Filter noise: too short names, page numbers, time strings, label names
      if (!name) continue;
      if (name.length < 2) continue;
      if (PDF_NEARBY_LABEL_MAP[name]) continue;
      if (/^\d+$/.test(name)) continue;
      items.push({ name, distance });
    }
    // Only set if we actually found items OR if total > 0 (preserve count even if items missed)
    result[key] = { total, items };
  });

  if (typeof console !== 'undefined') {
    console.log('[NearbyParse] result keys:', Object.keys(result), 'counts:', JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, `${v.total}/${v.items.length}`]))));
  }

  return result;
};

// 구 양식은 '인근역세권 / 인근역 …', 최신 양식은 '도시철도' 아래 한 줄에 노선·거리가 나열된다.
// 최신 양식의 매각구분 배지에 "공시가 1~2억" / "공시가 1억이하"처럼 공시가 구간이 들어 있다.
// (공시가격 섹션 자체가 빠진 PDF에서도 구간만은 알 수 있다)
const parseOfficialPriceBand = (text: string): '1억 미만' | '1억 이상' | '' => {
  const band = firstMatch(text, [/공시가\s*([\d~억이하상만원\s]+?)(?:\/|HUG|$|\n)/]);
  if (!band) return '';
  if (/1억\s*이하|1억\s*미만/.test(band)) return '1억 미만';
  if (/\d\s*[~-]\s*\d\s*억|억\s*이상|\d억/.test(band)) return '1억 이상';
  return '';
};

const LOCATION_SUMMARY_LABELS = ['요약', '입지', '교육', '생활', '교통', '건물', '검토'] as const;

// 최신 양식에만 있는 '주변환경 및 입지 요약' — 항목마다 여러 줄로 접히므로 한 줄로 펴서 라벨별로 자른다.
const parseLocationSummary = (text: string): import('../types/auction').LocationSummary | null => {
  const idx = text.indexOf('주변환경 및 입지 요약');
  if (idx < 0) return null;

  let section = text.slice(idx + '주변환경 및 입지 요약'.length);
  ['※', 'QR코드', '지도 스카이뷰'].forEach((marker) => {
    const i = section.indexOf(marker);
    if (i >= 0) section = section.slice(0, i);
  });
  // 본문 뒤에 붙는 키워드 칩("다세대·연립 주거권 공동주택 주거권 …")은 문장이 아니므로 잘라 낸다
  const lastStop = section.lastIndexOf('.');
  if (lastStop > 0) section = section.slice(0, lastStop + 1);

  const flat = section.replace(/\s+/g, ' ').trim();
  if (!flat) return null;

  const result: import('../types/auction').LocationSummary = {};
  LOCATION_SUMMARY_LABELS.forEach((label, i) => {
    const nexts = LOCATION_SUMMARY_LABELS.slice(i + 1).join('|');
    const re = new RegExp(`(?:^|\\s)${label}\\s+(.+?)(?=\\s(?:${nexts})\\s|$)`);
    const value = flat.match(re)?.[1]?.trim();
    if (value) result[label] = value;
  });

  return Object.keys(result).length > 0 ? result : null;
};

const parseNearestStation = (text: string) => {
  const legacy = firstMatch(text, [/인근역\s+([^\n]+)/]);
  if (legacy) return legacy;

  const idx = text.indexOf('도시철도');
  if (idx >= 0) {
    const line = text
      .slice(idx + '도시철도'.length, idx + 800)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /\(\s*[\d.]+\s*(?:km|m)\s*\)/.test(l) && !/^\d{2}\.\s/.test(l));
    if (line) return line;
  }

  return firstMatch(text, [/인근에 버스정류장 및[^\n]*?[‘"]([^’"\n]+역)/]);
};

const AGENCY_END_MARKERS = ['교육환경', '도시철도', '인근역세권', '초등학교 (', '주변환경 및 입지 요약', 'QR코드'];

// 구 양식은 '행정기관' 아래 등기소·세무서·행정복지센터가 나열된다.
// 최신 양식은 같은 목록이 '주변환경'이라는 제목 아래로 옮겨 갔는데,
// '주변환경'은 1페이지 감정평가 요약과 마지막 '주변환경 및 입지 요약'에도 쓰이므로
// 기관 목록이 실제로 뒤따르는 '주변환경' 줄만 골라 시작점으로 잡는다.
const sliceAgencySection = (text: string) => {
  // 페이지 헤더('26. 4. 12. … 경매:2024타경…')를 섹션 끝으로 오인하면 첫 기관만 잡힌다.
  // 헤더 줄은 아래에서 따로 걸러내므로 끝 마커로는 쓰지 않는다.
  const legacy = sliceSection(text, '행정기관', AGENCY_END_MARKERS);
  if (legacy) return legacy;

  const re = /^주변환경\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const tail = text.slice(start);
    if (!/^[\s\S]{0,400}(등기소|세무서|우체국|행정복지센터|주민센터)/.test(tail)) continue;
    let end = tail.length;
    AGENCY_END_MARKERS.forEach((marker) => {
      const i = tail.indexOf(marker);
      if (i >= 0 && i < end) end = i;
    });
    return tail.slice(0, end).trim();
  }
  return '';
};

const parseAdminAgencyItems = (text: string) => {
  const section = sliceAgencySection(text);
  if (!section) return [];
  // Compact lines, drop page-header noise
  const cleaned = section
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l && !/^\d{2}\.\s/.test(l) && !l.startsWith('https://') && !l.startsWith('경매:'))
    .join('\n');

  // Split into agency blocks: each starts with a line ending with (등기소|세무서|우체국|법원|법무사) OR ending with 행정복지센터/주민센터
  const lines = cleaned.split('\n');
  const items: Array<{ name: string; type: string; zip: string; address: string; phone: string; fax: string; area: string }> = [];
  let cur: { name: string; type: string; zip: string; address: string; phone: string; fax: string; area: string } | null = null;

  for (const line of lines) {
    const typedHeader = line.match(/^(.+?)\((등기소|세무서|우체국|법원|법무사)\)(?:\s*\+\s*\d+\s*보기)?\s*$/);
    const centerHeader = line.match(/^(.+?(?:행정복지센터|주민센터))\s*$/);
    if (typedHeader) {
      if (cur) items.push(cur);
      cur = { name: typedHeader[1].trim(), type: typedHeader[2], zip: '', address: '', phone: '', fax: '', area: '' };
      continue;
    }
    if (centerHeader) {
      if (cur) items.push(cur);
      cur = { name: centerHeader[1].trim(), type: '행정복지센터', zip: '', address: '', phone: '', fax: '', area: '' };
      continue;
    }
    if (!cur) continue;

    const zipMatch = line.match(/^\[(\d+)\]\s*(.+?)(?:\s*\/\s*전화:?\s*([\d\-()\s]+))?(?:\s*\/\s*팩스:?\s*([\d\-()\s]+))?$/);
    if (zipMatch) {
      cur.zip = zipMatch[1];
      cur.address = zipMatch[2].trim();
      if (zipMatch[3]) cur.phone = zipMatch[3].trim();
      if (zipMatch[4]) cur.fax = zipMatch[4].trim();
      continue;
    }
    const phoneFaxMatch = line.match(/(?:전화:?\s*([\d\-()\s]+))?(?:.*?팩스:?\s*([\d\-()\s]+))?/);
    if (phoneFaxMatch && (phoneFaxMatch[1] || phoneFaxMatch[2])) {
      if (phoneFaxMatch[1] && !cur.phone) cur.phone = phoneFaxMatch[1].trim();
      if (phoneFaxMatch[2] && !cur.fax) cur.fax = phoneFaxMatch[2].trim();
      continue;
    }
    if (line.startsWith('관할구역')) {
      cur.area = line.replace(/^관할구역\s*:\s*/, '').trim();
    } else if (cur.area) {
      // Continuation line for area
      cur.area += ' ' + line;
    }
  }
  if (cur) items.push(cur);

  return items;
};

const parseAdminAgencies = (text: string): string => {
  const section = sliceAgencySection(text);
  if (!section) return '';

  const lines = section
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);

  const pickups: string[] = [];
  const seen = new Set<string>();
  lines.forEach((line) => {
    if (/^\[\d+\]/.test(line)) return;
    if (line.startsWith('관할구역')) return;
    if (line.startsWith('전화') || line.startsWith('팩스')) return;
    if (line.startsWith('인근역') || line.startsWith('교육환경')) return;

    const agencyMatch = line.match(/^(.+?)\((등기소|세무서|우체국|법원)\)/);
    const centerMatch = line.match(/^(.+?(?:행정복지센터|주민센터))/);
    const name = agencyMatch?.[1]?.trim() || centerMatch?.[1]?.trim();
    if (!name) return;
    const label = agencyMatch
      ? `${name} (${agencyMatch[2]})`
      : name;
    if (seen.has(label)) return;
    seen.add(label);
    pickups.push(label);
  });

  return pickups.join(' / ');
};

const parseSchoolGroups = (text: string) => {
  const empty = { elementarySchools: '', middleSchools: '', highSchools: '' };

  // 구 양식은 '교육환경' 제목 아래, 최신 양식은 제목 없이 바로
  // "초등학교 (3) 중학교 (4) 고등학교 (5)" 헤더가 온다. 제목에 기대지 않고 헤더 줄을 찾는다.
  const lines = text
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);

  const headerIdx = lines.findIndex(
    (line) => /초등학교\s*\(\d+\)/.test(line) && /중학교\s*\(\d+\)/.test(line) && /고등학교\s*\(\d+\)/.test(line),
  );
  if (headerIdx < 0) return empty;

  // 학교 표 다음 섹션이 시작되면 멈춘다. 특히 최신 양식의 '주변환경 및 입지 요약' 본문에는
  // "수도권 인천2호선 검바위 (58m)" 같은 '이름 (거리)' 문자열이 섞여 있어 그대로 두면 학교로 들어온다.
  const STOP_MARKERS = ['주변환경 및 입지 요약', 'QR코드', '행정기관', '인근역세권', '도시철도', '지도 스카이뷰', '※'];

  const elem: string[] = [];
  const middle: string[] = [];
  const high: string[] = [];

  // PDF 표는 row-major로 추출됨: 한 줄에 [초등, 중학, 고등] 컬럼들이 나란히.
  // /중$/ 또는 /중학교$/로 끝나는 항목을 "중학교 컬럼 앵커"로 잡고,
  // 그 앞 idx = 초등, 그 뒤 idx = 고등으로 분류한다.
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (STOP_MARKERS.some((marker) => line.startsWith(marker))) break;
    if (/^반경/.test(line)) continue; // 최신 양식의 "반경 1km 반경 3km 반경 3km" 안내 줄
    if (/^제\d+동/.test(line) || /^\[\d+\]/.test(line)) continue;
    if (
      line.includes('관할구역') || line.includes('세무서') ||
      line.includes('행정복지센터') || line.includes('전화:') ||
      line.includes('팩스:') || line.startsWith('+ 더보기') ||
      line.startsWith('https://') || /^\d{2}\.\s/.test(line) ||
      line.startsWith('경매:')
    ) continue;

    const matches = [...line.matchAll(/([가-힣A-Za-z0-9]+?)\s*\(([\d.]+\s*(?:km|m))\)/g)];
    if (matches.length === 0) continue;

    const middleIdxInLine = matches.findIndex((mm) => /중$/.test(mm[1]) || /중학교$/.test(mm[1]));

    matches.forEach((mm, idx) => {
      const name = mm[1];
      const dist = mm[2].replace(/\s+/g, '');
      const label = `${name}(${dist})`;
      if (/중$/.test(name) || /중학교$/.test(name)) {
        middle.push(label);
      } else if (/고$/.test(name) || /고등학교$/.test(name)) {
        high.push(label);
      } else if (middleIdxInLine === -1) {
        // 중학교 앵커가 없는 라인: 휴리스틱으로 분류
        // - 1개만 있으면 고등으로 (대부분 후반 라인은 중·고만 남음)
        // - 여러 개면 첫 항목 elem, 나머지 high
        if (matches.length === 1) high.push(label);
        else if (idx === 0) elem.push(label);
        else high.push(label);
      } else if (idx < middleIdxInLine) {
        elem.push(label);
      } else {
        high.push(label);
      }
    });
  }

  return {
    elementarySchools: elem.join(', '),
    middleSchools: middle.join(', '),
    highSchools: high.join(', '),
  };
};

const parseSaleCaseMetrics = (text: string) => {
  const rows = [
    ...text.matchAll(
      /최근(12개월|6개월|3개월|1개월)\((\d+)건\)\s+([\d,]+)원\s+([\d,]+)원\s+([\d.]+)%?\s+([\d.]+)명?\s+([\d,]+)원/g,
    ),
  ];
  const preferredOrder = ['12개월', '6개월', '3개월', '1개월'];
  const orderedRows: RegExpExecArray[] = [];
  preferredOrder.forEach((period) => {
    const matched = rows.find((row) => row[1] === period);
    if (matched) {
      orderedRows.push(matched);
    }
  });

  if (orderedRows.length === 0) {
    return {
      nearBidRows: [],
      nearBidSaleInfo: '',
      nearBidAppraisal: '',
      nearBidMinimum: '',
      nearBidWinning: '',
      nearBidRate: '',
      nearBidExpectedWinning: '',
    };
  }

  const nearBidRows: NearBidRow[] = orderedRows.map(([, period, count, avgAppraisal, avgWinning, avgRate, avgBidderCount, expectedWinning]) => ({
    saleInfo: `최근${period}(${count}건)`,
    appraisal: avgAppraisal,
    minimum: avgWinning,
    // 최신 양식은 숫자만 내려오므로 단위를 붙여 준다 (구 양식은 이미 '%'·'명'이 붙어 있음)
    winning: /명$/.test(avgBidderCount) ? avgBidderCount : `${avgBidderCount}명`,
    rate: /%$/.test(avgRate) ? avgRate : `${avgRate}%`,
    expectedWinning,
  }));

  return {
    nearBidRows,
    nearBidSaleInfo: nearBidRows.map((row) => row.saleInfo).join('\n'),
    nearBidAppraisal: nearBidRows.map((row) => row.appraisal).join('\n'),
    nearBidMinimum: '',
    nearBidWinning: nearBidRows.map((row) => row.winning).join('\n'),
    nearBidRate: nearBidRows.map((row) => row.rate).join('\n'),
    nearBidExpectedWinning: nearBidRows.map((row) => row.expectedWinning).join('\n'),
  };
};

// 월세 행은 "보 2,000만/임 65만" → "20,000,000/650,000" 으로, 나머지는 단일 금액으로 환산한다.
const formatMonthlyOrLump = (type: string, priceRaw: string) => {
  if (type !== '월세') {
    return formatNumber(parseKoreanPriceText(priceRaw));
  }
  const depositRaw = priceRaw.match(/(?:^|보\s*)([\d,]+\s*(?:억|천|만)?[^/임]*)/)?.[1] ?? priceRaw;
  const rentRaw = priceRaw.match(/임\s*([^\s/]+)/)?.[1] ?? '';
  const deposit = formatNumber(parseKoreanPriceText(depositRaw.replace(/^보\s*/, '')));
  const rent = rentRaw ? formatNumber(parseKoreanPriceText(rentRaw)) : '';
  if (!deposit) return '';
  return rent ? `${deposit}/${rent}` : deposit;
};

const parseRealTradeRows = (text: string) => {
  // "국토부 실거래가"가 PDF 안에서 헤더/요약/상세로 여러 번 등장하고,
  // 인근역세권·행정기관 같은 다른 섹션 마커가 실거래가 표 행들 사이에 끼는 경우가 있어
  // 섹션 컷을 사용하지 않고 첫 등장 이후 전체를 스캔한 뒤 중복 제거.
  const startIdx = text.indexOf('국토부 실거래가');
  if (startIdx < 0) {
    return { realTradeRows: [] };
  }
  const scanArea = text.slice(startIdx);

  // 거래금액 셀은 구 양식이 "전1억 4,400만"(접두사 붙음), 최신 양식이 "전 1억 5,900만"(띄어쓰기).
  // 월세는 "보 2,000만/임 65만"처럼 접두사가 '보'이고 보증금/차임이 함께 온다.
  const TYPE_PREFIX: Record<string, string[]> = { 매매: ['매'], 전세: ['전'], 월세: ['월', '보'] };
  const rows = [
    ...scanArea.matchAll(
      /(매매|전세|월세)\s+(\d{4}\.\d{2}\.\d{2})\s+([매전월보])\s*([^\n]+?)\s+([\d.]+㎡(?:\s*\([\d.]+평\))?)\s+(?:-\s+)?(\d+)(?=\s|$)/g,
    ),
  ];

  const seen = new Set<string>();
  const realTradeRows: RealTradeRow[] = [];
  for (const m of rows) {
    const [, type, contractDate, prefix, priceRaw, area, floor] = m;
    if (!TYPE_PREFIX[type]?.includes(prefix)) continue;
    const price = formatMonthlyOrLump(type, priceRaw.trim());
    if (!price) continue;
    const key = `${type}|${contractDate}|${price}|${area.trim()}|${floor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    realTradeRows.push({
      type,
      contractDate,
      price,
      area: area.trim(),
      floor: `${floor}층`,
    });
  }

  return {
    realTradeRows,
  };
};

const TENANT_NAME_STOPWORDS = new Set([
  '주의', '주거용', '전부', '일부', '인수', '조건', '변경', '없음', '있음', '미상', '계',
  '순위배당', '임차권', '양도인', '양수인', '임차인', '경매신청인', '배당금', '임차권등기자',
  '전입', '확정', '배당', '보', '대항력', '분석', '기타', '점유', '점유부분', '기간', '보증금', '차임',
  '목록', '현황', '승계인', '사업자등록', '확정일자',
]);

const parseTenantInfoRows = (text: string) => {
  const startMarker = text.includes('임차인 현황') ? '임차인 현황' : '점유';
  const section = sliceSection(text, startMarker, [
    '기타사항', '건물등기', '참고/주의', '주의사항', '주요변동', '관련사건', '매각사례',
  ]);
  if (!section) return [];

  // "===== 조사된 임차내역 없음 =====" 만 적힌 물건은 임차인이 없는 것
  if (/조사된\s*임차내역\s*없음/.test(section)) return [];

  const lines = section
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) =>
      l &&
      !l.startsWith('https://') &&
      !l.startsWith('경매:') &&
      !/^\d{2}\.\s/.test(l) &&
      !/점유부분/.test(l) &&
      !/전입\/확정\/배당/.test(l) &&
      !/^목록/.test(l) &&
      !/^말소기준일/.test(l));

  // 표 안쪽(집계행)부터는 임차인 행이 아니다
  const stopIdx = lines.findIndex((l) => /^계$/.test(l) || /^임차인\s*:/.test(l) || l.startsWith('(승계된'));
  const body = stopIdx >= 0 ? lines.slice(0, stopIdx) : lines;

  // 등기부와 마찬가지로 셀이 여러 줄이면 번호가 있는 기준선 줄 위·아래로 흩어진다.
  //   주택도시보증공사 주거용 전부 전입:2021-05-25   ← 기준선 위
  //   1 2021.05.25. 확정:2021-05-04 보:159,000,000원  ← 기준선
  //   ~ 배당:2023-07-04                              ← 기준선 아래
  // 기준선 사이에 낀 줄들은 '전입:'이 나오는 줄부터 다음 임차인 몫으로 넘긴다.
  const anchorRe = /^(\d+)\s+(.*)$/;
  const blocks: string[][] = [];
  let pending: string[] = [];

  body.forEach((line) => {
    const m = line.match(anchorRe);
    if (!m) {
      pending.push(line);
      return;
    }
    if (blocks.length === 0) {
      blocks.push([...pending, m[2]].filter(Boolean));
    } else {
      const splitAt = pending.findIndex((l) => l.includes('전입:'));
      const toPrev = splitAt < 0 ? pending : pending.slice(0, splitAt);
      const toNext = splitAt < 0 ? [] : pending.slice(splitAt);
      blocks[blocks.length - 1].push(...toPrev);
      blocks.push([...toNext, m[2]].filter(Boolean));
    }
    pending = [];
  });
  if (blocks.length > 0) blocks[blocks.length - 1].push(...pending);
  if (blocks.length === 0 && body.length > 0) blocks.push(body);

  const rows: Array<{
    name: string; subName: string; occupationPeriod: string;
    moveIn: string; fixed: string; distribution: string;
    deposit: string; opposition: string; analysis: string; other: string;
  }> = [];

  for (const blk of blocks) {
    const compact = blk.join(' ').replace(/\s+/g, ' ').trim();
    if (!compact) continue;

    const name =
      compact
        .split(' ')
        .find((token) => {
          const bare = token.replace(/[()[\]:：,]/g, '');
          if (!/^[가-힣]{2,}$/.test(bare)) return false;
          return !TENANT_NAME_STOPWORDS.has(bare);
        }) ?? '';
    const subName = compact.match(/(\([^()]*(?:승계인|임차인)[^()]*\))/)?.[1] ?? '';

    const moveIn = compact.match(/전입:?\s*(\d{4}[-.]\d{1,2}[-.]\d{1,2})/)?.[1]?.replace(/\./g, '-') ?? '';
    const fixed = compact.match(/확정:?\s*(\d{4}[-.]\d{1,2}[-.]\d{1,2}|미상)/)?.[1]?.replace(/\./g, '-') ?? '';
    const distribution = compact.match(/배당:?\s*(\d{4}[-.]\d{1,2}[-.]\d{1,2}|없음|미상)/)?.[1]?.replace(/\./g, '-') ?? '';
    const depositRaw = compact.match(/보:?\s*([\d,]{4,}|미상)/)?.[1] ?? '';
    const deposit = depositRaw && depositRaw !== '미상' ? `${depositRaw}원` : depositRaw;

    // 점유부분/기간 — "주거용 전부 2021.05.25. ~ 2023.05.24."
    const usage = compact.match(/주거용\s*(?:전부|일부)?/)?.[0]?.replace(/\s+/g, ' ').trim() ?? '';
    // 권리신고의 점유기간은 '시작 ~ 끝' 꼴이다. '~'를 축으로 잡아야
    // 같은 줄에 있는 전입일·확정일을 시작일로 잘못 집지 않는다.
    const range = compact.match(/(\d{4}\.\d{1,2}\.\d{1,2}\.?)\s*~\s*(\d{4}\.\d{1,2}\.\d{1,2}\.?)?/);
    const period = range ? (range[2] ? `${range[1]} ~ ${range[2]}` : `${range[1]} ~`) : '';
    const occupationPeriod = [usage, period].filter(Boolean).join(' / ');

    // 대항력 — 최신 양식은 '인수 / 조건 / 변경'이 세 줄로 쪼개져 들어온다
    let opposition = '';
    if (/인수/.test(compact) && /조건/.test(compact) && /변경/.test(compact)) opposition = '인수조건변경';
    else if (/대항력\s*여지\s*있음/.test(compact)) opposition = '대항력O';
    else if (/대항력O/.test(compact)) opposition = '대항력O';
    else if (/대항력X/.test(compact)) opposition = '대항력X';
    else if (/(^|\s)없음(?=\s|$)/.test(compact.replace(/배당금?\s*:?\s*없음/g, ' '))) opposition = '없음';

    const analysisKeywords = ['임차권 양도인', '미배당 보증금 매수인 인수', '순위배당 있음', '배당금 없음'];
    const analysis = analysisKeywords.filter((kw) => compact.includes(kw)).join(', ');

    // "(임차인:이동원)" 같은 표기가 '임차인'으로 잡히지 않게 콜론·괄호 붙은 건 제외
    const otherSet: string[] = [];
    if (/(?<![(가-힣])임차인(?![:：])/.test(compact)) otherSet.push('임차인');
    if (compact.includes('경매신청인')) otherSet.push('경매신청인');
    if (compact.includes('임차권등기자')) otherSet.push('임차권등기자');
    const other = otherSet.join(', ');

    if (name || moveIn || deposit) {
      rows.push({ name, subName, occupationPeriod, moveIn, fixed, distribution, deposit, opposition, analysis, other });
    }
  }

  return rows;
};

const parseSaleClassification = (text: string): string => {
  const m = text.match(/(?:도시형생활주택|아파트|다세대주택|연립주택|단독주택|오피스텔|상가|토지|빌라)\s*\)?\s*\n?\s*(토지[·.]건물\s*일괄매각[^\n]*)/);
  const raw = m?.[1] ?? text.match(/(토지[·.]건물\s*일괄매각[^\n]*)/)?.[1] ?? '';
  // 최신 양식은 매각구분 배지 뒤에 '매각일자 2026.10.01 (목) (10:00)'이 같은 줄로 붙는다
  return raw.replace(/\s*매각일자\s*\d{4}[.\-].*$/, '').trim();
};

const parseProgressNote = (text: string): string => {
  const m = text.match(/진행내역\s*:\s*([^\n]+)/);
  return m?.[1]?.trim() ?? '';
};

const REGISTRY_KINDS = [
  '소유권이전', '소유권보존', '소유권이전등기', '주택임차권', '전세권', '근저당권설정',
  '근저당권', '저당권설정', '저당권', '가등기', '가압류', '가처분', '압류',
  '강제경매', '임의경매', '경매개시결정',
];

const REGISTRY_SECTION_END_MARKERS = [
  '참고/주의', '주의사항', '권리분석요약', '주요변동', '관련사건',
  '매각사례', '국토부 실거래가', '건축물정보', '인근역세권', '행정기관', '교육환경', 'QR코드',
];

// 표의 '비고' 칸이 여러 줄이면 PDF는 그 줄들을 행 기준선 위·아래로 나눠 그린다.
// 그래서 "갑(5) 2021-06-15 …" 같은 기준선 줄 바로 앞에 그 행의 비고 첫 줄들이 먼저 나온다.
//   매매                    ← 갑(5)의 비고
//   갑(5) 2021-06-15 소유권이전 문명욱
//   거래가액:159,000,000원   ← 갑(5)의 비고
// 아래 목록은 "비고 칸의 첫 줄"로만 등장하는 값들 — 기준선 줄 앞에 붙어 있으면 다음 행 몫으로 넘긴다.
const REGISTRY_LEAD_NOTE_RE = /^(?:매매|청구금액|범위\s*:|말소기준등기|\d{4}카[임단]\d+|증여|상속|신탁|소멸|주의)/;

const sliceRegistrySection = (text: string) => {
  const startIdx = text.indexOf('건물등기');
  const from = startIdx >= 0 ? startIdx + '건물등기'.length : 0;
  const tail = text.slice(from);
  let end = tail.length;
  REGISTRY_SECTION_END_MARKERS.forEach((marker) => {
    const i = tail.indexOf(marker);
    if (i >= 0 && i < end) end = i;
  });
  return tail.slice(0, end);
};

const parseRegistryRows = (text: string) => {
  const section = sliceRegistrySection(text);
  const rows: Array<{ date: string; order: string; kind: string; holder: string; amount: string; desc: string; extinct: string }> = [];

  const anchorRe = /^(갑|을)\((\d+)\)\s+(\d{4}[-./]\d{2}[-./]\d{2})\s*(.*)$/;
  const lines = section
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) =>
      line &&
      !line.startsWith('https://') &&
      !line.startsWith('경매:') &&
      !/^\d{2}\.\s/.test(line) &&
      !/^(순서|접수일|권리종류|권리자|채권금액|비고|소멸)$/.test(line) &&
      !/^\(접수번호\)/.test(line) &&
      !/^이전소유권내용/.test(line));

  type Block = { order: string; date: string; body: string[] };
  const blocks: Block[] = [];
  let pending: string[] = [];

  lines.forEach((line) => {
    const m = line.match(anchorRe);
    if (!m) {
      pending.push(line);
      return;
    }
    // 기준선 줄 바로 앞에 붙은 "비고 첫 줄"들을 이 행 몫으로 떼어 온다.
    const carried: string[] = [];
    while (pending.length > 0 && REGISTRY_LEAD_NOTE_RE.test(pending[pending.length - 1])) {
      carried.unshift(pending.pop() as string);
    }
    if (blocks.length > 0) blocks[blocks.length - 1].body.push(...pending);
    pending = [];
    blocks.push({ order: `${m[1]}(${m[2]})`, date: m[3].replace(/[./]/g, '-'), body: [m[4], ...carried].filter(Boolean) });
  });
  if (blocks.length > 0) blocks[blocks.length - 1].body.push(...pending);

  for (const block of blocks) {
    let rest = block.body.join(' ').replace(/\s+/g, ' ').trim();

    let kind = '';
    for (const k of REGISTRY_KINDS) {
      if (rest.startsWith(k)) {
        kind = k;
        rest = rest.slice(k.length).trim();
        break;
      }
    }
    if (!kind) continue;

    // "군포시(경기도)" / "서구(인천광역시)" 처럼 괄호가 붙는 관공서 이름까지 권리자로 본다.
    const holderMatch = rest.match(/^([가-힣]{2,}(?:공사|법인|회사|은행|조합)?(?:\([가-힣\s]+\))?(?:\s+외\s*\d+)?)/);
    let holder = '';
    if (holderMatch) {
      holder = holderMatch[1].trim();
      rest = rest.slice(holderMatch[0].length).trim();
    }

    let amount = '';
    const claimMatch = rest.match(/청구금액\s*([\d,]+)/);
    if (claimMatch) {
      amount = `청구:${claimMatch[1]}`;
      rest = rest.replace(claimMatch[0], ' ').trim();
    } else if (!/^(거래가액|매매|범위)/.test(rest)) {
      const a = rest.match(/^([\d,]+)(?=\s|$)/);
      if (a) {
        amount = a[1];
        rest = rest.slice(a[0].length).trim();
      }
    }

    // '소멸'·'주의'는 별도 칸(배지)이라 비고 본문 어디에나 섞여 들어온다 — 떼어내 상태로만 쓴다.
    const extinct = /(^|\s)소멸(\s|$)/.test(rest) ? '소멸' : '';
    rest = rest.replace(/(^|\s)(소멸|주의)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

    rows.push({
      date: block.date,
      order: block.order,
      kind,
      holder,
      amount,
      desc: rest,
      extinct,
    });
  }
  return rows;
};

const parseRegistryWarnings = (text: string): string => {
  // 구 양식 '주의사항' → 최신 양식 '참고/주의'
  const section =
    sliceSection(text, '참고/주의', ['권리분석요약', '주요변동', '관련사건', '매각사례']) ||
    sliceSection(text, '주의사항', ['권리분석요약', '주요변동', '관련사건', '매각사례']);
  // 최신 양식에만 있는 '권리분석요약'의 결론 한 줄을 덧붙인다.
  const summaryLine = firstMatch(text, [/권리분석요약\s*\n\s*(물건검토[^\n]+)/]);
  return [section.replace(/^\s*▶/, '▶').trim(), summaryLine].filter(Boolean).join('\n');
};

const parseRelatedCaseRows = (text: string) => {
  const section = sliceSection(text, '관련사건', ['매각사례', '국토부 실거래가', '건축물정보']);
  if (!section) return [];
  const rows: Array<{ court: string; caseNumber: string; kind: string; result: string }> = [];
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('No') || line.includes('관련법원')) continue;
    const m = line.match(/^\d+\s+(\S*법원(?:\s+\S+지원)?)\s+(\d{4}\S+)\s+([가-힣\s]+?)(?:\s+([가-힣]+))?$/);
    if (m) rows.push({ court: m[1], caseNumber: m[2], kind: m[3].trim(), result: m[4] ?? '' });
  }
  return rows;
};

const parseTenantOtherNotes = (text: string): string => {
  const idx = text.indexOf('기타사항');
  if (idx < 0) return '';
  const after = sliceSection(text, '기타사항', ['건물등기', '주의사항', '참고/주의', '주요변동', '순서 접수일']);

  // 표의 '기타사항' 라벨은 칸 가운데에 그려져서, 항목 첫 줄들이 라벨보다 위에 찍힌다.
  // 라벨 바로 앞의 '*'로 시작하는 줄들을 거슬러 올라가며 되찾는다.
  const before = text.slice(0, idx).split('\n');
  const lead: string[] = [];
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const line = before[i].trim();
    if (line === '' && lead.length === 0) continue; // 라벨 줄 앞의 빈 조각
    if (!line.startsWith('*')) break;
    lead.unshift(line);
  }

  // 섹션이 페이지를 걸치면 머리글('https://…', '26. 4. 12. … 경매:2025타경…')이 끼어든다
  const body = [...lead, after.trim()]
    .join('\n')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t && !t.startsWith('https://') && !/^\d{2}\.\s*\d/.test(t) && !t.startsWith('경매:');
    });

  return body.join('\n').trim();
};

const parseTenantTotalDeposit = (text: string): string => {
  const m = text.match(/임차보증금합계\s*:\s*([\d,]+원?)/);
  return m?.[1] ?? '';
};

const parseBuildingHeader = (text: string) => {
  const empty = {
    locationDetail: '', households: '', landAreaTotal: '', buildingCoverage: '',
    permitDate: '', buildingAreaTotal: '', floorAreaRatio: '', startDate: '',
    totalFloorArea: '', mainUse: '', approvalDate: '', parking: '', floors: '',
    elevator: '', exclusiveFloorRows: [] as Array<{ floor: string; area: string; structure: string; mainUse: string; otherUse: string }>,
    unitLocation: '', unitExclusiveArea: '', unitCommonArea: '',
    unitFloor: '', unitStructure: '', unitTotalParking: '', unitHouseholds: '',
    commonUse: '',
  };
  const section = sliceSection(text, '건축물정보', ['인근역세권', '행정기관', '교육환경', '주변환경', '도시철도']);
  if (!section) return empty;

  const get = (re: RegExp) => section.match(re)?.[1]?.trim() ?? '';

  // 표제부 (총괄): 대지위치/대지면적/건축면적/연면적 등 단지 단위 정보
  const locationDetail = get(/대지위치\s+([^\n]+?)(?=\s*가구|$)/);
  const households = get(/가구\/세대\/호\s+([\d\s\/]+)/);
  const landAreaTotal = get(/대지면적\s+([\d.]+㎡\s*\([\d.]+평\))/);
  const buildingCoverage = get(/건폐율\s+([\d.]+%)/);
  const permitDate = get(/허가일자\s+(\d{4}-\d{2}-\d{2})/);
  const buildingAreaTotal = get(/건축면적\s+([\d.]+㎡\s*\([\d.]+평\))/);
  const floorAreaRatio = get(/용적률\s+([\d.]+%)/);
  const startDate = get(/착공일자\s+(\d{4}-\d{2}-\d{2})/);
  const totalFloorArea = get(/연면적\s+([\d.]+㎡\s*\([\d.]+평\))/);
  const mainUse = get(/주용도\s+([^\n]+?)(?=\s*(?:사용승인|승강기|층수|구조|총\s*주차|$))/);
  const approvalDate = get(/사용승인일자\s+(\d{4}-\d{2}-\d{2})/);
  const parking = get(/주차\s+([^\n]+?)(?=\s*층수|$)/);
  const floors = get(/층수\(지하\/지상\)\s+([\d층\s\/]+)/);
  const elevator = get(/승강기\(비상\/승용\)\s+([\d대\s\/]+)/);

  // 전유부: 소재지/전용면적/공용면적/층/구조/총 주차수 — 표제부와 별도로 표시되는 호별 정보
  // PDFjs가 줄을 flatten해서 모든 데이터가 한 줄에 섞이므로 줄 시작 anchor를 쓰지 않고,
  // 컨텍스트(앞·뒤 라벨)를 lookbehind/lookahead 대신 명시적 패턴 매칭으로 좁힌다.
  const unitLocation = get(/소재지\s+(.+?)(?=\s*총\s*가구|$)/);
  const unitExclusiveArea = get(/전용면적\s+([\d.]+㎡\s*\([\d.]+평\))/);
  const unitCommonArea = get(/공용면적\s+([\d.]+㎡\s*\([\d.]+평\))/);
  // "층 지상 2층" 또는 "층 지하 1층" 패턴: 줄 시작 anchor 제거 ("층수"는 매칭 안 됨 — 그건 \s가 아닌 "수"가 옴)
  const unitFloor = get(/(?<![수가-힣])층\s+(지상\s*\d+층|지하\s*\d+층|\d+층)/);
  // 구조: "철근콘크리트구조" / "벽돌구조" / "연와구조" 등 한글로 끝나는 구체 명칭
  const unitStructure = section.match(/(?:^|[^가-힣])구조\s+([가-힣]+구조)(?=\s|$)/)?.[1]?.trim() ?? '';
  const unitTotalParking = get(/총\s*주차수\s+(\d+대)/);
  const unitHouseholds = get(/총\s*가구\/세대\/호\s+([\d\s\/]+?)(?=\s*전용면적|\s*층|$)/);
  // "주건축물 공용 각층 철근콘크리트구조 계단실 5.40㎡ (1.63평)" → "계단실"
  const commonUse = get(/주건축물\s+공용\s+\S+\s+\S*구조\s+(\S+)\s+[\d.]+㎡/);

  const exclusiveFloorRows: Array<{ floor: string; area: string; structure: string; mainUse: string; otherUse: string }> = [];
  const floorTableMatch = section.match(/층\s+면적\s+구조\s+주용도\s+기타용도([\s\S]+)/);
  if (floorTableMatch) {
    const rows = floorTableMatch[1].split('\n').map((l) => l.trim()).filter(Boolean);
    for (const r of rows) {
      const m = r.match(/^(\S+층)\s+([\d.]+㎡\s*\([\d.]+평\))\s+(\S+구조)\s+(\S+)\s+(.+)$/);
      if (m) exclusiveFloorRows.push({ floor: m[1], area: m[2], structure: m[3], mainUse: m[4], otherUse: m[5].trim() });
    }
  }

  return {
    locationDetail, households, landAreaTotal, buildingCoverage,
    permitDate, buildingAreaTotal, floorAreaRatio, startDate,
    totalFloorArea, mainUse, approvalDate, parking, floors, elevator,
    exclusiveFloorRows,
    unitLocation, unitExclusiveArea, unitCommonArea,
    unitFloor, unitStructure, unitTotalParking, unitHouseholds,
    commonUse,
  };
};

export const parseAuctionPdfText = (
  text: string,
  sourceName: string,
  sourceUrl?: string,
  sourceFolderUrl?: string,
  sourceFileId?: string,
): ParsedPdfAuction => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  const caseNumber =
    sourceName.match(FILE_NAME_CASE_REGEX)?.[1] ??
    firstMatch(text, [/경매\s*(\d{4}타경\d+)/, /사건번호\s*(\d{4}타경\d+)/]);

  const address = pickPrimaryAddress(lines) || sourceName.replace(/\.pdf$/i, '');
  const roadAddress = firstMatch(text, [/\(도로명주소:([^)]+)\)/, /도로명주소:\s*([^\n]+)/]);
  const landAreaM2 = toNumber(firstMatch(text, [/대지권\s+([\d.]+)㎡/, /대지권\s*:\s*([\d.]+)㎡/]));
  const landAreaPyeong =
    toNumber(firstMatch(text, [/대지권\s+[\d.]+㎡\(([\d.]+)평\)/])) || (landAreaM2 > 0 ? toPyeong(landAreaM2) : 0);
  const buildingAreaM2 = toNumber(
    firstMatch(text, [/건물면적\s+([\d.]+)㎡/, /전용면적\s+([\d.]+)㎡/, /주건축물\s+전유\s+\S+\s+\S+\s+\S+\s+([\d.]+)㎡/]),
  );
  const buildingAreaPyeong =
    toNumber(firstMatch(text, [/건물면적\s+[\d.]+㎡\(([\d.]+)평\)/, /전용면적\s+[\d.]+㎡\s*\(([\d.]+)평\)/])) ||
    (buildingAreaM2 > 0 ? toPyeong(buildingAreaM2) : 0);
  const commonAreaM2 = toNumber(firstMatch(text, [/공용면적\s+([\d.]+)㎡/, /공용면적\s*:\s*([\d.]+)㎡/]));
  const commonAreaPyeong =
    toNumber(firstMatch(text, [/공용면적\s+[\d.]+㎡\s*\(([\d.]+)평\)/])) ||
    (commonAreaM2 > 0 ? toPyeong(commonAreaM2) : 0);
  const structureType = firstMatch(text, [/구조\s+([^\n]+?구조)/, /구조\s*:\s*([^\n]+?구조)/]);
  // "감정원 : 도솔 / 가격시점 : 2026-03-11" — 최신 양식은 라벨 뒤에 콜론이 붙고 '/'로 항목이 이어진다.
  const appraisalCompany = firstMatch(text, [
    /감정원\s*:?\s*([^\n/]+?)\s*\/\s*가격시점/,
    /감정원\s*:?\s*([^\n\t]+?)\s+(?:감정|가격시점)/,
    /감정원\s*:?\s*([^\n\t]+)/,
  ]);
  const priceDate = toIsoDate(firstMatch(text, [/가격시점\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/, /가격시점\s+(\d{4}[.\-]\d{2}[.\-]\d{2})/]));
  const preservationDate = toIsoDate(firstMatch(text, [/보존등기일\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/, /보존등기일\s+(\d{4}[.\-]\d{2}[.\-]\d{2})/]));
  const caseStartDate = toIsoDate(
    firstMatch(text, [/개시결정일?\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/]),
  );
  // 표기가 제각각이다 — '말소기준일', '말소기준권리', 그냥 '말소기준' 모두 받는다.
  // 단 '말소기준일(소액)'은 소액기준이라 제외한다.
  const cancellationBaseDate = toIsoDate(
    firstMatch(text, [
      /말소기준권리(?:일자?)?\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/,
      /말소기준일(?!\(소액\))\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/,
      /말소기준일\s+(\d{4}[.\-]\d{2}[.\-]\d{2})/,
      /말소기준(?!일?\s*\(소액\))\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/,
    ]),
  );
  const distributionRequestDate = toIsoDate(
    firstMatch(text, [/배당요구종기일?\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/, /배당요구종기\s+(\d{4}[.\-]\d{2}[.\-]\d{2})/]),
  );
  const smallAmountBaseDate = toIsoDate(
    firstMatch(text, [/소액기준일\s*:?\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/, /말소기준일\(소액\)\s*:\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/]),
  );
  const auctionHistoryMatches = [
    ...text.matchAll(
      /(신건|\d+차)\s+(\d{4}[.\-]\d{2}[.\-]\d{2})\s+(?:\([\d.]+%\)\s*)?([\d,]{5,})(?:\s*원)?(?:\s*(유찰|매각|낙찰|변경|취하|기각|정지|배당|예정|진행|취소|각하|연기|불허|재매각|허가|납부))?/g,
    ),
  ];
  const auctionHistory: AuctionHistoryRow[] = auctionHistoryMatches.map((match) => ({
    round: match[1],
    date: toIsoDate(match[2]) || match[2],
    minPrice: toNumber(match[3]),
    result: match[4] ?? '',
  }));
  const eventDate = toIsoDate(
    firstMatch(text, [/매각일자\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/, /매각기일\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/]),
    today,
  );
  // PDF에 따라 '감정가'/'최저가' 라벨과 금액이 다른 줄로 떨어져 추출된다.
  // 그럴 땐 기일내역 표에서 값을 가져온다 — 1차 최저매각가격이 곧 감정가다.
  const currentRound = pickCurrentRound(auctionHistory, eventDate);
  const appraisalValue =
    firstMoney(text, [/감정가\s+([\d,]+)(?:원)?(?:\s|\*)/, /감정가\s+[^\n]*?\s([\d,]+)원/]) ||
    auctionHistory[0]?.minPrice ||
    0;
  const minimumBidValue =
    firstMoney(text, [/최저가\s+\([\d.]+%\)\s*([\d,]+)(?:원)?/, /최저매각가격\s+([\d,]+)/]) ||
    currentRound?.minPrice ||
    0;
  const minimumBidRate =
    toNumber(firstMatch(text, [/최저가\s+\(([\d.]+)%\)/])) ||
    (appraisalValue > 0 && minimumBidValue > 0 ? Math.round((minimumBidValue / appraisalValue) * 100) : 0);
  // 보증금은 이번 회차 최저매각가의 10%가 원칙 — PDF 표기가 안 잡히면 계산해서 채운다
  const depositValue =
    firstMoney(text, [/보증금\s+\([\d.]+%\)\s*([\d,]+)(?:원)?/]) ||
    (minimumBidValue > 0 ? Math.round(minimumBidValue * 0.1) : 0);
  const officialPriceValue = firstMoney(text, [/공동주택공시가격[^:]*:\s*([\d,]+)원/, /공시가격[^\n]*:\s*([\d,]+)원/]);
  const ownerName = firstMatch(text, [/소유자\s+([^\n\t]+?)\s+감정가/, /소유자\s+([^\n\t]+)/]);
  const debtorName = firstMatch(text, [/채무자\s+([^\n\t]+?)\s+최저가/, /채무자\s+([^\n\t]+)/]);
  const creditorName = firstMatch(text, [/채권자\s+([^\n\t]+?)\s+보증금/, /채권자\s+([^\n\t]+)/]);
  const auctionKind = text.includes('(강제경매)') ? '강제' : '임의';
  const approvalDate = toIsoDate(
    firstMatch(text, [/사용승인일[:자]*\s*:?\s*(\d{4}-\d{2}-\d{2})/, /사용승인일자\s+(\d{4}-\d{2}-\d{2})/]),
  );
  // 최신 양식은 '말소기준일(소액)' 표기를 쓰지 않는다 — 임차인 현황의 말소기준일로 폴백.
  const rightsBaseDate =
    toIsoDate(firstMatch(text, [/말소기준일\(소액\)\s*:\s*(\d{4}-\d{2}-\d{2})/])) || cancellationBaseDate;
  const rightsClaimAmount = firstMoney(text, [/채권합계금액:([\d,]+)원/]);
  const delinquentChargesValue = firstMoney(text, [/체납금액\s+([\d,]+)/]);
  const delinquentCharges = delinquentChargesValue > 0 ? `${delinquentChargesValue.toLocaleString('ko-KR')}원` : '';
  const surveyStatus = text.includes('===== 조사된 임차내역 없음 =====')
    ? '조사된 임차내역 없음'
    : text.includes('상세한 점유 및 임대차관계는 알 수 없')
      ? '점유자관계미상'
      : '점유자관계미상';

  const tenantInfoRows = parseTenantInfoRows(text);

  const occupancySection = sliceSection(text, '점유', ['경매 ', '순서 접수일', '건물등기', '기타사항']);
  const rightsSection = sliceSection(text, '순서 접수일', ['No 관련법원', '관련사건', '매각사례', '국토부 실거래가']);
  // 구 양식 '주의사항' → 최신 양식 '참고/주의'. 물건 자체에 대한 주의는 '참고사항'에 따로 있다.
  const referenceNote = sliceSection(text, '참고사항', ['임차인 현황', '말소기준일', '점유']);
  const notesSection =
    sliceSection(text, '참고/주의', ['권리분석요약', '관련사건', '매각사례', '국토부 실거래가']) ||
    sliceSection(text, '주의사항', ['관련사건', '매각사례', '국토부 실거래가']) ||
    sliceSection(text, '기타사항', ['건물등기', '순서 접수일', 'No 관련법원']);

  // 임차인 표를 이미 행 단위로 읽었으므로 대표 임차인 정보는 거기서 가져온다.
  const primaryTenant = tenantInfoRows[0];
  const occupancyName =
    primaryTenant ? `${primaryTenant.name}${primaryTenant.subName}` :
    firstMatch(
      occupancySection,
      [/임차인\s+([^\s]+)\s+주거용/, /목록\s+\?\s+임차인[^\n]*\n\d+\s+([^\s]+)\s+주거용/s, /\d+\s+([^\s]+)\s+주거용/],
    );
  const moveInDate =
    toIsoDate(primaryTenant?.moveIn) ||
    toIsoDate(firstMatch(occupancySection, [/전입:(\d{4}-\d{2}-\d{2})/, /전입:(\d{4}\.\d{2}\.\d{2})/]));
  const fixedDate =
    toIsoDate(primaryTenant?.fixed) ||
    toIsoDate(firstMatch(occupancySection, [/확정:(\d{4}-\d{2}-\d{2})/, /확정:(\d{4}\.\d{2}\.\d{2})/]));
  const occupancyDeposit =
    toNumber(primaryTenant?.deposit) || firstMoney(occupancySection, [/보:([\d,]+)원/]);
  const occupancyStatus =
    text.includes('===== 조사된 임차내역 없음 =====') ||
    occupancySection.includes('조사된 임차내역 없음') ||
    tenantInfoRows.length === 0
      ? '점유X'
      : '점유O';
  const takeoverContent =
    tenantInfoRows.some((row) => row.opposition === '인수조건변경') ||
    /인수\s*조건\s*변경/.test(text) ||
    text.includes('인수조건')
      ? 'O'
      : 'X';
  const oppositionStatus =
    takeoverContent === 'O' ||
    tenantInfoRows.some((row) => row.opposition === '대항력O') ||
    occupancySection.includes('임차권등기')
      ? '대항력O'
      : '대항력X';

  const nearestStation = parseNearestStation(text);
  const { elementarySchools, middleSchools, highSchools } = parseSchoolGroups(text);
  const adminAgencies = parseAdminAgencies(text);
  const adminAgencyItems = parseAdminAgencyItems(text);
  const pdfNearbyEnv = parsePdfNearbyEnv(text);
  const aptComplexInfo = parseAptComplexInfo(text);
  const arrearsInfo = parseArrearsInfo(text);
  const locationSummary = parseLocationSummary(text);
  const realTradeMetrics = parseRealTradeRows(text);
  const saleCaseMetrics = parseSaleCaseMetrics(text);
  const saleClassification = parseSaleClassification(text);
  const progressNote = parseProgressNote(text);
  const registryRows = parseRegistryRows(text);
  const registryWarnings = parseRegistryWarnings(text);
  const relatedCaseRows = parseRelatedCaseRows(text);
  const tenantOtherNotes = parseTenantOtherNotes(text);
  const tenantTotalDeposit = parseTenantTotalDeposit(text);
  const buildingHeader = parseBuildingHeader(text);
  if (typeof console !== 'undefined') {
    console.log('[PDF parse] ' + sourceName + ' | ' + JSON.stringify({
      caseNumber,
      registryRowsCount: registryRows.length,
      relatedCaseRowsCount: relatedCaseRows.length,
      tenantInfoRowsCount: tenantInfoRows.length,
      hasBuildingHeader: !!buildingHeader.locationDetail,
      saleClassification: saleClassification.slice(0, 80),
      progressNote: progressNote.slice(0, 80),
      tenantTotalDeposit,
    }));
    if (registryRows.length === 0) {
      const sampleIdx = text.indexOf('갑(');
      const sample = text.slice(Math.max(0, sampleIdx - 30), sampleIdx + 300).replace(/\n/g, '\\n');
      console.log('[PDF parse] registry-sample idx=' + sampleIdx + ' | ' + sample);
    }
    if (tenantInfoRows.length === 0) {
      const idx = text.indexOf('점유');
      const sample = text.slice(Math.max(0, idx - 20), idx + 400).replace(/\n/g, '\\n');
      console.log('[PDF parse] tenant-sample idx=' + idx + ' | ' + sample);
    }
  }

  const occupancySummary = cleanSummary(
    tenantInfoRows.length > 0
      ? tenantInfoRows
          .map((row) =>
            [
              `${row.name}${row.subName}`.trim(),
              row.occupationPeriod,
              row.moveIn ? `전입 ${row.moveIn}` : '',
              row.fixed ? `확정 ${row.fixed}` : '',
              row.deposit ? `보 ${row.deposit}` : '',
              row.opposition,
              row.analysis,
            ]
              .filter(Boolean)
              .join(' / '),
          )
          .join(' | ')
      : [
          occupancyStatus === '점유O' && occupancyName ? `임차인 ${occupancyName}` : '',
          moveInDate ? `전입 ${moveInDate}` : '',
          fixedDate ? `확정 ${fixedDate}` : '',
          occupancyDeposit > 0 ? `보증금 ${occupancyDeposit.toLocaleString('ko-KR')}원` : '',
          cleanSummary(occupancySection, 220),
        ]
          .filter(Boolean)
          .join(' / '),
    320,
  );

  const rightsSummary = cleanSummary(
    [
      rightsBaseDate ? `말소기준일 ${rightsBaseDate}` : '',
      rightsClaimAmount > 0 ? `채권합계 ${rightsClaimAmount.toLocaleString('ko-KR')}원` : '',
      cleanSummary(rightsSection, 260),
    ]
      .filter(Boolean)
      .join(' / '),
    360,
  );

  const notes = cleanSummary(
    [
      roadAddress ? `도로명주소 ${roadAddress}` : '',
      creditorName ? `채권자 ${creditorName}` : '',
      nearestStation ? `인근역 ${nearestStation}` : '',
      cleanSummary(referenceNote, 300),
      cleanSummary(notesSection, 420),
    ]
      .filter(Boolean)
      .join(' / '),
    700,
  );

  // 관할법원 — 이름 / 담당 경매계 / 전화번호
  const court = (() => {
    const m = /([가-힣]+지방법원(?:\s*[가-힣]+지원)?)\s*(?:경매\s*)?(\d+)\s*계/.exec(text);
    const name = m?.[1]?.replace(/\s+/g, ' ').trim()
      ?? firstMatch(text, [/([가-힣]+지방법원(?:\s*[가-힣]+지원)?)/]);
    const dept = m ? `경매${m[2]}계` : '';
    const normalize = (raw: string) =>
      raw.replace(/\(/g, '').replace(/\)/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/-$/, '');
    const PHONE = /\(?0\d{1,2}\)?[-\s]?\d{3,4}[-\s]?\d{4}/;
    let phone = '';
    if (m) {
      const from = m.index + m[0].length;
      phone = PHONE.exec(text.slice(from, from + 200))?.[0] ?? '';
    }
    if (!phone) {
      phone = /(?:전화|☎|연락처)[^0-9]{0,10}(\(?0\d{1,2}\)?[-\s]?\d{3,4}[-\s]?\d{4})/.exec(text)?.[1] ?? '';
    }
    return { name, dept, phone: phone ? normalize(phone) : '' };
  })();

  return {
    sourceName,
    sourceUrl,
    sourceFolderUrl,
    sourceFileId,
    rawText: text,
    caseNumber,
    courtName: court.name,
    courtDept: court.dept,
    courtPhone: court.phone,
    address,
    roadAddress,
    propertyType: inferPropertyType(text),
    auctionKind,
    auctionRound: inferAuctionRound(minimumBidRate),
    eventDate,
    appraisalValue,
    minimumBidValue,
    minimumBidRate,
    depositValue,
    officialPriceValue,
    officialPriceBand: parseOfficialPriceBand(text),
    buildingAreaM2,
    buildingAreaPyeong,
    landAreaM2,
    landAreaPyeong,
    commonAreaM2,
    commonAreaPyeong,
    structureType,
    appraisalCompany,
    priceDate,
    preservationDate,
    caseStartDate,
    cancellationBaseDate,
    distributionRequestDate,
    smallAmountBaseDate,
    auctionHistory,
    approvalDate,
    ownerName,
    debtorName,
    creditorName,
    occupancyStatus,
    oppositionStatus,
    takeoverContent,
    surveyStatus,
    delinquentCharges,
    rightsBaseDate,
    rightsClaimAmount,
    occupancySummary,
    rightsSummary,
    notes,
    nearestStation,
    elementarySchools,
    middleSchools,
    highSchools,
    adminAgencies,
    adminAgencyItems,
    pdfNearbyEnv,
    aptComplexInfo,
    arrearsInfo,
    locationSummary,
    ...realTradeMetrics,
    ...saleCaseMetrics,
    saleClassification,
    progressNote,
    registryRows,
    registryWarnings,
    relatedCaseRows,
    tenantOtherNotes,
    tenantTotalDeposit,
    buildingHeader,
    tenantInfoRows,
  };
};

export const parsePdfBytes = async (
  bytes: Uint8Array,
  sourceName: string,
  sourceUrl?: string,
  sourceFolderUrl?: string,
  sourceFileId?: string,
) => {
  const text = await buildLineText(bytes);
  return parseAuctionPdfText(text, sourceName, sourceUrl, sourceFolderUrl, sourceFileId);
};

export const parsePdfFile = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parsePdfBytes(bytes, file.name);
};

export const parseDriveFolderUrl = (folderUrl: string) => {
  const match = folderUrl.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? '';
};

export const listDrivePdfFiles = async (folderUrl: string): Promise<DrivePdfDescriptor[]> => {
  const folderId = parseDriveFolderUrl(folderUrl.trim());
  if (!folderId) {
    throw new Error('유효한 Google Drive 폴더 링크를 입력해 주세요.');
  }

  const response = await fetch(apiPath(`/api-drive-folder?folderId=${encodeURIComponent(folderId)}`));
  if (!response.ok) {
    throw new Error(`Google Drive 폴더를 읽지 못했습니다. (${response.status})`);
  }

  const data = (await response.json()) as { files?: DrivePdfDescriptor[]; error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  if (!data.files || data.files.length === 0) {
    throw new Error('폴더 안에서 PDF 파일을 찾지 못했습니다.');
  }
  return data.files;
};

export const parseDrivePdfFile = async (file: DrivePdfDescriptor, folderUrl?: string) => {
  const downloadUrl = apiPath(`/api-drive-download?id=${encodeURIComponent(file.id)}`);

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`${file.name} 다운로드에 실패했습니다. (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return parsePdfBytes(bytes, file.name, file.downloadUrl, folderUrl, file.id);
};
