import { router } from 'expo-router';

import { NewTripScreen } from '@/screens/NewTripScreen';

export default function NewTrip() {
  return <NewTripScreen onDone={(tripId) => router.replace({ pathname: '/trip/[tripId]', params: { tripId } })} />;
}
