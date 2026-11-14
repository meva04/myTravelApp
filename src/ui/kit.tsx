// 기본 부품. 색·간격은 모두 tokens 에서 가져온다.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { colors, fonts, radius, space } from '@/theme/tokens';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Txt({ children, kind = 'body', style }: { children: ReactNode; kind?: 'title' | 'heading' | 'body' | 'soft' | 'small'; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles[kind], style]}>{children}</Text>;
}

export function Button({ label, onPress, kind = 'primary', style }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.btn, styles[`btn_${kind}`], pressed && styles.pressed, style]}>
      <Text style={[styles.btnText, kind !== 'primary' && { color: kind === 'danger' ? colors.accent : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.inkSoft} {...props} style={[styles.field, props.style]} />;
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
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
  screenContent: { padding: space.lg, gap: space.md },
  title: { fontSize: fonts.size.xl, color: colors.ink, fontWeight: '700' },
  heading: { fontSize: fonts.size.lg, color: colors.ink, fontWeight: '600' },
  body: { fontSize: fonts.size.md, color: colors.ink },
  soft: { fontSize: fonts.size.sm, color: colors.inkSoft },
  small: { fontSize: fonts.size.xs, color: colors.ink },
  btn: { paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center' },
  btn_primary: { backgroundColor: colors.ink },
  btn_ghost: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  btn_danger: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.card },
  btnText: { color: colors.card, fontSize: fonts.size.md, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  field: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card, padding: space.md, fontSize: fonts.size.md, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.xs },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
