import type { Id, LatLng, Stop } from './types';

export type GeofenceRegion = { identifier: Id; latitude: number; longitude: number; radius: number };

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 감시할 장소 고르기: 아직 도착하지 않은 곳만, 현재 위치에서 가까운 순으로 최대 max 곳. */
export function pickRegions(stops: Stop[], here: LatLng | null, max = 20, radius = 150): GeofenceRegion[] {
  const pending = stops.filter((s) => s.arrivedAt === null);
  pending.sort((a, b) => (here ? distanceMeters(here, a) - distanceMeters(here, b) : a.order - b.order));
  return pending.slice(0, max).map((s) => ({ identifier: s.id, latitude: s.lat, longitude: s.lng, radius }));
}

/** 첫 도착만 기록한다. 이미 도착한 곳에 다시 들어와도 시간을 덮어쓰지 않는다. */
export function markArrived(stop: Stop, at: string, method: 'auto' | 'manual'): Stop {
  if (stop.arrivedAt !== null) return stop;
  return { ...stop, arrivedAt: at, arrivalMethod: method };
}
