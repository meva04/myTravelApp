import { router, useLocalSearchParams } from 'expo-router';

import { AddStopScreen } from '@/screens/AddStopScreen';
import { pickSavedFiles } from '@/travel/pickSavedFile';

export default function AddStop() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  return <AddStopScreen dayId={dayId} onDone={() => router.back()} pickSavedFiles={pickSavedFiles} />;
}
