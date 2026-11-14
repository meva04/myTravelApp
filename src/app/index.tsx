import { router } from 'expo-router';

import { TripListScreen } from '@/screens/TripListScreen';
import { useFocusKey } from '@/state/useFocusKey';

export default function Home() {
  return (
    <TripListScreen
      refreshKey={useFocusKey()}
      onNew={() => router.push('/trip/new')}
      onOpen={(tripId) => router.push({ pathname: '/trip/[tripId]', params: { tripId } })}
    />
  );
}
