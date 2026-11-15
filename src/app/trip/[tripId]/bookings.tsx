import { useLocalSearchParams } from 'expo-router';

import type { Booking } from '@/domain/types';
import { BookingsScreen } from '@/screens/BookingsScreen';

export default function BookingsRoute() {
  const { tripId, kind, edit } = useLocalSearchParams<{ tripId: string; kind?: Booking['kind']; edit?: string }>();
  return <BookingsScreen tripId={tripId} initialKind={kind} editId={edit} />;
}
