import type { LatLng } from './types';

export type Region = { lat: number; lng: number; latDelta: number; lngDelta: number };

export type CameraEvent =
  | { type: 'dayOpened'; points: LatLng[] }
  | { type: 'fitAll'; points: LatLng[] }
  | { type: 'goToMe'; me: LatLng }
  | { type: 'goToTarget'; target: LatLng }
  | { type: 'userMoved'; region: Region }
  | { type: 'selected' };

const STREET = 0.01;
const MARGIN = 1.2;

/** 모든 점이 보이는 영역. 점이 하나 이상 있어야 한다. */
export function fitRegion(points: LatLng[]): Region {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    latDelta: Math.max((maxLat - minLat) * MARGIN, STREET),
    lngDelta: Math.max((maxLng - minLng) * MARGIN, STREET),
  };
}

/**
 * 지도가 스스로 움직여야 하면 새 영역을, 가만히 있어야 하면 null 을 돌려준다.
 * 이 함수가 null 이 아닌 값을 줄 때 말고는 어떤 코드도 지도를 움직이지 않는다.
 */
export function nextRegion(current: Region | null, e: CameraEvent): Region | null {
  switch (e.type) {
    case 'dayOpened':
      return current === null && e.points.length > 0 ? fitRegion(e.points) : null;
    case 'fitAll':
      return e.points.length > 0 ? fitRegion(e.points) : null;
    case 'goToMe':
      return recentre(current, e.me);
    case 'goToTarget':
      return recentre(current, e.target);
    case 'userMoved':
    case 'selected':
      return null;
  }
}

function recentre(current: Region | null, p: LatLng): Region {
  return { lat: p.lat, lng: p.lng, latDelta: current?.latDelta ?? STREET, lngDelta: current?.lngDelta ?? STREET };
}

export function isOffscreen(p: LatLng, r: Region): boolean {
  return Math.abs(p.lat - r.lat) > r.latDelta / 2 || Math.abs(p.lng - r.lng) > r.lngDelta / 2;
}

/** 화면 중심에서 대상까지의 방향 (도, 0 = 북, 시계 방향). */
export function bearingTo(r: Region, p: LatLng): number {
  const dy = p.lat - r.lat;
  const dx = (p.lng - r.lng) * Math.cos((r.lat * Math.PI) / 180);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}
