import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '@/i18n/ko';
import { localToday } from '@/location/geofence';
import { resolvePhoto } from '@/records/photos';
import { TripHomeScreen } from '@/screens/TripHomeScreen';
import { useFocusKey } from '@/state/useFocusKey';
import { colors, space } from '@/theme/tokens';
import { Glass } from '@/ui/Glass';
import { Text } from '@/ui/Text';

function HeaderIcon({ name, label, onPress }: { name: 'wonsign.circle' | 'gearshape' | 'suitcase'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ paddingHorizontal: space.xs }}>
      <SymbolView name={name} size={22} tintColor={colors.ink} fallback={<Text style={{ color: colors.ink }}>{label}</Text>} />
    </Pressable>
  );
}

export default function TripHome() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  // 여행 이름·날짜는 여행 목록에서만 보인다. 여기서는 뒤로 가기와 오른쪽 버튼 묶음만 지도 위에 띄운다.
  const topBar = useCallback(
    () => (
      <View style={styles.bar} pointerEvents="box-none">
        <Glass style={styles.back}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} hitSlop={8} style={styles.backTap}>
            <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={colors.ink} fallback={<Text style={{ color: colors.ink }}>‹</Text>} />
          </Pressable>
        </Glass>
        <View style={{ flex: 1 }} pointerEvents="none" />
        <Glass style={styles.icons}>
          <HeaderIcon name="suitcase" label={t('trip.bookingsLink')} onPress={() => router.push({ pathname: '/trip/[tripId]/bookings', params: { tripId } })} />
          <HeaderIcon name="wonsign.circle" label={t('trip.expenses')} onPress={() => router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } })} />
          <HeaderIcon name="gearshape" label={t('trip.settings')} onPress={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })} />
        </Glass>
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
  // 지도 위에 뜨는 반투명 유리 버튼
  back: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  backTap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icons: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, height: 40, borderRadius: 20, overflow: 'hidden' },
});
