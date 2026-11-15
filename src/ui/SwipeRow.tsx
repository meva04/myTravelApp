// 왼쪽으로 밀면 오른쪽 끝에 삭제 버튼이 나오는 줄.
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';

export function SwipeRow({ children, onDelete, label, enabled = true }: { children: ReactNode; onDelete: () => void; label: string; enabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={1.6}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${t('common.delete')}`}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
          style={styles.delete}
        >
          <Text style={styles.deleteText}>{t('common.delete')}</Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  delete: { width: 84, marginVertical: space.xs, marginLeft: space.sm, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: fonts.size.sm },
});
