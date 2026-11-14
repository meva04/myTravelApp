import { router, useLocalSearchParams } from 'expo-router';

import { localToday } from '@/location/geofence';
import { ExpensesScreen } from '@/screens/ExpensesScreen';
import { useFocusKey } from '@/state/useFocusKey';

export default function ExpensesRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <ExpensesScreen
      tripId={tripId}
      refreshKey={useFocusKey()}
      today={localToday()}
      onEditRates={() => router.push({ pathname: '/trip/[tripId]/settings', params: { tripId } })}
    />
  );
}
