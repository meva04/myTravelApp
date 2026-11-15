import type { Stop, TravelMode } from '@/domain/types';

const GOOGLE_MODE: Record<TravelMode, string> = { walk: 'walking', transit: 'transit', drive: 'driving' };

/**
 * 구글 지도 길찾기 링크 (Maps URLs). 구글 지도 앱이 있으면 앱에서, 없으면 브라우저에서 열린다.
 * 도보·차는 바로 내비게이션을 시작하고, 대중교통은 경로 목록(노선·시간)을 보여 준다.
 */
export function directionsUrl(from: Stop, to: Stop, mode: TravelMode): string {
  const q = new URLSearchParams({
    api: '1',
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: GOOGLE_MODE[mode],
  });
  if (from.placeId) q.set('origin_place_id', from.placeId);
  if (to.placeId) q.set('destination_place_id', to.placeId);
  if (mode !== 'transit') q.set('dir_action', 'navigate');
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** 구글 지도에서 그 장소의 정보(사진·리뷰·영업시간 등)를 연다. 링크라서 요금이 들지 않는다. */
export function googleMapsUrl(stop: Pick<Stop, 'name' | 'lat' | 'lng' | 'placeId'>): string {
  const q = new URLSearchParams({ api: '1', query: stop.placeId ? stop.name : `${stop.lat},${stop.lng}` });
  if (stop.placeId) q.set('query_place_id', stop.placeId);
  return `https://www.google.com/maps/search/?${q.toString()}`;
}
