import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { pickPhoto, removePhotoFile, resolvePhoto } from '@/records/photos';
import { StopScreen } from '@/screens/StopScreen';
import type { StopPrompt } from '@/location/promptsCore';
import { useFocusKey } from '@/state/useFocusKey';

export default function StopRoute() {
  const { tripId, stopId, prompt } = useLocalSearchParams<{ tripId: string; stopId: string; prompt?: StopPrompt }>();
  return (
    <>
      {/* 머리 사진이 화면 맨 위까지 차도록 머리글을 투명하게 */}
      <Stack.Screen options={{ headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } }} />
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
    </>
  );
}
