// 실제 기기 연결: 사진·동영상을 고르거나 찍어 앱 저장 공간에 사본을 둔다.
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Asset } from 'expo-media-library';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { isVideo, thumbOf } from '@/domain/media';
import type { Photo } from '@/domain/types';

import type { LibraryPhoto } from './nearby';
import { photoMeta } from './photoMeta';

const dir = () => new Directory(Paths.document, 'photos');

/** DB 에는 파일 이름만 저장한다. 앱 업데이트 후 폴더 경로가 바뀌어도 사진을 찾을 수 있다. */
export const resolvePhoto = (name: string): string => new File(dir(), name).uri;

/** 원본을 앱 저장 공간에 복사하고 새 파일 이름을 돌려준다. */
async function copyIn(uri: string): Promise<string> {
  const folder = dir();
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  new File(uri).copy(new File(folder, name));
  if (isVideo(name)) await makeThumb(name);
  return name;
}

/** 동영상 첫 장면을 '<파일>.jpg' 로 만들어 둔다 (목록이 빨리 뜨도록). 실패하면 그림 없이 둔다. */
async function makeThumb(name: string): Promise<void> {
  try {
    const { uri } = await getThumbnailAsync(resolvePhoto(name), { time: 0, quality: 0.6 });
    new File(uri).move(new File(dir(), thumbOf(name)));
  } catch {
    // 썸네일 없이도 재생은 된다
  }
}

export async function importPhoto(asset: ImagePicker.ImagePickerAsset): Promise<Omit<Photo, 'id' | 'stopId'>> {
  return { uri: await copyIn(asset.uri), ...photoMeta(asset.exif, new Date().toISOString()), assetId: asset.assetId ?? null };
}

/** 사진첩에서 고른 사진을 보관한다. 원본 사진첩이 바뀌어도 남도록 사본을 둔다. */
export async function importLibraryPhoto(p: LibraryPhoto): Promise<Omit<Photo, 'id' | 'stopId'>> {
  // 목록에서는 사진첩 썸네일(ph://)을 보여 주고, 실제 파일은 고른 사진만 여기서 꺼낸다
  const file = p.uri.startsWith('ph://') ? await new Asset(p.assetId).getUri() : p.uri;
  return {
    uri: await copyIn(file),
    takenAt: new Date(p.takenAt).toISOString(),
    lat: p.location?.lat ?? null,
    lng: p.location?.lng ?? null,
    assetId: p.assetId,
  };
}

/**
 * 사진첩에서는 사진과 동영상을 여러 개 한 번에 고를 수 있다. 고른 것들을 보관하고 돌려준다 (취소하면 빈 목록).
 * have: 이미 넣은 사진첩 사진 id — 다시 골라도 두 번 넣지 않는다.
 */
export async function pickPhoto(source: 'library' | 'camera', have: string[] = []): Promise<Omit<Photo, 'id' | 'stopId'>[]> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: source === 'library' ? ['images', 'videos'] : ['images'],
    exif: true,
    // 다시 압축하지 않고 원본 형식 그대로 받아 빨리 가져온다
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    ...(source === 'library' ? { allowsMultipleSelection: true, selectionLimit: 0, orderedSelection: true } : {}),
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return [];
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  const fresh = result.assets.filter((a) => !a.assetId || !have.includes(a.assetId));
  return Promise.all(fresh.map(importPhoto));
}

export function removePhotoFile(name: string): void {
  for (const n of isVideo(name) ? [name, thumbOf(name)] : [name]) {
    const file = new File(dir(), n);
    if (file.exists) file.delete();
  }
}
