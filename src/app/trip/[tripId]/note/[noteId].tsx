import { router, useLocalSearchParams } from 'expo-router';

import { pickPhoto, removePhotoFile, resolvePhoto } from '@/records/photos';
import { NoteScreen } from '@/screens/NoteScreen';
import { useFocusKey } from '@/state/useFocusKey';

export default function NoteRoute() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  return (
    <NoteScreen
      noteId={noteId}
      refreshKey={useFocusKey()}
      pickPhoto={pickPhoto}
      resolvePhoto={resolvePhoto}
      onPhotoRemoved={removePhotoFile}
      onRemoved={() => router.back()}
    />
  );
}
