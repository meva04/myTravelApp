import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Photo } from '@/domain/types';
import { t } from '@/i18n/ko';
import { nearbyPhotos, type LibraryPhoto } from '@/records/nearby';
import { useLoad, useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Button, Chip, Row, Txt } from '@/ui/kit';

type Props = {
  stopId: string;
  /** 그날 그 장소의 현지 하루에 찍은 사진들. 사진첩 접근을 거절하면 'denied'. */
  findPhotos: (date: string, lng: number) => Promise<LibraryPhoto[] | 'denied'>;
  /** 고른 사진을 앱 저장 공간에 보관한다. */
  importPhoto: (p: LibraryPhoto) => Promise<Omit<Photo, 'id' | 'stopId'>>;
  onDone: () => void;
};

type Found = { state: 'loading' | 'denied' } | { state: 'ready'; photos: LibraryPhoto[] };

const COLUMNS = 3;
const GAP = 2;

export function NearbyPhotosScreen({ stopId, findPhotos, importPhoto, onDone }: Props) {
  const { repo } = useServices();
  const { data } = useLoad(async () => {
    const stop = await repo.getStop(stopId);
    const day = stop && (await repo.getDay(stop.dayId));
    return stop && day ? { stop, day, archived: new Set((await repo.listPhotos(stopId)).map((p) => p.assetId).filter(Boolean)) } : null;
  }, [stopId]);
  const [found, setFound] = useState<Found>({ state: 'loading' });
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const date = data?.day.date;
  const lng = data?.stop.lng;

  useEffect(() => {
    if (!date || lng === undefined) return;
    let alive = true;
    findPhotos(date, lng).then(
      (r) => alive && setFound(r === 'denied' ? { state: 'denied' } : { state: 'ready', photos: r }),
      () => alive && setFound({ state: 'ready', photos: [] }),
    );
    return () => {
      alive = false;
    };
  }, [date, lng, findPhotos]);

  const all = useMemo(() => (found.state === 'ready' ? found.photos : []), [found]);
  const near = useMemo(() => (data ? nearbyPhotos(all, data.stop) : []), [all, data]);
  // 근처 사진이 하나도 없으면 처음부터 그날 전체를 보여준다.
  const listAll = showAll || (found.state === 'ready' && near.length === 0);
  const shown = listAll ? all : near;

  if (!data) return <View style={styles.fill} />;
  const { stop, archived } = data;

  const toggle = (p: LibraryPhoto) => {
    if (archived.has(p.assetId)) return;
    // 목록 칸은 다시 그려지지 않을 수 있으므로, 화면에 보이던 옛 선택이 아니라 최신 선택에서 바꾼다.
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(p.assetId)) next.delete(p.assetId);
      else next.add(p.assetId);
      return next;
    });
  };
  const save = async () => {
    if (picked.size === 0 || saving) return;
    setSaving(true);
    try {
      for (const p of all.filter((x) => picked.has(x.assetId))) {
        await repo.addPhoto({ ...(await importPhoto(p)), stopId });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <Txt kind="heading">{t('photos.title', { name: stop.name })}</Txt>
        {found.state === 'ready' && all.length > 0 && (
          <Row>
            <Chip label={t('photos.nearby', { n: near.length })} selected={!listAll} onPress={() => setShowAll(false)} />
            <Chip label={t('photos.allDay', { n: all.length })} selected={listAll} onPress={() => setShowAll(true)} />
          </Row>
        )}
        {found.state === 'loading' && <Txt kind="soft">{t('photos.loading')}</Txt>}
        {found.state === 'denied' && <Txt kind="soft">{t('photos.denied')}</Txt>}
        {found.state === 'ready' && all.length === 0 && <Txt kind="soft">{t('photos.noneDay')}</Txt>}
        {found.state === 'ready' && all.length > 0 && near.length === 0 && <Txt kind="soft">{t('photos.noneNearby')}</Txt>}
        {shown.length > 0 && <Txt kind="small">{t('photos.hint')}</Txt>}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(p) => p.assetId}
        numColumns={COLUMNS}
        extraData={picked}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: 120 }}
        renderItem={({ item, index }) => {
          const done = archived.has(item.assetId);
          const on = picked.has(item.assetId);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: done }}
              accessibilityLabel={`${t('photos.item', { n: index + 1 })}${done ? ` ${t('photos.saved')}` : ''}`}
              onPress={() => toggle(item)}
              style={{ width: size, height: size }}
            >
              <Image source={{ uri: item.uri }} style={[StyleSheet.absoluteFill, done && { opacity: 0.45 }]} contentFit="cover" recyclingKey={item.assetId} cachePolicy="memory" />
              {done && <Text style={styles.saved}>{t('photos.saved')}</Text>}
              {/* 이미 넣은 사진은 선택된 채로 잠가 두어 다시 고를 수 없다 */}
              <View style={[styles.check, (on || done) && styles.checkOn, done && styles.checkDone]}>{(on || done) && <Text style={styles.checkMark}>✓</Text>}</View>
            </Pressable>
          );
        }}
      />

      {picked.size > 0 && (
        <View style={styles.footer}>
          <Button label={t('photos.save', { n: picked.size })} onPress={() => void save()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  head: { padding: space.lg, gap: space.sm },
  check: {
    position: 'absolute',
    top: space.xs + 2,
    right: space.xs + 2,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.card,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.card },
  checkDone: { backgroundColor: colors.inkSoft },
  checkMark: { color: colors.card, fontWeight: '700', fontSize: fonts.size.xs },
  saved: { position: 'absolute', top: space.xs, left: space.xs, fontSize: fonts.size.xs, fontWeight: '700', color: colors.ink },
  footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.xxl },
});
