import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { pickPhoto, removePhotoFile, resolvePhoto } from '@/records/photos';
import { StopScreen } from '@/screens/StopScreen';
import { useFocusKey } from '@/state/useFocusKey';

export default function StopRoute() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  return (
    <StopScreen
      stopId={stopId}
      refreshKey={useFocusKey()}
      pickPhoto={pickPhoto}
      resolvePhoto={resolvePhoto}
      onPhotoRemoved={removePhotoFile}
      openUrl={(url) => void Linking.openURL(url)}
    />
  );
}
