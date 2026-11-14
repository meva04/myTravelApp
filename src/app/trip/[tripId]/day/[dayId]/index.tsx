import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';

import { DayMapScreen } from '@/screens/DayMapScreen';
import { useFocusKey } from '@/state/useFocusKey';

async function getMe() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export default function DayMapRoute() {
  const { tripId, dayId } = useLocalSearchParams<{ tripId: string; dayId: string }>();
  return (
    <DayMapScreen
      dayId={dayId}
      refreshKey={useFocusKey()}
      getMe={getMe}
      onOpenStop={(stopId) => router.push({ pathname: '/trip/[tripId]/stop/[stopId]', params: { tripId, stopId } })}
      onAddStop={() => router.push({ pathname: '/trip/[tripId]/day/[dayId]/add', params: { tripId, dayId } })}
    />
  );
}
