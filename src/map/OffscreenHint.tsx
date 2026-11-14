import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Button } from '@/ui/kit';

/** 선택한 곳이 화면 밖에 있을 때: 방향 화살표와 "여기로 이동". 누르기 전에는 지도가 움직이지 않는다. */
export function OffscreenHint({ bearing, onGo }: { bearing: number; onGo: () => void }) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.box}>
        <Text style={[styles.arrow, { transform: [{ rotate: `${bearing}deg` }] }]}>↑</Text>
        <Button kind="ghost" label={t('map.goHere')} onPress={onGo} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: space.lg, left: 0, right: 0, alignItems: 'center' },
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingLeft: space.md, padding: space.xs },
  arrow: { fontSize: fonts.size.lg, color: colors.accent, fontWeight: '700' },
});
