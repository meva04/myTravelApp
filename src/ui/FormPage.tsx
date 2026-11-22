// 무엇인가를 새로 넣는 입력 페이지들(장소·교통·이동 메모)이 함께 쓰는 틀.
// 위: 그라데이션 위에 뒤로 + 제목, 그 아래 흰 시트 안에 각자의 입력과 키보드 위에 붙는 고정 버튼 하나.
import { useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { t } from '@/i18n/ko';
import { colors, fonts, glow, radius, space } from '@/theme/tokens';
import { Backdrop } from '@/ui/Backdrop';
import { Text } from '@/ui/Text';

import { Button, Txt } from './kit';

type Props = {
  title: string;
  onBack: () => void;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  /** 버튼 바로 위에 보일 안내 (입력이 모자랄 때 등) */
  notice?: string;
  /** 본문이 스스로 스크롤하면 false (검색 결과 목록처럼) */
  scroll?: boolean;
};

export function FormPage({ title, onBack, children, submitLabel, onSubmit, notice, scroll = true }: Props) {
  const insets = useContext(SafeAreaInsetsContext);
  const top = insets?.top ?? 0;
  const bottom = insets?.bottom ?? 0;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
      <Backdrop />
      <View style={[styles.top, { paddingTop: top + space.xs }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.sheet}>
        {scroll ? (
          <ScrollView style={styles.fill} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.bodyFlat]}>{children}</View>
        )}
        <View style={[styles.footer, { paddingBottom: Math.max(bottom, space.md) }]}>
          {notice ? <Txt kind="soft">{notice}</Txt> : null}
          <Button label={submitLabel} onPress={onSubmit} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.lg },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, ...glow },
  // 흰 시트: 위 모서리를 크게 둥글게, 아래는 화면 끝까지
  sheet: { flex: 1, backgroundColor: colors.card, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' },
  backText: { fontSize: 26, lineHeight: 28, color: colors.ink, marginTop: -2 },
  title: { flex: 1, fontSize: fonts.size.lg + 2, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  body: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl, gap: space.md },
  bodyFlat: { paddingTop: space.lg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, backgroundColor: colors.card },
});
