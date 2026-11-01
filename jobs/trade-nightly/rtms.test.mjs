// 새벽 적재가 화면과 같은 문서에 같은 모양으로 적는지 — 어긋나면 화면이 적재한 값을 못 읽는다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cacheKey as appCacheKey } from '../../src/services/marketCache';
import { PATHS, QuotaError, cacheKey, docId, fetchMonth, parseDocId, regionTable, typeLabelOf, ymdAgo } from './rtms.mjs';
import { REGION_GROUPS } from '../../src/services/regionCodes';

describe('지역 표', () => {
  it('regionCodes.ts 글자를 읽은 결과가 앱 REGION_GROUPS 와 같다', () => {
    const t = regionTable(readFileSync(new URL('../../src/services/regionCodes.ts', import.meta.url), 'utf8'));
    for (const g of REGION_GROUPS) expect(t[g.sido]).toEqual(g.districts.map((d) => d.lawdCode));
    expect(Object.keys(t)).toHaveLength(REGION_GROUPS.length);
  });
});

describe('화면과 같은 이름 · 주소', () => {
  it('문서 이름이 앱 cacheKey 와 같다', () => {
    for (const p of Object.values(PATHS)) {
      expect(cacheKey('28260', p, '202610')).toBe(appCacheKey('28260', p, '202610'));
    }
  });

  it('국토부 주소가 앱 기본값과 같다', () => {
    const src = readFileSync(new URL('../../src/services/publicDataApi.ts', import.meta.url), 'utf8');
    for (const p of Object.values(PATHS)) expect(src).toContain(`'${p}'`);
  });

  it('문서 이름을 지역 · 주소 · 달로 되읽는다', () => {
    expect(parseDocId(docId('28260', PATHS.villaRent, '202609'))).toEqual({ lawdCd5: '28260', path: PATHS.villaRent, ymd: '202609' });
    expect(parseDocId('28260_모름_202609')).toBeNull();
  });

  it('종류 이름 — 매매는 한글, 전월세는 주소 그대로 (앱 propertyTypeLabel 과 같게)', () => {
    expect(typeLabelOf(PATHS.villaTrade)).toBe('연립다세대');
    expect(typeLabelOf(PATHS.aptRent)).toBe(PATHS.aptRent);
  });

  it('한국 시각으로 달을 센다 — UTC 로는 아직 10월 31일이어도 한국은 11월', () => {
    const t = Date.UTC(2026, 9, 31, 16, 0); // 한국 11월 1일 01:00
    expect(ymdAgo(0, t)).toBe('202611');
    expect(ymdAgo(2, t)).toBe('202609');
    expect(ymdAgo(12, t)).toBe('202511');
  });
});

describe('한 달치 받기', () => {
  const page = (items, total) => ({ response: { header: { resultCode: '000' }, body: { items: { item: items }, totalCount: total } } });
  const fake = (pages) => async (url) => {
    const n = Number(new URL(url).searchParams.get('pageNo'));
    return new Response(JSON.stringify(pages[n - 1]));
  };

  it('쪽을 다 받아 이어 붙이고 종류 이름을 단다', async () => {
    const one = Array.from({ length: 1000 }, (_, i) => ({ dealAmount: String(i) }));
    const { result, calls } = await fetchMonth({
      path: PATHS.aptTrade, lawdCd5: '11200', ymd: '202610', serviceKey: 'k',
      fetchImpl: fake([page(one, 1001), page({ dealAmount: 'last' }, 1001)]),
    });
    expect(calls).toBe(2);
    expect(result.rows).toHaveLength(1001);
    expect(result.rows[1000]).toEqual({ dealAmount: 'last', __typeLabel: '아파트' });
    expect(result.typeLabel).toBe('아파트');
  });

  it('하루 한도 초과는 따로 알린다', async () => {
    const fetchImpl = async () => new Response('<returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg>');
    await expect(fetchMonth({ path: PATHS.aptTrade, lawdCd5: '11200', ymd: '202610', serviceKey: 'k', fetchImpl }))
      .rejects.toBeInstanceOf(QuotaError);
  });
});
