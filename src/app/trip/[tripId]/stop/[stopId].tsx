import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { pickPhoto, removePhotoFile, resolvePhoto } from '@/records/photos';
import { StopScreen } from '@/screens/StopScreen';

export default function StopRoute() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  return (
    <StopScreen
      stopId={stopId}
      pickPhoto={pickPhoto}
      resolvePhoto={resolvePhoto}
      onPhotoRemoved={removePhotoFile}
      openUrl={(url) => void Linking.openURL(url)}
    />
  );
}
