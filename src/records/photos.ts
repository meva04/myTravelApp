// 실제 기기 연결: 사진을 고르거나 찍어 앱 저장 공간에 사본을 둔다.
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { Photo } from '@/domain/types';

import { photoMeta } from './photoMeta';

const dir = () => new Directory(Paths.document, 'photos');

/** DB 에는 파일 이름만 저장한다. 앱 업데이트 후 폴더 경로가 바뀌어도 사진을 찾을 수 있다. */
export const resolvePhoto = (name: string): string => new File(dir(), name).uri;

export async function importPhoto(asset: ImagePicker.ImagePickerAsset): Promise<Omit<Photo, 'id' | 'stopId'>> {
  const folder = dir();
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const ext = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  new File(asset.uri).copy(new File(folder, name));
  return { uri: name, ...photoMeta(asset.exif, new Date().toISOString()) };
}

export async function pickPhoto(source: 'library' | 'camera'): Promise<Omit<Photo, 'id' | 'stopId'> | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: true, quality: 0.8 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  return importPhoto(result.assets[0]);
}

export function removePhotoFile(name: string): void {
  const file = new File(dir(), name);
  if (file.exists) file.delete();
}
