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

/**
 * 모든 점이 지금 화면 안에 보이는지. 아래쪽 hiddenBottom(0~1) 만큼은 일정 시트가 가리므로 보이지 않는 것으로 친다.
 * 가장자리에 걸친 점은 핀이 잘리니 안쪽 여유(inner)를 두고 판단한다.
 */
export function allVisible(points: LatLng[], region: Region, hiddenBottom = 0, inner = 0.06): boolean {
  if (points.length === 0) return true;
  const top = region.lat + region.latDelta / 2;
  const height = region.latDelta * (1 - Math.min(Math.max(hiddenBottom, 0), 0.95));
  const bottom = top - height;
  const left = region.lng - region.lngDelta / 2;
  const right = region.lng + region.lngDelta / 2;
  const padLat = height * inner;
  const padLng = region.lngDelta * inner;
  return points.every((p) => p.lat <= top - padLat && p.lat >= bottom + padLat && p.lng >= left + padLng && p.lng <= right - padLng);
}

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

/**
 * 지도를 누른 곳에 있는 방문지. 화면 높이의 4% 안쪽이면 그 방문지를 누른 것으로 본다.
 * (마커를 직접 누르게 하면 구글 지도가 카메라를 마커로 옮겨 버리므로, 지도 탭으로 대신 판정한다.)
 */
export function nearestStopAt<T extends { id: string } & LatLng>(tap: LatLng, stops: T[], r: Region): string | null {
  const radius = r.latDelta * 0.04;
  const lngScale = Math.cos((r.lat * Math.PI) / 180);
  let best: string | null = null;
  let bestD = radius;
  for (const s of stops) {
    const d = Math.hypot(s.lat - tap.lat, (s.lng - tap.lng) * lngScale);
    if (d <= bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}
