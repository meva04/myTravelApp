// 장소 화면 머리. 화면 맨 위(상태 표시줄 뒤)까지 사진을 채우고 그 위에 이름과 주소를 얹는다.
// 사진이 여러 장이면 옆으로 밀어 넘긴다.
import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';

type Props = {
  images: string[];
  name: string;
  address?: string;
  /** 구글 사진이면 촬영자 표시 (구글 약관) */
  credit?: string;
  onOpenGoogle?: () => void;
  /** 사진을 누르면 (크게 보기) */
  onOpenImage?: (index: number) => void;
};

const HEIGHT = 300;

export function PlaceHero({ images, name, address, credit, onOpenGoogle, onOpenImage }: Props) {
  const { width } = useWindowDimensions();
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const [index, setIndex] = useState(0);
  const has = images.length > 0;

  return (
    <View style={[styles.hero, { height: HEIGHT + top }]} testID="place-hero">
      {has && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {images.map((uri, i) => (
            <Pressable key={`${uri}:${i}`} disabled={!onOpenImage} onPress={() => onOpenImage?.(i)} style={{ width, height: HEIGHT + top }}>
              <Image testID={`hero-image:${uri}`} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, has ? styles.shade : styles.plain]} />
      {onOpenGoogle && (
        <Pressable accessibilityRole="button" onPress={onOpenGoogle} hitSlop={8} style={[styles.google, { top: top + space.md }]}>
          <Text style={styles.googleText}>{t('hero.openGoogle')}</Text>
        </Pressable>
      )}
      <View style={styles.text} pointerEvents="none">
        <Text style={[styles.name, !has && { color: colors.ink }]}>{name}</Text>
        {address ? (
          <Text style={[styles.address, !has && { color: colors.inkSoft }]} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
        {credit ? <Text style={styles.credit}>{t('hero.photoBy', { name: credit })}</Text> : null}
      </View>
      {images.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {images.map((u, i) => (
            <View key={`${u}:${i}`} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: -space.lg, marginTop: -space.lg, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: colors.accentSoft },
  shade: { backgroundColor: 'rgba(0,0,0,0.3)' },
  plain: { backgroundColor: colors.accentSoft },
  text: { padding: space.lg, gap: 2 },
  name: { fontSize: fonts.size.xl, fontWeight: '700', color: '#fff' },
  address: { fontSize: fonts.size.xs, color: 'rgba(255,255,255,0.85)', marginTop: space.xs },
  credit: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: space.xs },
  google: {
    position: 'absolute',
    right: space.md,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  googleText: { fontSize: fonts.size.xs, fontWeight: '700', color: colors.ink },
  dots: { position: 'absolute', bottom: space.md, right: space.lg, flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { backgroundColor: '#fff' },
});
