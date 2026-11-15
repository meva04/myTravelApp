// 임시 값. 시각 디자인 시안이 정해지면 이 파일만 교체한다.
export const colors = {
  paper: '#F6F1E7',
  card: '#FFFDF8',
  ink: '#2B2A28',
  inkSoft: '#7A746A',
  line: '#D9D0BF',
  accent: '#C8553D',
  accentSoft: '#F2D9D2',
  route: '#3F6C8F',
  ok: '#5B7F5A',
} as const;

/** 방문지 번호 색. 목록과 지도 핀이 같은 색을 쓴다. */
export const stopColors = ['#7A5BA6', '#3E9C8F', '#C8553D', '#D08C2E', '#3F6C8F', '#B0567E'] as const;
export const stopColor = (index: number): string => stopColors[index % stopColors.length];

export const fonts = {
  body: undefined as string | undefined, // 시스템 글꼴
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const tokens = { colors, fonts, space, radius };
