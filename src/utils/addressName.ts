// 주소에 건물명이 빠진 물건이 있다 ('검암동 637-2 4층403호').
// 정보요약에 손으로 적어 둔 건물명을 '보여 줄 때만' 지번 뒤에 끼워 넣는다.
// 저장된 주소 자체는 건드리지 않는다 — 지역 해석과 국토부 실거래 조회가 그 값을 쓴다.
// 이 규칙을 쓰는 화면이 둘(물건상세·선정물건 목록)이라 한곳에 둔다.

/** 동·층·호를 가리키는 토막인가 — '101동', '2층203호', '지하1층', 'B01호' */
export const isUnitToken = (t: string) =>
  (/^제?\d/.test(t) && /[동층호]/.test(t)) || /^(지하|B\d)/i.test(t);

/** 번지(숫자 또는 '숫자-숫자')가 몇 번째 토막인가 — 없으면 -1 */
const lastLotIndex = (parts: string[]) => {
  let last = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) last = i; });
  return last;
};

/** 주소에 이미 건물명이 들어 있나.
 *  '101동' 처럼 동 번호만 있는 건 이름으로 치지 않는다 — 그런 물건이야말로 손으로 적어야 한다. */
export const hasBuildingName = (address: string): boolean => {
  const parts = String(address ?? '').split(/\s+/).filter(Boolean);
  const last = lastLotIndex(parts);
  if (last < 0) return false;
  for (let i = last + 1; i < parts.length; i += 1) {
    const t = parts[i];
    if (/^제?\d+동$/.test(t)) continue;
    if (isUnitToken(t)) break;
    return true;
  }
  return false;
};

/** 보여 줄 주소 — 주소에 건물명이 없을 때만 적어 둔 이름을 지번 바로 뒤에 끼운다 */
export const addressWithName = (address: string, name?: string | null): string => {
  const addr = String(address ?? '');
  const nm = String(name ?? '').trim();
  if (!nm || !addr || addr.includes(nm) || hasBuildingName(addr)) return addr;
  const parts = addr.split(/\s+/).filter(Boolean);
  const last = lastLotIndex(parts);
  if (last < 0) return `${addr} ${nm}`.trim();
  return [...parts.slice(0, last + 1), nm, ...parts.slice(last + 1)].join(' ');
};
