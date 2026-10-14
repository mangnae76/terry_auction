// 주소 한 줄에서 필요한 열쇠를 모두 뽑아 낸다.
//
// 주소 하나에 자료 두 곳의 열쇠가 함께 들어 있다.
//   · 법정동코드 앞 5자리 → 국토부 실거래 (LAWD_CD)
//   · 법정동코드 10자리 + 지번 → 브이월드 PNU → 공동주택 공시가격
// 그래서 사람이 시도·시군구·읍면동을 따로 고르지 않아도, 주소만 적으면
// 실거래와 공시가격을 한 번에 집어 올 수 있다.
//
// 물건 상세(손품+현장)와 관리자 도구가 같이 쓴다 — 한쪽을 고치면 양쪽이 같이 좋아진다.
import { resolveRegionFromAddress, type ResolvedRegion } from './regionResolver';
import { fetchApartHousingPrice, type ApartPrice } from './vworldApi';

export interface AddressParts {
  /** 지번까지만 남긴 주소 — '인천광역시 서구 검암동 670-4' */
  head: string;
  /** 지번 — '670-4' (산번지는 '산 12-3') */
  lot: string;
  /** 호수 — '203' (주소 끝의 '203호'에서 숫자만) */
  ho: string;
  /** 건물 동 — '106' 또는 '가' (지번 뒤의 '106동'에서).
   *  한 지번에 동이 여럿이면 호수만으로는 못 가린다.
   *  읍면동과 헷갈리지 않게 지번 뒤에서만 찾는다. */
  buildingDong: string;
}

/** 주소에서 지번과 호수를 갈라 낸다. 동·호가 없는 주소도 그대로 받는다. */
export const parseAddressParts = (address: string | undefined | null): AddressParts => {
  const text = String(address ?? '').trim();
  if (!text) return { head: '', lot: '', ho: '', buildingDong: '' };
  const parts = text.split(/\s+/).filter(Boolean);
  // 지번처럼 생긴 마지막 토막까지가 주소다 — 그 뒤는 건물명·동·호수다
  let last = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) last = i; });
  const head = last >= 0 ? parts.slice(0, last + 1).join(' ') : text;
  let lot = last >= 0 ? parts[last] : '';
  // '산 12-3' 은 산번지다 — PNU 가 달라지므로 '산' 을 붙여 넘긴다
  if (last > 0 && /^산$/.test(parts[last - 1])) lot = `산 ${lot}`;
  const ho = (text.match(/(\d+)\s*호/) ?? [])[1] ?? '';
  // 동은 지번 뒤에서만 찾는다 — 앞에서 찾으면 '검암동' 이 걸린다
  let buildingDong = '';
  if (last >= 0) {
    for (const t of parts.slice(last + 1)) {
      const m = t.match(/^(\d{1,4}|[가-힣A-Za-z]{1,3})동$/);
      if (m) { buildingDong = m[1]; break; }
    }
  }
  return { head, lot, ho, buildingDong };
};

export interface PlaceLookup {
  parts: AddressParts;
  /** 카카오가 푼 지역 — 못 풀면 null */
  region: ResolvedRegion | null;
  /** 그 호실의 공시가격 — 공동주택이 아니거나 자료가 없으면 null */
  price: ApartPrice | null;
}

/**
 * 주소 한 줄 → 지역 + 지번·호수 + 공동주택 공시가격.
 * 공시가격은 1년에 한 번 나오는 값이라 호실 단위로 캐시된다 (브이월드 쪽에서 처리).
 */
export const lookupAddress = async (
  address: string | undefined | null,
  opts: { areaM2?: number; withPrice?: boolean } = {},
): Promise<PlaceLookup> => {
  const typed = parseAddressParts(address);
  const region = await resolveRegionFromAddress(address);
  // 카카오가 준 지번이 있으면 그쪽이 이긴다 — 도로명 주소를 쳐도,
  // 지번을 잘못 적었어도 바른 지번으로 선다
  const parts: AddressParts = region?.jibun
    ? { ...typed, lot: region.jibun }
    : typed;
  let price: ApartPrice | null = null;
  if ((opts.withPrice ?? true) && region?.bCode10 && parts.lot) {
    try {
      price = await fetchApartHousingPrice({
        bCode10: region.bCode10,
        lotText: parts.lot,
        ho: parts.ho,
        dong: parts.buildingDong,
        areaM2: opts.areaM2,
      });
    } catch {
      price = null;
    }
  }
  return { parts, region, price };
};

const PYEONG = 3.305785;

/** 공시가격 한 줄 설명 — '106동 402호 전용 49.74㎡ / 15.05평' 꼴.
 *  면적은 실거래가 표와 같이 제곱미터와 평을 같이 적는다. */
export const priceUnitText = (price: ApartPrice | null): string => {
  if (!price) return '';
  const area = price.areaM2 > 0
    ? `전용 ${price.areaM2}㎡ / ${(price.areaM2 / PYEONG).toFixed(2)}평`
    : '';
  const dong = price.dong ? `${price.dong.replace(/동$/, '')}동` : '';
  return [dong, price.ho ? `${price.ho}호` : '', area].filter(Boolean).join(' ');
};

/** 단지 이름을 짧게 — 보여 줄 때만 쓴다 (표의 '단지' 칸은 신고 원문 그대로).
 *   '프리스틴(105 106)'  → '프리스틴'
 *   '프리스틴105동106동'  → '프리스틴'
 *   '무궁화빌라D동'       → 그대로 (글자 동은 건물을 가리는 이름이다)
 *  끝에 붙은 '숫자동' 묶음과 숫자뿐인 괄호만 뗀다. 떼고 나서 이름이 없어지면
 *  (예: '101동') 원래 이름을 그대로 쓴다. */
export const shortPlaceName = (name: string | undefined | null): string => {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  const cut = raw
    .replace(/\(\s*[\d\s,·.\-]+\)\s*$/, '')
    .replace(/(?:[\s,·]*\d{1,4}(?:[.\-]\d{1,4})*동)+$/, '')
    .trim();
  return cut.length > 0 ? cut : raw;
};
