// 장소의 얼굴: 종류 아이콘, 썸네일, 머리 사진. 일정 목록의 썸네일과 장소 화면의 머리 사진은 같은 규칙을 쓴다.
import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { thumbOf } from '@/domain/media';
import type { Photo, PlaceKind, Stop } from '@/domain/types';
import type { PlaceDetails } from '@/google/places';
import { useServices } from '@/state/ServicesContext';
import { colors, radius } from '@/theme/tokens';

export const KIND_SYMBOL: Record<PlaceKind, SFSymbol> = {
  food: 'fork.knife',
  cafe: 'cup.and.saucer.fill',
  bar: 'wineglass.fill',
  sight: 'camera.fill',
  museum: 'building.columns.fill',
  park: 'tree.fill',
  shop: 'bag.fill',
  lodging: 'bed.double.fill',
  airport: 'airplane',
  station: 'tram.fill',
  port: 'ferry.fill',
  other: 'mappin',
};
const KIND_TEXT: Record<PlaceKind, string> = {
  food: '식', cafe: '카', bar: '바', sight: '관', museum: '박', park: '공', shop: '쇼', lodging: '숙', airport: '공', station: '역', port: '항', other: '·',
};

export function KindIcon({ kind, size = 14, color = colors.ink }: { kind: PlaceKind | null | undefined; size?: number; color?: string }) {
  const k = kind ?? 'other';
  return (
    <SymbolView
      name={KIND_SYMBOL[k]}
      size={size}
      tintColor={color}
      accessibilityLabel={`kind:${k}`}
      fallback={<Text style={{ fontSize: size * 0.8, color }}>{KIND_TEXT[k]}</Text>}
    />
  );
}

/**
 * 머리 사진 규칙: 내가 대표로 지정한 사진 > 방문해서 찍은 사진 > 구글 대표 사진.
 * photos 는 이 장소의 사진들.
 */
export function heroImages(stop: Pick<Stop, 'arrivedAt'>, photos: Photo[], google: string[], resolve: (uri: string) => string): { images: string[]; google: boolean } {
  const covers = photos.filter((p) => p.cover);
  const mine = covers.length ? covers : stop.arrivedAt ? photos : [];
  // 동영상은 미리 만든 첫 장면 그림을 쓴다
  if (mine.length) return { images: mine.map((p) => resolve(thumbOf(p.uri))), google: false };
  return { images: google.slice(0, 1), google: true };
}

/** 구글 장소 정보 (주소·사진·종류). places 클라이언트가 잠깐 메모리에 둔다. */
export function usePlaceDetails(placeId: string | null | undefined, refreshKey = 0): { details?: PlaceDetails; state: 'loading' | 'ready' | 'offline' | 'error' | 'none' } {
  const { places } = useServices();
  const [out, setOut] = useState<{ id?: string | null; details?: PlaceDetails; state: 'loading' | 'ready' | 'offline' | 'error' | 'none' }>({ state: 'loading' });
  useEffect(() => {
    if (!placeId) return;
    let alive = true;
    places.details(placeId).then(
      (details) => alive && setOut({ id: placeId, details, state: 'ready' }),
      (e: Error) => alive && setOut({ id: placeId, state: e?.name === 'OfflineError' ? 'offline' : 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [placeId, places, refreshKey]);
  if (placeId === null) return { state: 'none' };
  return out.id === placeId ? out : { state: 'loading' };
}

/** 일정 목록의 장소 썸네일. 장소 화면 머리 사진과 같은 사진에 종류 아이콘을 얹는다. */
export function PlaceThumb({ stop, photos, resolvePhoto, size = 52 }: { stop: Stop; photos: Photo[]; resolvePhoto: (uri: string) => string; size?: number }) {
  const { details } = usePlaceDetails(stop.placeId);
  const { images } = heroImages(stop, photos, details?.photoUrls ?? [], resolvePhoto);
  const kind = stop.kind ?? details?.kind ?? null;
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      {images[0] ? (
        <Image testID={`thumb:${images[0]}`} source={{ uri: images[0] }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" accessibilityIgnoresInvertColors />
      ) : (
        <KindIcon kind={kind} size={size * 0.4} color={colors.inkSoft} />
      )}
      {images[0] && (
        <View style={styles.badge}>
          <KindIcon kind={kind} size={10} color={colors.ink} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 3, bottom: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
});
