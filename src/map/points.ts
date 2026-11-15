import type { Id, LatLng, Leg, Stop } from '@/domain/types';

import { selectedOption } from './legRoutes';

export type Selection = { type: 'stop' | 'leg'; id: Id } | null;

/** 그날 지도에서 다 보여야 하는 점들: 방문지와 받아둔 경로. */
export function allPoints(stops: Stop[], legs: Leg[]): LatLng[] {
  const pts: LatLng[] = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  for (const l of legs) pts.push(...(selectedOption(l)?.polyline ?? []));
  return pts;
}

/** 선택한 방문지의 위치, 또는 선택한 구간 경로의 가운데. */
export function targetOf(sel: NonNullable<Selection>, stops: Stop[], legs: Leg[]): LatLng | null {
  if (sel.type === 'stop') {
    const s = stops.find((x) => x.id === sel.id);
    return s ? { lat: s.lat, lng: s.lng } : null;
  }
  const leg = legs.find((l) => l.id === sel.id);
  if (!leg) return null;
  const line = selectedOption(leg)?.polyline;
  if (line?.length) return line[Math.floor(line.length / 2)];
  const from = stops.find((s) => s.id === leg.fromStopId);
  return from ? { lat: from.lat, lng: from.lng } : null;
}

/** 지도 위 핀 하나. 같은 자리(약 30m 안)의 장소들은 한 핀에 번호를 함께 적는다 (예: 숙소에서 나가 숙소로 돌아오는 날). */
export type Pin = { lat: number; lng: number; stops: { stop: Stop; index: number }[] };

export function groupPins(stops: Stop[], meters = 30): Pin[] {
  const pins: Pin[] = [];
  stops.forEach((stop, index) => {
    const near = pins.find((p) => Math.abs(p.lat - stop.lat) * 111000 < meters && Math.abs(p.lng - stop.lng) * 111000 * Math.cos((stop.lat * Math.PI) / 180) < meters);
    if (near) near.stops.push({ stop, index });
    else pins.push({ lat: stop.lat, lng: stop.lng, stops: [{ stop, index }] });
  });
  return pins;
}

/** 핀 글자: '1', '1·5', 모두 도착했으면 '✓' */
export function pinLabel(pin: Pin): string {
  if (pin.stops.every((s) => s.stop.arrivedAt)) return '✓';
  return pin.stops.map((s) => s.index + 1).join('·');
}
