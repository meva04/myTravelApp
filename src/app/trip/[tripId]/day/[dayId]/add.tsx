import { router, Stack, useLocalSearchParams } from 'expo-router';

import { AddStopScreen } from '@/screens/AddStopScreen';

export default function AddStop() {
  const { dayId, after } = useLocalSearchParams<{ dayId: string; after?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddStopScreen dayId={dayId} afterStopId={after} onDone={() => router.back()} />
    </>
  );
}
