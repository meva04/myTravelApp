// 왼쪽으로 밀면 오른쪽 끝에 삭제 버튼이 나오는 줄.
// 삭제 버튼은 카드 뒤에 깔려 있으므로, 밀지 않았을 때는 투명하게 둔다.
// (길게 눌러 끌 때 카드가 반투명해져도 뒤의 삭제 버튼이 비치지 않게)
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';

function DeleteAction({ translation, label, onPress }: { translation: SharedValue<number>; label: string; onPress: () => void }) {
  const style = useAnimatedStyle(() => ({ opacity: translation.value < -1 ? 1 : 0 }));
  return (
    <Animated.View style={[styles.deleteWrap, style]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${t('common.delete')}`} onPress={onPress} style={styles.delete}>
        <Text style={styles.deleteText}>{t('common.delete')}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function SwipeRow({ children, onDelete, label, enabled = true }: { children: ReactNode; onDelete: () => void; label: string; enabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={1.6}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, translation) => (
        <DeleteAction
          translation={translation}
          label={label}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
        />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  deleteWrap: { flexDirection: 'row' },
  delete: { width: 84, marginVertical: space.xs, marginLeft: space.sm, borderRadius: radius.lg, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: fonts.size.sm },
});
