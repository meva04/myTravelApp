import { router, useLocalSearchParams } from 'expo-router';

import { localToday } from '@/location/geofence';
import { TripHomeScreen } from '@/screens/TripHomeScreen';
import { useFocusKey } from '@/state/useFocusKey';

export default function TripHome() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <TripHomeScreen
      tripId={tripId}
      refreshKey={useFocusKey()}
      today={localToday()}
      onAddStop={(dayId) => router.push({ pathname: '/trip/[tripId]/day/[dayId]/add', params: { tripId, dayId } })}
      onOpenMap={(dayId) => router.push({ pathname: '/trip/[tripId]/day/[dayId]', params: { tripId, dayId } })}
      onOpenStop={(stopId) => router.push({ pathname: '/trip/[tripId]/stop/[stopId]', params: { tripId, stopId } })}
      onExpenses={() => router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } })}
      onSettings={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })}
    />
  );
}
