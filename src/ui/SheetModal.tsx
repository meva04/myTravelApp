// 아래에서 올라오는 입력 창. 키보드가 올라와도 가리지 않도록 키보드 바로 위에 붙는다.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';

export function SheetModal({ title, subtitle, children, footer, onClose }: { title: string; subtitle?: string; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView style={styles.body} contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: colors.card, padding: space.lg, paddingBottom: space.xl, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' },
  title: { fontSize: fonts.size.lg, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: fonts.size.sm, color: colors.inkSoft, marginTop: -space.sm },
  body: { flexGrow: 0 },
});
