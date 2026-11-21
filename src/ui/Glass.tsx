// 지도 위에 뜨는 면(일정 시트·떠 있는 버튼)을 반투명 유리로. 뒤의 지도가 흐리게 비친다.
// iOS 26 이상은 기본 Liquid Glass, 그보다 낮거나 안드로이드면 반투명 흰 면으로 대신한다.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const liquid = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

export function Glass({ style, children, pointerEvents }: { style?: StyleProp<ViewStyle>; children?: ReactNode; pointerEvents?: 'box-none' | 'auto' }) {
  if (liquid) {
    return (
      <GlassView style={style} glassEffectStyle="regular" pointerEvents={pointerEvents}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, styles.fallback]} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: 'rgba(255,255,255,0.86)' },
});
