// 실제 기기 연결: 사진첩에서 그날 찍은 사진을 찾아 위치와 함께 돌려준다.
import { AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';

import { dayWindow, type LibraryPhoto } from './nearby';

/** 한 번에 살펴보는 최대 장수. 하루에 이보다 많이 찍었으면 앞쪽부터 본다. */
const MAX = 400;

/** 'YYYY-MM-DD' 그날 그 장소의 현지 하루에 찍은 사진들. 사진첩 접근을 거절하면 'denied'. */
export async function findDayPhotos(date: string, lng: number): Promise<LibraryPhoto[] | 'denied'> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  const { from, to } = dayWindow(date, lng);
  const assets = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .gte(AssetField.CREATION_TIME, from)
    .lt(AssetField.CREATION_TIME, to)
    .orderBy(AssetField.CREATION_TIME)
    .limit(MAX)
    .exe();
  const photos = await Promise.all(
    assets.map(async (a): Promise<LibraryPhoto | null> => {
      try {
        const [uri, location, takenAt] = await Promise.all([a.getUri(), a.getLocation(), a.getCreationTime()]);
        return { assetId: a.id, uri, takenAt: takenAt ?? from, location: location ? { lat: location.latitude, lng: location.longitude } : null };
      } catch {
        return null; // 읽을 수 없는 사진(아이클라우드에만 있는 등)은 건너뛴다
      }
    }),
  );
  return photos.filter((p): p is LibraryPhoto => p !== null);
}
