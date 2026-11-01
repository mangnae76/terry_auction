import { describe, expect, it } from 'vitest';
import { buildingNameFromRows } from './publicDataApi';
import { needsBuildingName } from './buildingNameFill';
import { shownAddressOf } from '../utils/addressName';

describe('건물명 저절로 채우기', () => {
  it('표제부에서 주거용 줄의 가장 많은 이름', () => {
    expect(buildingNameFromRows([
      { bldNm: '', mainPurpsCdNm: '근린생활시설' },
      { bldNm: 'DS리치빌', mainPurpsCdNm: '공동주택' },
      { bldNm: '부속창고', mainPurpsCdNm: '창고시설' },
    ])).toBe('DS리치빌');
    expect(buildingNameFromRows([{ bldNm: '' }])).toBe('');
  });
  it('주소에 이름이 없고 적은 이름도 없을 때만 찾는다', () => {
    expect(needsBuildingName({ address: '인천광역시 서구 검암동 597-4 2층 203호' })).toBe(true);
    expect(needsBuildingName({ address: '인천광역시 서구 검암동 597-4 엘리시움 2층 203호' })).toBe(false);
    expect(needsBuildingName({ address: '인천광역시 서구 검암동 597-4 2층 203호', basicSummary: { 'sum.buildingName': 'DS리치빌' } })).toBe(false);
    expect(needsBuildingName({ address: '인천광역시 서구 검암동 597-4 2층 203호', basicSummary: { 'sum.buildingNameAuto': 'none' } })).toBe(false);
  });
  it('보여 줄 주소 — 지번 뒤에 건물명', () => {
    expect(shownAddressOf({ address: '인천광역시 서구 검암동 597-4 2층 203호', basicSummary: { 'sum.buildingName': 'DS리치빌' } }))
      .toBe('인천광역시 서구 검암동 597-4 DS리치빌 2층 203호');
  });
});
