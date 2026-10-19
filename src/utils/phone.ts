// 전화번호 꼴 — 숫자만 받아 하이픈을 끼워 준다.
// 적을 때와 보여 줄 때가 같은 규칙을 쓰도록 여기 한곳에 둔다.

/** 숫자만 남긴다 (맨 앞 + 는 살린다) */
export const phoneDigits = (raw: string): string => String(raw ?? '').replace(/[^\d]/g, '');

/**
 * '01012345678' → '010-1234-5678', '0212345678' → '02-1234-5678',
 * '15881234' → '1588-1234'. 아직 덜 적은 번호도 그때까지만 끼워 준다.
 */
export const formatPhone = (raw: string): string => {
  const d = phoneDigits(raw);
  if (!d) return '';
  // 대표번호 15xx·16xx·18xx — 8자리
  if (/^1[5678]\d\d/.test(d)) {
    return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}`;
  }
  // 서울 02 — 지역번호가 두 자리
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 6) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5, 9)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  // 그 밖 — 앞 세 자리가 지역번호·통신사
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
};
