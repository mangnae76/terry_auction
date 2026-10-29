// 시장분석 그래프 단추 아이콘 — 같은 뜻(금액 · 면적 · 연식 · 층수 · 계약연도)은 어느 탭에서나 같은 그림. 24×24 한 줄 path.
export const CHART_ICONS = {
  price: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.4 4.5 3.2-2 3-4.5 3-4.5-1.3-4.5-3',
  area: 'M4 20V4l16 16H4zM8 16h3M4 12h3M4 8h3',
  age: 'M4 21V9l8-5 8 5v12M9 21v-6h6v6M3 21h18',
  floor: 'M4 3h16v18H4zM4 9h16M4 15h16M10 3v18',
  year: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
} as const;
export type ChartIconKey = keyof typeof CHART_ICONS;
