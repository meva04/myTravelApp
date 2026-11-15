// 장소 하나를 고르는 입력칸: 적는 대로 구글에서 찾아 아래에 보여 주고, 누르면 고른다.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookingPlace } from '@/domain/types';
import { t } from '@/i18n/ko';
import { useServices } from '@/state/ServicesContext';
import { colors, fonts, radius, space } from '@/theme/tokens';

import { Field } from './kit';

export function PlaceSearchField({ label, value, onChange }: { label: string; value?: BookingPlace; onChange: (p: BookingPlace) => void }) {
  const { places } = useServices();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BookingPlace[]>([]);
  const [open, setOpen] = useState(!value);
  const seq = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      places
        .search(query.trim())
        .then((r) => mine === seq.current && setHits(r.slice(0, 5).map((h) => ({ name: h.name, placeId: h.placeId, lat: h.lat, lng: h.lng, address: h.address }))))
        .catch(() => mine === seq.current && setHits([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [query, places]);

  if (value && !open) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={styles.chosen}>
        <Text style={styles.label}>{label}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.value} numberOfLines={1}>
            {value.name}
          </Text>
          <Text style={styles.change}>{t('common.edit')}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: space.xs }}>
      <Field placeholder={`${label} ${t('booking.searchHint')}`} value={query} onChangeText={setQuery} />
      {query.trim().length >= 2 &&
        hits.map((h) => (
          <Pressable
            key={h.placeId ?? h.name}
            accessibilityRole="button"
            onPress={() => {
              onChange(h);
              setOpen(false);
              setQuery('');
            }}
            style={styles.hit}
          >
            <Text style={styles.value}>{h.name}</Text>
            {h.address ? (
              <Text style={styles.sub} numberOfLines={1}>
                {h.address}
              </Text>
            ) : null}
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chosen: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card, padding: space.md },
  label: { fontSize: fonts.size.md, color: colors.inkSoft },
  value: { fontSize: fonts.size.md, color: colors.ink, fontWeight: '600' },
  change: { fontSize: fonts.size.xs, color: colors.route },
  hit: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  sub: { fontSize: fonts.size.xs, color: colors.inkSoft },
});
