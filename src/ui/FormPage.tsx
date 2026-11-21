// 무엇인가를 새로 넣는 입력 페이지들(장소·교통·이동 메모)이 함께 쓰는 틀.
// 위: 뒤로 + 제목, 가운데: 각자의 입력, 아래: 키보드 위에 붙는 고정 버튼 하나.
import { useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { t } from '@/i18n/ko';
import { colors, fonts, space } from '@/theme/tokens';
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <View style={[styles.top, { paddingTop: top + space.xs }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.sm },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  backText: { fontSize: 26, lineHeight: 28, color: colors.ink, marginTop: -2 },
  title: { flex: 1, fontSize: fonts.size.lg, fontWeight: '700', color: colors.ink },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, gap: space.md },
  bodyFlat: { paddingTop: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
