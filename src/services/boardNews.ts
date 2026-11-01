// 소식 — 이벤트·공지사항·업데이트와 약관 목록.
// 운영에서 내려주는 값으로 바꿀 자리이고, 지금은 손으로 적어 둔다.

export interface NewsRow {
  /** 운영에서 올린 글의 번호 — 배너의 '자세히 보기'가 이 줄을 찾아 연다 */
  id?: string;
  tag: string;
  text: string;
  /** 맨 위에 붙박이로 둘 줄 */
  star?: boolean;
  /** 눌러서 펼치면 보이는 글 (운영에서 올린 글만 들고 있다) */
  body?: string;
  /** 글에 딸린 그림 */
  imageUrl?: string;
  /** 올린 때 그대로 — 새 글인지 가린다 */
  postedAt?: string;
  /** 줄 오른쪽에 좁게 적는 날짜 — '26.10.20' */
  postedShort?: string;
  /** 펼쳤을 때 적는 날짜 — '등록 2026.10.20 · 수정 10.21' */
  postedFull?: string;
}

export const EVENTS: NewsRow[] = [
  { tag: '안내', text: '경매 PDF 자동 분석 정확도 개선 안내' },
  { tag: '안내', text: '국토부 실거래가 조회 기간 확대 (최대 12개월)' },
];

export interface NewsBanner {
  /** 운영에서 올린 배너의 글 번호 — '자세히 보기'가 이벤트 줄을 찾아 연다 */
  id?: string;
  badge: string;
  title: string;
  desc: string;
  cta: string;
  period: string;
  /** 운영에서 올린 배너만 그림을 들고 있다 */
  imageUrl?: string;
}

/** 이벤트 배너 — 여러 장이면 옆으로 넘겨 본다 */
export const EVENT_BANNERS: NewsBanner[] = [
  {
    badge: 'EVENT',
    title: '첫 낙찰 축하 리워드',
    desc: '마이턴에서 분석한 물건으로 낙찰받으면 분석 리포트 3개월 무료',
    cta: '자세히보기',
    period: '2026.10.01 ~ 10.31',
  },
];

/**
 * 기간 글의 끝날 — 'YYYY-MM-DD'. 못 읽거나 끝이 없으면('상시' · '… 부터') ''.
 * '2026.10.01 ~ 10.31'(끝에 해가 없으면 시작 해, 달이 앞서면 다음 해) · '2026.12.20 ~ 2027.01.10' · '2026.10.31 까지'
 */
export const periodEndDay = (period?: string): string => {
  const text = String(period ?? '');
  const pad = (n: string | number) => String(n).padStart(2, '0');
  const full = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/;
  const [head, tail] = text.includes('~') ? text.split('~', 2) : ['', /까지/.test(text) ? text : ''];
  if (!tail) return '';
  const f = tail.match(full);
  if (f) return `${f[1]}-${pad(f[2])}-${pad(f[3])}`;
  const s = head.match(full);
  const md = tail.match(/(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (!s || !md) return '';
  const year = Number(s[1]) + (Number(md[1]) < Number(s[2]) ? 1 : 0);
  return `${year}-${pad(md[1])}-${pad(md[2])}`;
};

/** 기간이 끝난 글인가 — 끝날 다음 날부터 내린다. now 는 'YYYY-MM-DD…' (현지 시각) */
export const periodEnded = (period: string | undefined, now: string): boolean => {
  const end = periodEndDay(period);
  return !!end && end < now.slice(0, 10);
};

export const NOTICES: NewsRow[] = [
  { tag: '', star: true, text: '서비스 이용약관 개정 안내 (시행 예정)' },
  { tag: '점검', text: '정기 서버 점검 안내 — 매월 첫째 주 새벽' },
  { tag: '안내', text: '국토부 실거래가 조회 일시 지연 안내' },
  { tag: '안내', text: '경매 PDF 자료 보관 기간 안내' },
];

export const UPDATES: NewsRow[] = [
  { tag: '신규', text: '세금관리 탭 추가 — 연도별 사업소득·종합소득세 집계' },
  { tag: '신규', text: '입찰 캘린더 추가 — 선정물건 입찰일을 달력으로' },
  { tag: '기능', text: '입찰가산정에 낙찰일·매도일 입력 추가' },
  { tag: '기능', text: '임장경로 동선최적화 목록 드래그 순서 변경' },
  { tag: '개선', text: '선정물건 목록 중요도 별표(1·2·3) 표시' },
  { tag: '개선', text: '숨긴 물건 선택 복원 기능' },
];

/** 약관 — 화면이 있는 것은 그 자리로, 아직 없는 것은 '준비 중' 안내 */
export const POLICIES: Array<{ name: string; path: string }> = [
  { name: '이용약관', path: '/terms' },
  { name: '개인정보처리방침', path: '/privacy' },
  { name: '위치기반서비스 이용약관', path: '' },
];
