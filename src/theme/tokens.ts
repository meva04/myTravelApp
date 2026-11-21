// 처음 시안의 색: 따뜻한 종이색 바탕, 짙은 갈색빛 검정 글자, 장소마다 다른 번호 색.
export const colors = {
  paper: '#F6F1E7',
  card: '#FFFDF8',
  /** 흰 카드 안의 입력칸·보조 버튼 */
  well: '#EFE8DA',
  ink: '#2B2A28',
  inkSoft: '#7A746A',
  line: '#D9D0BF',
  accent: '#C8553D',
  accentSoft: '#F2D9D2',
  route: '#3F6C8F',
  ok: '#5B7F5A',
  /** 주 버튼·고른 날·고른 칩·고른 장소 카드 */
  brand: '#2B2A28',
  /** brand 면 위의 흐린 글자 */
  onBrandSoft: '#D9D0BF',
  brandSoft: '#F2D9D2',
  /** 되돌리기 어려운 동작(삭제) */
  danger: '#C8553D',
  onInkSoft: '#B5AC9C',
} as const;

/** 방문지 번호 색. 목록과 지도 핀이 같은 색을 쓴다. */
export const stopColors = ['#7A5BA6', '#3E9C8F', '#C8553D', '#D08C2E', '#3F6C8F', '#B0567E'] as const;
export const stopColor = (index: number): string => stopColors[index % stopColors.length];

export const fonts = {
  body: undefined as string | undefined, // 시스템 글꼴
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 22, pill: 999 } as const;

export const tokens = { colors, fonts, space, radius };
