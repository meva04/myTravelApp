import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { pickPhoto, removePhotoFile, resolvePhoto } from '@/records/photos';
import { StopScreen } from '@/screens/StopScreen';
import type { StopPrompt } from '@/location/promptsCore';
import { useFocusKey } from '@/state/useFocusKey';

export default function StopRoute() {
  const { tripId, stopId, prompt } = useLocalSearchParams<{ tripId: string; stopId: string; prompt?: StopPrompt }>();
  return (
    <StopScreen
      stopId={stopId}
      refreshKey={useFocusKey()}
      pickPhoto={pickPhoto}
      resolvePhoto={resolvePhoto}
      onPhotoRemoved={removePhotoFile}
      prompt={prompt}
      onRemoved={() => router.back()}
      onFindNearby={() => router.push({ pathname: '/trip/[tripId]/stop/[stopId]/photos', params: { tripId, stopId } })}
      openUrl={(url) => void Linking.openURL(url)}
      onEditBooking={(id) => router.push({ pathname: '/trip/[tripId]/bookings', params: { tripId, edit: id } })}
    />
  );
}
