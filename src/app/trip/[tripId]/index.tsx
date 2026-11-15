import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Trip } from '@/domain/types';
import { t } from '@/i18n/ko';
import { localToday } from '@/location/geofence';
import { TripHomeScreen } from '@/screens/TripHomeScreen';
import { useFocusKey } from '@/state/useFocusKey';
import { colors, fonts, space } from '@/theme/tokens';

/** '2027-03-01' ~ '2027-03-21' → '2027.03.01-03.21' (해가 바뀌면 끝에도 연도를 붙인다) */
function dateRange(start: string, end: string): string {
  const dot = (s: string) => s.replaceAll('-', '.');
  return `${dot(start)}-${start.slice(0, 4) === end.slice(0, 4) ? dot(end.slice(5)) : dot(end)}`;
}

function HeaderIcon({ name, label, onPress }: { name: 'wonsign.circle' | 'gearshape'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ paddingHorizontal: space.xs }}>
      <SymbolView name={name} size={24} tintColor={colors.ink} fallback={<Text style={{ color: colors.ink }}>{label}</Text>} />
    </Pressable>
  );
}

export default function TripHome() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const navigation = useNavigation();
  const onTrip = useCallback(
    (trip: Trip) =>
      navigation.setOptions({
        headerTitle: () => (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: fonts.size.md + 1, fontWeight: '700', color: colors.ink }}>{trip.name}</Text>
            <Text style={{ fontSize: fonts.size.xs, color: colors.inkSoft }}>{dateRange(trip.startDate, trip.endDate)}</Text>
          </View>
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <HeaderIcon name="wonsign.circle" label={t('trip.expenses')} onPress={() => router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } })} />
            <HeaderIcon name="gearshape" label={t('trip.settings')} onPress={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })} />
          </View>
        ),
      }),
    [navigation, tripId],
  );
  return (
    <TripHomeScreen
      tripId={tripId}
      refreshKey={useFocusKey()}
      today={localToday()}
      onTrip={onTrip}
      onAddStop={(dayId) => router.push({ pathname: '/trip/[tripId]/day/[dayId]/add', params: { tripId, dayId } })}
      onOpenMap={(dayId) => router.push({ pathname: '/trip/[tripId]/day/[dayId]', params: { tripId, dayId } })}
      onOpenStop={(stopId) => router.push({ pathname: '/trip/[tripId]/stop/[stopId]', params: { tripId, stopId } })}
      onOpenNote={(noteId) => router.push({ pathname: '/trip/[tripId]/note/[noteId]', params: { tripId, noteId } })}
      onExpenses={() => router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } })}
      onSettings={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })}
    />
  );
}
