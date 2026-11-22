// 두 칸 토글. 칸을 누르거나, 고른 알약을 좌우로 밀어서 바꾼다.
// 미는 동안 알약이 손가락을 따라오고, 놓으면 가까운 칸(빠르게 튕기면 튕긴 쪽)에 붙는다.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, glow, gradients, radius, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';

const AnimatedText = Animated.createAnimatedComponent(Text);
const SPRING = { damping: 20, stiffness: 240 } as const;
const PAD = space.xs;

export type ToggleOption<T extends string> = { value: T; label: string; accessibilityLabel?: string };

export function SwipeToggle<T extends string>({ options, value, onChange, style }: { options: [ToggleOption<T>, ToggleOption<T>]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const index = value === options[1].value ? 1 : 0;
  // 한 칸의 폭 (알약이 움직이는 거리)
  const [cell, setCell] = useState(0);
  // 0 = 왼쪽 칸, 1 = 오른쪽 칸. 미는 동안에는 그 사이 값.
  const pos = useSharedValue(index);
  const from = useSharedValue(index);

  useEffect(() => {
    pos.set(withSpring(index, SPRING));
  }, [index, pos]);

  const choose = (i: number) => {
    pos.set(withSpring(i, SPRING));
    if (i !== index) onChange(options[i].value);
  };

  const pan = usePanGesture({
    // 세로로 움직이면 시트를 끄는 것이므로 양보하고, 가로로 조금 움직여야 잡는다
    activeOffsetX: [-8, 8],
    failOffsetY: [-12, 12],
    runOnJS: true,
    onActivate: () => {
      from.set(pos.get());
    },
    onUpdate: (e) => {
      if (cell <= 0) return;
      pos.set(Math.min(1, Math.max(0, from.get() + e.translationX / cell)));
    },
    onDeactivate: (e) => {
      if (cell <= 0) return;
      // 빠르게 튕기면 그 방향으로, 아니면 가까운 칸으로
      const flung = Math.abs(e.velocityX) > 400 ? (e.velocityX > 0 ? 1 : 0) : null;
      choose(flung ?? (pos.get() > 0.5 ? 1 : 0));
    },
  });

  const thumb = useAnimatedStyle(() => ({ width: cell, transform: [{ translateX: pos.value * cell }] }));
  const leftText = useAnimatedStyle(() => ({ color: interpolateColor(pos.value, [0, 1], [colors.card, colors.inkSoft]) }));
  const rightText = useAnimatedStyle(() => ({ color: interpolateColor(pos.value, [0, 1], [colors.inkSoft, colors.card]) }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.track, style]} accessibilityRole="tablist" onLayout={(e) => setCell((e.nativeEvent.layout.width - PAD * 2) / 2)}>
        {cell > 0 && <Animated.View pointerEvents="none" style={[styles.thumb, thumb]} />}
        {options.map((o, i) => (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected: i === index }}
            onPress={() => choose(i)}
            style={styles.cell}
          >
            <AnimatedText style={[styles.label, i === 0 ? leftText : rightText]}>{o.label}</AnimatedText>
          </Pressable>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: PAD, borderRadius: radius.pill, backgroundColor: colors.well },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: radius.pill, backgroundColor: colors.brand, experimental_backgroundImage: gradients.brand, ...glow },
  cell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: fonts.size.md, fontWeight: '600' },
});
