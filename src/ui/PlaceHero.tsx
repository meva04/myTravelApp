// 장소 화면 머리. 배경 사진 위에 이름과 주소를 얹는다.
// 사진이 여러 장이면 몇 초마다 디졸브로 넘긴다.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n/ko';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Props = {
  images: string[];
  name: string;
  address?: string;
  /** 구글 사진이면 촬영자 표시 (구글 약관) */
  credit?: string;
  onOpenGoogle?: () => void;
};

const SLIDE_MS = 4000;
const FADE_MS = 900;

export function PlaceHero({ images, name, address, credit, onOpenGoogle }: Props) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [images.length]);
  const uri = images.length ? images[index % images.length] : null;

  return (
    <View style={styles.hero} testID="place-hero">
      {uri && (
        <Image
          testID={`hero-image:${uri}`}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={{ duration: FADE_MS, effect: 'cross-dissolve' }}
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={[StyleSheet.absoluteFill, uri ? styles.shade : styles.plain]} />
      {onOpenGoogle && (
        <Pressable accessibilityRole="button" onPress={onOpenGoogle} hitSlop={8} style={styles.google}>
          <Text style={styles.googleText}>{t('hero.openGoogle')}</Text>
        </Pressable>
      )}
      <View style={styles.text}>
        <Text style={[styles.name, !uri && { color: colors.ink }]}>{name}</Text>
        {address ? <Text style={[styles.address, !uri && { color: colors.inkSoft }]} numberOfLines={2}>{address}</Text> : null}
        {credit ? <Text style={styles.credit}>{t('hero.photoBy', { name: credit })}</Text> : null}
      </View>
      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((u, i) => (
            <View key={`${u}:${i}`} style={[styles.dot, i === index % images.length && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 260, marginHorizontal: -space.lg, marginTop: -space.lg, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: colors.accentSoft },
  shade: { backgroundColor: 'rgba(0,0,0,0.35)' },
  plain: { backgroundColor: colors.accentSoft },
  text: { padding: space.lg, gap: 2 },
  name: { fontSize: fonts.size.xl, fontWeight: '700', color: '#fff' },
  address: { fontSize: fonts.size.xs, color: 'rgba(255,255,255,0.85)', marginTop: space.xs },
  credit: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: space.xs },
  google: {
    position: 'absolute',
    top: space.md,
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
