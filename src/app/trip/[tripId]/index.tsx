import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Trip } from '@/domain/types';
import { t } from '@/i18n/ko';
import { localToday } from '@/location/geofence';
import { resolvePhoto } from '@/records/photos';
import { TripHomeScreen } from '@/screens/TripHomeScreen';
import { useFocusKey } from '@/state/useFocusKey';
import { colors, fonts, space } from '@/theme/tokens';
import { Text } from '@/ui/Text';

/** '2027-03-01' ~ '2027-03-21' → '2027.03.01-03.21' (해가 바뀌면 끝에도 연도를 붙인다) */
function dateRange(start: string, end: string): string {
  const dot = (s: string) => s.replaceAll('-', '.');
  return `${dot(start)}-${start.slice(0, 4) === end.slice(0, 4) ? dot(end.slice(5)) : dot(end)}`;
}

function HeaderIcon({ name, label, onPress }: { name: 'wonsign.circle' | 'gearshape' | 'suitcase'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ paddingHorizontal: space.xs }}>
      <SymbolView name={name} size={22} tintColor={colors.ink} fallback={<Text style={{ color: colors.ink }}>{label}</Text>} />
    </Pressable>
  );
}

export default function TripHome() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  // 여행 이름 막대는 기본 머리글 대신 화면 안에서 지도 위에 띄운다 (시트를 내리면 같이 올라가 사라진다)
  const topBar = useCallback(
    (trip: Trip) => (
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={colors.ink} fallback={<Text style={{ color: colors.ink }}>‹</Text>} />
        </Pressable>
        <View style={styles.title}>
          <Text style={styles.name} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={styles.dates}>{dateRange(trip.startDate, trip.endDate)}</Text>
        </View>
        <View style={styles.icons}>
          <HeaderIcon name="suitcase" label={t('trip.bookingsLink')} onPress={() => router.push({ pathname: '/trip/[tripId]/bookings', params: { tripId } })} />
          <HeaderIcon name="wonsign.circle" label={t('trip.expenses')} onPress={() => router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } })} />
          <HeaderIcon name="gearshape" label={t('trip.settings')} onPress={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })} />
        </View>
      </View>
    ),
    [tripId],
  );
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TripHomeScreen
        tripId={tripId}
        refreshKey={useFocusKey()}
        today={localToday()}
        resolvePhoto={resolvePhoto}
        topBar={topBar}
        onAddStop={(dayId, after) => router.push({ pathname: '/trip/[tripId]/day/[dayId]/add', params: after ? { tripId, dayId, after } : { tripId, dayId } })}
        onAddTransport={(dayId, date) => router.push({ pathname: '/trip/[tripId]/day/[dayId]/transport', params: { tripId, dayId, date } })}
        onAddNote={(dayId, after) => router.push({ pathname: '/trip/[tripId]/day/[dayId]/note', params: { tripId, dayId, after } })}
        onOpenStop={(stopId) => router.push({ pathname: '/trip/[tripId]/stop/[stopId]', params: { tripId, stopId } })}
        onOpenNote={(noteId) => router.push({ pathname: '/trip/[tripId]/note/[noteId]', params: { tripId, noteId } })}
        onExpenses={() => router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } })}
        onSettings={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  title: { flex: 1, minWidth: 0 },
  name: { fontSize: fonts.size.md + 1, fontWeight: '700', color: colors.ink },
  dates: { fontSize: fonts.size.xs, color: colors.inkSoft },
  icons: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
});
