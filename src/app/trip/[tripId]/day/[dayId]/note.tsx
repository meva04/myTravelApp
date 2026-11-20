import { router, Stack, useLocalSearchParams } from 'expo-router';

import { AddNoteScreen } from '@/screens/AddNoteScreen';

export default function AddNote() {
  const { dayId, after } = useLocalSearchParams<{ dayId: string; after: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddNoteScreen dayId={dayId} afterStopId={after} onDone={() => router.back()} />
    </>
  );
}
