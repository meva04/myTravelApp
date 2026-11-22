// Lovi 스타일: 라벤더·페리윙클·연분홍 그라데이션 바탕, 흰 면, 인디고 하나로 강조.
export const colors = {
  /** 그라데이션 아래 깔리는 바탕 (그라데이션을 못 그릴 때도 이 색) */
  paper: '#F5F3FC',
  card: '#FFFFFF',
  /** 그라데이션 바탕 위의 카드: 바탕이 비치는 반투명 흰 면 */
  glass: 'rgba(255,255,255,0.4)',
  /** 흰 면 안의 입력칸·보조 버튼·목록 카드 */
  well: '#F4F3F8',
  ink: '#1C1B29',
  inkSoft: '#8E8AA3',
  line: '#E6E3EF',
  accent: '#E5689B',
  accentSoft: '#FBE4EE',
  route: '#6E6AF0',
  ok: '#3FAE8C',
  /** 주 버튼·고른 날·고른 칩·고른 장소 카드 */
  brand: '#6E6AF0',
  /** brand 면 위의 흐린 글자 */
  onBrandSoft: '#D9D7FB',
  brandSoft: '#ECEBFD',
  /** 되돌리기 어려운 동작(삭제) */
  danger: '#E5566F',
  onInkSoft: '#B9B5CC',
} as const;

/** 그라데이션 (React Native 내장 CSS 그라데이션, experimental_backgroundImage 에 넣는다) */
export const gradients = {
  /** 화면 바탕: 왼쪽 위에서 퍼지는 라벤더 → 페리윙클 → 연분홍 → 흰색 */
  backdrop: 'radial-gradient(130% 70% at 15% 0%, #C9B8F5 0%, #AFC0F7 38%, #F3E4F4 72%, #F5F3FC 100%)',
  /** 주 버튼·고른 카드 */
  brand: 'linear-gradient(90deg, #6E6AF0 0%, #8B7BEA 100%)',
} as const;

/** 떠 있는 흰 버튼 아래 보랏빛 그림자 */
export const glow = { shadowColor: '#6E6AF0', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } } as const;

/** 방문지 번호 색. 목록과 지도 핀이 같은 색을 쓴다. 지도 위에서도 보이게 파스텔보다 한 단계 진하게. */
export const stopColors = ['#7B6AE6', '#3FA9C0', '#E5689B', '#E8954A', '#5B7FE8', '#A86AD9'] as const;
export const stopColor = (index: number): string => stopColors[index % stopColors.length];

export const fonts = {
  body: undefined as string | undefined, // 시스템 글꼴
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 18, lg: 22, sheet: 28, pill: 999 } as const;

export const tokens = { colors, gradients, glow, fonts, space, radius };
