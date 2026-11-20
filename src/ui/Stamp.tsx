import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts } from '@/theme/tokens';
import { Text } from '@/ui/Text';

import { formatTime } from './format';

/** 방문 스탬프: 도착 날짜와 시간이 들어간 소인. 처음 나타날 때 눌러 찍히는 느낌으로 등장한다. */
export function Stamp({ arrivedAt, size = 96 }: { arrivedAt: string; size?: number }) {
  const scale = useSharedValue(1.6);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 9, stiffness: 180 });
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: '-8deg' }, { scale: scale.value }] }));
  const d = new Date(arrivedAt);
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return (
    <Animated.View testID="stamp" style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={styles.small}>ARRIVED</Text>
      <Text style={styles.time}>{formatTime(arrivedAt)}</Text>
      <Text style={styles.small}>{date}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  time: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.accent },
  small: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 1 },
});
