// 화면마다 'UPDATE : …' 을 제각각 찍지 않도록 한곳에서 만든다.
//
// 모양: UPDATE : 261006 PM 11:42
//   - 날짜는 연·월·일 두 자리씩 붙여 쓴다 (261006)
//   - 오전/오후를 AM·PM 으로 적고, 시각은 12시간제 두 자리
export const UPDATE_PREFIX = 'UPDATE : ';

const p2 = (n: number) => String(n).padStart(2, '0');

/** 'UPDATE : ' 를 뺀 알맹이만 */
export const updateStamp = (when: Date | number | string = new Date()): string => {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return '';
  const ymd = `${p2(d.getFullYear() % 100)}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  const hour24 = d.getHours();
  const half = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${ymd} ${half} ${p2(hour12)}:${p2(d.getMinutes())}`;
};

/** 머리말까지 붙인 완성형 — 값이 없으면 빈 문자열이라 v-if 로 그대로 쓸 수 있다 */
export const updateText = (when?: Date | number | string): string => {
  const stamp = updateStamp(when);
  return stamp ? `${UPDATE_PREFIX}${stamp}` : '';
};
