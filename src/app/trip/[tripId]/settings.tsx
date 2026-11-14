import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { getNotificationsAllowed, requestNotificationsAllowed } from '@/location/notifications';
import { getLocationAccess, requestAlways } from '@/location/permissions';
import { SettingsScreen } from '@/screens/SettingsScreen';

export default function SettingsRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <SettingsScreen
      tripId={tripId}
      getAccess={getLocationAccess}
      requestAlways={requestAlways}
      getNotifications={getNotificationsAllowed}
      requestNotifications={requestNotificationsAllowed}
      openSystemSettings={() => void Linking.openSettings()}
      onDeleted={() => router.dismissTo('/')}
    />
  );
}
