import type { LatLng } from '@/domain/types';

/** 사진첩의 사진 한 장 (가져오기 전). */
export type LibraryPhoto = {
  assetId: string;
  uri: string;
  /** 촬영 시각 (ms) */
  takenAt: number;
  location: LatLng | null;
};

/** 이 거리 안에서 찍은 사진을 그 장소의 사진으로 본다. */
export const NEARBY_METERS = 500;

/** 두 지점 사이의 거리 (m). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const HOUR = 60 * 60 * 1000;
/** 시간대를 경도로 어림하므로 (서머타임·스페인처럼 어긋나는 곳) 앞뒤로 이만큼 넉넉히 본다. */
const MARGIN_HOURS = 3;

/**
 * 'YYYY-MM-DD' 그날, 그 장소의 현지 하루를 덮는 시간 범위 (ms).
 * 여행이 끝나고 다른 시간대에서 열어도 맞도록 기기 시간대가 아니라 장소의 경도로 현지 시간대를 어림한다.
 */
export function dayWindow(date: string, lng: number): { from: number; to: number } {
  const [y, m, d] = date.split('-').map(Number);
  const midnight = Date.UTC(y, m - 1, d) - Math.round(lng / 15) * HOUR;
  return { from: midnight - MARGIN_HOURS * HOUR, to: midnight + (24 + MARGIN_HOURS) * HOUR };
}

/** 장소 근처에서 찍은 사진만, 찍은 순서대로. 위치 정보가 없는 사진은 뺀다. */
export function nearbyPhotos(photos: LibraryPhoto[], place: LatLng, meters = NEARBY_METERS): LibraryPhoto[] {
  return photos.filter((p) => p.location && distanceMeters(p.location, place) <= meters).sort((a, b) => a.takenAt - b.takenAt);
}
