import { describe, it, expect } from 'vitest';
import { addressParts, buildingNameOf } from './addressName';

describe('주소 안 건물명 (BUG-0011)', () => {
  it('지번 뒤 건물명을 찾는다', () => {
    expect(buildingNameOf('인천광역시 서구 검암동 678-8 프리스틴 106동 4층402호')).toBe('프리스틴');
    expect(buildingNameOf('인천광역시 서구 검암동 679-2, 부경캐슬 3층 304호')).toBe('부경캐슬');
  });
  it('이름이 없으면 빈값', () => {
    expect(buildingNameOf('인천 서구 검암동 678-8, 106동 4층401호 (검암동,프리스틴)')).toBe('');
    expect(buildingNameOf('인천광역시 서구 검암동 637-2 4층403호')).toBe('');
  });
  it('손으로 적은 이름이 없어도 이름 · 호를 나눈다', () => {
    const p = addressParts('인천광역시 서구 검암동 678-8 프리스틴 106동 4층402호');
    expect(p.name).toBe('프리스틴');
    expect(`${p.mid}${p.unit}`).toContain('402호');
  });
});
