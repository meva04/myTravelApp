// 기본 부품. 색·간격은 모두 tokens 에서 가져온다.
import { useContext, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { colors, fonts, glow, gradients, radius, space } from '@/theme/tokens';
import { Backdrop } from '@/ui/Backdrop';
import { Text, TextInput } from '@/ui/Text';

/** 투명한 위 막대(뒤로 버튼 줄) 높이 */
const BAR = Platform.OS === 'ios' ? 44 : 56;

/**
 * 기본 화면. 그라데이션 바탕이 투명한 위 막대 뒤 상태 표시줄까지 이어지고, 내용은 막대 아래에서 시작한다.
 * underHeader: 사진처럼 막대 뒤까지 깔리는 화면이면 true (내리지 않는다).
 */
export function Screen({ children, scroll = true, underHeader = false }: { children: ReactNode; scroll?: boolean; underHeader?: boolean }) {
  const insets = useContext(SafeAreaInsetsContext);
  const top = underHeader ? 0 : (insets?.top ?? 0) + BAR;
  if (!scroll)
    return (
      <View style={[styles.screen, { paddingTop: top }]}>
        <Backdrop />
        {children}
      </View>
    );
  return (
    <View style={styles.screen}>
      <Backdrop />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.screenContent, { paddingTop: top + space.lg }]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function Txt({ children, kind = 'body', style }: { children: ReactNode; kind?: 'title' | 'heading' | 'body' | 'soft' | 'small'; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles[kind], style]}>{children}</Text>;
}

export function Button({ label, onPress, kind = 'primary', style }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.btn, styles[`btn_${kind}`], pressed && styles.pressed, style]}>
      <Text style={[styles.btnText, kind !== 'primary' && { color: kind === 'danger' ? colors.danger : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.inkSoft} {...props} style={[styles.field, props.style]} />;
}

/**
 * 카드. glass: 그라데이션 바탕 위의 반투명 흰 면 (기본).
 * well: 흰 면이나 다른 카드 안에 놓이는 회색 칸 (카드 안의 카드, 흰 시트 안의 카드).
 */
export function Card({ children, onPress, style, tone = 'glass' }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; tone?: 'glass' | 'well' }) {
  const look = tone === 'well' ? styles.cardWell : styles.card;
  if (!onPress) return <View style={[look, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [look, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.small, selected && { color: colors.card }]}>{label}</Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.row, style]}>{children}</View>;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  // 펼친 폴더블처럼 넓은 화면에서도 읽기 좋은 폭을 넘지 않게 가운데 둔다
  screenContent: { padding: space.lg, gap: space.md, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { fontSize: fonts.size.xl, color: colors.ink, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: fonts.size.lg, lineHeight: 26, color: colors.ink, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: fonts.size.md, color: colors.ink },
  soft: { fontSize: fonts.size.sm, color: colors.inkSoft },
  small: { fontSize: fonts.size.xs, color: colors.ink },
  btn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center' },
  btn_primary: { backgroundColor: colors.brand, experimental_backgroundImage: gradients.brand, ...glow },
  btn_ghost: { backgroundColor: colors.well },
  btn_danger: { backgroundColor: colors.card },
  btnText: { color: colors.card, fontSize: fonts.size.md, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  field: { borderRadius: radius.md, backgroundColor: colors.well, paddingVertical: space.md + 2, paddingHorizontal: space.lg, fontSize: fonts.size.md, color: colors.ink },
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  cardWell: { backgroundColor: colors.well, borderRadius: radius.md, padding: space.md, gap: space.xs },
  chip: { paddingVertical: space.sm + 1, paddingHorizontal: space.md + 2, borderRadius: radius.pill, backgroundColor: colors.well },
  chipOn: { backgroundColor: colors.brand, experimental_backgroundImage: gradients.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
