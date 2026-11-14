import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { getLocationAccess, requestAlways } from '@/location/permissions';
import { SettingsScreen } from '@/screens/SettingsScreen';

export default function SettingsRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <SettingsScreen
      tripId={tripId}
      getAccess={getLocationAccess}
      requestAlways={requestAlways}
      openSystemSettings={() => void Linking.openSettings()}
      onDeleted={() => router.dismissTo('/')}
    />
  );
}
