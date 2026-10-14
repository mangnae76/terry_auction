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
}

/** 주소에서 지번과 호수를 갈라 낸다. 동·호가 없는 주소도 그대로 받는다. */
export const parseAddressParts = (address: string | undefined | null): AddressParts => {
  const text = String(address ?? '').trim();
  if (!text) return { head: '', lot: '', ho: '' };
  const parts = text.split(/\s+/).filter(Boolean);
  // 지번처럼 생긴 마지막 토막까지가 주소다 — 그 뒤는 건물명·동·호수다
  let last = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) last = i; });
  const head = last >= 0 ? parts.slice(0, last + 1).join(' ') : text;
  let lot = last >= 0 ? parts[last] : '';
  // '산 12-3' 은 산번지다 — PNU 가 달라지므로 '산' 을 붙여 넘긴다
  if (last > 0 && /^산$/.test(parts[last - 1])) lot = `산 ${lot}`;
  const ho = (text.match(/(\d+)\s*호/) ?? [])[1] ?? '';
  return { head, lot, ho };
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
  const parts = parseAddressParts(address);
  const region = await resolveRegionFromAddress(address);
  let price: ApartPrice | null = null;
  if ((opts.withPrice ?? true) && region?.bCode10 && parts.lot) {
    try {
      price = await fetchApartHousingPrice({
        bCode10: region.bCode10,
        lotText: parts.lot,
        ho: parts.ho,
        areaM2: opts.areaM2,
      });
    } catch {
      price = null;
    }
  }
  return { parts, region, price };
};

/** 공시가격 한 줄 설명 — '203호 전용 29.75㎡' 꼴 */
export const priceUnitText = (price: ApartPrice | null): string => {
  if (!price) return '';
  return [price.ho ? `${price.ho}호` : '', price.areaM2 > 0 ? `전용 ${price.areaM2}㎡` : '']
    .filter(Boolean).join(' ');
};
