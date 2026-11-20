import { router, Stack, useLocalSearchParams } from 'expo-router';

import { AddTransportScreen } from '@/screens/AddTransportScreen';

export default function AddTransport() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddTransportScreen tripId={tripId} date={date} onDone={() => router.back()} />
    </>
  );
}
