// 물건상세 입지정보(인근역세권·교육환경·주변환경)의 셈 — 앱 물건상세(AuctionDetailPage)에 있던 코드를 그대로 옮겨 왔다.
// 앱 화면과 웹(web/)이 이 파일을 같이 쓴다.
import type { AuctionDetail } from '../types/auction';
import type { NearbyEnvironment, NearbyPlace } from './kakaoNearby';

type Pick2 = { name: string; distance: string };

export const parseSchools = (raw: string | undefined) => {
  if (!raw) return [] as string[];
  const stripped = raw.replace(/^[가-힣]+\s*:\s*/, '');
  return stripped
    .split(/,\s*|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
};
export const eduInfoOf = (a: AuctionDetail | null | undefined) => ({
  elementary: parseSchools(a?.marketDemand?.schoolInfoA),
  middle: parseSchools(a?.marketDemand?.schoolInfoB),
  high: parseSchools(a?.marketDemand?.schoolInfoC),
});

/** 카카오 지도 검색 결과 — 칸마다 4곳까지 */
export const nearbyDisplayOf = (env: NearbyEnvironment | null | undefined) => {
  if (!env) return [] as Array<{ label: string; total: number; items: NearbyPlace[] }>;
  return [
    { label: '버스정류장', total: env.busStop.length, items: env.busStop.slice(0, 4) },
    { label: '지하철', total: env.subway.length, items: env.subway.slice(0, 4) },
    { label: '종합병원', total: env.hospital.length, items: env.hospital.slice(0, 4) },
    { label: '의원', total: env.clinic.length, items: env.clinic.slice(0, 4) },
    { label: '약국', total: env.pharmacy.length, items: env.pharmacy.slice(0, 4) },
    { label: '대형마트', total: env.mart.length, items: env.mart.slice(0, 4) },
    { label: '편의점', total: env.convStore.length, items: env.convStore.slice(0, 4) },
    { label: '행정복지센터', total: env.publicCenter.length, items: env.publicCenter.slice(0, 4) },
    { label: '공원', total: env.park.length, items: env.park.slice(0, 4) },
    { label: '공인중개사', total: env.realtor.length, items: env.realtor.slice(0, 4) },
    { label: '학원', total: env.academy.length, items: env.academy.slice(0, 4) },
    { label: '어린이집', total: env.daycare.length, items: env.daycare.slice(0, 4) },
    { label: '초등학교', total: env.school.length, items: env.school.slice(0, 4) },
  ];
};

export const PDF_NEARBY_LABELS: Array<{ key: keyof NonNullable<AuctionDetail['pdfNearbyEnv']>; label: string }> = [
  { key: 'busStop', label: '버스정류장' },
  { key: 'subway', label: '지하철' },
  { key: 'hospital', label: '종합병원' },
  { key: 'clinic', label: '의원' },
  { key: 'pharmacy', label: '약국' },
  { key: 'mart', label: '대형마트' },
  { key: 'convStore', label: '편의점' },
  { key: 'publicCenter', label: '행정복지센터' },
  { key: 'park', label: '공원' },
  { key: 'realtor', label: '공인중개사' },
  { key: 'academy', label: '학원' },
  { key: 'daycare', label: '어린이집' },
];

export const pdfNearbyDisplayOf = (a: AuctionDetail | null | undefined) => {
  const env = a?.pdfNearbyEnv;
  if (!env) return [] as Array<{ label: string; total: number; items: Array<{ name: string; distance: string }> }>;
  return PDF_NEARBY_LABELS
    .filter((g) => env[g.key])
    .map((g) => ({
      label: g.label,
      total: env[g.key]!.total,
      items: env[g.key]!.items.slice(0, 4),
    }));
};

export const naverMapUrl = (name: string) => `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
// "이름(거리)" / "이름 (336m)" 같은 텍스트에서 거리 부분과 prefix를 제거해 검색용 이름만 추출
export const stripDistanceFromName = (raw: string) =>
  raw
    .replace(/\s*\([^()]*?(?:km|m)\)\s*$/i, '')
    .replace(/^[가-힣]+\s*:\s*/, '')
    .trim();

// === 입지조사 4개 항목 — 물건정보 탭의 입지 데이터에서 500m 이내 자동 집계 ===
export const NEARBY_RADIUS_M = 500;
export const parseDistanceMeters = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const m = raw.match(/([\d.]+)\s*(km|m)/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return m[2].toLowerCase() === 'km' ? v * 1000 : v;
};
// "이름(123m), 다른이름(1.2km)" 형식의 문자열에서 거리가 NEARBY_RADIUS_M 이하인 항목만 추출
export const filterDistancedString = (str: string | undefined): string[] => {
  if (!str) return [];
  return str
    .replace(/^[가-힣]+\s*:\s*/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => {
      const d = parseDistanceMeters(s);
      return d !== null && d <= NEARBY_RADIUS_M;
    });
};

// === 입지조사 카드 — 500m 이내 데이터 (구조화된 리스트, 물건정보 탭 포맷 그대로 출력) ===
export const eduInfoFiltered500mOf = (a: AuctionDetail | null | undefined) => ({
  elementary: filterDistancedString(a?.marketDemand?.schoolInfoA),
  middle: filterDistancedString(a?.marketDemand?.schoolInfoB),
  high: filterDistancedString(a?.marketDemand?.schoolInfoC),
});
// "수도권 인천2호선 검바위 (58m), 수도권 공항철도 검암 (946m)" → [{name, distance}]
export const parseStationList = (raw: string | undefined): Pick2[] => {
  if (!raw) return [];
  return raw
    .replace(/^[가-힣]+\s*:\s*/, '')
    .split(',')
    .map((chunk) => chunk.trim().match(/^(.*?)\s*\(\s*([\d.]+\s*(?:km|m))\s*\)$/i))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ name: m[1].trim(), distance: m[2].replace(/\s+/g, '') }));
};

export const withinRadius = (items: Pick2[]) =>
  items.filter((it) => {
    const d = parseDistanceMeters(it.distance);
    return d !== null && d <= NEARBY_RADIUS_M;
  });

export const stationItems500mOf = (a: AuctionDetail | null | undefined): Pick2[] => {
  // 최신 PDF에는 카테고리별 주변환경 표(pdfNearbyEnv)가 없고 '도시철도' 한 줄만 있다.
  // 물건정보 탭의 인근역세권이 쓰는 nearbyStation 문자열을 같은 소스로 사용한다.
  const fromTable = a?.pdfNearbyEnv?.subway?.items ?? [];
  const items = fromTable.length > 0 ? fromTable : parseStationList(a?.nearbyStation);
  // 버스정류장은 정류장 명칭이 인근 학교·단지명이라 "역세권" 카드와 어울리지 않아 지하철만 본다.
  return withinRadius(items);
};

// 주변환경 500m — PDF 카테고리 표가 있으면 그것, 없으면 카카오 지도 검색 결과로 채운다
export const pdfNearbyFiltered500mOf = (a: AuctionDetail | null | undefined, env: NearbyEnvironment | null | undefined) => {
  const pdf = a?.pdfNearbyEnv;
  const fromPdf = pdf
    ? PDF_NEARBY_LABELS
        .filter((g) => pdf[g.key])
        .map((g) => {
          const items = withinRadius(pdf[g.key]!.items ?? []);
          return { label: g.label, total: items.length, items };
        })
        .filter((g) => g.items.length > 0)
    : [];
  if (fromPdf.length > 0) return fromPdf;

  return nearbyDisplayOf(env)
    .map((g) => {
      const items = withinRadius(g.items);
      return { label: g.label, total: items.length, items };
    })
    .filter((g) => g.items.length > 0);
};
