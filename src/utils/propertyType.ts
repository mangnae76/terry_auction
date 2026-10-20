// 물건 종류 — PDF 표기가 '다세대(빌라)', '도시형생활주택'처럼 제각각이라
// 패턴으로 한 가지로 모은다. 선정물건 목록의 동그란 배지와 마이페이지의
// 종류별 건수가 같은 기준을 쓴다.
//
// 도시형생활주택이 '주택'·'(다세대)'를 달고 오므로 먼저 검사한다.
const PROP_TYPES: Array<[RegExp, string, string]> = [
  [/아파트/, 'A', '아파트'],
  [/도시형|도생/, '도', '도시형'],
  [/다세대|빌라/, '다', '다세대'],
  [/근린|상가|점포/, '상', '상가'],
  [/연립/, '연', '연립'],
  [/오피스텔/, '오', '오피스텔'],
  [/단독|주택/, '단', '단독주택'],
];

/** 배지에 쓰는 한 글자 — 못 찾으면 첫 글자를 쓴다 */
export const propTypeMark = (raw?: string): string => {
  const t = raw ?? '';
  if (!t.trim()) return '';
  return PROP_TYPES.find(([re]) => re.test(t))?.[1] ?? t.trim()[0];
};

/** 세어 적을 때 쓰는 이름 — 못 찾으면 '기타' */
export const propTypeName = (raw?: string): string => {
  const t = (raw ?? '').trim();
  if (!t) return '기타';
  return PROP_TYPES.find(([re]) => re.test(t))?.[2] ?? '기타';
};
