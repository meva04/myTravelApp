import { router, useLocalSearchParams } from 'expo-router';

import { findDayPhotos } from '@/records/library';
import { importLibraryPhoto } from '@/records/photos';
import { NearbyPhotosScreen } from '@/screens/NearbyPhotosScreen';

export default function NearbyPhotosRoute() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  return <NearbyPhotosScreen stopId={stopId} findPhotos={findDayPhotos} importPhoto={importLibraryPhoto} onDone={() => router.back()} />;
}
